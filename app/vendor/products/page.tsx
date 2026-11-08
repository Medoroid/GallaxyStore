"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { productImageUrlFromPath } from "@/lib/products";
import { MAX_PRODUCT_IMAGES } from "@/lib/product-admin";
import {
  validateProductImageFile,
} from "@/lib/product-image-upload";
import {
  Package,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Upload,
  Star,
  ArrowUp,
  ArrowDown,
  ImagePlus,
} from "lucide-react";
import Link from "next/link";

type Category = { id: string; name: string };

type ProductVariant = {
  id: string;
  price: number;
  stock_quantity: number;
  is_default?: boolean;
  is_active?: boolean;
  deleted_at?: string | null;
};

type ProductImage = {
  id: string;
  storage_path: string | null;
  alt_text?: string | null;
  is_primary: boolean;
  sort_order: number;
  public_url?: string;
};

type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  compare_at_price: number | null;
  currency?: string;
  avg_rating: number;
  status: string;
  visibility: string;
  color: string | null;
  available_colors: string[] | null;
  short_description: string | null;
  description: string | null;
  category_id: string | null;
  categories: { name: string } | null;
  product_images: ProductImage[] | null;
  default_variant: ProductVariant | null;
};

type FormState = {
  name: string;
  slug: string;
  category_id: string;
  base_price: string;
  compare_at_price: string;
  currency: string;
  status: "draft" | "published";
  visibility: "visible" | "hidden";
  stock_quantity: string;
  color: string;
  available_colors: string;
  short_description: string;
  description: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  category_id: "",
  base_price: "",
  compare_at_price: "",
  currency: "USD",
  status: "draft",
  visibility: "visible",
  stock_quantity: "0",
  color: "",
  available_colors: "",
  short_description: "",
  description: "",
};

function productToForm(product: Product): FormState {
  return {
    name: product.name ?? "",
    slug: product.slug ?? "",
    category_id: product.category_id ?? "",
    base_price: String(product.base_price ?? ""),
    compare_at_price:
      product.compare_at_price === null || product.compare_at_price === undefined
        ? ""
        : String(product.compare_at_price),
    currency: product.currency || "USD",
    status: product.status === "published" ? "published" : "draft",
    visibility: product.visibility === "hidden" ? "hidden" : "visible",
    stock_quantity: String(product.default_variant?.stock_quantity ?? 0),
    color: product.color ?? "",
    available_colors: (product.available_colors ?? []).join(", "),
    short_description: product.short_description ?? "",
    description: product.description ?? "",
  };
}

function sortProductImages(images: ProductImage[]) {
  return images
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || Number(b.is_primary) - Number(a.is_primary));
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-400/10 text-green-400",
  draft: "bg-yellow-400/10 text-yellow-400",
  archived: "bg-gray-400/10 text-gray-400",
};

