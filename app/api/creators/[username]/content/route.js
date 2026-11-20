import { handleApiError } from "@/lib/api-errors";
import {
  isMissingRelation,
  migrationRequiredResponse,
} from "@/lib/creator/api";
import { USERNAME_RE } from "@/lib/creator/profile-validation";
import { getPublicServerClient } from "@/lib/supabase/public-server";

const DEFAULT_PER_PAGE = 12;
const MAX_PER_PAGE = 24;

function notFound() {
  return Response.json(
    { success: false, message: "Creator not found." },
    { status: 404 }
  );
}

function intParam(searchParams, name, fallback, { min, max }) {
  const parsed = Number.parseInt(searchParams.get(name) ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// GET /api/creators/[username]/content?type=products|gallery&page=1&per_page=12
//
// Both lists run under the caller's public RLS, so a row can only appear if
// the public is allowed to see it:
//   products = product configurations whose linked product is already
//              published + visible (never drafts, never unapproved)
//   gallery  = approved + public + non-deleted entries
export async function GET(request, { params }) {
  try {
    const { username: raw } = await params;
    const username = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!USERNAME_RE.test(username)) return notFound();

    const url = new URL(request.url);
    const type = url.searchParams.get("type") === "gallery" ? "gallery" : "products";
    const page = intParam(url.searchParams, "page", 1, { min: 1, max: 10000 });
    const perPage = intParam(url.searchParams, "per_page", DEFAULT_PER_PAGE, {
      min: 1,
      max: MAX_PER_PAGE,
    });

    const supabase = getPublicServerClient();

    const { data: creator, error: creatorError } = await supabase
      .from("creator_profiles")
      .select("id")
      .eq("username", username)
      .eq("is_active", true)
      .maybeSingle();

    if (creatorError) {
      if (isMissingRelation(creatorError)) {
        return migrationRequiredResponse("creators.content");
      }
      throw creatorError;
    }
    if (!creator) return notFound();

    const offset = (page - 1) * perPage;
    const rangeEnd = offset + perPage - 1;

    let query;
    if (type === "gallery") {
      query = supabase
        .from("creator_gallery_items")
        .select(
          "id, title, description, preview_path, tags, product_id, design_id, published_at",
          { count: "exact" }
        )
        .eq("creator_profile_id", creator.id)
        .eq("status", "approved")
        .eq("visibility", "public")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .range(offset, rangeEnd);
    } else {
      query = supabase
        .from("creator_design_products")
        .select(
          `id, status, mockups, selected_colors, fulfillment_mode, updated_at,
           product:products(id, name, slug, base_price, compare_at_price, currency,
             avg_rating, rating_count, categories(name),
             product_images(id, storage_path, alt_text, is_primary, sort_order))`,
          { count: "exact" }
        )
        .eq("creator_profile_id", creator.id)
        .not("product_id", "is", null)
        .order("updated_at", { ascending: false })
        .range(offset, rangeEnd);
    }

    const { data, error, count } = await query;
    if (error) {
      if (isMissingRelation(error)) return migrationRequiredResponse("creators.content");
      throw error;
    }

    const rows = data ?? [];
    // Belt and braces: only configurations with a resolvable published product
    // are returned (RLS already guarantees this; the filter keeps the contract
    // explicit if policies ever drift).
    const items =
      type === "products" ? rows.filter((row) => Boolean(row.product)) : rows;

    const total = count ?? items.length;

    return Response.json({
      success: true,
      type,
      items,
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
    });
  } catch (error) {
    return handleApiError(
      error,
      "Creator Content GET",
      "Could not load this creator's content."
    );
  }
}
