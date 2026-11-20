"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { useAdminT } from "@/lib/admin-i18n";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  emptyProductForm,
  formToProductPayload,
  productImageUrlFromPath,
  productToForm,
  type ProductFormValues,
} from "@/lib/products";
import { computeContentsValue, MAX_COMPONENT_QUANTITY } from "@/lib/gift-box";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Gift,
  ImagePlus,
  Link2,
  Loader2,
  Package,
  Plus,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";

/**
 * Admin Gift Boxes — every box is a normal `products` row (created through the
 * same product payload rules) plus a `gift_boxes` marker and its
 * `gift_box_items` composition.
 *
 *  - Method 1: "Create new product for this box" posts to the EXISTING
 *    /api/admin/products create endpoint (identical validation/business logic)
 *    and then links the product into the composition.
 *  - Method 2: searchable picker with category/availability filters via
 *    GET /api/admin/products?exclude_boxes=1 (no nesting).
 *  - All money math uses the shared lib/gift-box helpers (no fabricated
 *    savings: mixed currencies render as "unavailable").
 *  - A missing migration (503 GIFT_BOX_SCHEMA_PENDING) shows the apply banner
 *    instead of failing the page.
 */

type Lookup = { id: string; name: string; slug?: string };
type Lookups = { categories: Lookup[]; brands: Lookup[]; stores: Lookup[] };

type BoxImage = {
  id: string;
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
};

type ContentsItem = {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  display_order: number;
  note: string | null;
  is_active: boolean;
  product: {
    id: string;
    name: string;
    slug: string;
    status: string;
    visibility: string;
    deleted_at: string | null;
    currency?: string;
    publicly_accessible?: boolean;
  } | null;
  variant: {
    id: string;
    sku?: string;
    price?: number;
    label?: string;
    is_active?: boolean;
    deleted_at?: string | null;
  } | null;
  stock: number | null;
  unit_price: number;
  available: boolean;
  image?: string | null;
};

type GiftBoxRow = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  status: string;
  visibility: string;
  currency: string;
  base_price: number;
  compare_at_price: number | null;
  category_id: string | null;
  brand_id: string | null;
  store_id: string | null;
  deleted_at: string | null;
  categories: Lookup | null;
  brands: Lookup | null;
  stores: Lookup | null;
  default_variant: { id: string; stock_quantity?: number } | null;
  contents: ContentsItem[];
  contents_value: number | null;
  savings: number | null;
  image: string | null;
  images: BoxImage[];
};

type PickerProduct = {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  currency: string;
  status: string;
  product_images: { storage_path: string; is_primary?: boolean }[];
  default_variant: { id: string; sku?: string; stock_quantity?: number } | null;
  variants: {
    id: string;
    sku?: string;
    price: number;
    stock_quantity: number;
    is_default: boolean;
  }[];
};

const FIELD =
  "w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-gray-600 focus:border-[var(--brand)] focus:outline-none";
const LABEL = "block text-xs text-gray-400 mb-1";
const BTN_PRIMARY =
  "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white text-sm font-medium transition-opacity disabled:opacity-50";
const BTN_GHOST =
  "inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-gray-300 text-sm hover:bg-white/[0.08] transition-colors";

function statusBadgeClass(status: string) {
  if (status === "published") return "bg-green-500/10 text-green-400";
  if (status === "archived") return "bg-red-500/10 text-red-400";
  return "bg-yellow-500/10 text-yellow-400";
}

