"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { useLanguage } from "@/app/lib/language-context";
import ConfirmDialog from "./ConfirmDialog";
import MockupPreview from "./MockupPreview";
import StatusBadge from "./StatusBadge";
import { isMappedErrorCode } from "@/lib/design-studio/error-codes";
import { applyViewState } from "@/lib/design-studio/placement";
import type { ProductRowView } from "@/lib/design-studio/product-input";
import { useTemplateCatalog } from "./useTemplateCatalog";
import type {
  MockupRecord,
  PrintableArea,
  TemplateView,
  Transform,
  ViewState,
} from "@/lib/design-studio/types";

type Props = {
  designId: string;
  fileId: string | null;
  artworkUrl: string | null;
  artworkReady: boolean;
  /** The design's base transform — each view applies its own view state on top. */
  baseTransform: Transform;
  area: PrintableArea;
  /** Server truth: never mutated locally, only replaced by PATCH responses. */
  row: ProductRowView;
  onRowChange: (row: ProductRowView) => void;
  onRowRemoved: (rowId: string) => void;
};

/** Placement inputs hold raw text while typing; committed numbers on blur. */
type PlacementText = { x: string; y: string; scale: string; rotation: string };

const DEFAULT_VIEW_STATE: ViewState = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  lockAspect: false,
};

/** Map an API error payload to a translated message (code → studio_err_*). */
function mapPayloadError(
  payload: unknown,
  fallback: string,
  t: (key: string) => string
): string {
  const body = payload as { code?: string; message?: string } | null;
  if (typeof body?.code === "string" && isMappedErrorCode(body.code)) {
    return t(`studio_err_${body.code}`);
  }
  if (typeof body?.message === "string" && body.message) return body.message;
  return fallback;
}

