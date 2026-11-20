import { isMissingRelation } from "@/lib/creator/api";
import { getPublicServerClient } from "@/lib/supabase/public-server";

/**
 * Public data access for the /creators discovery directory (Phase 8).
 *
 * Everything runs under the anon key, so Postgres RLS is the source of
 * truth for what the public may see:
 *   - creator_profiles: persona-only table (public policy), deactivated
 *     creators filtered out here (`is_active`);
 *   - creator_design_products: the public policy only exposes rows whose
 *     linked product is already published + visible, so grouping its rows
 *     yields an honest published-products count per creator;
 *   - creator_gallery_items: public policy = approved + public + not
 *     soft-deleted (mirrored below so the contract stays explicit even if
 *     policies drift).
 *
 * The creator id is used server-side for counting only and is never
 * returned — public surfaces deal in usernames.
 */

export const DIRECTORY_CREATORS_LIMIT = 60;
export const DIRECTORY_GALLERY_LIMIT = 12;

const CREATOR_SELECT =
  "id, username, display_name, avatar_url, bio, is_featured, created_at";

const GALLERY_SELECT = `id, title, description, preview_path, tags, product_id,
   creator_profile_id, published_at,
   creator_profiles(username, display_name)`;

export type DirectoryCreator = {
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_featured: boolean;
  created_at: string;
  products: number;
  gallery: number;
};

export type DirectoryGalleryItem = {
  id: string;
  title: string;
  description: string | null;
  preview_path: string | null;
  tags: string[];
  product_id: string | null;
  published_at: string | null;
  creator: { username: string; display_name: string } | null;
};

export type CreatorDirectoryData = {
  creators: DirectoryCreator[];
  gallery: DirectoryGalleryItem[];
  galleryTotal: number;
};

/**
 * Pending manual migrations are a known, expected condition (the SQL bundle
 * is applied by hand) — callers can catch this one specific error and render
 * an honest "not available yet" notice. Every other failure stays a plain
 * throw so it reaches the error page instead of masquerading as empty data.
 */
export class MigrationsRequiredError extends Error {}

function fail(error: unknown): never {
  if (isMissingRelation(error)) {
    throw new MigrationsRequiredError(
      "The creator studio migrations must be applied before the creators directory can render."
    );
  }
  throw error;
}

export async function fetchCreatorDirectory(): Promise<CreatorDirectoryData> {
  const supabase = getPublicServerClient();

  const { data: creatorRows, error: creatorError } = await supabase
    .from("creator_profiles")
    .select(CREATOR_SELECT)
    .eq("is_active", true)
    .order("is_featured", { ascending: false })
    .order("display_name", { ascending: true })
    .limit(DIRECTORY_CREATORS_LIMIT);

  if (creatorError) fail(creatorError);
  const rows = (creatorRows ?? []) as Array<
    Omit<DirectoryCreator, "products"> & { id: string }
  >;
  const ids = rows.map((row) => row.id);

  // Counts (only meaningful when creators exist) and the latest gallery run
  // in parallel — different tables, so neither can starve the other.
  const [productCountResult, galleryResult] = await Promise.all([
    ids.length > 0
      ? supabase.from("creator_design_products").select("creator_profile_id")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("creator_gallery_items")
      .select(GALLERY_SELECT, { count: "exact" })
      .eq("status", "approved")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .order("published_at", { ascending: false }),
  ]);

  if (productCountResult.error) fail(productCountResult.error);
  if (galleryResult.error) fail(galleryResult.error);

  const productsByCreator = new Map<string, number>();
  for (const row of (productCountResult.data ?? []) as Array<{
    creator_profile_id: string | null;
  }>) {
    if (!row.creator_profile_id) continue;
    productsByCreator.set(
      row.creator_profile_id,
      (productsByCreator.get(row.creator_profile_id) ?? 0) + 1
    );
  }

  // The gallery query is unbounded on purpose: its rows serve three duties —
  // the exact total, the grouped per-creator counts and the first page.
  const galleryRows = (galleryResult.data ?? []) as unknown as Array<
    Omit<DirectoryGalleryItem, "creator"> & {
      creator_profile_id: string | null;
      creator_profiles: { username: string; display_name: string } | null;
    }
  >;

  const galleryByCreator = new Map<string, number>();
  for (const row of galleryRows) {
    if (!row.creator_profile_id) continue;
    galleryByCreator.set(
      row.creator_profile_id,
      (galleryByCreator.get(row.creator_profile_id) ?? 0) + 1
    );
  }

  const creators: DirectoryCreator[] = rows.map(
    ({ id, username, display_name, avatar_url, bio, is_featured, created_at }) => ({
      username,
      display_name,
      avatar_url,
      bio,
      is_featured,
      created_at,
      products: productsByCreator.get(id) ?? 0,
      gallery: galleryByCreator.get(id) ?? 0,
    })
  );

  const gallery: DirectoryGalleryItem[] = galleryRows
    .slice(0, DIRECTORY_GALLERY_LIMIT)
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      preview_path: row.preview_path,
      tags: row.tags ?? [],
      product_id: row.product_id,
      published_at: row.published_at,
      creator: row.creator_profiles ?? null,
    }));

  return { creators, gallery, galleryTotal: galleryResult.count ?? gallery.length };
}
