/**
 * Pure money helpers used by the checkout preview and by tests.
 *
 * The database checkout RPC remains the final authority. These functions make
 * the preview use the same rules instead of trusting browser-supplied totals.
 */

export type CouponForCalculation = {
  type: string;
  value: number;
  max_discount_amount?: number | null;
  min_order_amount?: number | null;
};

export function roundMoney(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function computeCouponDiscount(
  coupon: CouponForCalculation | null | undefined,
  subtotal: unknown
): number {
  const safeSubtotal = Math.max(0, roundMoney(subtotal));
  if (!coupon) return 0;

  const value = Number(coupon.value);
  if (!Number.isFinite(value) || value <= 0) return 0;

  let discount: number;
  if (coupon.type === "percentage") {
    discount = roundMoney((safeSubtotal * value) / 100);
    const hasCap =
      coupon.max_discount_amount !== null && coupon.max_discount_amount !== undefined;
    const cap = hasCap ? Number(coupon.max_discount_amount) : Number.NaN;
    if (Number.isFinite(cap) && cap >= 0) {
      discount = Math.min(discount, roundMoney(cap));
    }
  } else {
    discount = roundMoney(value);
  }

  return Math.max(0, Math.min(discount, safeSubtotal));
}

export function computeOrderTotal(input: {
  subtotal: unknown;
  tax?: unknown;
  shipping?: unknown;
  giftWrap?: unknown;
  discount?: unknown;
}): number {
  const subtotal = Math.max(0, roundMoney(input.subtotal));
  const tax = Math.max(0, roundMoney(input.tax));
  const shipping = Math.max(0, roundMoney(input.shipping));
  const giftWrap = Math.max(0, roundMoney(input.giftWrap));
  const discount = Math.max(0, roundMoney(input.discount));

  return Math.max(0, roundMoney(subtotal + tax + shipping + giftWrap - discount));
}

export type ShippingOptionForSelection = {
  method_id: string;
  fee: number | string;
};

export function findShippingOption<T extends ShippingOptionForSelection>(
  options: T[] | null | undefined,
  methodId: string | null | undefined
): T | null {
  if (!methodId || !Array.isArray(options)) return null;
  return options.find((option) => option.method_id === methodId) ?? null;
}

export function selectedShippingFee(
  options: ShippingOptionForSelection[] | null | undefined,
  methodId: string | null | undefined
): number {
  const option = findShippingOption(options, methodId);
  return option ? Math.max(0, roundMoney(option.fee)) : 0;
}

/**
 * A coupon is only valid while every rule is satisfied. The database repeats
 * these checks, so a stale client cannot force an expired or exhausted coupon.
 */
export function couponValidationError(
  coupon: {
    is_active?: boolean | null;
    starts_at?: string | null;
    expires_at?: string | null;
    max_uses?: number | null;
    used_count?: number | null;
    max_uses_per_user?: number | null;
    min_order_amount?: number | null;
  } | null | undefined,
  subtotal: unknown,
  userUseCount = 0,
  now: Date = new Date()
): string | null {
  if (!coupon) return "Invalid or inactive coupon code";
  if (coupon.is_active === false) return "Invalid or inactive coupon code";

  const startsAt = coupon.starts_at ? new Date(coupon.starts_at) : null;
  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt > now) {
    return "This coupon is not active yet";
  }

  const expiresAt = coupon.expires_at ? new Date(coupon.expires_at) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt < now) {
    return "This coupon has expired";
  }

  const hasMaxUses = coupon.max_uses !== null && coupon.max_uses !== undefined;
  const maxUses = hasMaxUses ? Number(coupon.max_uses) : Number.NaN;
  const usedCount = Number(coupon.used_count ?? 0);
  if (Number.isFinite(maxUses) && maxUses >= 0 && usedCount >= maxUses) {
    return "This coupon has reached its usage limit";
  }

  const hasMaxPerUser =
    coupon.max_uses_per_user !== null && coupon.max_uses_per_user !== undefined;
  const maxPerUser = hasMaxPerUser ? Number(coupon.max_uses_per_user) : Number.NaN;
  if (Number.isFinite(maxPerUser) && maxPerUser >= 0 && userUseCount >= maxPerUser) {
    return "You have already used this coupon the maximum number of times";
  }

  const hasMinOrder =
    coupon.min_order_amount !== null && coupon.min_order_amount !== undefined;
  const minOrder = hasMinOrder ? Number(coupon.min_order_amount) : Number.NaN;
  if (
    Number.isFinite(minOrder) &&
    minOrder > 0 &&
    roundMoney(subtotal) < roundMoney(minOrder)
  ) {
    return `This cart does not meet the minimum order amount of ${roundMoney(minOrder)} for this coupon`;
  }

  return null;
}
