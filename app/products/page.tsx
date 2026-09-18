"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import useProducts from "../hooks/useProducts";
import Spinner from "../components/spinner";
import { toProductCardProduct } from "@/lib/products";

const ITEMS_PER_PAGE = 12;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "rating", label: "Top Rated" },
  { value: "name-asc", label: "Name: A → Z" },
];

type Facet = { name: string; slug: string; count: number };

export default function Products() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [minRating, setMinRating] = useState(0);
  const [facets, setFacets] = useState<Facet[]>([]);
  const { isLoading, data, error } = useProducts();

  // Fetch facets from search API
  useEffect(() => {
    const fetchFacets = async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=facets`);
        const result = await res.json();
        if (result.success && result.facets?.categories) {
          setFacets(result.facets.categories);
        }
      } catch {
        // ignore - will use local categories
      }
    };
    fetchFacets();
  }, [query]);

  const categories = useMemo(() => {
    // Prefer API facets if available, fallback to local data
    if (facets.length > 0) {
      return facets.map((f) => ({ slug: f.slug, name: f.name }));
    }
    const map = new Map<string, string>();
    data?.forEach((product) => {
      if (product.categories?.slug && product.categories?.name) {
        map.set(product.categories.slug, product.categories.name);
      }
    });
    return Array.from(map, ([slug, name]) => ({ slug, name }));
  }, [data, facets]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    let results = (data ?? []).filter((product) => {
      const categorySlug = product.categories?.slug ?? "";
      const matchCat = active === "all" || categorySlug === active;
      const matchQuery =
        !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.description?.toLowerCase().includes(normalizedQuery) ||
        product.categories?.name?.toLowerCase().includes(normalizedQuery);
      const price = Number(product.base_price ?? 0);
      const matchPrice = price >= priceRange[0] && price <= priceRange[1];
      const rating = Number(product.avg_rating ?? 0);
      const matchRating = rating >= minRating;

      return matchCat && matchQuery && matchPrice && matchRating;
    });

    // Sort
    results = [...results].sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return Number(a.base_price ?? 0) - Number(b.base_price ?? 0);
        case "price-desc":
          return Number(b.base_price ?? 0) - Number(a.base_price ?? 0);
        case "rating":
          return Number(b.avg_rating ?? 0) - Number(a.avg_rating ?? 0);
        case "name-asc":
          return (a.name ?? "").localeCompare(b.name ?? "");
        case "newest":
        default:
          return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      }
    });

    return results;
  }, [query, active, sort, data, priceRange, minRating]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Reset page when filters change
  const resetPage = useCallback(() => setPage(1), []);

  // Debounced search with API suggestions
  const [suggestions, setSuggestions] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=suggestions`);
        const result = await res.json();
        if (result.success) {
          setSuggestions(result.suggestions || []);
        }
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (error) {
    return <div className="text-red-500">Error: {error.message}</div>;
  }

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
              value={query}
              onChange={(e) => { setQuery(e.target.value); resetPage(); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Search products..."
              className="w-full glass rounded-2xl h-12 pl-11 pr-4 outline-none focus:pink-glow transition-all placeholder:text-muted-foreground"
            />
            {/* Search Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 glass rounded-2xl p-2 z-50 shadow-xl">
                {suggestions.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setQuery(s.name); setShowSuggestions(false); resetPage(); }}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="text-sm font-medium text-white">{s.name}</span>
                    <span className="text-xs text-gray-500 block">{s.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-2 px-5 h-12 rounded-2xl font-medium transition-all ${
              showFilters ? "bg-gradient-neon text-white" : "glass hover:pink-glow"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 glass rounded-2xl p-5 animate-fade-in-up">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Price Range */}
              <div>
                <p className="text-sm font-semibold mb-2">Price Range</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={priceRange[0]}
                    onChange={(e) => { setPriceRange([Number(e.target.value), priceRange[1]]); resetPage(); }}
                    className="w-20 h-9 px-2 rounded-lg glass text-sm outline-none"
                    min={0}
                    placeholder="Min"
                  />
                  <span className="text-muted-foreground">—</span>
                  <input
                    type="number"
                    value={priceRange[1]}
                    onChange={(e) => { setPriceRange([priceRange[0], Number(e.target.value)]); resetPage(); }}
                    className="w-20 h-9 px-2 rounded-lg glass text-sm outline-none"
                    min={0}
                    placeholder="Max"
                  />
                </div>
              </div>

              {/* Min Rating */}
              <div>
                <p className="text-sm font-semibold mb-2">Minimum Rating</p>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      onClick={() => { setMinRating(r); resetPage(); }}
                      className={`px-3 h-9 rounded-lg text-sm font-semibold transition-all ${
                        minRating === r ? "bg-gradient-neon text-white" : "glass"
                      }`}
                    >
                      {r === 0 ? "Any" : `${r}+`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div>
                <p className="text-sm font-semibold mb-2">Sort By</p>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg glass text-sm bg-transparent outline-none"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-black text-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => { setPriceRange([0, 1000]); setMinRating(0); setSort("newest"); resetPage(); }}
              className="mt-4 text-xs text-secondary hover:text-secondary/80 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        )}
      </header>

      {/* Categories */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2 mask-fade">
        <CategoryChip active={active === "all"} onClick={() => { setActive("all"); resetPage(); }} label="All" />
        {categories.map((c) => (
          <CategoryChip key={c.slug} active={active === c.slug} onClick={() => { setActive(c.slug); resetPage(); }} label={c.name} />
        ))}
      </div>

      {/* Sort Bar (mobile) */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} product{filtered.length !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-8 px-2 rounded-lg glass text-xs bg-transparent outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-black text-white">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <Spinner />
      ) : paginated.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground mt-6">
          No products match your filters.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {paginated.map((product) => (
            <ProductCard key={product.id} product={toProductCardProduct(product)} href={`/product-details/${product.id}`} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="h-10 w-10 rounded-xl glass flex items-center justify-center disabled:opacity-40 hover:pink-glow transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | "...")[]>((acc, p, i, arr) => {
              if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "..." ? (
                <span key={`dots-${i}`} className="text-muted-foreground px-1">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-semibold transition-all ${
                    page === p ? "bg-gradient-neon text-white" : "glass hover:pink-glow"
                  }`}
                >
                  {p}
                </button>
              )
            )}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="h-10 w-10 rounded-xl glass flex items-center justify-center disabled:opacity-40 hover:pink-glow transition-all"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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
