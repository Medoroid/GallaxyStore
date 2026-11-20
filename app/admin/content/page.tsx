"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ImagePlus,
  Megaphone,
  LayoutList,
  Power,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import {
  BANNER_PLACEMENTS,
  CONTENT_PAGES,
  SECTION_PLACEMENTS,
  SECTION_TYPES,
  type BannerPlacement,
  type SectionPlacement,
  type SectionType,
  type SiteBanner,
  type SiteSection,
} from "@/lib/site-content";
import { BannerCard, ContentSection, TopStripBanner } from "@/app/components/SiteContent";
import AdminLanguageToggle from "@/app/components/AdminLanguageToggle";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Admin content manager: banners and sections that render into the storefront
 * zones via <ContentZone>. One form (create/edit) + one list per tab; every
 * write goes through /api/admin/content with the admin bearer token.
 */

type Tab = "banner" | "section";

type BannerRow = {
  id: string;
  page: string;
  placement: BannerPlacement;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  button_label: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

type SectionRow = {
  id: string;
  page: string;
  placement: SectionPlacement;
  section_type: SectionType;
  eyebrow: string | null;
  title: string | null;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
  button_label: string | null;
  config: { cards?: Array<Record<string, unknown>> };
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

type CardRow = {
  title: string;
  body: string;
  link_url: string;
  image_url: string;
};

type FormState = {
  page: string;
  placement: string;
  section_type: SectionType;
  title: string;
  subtitle: string;
  eyebrow: string;
  body: string;
  image_url: string;
  link_url: string;
  button_label: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

const EMPTY_FORM: FormState = {
  page: "home",
  placement: "after_hero",
  section_type: "rich_text",
  title: "",
  subtitle: "",
  eyebrow: "",
  body: "",
  image_url: "",
  link_url: "",
  button_label: "",
  is_active: true,
  starts_at: "",
  ends_at: "",
};

const INPUT_CLASS =
  "w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50 transition-colors text-sm";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function groupByPlacement<T extends { placement: string }>(rows: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.placement) ?? [];
    list.push(row);
    map.set(row.placement, list);
  }
  return [...map.entries()];
}

/** Lifecycle chip for one row: what the storefront would show right now. */
function rowStatus(row: {
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}): { labelKey: string; className: string } {
  if (!row.is_active) return { labelKey: "content.status.draft", className: "bg-white/[0.06] text-gray-400" };
  const now = Date.now();
  if (row.starts_at && Date.parse(row.starts_at) > now) {
    return { labelKey: "content.status.scheduled", className: "bg-sky-500/15 text-sky-400" };
  }
  if (row.ends_at && Date.parse(row.ends_at) < now) {
    return { labelKey: "content.status.expired", className: "bg-red-500/15 text-red-400" };
  }
  return { labelKey: "content.status.live", className: "bg-emerald-500/15 text-emerald-400" };
}

export default function AdminContent() {
  const { user, getToken } = useAuth();
  const { t } = useAdminT();
  const [tab, setTab] = useState<Tab>("banner");
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  // `text` is only used for server-provided messages (English API contract);
  // everything the client owns stores a `textKey` so it re-translates live.
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text?: string;
    textKey?: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [migrationRequired, setMigrationRequired] = useState(false);

  /** True when the API reports the not-yet-applied content migration (503). */
  const isMigration503 = (res: Response, data: { code?: string } | null): boolean => {
    if (res.status === 503 && data?.code === "CONTENT_MIGRATION_REQUIRED") {
      setMigrationRequired(true);
      return true;
    }
    return false;
  };

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/content", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (isMigration503(res, data)) return;
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || undefined, textKey: "content.msg.loadFailed" });
        return;
      }
      setBanners(data.banners || []);
      setSections(data.sections || []);
    } catch {
      setMessage({ type: "error", textKey: "content.msg.loadNetwork" });
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">{t("admin.login.required")}</h1>
          <p className="text-muted-foreground">{t("admin.login.body")}</p>
        </div>
      </div>
    );
  }

  // Honest state until the owner applies the prepared migration.
  if (migrationRequired) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="glass-strong rounded-3xl p-8 border border-amber-500/30">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
            <h1 className="text-xl font-extrabold text-white">{t("admin.migration.title")}</h1>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">{t("content.migration.body")}</p>
          <code className="block mt-4 px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-xs text-emerald-300 font-mono break-all">
            supabase/migrations/20261108130000_site_content_banners_sections.sql
          </code>
          <p className="text-xs text-gray-500 mt-4">{t("content.migration.note")}</p>
        </div>
      </div>
    );
  }

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCards([]);
  };

  const startEdit = (row: BannerRow | SectionRow) => {
    setEditingId(row.id);
    setForm({
      page: row.page,
      placement: row.placement,
      section_type: "section_type" in row ? row.section_type : "rich_text",
      title: row.title ?? "",
      subtitle: "subtitle" in row ? (row.subtitle ?? "") : "",
      eyebrow: "eyebrow" in row ? (row.eyebrow ?? "") : "",
      body: "body" in row ? (row.body ?? "") : "",
      image_url: row.image_url ?? "",
      link_url: row.link_url ?? "",
      button_label: row.button_label ?? "",
      is_active: row.is_active,
      starts_at: toLocalInput(row.starts_at),
      ends_at: toLocalInput(row.ends_at),
    });
    const rowCards =
      "config" in row ? ((row.config?.cards ?? []) as Array<Record<string, unknown>>) : [];
    setCards(
      rowCards.map((card) => ({
        title: String(card.title ?? ""),
        body: String(card.body ?? ""),
        link_url: String(card.link_url ?? ""),
        image_url: String(card.image_url ?? ""),
      }))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const patchItem = async (
    id: string,
    payload: Record<string, unknown>
  ): Promise<boolean> => {
    setBusyId(id);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/content", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: tab, id, ...payload }),
      });
      const data = await res.json().catch(() => null);
      if (isMigration503(res, data)) return false;
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || undefined, textKey: "content.msg.updateFailed" });
        return false;
      }
      if (tab === "banner") {
        setBanners((prev) => prev.map((row) => (row.id === id ? { ...row, ...(data.item ?? payload) } : row)));
      } else {
        setSections((prev) => prev.map((row) => (row.id === id ? { ...row, ...(data.item ?? payload) } : row)));
      }
      return true;
    } catch {
      setMessage({ type: "error", textKey: "content.msg.updateNetwork" });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("content.msg.deleteConfirm"))) return;
    setBusyId(id);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/admin/content?type=${tab}&id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json().catch(() => null);
      if (isMigration503(res, data)) return;
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || undefined, textKey: "content.msg.deleteFailed" });
        return;
      }
      if (tab === "banner") setBanners((prev) => prev.filter((row) => row.id !== id));
      else setSections((prev) => prev.filter((row) => row.id !== id));
      if (editingId === id) resetForm();
      setMessage({ type: "success", textKey: "content.msg.deleted" });
    } catch {
      setMessage({ type: "error", textKey: "content.msg.deleteNetwork" });
    } finally {
      setBusyId(null);
    }
  };

  const move = async (
    group: Array<{ id: string; sort_order: number }>,
    index: number,
    direction: -1 | 1
  ) => {
    const target = index + direction;
    if (target < 0 || target >= group.length) return;
    const next = [...group];
    [next[index], next[target]] = [next[target], next[index]];

    setBusyId(group[index].id);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/content", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: tab, order: next.map((row) => ({ id: row.id })) }),
      });
      const data = await res.json().catch(() => null);
      if (isMigration503(res, data)) return;
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || undefined, textKey: "content.msg.reorderFailed" });
      }
      // Reload so the list always reflects the server's authoritative order.
      await load();
    } catch {
      setMessage({ type: "error", textKey: "content.msg.reorderNetwork" });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setMessage(null);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/content/images", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (isMigration503(res, data)) return;
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || undefined, textKey: "content.msg.uploadFailed" });
        return;
      }
      setForm((prev) => ({ ...prev, image_url: data.url }));
    } catch {
      setMessage({ type: "error", textKey: "content.msg.uploadNetwork" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      const payload: Record<string, unknown> = {
        type: tab,
        page: form.page,
        placement: form.placement,
        title: form.title.trim() || null,
        image_url: form.image_url.trim() || null,
        link_url: form.link_url.trim() || null,
        button_label: form.button_label.trim() || null,
        is_active: form.is_active,
        starts_at: fromLocalInput(form.starts_at),
        ends_at: fromLocalInput(form.ends_at),
        ...(tab === "banner"
          ? { subtitle: form.subtitle.trim() || null }
          : {
              section_type: form.section_type,
              eyebrow: form.eyebrow.trim() || null,
              body: form.body.trim() || null,
              config: {
                cards: cards
                  .filter((card) => card.title.trim())
                  .map((card) => ({
                    title: card.title.trim(),
                    body: card.body.trim() || null,
                    link_url: card.link_url.trim() || null,
                    image_url: card.image_url.trim() || null,
                  })),
              },
            }),
      };

      const res = await fetch("/api/admin/content", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = await res.json().catch(() => null);
      if (isMigration503(res, data)) return;
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || undefined, textKey: "content.msg.saveFailed" });
        return;
      }

      setMessage({
        type: "success",
        textKey: editingId ? "content.msg.updated" : "content.msg.created",
      });
      resetForm();
      await load();
    } catch {
      setMessage({ type: "error", textKey: "content.msg.saveNetwork" });
    } finally {
      setSaving(false);
    }
  };

  const rows = tab === "banner" ? (banners as Array<BannerRow | SectionRow>) : sections;
  const placementOptions: readonly string[] =
    tab === "banner" ? BANNER_PLACEMENTS : SECTION_PLACEMENTS;

  /** Form state shaped as a real row — the preview shows what Save would ship. */
  const previewBanner: SiteBanner | null =
    tab === "banner" && (form.title.trim() || form.subtitle.trim() || form.image_url.trim())
      ? {
          id: editingId ?? "preview",
          page: form.page,
          placement: form.placement as BannerPlacement,
          title: form.title.trim() || null,
          subtitle: form.subtitle.trim() || null,
          image_url: form.image_url.trim() || null,
          link_url: form.link_url.trim() || null,
          button_label: form.button_label.trim() || null,
          sort_order: 0,
          is_active: form.is_active,
          starts_at: fromLocalInput(form.starts_at),
          ends_at: fromLocalInput(form.ends_at),
        }
      : null;

  const previewSection: SiteSection | null =
    tab === "section" && (form.title.trim() || form.eyebrow.trim() || form.body.trim())
      ? {
          id: editingId ?? "preview",
          page: form.page,
          placement: form.placement as SectionPlacement,
          section_type: form.section_type,
          eyebrow: form.eyebrow.trim() || null,
          title: form.title.trim() || null,
          body: form.body.trim() || null,
          image_url: form.image_url.trim() || null,
          link_url: form.link_url.trim() || null,
          button_label: form.button_label.trim() || null,
          config: {
            cards: cards
              .filter((card) => card.title.trim())
              .map((card) => ({
                title: card.title.trim(),
                body: card.body.trim() || null,
                link_url: card.link_url.trim() || null,
                image_url: card.image_url.trim() || null,
              })),
          },
          sort_order: 0,
          is_active: form.is_active,
          starts_at: fromLocalInput(form.starts_at),
          ends_at: fromLocalInput(form.ends_at),
        }
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("content.title")}</h1>
          <p className="text-gray-400 mt-1">{t("content.subtitle")}</p>
        </div>
        <AdminLanguageToggle />
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm ${
            message.type === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {message.text ?? (message.textKey ? t(message.textKey) : null)}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <TabButton
          active={tab === "banner"}
          onClick={() => {
            setTab("banner");
            resetForm();
          }}
          icon={<Megaphone className="w-4 h-4" />}
          label={t("content.tab.banners")}
        />
        <TabButton
          active={tab === "section"}
          onClick={() => {
            setTab("section");
            resetForm();
          }}
          icon={<LayoutList className="w-4 h-4" />}
          label={t("content.tab.sections")}
        />
      </div>

      {/* Create / edit form */}
      <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Plus className="w-5 h-5 text-[var(--brand)]" />
          {editingId
            ? t("content.form.edit")
            : tab === "banner"
              ? t("content.form.addBanner")
              : t("content.form.addSection")}
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t("content.form.zone")}</label>
            <select
              value={form.placement}
              onChange={(e) => setForm((prev) => ({ ...prev, placement: e.target.value }))}
              className={INPUT_CLASS}
              required
            >
              {placementOptions.map((option) => (
                <option key={option} value={option}>
                  {t(`placement.${option}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t("content.form.page")}</label>
            <select
              value={form.page}
              onChange={(e) => setForm((prev) => ({ ...prev, page: e.target.value }))}
              className={INPUT_CLASS}
              required
            >
              {CONTENT_PAGES.map((page) => (
                <option key={page} value={page}>
                  {page === "home" ? t("page.home") : page}
                </option>
              ))}
            </select>
          </div>

          {tab === "section" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                {t("content.form.sectionType")}
              </label>
              <select
                value={form.section_type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    section_type: e.target.value as SectionType,
                  }))
                }
                className={INPUT_CLASS}
                required
              >
                {SECTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`sectionType.${type}`)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={tab === "banner" ? "md:col-span-2" : ""}>
            <label className="block text-sm text-gray-400 mb-1.5">
              {t("content.form.title")} {tab === "section" ? "*" : ""}
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className={INPUT_CLASS}
              maxLength={160}
              placeholder={
                tab === "banner" ? t("content.placeholder.bannerTitle") : t("content.placeholder.sectionTitle")
              }
            />
          </div>

          {tab === "banner" && (
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-1.5">
                {t("content.form.subtitle")}
              </label>
              <input
                value={form.subtitle}
                onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))}
                className={INPUT_CLASS}
                maxLength={300}
                placeholder={t("content.placeholder.subtitle")}
              />
            </div>
          )}

          {tab === "section" && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  {t("content.form.eyebrow")}
                </label>
                <input
                  value={form.eyebrow}
                  onChange={(e) => setForm((prev) => ({ ...prev, eyebrow: e.target.value }))}
                  className={INPUT_CLASS}
                  maxLength={60}
                  placeholder={t("content.placeholder.eyebrow")}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  {t("content.form.buttonLabel")}
                </label>
                <input
                  value={form.button_label}
                  onChange={(e) => setForm((prev) => ({ ...prev, button_label: e.target.value }))}
                  className={INPUT_CLASS}
                  maxLength={40}
                  placeholder={t("content.placeholder.learnMore")}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1.5">{t("content.form.body")}</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                  className={INPUT_CLASS}
                  maxLength={4000}
                  rows={4}
                  placeholder={t("content.placeholder.body")}
                />
              </div>
            </>
          )}

          {tab === "banner" && (
            <div className="grid md:grid-cols-2 gap-4 md:col-span-2">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  {t("content.form.buttonLabel")}
                </label>
                <input
                  value={form.button_label}
                  onChange={(e) => setForm((prev) => ({ ...prev, button_label: e.target.value }))}
                  className={INPUT_CLASS}
                  maxLength={40}
                  placeholder={t("content.placeholder.shopNow")}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  {t("content.form.linkUrl")}
                </label>
                <input
                  value={form.link_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, link_url: e.target.value }))}
                  className={INPUT_CLASS}
                  maxLength={2000}
                  placeholder={t("content.placeholder.url")}
                />
              </div>
            </div>
          )}

          {tab === "section" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">{t("content.form.linkUrl")}</label>
              <input
                value={form.link_url}
                onChange={(e) => setForm((prev) => ({ ...prev, link_url: e.target.value }))}
                className={INPUT_CLASS}
                maxLength={2000}
                placeholder={t("content.placeholder.url")}
              />
            </div>
          )}

          {/* Image */}
          <div className="md:col-span-2 space-y-3">
            <label className="block text-sm text-gray-400">{t("content.form.image")}</label>
            <label className="block glass rounded-xl border border-dashed border-white/20 p-5 text-center cursor-pointer hover:border-[var(--brand)]/50 transition-colors">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
              />
              {uploading ? (
                <Loader2 className="h-6 w-6 mx-auto mb-2 text-[var(--brand)] animate-spin" />
              ) : (
                <ImagePlus className="h-6 w-6 mx-auto mb-2 text-[var(--brand)]" />
              )}
              <p className="text-sm text-gray-300">
                {uploading ? t("content.form.uploading") : t("content.form.uploadHint")}
              </p>
              <p className="text-xs text-gray-500 mt-1">{t("content.form.uploadLimits")}</p>
            </label>
            <input
              value={form.image_url}
              onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))}
              className={INPUT_CLASS}
              maxLength={2000}
              placeholder={t("content.form.pasteUrl")}
            />
            {form.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.image_url}
                alt="Preview"
                className="max-h-48 rounded-xl object-contain"
              />
            )}
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t("content.form.startsAt")}</label>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm((prev) => ({ ...prev, starts_at: e.target.value }))}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t("content.form.endsAt")}</label>
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm((prev) => ({ ...prev, ends_at: e.target.value }))}
              className={INPUT_CLASS}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-400 md:col-span-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="w-4 h-4 accent-[var(--brand)]"
            />
            {t("content.form.published")}
          </label>
        </div>

        {/* Cards editor */}
        {tab === "section" && form.section_type === "cards" && (
          <div className="space-y-3 border-t border-white/[0.08] pt-4">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">
                {t("content.cards.count")} ({cards.length}/8)
              </label>
              <button
                type="button"
                onClick={() =>
                  setCards((prev) =>
                    prev.length >= 8
                      ? prev
                      : [...prev, { title: "", body: "", link_url: "", image_url: "" }]
                  )
                }
                disabled={cards.length >= 8}
                className="px-3 py-1.5 rounded-xl bg-white/[0.05] text-gray-300 text-xs font-medium hover:bg-white/[0.1] disabled:opacity-40"
              >
                {t("content.cards.add")}
              </button>
            </div>
            {cards.map((card, index) => (
              <div key={index} className="glass rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={card.title}
                    onChange={(e) =>
                      setCards((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, title: e.target.value } : row
                        )
                      )
                    }
                    className={INPUT_CLASS}
                    maxLength={80}
                    placeholder={t("content.cards.title")}
                  />
                  <button
                    type="button"
                    onClick={() => setCards((prev) => prev.filter((_, i) => i !== index))}
                    className="p-2 rounded-lg bg-red-500/10 text-red-400"
                    title={t("content.cards.remove")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={card.body}
                  onChange={(e) =>
                    setCards((prev) =>
                      prev.map((row, i) => (i === index ? { ...row, body: e.target.value } : row))
                    )
                  }
                  className={INPUT_CLASS}
                  maxLength={300}
                  rows={2}
                  placeholder={t("content.cards.text")}
                />
                <div className="grid md:grid-cols-2 gap-2">
                  <input
                    value={card.link_url}
                    onChange={(e) =>
                      setCards((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, link_url: e.target.value } : row
                        )
                      )
                    }
                    className={INPUT_CLASS}
                    placeholder={t("content.cards.link")}
                  />
                  <input
                    value={card.image_url}
                    onChange={(e) =>
                      setCards((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, image_url: e.target.value } : row
                        )
                      )
                    }
                    className={INPUT_CLASS}
                    placeholder={t("content.cards.image")}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Live preview of the current form state — what publishing will show */}
        {(previewBanner || previewSection) && (
          <div className="border-t border-white/[0.08] pt-4 space-y-2">
            <p className="text-sm text-gray-400">{t("content.form.preview")}</p>
            {previewBanner &&
              (previewBanner.placement === "top_strip" ? (
                <TopStripBanner banner={previewBanner} />
              ) : (
                <BannerCard banner={previewBanner} />
              ))}
            {previewSection && <ContentSection section={previewSection} />}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || uploading}
            className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white font-bold flex items-center justify-center gap-2 hover:shadow-cta-sm transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            {editingId
              ? t("content.form.saveChanges")
              : tab === "banner"
                ? t("content.form.createBanner")
                : t("content.form.createSection")}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="h-12 px-6 rounded-xl bg-white/[0.05] text-gray-300 font-medium hover:bg-white/[0.1] transition-all"
            >
              {t("content.form.cancel")}
            </button>
          )}
        </div>
      </form>

      {/* Lists */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-4 animate-pulse">
              <div className="h-32 bg-white/[0.05] rounded-xl mb-3" />
              <div className="h-4 bg-white/[0.05] rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-gray-400">
          {tab === "banner" ? t("content.list.emptyBanners") : t("content.list.emptySections")}
        </div>
      ) : (
        <div className="space-y-6">
          {groupByPlacement(rows).map(([placement, group]) => (
            <div key={placement} className="space-y-3">
              <h2 className="text-sm font-semibold text-[var(--brand)] uppercase tracking-wider">
                {t(`placement.${placement}`)}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {group.map((row, index) => {
                  const busy = busyId === row.id;
                  const isBanner = tab === "banner";
                  const status = rowStatus(row);
                  const sectionRow = isBanner ? null : (row as SectionRow);
                  return (
                    <div key={row.id} className="glass rounded-2xl p-4 space-y-3">
                      <div className="flex gap-4">
                        {row.image_url && (
                          <div className="relative w-24 h-20 rounded-xl overflow-hidden shrink-0 bg-white/[0.03]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={row.image_url}
                              alt={row.title ?? ""}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold truncate">
                            {row.title || t("content.list.noTitle")}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px] text-gray-400">
                              {isBanner
                                ? t(`placement.${row.placement}`)
                                : t(`sectionType.${sectionRow!.section_type}`)}
                            </span>
                            {!isBanner && (
                              <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px] text-gray-400">
                                {t(`placement.${row.placement}`)}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] ${status.className}`}
                            >
                              {t(status.labelKey)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={index === 0 || busy}
                            onClick={() => move(group, index, -1)}
                            className="p-2 rounded-lg bg-white/[0.05] text-gray-400 disabled:opacity-40"
                            title={t("content.action.moveUp")}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={index === group.length - 1 || busy}
                            onClick={() => move(group, index, 1)}
                            className="p-2 rounded-lg bg-white/[0.05] text-gray-400 disabled:opacity-40"
                            title={t("content.action.moveDown")}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              patchItem(row.id, { is_active: !row.is_active }).then((ok) => {
                                if (ok) {
                                  setMessage({
                                    type: "success",
                                    textKey: row.is_active
                                      ? "content.msg.unpublished"
                                      : "content.msg.published",
                                  });
                                }
                              })
                            }
                            className={`px-3 rounded-lg text-xs font-medium ${
                              row.is_active
                                ? "bg-[var(--brand)]/15 text-[var(--brand)]"
                                : "bg-white/[0.05] text-gray-400"
                            } disabled:opacity-40`}
                            title={
                              row.is_active ? t("content.action.unpublish") : t("content.action.publish")
                            }
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startEdit(row)}
                            className="p-2 rounded-lg bg-white/[0.05] text-gray-400 hover:text-white disabled:opacity-40"
                            title={t("content.action.edit")}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDelete(row.id)}
                            className="p-2 rounded-lg bg-red-500/10 text-red-400 disabled:opacity-50"
                            title={t("content.action.delete")}
                          >
                            {busy ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-[var(--brand)]/20 to-[var(--brand-2)]/20 text-[var(--brand)] border border-[var(--brand)]/30"
          : "bg-white/[0.03] text-gray-400 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
