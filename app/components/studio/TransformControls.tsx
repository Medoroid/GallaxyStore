"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlertTriangle,
  Info,
  Lock,
  Maximize,
  Redo2,
  RotateCw,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { AlignDirection, PrintableArea, Transform } from "@/lib/design-studio/types";

export type ControlWarning = {
  id: string;
  tone: "warn" | "error";
  text: string;
};

type Props = {
  transform: Transform;
  area: PrintableArea;
  aspectLocked: boolean;
  zoom: number;
  effectiveDpi: number | null;
  warnings: ControlWarning[];
  canUndo: boolean;
  canRedo: boolean;
  t: (key: string) => string;
  onTransformCommit: (t: Transform) => void;
  onAspectToggle: () => void;
  onFitArea: () => void;
  onAlign: (dir: AlignDirection) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomBy: (factor: number) => void;
  onFitView: () => void;
};

const NUM_CLASS =
  "w-full px-2.5 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-pink-500/50 transition-colors";

const ALIGN_BUTTONS: Array<{
  dir: AlignDirection;
  icon: typeof AlignLeft;
  labelKey: string;
}> = [
  { dir: "left", icon: AlignLeft, labelKey: "studio_align_left" },
  { dir: "centerX", icon: AlignCenter, labelKey: "studio_align_hcenter" },
  { dir: "right", icon: AlignRight, labelKey: "studio_align_right" },
  { dir: "top", icon: AlignVerticalJustifyStart, labelKey: "studio_align_top" },
  { dir: "middleY", icon: AlignVerticalJustifyCenter, labelKey: "studio_align_vcenter" },
  { dir: "bottom", icon: AlignVerticalJustifyEnd, labelKey: "studio_align_bottom" },
];

function format(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "0";
}

/** Numeric field with a local draft so typing "1." never gets clobbered. */
function NumInput({
  label,
  value,
  suffix,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  suffix?: string;
  onCommit: (next: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(() => format(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(format(value));
  }, [value]);

  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </span>
      <span className="relative block">
        <input
          type="number"
          inputMode="decimal"
          step={0.1}
          value={draft}
          disabled={disabled}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
            setDraft(format(value));
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            const next = Number.parseFloat(event.target.value);
            if (Number.isFinite(next)) onCommit(next);
          }}
          className={`${NUM_CLASS} ${suffix ? "pe-8" : ""}`}
        />
        {suffix && (
          <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-[0.18em] text-secondary font-bold mb-3">
      {children}
    </h3>
  );
}

/**
 * Right-hand editor panel: warnings, numeric placement, alignment, zoom and
 * undo/redo. Every mutation flows through the page's commit path so history,
 * dirty tracking and autosave stay consistent.
 */
export default function TransformControls({
  transform,
  area,
  aspectLocked,
  zoom,
  effectiveDpi,
  warnings,
  canUndo,
  canRedo,
  t,
  onTransformCommit,
  onAspectToggle,
  onFitArea,
  onAlign,
  onUndo,
  onRedo,
  onZoomBy,
  onFitView,
}: Props) {
  const apply = (patch: Partial<Transform>) =>
    onTransformCommit({ ...transform, ...patch });

  return (
    <div className="space-y-5">
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((warning) => (
            <div
              key={warning.id}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                warning.tone === "error"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-200"
              }`}
            >
              {warning.tone === "error" ? (
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              ) : (
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              )}
              <span>{warning.text}</span>
            </div>
          ))}
        </div>
      )}

      <section>
        <SectionTitle>{t("studio_placement")}</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          <NumInput
            label={t("studio_pos_x")}
            value={transform.cx}
            suffix={t("studio_inches")}
            onCommit={(next) => apply({ cx: next })}
          />
          <NumInput
            label={t("studio_pos_y")}
            value={transform.cy}
            suffix={t("studio_inches")}
            onCommit={(next) => apply({ cy: next })}
          />
          <NumInput
            label={t("studio_width")}
            value={transform.width}
            suffix={t("studio_inches")}
            onCommit={(next) =>
              apply(
                aspectLocked && transform.width > 0 && transform.height > 0
                  ? {
                      width: next,
                      height: (next * transform.height) / transform.width,
                    }
                  : { width: next }
              )
            }
          />
          <NumInput
            label={t("studio_height")}
            value={transform.height}
            suffix={t("studio_inches")}
            onCommit={(next) =>
              apply(
                aspectLocked && transform.width > 0 && transform.height > 0
                  ? {
                      height: next,
                      width: (next * transform.width) / transform.height,
                    }
                  : { height: next }
              )
            }
          />
          <NumInput
            label={t("studio_rotation")}
            value={transform.rotation}
            suffix="°"
            onCommit={(next) => apply({ rotation: next })}
          />
          <button
            type="button"
            onClick={onAspectToggle}
            aria-pressed={aspectLocked}
            className={`self-end h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              aspectLocked
                ? "border-pink-500/50 bg-pink-500/15 text-pink-200"
                : "border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:text-white"
            }`}
          >
            {aspectLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {t("studio_aspect_lock")}
          </button>
        </div>
      </section>

      <section>
        <SectionTitle>{t("studio_align")}</SectionTitle>
        <div className="grid grid-cols-6 gap-1.5">
          {ALIGN_BUTTONS.map(({ dir, icon: Icon, labelKey }) => (
            <button
              key={dir}
              type="button"
              onClick={() => onAlign(dir)}
              aria-label={t(labelKey)}
              title={t(labelKey)}
              className="h-9 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:text-white hover:border-white/25 transition-colors"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onFitArea}
          className="mt-2.5 w-full h-9 inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-muted-foreground hover:text-white hover:border-white/25 transition-colors"
        >
          <Maximize className="h-3.5 w-3.5" />
          {t("studio_fit_area")}
        </button>
      </section>

      <section>
        <SectionTitle>{t("studio_zoom")}</SectionTitle>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onZoomBy(1 / 1.25)}
            aria-label={t("studio_zoom_out")}
            title={t("studio_zoom_out")}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:text-white transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="flex-1 h-9 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs font-semibold tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onZoomBy(1.25)}
            aria-label={t("studio_zoom_in")}
            title={t("studio_zoom_in")}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:text-white transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onFitView}
            aria-label={t("studio_zoom_fit")}
            title={t("studio_zoom_fit")}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:text-white transition-colors"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-2.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t("studio_undo")}
            title={t("studio_undo")}
            className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-muted-foreground hover:text-white transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t("studio_undo")}
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label={t("studio_redo")}
            title={t("studio_redo")}
            className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-muted-foreground hover:text-white transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Redo2 className="h-3.5 w-3.5" />
            {t("studio_redo")}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("studio_effective_dpi")}
          </p>
          <p
            className={`text-sm font-bold mt-0.5 ${
              effectiveDpi === null
                ? "text-muted-foreground"
                : effectiveDpi < 150
                  ? "text-amber-300"
                  : "text-emerald-300"
            }`}
          >
            {effectiveDpi === null ? "—" : `${effectiveDpi} ${t("studio_dpi")}`}
          </p>
        </div>
        <div className="text-end">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("studio_printable_area")}
          </p>
          <p className="text-sm font-bold mt-0.5 tabular-nums">
            {area.widthIn} × {area.heightIn} {t("studio_inches")}
          </p>
        </div>
        <RotateCw className="h-4 w-4 text-muted-foreground/40 shrink-0" aria-hidden />
      </section>
    </div>
  );
}
