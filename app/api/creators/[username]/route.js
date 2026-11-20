import { handleApiError } from "@/lib/api-errors";
import {
  isMissingRelation,
  migrationRequiredResponse,
} from "@/lib/creator/api";
import { USERNAME_RE } from "@/lib/creator/profile-validation";
import { getPublicServerClient } from "@/lib/supabase/public-server";

// Persona fields only — user_id, can_publish, is_active and timestamps of
// moderation never leave this endpoint.
const PUBLIC_COLUMNS =
  "id, user_id, username, display_name, avatar_url, bio, social_links, is_featured, created_at";

function notFound() {
  return Response.json(
    { success: false, message: "Creator not found." },
    { status: 404 }
  );
}

async function loadCreator(username) {
  const supabase = getPublicServerClient();
  const { data, error } = await supabase
    .from("creator_profiles")
    .select(PUBLIC_COLUMNS)
    .eq("username", username)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return { missing: true };
    throw error;
  }
  return { missing: false, creator: data ?? null };
}

// GET /api/creators/[username] — public creator persona + aggregate counts.
// Counts come from RLS-scoped head queries, so they only ever include what
// the public is allowed to see:
//   products = creator_design_products whose linked product is published
//   gallery  = approved + public gallery entries
//   designs  = approved + public designs
export async function GET(request, { params }) {
  try {
    const { username: raw } = await params;
    const username = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!USERNAME_RE.test(username)) return notFound();

    const loaded = await loadCreator(username);
    if (loaded.missing) return migrationRequiredResponse("creators.profile");
    const creator = loaded.creator;
    if (!creator) return notFound();

    const supabase = getPublicServerClient();

    const [productsResult, galleryResult, designsResult] = await Promise.all([
      supabase
        .from("creator_design_products")
        .select("id", { count: "exact", head: true })
        .eq("creator_profile_id", creator.id),
      supabase
        .from("creator_gallery_items")
        .select("id", { count: "exact", head: true })
        .eq("creator_profile_id", creator.id),
      supabase
        .from("user_designs")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", creator.user_id)
        .eq("status", "approved")
        .eq("is_public", true)
        .is("deleted_at", null),
    ]);

    for (const result of [productsResult, galleryResult, designsResult]) {
      if (result.error) {
        if (isMissingRelation(result.error)) {
          return migrationRequiredResponse("creators.profile");
        }
        throw result.error;
      }
    }

    return Response.json({
      success: true,
      creator: {
        username: creator.username,
        display_name: creator.display_name,
        avatar_url: creator.avatar_url,
        bio: creator.bio,
        social_links: creator.social_links,
        is_featured: creator.is_featured,
        created_at: creator.created_at,
      },
      counts: {
        products: productsResult.count ?? 0,
        gallery: galleryResult.count ?? 0,
        designs: designsResult.count ?? 0,
      },
    });
  } catch (error) {
    return handleApiError(
      error,
      "Creator Public Profile GET",
      "Could not load this creator."
    );
  }
}
