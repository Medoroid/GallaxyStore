"use client";

import { Toggle } from "./editorFields";
import type { ThemeDecorations } from "@/lib/themes/types";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Decorations tab — the seasonal overlay controls.
 *
 * Only booleans + a density level ever leave this tab: element counts are
 * capped in ThemeDecorations (density 1/2/3 → 6/12/18 of each kind, lanterns
 * ≤ 8, ribbons ≤ 10), motion lives in globals.css keyframes, and everything
 * freezes under prefers-reduced-motion. There is no free-form CSS here by
 * design.
 */

type DecorationsTabProps = {
  decorations: ThemeDecorations;
  onChange: (decorations: ThemeDecorations) => void;
};

const EFFECTS: Array<keyof ThemeDecorations> = [
  "snowflakes",
  "particles",
  "lanterns",
  "crescent",
  "ribbons",
  "animatedGradient",
  "cornerOrnaments",
];

const DENSITY_DESC_KEYS: Record<number, string> = {
  1: "decorations.density.descLight",
  2: "decorations.density.descMedium",
  3: "decorations.density.descHeavy",
};

const DENSITY_BUTTON_KEYS: Record<number, string> = {
  1: "decorations.density.light",
  2: "decorations.density.medium",
  3: "decorations.density.heavy",
};

export default function DecorationsTab({ decorations, onChange }: DecorationsTabProps) {
  const { t } = useAdminT();
  const set = <K extends keyof ThemeDecorations>(key: K, value: ThemeDecorations[K]) =>
    onChange({ ...decorations, [key]: value });

  const activeCount = EFFECTS.filter(
    (effect) => decorations[effect] === true
  ).length;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">{t("decorations.overlay.title")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {activeCount === 1
                ? t("decorations.overlay.descOne")
                : t("decorations.overlay.descMany").replace("{count}", String(activeCount))}
            </p>
          </div>
          <Toggle
            label={decorations.enabled ? t("decorations.toggle.on") : t("decorations.toggle.off")}
            checked={decorations.enabled}
            onChange={(on) => set("enabled", on)}
          />
        </div>

        <div
          className={`grid sm:grid-cols-2 gap-3 transition-opacity ${
            decorations.enabled ? "opacity-100" : "opacity-40 pointer-events-none"
          }`}
        >
          {EFFECTS.map((effect) => (
            <div
              key={effect}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <Toggle
                label={t(`decorations.effect.${effect}`)}
                hint={t(`decorations.effect.${effect}.hint`)}
                checked={Boolean(decorations[effect])}
                onChange={(on) => set(effect, on as ThemeDecorations[typeof effect])}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">{t("decorations.density.title")}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {t("decorations.density.desc").replace(
              "{label}",
              t(DENSITY_DESC_KEYS[decorations.density])
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((level) => (
            <button
              key={level}
              onClick={() => set("density", level as ThemeDecorations["density"])}
              disabled={!decorations.enabled}
              className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 ${
                decorations.density === level
                  ? "bg-[var(--brand)]/20 text-[var(--brand)] border border-[var(--brand)]/40"
                  : "bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:text-white"
              }`}
            >
              {t(DENSITY_BUTTON_KEYS[level])}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-600">{t("decorations.footer.note")}</p>
      </section>
    </div>
  );
}
