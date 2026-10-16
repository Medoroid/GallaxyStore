"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCw, ShieldCheck, Smartphone, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/app/lib/auth-context";
import { apiErrorMessage, storageErrorMessage } from "@/app/lib/api-error-message";
import type { PaymentAttempt } from "@/app/lib/payment-status";

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MAX_LABEL = "5 MB";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
];

export const RECEIPT_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"];

/** Pure validation — shared by the form and the unit tests. */
export function validateReceiptFile(file: File | null | undefined): string | null {
  if (!file) return "Choose a receipt image first.";

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "";
  const typeLooksValid =
    ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase()) ||
    (!file.type && ALLOWED_EXTENSIONS.includes(extension));

  if (!typeLooksValid) {
    return "That file type is not supported. Use a JPG, PNG or WEBP image.";
  }
  if (file.size === 0) {
    return "That file is empty. Choose another receipt image.";
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return `Receipt image is ${sizeMb} MB — the maximum is ${RECEIPT_MAX_LABEL}.`;
  }
  return null;
}

export function validatePayerPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the phone number you transferred from.";
  if (trimmed.replace(/\D/g, "").length < 8) {
    return "That phone number looks too short. Enter the full number you transferred from.";
  }
  return null;
}

export function validateTransferReference(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the transfer reference or transaction ID.";
  if (trimmed.length < 4) {
    return "That reference looks too short. Copy it from your transfer receipt.";
  }
  return null;
}

type Props = {
  orderId: string;
  onSubmitted?: (payment: PaymentAttempt | null) => void;
  submitLabel?: string;
  /** Keeps label/input ids unique when the form is rendered twice. */
  idPrefix?: string;
  className?: string;
};

type FieldErrors = { phone?: string; reference?: string; file?: string };