export default function AdminGiftBoxesPage() {
  const { getToken } = useAuth();
  const { t } = useAdminT();

  const [boxes, setBoxes] = useState<GiftBoxRow[]>([]);
  const [lookups, setLookups] = useState<Lookups>({
    categories: [],
    brands: [],
    stores: [],
  });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [schemaPending, setSchemaPending] = useState(false);

  const [mode, setMode] = useState<"list" | "edit">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormValues>(emptyProductForm);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);

  const authHeaders = useCallback(
    async (json = true) => {
      const token = await getToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (json) headers["Content-Type"] = "application/json";
      return headers;
    },
    [getToken]
  );

  const fetchBoxes = useCallback(async () => {
    setListError("");
    try {
      const res = await fetch("/api/admin/gift-boxes", {
        headers: await authHeaders(false),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 503 && data?.code === "GIFT_BOX_SCHEMA_PENDING") {
        setSchemaPending(true);
        return;
      }
      if (!res.ok || !data?.success) {
        setListError(data?.message || "Could not load gift boxes.");
        return;
      }
      setSchemaPending(false);
      setBoxes(data.boxes || []);
      if (data.lookups) setLookups(data.lookups);
    } catch {
      setListError("Network error while loading gift boxes.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchBoxes();
  }, [fetchBoxes]);

  const selected = selectedId ? boxes.find((box) => box.id === selectedId) ?? null : null;
  const contents = selected?.contents ?? [];

  // Load the form when switching to a box (or starting a new one).
  useEffect(() => {
    if (mode !== "edit") return;
    if (selected) {
      setForm(productToForm(selected as never, selected.default_variant as never));
    }
    setActionError("");
  }, [mode, selected]);

  const startCreate = () => {
    setForm({ ...emptyProductForm, status: "draft", visibility: "visible" });
    setSelectedId(null);
    setActionError("");
    setMode("edit");
  };

  const backToList = () => {
    setMode("list");
    setSelectedId(null);
    setActionError("");
  };

  const setField = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ---------------------------------------------------------------- save ----
  const saveBox = async () => {
    setActionError("");
    if (!form.name.trim() || !form.base_price) {
      setActionError(t("giftbox.form.needCreate"));
      return;
    }
    setSaving(true);
    try {
      const isCreate = !selectedId;
      const res = await fetch("/api/admin/gift-boxes", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          action: isCreate ? "create_box" : "update_box",
          product_id: selectedId ?? undefined,
          product: formToProductPayload(form),
          stock_quantity: Number(form.stock_quantity || 0),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setActionError(data?.message || "Could not save the gift box.");
        return;
      }
      await fetchBoxes();
      if (isCreate) setSelectedId(data.product_id);
    } catch {
      setActionError("Network error while saving the gift box.");
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------- images ----
  const uploadBoxImages = async (files: FileList | null) => {
    if (!selectedId || !files?.length) return;
    setUploading(true);
    setActionError("");
    try {
      const fd = new FormData();
      fd.append("product_id", selectedId);
      for (const file of Array.from(files)) fd.append("files", file);
      const res = await fetch("/api/admin/products/images", {
        method: "POST",
        headers: await authHeaders(false),
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setActionError(data?.message || "Could not upload images.");
        return;
      }
      await fetchBoxes();
    } catch {
      setActionError("Network error while uploading images.");
    } finally {
      setUploading(false);
    }
  };

  const setPrimaryImage = async (imageId: string) => {
    try {
      const res = await fetch("/api/admin/products/images", {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ action: "set_primary", image_id: imageId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setActionError(data?.message || "Could not set the primary image.");
        return;
      }
      await fetchBoxes();
    } catch {
      setActionError("Network error while updating the image.");
    }
  };

  const deleteImage = async (imageId: string) => {
    try {
      const res = await fetch(`/api/admin/products/images?id=${imageId}`, {
        method: "DELETE",
        headers: await authHeaders(false),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setActionError(data?.message || "Could not remove the image.");
        return;
      }
      await fetchBoxes();
    } catch {
      setActionError("Network error while removing the image.");
    }
  };

  // ------------------------------------------------------------ contents ----
  const postComposition = async (payload: Record<string, unknown>, fallback: string) => {
    if (!selectedId) return false;
    setActionError("");
    try {
      const res = await fetch("/api/admin/gift-boxes", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ ...payload, gift_box_product_id: selectedId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setActionError(data?.message || fallback);
        return false;
      }
      await fetchBoxes();
      return true;
    } catch {
      setActionError("Network error.");
      return false;
    }
  };

  const updateQuantity = async (item: ContentsItem, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_COMPONENT_QUANTITY) {
      setActionError(
        `Quantity must be between 1 and ${MAX_COMPONENT_QUANTITY}`
      );
      return;
    }
    setBusyItemId(item.id);
    await postComposition(
      { action: "update_item", item_id: item.id, quantity },
      "Could not update the quantity."
    );
    setBusyItemId(null);
  };

  const updateNote = async (item: ContentsItem, note: string) => {
    setBusyItemId(item.id);
    await postComposition(
      { action: "update_item", item_id: item.id, note: note || null },
      "Could not update the note."
    );
    setBusyItemId(null);
  };

  const toggleActive = async (item: ContentsItem) => {
    setBusyItemId(item.id);
    await postComposition(
      { action: "update_item", item_id: item.id, is_active: !item.is_active },
      "Could not toggle the item."
    );
    setBusyItemId(null);
  };

  const removeItem = async (item: ContentsItem) => {
    // Relationship-only delete — the catalog product is never touched.
    setBusyItemId(item.id);
    await postComposition(
      { action: "remove_item", item_id: item.id },
      "Could not remove the item."
    );
    setBusyItemId(null);
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const next = [...contents];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBusyItemId(next[index].id);
    await postComposition(
      { action: "reorder_items", item_ids: next.map((item) => item.id) },
      "Could not reorder the items."
    );
    setBusyItemId(null);
  };

  // -------------------------------------------------------------- preview ---
  // Plain computation (≤50 items): no manual memoization needed — the React
  // compiler cannot safely preserve a useMemo that reads mutable form fields.
  const preview = mode !== "edit"
    ? null
    : computeContentsValue(
        contents.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product?.name ?? "Item",
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency: item.product?.currency ?? form.currency ?? "USD",
          is_active: item.is_active,
        })),
        Number(form.base_price || 0),
        form.currency || "USD"
      );

  // ============================================================== render =====
  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">{t("giftbox.title")}</h1>
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-2xl p-6 animate-pulse">
            <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
            <div className="h-3 bg-white/[0.05] rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (schemaPending) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("giftbox.title")}</h1>
          <p className="text-gray-400 mt-1">{t("giftbox.subtitle")}</p>
        </div>
        <div className="glass rounded-2xl p-8 border border-yellow-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h2 className="text-white font-semibold">{t("giftbox.migration.title")}</h2>
              <p className="text-gray-400 text-sm">{t("giftbox.migration.body")}</p>
              <p className="text-gray-500 text-sm">{t("giftbox.migration.note")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "list") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{t("giftbox.title")}</h1>
            <p className="text-gray-400 mt-1">{t("giftbox.subtitle")}</p>
          </div>
          <button onClick={startCreate} className={BTN_PRIMARY}>
            <Plus className="w-4 h-4" />
            {t("giftbox.new")}
          </button>
        </div>

        {listError && (
          <div className="glass rounded-2xl p-4 border border-red-500/30 text-red-400 text-sm flex items-center justify-between gap-3">
            <span>{listError}</span>
            <button onClick={fetchBoxes} className={BTN_GHOST}>
              {t("giftbox.error.retry")}
            </button>
          </div>
        )}

        {boxes.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <Gift className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-white font-medium mb-1">{t("giftbox.empty.title")}</p>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              {t("giftbox.empty.body")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {boxes.map((box) => {
              const imageUrl = box.image ? productImageUrlFromPath(box.image) : null;
              return (
                <button
                  key={box.id}
                  onClick={() => {
                    setSelectedId(box.id);
                    setMode("edit");
                  }}
                  className="glass rounded-2xl overflow-hidden text-left hover:border-[var(--brand)]/50 transition-colors"
                >
                  <div className="h-36 bg-white/[0.03] flex items-center justify-center overflow-hidden">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={box.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-10 h-10 text-gray-600" />
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-white font-semibold line-clamp-1">{box.name}</h3>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(box.status)}`}
                      >
                        {box.status === "published"
                          ? t("giftbox.status.published")
                          : t("giftbox.status.draft")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--brand-2)] font-semibold">
                        {formatCurrency(box.base_price, box.currency)}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {t("giftbox.contents.items").replace(
                          "{n}",
                          String(box.contents.length)
                        )}
                      </span>
                    </div>
                    {box.deleted_at && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-400">
                        {t("giftbox.badge.archived")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------- edit view ----
  const images = selected?.images ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={backToList} className={BTN_GHOST}>
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          {t("giftbox.back")}
        </button>
        <button onClick={saveBox} disabled={saving} className={BTN_PRIMARY}>
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {selected ? t("giftbox.save") : t("giftbox.create")}
        </button>
      </div>

      {actionError && (
        <div className="glass rounded-2xl p-4 border border-red-500/30 text-red-400 text-sm">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* ---------------------------------------------------- box form --- */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-white font-semibold">{t("giftbox.form.title")}</h2>
            <p className="text-gray-500 text-xs mt-1">{t("giftbox.form.help")}</p>
          </div>

          <div>
            <label className={LABEL}>{t("giftbox.form.name")}</label>
            <input
              className={FIELD}
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              maxLength={300}
            />
          </div>

          <div>
            <label className={LABEL}>{t("giftbox.form.shortDescription")}</label>
            <input
              className={FIELD}
              value={form.short_description}
              onChange={(e) => setField("short_description", e.target.value)}
              maxLength={500}
            />
          </div>

          <div>
            <label className={LABEL}>{t("giftbox.form.description")}</label>
            <textarea
              className={`${FIELD} min-h-[110px]`}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>{t("giftbox.form.price")}</label>
              <input
                className={FIELD}
                type="number"
                min="0"
                step="0.01"
                value={form.base_price}
                onChange={(e) => setField("base_price", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>{t("giftbox.form.promoPrice")}</label>
              <input
                className={FIELD}
                type="number"
                min="0"
                step="0.01"
                value={form.compare_at_price}
                onChange={(e) => setField("compare_at_price", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>{t("giftbox.form.currency")}</label>
              <input
                className={FIELD}
                value={form.currency}
                onChange={(e) => setField("currency", e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>{t("giftbox.form.category")}</label>
              <select
                className={FIELD}
                value={form.category_id}
                onChange={(e) => setField("category_id", e.target.value)}
              >
                <option value="">—</option>
                {lookups.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>{t("giftbox.form.brand")}</label>
              <select
                className={FIELD}
                value={form.brand_id}
                onChange={(e) => setField("brand_id", e.target.value)}
              >
                <option value="">—</option>
                {lookups.brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>{t("giftbox.form.stock")}</label>
              <input
                className={FIELD}
                type="number"
                min="0"
                value={form.stock_quantity}
                onChange={(e) => setField("stock_quantity", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>{t("giftbox.form.status")}</label>
              <select
                className={FIELD}
                value={form.status}
                onChange={(e) =>
                  setField("status", e.target.value as ProductFormValues["status"])
                }
              >
                <option value="draft">{t("giftbox.status.draft")}</option>
                <option value="published">{t("giftbox.status.published")}</option>
                <option value="archived">{t("giftbox.status.archived")}</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>{t("giftbox.form.visibility")}</label>
              <select
                className={FIELD}
                value={form.visibility}
                onChange={(e) =>
                  setField("visibility", e.target.value as ProductFormValues["visibility"])
                }
              >
                <option value="visible">{t("giftbox.preview.viewProduct")}</option>
                <option value="hidden">{t("giftbox.preview.hiddenBadge")}</option>
              </select>
            </div>
          </div>

          {/* ------------------------------------------------ images ------ */}
          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{t("giftbox.images.title")}</span>
              <label
                className={`${BTN_GHOST} cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4" />
                )}
                {t("giftbox.images.add")}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={!selectedId || uploading}
                  onChange={(e) => {
                    uploadBoxImages(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {!selectedId && (
              <p className="text-[11px] text-gray-600">{t("giftbox.form.saveFirst")}</p>
            )}
            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {images.map((image) => {
                  const url = productImageUrlFromPath(image.storage_path);
                  return (
                    <div
                      key={image.id}
                      className="relative rounded-xl overflow-hidden bg-white/[0.03] group"
                    >
                      {url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="w-full h-20 object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        {!image.is_primary && (
                          <button
                            onClick={() => setPrimaryImage(image.id)}
                            title={t("giftbox.images.setPrimary")}
                            className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteImage(image.id)}
                          title={t("giftbox.images.delete")}
                          className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-red-500/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {image.is_primary && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] bg-[var(--brand)] text-white">
                          ★
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* --------------------------------------------------- contents --- */}
        <div className="space-y-6">
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-white font-semibold">{t("giftbox.contents.title")}</h2>
                <p className="text-gray-500 text-xs mt-1">{t("giftbox.contents.help")}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPickerOpen(true)}
                  disabled={!selectedId}
                  className={BTN_GHOST}
                  title={!selectedId ? t("giftbox.form.saveFirst") : undefined}
                >
                  <Search className="w-4 h-4" />
                  {t("giftbox.contents.addExisting")}
                </button>
                <button
                  onClick={() => setNewProductOpen(true)}
                  disabled={!selectedId}
                  className={BTN_PRIMARY}
                  title={!selectedId ? t("giftbox.form.saveFirst") : undefined}
                >
                  <Plus className="w-4 h-4" />
                  {t("giftbox.contents.createNew")}
                </button>
              </div>
            </div>

            {!selectedId ? (
              <p className="text-gray-500 text-sm">{t("giftbox.form.saveFirst")}</p>
            ) : contents.length === 0 ? (
              <p className="text-gray-500 text-sm">{t("giftbox.contents.empty")}</p>
            ) : (
              <ul className="space-y-3">
                {contents.map((item, index) => {
                  const outOfStock =
                    item.stock !== null && item.stock < item.quantity;
                  const variantLabel =
                    item.variant?.label || item.variant?.sku || "";
                  return (
                    <li
                      key={item.id}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-white/[0.05] overflow-hidden shrink-0 flex items-center justify-center">
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={productImageUrlFromPath(item.image) ?? ""}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-gray-600" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-white text-sm font-medium truncate">
                              {item.product?.name ?? "—"}
                            </span>
                            {!item.available && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400">
                                {t("giftbox.contents.unavailable")}
                              </span>
                            )}
                            {item.available && outOfStock && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400">
                                {t("giftbox.contents.outOfStock")}
                              </span>
                            )}
                            {item.product && !item.product.publicly_accessible && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.07] text-gray-400 inline-flex items-center gap-1">
                                <EyeOff className="w-3 h-3" />
                                {t("giftbox.preview.hiddenBadge")}
                              </span>
                            )}
                            {!item.is_active && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/10 text-yellow-400">
                                {t("giftbox.contents.inactive")}
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                            {variantLabel && (
                              <span>
                                {t("giftbox.contents.variant")}:{" "}
                                <span className="text-gray-300">{variantLabel}</span>
                              </span>
                            )}
                            <span>
                              {t("giftbox.contents.stock")}:{" "}
                              <span
                                className={
                                  outOfStock || !item.available ? "text-red-400" : "text-gray-300"
                                }
                              >
                                {item.stock ?? "—"}
                              </span>
                            </span>
                            <span>{formatCurrency(item.unit_price, item.product?.currency ?? form.currency)}</span>
                            {item.product?.publicly_accessible && item.product.slug && (
                              <span className="inline-flex items-center gap-1 text-gray-600">
                                <Link2 className="w-3 h-3" />
                                {t("giftbox.preview.viewProduct")}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <label className="text-[11px] text-gray-500">
                              {t("giftbox.contents.qty")}
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={MAX_COMPONENT_QUANTITY}
                              defaultValue={item.quantity}
                              key={`${item.id}-${item.quantity}`}
                              disabled={busyItemId === item.id}
                              onBlur={(e) => {
                                const next = Number(e.target.value);
                                if (next !== item.quantity) updateQuantity(item, next);
                              }}
                              className="w-16 px-2 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs text-white"
                            />
                            <input
                              defaultValue={item.note ?? ""}
                              key={`${item.id}-note-${item.note ?? ""}`}
                              placeholder={t("giftbox.contents.notePlaceholder")}
                              maxLength={500}
                              disabled={busyItemId === item.id}
                              onBlur={(e) => {
                                if ((e.target.value || "") !== (item.note ?? "")) {
                                  updateNote(item, e.target.value);
                                }
                              }}
                              className="flex-1 min-w-[140px] px-2 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs text-white placeholder:text-gray-600"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <button
                            onClick={() => moveItem(index, -1)}
                            disabled={index === 0 || busyItemId === item.id}
                            title={t("giftbox.contents.moveUp")}
                            className="p-1 rounded bg-white/[0.05] text-gray-400 hover:text-white disabled:opacity-30"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => moveItem(index, 1)}
                            disabled={index === contents.length - 1 || busyItemId === item.id}
                            title={t("giftbox.contents.moveDown")}
                            className="p-1 rounded bg-white/[0.05] text-gray-400 hover:text-white disabled:opacity-30"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleActive(item)}
                            title={t("giftbox.contents.inactive")}
                            className={`p-1 rounded text-xs ${
                              item.is_active
                                ? "bg-green-500/10 text-green-400"
                                : "bg-white/[0.05] text-gray-500"
                            }`}
                          >
                            {item.is_active ? "ON" : "OFF"}
                          </button>
                          <button
                            onClick={() => removeItem(item)}
                            title={t("giftbox.contents.remove")}
                            className="p-1 rounded bg-white/[0.05] text-gray-400 hover:text-red-400 disabled:opacity-30"
                            disabled={busyItemId === item.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ------------------------------------------------- preview ---- */}
          <div className="glass rounded-2xl p-6 space-y-3">
            <h2 className="text-white font-semibold">{t("giftbox.preview.title")}</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-white/[0.03] p-3">
                <p className="text-[11px] text-gray-500">{t("giftbox.preview.value")}</p>
                <p className="text-white font-semibold mt-1">
                  {preview?.contents_value != null
                    ? formatCurrency(preview.contents_value, form.currency)
                    : contents.length
                      ? t("giftbox.preview.mixed")
                      : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3">
                <p className="text-[11px] text-gray-500">{t("giftbox.preview.boxPrice")}</p>
                <p className="text-white font-semibold mt-1">
                  {formatCurrency(Number(form.base_price || 0), form.currency)}
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3">
                <p className="text-[11px] text-gray-500">{t("giftbox.preview.savings")}</p>
                <p className="font-semibold mt-1 text-green-400">
                  {preview?.comparable
                    ? preview.savings && preview.savings > 0
                      ? formatCurrency(preview.savings, form.currency)
                      : t("giftbox.preview.noSavings")
                    : "—"}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-600 text-center">
              {t("giftbox.contents.help")}
            </p>
          </div>
        </div>
      </div>

      {pickerOpen && selectedId && (
        <ProductPickerModal
          boxProductId={selectedId}
          lookups={lookups}
          authHeaders={authHeaders}
          onClose={() => setPickerOpen(false)}
          onAdded={fetchBoxes}
          onError={setActionError}
          t={t}
        />
      )}

      {newProductOpen && selectedId && (
        <NewProductModal
          boxProductId={selectedId}
          lookups={lookups}
          authHeaders={authHeaders}
          onClose={() => setNewProductOpen(false)}
          onAdded={fetchBoxes}
          onError={setActionError}
          t={t}
        />
      )}
    </div>
  );
}

// =============================================================================
// Method 2 — searchable picker over the existing catalog
// =============================================================================

function ProductPickerModal({
  boxProductId,
  lookups,
  authHeaders,
  onClose,
  onAdded,
  onError,
  t,
}: {
  boxProductId: string;
  lookups: Lookups;
  authHeaders: (json?: boolean) => Promise<Record<string, string>>;
  onClose: () => void;
  onAdded: () => Promise<void> | void;
  onError: (message: string) => void;
  t: (key: string) => string;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [availability, setAvailability] = useState("");
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [variantChoice, setVariantChoice] = useState<Record<string, string>>({});
  const [qtyChoice, setQtyChoice] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ exclude_boxes: "1", limit: "24" });
        if (search.trim()) params.set("q", search.trim());
        if (categoryId) params.set("category_id", categoryId);
        if (availability) params.set("availability", availability);
        const res = await fetch(`/api/admin/products?${params.toString()}`, {
          headers: await authHeaders(false),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.success) {
          setError(data?.message || "Could not load products.");
          setProducts([]);
        } else {
          setProducts(data.products || []);
        }
      } catch {
        if (!cancelled) setError("Network error while searching products.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 350 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, categoryId, availability, authHeaders]);

  const addProduct = async (product: PickerProduct) => {
    setAddingId(product.id);
    setError("");
    try {
      const variantId =
        variantChoice[product.id] ??
        product.variants.find((variant) => variant.is_default)?.id ??
        product.variants[0]?.id ??
        product.default_variant?.id ??
        null;
      const quantity = qtyChoice[product.id] ?? 1;
      const res = await fetch("/api/admin/gift-boxes", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          action: "add_item",
          gift_box_product_id: boxProductId,
          product_id: product.id,
          variant_id: variantId,
          quantity,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not add the product.");
        return;
      }
      await onAdded();
    } catch {
      setError("Network error while adding the product.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="glass rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-white/[0.07]">
          <h3 className="text-white font-semibold">{t("giftbox.picker.title")}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.05] text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b border-white/[0.07]">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("giftbox.picker.search")}
                className={`${FIELD} pl-9`}
                autoFocus
              />
            </div>
            <select
              className={`${FIELD} w-auto min-w-[140px]`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{t("giftbox.picker.category")}</option>
              {lookups.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              className={`${FIELD} w-auto min-w-[130px]`}
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
            >
              <option value="">{t("giftbox.picker.availability")}: {t("giftbox.picker.all")}</option>
              <option value="in_stock">{t("giftbox.picker.inStock")}</option>
              <option value="out_of_stock">{t("giftbox.picker.outOfStock")}</option>
            </select>
          </div>
          <p className="text-[11px] text-gray-600">{t("giftbox.picker.excludesBoxes")}</p>
          {error && (
            <p
              className="text-xs text-red-400 border border-red-500/30 rounded-lg px-3 py-2 cursor-pointer"
              onClick={() => onError(error)}
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-8">
              {t("giftbox.picker.loading")}
            </p>
          ) : products.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              {t("giftbox.picker.noResults")}
            </p>
          ) : (
            <ul className="space-y-3">
              {products.map((product) => {
                const image = product.product_images?.[0]?.storage_path;
                const selectedVariant =
                  variantChoice[product.id] ??
                  product.variants.find((variant) => variant.is_default)?.id ??
                  product.variants[0]?.id ??
                  "";
                const stockOf = (variantId: string) =>
                  product.variants.find((variant) => variant.id === variantId)
                    ?.stock_quantity ??
                  product.default_variant?.stock_quantity ??
                  0;
                return (
                  <li
                    key={product.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"
                  >
                    <div className="w-12 h-12 rounded-lg bg-white/[0.05] overflow-hidden shrink-0 flex items-center justify-center">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={productImageUrlFromPath(image) ?? ""}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-5 h-5 text-gray-600" />
                      )}
                    </div>

                    <div className="flex-1 min-w-[160px]">
                      <p className="text-white text-sm font-medium">{product.name}</p>
                      <p className="text-gray-500 text-xs">
                        {formatCurrency(product.base_price, product.currency)}
                        {product.variants.length > 1 && (
                          <span className="ml-2">
                            {t("giftbox.contents.stock")}: {stockOf(selectedVariant)}
                          </span>
                        )}
                      </p>
                    </div>

                    {product.variants.length > 1 ? (
                      <select
                        className={`${FIELD} w-auto max-w-[170px]`}
                        value={selectedVariant}
                        onChange={(e) =>
                          setVariantChoice((prev) => ({ ...prev, [product.id]: e.target.value }))
                        }
                      >
                        {product.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.sku ?? variant.id.slice(0, 8)} —{" "}
                            {formatCurrency(variant.price, product.currency)} (
                            {variant.stock_quantity})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[11px] text-gray-500">
                        {t("giftbox.contents.stock")}: {stockOf(selectedVariant)}
                      </span>
                    )}

                    <input
                      type="number"
                      min={1}
                      max={MAX_COMPONENT_QUANTITY}
                      value={qtyChoice[product.id] ?? 1}
                      onChange={(e) =>
                        setQtyChoice((prev) => ({
                          ...prev,
                          [product.id]: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className="w-16 px-2 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs text-white"
                      title={t("giftbox.picker.qty")}
                    />

                    <button
                      onClick={() => addProduct(product)}
                      disabled={addingId === product.id}
                      className={BTN_PRIMARY}
                    >
                      {addingId === product.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {addingId === product.id ? t("giftbox.picker.adding") : t("giftbox.picker.add")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-white/[0.07] flex justify-end">
          <button onClick={onClose} className={BTN_GHOST}>
            {t("giftbox.picker.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Method 1 — create a NEW catalog product through the existing products API,
// then link it into this box's composition.
// =============================================================================

function NewProductModal({
  boxProductId,
  lookups,
  authHeaders,
  onClose,
  onAdded,
  onError,
  t,
}: {
  boxProductId: string;
  lookups: Lookups;
  authHeaders: (json?: boolean) => Promise<Record<string, string>>;
  onClose: () => void;
  onAdded: () => Promise<void> | void;
  onError: (message: string) => void;
  t: (key: string) => string;
}) {
  const [values, setValues] = useState<ProductFormValues>({
    ...emptyProductForm,
    visibility: "hidden",
    stock_quantity: "25",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const setField = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const createAndLink = async () => {
    setError("");
    if (!values.name.trim() || !values.base_price) {
      setError(t("giftbox.form.needCreate"));
      return;
    }
    setCreating(true);
    try {
      // 1) Same endpoint + payload rules as the normal product creation flow.
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          action: "create",
          product: formToProductPayload(values),
          stock_quantity: Number(values.stock_quantity || 0),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not create the product.");
        return;
      }

      const productId: string = data.product_id ?? data.product?.id ?? data.id;
      if (!productId) {
        setError("The product was created but its id was not returned.");
        return;
      }

      // 2) Images through the existing product images endpoint (best effort —
      //    a failed upload must not lose the created product).
      if (files.length > 0) {
        try {
          const fd = new FormData();
          fd.append("product_id", productId);
          for (const file of files) fd.append("files", file);
          const imageRes = await fetch("/api/admin/products/images", {
            method: "POST",
            headers: await authHeaders(false),
            body: fd,
          });
          const imageData = await imageRes.json().catch(() => null);
          if (!imageRes.ok || !imageData?.success) {
            onError(imageData?.message || "Product created, but image upload failed.");
          }
        } catch {
          onError("Product created, but image upload failed (network).");
        }
      }

      // 3) Link the new product into the gift box composition.
      const addRes = await fetch("/api/admin/gift-boxes", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          action: "add_item",
          gift_box_product_id: boxProductId,
          product_id: productId,
          variant_id: null,
          quantity: 1,
        }),
      });
      const addData = await addRes.json().catch(() => null);
      if (!addRes.ok || !addData?.success) {
        setError(addData?.message || "Product created, but adding it to the box failed.");
        await onAdded();
        return;
      }

      await onAdded();
      onClose();
    } catch {
      setError("Network error while creating the product.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="glass rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-white/[0.07]">
          <div>
            <h3 className="text-white font-semibold">{t("giftbox.newProduct.title")}</h3>
            <p className="text-gray-500 text-xs mt-0.5">{t("giftbox.newProduct.help")}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.05] text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <p className="text-xs text-red-400 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label className={LABEL}>{t("giftbox.newProduct.name")}</label>
            <input
              className={FIELD}
              value={values.name}
              onChange={(e) => setField("name", e.target.value)}
              maxLength={300}
              autoFocus
            />
          </div>

          <div>
            <label className={LABEL}>{t("giftbox.newProduct.shortDescription")}</label>
            <input
              className={FIELD}
              value={values.short_description}
              onChange={(e) => setField("short_description", e.target.value)}
              maxLength={500}
            />
          </div>

          <div>
            <label className={LABEL}>{t("giftbox.newProduct.description")}</label>
            <textarea
              className={`${FIELD} min-h-[90px]`}
              value={values.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>{t("giftbox.newProduct.price")}</label>
              <input
                className={FIELD}
                type="number"
                min="0"
                step="0.01"
                value={values.base_price}
                onChange={(e) => setField("base_price", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>{t("giftbox.newProduct.promoPrice")}</label>
              <input
                className={FIELD}
                type="number"
                min="0"
                step="0.01"
                value={values.compare_at_price}
                onChange={(e) => setField("compare_at_price", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>{t("giftbox.newProduct.stock")}</label>
              <input
                className={FIELD}
                type="number"
                min="0"
                value={values.stock_quantity}
                onChange={(e) => setField("stock_quantity", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>{t("giftbox.newProduct.category")}</label>
              <select
                className={FIELD}
                value={values.category_id}
                onChange={(e) => setField("category_id", e.target.value)}
              >
                <option value="">—</option>
                {lookups.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>{t("giftbox.newProduct.currency")}</label>
              <input
                className={FIELD}
                value={values.currency}
                onChange={(e) => setField("currency", e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>{t("giftbox.newProduct.status")}</label>
              <select
                className={FIELD}
                value={values.status}
                onChange={(e) =>
                  setField("status", e.target.value as ProductFormValues["status"])
                }
              >
                <option value="draft">{t("giftbox.status.draft")}</option>
                <option value="published">{t("giftbox.status.published")}</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>{t("giftbox.newProduct.visibility")}</label>
              <select
                className={FIELD}
                value={values.visibility}
                onChange={(e) =>
                  setField("visibility", e.target.value as ProductFormValues["visibility"])
                }
              >
                <option value="hidden">{t("giftbox.preview.hiddenBadge")}</option>
                <option value="visible">{t("giftbox.preview.viewProduct")}</option>
              </select>
            </div>
          </div>

          <p className="text-[11px] text-gray-600">{t("giftbox.newProduct.hiddenHint")}</p>

          <div className="space-y-1">
            <label className={LABEL}>{t("giftbox.newProduct.images")}</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
              className="text-xs text-gray-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-white/[0.07] file:text-gray-300"
            />
          </div>
        </div>

        <div className="p-4 border-t border-white/[0.07] flex justify-end gap-2">
          <button onClick={onClose} className={BTN_GHOST}>
            {t("giftbox.picker.close")}
          </button>
          <button onClick={createAndLink} disabled={creating} className={BTN_PRIMARY}>
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {t("giftbox.newProduct.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
