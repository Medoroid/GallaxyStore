import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { getPublicServerClient } from "@/lib/supabase/public-server";

export const metadata: Metadata = {
  title: "Vendor Stores | Gallaxy Store",
  description: "Browse independent creators and print studios selling on Gallaxy Store.",
};

export const revalidate = 300;

type StoreRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
};

export default async function StoresPage() {
  const supabase = getPublicServerClient();

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, slug, description, logo_url")
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const rows = (stores ?? []) as StoreRow[];
  const storeIds = rows.map((store) => store.id);

  const productCounts = new Map<string, number>();
  if (storeIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("store_id")
      .in("store_id", storeIds)
      .eq("status", "published")
      .eq("visibility", "visible")
      .is("deleted_at", null);

    for (const product of products ?? []) {
      if (!product.store_id) continue;
      productCounts.set(product.store_id, (productCounts.get(product.store_id) ?? 0) + 1);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <header className="glass-strong rounded-3xl p-8 md:p-10">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">
          Marketplace
        </p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Vendor <span className="text-gradient-neon">Stores</span>
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl">
          Shop directly from independent creators and print studios. Every store below has been
          reviewed and approved by our team.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="glass rounded-3xl p-12 mt-8 text-center">
          <Store className="h-12 w-12 mx-auto text-gray-500" />
          <h2 className="mt-4 text-xl font-bold">No stores are live yet</h2>
          <p className="text-muted-foreground mt-2">
            Vendor applications are reviewed before a store appears here.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 mt-6 px-5 h-11 rounded-xl bg-gradient-neon text-white font-semibold"
          >
            Become a vendor <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((store) => (
            <Link
              key={store.id}
              href={`/stores/${store.slug}`}
              className="glass rounded-3xl p-6 hover:pink-glow transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/[0.05]">
                  {store.logo_url ? (
                    <Image
                      src={store.logo_url}
                      alt={store.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-xl font-extrabold text-gradient-neon">
                      {store.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold truncate group-hover:text-secondary transition-colors">
                    {store.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {productCounts.get(store.id) ?? 0} published product
                    {(productCounts.get(store.id) ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground line-clamp-3">
                {store.description || "This vendor has not added a description yet."}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-secondary">
                Visit store <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
