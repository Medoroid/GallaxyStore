/**
 * Shared payment status model for the storefront + admin UI.
 *
 * The backend is authoritative for every status change. Everything here is a
 * pure derivation from API responses — nothing in this file mutates state.
 */

/** Exact provider values used by the payments table / API contract. */
export const PAYMENT_PROVIDERS = [
  "cod",
  "vodafone_cash",
  "stripe",
  "paymob",
  "wallet",
] as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

/** Legacy spellings accepted from older builds. Compatibility layer only —
 *  new code must send the exact `PAYMENT_PROVIDERS` value. */
const PROVIDER_ALIASES: Record<string, PaymentProvider> = {
  card: "stripe",
  credit_card: "stripe",
  vodafone: "vodafone_cash",
  vodafonecash: "vodafone_cash",
  voda_cash: "vodafone_cash",
};

export function toPaymentProvider(value: unknown): PaymentProvider | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((PAYMENT_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as PaymentProvider;
  }
  return PROVIDER_ALIASES[normalized] ?? null;
}

export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return toPaymentProvider(value) !== null;
}

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  cod: "Cash on Delivery",
  vodafone_cash: "Vodafone Cash",
  stripe: "Credit/Debit Card (Stripe)",
  paymob: "Paymob",
  wallet: "Wallet",
};

export function paymentProviderLabel(value: unknown): string {
  const provider = toPaymentProvider(value);
  if (provider) return PAYMENT_PROVIDER_LABELS[provider];
  return typeof value === "string" && value.trim() ? value : "Not recorded";
}

/* ------------------------------------------------------------------ *
 * Vodafone Cash wallet number
 * ------------------------------------------------------------------ */

/** The placeholder shipped in `.env.local` — never tell a customer to pay it. */
export const PLACEHOLDER_WALLET_NUMBER = "01XXXXXXXXX";

const MOBILE_PATTERN = /^01[0-9]{9}$/;

export type WalletNumber = {
  /** Real digits when configured, otherwise null. */
  number: string | null;
  configured: boolean;
};

export function resolveWalletNumber(
  raw: string | null | undefined = process.env.NEXT_PUBLIC_VODAFONE_CASH_NUMBER
): WalletNumber {
  const value = (raw ?? "").trim();
  if (!value || value === PLACEHOLDER_WALLET_NUMBER) {
    return { number: null, configured: false };
  }
  if (!MOBILE_PATTERN.test(value)) {
    return { number: null, configured: false };
  }
  return { number: value, configured: true };
}

/* ------------------------------------------------------------------ *
 * Payment attempts
 * ------------------------------------------------------------------ */

export type ReceiptMeta = {
  payer_phone?: string;
  receipt_path?: string;
  uploaded_at?: string;
  verified_at?: string;
  verify_note?: string | null;
  rejected?: boolean;
};

export type PaymentAttempt = {
  id?: string;
  provider: string;
  status: string;
  amount?: number | null;
  currency?: string | null;
  provider_payment_id?: string | null;
  raw_response?: ReceiptMeta | null;
  receipt_url?: string | null;
  created_at?: string;
};

/**
 * Pick the attempt that represents the order: a settled one wins over the
 * newest retry, otherwise the newest attempt.
 */
export function pickPayment(
  payments: PaymentAttempt[] | null | undefined,
  preferredProvider?: PaymentProvider
): PaymentAttempt | null {
  if (!payments || payments.length === 0) return null;
  const scoped = preferredProvider
    ? payments.filter((p) => toPaymentProvider(p.provider) === preferredProvider)
    : payments;
  const pool = scoped.length > 0 ? scoped : payments;
  return (
    pool.find((p) => p.status === "succeeded") ??
    [...pool].sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    )[0] ??
    null
  );
}

/** A `failed` row only means "rejected" when an admin said so. */
export function isExplicitlyRejected(payment: PaymentAttempt | null | undefined): boolean {
  if (!payment) return false;
  return payment.status === "failed" && payment.raw_response?.rejected === true;
}

export function getRejectionReason(payment: PaymentAttempt | null | undefined): string | null {
  if (!isExplicitlyRejected(payment)) return null;
  const note = payment?.raw_response?.verify_note;
  return typeof note === "string" && note.trim() ? note.trim() : null;
}

/* ------------------------------------------------------------------ *
 * Vodafone Cash verification state
 * ------------------------------------------------------------------ */

export type VodafoneState =
  /** Nothing to verify yet — the order is waiting for its first receipt. */
  | "receipt_required"
  /** A receipt exists and the team has not decided yet. */
  | "awaiting_verification"
  /** The admin confirmed the transfer. */
  | "confirmed"
  /** The admin explicitly rejected the transfer. */
  | "rejected"
  /** `failed` without an admin rejection (e.g. reconciliation timeout). */
  | "timed_out"
  /** Not a Vodafone Cash order. */
  | "not_applicable";

export function getVodafoneState(input: {
  orderStatus?: string | null;
  payment?: PaymentAttempt | null;
  /** See `rememberVodafoneOrder` — client hint only, never authoritative. */
  hintedVodafone?: boolean;
}): VodafoneState {
  const payment = input.payment ?? null;
  const provider = payment ? toPaymentProvider(payment.provider) : null;

  if (!payment) {
    // No attempt recorded at all while the order still awaits payment.
    return input.orderStatus === "pending" && input.hintedVodafone
      ? "receipt_required"
      : "not_applicable";
  }
  if (provider !== "vodafone_cash") return "not_applicable";

  switch (payment.status) {
    case "pending":
    case "processing":
      return "awaiting_verification";
    case "succeeded":
      return "confirmed";
    case "failed":
      return isExplicitlyRejected(payment) ? "rejected" : "timed_out";
    default:
      return "not_applicable";
  }
}

