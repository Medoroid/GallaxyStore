import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import { getPublicServerClient } from "@/lib/supabase/public-server";
import {
  productSelect,
  toProductCardProduct,
  type SupabaseProduct,
} from "@/lib/products";

export const revalidate = 300;

type StoreRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
};

async function getStore(slug: string): Promise<StoreRecord | null> {
  const supabase = getPublicServerClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name, slug, description, logo_url")
    .eq("slug", slug)
    .eq("status", "approved")
    .is("deleted_at", null)
    .maybeSingle();

  return (data as StoreRecord | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStore(slug);

  if (!store) return { title: "Store not found | Gallaxy Store" };

  return {
    title: `${store.name} | Gallaxy Store`,
    description:
      store.description ||
      `Shop products from ${store.name} on Gallaxy Store.`,
  };
}

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStore(slug);

  if (!store) notFound();

  const supabase = getPublicServerClient();
  const { data: products } = await supabase
    .from("products")
    .select(productSelect)
    .eq("store_id", store.id)
    .eq("status", "published")
    .eq("visibility", "visible")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);

  const rows = (products ?? []) as unknown as SupabaseProduct[];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <Link
        href="/stores"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> All stores
      </Link>

      <header className="glass-strong rounded-3xl p-8 md:p-10 mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white/[0.05] grid place-items-center">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.logo_url}
                alt={`${store.name} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl font-extrabold text-gradient-neon">
                {store.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">
              Vendor store
            </p>
            <h1 className="text-3xl md:text-4xl font-extrabold mt-1">{store.name}</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              {store.description || "This vendor has not added a description yet."}
            </p>
          </div>
        </div>
      </header>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold">Products</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} product{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="glass rounded-3xl p-12 mt-4 text-center">
          <Package className="h-12 w-12 mx-auto text-gray-500" />
          <h3 className="mt-4 text-lg font-bold">No products yet</h3>
          <p className="text-muted-foreground mt-2">
            This store has not published any products.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {rows.map((product) => (
            <ProductCard
              key={product.id}
              product={toProductCardProduct(product)}
              href={`/product-details/${product.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
