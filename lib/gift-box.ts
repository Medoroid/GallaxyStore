/**
 * Pure Gift Box domain logic — shared by the admin/public API routes and the
 * checkout preview so every layer applies identical rules. Everything here is
 * side-effect free and unit-tested (`__tests__/gift-box-logic.test.ts`).
 *
 * Source of truth for enforcement remains the database (constraints, guard
 * triggers and the atomic `checkout()`); these helpers provide fast-fail
 * validation, consistent money math and shared issue shapes.
 */

export const MAX_GIFT_BOX_ITEMS = 50;
export const MIN_COMPONENT_QUANTITY = 1;
export const MAX_COMPONENT_QUANTITY = 1000;
export const MAX_COMPONENT_NOTE_LENGTH = 500;
/** Normalised stand-in used when variant_id is null (mirrors the SQL unique index). */
export const NULL_VARIANT_KEY = "00000000-0000-0000-0000-000000000000";

export interface GiftBoxComponentInput {
  product_id?: string | null;
  variant_id?: string | null;
  quantity?: number | string | null;
  note?: string | null;
  display_order?: number | string | null;
}

export interface GiftBoxContentLine {
  product_id: string;
  variant_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  currency?: string | null;
  is_active?: boolean;
}

export interface ExistingGiftBoxItem {
  product_id: string;
  variant_id?: string | null;
}

export interface CompositionValidation {
  ok: boolean;
  message?: string;
}

export interface ContentsValueResult {
  /** Sum of component values, or null when currencies are not comparable. */
  contents_value: number | null;
  /** Positive difference contents_value − box price (0 when none). */
  savings: number | null;
  /** False when the numbers must not be displayed (mixed/unknown currency). */
  comparable: boolean;
}

export interface StockIssue {
  cart_item_id: string;
  product_name: string;
  requested: number;
  available: number;
}

function asQuantity(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) return null;
  return num;
}

