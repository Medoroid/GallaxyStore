"use client";

import type { ThemeColors } from "@/lib/themes/types";
import { ColorField, Section } from "./editorFields";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Colors tab — the 17 palette tokens, grouped by the role they play in the
 * design system (see lib/themes/css.ts for exactly which CSS variables each
 * one feeds). Labels describe the visual role, not the variable name, so an
 * operator can theme the store without reading code.
 */

type ColorsTabProps = {
  colors: ThemeColors;
  onChange: (colors: ThemeColors) => void;
};

export default function ColorsTab({ colors, onChange }: ColorsTabProps) {
  const { t } = useAdminT();
  const set = (key: keyof ThemeColors, value: string) =>
    onChange({ ...colors, [key]: value });

  return (
    <div className="space-y-6">
      <Section
        title={t("colors.section.brand.title")}
        description={t("colors.section.brand.desc")}
      >
        <ColorField label={t("colors.field.primary")} value={colors.primary} onChange={(v) => set("primary", v)} />
        <ColorField
          label={t("colors.field.primaryAlt")}
          value={colors.primaryAlt}
          onChange={(v) => set("primaryAlt", v)}
          hint={t("colors.field.primaryAlt.hint")}
        />
        <ColorField
          label={t("colors.field.secondary")}
          value={colors.secondary}
          onChange={(v) => set("secondary", v)}
          hint={t("colors.field.secondary.hint")}
        />
        <ColorField label={t("colors.field.accent")} value={colors.accent} onChange={(v) => set("accent", v)} />
        <ColorField
          label={t("colors.field.hover")}
          value={colors.hover}
          onChange={(v) => set("hover", v)}
          hint={t("colors.field.hover.hint")}
        />
        <ColorField label={t("colors.field.link")} value={colors.link} onChange={(v) => set("link", v)} />
      </Section>

      <Section
        title={t("colors.section.surfaces.title")}
        description={t("colors.section.surfaces.desc")}
      >
        <ColorField
          label={t("colors.field.background")}
          value={colors.background}
          onChange={(v) => set("background", v)}
        />
        <ColorField label={t("colors.field.surface")} value={colors.surface} onChange={(v) => set("surface", v)} />
        <ColorField label={t("colors.field.card")} value={colors.card} onChange={(v) => set("card", v)} />
        <ColorField label={t("colors.field.border")} value={colors.border} onChange={(v) => set("border", v)} />
      </Section>

      <Section title={t("colors.section.text.title")}>
        <ColorField
          label={t("colors.field.textPrimary")}
          value={colors.textPrimary}
          onChange={(v) => set("textPrimary", v)}
        />
        <ColorField
          label={t("colors.field.textSecondary")}
          value={colors.textSecondary}
          onChange={(v) => set("textSecondary", v)}
        />
      </Section>

      <Section
        title={t("colors.section.status.title")}
        description={t("colors.section.status.desc")}
      >
        <ColorField label={t("colors.field.success")} value={colors.success} onChange={(v) => set("success", v)} />
        <ColorField label={t("colors.field.warning")} value={colors.warning} onChange={(v) => set("warning", v)} />
        <ColorField label={t("colors.field.error")} value={colors.error} onChange={(v) => set("error", v)} />
      </Section>

      <Section title={t("colors.section.sale.title")}>
        <ColorField
          label={t("colors.field.saleBg")}
          value={colors.saleBg}
          onChange={(v) => set("saleBg", v)}
        />
        <ColorField
          label={t("colors.field.saleFg")}
          value={colors.saleFg}
          onChange={(v) => set("saleFg", v)}
        />
      </Section>
    </div>
  );
}
