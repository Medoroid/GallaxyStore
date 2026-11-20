/**
 * Shared server-side helper: resolves variant option labels
 * (e.g. { Size: "M", Color: "Red" } → "M / Red") for gift box component
 * variants using the existing EAV structure:
 *
 *   product_variant_options (variant_id, attribute_value_id)
 *     -> product_attribute_values (id, value, attribute_id)
 *       -> product_attributes (id, name)
 *
 * Degrades to an empty map when the structures are unavailable — labels are
 * a display nicety, never a hard dependency.
 */

const MISSING_RELATION_CODES = new Set(["42P01", "PGRST202", "42703", "PGRST204"]);

function degrade(error) {
  return Boolean(error) && MISSING_RELATION_CODES.has(error.code);
}

export async function loadVariantOptionLabels(db, variantIds) {
  /** @type {Map<string, { options: Record<string, string>, label: string }>} */
  const result = new Map();
  const unique = [...new Set((variantIds ?? []).filter(Boolean))];
  if (unique.length === 0) return result;

  const { data: links, error: linksError } = await db
    .from("product_variant_options")
    .select("variant_id, attribute_value_id")
    .in("variant_id", unique);
  if (linksError) {
    if (degrade(linksError)) return result;
    throw linksError;
  }
  if (!links?.length) return result;

  const valueIds = [...new Set(links.map((row) => row.attribute_value_id).filter(Boolean))];
  const { data: values, error: valuesError } = await db
    .from("product_attribute_values")
    .select("id, value, attribute_id")
    .in("id", valueIds);
  if (valuesError) {
    if (degrade(valuesError)) return result;
    throw valuesError;
  }

  const attributeIds = [...new Set((values ?? []).map((row) => row.attribute_id).filter(Boolean))];
  const { data: attributes, error: attributesError } = await db
    .from("product_attributes")
    .select("id, name")
    .in("id", attributeIds);
  if (attributesError) {
    if (degrade(attributesError)) return result;
    throw attributesError;
  }

  const valueById = new Map((values ?? []).map((row) => [row.id, row]));
  const attributeNameById = new Map((attributes ?? []).map((row) => [row.id, row.name]));

  for (const link of links) {
    const valueRow = valueById.get(link.attribute_value_id);
    if (!valueRow) continue;
    const entry = result.get(link.variant_id) ?? { options: {}, label: "" };
    const attributeName = attributeNameById.get(valueRow.attribute_id) ?? "Option";
    entry.options[attributeName] = String(valueRow.value ?? "");
    result.set(link.variant_id, entry);
  }

  for (const entry of result.values()) {
    entry.label = Object.values(entry.options).filter(Boolean).join(" / ");
  }

  return result;
}