/** Stable dedupe key for "same product/variant in one box". */
export function componentKey(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId || NULL_VARIANT_KEY}`;
}

/**
 * Fast-fail validation for composition mutations (add/update item, create box
 * rules). Mirrors the DB guards: no self-reference, no nesting, no duplicate
 * product/variant pair, bounded quantity/order/note and item-count cap.
 */
export function validateCompositionInput(
  boxProductId: string,
  input: GiftBoxComponentInput,
  existingItems: ExistingGiftBoxItem[],
  options: {
    /** Product ids that are themselves gift boxes (nesting guard). */
    boxProductIds?: Set<string>;
    /** Item id being edited (excluded from duplicate/conflict checks). */
    excludeItemId?: string | null;
    isBoxCreation?: boolean;
  } = {}
): CompositionValidation {
  const { boxProductIds, excludeItemId, isBoxCreation } = options;

  if (isBoxCreation) {
    if (!boxProductId) {
      return { ok: false, message: "A product id is required" };
    }
    if (existingItems.some((item) => item.product_id === boxProductId)) {
      return {
        ok: false,
        message: "This product is already a component of another gift box and cannot become a gift box itself",
      };
    }
    return { ok: true };
  }

  const productId = String(input.product_id ?? "").trim();
  if (!productId) return { ok: false, message: "product_id is required" };
  if (productId === boxProductId) {
    return { ok: false, message: "A gift box cannot contain itself" };
  }
  if (boxProductIds?.has(productId)) {
    return { ok: false, message: "Gift boxes cannot be nested inside other gift boxes" };
  }

  const quantity = asQuantity(input.quantity ?? 1);
  if (quantity === null || !Number.isInteger(quantity)) {
    return { ok: false, message: "Quantity must be a whole number" };
  }
  if (quantity < MIN_COMPONENT_QUANTITY || quantity > MAX_COMPONENT_QUANTITY) {
    return {
      ok: false,
      message: `Quantity must be between ${MIN_COMPONENT_QUANTITY} and ${MAX_COMPONENT_QUANTITY}`,
    };
  }

  if (input.display_order !== undefined && input.display_order !== null && input.display_order !== "") {
    const order = asQuantity(input.display_order);
    if (order === null || !Number.isInteger(order) || order < 0) {
      return { ok: false, message: "display_order must be a non-negative integer" };
    }
  }

  if (input.note != null && String(input.note).length > MAX_COMPONENT_NOTE_LENGTH) {
    return {
      ok: false,
      message: `Note must be at most ${MAX_COMPONENT_NOTE_LENGTH} characters`,
    };
  }

  const remaining = excludeItemId ? Math.max(existingItems.length - 1, 0) : existingItems.length;
  if (!excludeItemId && remaining >= MAX_GIFT_BOX_ITEMS) {
    return { ok: false, message: `A gift box can contain at most ${MAX_GIFT_BOX_ITEMS} items` };
  }

  const key = componentKey(productId, input.variant_id);
  if (existingItems.some((item) => componentKey(item.product_id, item.variant_id) === key)) {
    return { ok: false, message: "This product and variant are already in the gift box" };
  }

  return { ok: true };
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Contents value + savings. Returns nulls when any currency differs from the
 * box currency — fabricated savings must never be displayed.
 */
export function computeContentsValue(
  lines: GiftBoxContentLine[],
  boxPrice: number,
  boxCurrency?: string | null
): ContentsValueResult {
  const active = lines.filter((line) => line.is_active !== false);
  if (active.length === 0 || !Number.isFinite(boxPrice)) {
    return { contents_value: null, savings: null, comparable: false };
  }

  const currency = (boxCurrency ?? "").trim().toUpperCase();
  if (!currency) {
    return { contents_value: null, savings: null, comparable: false };
  }

  let total = 0;
  for (const line of active) {
    const lineCurrency = (line.currency ?? "").trim().toUpperCase();
    if (lineCurrency && lineCurrency !== currency) {
      return { contents_value: null, savings: null, comparable: false };
    }
    const price = Number(line.unit_price);
    const qty = Number(line.quantity);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || price < 0 || qty <= 0) {
      return { contents_value: null, savings: null, comparable: false };
    }
    total += price * qty;
  }

  const contentsValue = roundMoney(total);
  return {
    contents_value: contentsValue,
    savings: Math.max(roundMoney(contentsValue - boxPrice), 0),
    comparable: true,
  };
}

export interface ComponentRequirement {
  variant_id: string;
  required_qty: number;
}

/**
 * Aggregate component stock requirement for a cart/box quantity:
 * required per component = component quantity × number of boxes.
 * Components without a variant are skipped here (checkout treats them as
 * unavailable and blocks the purchase before any decrement).
 */
export function requiredComponentStock(
  lines: GiftBoxContentLine[],
  boxQuantity: number
): ComponentRequirement[] {
  const byVariant = new Map<string, number>();
  if (!Number.isFinite(boxQuantity) || boxQuantity <= 0) return [];

  for (const line of lines) {
    if (line.is_active === false || !line.variant_id) continue;
    const current = byVariant.get(line.variant_id) ?? 0;
    byVariant.set(line.variant_id, current + Number(line.quantity) * boxQuantity);
  }

  return [...byVariant.entries()].map(([variant_id, required_qty]) => ({
    variant_id,
    required_qty,
  }));
}

export interface PreviewCartLine {
  cart_item_id: string;
  variant_id: string;
  product_name: string;
  quantity: number;
}

export interface ComponentStockLookup {
  /** Component variant id → available stock (stock − reserved, preview semantics). */
  available: Map<string, number>;
  /** Component variant id → display name of the component product. */
  names: Map<string, string>;
  /** Box product id → its active component lines (variant + qty per box). */
  componentsByBoxProduct: Map<string, GiftBoxContentLine[]>;
  /** Cart line variant id → owning product id. */
  productByVariant: Map<string, string>;
}

/**
 * Preview-time component issues (same shape as the existing line-level
 * `stock_issues` so the checkout UI renders them unchanged). Advisory only —
 * `checkout()` re-validates atomically at purchase time.
 */
export function componentStockIssues(
  cartLines: PreviewCartLine[],
  lookup: ComponentStockLookup
): StockIssue[] {
  const requiredByVariant = new Map<
    string,
    { qty: number; name: string; boxName: string; cartItemId: string }
  >();

  for (const line of cartLines) {
    const boxProductId = lookup.productByVariant.get(line.variant_id);
    if (!boxProductId) continue;
    const components = lookup.componentsByBoxProduct.get(boxProductId);
    if (!components?.length) continue;

    for (const component of components) {
      if (component.is_active === false || !component.variant_id) continue;
      const existing = requiredByVariant.get(component.variant_id);
      const add = Number(component.quantity) * Number(line.quantity);
      const componentName = lookup.names.get(component.variant_id) ?? component.product_name;
      if (existing) {
        existing.qty += add;
      } else {
        requiredByVariant.set(component.variant_id, {
          qty: add,
          name: componentName,
          boxName: line.product_name,
          cartItemId: line.cart_item_id,
        });
      }
    }
  }

  const issues: StockIssue[] = [];
  for (const [variantId, requirement] of requiredByVariant.entries()) {
    const available = lookup.available.get(variantId);
    if (available === undefined || available < requirement.qty) {
      issues.push({
        cart_item_id: requirement.cartItemId,
        product_name: `${requirement.boxName} → ${requirement.name}`,
        requested: requirement.qty,
        available: Math.max(available ?? 0, 0),
      });
    }
  }

  return issues;
}

/** Public link rule for an included product (mirrors the storefront read gate). */
export function isPubliclyAccessible(product: {
  status?: string | null;
  visibility?: string | null;
  deleted_at?: string | null;
}): boolean {
  return (
    product.status === "published" &&
    product.visibility === "visible" &&
    !product.deleted_at
  );
}
