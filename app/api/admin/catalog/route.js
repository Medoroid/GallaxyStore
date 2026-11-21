import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { handleApiError } from "@/lib/api-errors";

/**
 * Admin catalog API — categories and brands.
 *
 * Both tables already exist in the authoritative schema (with a UNIQUE slug),
 * so this route only performs guarded CRUD through the service role. Deletes
 * are soft (`deleted_at`) and refused while products still reference the row.
 */

const CONFIG = {
  categories: {
    table: "categories",
    order: "sort_order",
    fields: [
      "name",
      "slug",
      "description",
      "image_url",
      "icon",
      "parent_id",
      "is_active",
      "sort_order",
    ],
    text: {
      name: 120,
      slug: 160,
      description: 2000,
      image_url: 500,
      icon: 100,
    },
  },
  brands: {
    table: "brands",
    order: "name",
    fields: [
      "name",
      "slug",
      "description",
      "logo_url",
      "website_url",
      "is_active",
      "seo_title",
      "seo_description",
    ],
    text: {
      name: 120,
      slug: 160,
      description: 2000,
      logo_url: 500,
      website_url: 500,
      seo_title: 160,
      seo_description: 500,
    },
  },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bad(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

function configFor(value) {
  return CONFIG[String(value || "")] ? String(value) : null;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

async function audit(db, auth, action, type, id, details) {
  await db.from("admin_audit_log").insert({
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action,
    entity_type: `catalog_${type}`,
    entity_id: id,
    details,
  });
}

async function productCounts(db, type) {
  const column = type === "categories" ? "category_id" : "brand_id";
  const { data, error } = await db
    .from("products")
    .select(`id, ${column}`)
    .is("deleted_at", null);
  if (error) return new Map();
  const counts = new Map();
  for (const row of data ?? []) {
    if (!row[column]) continue;
    counts.set(row[column], (counts.get(row[column]) ?? 0) + 1);
  }
  return counts;
}

async function authorize(request) {
  const auth = await verifyAdmin(request);
  return auth.error ? { error: bad(auth.error, auth.status) } : { auth };
}

function parseBody(body, type, isUpdate) {
  const config = CONFIG[type];
  const payload = {};

  if (!isUpdate || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "Name is required." };
    payload.name = name.slice(0, config.text.name);
  }

  if (!isUpdate || body.slug !== undefined) {
    const raw = String(body.slug ?? "").trim();
    const slug = (raw ? slugify(raw) : slugify(body.name ?? "")) ||
      `${type === "categories" ? "cat" : "brand"}-${Date.now().toString(36)}`;
    payload.slug = slug;
  }

  for (const field of Object.keys(config.text)) {
    if (field === "name" || field === "slug") continue;
    if (body[field] === undefined) continue;
    const value = String(body[field] ?? "").trim();
    payload[field] = value ? value.slice(0, config.text[field]) : null;
  }

  if (body.is_active !== undefined) {
    payload.is_active = body.is_active === true || body.is_active === "true";
  }

  if (type === "categories") {
    if (body.parent_id !== undefined) {
      const parent = String(body.parent_id ?? "").trim();
      payload.parent_id = UUID_RE.test(parent) ? parent : null;
    }
    if (body.sort_order !== undefined) {
      const order = Number(body.sort_order);
      payload.sort_order = Number.isFinite(order) ? Math.trunc(order) : 0;
    }
  }

  return { payload };
}

/** GET /api/admin/catalog?type=categories|brands */
export async function GET(request) {
  try {
    const checked = await authorize(request);
    if (checked.error) return checked.error;

    const type = configFor(new URL(request.url).searchParams.get("type"));
    if (!type) return bad("Unknown catalog type.");

    const config = CONFIG[type];
    const db = getServiceRoleClient();
    const [rowsRes, counts] = await Promise.all([
      db
        .from(config.table)
        .select(`id, ${config.fields.join(", ")}, created_at, updated_at`)
        .is("deleted_at", null)
        .order(config.order, { ascending: true }),
      productCounts(db, type),
    ]);
    if (rowsRes.error) throw rowsRes.error;

    const items = (rowsRes.data ?? []).map((row) => ({
      ...row,
      product_count: counts.get(row.id) ?? 0,
    }));
    return Response.json({ success: true, items });
  } catch (error) {
    return handleApiError(error, "Admin catalog GET", "Could not load catalog items");
  }
}

/** POST /api/admin/catalog — { type, ...fields } */
export async function POST(request) {
  try {
    const checked = await authorize(request);
    if (checked.error) return checked.error;

    const body = await request.json().catch(() => null);
    const type = configFor(body?.type);
    if (!type) return bad("Unknown catalog type.");

    const parsed = parseBody(body ?? {}, type, false);
    if (parsed.error) return bad(parsed.error);

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from(CONFIG[type].table)
      .insert(parsed.payload)
      .select(`${CONFIG[type].fields.join(", ")}, id, created_at`)
      .single();
    if (error?.code === "23505") return bad("That slug already exists. Choose another.", 409);
    if (error) throw error;

    await audit(
      db,
      checked.auth,
      `catalog.${type === "categories" ? "category" : "brand"}_created`,
      type,
      data.id,
      { name: data.name, slug: data.slug }
    );

    return Response.json({ success: true, item: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin catalog POST", "Could not create catalog item");
  }
}

/** PATCH /api/admin/catalog — { type, id, ...fields } */
export async function PATCH(request) {
  try {
    const checked = await authorize(request);
    if (checked.error) return checked.error;

    const body = await request.json().catch(() => null);
    const type = configFor(body?.type);
    if (!type) return bad("Unknown catalog type.");
    const id = String(body?.id ?? "");
    if (!UUID_RE.test(id)) return bad("A valid id is required.");

    const parsed = parseBody(body ?? {}, type, true);
    if (parsed.error) return bad(parsed.error);
    if (Object.keys(parsed.payload).length === 0) return bad("Nothing to update.");

    if (type === "categories" && parsed.payload.parent_id === id) {
      return bad("A category cannot be its own parent.");
    }

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from(CONFIG[type].table)
      .update({ ...parsed.payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select(`${CONFIG[type].fields.join(", ")}, id, updated_at`)
      .maybeSingle();
    if (error?.code === "23505") return bad("That slug already exists. Choose another.", 409);
    if (error) throw error;
    if (!data) return bad("Item not found.", 404);

    await audit(
      db,
      checked.auth,
      `catalog.${type === "categories" ? "category" : "brand"}_updated`,
      type,
      id,
      { name: data.name, slug: data.slug }
    );

    return Response.json({ success: true, item: data });
  } catch (error) {
    return handleApiError(error, "Admin catalog PATCH", "Could not update catalog item");
  }
}

/** DELETE /api/admin/catalog — { type, id } (soft delete) */
export async function DELETE(request) {
  try {
    const checked = await authorize(request);
    if (checked.error) return checked.error;

    const body = await request.json().catch(() => null);
    const type = configFor(body?.type);
    if (!type) return bad("Unknown catalog type.");
    const id = String(body?.id ?? "");
    if (!UUID_RE.test(id)) return bad("A valid id is required.");

    const db = getServiceRoleClient();
    const counts = await productCounts(db, type);
    if ((counts.get(id) ?? 0) > 0) {
      return bad(
        `This ${type === "categories" ? "category" : "brand"} is used by ${counts.get(id)} product(s). Reassign them first.`,
        409
      );
    }

    const { data, error } = await db
      .from(CONFIG[type].table)
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id, name")
      .maybeSingle();
    if (error) throw error;
    if (!data) return bad("Item not found.", 404);

    await audit(
      db,
      checked.auth,
      `catalog.${type === "categories" ? "category" : "brand"}_deleted`,
      type,
      id,
      { name: data.name }
    );

    return Response.json({ success: true, item: data });
  } catch (error) {
    return handleApiError(error, "Admin catalog DELETE", "Could not delete catalog item");
  }
}
