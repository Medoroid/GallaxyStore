"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { CatalogImageField } from "./CatalogImageField";

type CatalogType = "categories" | "brands";

type CatalogItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order?: number | null;
  parent_id?: string | null;
  image_url?: string | null;
  icon?: string | null;
  logo_url?: string | null;
  website_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  product_count: number;
  created_at: string;
};

type FormState = Record<string, string | boolean>;

const LABELS = {
  categories: {
    title: "Categories",
    singular: "category",
    add: "New category",
    help: "Organise products into a browseable hierarchy.",
  },
  brands: {
    title: "Brands",
    singular: "brand",
    add: "New brand",
    help: "Track the brands behind your catalog products.",
  },
} as const;

const FIELD = "w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-gray-600 focus:border-[var(--brand)] focus:outline-none";

function emptyForm(type: CatalogType): FormState {
  const base: FormState = {
    name: "",
    slug: "",
    description: "",
    is_active: true,
  };
  if (type === "categories") {
    return { ...base, icon: "", image_url: "", parent_id: "", sort_order: "0" };
  }
  return {
    ...base,
    logo_url: "",
    website_url: "",
    seo_title: "",
    seo_description: "",
  };
}

export default function CatalogManager({ type }: { type: CatalogType }) {
  const { getToken } = useAuth();
  const label = LABELS[type];
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(type));

  const headers = useCallback(
    async (json = true) => {
      const token = await getToken();
      const result: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (json) result["Content-Type"] = "application/json";
      return result;
    },
    [getToken]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/catalog?type=${type}`, {
        headers: await headers(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message ?? `Could not load ${label.title.toLowerCase()}.`);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [headers, label.title, type]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm(type));
    setError("");
  }

  function openEdit(item: CatalogItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      slug: item.slug,
      description: item.description ?? "",
      is_active: item.is_active,
      ...(type === "categories"
        ? {
            icon: item.icon ?? "",
            image_url: item.image_url ?? "",
            parent_id: item.parent_id ?? "",
            sort_order: String(item.sort_order ?? 0),
          }
        : {
            logo_url: item.logo_url ?? "",
            website_url: item.website_url ?? "",
            seo_title: item.seo_title ?? "",
            seo_description: item.seo_description ?? "",
          }),
    });
    setError("");
  }

  const setField = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { type, ...form };
      if (editingId) payload.id = editingId;
      const res = await fetch("/api/admin/catalog", {
        method: editingId ? "PATCH" : "POST",
        headers: await headers(),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message ?? "Could not save.");
        return;
      }
      setEditingId(null);
      setForm(emptyForm(type));
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: CatalogItem) {
    if (
      !window.confirm(
        `Delete ${label.singular} "${item.name}"? Products using it must be reassigned first.`
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/catalog", {
        method: "DELETE",
        headers: await headers(),
        body: JSON.stringify({ type, id: item.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message ?? "Could not delete.");
        return;
      }
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const Icon = type === "categories" ? FolderTree : Tag;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Icon className="w-6 h-6 text-[var(--brand)]" /> {label.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{label.help}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-neon text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> {label.add}
        </button>
      </header>

      {error && (
        <p className="text-sm text-red-400 glass rounded-xl p-3 border border-red-500/30">
          {error}
        </p>
      )}

      {editingId && (
        <section className="glass rounded-2xl p-5 space-y-4 border border-[var(--brand)]/30">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">
              Edit {label.singular}: {form.name || "—"}
            </h2>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="p-2 rounded-lg glass text-gray-400 hover:text-white"
              aria-label="Close editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-400">Name *</span>
              <input
                className={`${FIELD} mt-1`}
                value={String(form.name ?? "")}
                onChange={(e) => setField("name", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Slug (auto if empty)</span>
              <input
                className={`${FIELD} mt-1`}
                value={String(form.slug ?? "")}
                onChange={(e) => setField("slug", e.target.value)}
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs text-gray-400">Description</span>
              <textarea
                rows={2}
                className={`${FIELD} mt-1`}
                value={String(form.description ?? "")}
                onChange={(e) => setField("description", e.target.value)}
              />
            </label>
            {type === "categories" ? (
              <>
                <label className="block">
                  <span className="text-xs text-gray-400">Icon</span>
                  <input
                    className={`${FIELD} mt-1`}
                    value={String(form.icon ?? "")}
                    onChange={(e) => setField("icon", e.target.value)}
                  />
                </label>
                <CatalogImageField
                  label="Category image"
                  value={String(form.image_url ?? "")}
                  onChange={(value) => setField("image_url", value)}
                />
                <label className="block">
                  <span className="text-xs text-gray-400">Parent category</span>
                  <select
                    className={`${FIELD} mt-1`}
                    value={String(form.parent_id ?? "")}
                    onChange={(e) => setField("parent_id", e.target.value)}
                  >
                    <option value="">— None —</option>
                    {items
                      .filter((item) => item.id !== editingId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400">Sort order</span>
                  <input
                    type="number"
                    className={`${FIELD} mt-1`}
                    value={String(form.sort_order ?? 0)}
                    onChange={(e) => setField("sort_order", e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <CatalogImageField
                  label="Brand logo"
                  value={String(form.logo_url ?? "")}
                  onChange={(value) => setField("logo_url", value)}
                />
                <label className="block">
                  <span className="text-xs text-gray-400">Website URL</span>
                  <input
                    className={`${FIELD} mt-1`}
                    value={String(form.website_url ?? "")}
                    onChange={(e) => setField("website_url", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400">SEO title</span>
                  <input
                    className={`${FIELD} mt-1`}
                    value={String(form.seo_title ?? "")}
                    onChange={(e) => setField("seo_title", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400">SEO description</span>
                  <input
                    className={`${FIELD} mt-1`}
                    value={String(form.seo_description ?? "")}
                    onChange={(e) => setField("seo_description", e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.is_active === true}
                onChange={(e) => setField("is_active", e.target.checked)}
              />
              Active / visible
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !String(form.name ?? "").trim()}
              className="px-4 py-2 rounded-xl bg-gradient-neon text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="px-4 py-2 rounded-xl glass text-sm"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {!editingId && (
        <section className="glass rounded-2xl p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-400">Name *</span>
              <input
                className={`${FIELD} mt-1`}
                value={String(form.name ?? "")}
                onChange={(e) => setField("name", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Slug (auto if empty)</span>
              <input
                className={`${FIELD} mt-1`}
                value={String(form.slug ?? "")}
                onChange={(e) => setField("slug", e.target.value)}
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs text-gray-400">Description</span>
              <textarea
                rows={2}
                className={`${FIELD} mt-1`}
                value={String(form.description ?? "")}
                onChange={(e) => setField("description", e.target.value)}
              />
            </label>
            {type === "categories" ? (
              <>
                <label className="block">
                  <span className="text-xs text-gray-400">Icon</span>
                  <input
                    className={`${FIELD} mt-1`}
                    value={String(form.icon ?? "")}
                    onChange={(e) => setField("icon", e.target.value)}
                  />
                </label>
                <CatalogImageField
                  label="Category image"
                  value={String(form.image_url ?? "")}
                  onChange={(value) => setField("image_url", value)}
                />
                <label className="block">
                  <span className="text-xs text-gray-400">Parent category</span>
                  <select
                    className={`${FIELD} mt-1`}
                    value={String(form.parent_id ?? "")}
                    onChange={(e) => setField("parent_id", e.target.value)}
                  >
                    <option value="">— None —</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400">Sort order</span>
                  <input
                    type="number"
                    className={`${FIELD} mt-1`}
                    value={String(form.sort_order ?? 0)}
                    onChange={(e) => setField("sort_order", e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <CatalogImageField
                  label="Brand logo"
                  value={String(form.logo_url ?? "")}
                  onChange={(value) => setField("logo_url", value)}
                />
                <label className="block">
                  <span className="text-xs text-gray-400">Website URL</span>
                  <input
                    className={`${FIELD} mt-1`}
                    value={String(form.website_url ?? "")}
                    onChange={(e) => setField("website_url", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400">SEO title</span>
                  <input
                    className={`${FIELD} mt-1`}
                    value={String(form.seo_title ?? "")}
                    onChange={(e) => setField("seo_title", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400">SEO description</span>
                  <input
                    className={`${FIELD} mt-1`}
                    value={String(form.seo_description ?? "")}
                    onChange={(e) => setField("seo_description", e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.is_active === true}
                onChange={(e) => setField("is_active", e.target.checked)}
              />
              Active / visible
            </label>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !String(form.name ?? "").trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-neon text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add {label.singular}
          </button>
        </section>
      )}

      <section className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            No {label.title.toLowerCase()} yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-gray-400">
              <tr>
                <th className="text-start px-4 py-3 font-medium">Name</th>
                <th className="text-start px-4 py-3 font-medium">Slug</th>
                <th className="text-start px-4 py-3 font-medium">Products</th>
                <th className="text-start px-4 py-3 font-medium">Status</th>
                <th className="text-end px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{item.slug}</td>
                  <td className="px-4 py-3 text-gray-300">{item.product_count}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-lg ${
                        item.is_active
                          ? "bg-green-500/10 text-green-400"
                          : "bg-yellow-500/10 text-yellow-400"
                      }`}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="p-2 rounded-lg glass text-gray-300 hover:text-white"
                        aria-label={`Edit ${item.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item)}
                        disabled={saving}
                        className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