export default function VendorProductsPage() {
  const { getToken } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [imageBusy, setImageBusy] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("Your session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/vendor/products", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load your products");
      }

      setProducts(data.products || []);
      setCategories(data.lookups?.categories || []);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to load your products"
      );
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const clearPendingImages = () => {
    setPendingImages((previous) => {
      for (const pending of previous) URL.revokeObjectURL(pending.previewUrl);
      return [];
    });
  };

  const openCreate = () => {
    clearPendingImages();
    setEditingId(null);
    setForm(EMPTY_FORM);
    setExistingImages([]);
    setAltDrafts({});
    setImageError(null);
    setMessage(null);
    setFormOpen(true);
  };

  const openEdit = (product: Product) => {
    const images = sortProductImages(product.product_images ?? []);
    clearPendingImages();
    setEditingId(product.id);
    setForm(productToForm(product));
    setExistingImages(images);
    setAltDrafts(
      Object.fromEntries(images.map((image) => [image.id, image.alt_text ?? ""]))
    );
    setImageError(null);
    setMessage(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    clearPendingImages();
    setFormOpen(false);
    setEditingId(null);
    setExistingImages([]);
    setAltDrafts({});
    setImageError(null);
    setMessage(null);
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setImageError(null);
    const available = MAX_PRODUCT_IMAGES - existingImages.length - pendingImages.length;
    if (available <= 0) {
      setImageError(`A product can have at most ${MAX_PRODUCT_IMAGES} images.`);
      return;
    }

    const accepted: PendingImage[] = [];
    for (const file of files.slice(0, available)) {
      const validation = validateProductImageFile({ type: file.type, size: file.size });
      if (!validation.ok) {
        setImageError(validation.message);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${accepted.length}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (files.length > available) {
      setImageError(`Only ${available} more image${available === 1 ? "" : "s"} can be added.`);
    }
    if (accepted.length > 0) {
      setPendingImages((previous) => [...previous, ...accepted]);
    }
  };

  const removePendingImage = (id: string) => {
    setPendingImages((previous) => {
      const target = previous.find((pending) => pending.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return previous.filter((pending) => pending.id !== id);
    });
  };

  const uploadPendingImages = async (productId: string) => {
    if (pendingImages.length === 0) return true;

    setImageBusy("upload");
    setImageError(null);
    try {
      const token = await getToken();
      if (!token) {
        setImageError("Your session expired. Please sign in again.");
        return false;
      }

      const body = new FormData();
      body.append("product_id", productId);
      for (const pending of pendingImages) {
        body.append("files", pending.file, pending.file.name);
      }

      const response = await fetch("/api/vendor/products/images", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Failed to upload images");
      }

      const uploaded = (payload.images ?? []) as ProductImage[];
      setExistingImages((previous) =>
        sortProductImages([...previous, ...uploaded])
      );
      setAltDrafts((previous) => {
        const next = { ...previous };
        for (const image of uploaded) next[image.id] = image.alt_text ?? "";
        return next;
      });
      clearPendingImages();
      return true;
    } catch (uploadError) {
      setImageError(
        uploadError instanceof Error ? uploadError.message : "Failed to upload images"
      );
      return false;
    } finally {
      setImageBusy(null);
    }
  };

  const setPrimaryImage = async (imageId: string) => {
    setImageBusy(`primary:${imageId}`);
    setImageError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch("/api/vendor/products/images", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "set_primary", image_id: imageId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Failed to set the primary image");
      }
      setExistingImages((previous) =>
        previous.map((image) => ({ ...image, is_primary: image.id === imageId }))
      );
    } catch (primaryError) {
      setImageError(
        primaryError instanceof Error ? primaryError.message : "Failed to set the primary image"
      );
    } finally {
      setImageBusy(null);
    }
  };

  const deleteImage = async (image: ProductImage) => {
    if (!window.confirm("Delete this image? This cannot be undone.")) return;

    setImageBusy(`delete:${image.id}`);
    setImageError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch(
        `/api/vendor/products/images?id=${encodeURIComponent(image.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Failed to delete the image");
      }

      setExistingImages((previous) => {
        const next = previous.filter((entry) => entry.id !== image.id);
        if (image.is_primary && next.length > 0) {
          next[0] = { ...next[0], is_primary: true };
        }
        return sortProductImages(next);
      });
      setAltDrafts((previous) => {
        const next = { ...previous };
        delete next[image.id];
        return next;
      });
    } catch (deleteError) {
      setImageError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete the image"
      );
    } finally {
      setImageBusy(null);
    }
  };

  const moveImage = async (imageId: string, direction: -1 | 1) => {
    const ordered = sortProductImages(existingImages);
    const index = ordered.findIndex((image) => image.id === imageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;

    const reordered = ordered.slice();
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const updates = reordered.map((image, position) => ({
      id: image.id,
      sort_order: position,
    }));

    setImageBusy(`reorder:${imageId}`);
    setImageError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");

      for (const update of updates) {
        const response = await fetch("/api/vendor/products/images", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "reorder",
            image_id: update.id,
            sort_order: update.sort_order,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || "Failed to reorder images");
        }
      }

      setExistingImages(
        reordered.map((image, position) => ({ ...image, sort_order: position }))
      );
    } catch (reorderError) {
      setImageError(
        reorderError instanceof Error ? reorderError.message : "Failed to reorder images"
      );
    } finally {
      setImageBusy(null);
    }
  };

  const saveAltText = async (image: ProductImage) => {
    const value = (altDrafts[image.id] ?? "").trim();
    if (value === (image.alt_text ?? "")) return;

    setImageBusy(`alt:${image.id}`);
    setImageError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch("/api/vendor/products/images", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "alt_text",
          image_id: image.id,
          alt_text: value,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Failed to save alt text");
      }
      setExistingImages((previous) =>
        previous.map((entry) =>
          entry.id === image.id ? { ...entry, alt_text: payload.alt_text ?? null } : entry
        )
      );
    } catch (altError) {
      setImageError(
        altError instanceof Error ? altError.message : "Failed to save alt text"
      );
    } finally {
      setImageBusy(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const name = form.name.trim();
    const basePrice = Number(form.base_price);

    if (!name) {
      setMessage({ type: "error", text: "Product name is required." });
      return;
    }
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      setMessage({ type: "error", text: "Enter a valid base price." });
      return;
    }
    if (form.compare_at_price && Number(form.compare_at_price) < 0) {
      setMessage({ type: "error", text: "Compare-at price cannot be negative." });
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ type: "error", text: "Your session expired. Please sign in again." });
        return;
      }

      const payload = {
        action: editingId ? "update" : "create",
        product_id: editingId || undefined,
        stock_quantity: form.stock_quantity,
        product: {
          name,
          slug: form.slug.trim() || undefined,
          category_id: form.category_id || null,
          base_price: basePrice,
          compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
          currency: form.currency.trim().toUpperCase() || "USD",
          status: form.status,
          visibility: form.visibility,
          color: form.color,
          available_colors: form.available_colors
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          short_description: form.short_description,
          description: form.description,
        },
      };

      const res = await fetch("/api/vendor/products", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save the product");
      }

      const savedId = String(data.product_id || editingId || "");
      if (savedId && pendingImages.length > 0) {
        const uploaded = await uploadPendingImages(savedId);
        if (!uploaded) {
          setEditingId(savedId);
          setMessage({
            type: "error",
            text: "The product was saved, but its images could not be uploaded. Retry with the Upload images button.",
          });
          return;
        }
      }

      setMessage({
        type: "success",
        text: editingId ? "Product updated." : "Product added.",
      });
      setFormOpen(false);
      setEditingId(null);
      setExistingImages([]);
      setAltDrafts({});
      setForm(EMPTY_FORM);
      await fetchProducts();
    } catch (saveError) {
      setMessage({
        type: "error",
        text: saveError instanceof Error ? saveError.message : "Failed to save the product",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (product: Product) => {
    if (!window.confirm(`Archive "${product.name}"? It will be removed from your store.`)) {
      return;
    }

    setArchivingId(product.id);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ type: "error", text: "Your session expired. Please sign in again." });
        return;
      }

      const res = await fetch("/api/vendor/products", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "archive", product_id: product.id }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to archive the product");
      }

      setMessage({ type: "success", text: `"${product.name}" archived.` });
      await fetchProducts();
    } catch (archiveError) {
      setMessage({
        type: "error",
        text:
          archiveError instanceof Error ? archiveError.message : "Failed to archive the product",
      });
    } finally {
      setArchivingId(null);
    }
  };

  const filtered = products.filter((product) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      product.name.toLowerCase().includes(term) ||
      product.slug.toLowerCase().includes(term) ||
      (product.categories?.name?.toLowerCase().includes(term) ?? false)
    );
  });

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-2xl p-6 animate-pulse">
            <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
            <div className="h-8 bg-white/[0.05] rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Products</h1>
          <p className="text-gray-400 mt-1">Manage your store listings</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 h-10 rounded-xl bg-gradient-neon text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-300">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </span>
          <button onClick={fetchProducts} className="underline hover:text-red-200">
            Retry
          </button>
        </div>
      )}

      {message && (
        <div
          className={`flex items-center gap-2 rounded-2xl p-4 text-sm ${
            message.type === "success"
              ? "border border-green-500/30 bg-green-950/30 text-green-300"
              : "border border-red-500/30 bg-red-950/30 text-red-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {message.text}
        </div>
      )}

      {formOpen && (
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              {editingId ? "Edit Product" : "New Product"}
            </h2>
            <button
              type="button"
              onClick={closeForm}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.05]"
              aria-label="Close product form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Name *</span>
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                required
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
                placeholder="Product name"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Slug (optional)</span>
              <input
                value={form.slug}
                onChange={(event) => updateField("slug", event.target.value)}
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
                placeholder="auto-generated-from-name"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Category</span>
              <select
                value={form.category_id}
                onChange={(event) => updateField("category_id", event.target.value)}
                className="w-full glass rounded-xl h-11 px-4 outline-none bg-transparent"
              >
                <option value="" className="bg-black">
                  Uncategorized
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id} className="bg-black">
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Stock quantity</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.stock_quantity}
                onChange={(event) => updateField("stock_quantity", event.target.value)}
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Base price *</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.base_price}
                onChange={(event) => updateField("base_price", event.target.value)}
                required
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Compare-at price</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.compare_at_price}
                onChange={(event) => updateField("compare_at_price", event.target.value)}
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Currency</span>
              <input
                value={form.currency}
                onChange={(event) => updateField("currency", event.target.value.toUpperCase())}
                maxLength={3}
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow uppercase"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Color</span>
              <input
                value={form.color}
                onChange={(event) => updateField("color", event.target.value)}
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
                placeholder="Black"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Available colors (comma separated)</span>
              <input
                value={form.available_colors}
                onChange={(event) => updateField("available_colors", event.target.value)}
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
                placeholder="Black, White"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  updateField("status", event.target.value as FormState["status"])
                }
                className="w-full glass rounded-xl h-11 px-4 outline-none bg-transparent"
              >
                <option value="draft" className="bg-black">
                  Draft
                </option>
                <option value="published" className="bg-black">
                  Published
                </option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-gray-300">Visibility</span>
              <select
                value={form.visibility}
                onChange={(event) =>
                  updateField("visibility", event.target.value as FormState["visibility"])
                }
                className="w-full glass rounded-xl h-11 px-4 outline-none bg-transparent"
              >
                <option value="visible" className="bg-black">
                  Visible
                </option>
                <option value="hidden" className="bg-black">
                  Hidden
                </option>
              </select>
            </label>
          </div>

          <label className="space-y-1 text-sm block">
            <span className="text-gray-300">Short description</span>
            <input
              value={form.short_description}
              onChange={(event) => updateField("short_description", event.target.value)}
              className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
            />
          </label>

          <label className="space-y-1 text-sm block">
            <span className="text-gray-300">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              rows={4}
              className="w-full glass rounded-xl p-4 outline-none focus:pink-glow resize-none"
            />
          </label>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-gray-300">Product images</p>
                <p className="text-xs text-gray-500">
                  Up to {MAX_PRODUCT_IMAGES} images. The primary image is used in listings.
                </p>
              </div>
              <label
                className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-white/[0.05] px-4 text-sm text-gray-300 transition-colors hover:text-white ${
                  imageBusy !== null ||
                  existingImages.length + pendingImages.length >= MAX_PRODUCT_IMAGES
                    ? "pointer-events-none opacity-50"
                    : ""
                }`}
              >
                <ImagePlus className="h-4 w-4" />
                Add images
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>

            {imageError && (
              <p className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" /> {imageError}
              </p>
            )}

            {existingImages.length === 0 && pendingImages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
                No images yet. Add at least one for a better storefront listing.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {sortProductImages(existingImages).map((image, index, list) => {
                  const url = productImageUrlFromPath(image.storage_path);
                  return (
                    <div key={image.id} className="glass space-y-2 rounded-xl p-2">
                      <div className="relative aspect-square overflow-hidden rounded-lg bg-black/30">
                        {url ? (
                          <Image
                            src={url}
                            alt={image.alt_text || "Product image"}
                            fill
                            sizes="(max-width: 768px) 50vw, 200px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-gray-600">
                            <ImagePlus className="h-8 w-8" />
                          </div>
                        )}
                        {image.is_primary && (
                          <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-black">
                            Primary
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => void setPrimaryImage(image.id)}
                          disabled={image.is_primary || imageBusy !== null}
                          className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${
                            image.is_primary
                              ? "text-emerald-300"
                              : "text-gray-400 hover:bg-white/[0.05] hover:text-white"
                          }`}
                          aria-label="Set as primary image"
                          title="Set as primary"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveImage(image.id, -1)}
                          disabled={index === 0 || imageBusy !== null}
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
                          aria-label="Move image up"
                          title="Move up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveImage(image.id, 1)}
                          disabled={index === list.length - 1 || imageBusy !== null}
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
                          aria-label="Move image down"
                          title="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteImage(image)}
                          disabled={imageBusy !== null}
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                          aria-label="Delete image"
                          title="Delete image"
                        >
                          {imageBusy === `delete:${image.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      <input
                        value={altDrafts[image.id] ?? ""}
                        onChange={(event) =>
                          setAltDrafts((previous) => ({
                            ...previous,
                            [image.id]: event.target.value,
                          }))
                        }
                        onBlur={() => void saveAltText(image)}
                        maxLength={300}
                        placeholder="Alt text (optional)"
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-white outline-none placeholder:text-gray-600 focus:border-emerald-400/50"
                      />
                    </div>
                  );
                })}

                {pendingImages.map((pending) => (
                  <div
                    key={pending.id}
                    className="glass space-y-2 rounded-xl border border-dashed border-emerald-400/30 p-2"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-black/30">
                      <Image
                        src={pending.previewUrl}
                        alt="Selected product image"
                        fill
                        sizes="(max-width: 768px) 50vw, 200px"
                        className="object-cover"
                        unoptimized
                      />
                      <span className="absolute left-2 top-2 rounded-full bg-emerald-400/90 px-2 py-0.5 text-[10px] font-bold text-black">
                        New
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingImage(pending.id)}
                      disabled={imageBusy !== null}
                      className="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {pendingImages.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-xs text-gray-500">
                  {editingId
                    ? "Upload now, or they will be uploaded when you save."
                    : "These images will be uploaded after the product is created."}
                </p>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => void uploadPendingImages(editingId)}
                    disabled={imageBusy !== null}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-500 px-3 text-xs font-medium text-black transition-colors hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {imageBusy === "upload" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Upload images
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeForm}
              className="h-10 px-5 rounded-xl bg-white/[0.05] text-gray-300 hover:text-white text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-xl bg-gradient-neon text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? "Save changes" : "Add product"}
            </button>
          </div>
        </form>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products..."
          className="w-full glass rounded-2xl h-12 pl-11 pr-4 outline-none focus:pink-glow transition-all placeholder:text-gray-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">
            {products.length === 0 ? "You have not added any products yet." : "No products found"}
          </p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Product
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Category
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Price
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Stock
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Status
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((product) => {
                  const status = product.status === "published" ? "published" : "draft";
                  const stock = product.default_variant?.stock_quantity ?? 0;
                  return (
                    <tr key={product.id} className="hover:bg-white/[0.02]">
                      <td className="p-4">
                        <span className="text-sm font-medium text-white">{product.name}</span>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs text-yellow-400">★</span>
                          <span className="text-xs text-gray-400">
                            {(product.avg_rating || 0).toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-gray-400">
                          {product.categories?.name || "—"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm font-semibold text-white">
                          {formatCurrency(product.base_price, product.currency)}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span
                          className={`text-sm font-medium ${
                            stock < 10 ? "text-yellow-400" : "text-gray-400"
                          }`}
                        >
                          {stock}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            STATUS_STYLES[status] ?? STATUS_STYLES.archived
                          }`}
                        >
                          {status === "published" ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/product-details/${product.id}`}
                            className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-white transition-colors"
                            aria-label={`View ${product.name}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => openEdit(product)}
                            className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-white transition-colors"
                            aria-label={`Edit ${product.name}`}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleArchive(product)}
                            disabled={archivingId === product.id}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                            aria-label={`Archive ${product.name}`}
                          >
                            {archivingId === product.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