/** Can the customer upload (or re-upload) a receipt for this order? */
export function canSubmitReceipt(input: {
  orderStatus?: string | null;
  payments?: PaymentAttempt[] | null;
  hintedVodafone?: boolean;
}): boolean {
  if (input.orderStatus !== "pending") return false;

  const payments = input.payments ?? [];
  if (payments.some((p) => toPaymentProvider(p.provider) === "cod")) return false;

  const vodafone = pickPayment(payments, "vodafone_cash");
  if (!vodafone) return Boolean(input.hintedVodafone);

  const state = getVodafoneState({ orderStatus: input.orderStatus, payment: vodafone });
  return state === "rejected" || state === "timed_out";
}

/* ------------------------------------------------------------------ *
 * Client-side "this order is a Vodafone order" hint
 * ------------------------------------------------------------------
 * GAP: `orders` has no `payment_method` column, so before the first receipt
 * is submitted the API cannot tell a Vodafone order from a card order (card
 * payments only write a `payments` row once Stripe's webhook fires).
 *
 * Until the backend owns that field, checkout stores a *non-authoritative*
 * local hint so "I'll submit the receipt later" can still offer the uploader
 * on /orders/{id}. Nothing here decides success, amount or ownership — the
 * backend validates every submission regardless of the hint.
 */

const VODAFONE_HINT_KEY = "galaxy:vodafone-hint:";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function rememberVodafoneOrder(orderId: string): void {
  if (!orderId) return;
  try {
    storage()?.setItem(VODAFONE_HINT_KEY + orderId, String(Date.now()));
  } catch {
    /* storage disabled — the hint is optional */
  }
}

export function clearVodafoneHint(orderId: string): void {
  if (!orderId) return;
  try {
    storage()?.removeItem(VODAFONE_HINT_KEY + orderId);
  } catch {
    /* ignore */
  }
}

export function isVodafoneHintedOrder(orderId: string): boolean {
  if (!orderId) return false;
  try {
    return Boolean(storage()?.getItem(VODAFONE_HINT_KEY + orderId));
  } catch {
    return false;
  }
}

export type Tone = "amber" | "emerald" | "red" | "slate";

export const VODAFONE_STATE_COPY: Record<
  VodafoneState,
  { badge: string; tone: Tone; title: string; body: string; adminLabel: string }
> = {
  receipt_required: {
    badge: "Receipt required",
    tone: "amber",
    title: "Upload your transfer receipt",
    body: "Transfer the amount due, then upload the receipt here for verification.",
    adminLabel: "No receipt yet",
  },
  awaiting_verification: {
    badge: "Awaiting verification",
    tone: "amber",
    title: "Your payment receipt is being reviewed.",
    body: "We received your transfer receipt. The order moves to Paid once our team confirms it.",
    adminLabel: "Awaiting verification",
  },
  confirmed: {
    badge: "Payment confirmed",
    tone: "emerald",
    title: "Payment confirmed.",
    body: "Your transfer was verified. Nothing else is needed from you.",
    adminLabel: "Verified",
  },
  rejected: {
    badge: "Payment rejected",
    tone: "red",
    title: "Payment rejected",
    body: "We could not match this transfer. You can upload a new receipt below.",
    adminLabel: "Rejected",
  },
  timed_out: {
    badge: "Awaiting verification",
    tone: "amber",
    title: "We could not confirm this transfer automatically.",
    body: "Your receipt still needs a manual check. Upload it again if something changed.",
    adminLabel: "Awaiting verification",
  },
  not_applicable: {
    badge: "",
    tone: "slate",
    title: "",
    body: "",
    adminLabel: "",
  },
};

export const TONE_CLASS: Record<Tone, { badge: string; panel: string; text: string }> = {
  amber: {
    badge: "text-amber-300 bg-amber-950/40 border-amber-500/40",
    panel: "border-amber-500/30 bg-amber-950/30",
    text: "text-amber-300",
  },
  emerald: {
    badge: "text-emerald-300 bg-emerald-950/40 border-emerald-500/40",
    panel: "border-emerald-500/30 bg-emerald-950/30",
    text: "text-emerald-300",
  },
  red: {
    badge: "text-red-300 bg-red-950/40 border-red-500/40",
    panel: "border-red-500/30 bg-red-950/30",
    text: "text-red-300",
  },
  slate: {
    badge: "text-slate-300 bg-slate-950/50 border-white/10",
    panel: "border-white/10 bg-white/[0.03]",
    text: "text-muted-foreground",
  },
};

/* ------------------------------------------------------------------ *
 * Shipping / delivery
 * ------------------------------------------------------------------ */

export type ShippingMethod = {
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
  carrier?: string | null;
  min_delivery_days?: number | null;
  max_delivery_days?: number | null;
};

export function formatDeliveryEstimate(
  min?: number | null,
  max?: number | null
): string | null {
  if (min == null || max == null) return null;
  if (min === max) return `${min} day${min === 1 ? "" : "s"}`;
  return `${min}–${max} days`;
}

export function describeShippingMethod(method: ShippingMethod | null | undefined): {
  label: string;
  detail: string;
} {
  if (!method || !method.type) {
    return { label: "Delivery not set", detail: "" };
  }
  const express = method.type === "express";
  return {
    label: express ? "Express delivery" : "Standard delivery",
    detail: formatDeliveryEstimate(method.min_delivery_days, method.max_delivery_days) ?? "",
  };
}
