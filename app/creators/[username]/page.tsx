import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import {
  CreatorProfileView,
  type CreatorCounts,
  type CreatorPersona,
} from "@/app/components/CreatorProfileView";
import { USERNAME_RE } from "@/lib/creator/profile-validation";
import { getPublicServerClient } from "@/lib/supabase/public-server";

// ISR: the persona + counts are revalidated every 5 minutes, exactly like the
// public store pages. Tab and pagination live client-side (searchParams would
// opt this page out of static rendering), served by /api/creators/[username]/content.
export const revalidate = 300;

type Props = { params: Promise<{ username: string }> };

type CreatorRow = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  is_featured: boolean;
  created_at: string;
};

/**
 * Public persona lookup — `is_active` enforced here so deactivated creators
 * disappear from the public surface entirely. Errors are thrown (honest 500)
 * rather than swallowed into a misleading 404.
 */
const getCreator = cache(async (username: string): Promise<CreatorRow | null> => {
  const supabase = getPublicServerClient();
  const { data, error } = await supabase
    .from("creator_profiles")
    .select(
      "id, user_id, username, display_name, avatar_url, bio, social_links, is_featured, created_at"
    )
    .eq("username", username)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return (data as CreatorRow | null) ?? null;
});

/**
 * Aggregate counts for the persona header. Every count is RLS-scoped to what
 * the public may already see (published products, approved+public gallery and
 * designs), so the numbers can never leak private state.
 */
const getCounts = cache(
  async (creator: CreatorRow): Promise<CreatorCounts> => {
    const supabase = getPublicServerClient();

    const [products, gallery, designs] = await Promise.all([
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

    if (products.error) throw products.error;
    if (gallery.error) throw gallery.error;
    if (designs.error) throw designs.error;

    return {
      products: products.count ?? 0,
      gallery: gallery.count ?? 0,
      designs: designs.count ?? 0,
    };
  }
);

function normalizeUsername(raw: string): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username: raw } = await params;
  const username = normalizeUsername(raw);
  if (!USERNAME_RE.test(username)) {
    return { title: "Creator not found | Gallaxy Store" };
  }

  const creator = await getCreator(username);
  if (!creator) {
    return { title: "Creator not found | Gallaxy Store" };
  }

  return {
    title: `${creator.display_name} (@${creator.username}) | Gallaxy Store`,
    description:
      creator.bio ||
      `Browse products and gallery by ${creator.display_name} on Gallaxy Store.`,
  };
}

export default async function CreatorProfilePage({ params }: Props) {
  const { username: raw } = await params;
  const username = normalizeUsername(raw);
  // Reserved words and malformed segments never reach a lookup.
  if (!USERNAME_RE.test(username)) notFound();

  const creator = await getCreator(username);
  if (!creator) notFound();

  const counts = await getCounts(creator);

  // user_id / id stay on the server — only persona fields reach the client.
  const persona: CreatorPersona = {
    username: creator.username,
    display_name: creator.display_name,
    avatar_url: creator.avatar_url,
    bio: creator.bio,
    social_links: creator.social_links ?? {},
    is_featured: Boolean(creator.is_featured),
    created_at: creator.created_at,
  };

  return <CreatorProfileView creator={persona} counts={counts} />;
}
