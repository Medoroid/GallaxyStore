import {
  computeCouponDiscount,
  computeOrderTotal,
  couponValidationError,
  findShippingOption,
  roundMoney,
  selectedShippingFee,
} from "@/lib/checkout-calculations";

describe("checkout money calculations", () => {
  test("rounds to two decimal places without negative values", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney("bad")).toBe(0);
    expect(roundMoney(-1)).toBe(-1);
  });

  test("a percentage coupon without a max cap is not capped at zero", () => {
    // Regression: Number(null) is 0, which previously zeroed every uncapped
    // percentage coupon.
    expect(
      computeCouponDiscount(
        { type: "percentage", value: 10, max_discount_amount: null },
        100
      )
    ).toBe(10);
  });

  test("a percentage coupon respects its maximum discount", () => {
    expect(
      computeCouponDiscount(
        { type: "percentage", value: 25, max_discount_amount: 15 },
        100
      )
    ).toBe(15);
  });

  test("fixed and percentage discounts never exceed the subtotal", () => {
    expect(computeCouponDiscount({ type: "fixed", value: 500 }, 100)).toBe(100);
    expect(computeCouponDiscount({ type: "percentage", value: 200 }, 100)).toBe(100);
  });

  test("total adds tax, shipping and gift wrap then subtracts discount", () => {
    expect(
      computeOrderTotal({
        subtotal: 100,
        tax: 5,
        shipping: 25,
        giftWrap: 4.99,
        discount: 10,
      })
    ).toBe(124.99);
    expect(
      computeOrderTotal({ subtotal: 10, shipping: 5, discount: 100 })
    ).toBe(0);
  });

  test("shipping selection only uses a known method id", () => {
    const options = [
      { method_id: "a", fee: "25.5" },
      { method_id: "b", fee: 0 },
    ];
    expect(findShippingOption(options, "a")).toMatchObject({ fee: "25.5" });
    expect(findShippingOption(options, "missing")).toBeNull();
    expect(selectedShippingFee(options, "a")).toBe(25.5);
    expect(selectedShippingFee(options, "missing")).toBe(0);
  });

  test("an uncapped coupon with no usage limits is valid", () => {
    expect(
      couponValidationError(
        {
          is_active: true,
          max_uses: null,
          used_count: 0,
          max_uses_per_user: null,
          min_order_amount: null,
          starts_at: null,
          expires_at: null,
        },
        100,
        0
      )
    ).toBeNull();
  });

  test("coupon rules reject inactive, future, expired, exhausted and too-small carts", () => {
    const now = new Date("2026-10-24T12:00:00.000Z");

    expect(couponValidationError({ is_active: false }, 100, 0, now)).toMatch(/inactive/i);
    expect(
      couponValidationError(
        { starts_at: "2026-10-25T00:00:00.000Z" },
        100,
        0,
        now
      )
    ).toMatch(/not active yet/i);
    expect(
      couponValidationError(
        { expires_at: "2026-10-23T00:00:00.000Z" },
        100,
        0,
        now
      )
    ).toMatch(/expired/i);
    expect(
      couponValidationError({ max_uses: 2, used_count: 2 }, 100, 0, now)
    ).toMatch(/usage limit/i);
    expect(
      couponValidationError({ max_uses_per_user: 1 }, 100, 1, now)
    ).toMatch(/maximum number/i);
    expect(
      couponValidationError({ min_order_amount: 200 }, 100, 0, now)
    ).toMatch(/minimum order/i);
  });
});
