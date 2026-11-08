"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import Spinner from "../components/spinner";
import { toProductCardProduct, type SupabaseProduct } from "@/lib/products";

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "popularity", label: "Most Popular" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "rating", label: "Top Rated" },
  { value: "name-asc", label: "Name: A → Z" },
];

type FacetCategory = { category_id: string; name: string; count: number };
type FacetBrand = { brand_id: string; name: string; count: number };

type SearchProduct = {
  id: string;
  name: string;
  slug: string | null;
  short_description: string | null;
  base_price: number;
  compare_at_price: number | null;
  currency: string;
  avg_rating: number;
  rating_count: number;
  is_featured: boolean;
  in_stock: boolean;
  categories: { id?: string; name: string; slug?: string | null } | null;
  product_images: Array<{
    id: string;
    storage_path: string | null;
    alt_text: string | null;
    is_primary: boolean;
    sort_order: number;
  }>;
};

type SearchResponse = {
  success: boolean;
  products: SearchProduct[];
  facets: { categories: FacetCategory[]; brands: FacetBrand[] };
  total: number;
  page: number;
  total_pages: number;
  message?: string;
};

function ProductsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialCategory = searchParams.get("category_id") || "";
  const initialBrand = searchParams.get("brand_id") || "";
  const [queryInput, setQueryInput] = useState(searchParams.get("q") || "");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [activeBrand, setActiveBrand] = useState(initialBrand);
  const [sort, setSort] = useState(searchParams.get("sort") || "relevance");
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));
  const [showFilters, setShowFilters] = useState(false);
  const [priceRange, setPriceRange] = useState<[string, string]>([
    searchParams.get("min_price") || "",
    searchParams.get("max_price") || "",
  ]);
  const [minRating, setMinRating] = useState(Number(searchParams.get("min_rating") || 0));
  const [inStockOnly, setInStockOnly] = useState(searchParams.get("in_stock") === "true");

  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [suggestions, setSuggestions] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounce the text query so each keystroke does not hit the database.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // Keep the URL shareable/bookmarkable.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (activeCategory) params.set("category_id", activeCategory);
    if (activeBrand) params.set("brand_id", activeBrand);
    if (sort && sort !== "relevance") params.set("sort", sort);
    if (priceRange[0]) params.set("min_price", priceRange[0]);
    if (priceRange[1]) params.set("max_price", priceRange[1]);
    if (minRating > 0) params.set("min_rating", String(minRating));
    if (inStockOnly) params.set("in_stock", "true");
    if (page > 1) params.set("page", String(page));

    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    query,
    activeCategory,
    activeBrand,
    sort,
    priceRange,
    minRating,
    inStockOnly,
    page,
    pathname,
    router,
  ]);

  useEffect(() => {
    if (queryInput.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?mode=suggestions&q=${encodeURIComponent(queryInput.trim())}`
        );
        const data = await res.json().catch(() => null);
        if (data?.success) setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++requestId.current;
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (activeCategory) params.set("category_id", activeCategory);
    if (activeBrand) params.set("brand_id", activeBrand);
    if (sort) params.set("sort", sort);
    if (priceRange[0]) params.set("min_price", priceRange[0]);
    if (priceRange[1]) params.set("max_price", priceRange[1]);
    if (minRating > 0) params.set("min_rating", String(minRating));
    if (inStockOnly) params.set("in_stock_only", "true");
    params.set("page", String(page));
    params.set("page_size", "12");

    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (current !== requestId.current) return;
        if (!res.ok || !data?.success) {
          setError(data?.message || "Search failed.");
          setResult(null);
          return;
        }
        setResult(data);
      })
      .catch((fetchError) => {
        if (fetchError.name === "AbortError" || current !== requestId.current) return;
        setError("Network error while searching.");
      })
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });

    return () => controller.abort();
  }, [query, activeCategory, activeBrand, sort, priceRange, minRating, inStockOnly, page]);

  const products = result?.products ?? [];
  const categories = result?.facets?.categories ?? [];
  const brands = result?.facets?.brands ?? [];
  const totalPages = result?.total_pages ?? 1;

  const activeFilters = useMemo(
    () =>
      Number(Boolean(query)) +
      Number(Boolean(activeCategory)) +
      Number(Boolean(activeBrand)) +
      Number(Boolean(priceRange[0] || priceRange[1])) +
      Number(minRating > 0) +
      Number(inStockOnly),
    [query, activeCategory, activeBrand, priceRange, minRating, inStockOnly]
  );

  const resetFilters = () => {
    setActiveCategory("");
    setActiveBrand("");
    setPriceRange(["", ""]);
    setMinRating(0);
    setInStockOnly(false);
    setSort("relevance");
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <header className="glass-strong rounded-3xl p-8 md:p-10">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Collection</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          All <span className="text-gradient-neon">Products</span>
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Premium custom prints, gaming-themed gear and cosmic gifts.
        </p>

        <div className="mt-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Search products..."
              aria-label="Search products"
              className="w-full glass rounded-2xl h-12 pl-11 pr-4 outline-none focus:pink-glow transition-all placeholder:text-muted-foreground"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 glass rounded-2xl p-2 z-50 shadow-xl">
                {suggestions.slice(0, 6).map((suggestion) => (
                  <button
                    key={`${suggestion.category}-${suggestion.id}`}
                    onClick={() => {
                      setQueryInput(suggestion.name);
                      setQuery(suggestion.name);
                      setShowSuggestions(false);
                      setPage(1);
                    }}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="text-sm font-medium text-white">{suggestion.name}</span>
                    <span className="text-xs text-gray-500 block capitalize">{suggestion.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowFilters((value) => !value)}
            className={`inline-flex items-center gap-2 px-5 h-12 rounded-2xl font-medium transition-all ${
              showFilters || activeFilters > 0 ? "bg-gradient-neon text-white" : "glass hover:pink-glow"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeFilters > 0 && (
              <span className="h-5 min-w-5 px-1 rounded-full bg-black/30 text-[11px] grid place-items-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 glass rounded-2xl p-5 animate-fade-in-up">
            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm font-semibold mb-2">Price Range</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={priceRange[0]}
                    onChange={(e) => {
                      setPriceRange([e.target.value, priceRange[1]]);
                      setPage(1);
                    }}
                    className="w-full h-9 px-2 rounded-lg glass text-sm outline-none"
                    min={0}
                    placeholder="Min"
                  />
                  <span className="text-muted-foreground">—</span>
                  <input
                    type="number"
                    value={priceRange[1]}
                    onChange={(e) => {
                      setPriceRange([priceRange[0], e.target.value]);
                      setPage(1);
                    }}
                    className="w-full h-9 px-2 rounded-lg glass text-sm outline-none"
                    min={0}
                    placeholder="Max"
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Minimum Rating</p>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((rating) => (
                    <button
                      key={`rating-${rating}`}
                      onClick={() => {
                        setMinRating(rating);
                        setPage(1);
                      }}
                      className={`px-3 h-9 rounded-lg text-sm font-semibold transition-all ${
                        minRating === rating ? "bg-gradient-neon text-white" : "glass"
                      }`}
                    >
                      {rating === 0 ? "Any" : `${rating}+`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Availability</p>
                <button
                  onClick={() => {
                    setInStockOnly((value) => !value);
                    setPage(1);
                  }}
                  className={`px-3 h-9 rounded-lg text-sm font-semibold transition-all ${
                    inStockOnly ? "bg-gradient-neon text-white" : "glass"
                  }`}
                >
                  In stock only
                </button>
              </div>

              {/* Sort By is always visible in the top bar; hidden here to avoid duplication */}
              <div className="hidden md:block">
                <p className="text-sm font-semibold mb-2">Sort By</p>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-9 px-3 rounded-lg glass text-sm bg-transparent outline-none"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-black text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={resetFilters}
              className="mt-4 text-xs text-secondary hover:text-secondary/80 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        )}
      </header>

      {/* Categories */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2 mask-fade">
        <CategoryChip
          active={!activeCategory}
          onClick={() => {
            setActiveCategory("");
            setPage(1);
          }}
          label="All"
        />
        {categories.map((category) => (
          <CategoryChip
            key={category.category_id}
            active={activeCategory === category.category_id}
            onClick={() => {
              setActiveCategory(category.category_id);
              setPage(1);
            }}
            label={`${category.name} (${category.count})`}
          />
        ))}
      </div>

      {brands.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-2 mask-fade">
          <CategoryChip
            active={!activeBrand}
            onClick={() => {
              setActiveBrand("");
              setPage(1);
            }}
            label="All brands"
          />
          {brands.map((brand) => (
            <CategoryChip
              key={brand.brand_id}
              active={activeBrand === brand.brand_id}
              onClick={() => {
                setActiveBrand(brand.brand_id);
                setPage(1);
              }}
              label={`${brand.name} (${brand.count})`}
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading && !result ? (
            // C2 — never flash "0 products" before the first response arrives.
            <span className="text-muted-foreground/70">Loading products…</span>
          ) : (
            <>
              {result?.total ?? 0} product{result?.total === 1 ? "" : "s"}
              {query ? ` for “${query}”` : ""}
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="h-8 px-2 rounded-lg glass text-xs bg-transparent outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-black text-white">
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="glass rounded-2xl p-6 mt-6 text-sm text-red-400">{error}</div>
      ) : loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground mt-6">
          No products match your filters.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={toProductCardProduct(product as unknown as SupabaseProduct)}
              href={`/product-details/${product.id}`}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page === 1}
            className="h-10 w-10 rounded-xl glass flex items-center justify-center disabled:opacity-40 hover:pink-glow transition-all"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1)
            .filter((value) => value === 1 || value === totalPages || Math.abs(value - page) <= 2)
            .reduce<(number | "...")[]>((accumulator, value, index, array) => {
              if (index > 0 && value - (array[index - 1] as number) > 1) accumulator.push("...");
              accumulator.push(value);
              return accumulator;
            }, [])
            .map((value, index) =>
              value === "..." ? (
                <span key={`dots-${index}`} className="text-muted-foreground px-1">
                  ...
                </span>
              ) : (
                <button
                  key={value}
                  onClick={() => setPage(value as number)}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-semibold transition-all ${
                    page === value ? "bg-gradient-neon text-white" : "glass hover:pink-glow"
                  }`}
                >
                  {value}
                </button>
              )
            )}

          <button
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page === totalPages}
            className="h-10 w-10 rounded-xl glass flex items-center justify-center disabled:opacity-40 hover:pink-glow transition-all"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Products() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProductsInner />
    </Suspense>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
        active ? "bg-gradient-neon text-white pink-glow" : "glass text-foreground/80 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