export function ReceiptUploader({
  orderId,
  onSubmitted,
  submitLabel = "Submit receipt",
  idPrefix,
  className = "",
}: Props) {
  const { user, getToken } = useAuth();
  const reactId = useId();
  const prefix = idPrefix ?? reactId;

  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const file = preview?.file ?? null;

  // Belt and braces: the disabled button is the visible guard, this is the real one.
  const inFlight = useRef(false);

  // Revokes the previous blob URL when the selection changes or we unmount.
  useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview?.url]);

  const pickFile = (next: File | null) => {
    setError(null);
    if (!next) {
      setPreview(null);
      setFieldErrors((prev) => ({ ...prev, file: undefined }));
      return;
    }
    setPreview({ file: next, url: URL.createObjectURL(next) });
    setFieldErrors((prev) => ({ ...prev, file: validateReceiptFile(next) ?? undefined }));
  };

  const handleSubmit = async () => {
    if (inFlight.current) return;

    const nextErrors: FieldErrors = {
      phone: validatePayerPhone(phone) ?? undefined,
      reference: validateTransferReference(reference) ?? undefined,
      file: validateReceiptFile(file) ?? undefined,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.phone || nextErrors.reference || nextErrors.file) {
      setError(null);
      return;
    }

    const selected = file!;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      if (!user) {
        setError("Please sign in again to submit your receipt.");
        return;
      }

      const token = await getToken();
      if (!token) {
        setError("Your session has expired. Please sign in again.");
        return;
      }

      const safeName = selected.name.replace(/[^\w.-]+/g, "_") || "receipt.jpg";
      const path = `${user.id}/${orderId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-receipts")
        .upload(path, selected, { contentType: selected.type, upsert: true });

      if (uploadError) {
        setError(storageErrorMessage(uploadError.message));
        return;
      }

      const res = await fetch("/api/payments/vodafone-cash", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          order_id: orderId,
          payer_phone: phone.trim(),
          transfer_reference: reference.trim(),
          receipt_path: path,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(
          apiErrorMessage(res.status, data, "Failed to submit the receipt. Please try again.")
        );
        return;
      }

      setDone(true);
      setFieldErrors({});
      onSubmitted?.(data.payment ?? null);
    } catch (networkError) {
      const message = networkError instanceof Error ? networkError.message : "";
      setError(
        /fetch|network/i.test(message)
          ? "Network error. Check your connection and try again."
          : "Failed to submit the receipt. Please try again."
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div
        className={`glass rounded-xl p-4 border border-emerald-500/30 bg-emerald-950/30 ${className}`}
        role="status"
        aria-live="polite"
      >
        <p className="font-semibold text-emerald-300">Receipt submitted</p>
        <p className="text-sm text-muted-foreground mt-1">
          Awaiting payment verification — we&apos;ll update this order once the transfer is checked.
        </p>
      </div>
    );
  }

  const disabled = submitting;

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label htmlFor={`${prefix}-phone`} className="text-sm font-semibold mb-1 block">
          Phone number you transferred from
        </label>
        <input
          id={`${prefix}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setFieldErrors((prev) => ({ ...prev, phone: undefined }));
          }}
          placeholder="01XXXXXXXXX"
          aria-invalid={Boolean(fieldErrors.phone)}
          aria-describedby={fieldErrors.phone ? `${prefix}-phone-error` : undefined}
          className="w-full glass rounded-xl p-3 outline-none focus:pink-glow text-sm"
        />
        {fieldErrors.phone && (
          <p id={`${prefix}-phone-error`} role="alert" className="text-xs text-red-400 mt-1">
            {fieldErrors.phone}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-reference`} className="text-sm font-semibold mb-1 block">
          Transfer reference / transaction ID
        </label>
        <input
          id={`${prefix}-reference`}
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            setFieldErrors((prev) => ({ ...prev, reference: undefined }));
          }}
          placeholder="e.g. 1234567890"
          aria-invalid={Boolean(fieldErrors.reference)}
          aria-describedby={fieldErrors.reference ? `${prefix}-reference-error` : undefined}
          className="w-full glass rounded-xl p-3 outline-none focus:pink-glow text-sm"
        />
        {fieldErrors.reference && (
          <p id={`${prefix}-reference-error`} role="alert" className="text-xs text-red-400 mt-1">
            {fieldErrors.reference}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-file`} className="text-sm font-semibold mb-1 block">
          Receipt image
        </label>
        <div className="flex items-start gap-3">
          <label
            htmlFor={`${prefix}-file`}
            className="shrink-0 w-20 h-20 rounded-xl glass border border-dashed border-white/20 grid place-items-center cursor-pointer hover:bg-white/5 transition-colors overflow-hidden"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob preview, no optimization needed
              <img
                src={preview.url}
                alt="Receipt preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            )}
          </label>

          <div className="flex-1 min-w-0">
            <input
              id={`${prefix}-file`}
              type="file"
              accept={RECEIPT_ACCEPT}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              aria-invalid={Boolean(fieldErrors.file)}
              aria-describedby={`${prefix}-file-hint${
                fieldErrors.file ? ` ${prefix}-file-error` : ""
              }`}
              className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white text-muted-foreground"
            />
            <p id={`${prefix}-file-hint`} className="text-xs text-muted-foreground mt-1">
              JPG, PNG, WEBP or HEIC — up to {RECEIPT_MAX_LABEL}.
            </p>
            {fieldErrors.file && (
              <p id={`${prefix}-file-error`} role="alert" className="text-xs text-red-400 mt-1">
                {fieldErrors.file}
              </p>
            )}
            {file && !fieldErrors.file && (
              <button
                type="button"
                onClick={() => pickFile(null)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Remove image
              </button>
            )}
          </div>
        </div>
      </div>

      <div aria-live="polite">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl text-sm text-red-400 bg-red-950/40 border border-red-500/30 flex items-start justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled}
              className="inline-flex items-center gap-1 text-xs font-semibold shrink-0 underline underline-offset-2 disabled:opacity-50"
            >
              <RotateCw className="h-3 w-3" aria-hidden="true" />
              Try again
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled}
        aria-busy={disabled}
        className="w-full h-11 rounded-xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100"
      >
        {disabled ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Submitting receipt…
          </>
        ) : (
          <>
            <Smartphone className="h-5 w-5" aria-hidden="true" />
            {submitLabel}
          </>
        )}
      </button>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
        <span>
          Your receipt is stored privately and only shared with our payment team to verify this
          transfer. Submitting it does not mean the payment is complete — we&apos;ll mark the order
          as paid after verification.
        </span>
      </p>
    </div>
  );
}
