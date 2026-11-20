import { handleApiError } from "@/lib/api-errors";
import {
  isMissingRelation,
  migrationRequiredResponse,
  requireUser,
} from "@/lib/creator/api";

// Section caps: real data, recent-first. `total` (exact count) travels with
// each section so the UI can say "showing N of M" honestly instead of
// pretending the list is complete.
const DESIGNS_LIMIT = 200;
const PRODUCTS_LIMIT = 200;
const GALLERY_LIMIT = 200;

function countByStatus(items) {
  const out = { draft: 0, pending_review: 0, approved: 0, rejected: 0, archived: 0 };
  for (const item of items) {
    if (out[item.status] !== undefined) out[item.status] += 1;
  }
  return out;
}

// GET — everything the creator dashboard shows, scoped to the caller's own
// rows. Queries run with the caller's JWT (RLS applies): designs by owner,
// product configurations via owns_design, gallery by owner, persona by
// user_id. A creator can never see another creator's rows here.
export async function GET(request) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const client = auth.client;

    const { data: profile, error: profileError } = await client
      .from("creator_profiles")
      .select(
        "id, username, display_name, avatar_url, bio, social_links, is_featured, is_active, can_publish, created_at, updated_at"
      )
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (profileError) {
      if (isMissingRelation(profileError)) {
        return migrationRequiredResponse("creator.dashboard");
      }
      throw profileError;
    }

    // No persona yet — the dashboard renders its onboarding form from this.
    if (!profile) {
      return Response.json({
        success: true,
        profile: null,
        stats: {
          designs: 0,
          products: 0,
          gallery: 0,
          published_products: 0,
          pending: 0,
          rejected: 0,
        },
        sections: {
          designs: { items: [], total: 0 },
          products: { items: [], total: 0 },
          gallery: { items: [], total: 0 },
        },
      });
    }

    const [designsResult, productsResult, galleryResult] = await Promise.all([
      client
        .from("user_designs")
        .select(
          "id, title, status, rejection_reason, created_at, updated_at, is_public, download_count",
          { count: "exact" }
        )
        .eq("owner_id", auth.user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(DESIGNS_LIMIT),
      client
        .from("creator_design_products")
        .select(
          `id, status, rejection_reason, design_id, product_id, fulfillment_mode,
           selected_colors, selected_sizes, mockups, submitted_at,
           created_at, updated_at,
           template:creator_product_templates(template_key, name, name_ar, mockup_format),
           design:user_designs(id, title, status),
           product:products(id, name, slug, status, visibility)`,
          { count: "exact" }
        )
        .eq("creator_profile_id", profile.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(PRODUCTS_LIMIT),
      client
        .from("creator_gallery_items")
        .select(
          "id, title, status, rejection_reason, visibility, preview_path, tags, product_id, published_at, created_at, updated_at",
          { count: "exact" }
        )
        .eq("owner_id", auth.user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(GALLERY_LIMIT),
    ]);

    for (const result of [designsResult, productsResult, galleryResult]) {
      if (result.error) {
        if (isMissingRelation(result.error)) {
          return migrationRequiredResponse("creator.dashboard");
        }
        throw result.error;
      }
    }

    const designs = designsResult.data ?? [];
    const products = productsResult.data ?? [];
    const gallery = galleryResult.data ?? [];

    const designStatuses = countByStatus(designs);
    const productStatuses = countByStatus(products);
    const galleryStatuses = countByStatus(gallery);

    const publishedProducts = products.filter(
      (row) => row.status === "approved" && Boolean(row.product_id)
    ).length;
    const pending =
      designStatuses.pending_review +
      productStatuses.pending_review +
      galleryStatuses.pending_review;
    const rejected =
      designStatuses.rejected +
      productStatuses.rejected +
      galleryStatuses.rejected;

    return Response.json({
      success: true,
      profile,
      stats: {
        designs: designsResult.count ?? designs.length,
        products: productsResult.count ?? products.length,
        gallery: galleryResult.count ?? gallery.length,
        published_products: publishedProducts,
        pending,
        rejected,
        by_status: {
          designs: designStatuses,
          products: productStatuses,
          gallery: galleryStatuses,
        },
      },
      sections: {
        designs: {
          items: designs,
          total: designsResult.count ?? designs.length,
        },
        products: {
          items: products,
          total: productsResult.count ?? products.length,
        },
        gallery: {
          items: gallery,
          total: galleryResult.count ?? gallery.length,
        },
      },
    });
  } catch (error) {
    return handleApiError(
      error,
      "Creator Dashboard GET",
      "Could not load the creator dashboard."
    );
  }
}
