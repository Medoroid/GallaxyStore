import type { Metadata } from "next";
import Link from "next/link";
import { getPublicServerClient } from "@/lib/supabase/public-server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Community Designs | Gallaxy Store",
  description: "Customer designs approved for public display on Galaxy Store.",
};

type SharedDesign = {
  id: string;
  title: string;
  description: string | null;
  author_display_name: string;
  preview_path: string | null;
  published_at: string | null;
};

/**
 * Public gallery of OPT-IN customer designs only. Private designs are never
 * selected here — the RLS policy requires status='approved' and deleted_at null.
 * No creator profiles, accounts, earnings or marketplace links exist.
 */
export default async function DesignsPage() {
  const supabase = getPublicServerClient();
  const { data, error } = await supabase
    .from("shared_designs")
    .select("id, title, description, author_display_name, preview_path, published_at")
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(48);

  const designs = (error ? [] : (data ?? [])) as SharedDesign[];

  return (
    <main className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <header className="text-center max-w-2xl mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Gallery</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Community <span className="text-gradient-neon">Designs</span>
        </h1>
        <p className="text-muted-foreground mt-3">
          Artwork shared voluntarily by Galaxy Store customers and approved by our team. Want to make
          your own? Design it in the Custom Print Studio — sharing is always optional.
        </p>
        <Link href="/custom-print" className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-gradient-neon text-white font-bold text-sm">
          Open Custom Print Studio
        </Link>
      </header>

      {error && (
        <p className="mt-10 glass rounded-2xl p-5 text-sm text-amber-400 max-w-xl mx-auto text-center">
          The gallery is not available in this environment yet. Private designs are unaffected.
        </p>
      )}

      {designs.length === 0 && !error ? (
        <p className="mt-12 text-center text-muted-foreground">No shared designs yet.</p>
      ) : (
        <div className="mt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {designs.map((design) => {
            const imageUrl = design.preview_path
              ? supabase.storage.from("design-previews").getPublicUrl(design.preview_path).data.publicUrl
              : null;
            return (
              <article key={design.id} className="glass rounded-2xl overflow-hidden">
                <div className="aspect-square bg-background/60 grid place-items-center overflow-hidden">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={design.title} className="h-full w-full object-contain" loading="lazy" />
                  ) : (
                    <span className="text-xs text-muted-foreground px-3 text-center">{design.title}</span>
                  )}
                </div>
                <div className="p-3">
                  <h2 className="font-semibold text-sm truncate">{design.title}</h2>
                  <p className="text-xs text-muted-foreground truncate">by {design.author_display_name}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
