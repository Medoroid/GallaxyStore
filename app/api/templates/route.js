import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Map a valid DB geometry row into the client wire shape. */
function geometryFrom(row) {
  const views = (row.published_views ?? row.views ?? []);
  const colors = (row.published_colors ?? row.colors ?? []);
  const sizes = (row.published_sizes ?? row.sizes ?? []);
  const dims = (row.published_dimensions_mm ?? row.dimensions_mm ?? {});
  return {
    dimensions_mm: dims,
    views,
    colors,
    sizes,
  };
}

/**
 * GET /api/templates — public catalog of PUBLISHED template geometry.
 * The DB is the single source of truth; renderer functions are hydrated by key
 * on the client from the TS code registry.
 */
export async function GET() {
  try {
    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("creator_product_templates")
      .select(
        "template_key, name, name_ar, category, is_active, is_published, geometry_version, dimensions_mm, views, colors, sizes, published_dimensions_mm, published_views, published_colors, published_sizes"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const templates = rows.map((row) => ({
      key: String(row.template_key),
      name: String(row.name ?? row.template_key),
      nameAr: typeof row.name_ar === "string" ? row.name_ar : null,
      category: typeof row.category === "string" ? row.category : "custom",
      geometry: geometryFrom(row),
      geometryVersion: Number(row.geometry_version ?? 1),
      published: row.is_published === true,
    }));

    return Response.json({ success: true, templates });
  } catch (error) {
    return Response.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to load templates." },
      { status: 500 }
    );
  }
}
