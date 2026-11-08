"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Package, Plus, Edit, Trash2, Loader2, X, Save,
  Search, ChevronDown, ChevronUp, Star,
  Tag, Globe, BarChart3, Image as ImageIcon, Upload, XCircle
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  productToForm,
  productImageUrl,
  type ProductFormValues,
  type ProductLookup,
  type SupabaseProduct,
} from "@/lib/products";

type AdminProduct = SupabaseProduct & {
  default_variant?: { id: string; price: number; stock_quantity: number } | null;
};

type ProductImage = {
  id: string;
  storage_path: string | null;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
};

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
  stock_quantity: "100",
};

export default function AdminProductsPage() {
  const { getToken } = useAuth();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    images: true,
    pricing: true,
    physical: false,
    seo: false,
    specs: false,
  });

  const [form, setForm] = useState<ProductFormValues>(EMPTY_FORM);
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [secondaryImages, setSecondaryImages] = useState<File[]>([]);
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const secondaryImagesInputRef = useRef<HTMLInputElement>(null);

  // Lookup data
  const [categories, setCategories] = useState<ProductLookup[]>([]);
  const [brands, setBrands] = useState<ProductLookup[]>([]);
  const [stores, setStores] = useState<ProductLookup[]>([]);

  const loadProducts = useCallback(async () => {
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/products", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not load products.");
        return;
      }
      setProducts(data.products as AdminProduct[]);
      setCategories(data.lookups?.categories ?? []);
      setBrands(data.lookups?.brands ?? []);
      setStores(data.lookups?.stores ?? []);
    } catch {
      setError("Network error while loading products.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleOpenModal = useCallback(async (product?: AdminProduct) => {
    if (product) {
      setEditingProduct(product);
      const variant = product.default_variant
        ? {
            id: product.default_variant.id,
            price: Number(product.default_variant.price),
            stock_quantity: Number(product.default_variant.stock_quantity),
          }
        : null;
      setForm(productToForm(product, variant));
    } else {
      setEditingProduct(null);
      setForm(EMPTY_FORM);
    }
    setMainImage(null);
    setSecondaryImages([]);
    setError("");
    setShowModal(true);
  }, []);

  const handleMainImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setMainImage(e.target.files[0]);
    }
  };

  const handleSecondaryImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSecondaryImages((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeSecondaryImage = (index: number) => {
    setSecondaryImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.name || !form.base_price) {
      setError("Product name and base price are required.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const token = await getToken();
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: editingProduct ? "update" : "create",
          product_id: editingProduct?.id,
          product: form,
          stock_quantity: form.stock_quantity,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not save the product.");
        return;
      }

      const productId = data.product_id as string;

      if (mainImage || secondaryImages.length > 0) {
        const imageForm = new FormData();
        imageForm.append("product_id", productId);
        imageForm.append("is_primary", mainImage ? "true" : "false");
        if (mainImage) imageForm.append("files", mainImage);
        secondaryImages.forEach((file) => imageForm.append("files", file));

        const imageRes = await fetch("/api/admin/products/images", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: imageForm,
        });
        const imageData = await imageRes.json().catch(() => null);
        if (!imageRes.ok || !imageData?.success) {
          await loadProducts();
          setError(
            imageData?.message ||
              "The product was saved, but its images could not be uploaded. Try uploading them again."
          );
          return;
        }
      }

      setShowModal(false);
      await loadProducts();
    } catch {
      setError("Network error while saving the product.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm("Are you sure you want to archive this product?")) return;

    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "archive", product_id: productId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not archive the product.");
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch {
      setError("Network error while archiving the product.");
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm("Delete this image?")) return;
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/products/images?id=${encodeURIComponent(imageId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not delete the image.");
        return;
      }
      await loadProducts();
      setEditingProduct((prev) =>
        prev
          ? {
              ...prev,
              product_images: (prev.product_images || []).filter((image) => image.id !== imageId),
            }
          : prev
      );
    } catch {
      setError("Network error while deleting the image.");
    }
  };

  const handleSetPrimaryImage = async (imageId: string) => {
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/products/images", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image_id: imageId, action: "set_primary" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not set the primary image.");
        return;
      }
      await loadProducts();
      setEditingProduct((prev) =>
        prev
          ? {
              ...prev,
              product_images: (prev.product_images || []).map((image) => ({
                ...image,
                is_primary: image.id === imageId,
              })),
            }
          : prev
      );
    } catch {
      setError("Network error while updating the image.");
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

  const getProductImage = (product: AdminProduct) => productImageUrl(product);

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

      {error && (
        <div className="glass rounded-2xl p-4 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

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
                      <span className="text-[#FF4FD8] font-bold">
                        {formatCurrency(Number(product.base_price), product.currency)}
                      </span>
                      {product.compare_at_price && (
                        <span className="text-gray-500 text-sm line-through">
                          {formatCurrency(Number(product.compare_at_price), product.currency)}
                        </span>
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
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-[#111116] border border-white/10 shadow-2xl rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
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
              {/* Images Section */}
              <SectionHeader
                title="Product Images"
                icon={<ImageIcon className="w-4 h-4" />}
                expanded={expandedSections.images}
                onToggle={() => toggleSection("images")}
              />
              {expandedSections.images && (
                <div className="space-y-4 pl-1">
                  {editingProduct && (editingProduct.product_images?.length ?? 0) > 0 && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-1.5">
                        Current Images
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {(editingProduct.product_images as ProductImage[])
                          .slice()
                          .sort(
                            (a, b) =>
                              Number(b.is_primary) - Number(a.is_primary) ||
                              a.sort_order - b.sort_order
                          )
                          .map((image) => {
                            const url = productImageUrl({
                              product_images: [image],
                            } as Partial<SupabaseProduct>);
                            return (
                              <div
                                key={image.id}
                                className="relative group rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={image.alt_text || "Product"} className="w-full h-24 object-cover" />
                                {image.is_primary && (
                                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-[#FF4FD8] text-[10px] text-white font-bold">
                                    Primary
                                  </span>
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  {!image.is_primary && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetPrimaryImage(image.id)}
                                      className="px-2 py-1 rounded bg-white/20 text-xs text-white"
                                      title="Set as primary"
                                    >
                                      <Star className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteImage(image.id)}
                                    className="px-2 py-1 rounded bg-red-500/40 text-xs text-white"
                                    title="Delete image"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Main Image <span className="text-[#FF4FD8]">*</span></label>
                    <div 
                      onClick={() => mainImageInputRef.current?.click()}
                      className="border-2 border-dashed border-white/20 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#FF4FD8]/50 hover:bg-white/[0.02] transition-colors"
                    >
                      {mainImage ? (
                        <div className="flex flex-col items-center gap-2">
                          <ImageIcon className="w-8 h-8 text-[#FF4FD8]" />
                          <span className="text-sm text-white font-medium">{mainImage.name}</span>
                          <span className="text-xs text-gray-400">Click to replace</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-8 h-8 text-gray-500" />
                          <span className="text-sm text-gray-400">Upload the primary image</span>
                          <span className="text-xs text-gray-500">PNG, JPG, WEBP up to 5MB</span>
                        </div>
                      )}
                      <input 
                        type="file" 
                        ref={mainImageInputRef} 
                        onChange={handleMainImageChange} 
                        accept="image/*" 
                        className="hidden" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Additional Images</label>
                    <div 
                      onClick={() => secondaryImagesInputRef.current?.click()}
                      className="border-2 border-dashed border-white/20 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#FF4FD8]/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <Upload className="w-6 h-6 text-gray-500 mb-2" />
                      <span className="text-sm text-gray-400">Upload multiple images</span>
                      <input 
                        type="file" 
                        ref={secondaryImagesInputRef} 
                        onChange={handleSecondaryImagesChange} 
                        accept="image/*" 
                        multiple 
                        className="hidden" 
                      />
                    </div>
                    {secondaryImages.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                        {secondaryImages.map((img, idx) => (
                          <div key={idx} className="relative group bg-white/[0.03] border border-white/[0.08] rounded-xl p-2 flex items-center justify-center">
                            <span className="text-xs text-gray-400 truncate w-full text-center px-2">{img.name}</span>
                            <button
                              onClick={() => removeSecondaryImage(idx)}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                    <FormField label="Stock Quantity">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={form.stock_quantity}
                        onChange={(e) => updateForm("stock_quantity", e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="100"
                      />
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
