"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package, Plus, Edit, Trash2, Loader2, X, Save,
  Search, ChevronDown, ChevronUp, Eye, EyeOff, Star,
  Ruler, Tag, Globe, BarChart3,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { createClient } from "@supabase/supabase-js";
import {
  createProduct,
  updateProduct,
  archiveProduct,
  fetchProductLookups,
  productToForm,
  type ProductFormValues,
  type ProductLookup,
  type SupabaseProduct,
} from "@/lib/products";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const EMPTY_FORM: ProductFormValues = {
  name: "",
  slug: "",
  category_id: "",
  brand_id: "",
  store_id: "",
  short_description: "",
  description: "",
  status: "draft",
  visibility: "visible",
  is_featured: false,
  base_price: "",
  compare_at_price: "",
  currency: "USD",
  color: "",
  available_colors: "",
};

export default function AdminProductsPage() {
  const { getToken } = useAuth();
  const [products, setProducts] = useState<SupabaseProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<SupabaseProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    pricing: true,
    physical: false,
    seo: false,
    specs: false,
  });

  const [form, setForm] = useState<ProductFormValues>(EMPTY_FORM);

  // Lookup data
  const [categories, setCategories] = useState<ProductLookup[]>([]);
  const [brands, setBrands] = useState<ProductLookup[]>([]);
  const [stores, setStores] = useState<ProductLookup[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [lookupsResult, productsResult] = await Promise.all([
          fetchProductLookups(),
          supabase
            .from("products")
            .select(`
              *,
              categories(id, name, slug),
              brands(id, name, slug),
              stores(id, name),
              product_images(id, storage_path, alt_text, is_primary, sort_order)
            `)
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
        ]);

        if (!cancelled) {
          setCategories(lookupsResult.categories);
          setBrands(lookupsResult.brands);
          setStores(lookupsResult.stores);
          if (!productsResult.error && productsResult.data) {
            setProducts(productsResult.data as unknown as SupabaseProduct[]);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleOpenModal = useCallback((product?: SupabaseProduct) => {
    if (product) {
      setEditingProduct(product);
      setForm(productToForm(product));
    } else {
      setEditingProduct(null);
      setForm(EMPTY_FORM);
    }
    setShowModal(true);
  }, []);

  const handleSave = async () => {
    if (!form.name || !form.base_price) return;
    setSaving(true);

    try {
      const _token = await getToken();

      if (editingProduct) {
        await updateProduct(editingProduct.id, form);
        // Refresh product data
        const { data } = await supabase
          .from("products")
          .select(`
            *,
            categories(id, name, slug),
            brands(id, name, slug),
            stores(id, name),
            product_images(id, storage_path, alt_text, is_primary, sort_order)
          `)
          .eq("id", editingProduct.id)
          .single();

        if (data) {
          setProducts((prev) =>
            prev.map((p) => (p.id === editingProduct.id ? (data as unknown as SupabaseProduct) : p))
          );
        }
      } else {
        await createProduct(form);
        // Refresh products list
        const { data } = await supabase
          .from("products")
          .select(`
            *,
            categories(id, name, slug),
            brands(id, name, slug),
            stores(id, name),
            product_images(id, storage_path, alt_text, is_primary, sort_order)
          `)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (data) {
          setProducts(data as unknown as SupabaseProduct[]);
        }
      }

      setShowModal(false);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;

    try {
      await archiveProduct(productId);
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch {
      // ignore
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const updateForm = (field: keyof ProductFormValues, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.categories?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.brands?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const getProductImage = (product: SupabaseProduct) => {
    const primary = product.product_images
      ?.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
      .find((img) => img.storage_path);
    return primary?.storage_path || null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Products</h1>
          <p className="text-gray-400 mt-1">{products.length} products total</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] rounded-xl text-white font-semibold hover:shadow-[0_0_20px_rgba(255,79,216,0.3)] transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {/* Search */}
      <div className="glass rounded-2xl p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, category, or brand..."
            className="w-full pl-12 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FD8]/50 transition-colors"
          />
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-4 animate-pulse">
              <div className="aspect-square bg-white/[0.05] rounded-xl mb-4" />
              <div className="h-4 bg-white/[0.05] rounded w-2/3 mb-2" />
              <div className="h-3 bg-white/[0.05] rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => {
            const imageUrl = getProductImage(product);
            return (
              <div key={product.id} className="glass rounded-2xl overflow-hidden group">
                <div className="aspect-square bg-white/[0.03] relative">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-gray-600" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1">
                    {product.is_featured && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] text-white">
                        Featured
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      product.status === "published" ? "bg-green-500/20 text-green-400" :
                      product.status === "draft" ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>
                      {product.status}
                    </span>
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                      onClick={() => handleOpenModal(product)}
                      className="p-3 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"
                    >
                      <Edit className="w-5 h-5 text-white" />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="p-3 bg-red-500/20 rounded-xl hover:bg-red-500/30 transition-colors"
                    >
                      <Trash2 className="w-5 h-5 text-red-400" />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-white truncate">{product.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    {product.categories?.name && <span>{product.categories.name}</span>}
                    {product.categories?.name && product.brands?.name && <span>·</span>}
                    {product.brands?.name && <span>{product.brands.name}</span>}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[#FF4FD8] font-bold">${product.base_price}</span>
                      {product.compare_at_price && (
                        <span className="text-gray-500 text-sm line-through">${product.compare_at_price}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Star className="w-3 h-3" />
                      {product.avg_rating} ({product.rating_count})
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowModal(false)} />
          <div className="relative glass rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingProduct ? "Edit Product" : "Add Product"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl hover:bg-white/[0.05] text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Basic Info Section */}
              <SectionHeader
                title="Basic Information"
                icon={<Package className="w-4 h-4" />}
                expanded={expandedSections.basic}
                onToggle={() => toggleSection("basic")}
              />
              {expandedSections.basic && (
                <div className="space-y-4 pl-1">
                  <FormField label="Product Name" required>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => updateForm("name", e.target.value)}
                      className={INPUT_CLASS}
                      placeholder="e.g., Galaxy Custom T-Shirt"
                    />
                  </FormField>

                  <FormField label="Slug">
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => updateForm("slug", e.target.value)}
                      className={INPUT_CLASS}
                      placeholder="auto-generated-from-name"
                    />
                  </FormField>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Category">
                      <select
                        value={form.category_id}
                        onChange={(e) => updateForm("category_id", e.target.value)}
                        className={INPUT_CLASS}
                      >
                        <option value="">Select category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Brand">
                      <select
                        value={form.brand_id}
                        onChange={(e) => updateForm("brand_id", e.target.value)}
                        className={INPUT_CLASS}
                      >
                        <option value="">Select brand</option>
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </FormField>
                  </div>

                  <FormField label="Store">
                    <select
                      value={form.store_id}
                      onChange={(e) => updateForm("store_id", e.target.value)}
                      className={INPUT_CLASS}
                    >
                      <option value="">Select store</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Short Description">
                    <input
                      type="text"
                      value={form.short_description}
                      onChange={(e) => updateForm("short_description", e.target.value)}
                      className={INPUT_CLASS}
                      placeholder="Brief product summary"
                    />
                  </FormField>

                  <FormField label="Full Description">
                    <textarea
                      value={form.description}
                      onChange={(e) => updateForm("description", e.target.value)}
                      rows={4}
                      className={`${INPUT_CLASS} resize-none`}
                      placeholder="Detailed product description..."
                    />
                  </FormField>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Status">
                      <select
                        value={form.status}
                        onChange={(e) => updateForm("status", e.target.value)}
                        className={INPUT_CLASS}
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                    </FormField>
                    <FormField label="Visibility">
                      <select
                        value={form.visibility}
                        onChange={(e) => updateForm("visibility", e.target.value)}
                        className={INPUT_CLASS}
                      >
                        <option value="visible">Visible</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </FormField>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="is_featured"
                      checked={form.is_featured}
                      onChange={(e) => updateForm("is_featured", e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/[0.03] text-[#FF4FD8] focus:ring-[#FF4FD8]/50"
                    />
                    <label htmlFor="is_featured" className="text-sm text-gray-400 flex items-center gap-1">
                      <Star className="w-3 h-3" /> Featured Product
                    </label>
                  </div>
                </div>
              )}

              {/* Pricing Section */}
              <SectionHeader
                title="Pricing"
                icon={<BarChart3 className="w-4 h-4" />}
                expanded={expandedSections.pricing}
                onToggle={() => toggleSection("pricing")}
              />
              {expandedSections.pricing && (
                <div className="space-y-4 pl-1">
                  <div className="grid grid-cols-3 gap-4">
                    <FormField label="Base Price" required>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.base_price}
                        onChange={(e) => updateForm("base_price", e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="0.00"
                      />
                    </FormField>
                    <FormField label="Compare at Price">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.compare_at_price}
                        onChange={(e) => updateForm("compare_at_price", e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="0.00"
                      />
                    </FormField>
                    <FormField label="Currency">
                      <select
                        value={form.currency}
                        onChange={(e) => updateForm("currency", e.target.value)}
                        className={INPUT_CLASS}
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="SAR">SAR</option>
                        <option value="AED">AED</option>
                        <option value="EGP">EGP</option>
                      </select>
                    </FormField>
                  </div>
                </div>
              )}

              {/* Colors Section */}
              <SectionHeader
                title="Colors"
                icon={<Tag className="w-4 h-4" />}
                expanded={expandedSections.physical}
                onToggle={() => toggleSection("physical")}
              />
              {expandedSections.physical && (
                <div className="space-y-4 pl-1">
                  <FormField label="Primary Color">
                    <input
                      type="text"
                      value={form.color}
                      onChange={(e) => updateForm("color", e.target.value)}
                      className={INPUT_CLASS}
                      placeholder="e.g., Black, White, Silver"
                    />
                  </FormField>
                  <FormField label="Available Colors (comma separated)">
                    <input
                      type="text"
                      value={form.available_colors}
                      onChange={(e) => updateForm("available_colors", e.target.value)}
                      className={INPUT_CLASS}
                      placeholder="e.g., Black, White, Silver, Gold"
                    />
                  </FormField>
                </div>
              )}

              {/* SEO Section */}
              <SectionHeader
                title="SEO"
                icon={<Globe className="w-4 h-4" />}
                expanded={expandedSections.seo}
                onToggle={() => toggleSection("seo")}
              />
              {expandedSections.seo && (
                <div className="space-y-4 pl-1">
                  <FormField label="SEO Title">
                    <input
                      type="text"
                      value={form.slug ? form.slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : form.name}
                      className={INPUT_CLASS}
                      placeholder="auto-generated"
                      readOnly
                    />
                  </FormField>
                  <FormField label="SEO Description">
                    <textarea
                      value={form.short_description || form.description || ""}
                      className={`${INPUT_CLASS} resize-none`}
                      rows={2}
                      placeholder="auto-generated from description"
                      readOnly
                    />
                  </FormField>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/[0.1] transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.base_price}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] text-white font-semibold hover:shadow-[0_0_20px_rgba(255,79,216,0.3)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingProduct ? "Update" : "Create"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const INPUT_CLASS =
  "w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FD8]/50 transition-colors text-sm";

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">
        {label} {required && <span className="text-[#FF4FD8]">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({
  title,
  icon,
  expanded,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        {icon}
        {title}
      </div>
      {expanded ? (
        <ChevronUp className="w-4 h-4 text-gray-400" />
      ) : (
        <ChevronDown className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );
}
