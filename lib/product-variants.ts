import type { ProductVariantEmbed, SupabaseProduct } from "./products";

/**
 * Resolve the exact variant for a shopper's selected colour/size from the
 * variant data embedded in the product read. No extra network round trip.
 * Falls back to the default (or first active) variant, and returns undefined
 * for legacy products without variants so the server can use its own resolver.
 */
function normalize(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const value = label.trim().toLowerCase();
  return value.length ? value : null;
}

export function resolveVariantIdForSelection(
  product: Pick<SupabaseProduct, "product_variants"> | null | undefined,
  selection: { color?: string | null; size?: string | null }
): string | undefined {
  const variants: ProductVariantEmbed[] = (product?.product_variants ?? []).filter(
    (variant) => variant.is_active !== false && !variant.deleted_at
  );
  if (variants.length === 0) return undefined;

  const wanted = [normalize(selection.color), normalize(selection.size)].filter(
    (value): value is string => value !== null
  );
  if (wanted.length === 0) {
    return variants.find((variant) => variant.is_default)?.id ?? variants[0].id;
  }

  const labelsOf = (variant: ProductVariantEmbed): string[] =>
    (variant.product_variant_options ?? [])
      .map((option) => normalize(option.product_attribute_values?.value))
      .filter((value): value is string => value !== null);

  const exact = variants.find((variant) => {
    const labels = labelsOf(variant);
    return wanted.every((value) => labels.includes(value));
  });
  if (exact) return exact.id;

  return variants.find((variant) => variant.is_default)?.id ?? variants[0].id;
}