function toText(state: ViewState): PlacementText {
  return {
    x: String(state.x),
    y: String(state.y),
    scale: String(state.scale),
    rotation: String(state.rotation),
  };
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * One product's configuration card: colors, sizes, per-product placement and
 * generated mockups for a design×template row.
 *
 * Every mutation is a single allow-listed PATCH (`view_states` /
 * `selected_colors` / `selected_sizes`) and the SERVER row is the only truth:
 * on success the returned row replaces local state, on failure the card just
 * shows the error and keeps displaying the last confirmed row — no optimistic
 * drift, no way to touch approval/fulfillment fields from here.
 */
export default function ProductConfigCard({
  designId,
  fileId,
  artworkUrl,
  artworkReady,
  baseTransform,
  area,
  row,
  onRowChange,
  onRowRemoved,
}: Props) {
  const { t, locale } = useLanguage();
  const { getToken } = useAuth();

  const { byKey: getTemplate } = useTemplateCatalog();
  const template = getTemplate(row.template_key);

  const [busyField, setBusyField] = useState<"colors" | "sizes" | "placement" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, PlacementText>>({});

  // Latest-value refs: mutation callbacks stay identity-stable across renders
  // (written in an effect, never during render).
  const rowRef = useRef(row);
  const callbacksRef = useRef({ onRowChange, onRowRemoved, getToken, t });
  useEffect(() => {
    rowRef.current = row;
    callbacksRef.current = { onRowChange, onRowRemoved, getToken, t };
  });

  const patch = useCallback(
    async (body: Record<string, unknown>): Promise<ProductRowView | null> => {
      const { getToken: tokenGetter, t: translate } = callbacksRef.current;
      const token = await tokenGetter();
      if (!token) {
        setError(translate("studio_err_generic"));
        return null;
      }
      let response: Response;
      let payload: unknown = null;
      try {
        response = await fetch(`/api/designs/${designId}/products/${row.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        payload = await response.json().catch(() => null);
      } catch {
        setError(translate("studio_err_network"));
        return null;
      }
      if (!response.ok || (payload as { success?: boolean } | null)?.success !== true) {
        setError(mapPayloadError(payload, translate("studio_err_generic"), translate));
        return null;
      }
      setError(null);
      const product = (payload as { product?: ProductRowView } | null)?.product;
      if (product) callbacksRef.current.onRowChange(product);
      return product ?? null;
    },
    [designId, row.id]
  );

  const toggleColor = async (key: string) => {
    if (busyField) return;
    const next = row.selected_colors.includes(key)
      ? row.selected_colors.filter((item) => item !== key)
      : [...row.selected_colors, key];
    setBusyField("colors");
    await patch({ selected_colors: next });
    setBusyField(null);
  };

  const toggleSize = async (key: string) => {
    if (busyField) return;
    const next = row.selected_sizes.includes(key)
      ? row.selected_sizes.filter((item) => item !== key)
      : [...row.selected_sizes, key];
    setBusyField("sizes");
    await patch({ selected_sizes: next });
    setBusyField(null);
  };

  const serverState = (viewKey: string): ViewState =>
    row.view_states[viewKey] ?? DEFAULT_VIEW_STATE;
  const textFor = (viewKey: string): PlacementText =>
    drafts[viewKey] ?? toText(serverState(viewKey));

  const setField = (viewKey: string, field: keyof PlacementText, value: string) =>
    setDrafts((prev) => ({
      ...prev,
      [viewKey]: {
        ...(prev[viewKey] ?? toText(serverState(viewKey))),
        [field]: value,
      },
    }));

  const clearDraft = (viewKey: string) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[viewKey];
      return next;
    });

  /** Blur-commit: unparseable text silently reverts; numbers are the server's call. */
  const commit = async (viewKey: string) => {
    const text = drafts[viewKey];
    if (!text || busyField) return;
    const x = parseNumber(text.x);
    const y = parseNumber(text.y);
    const scale = parseNumber(text.scale);
    const rotation = parseNumber(text.rotation);
    if (x === null || y === null || scale === null || rotation === null) {
      clearDraft(viewKey); // never send junk (NaN serializes to null server-side)
      return;
    }
    const next: ViewState = {
      x,
      y,
      scale,
      rotation,
      lockAspect: serverState(viewKey).lockAspect,
    };
    const server = row.view_states[viewKey];
    if (
      server &&
      server.x === next.x &&
      server.y === next.y &&
      server.scale === next.scale &&
      server.rotation === next.rotation
    ) {
      clearDraft(viewKey);
      return;
    }
    setBusyField("placement");
    const viewStates = { ...row.view_states };
    if (next.x === 0 && next.y === 0 && next.scale === 1 && next.rotation === 0) {
      delete viewStates[viewKey]; // back to inheriting the design placement
    } else {
      viewStates[viewKey] = next;
    }
    await patch({ view_states: viewStates });
    setBusyField(null);
    clearDraft(viewKey); // success → server values; failure → revert to them
  };

  const resetView = async (viewKey: string) => {
    if (busyField || !row.view_states[viewKey]) return;
    setBusyField("placement");
    const viewStates = { ...row.view_states };
    delete viewStates[viewKey];
    await patch({ view_states: viewStates });
    setBusyField(null);
    clearDraft(viewKey);
  };

  const handleGenerated = useCallback((record: MockupRecord) => {
    const current = rowRef.current;
    const merged = [
      ...current.mockups.filter(
        (item) => !(item.view === record.view && item.color === record.color)
      ),
      record,
    ];
    callbacksRef.current.onRowChange({ ...current, mockups: merged });
  }, []);

  const confirmDelete = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      const { getToken: tokenGetter, t: translate } = callbacksRef.current;
      const token = await tokenGetter();
      if (!token) {
        setError(translate("studio_err_generic"));
        return;
      }
      const response = await fetch(`/api/designs/${designId}/products/${row.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || (payload as { success?: boolean } | null)?.success !== true) {
        setError(mapPayloadError(payload, translate("studio_err_generic"), translate));
        return;
      }
      onRowRemoved(row.id);
    } catch {
      setError(callbacksRef.current.t("studio_err_network"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const combos = useMemo(() => {
    if (!template) return [];
    const colors = row.selected_colors.slice(0, 3);
    const out: { view: string; color: string }[] = [];
    for (const view of template.views) {
      for (const color of colors) out.push({ view: view.key, color });
    }
    // Cap the grid (views × first 3 colors, ≤6 cells) so a card never fires a
    // burst of generations that outruns the mockup rate limit.
    return out.slice(0, 6);
  }, [template, row.selected_colors]);

  const viewLabel = (view: TemplateView): string => {
    const key = `product_view_${view.label.toLowerCase()}`;
    const text = t(key);
    return text === key ? view.label : text;
  };

  const swatchName = (item: { name: string; nameAr?: string }) =>
    locale === "ar" && item.nameAr ? item.nameAr : item.name;

  // Registry drift is an honest environment error, not a crash.
  if (!template) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200/90">
        {t("studio_err_templates_not_seeded")}
      </div>
    );
  }

  const chipClass = (selected: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
      selected
        ? "border-pink-500/60 bg-pink-500/10 text-white"
        : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/25"
    }`;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
      {/* Header: name, category, review status, saving indicator */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-white">
          {locale === "ar" ? template.nameAr : template.name}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {t(`product_cat_${template.category}`)}
        </span>
        <StatusBadge status={row.status} label={t(`status_${row.status}`)} />
        {busyField ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("product_saving")}
          </span>
        ) : null}
      </div>

      {/* POD boundary — never claims manufacturable until fulfillment is configured */}
      <p
        className={`rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
          row.fulfillment_mode === "unconfigured"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-200/90"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90"
        }`}
      >
        {row.fulfillment_mode === "unconfigured"
          ? t("product_fulfillment_unconfigured")
          : t("product_fulfillment_configured")}
      </p>

      {row.status === "rejected" && row.rejection_reason ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-rose-200/90">
          {row.rejection_reason}
        </p>
      ) : null}

      {/* Colors */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-secondary font-bold mb-2">
          {t("product_colors")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {template.colors.map((color) => (
            <button
              key={color.key}
              type="button"
              disabled={busyField !== null}
              onClick={() => void toggleColor(color.key)}
              className={chipClass(row.selected_colors.includes(color.key))}
            >
              <span
                className="h-3 w-3 rounded-full border border-white/25"
                style={{ backgroundColor: color.hex }}
              />
              {swatchName(color)}
            </button>
          ))}
        </div>
      </div>

      {/* Sizes */}
      {template.sizes.length > 0 ? (
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-secondary font-bold mb-2">
            {t("product_sizes")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {template.sizes.map((size) => (
              <button
                key={size.key}
                type="button"
                disabled={busyField !== null}
                onClick={() => void toggleSize(size.key)}
                title={size.name}
                className={chipClass(row.selected_sizes.includes(size.key))}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Generated mockup previews */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-secondary font-bold mb-2">
          {t("product_mockups")}
        </p>
        {row.selected_colors.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("product_select_color_hint")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {combos.map(({ view, color }) => {
              const viewMeta = template.views.find((item) => item.key === view);
              const colorMeta = template.colors.find((item) => item.key === color);
              if (!viewMeta || !colorMeta) return null;
              const caption = `${viewLabel(viewMeta)} · ${swatchName(colorMeta)}`;
              return (
                <MockupPreview
                  key={`${view}-${color}`}
                  designId={designId}
                  fileId={fileId}
                  templateKey={template.key}
                  viewKey={view}
                  colorKey={color}
                  transform={applyViewState(baseTransform, row.view_states[view] ?? null)}
                  area={area}
                  artworkUrl={artworkUrl}
                  artworkReady={artworkReady}
                  existing={
                    row.mockups.find((item) => item.view === view && item.color === color) ??
                    null
                  }
                  caption={caption}
                  onGenerated={handleGenerated}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Per-product placement — one design, many products, independent tweaks */}
      <details className="rounded-xl border border-white/10 bg-white/[0.02]">
        <summary className="cursor-pointer select-none px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-white transition-colors">
          {t("product_placement")}
        </summary>
        <div className="space-y-2 border-t border-white/[0.06] p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("product_placement_hint")}
          </p>
          {template.views.map((view) => {
            const text = textFor(view.key);
            const hasOverride = Boolean(row.view_states[view.key]);
            return (
              <div
                key={view.key}
                className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                    {viewLabel(view)}
                  </span>
                  {hasOverride ? (
                    <button
                      type="button"
                      disabled={busyField !== null}
                      onClick={() => void resetView(view.key)}
                      className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-white transition-colors disabled:opacity-50"
                    >
                      {t("product_placement_reset")}
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["x", "product_offset_x"],
                      ["y", "product_offset_y"],
                      ["scale", "product_scale"],
                      ["rotation", "product_rotation"],
                    ] as const
                  ).map(([field, labelKey]) => (
                    <label key={field} className="block">
                      <span className="mb-1 block text-[10px] text-muted-foreground">
                        {t(labelKey)}
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={text[field]}
                        disabled={busyField !== null}
                        onChange={(event) => setField(view.key, field, event.target.value)}
                        onBlur={() => void commit(view.key)}
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-white focus:border-pink-500/50 focus:outline-none transition-colors disabled:opacity-60"
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {t("product_delete")}
      </button>

      <ConfirmDialog
        open={deleteOpen}
        title={t("product_delete_title")}
        body={t("product_delete_body")}
        confirmLabel={t("product_delete")}
        cancelLabel={t("common_cancel")}
        busy={deleteBusy}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
