"use client";

import type { ThemeComponents } from "@/lib/themes/types";
import { ColorField, Field, RangeInput, Section, TextInput } from "./editorFields";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Components tab — the shape of the UI: global radius, glass panels, sticky
 * nav gradient and the four glow shadows. Shadow strings are charset-limited
 * by the validator (no url(), quotes, braces or semicolons), so the hint
 * spells out what a safe value looks like.
 */

type ComponentsTabProps = {
  components: ThemeComponents;
  onChange: (components: ThemeComponents) => void;
};

export default function ComponentsTab({ components, onChange }: ComponentsTabProps) {
  const { t } = useAdminT();
  const shadowHint = t("components.shadow.hint");
  const set = <K extends keyof ThemeComponents>(key: K, value: ThemeComponents[K]) =>
    onChange({ ...components, [key]: value });

  return (
    <div className="space-y-6">
      <Section
        title={t("components.section.shape.title")}
        description={t("components.section.shape.desc")}
      >
        <Field label={t("components.field.radius")}>
          <RangeInput
            value={components.radius}
            onChange={(v) => set("radius", v)}
            min={0}
            max={32}
            step={1}
            suffix="px"
          />
        </Field>
        <Field label={t("components.field.glassBlur")}>
          <RangeInput
            value={components.glassBlur}
            onChange={(v) => set("glassBlur", v)}
            min={0}
            max={40}
            step={1}
            suffix="px"
          />
        </Field>
        <Field label={t("components.field.navBlur")}>
          <RangeInput
            value={components.navBlur}
            onChange={(v) => set("navBlur", v)}
            min={0}
            max={40}
            step={1}
            suffix="px"
          />
        </Field>
      </Section>

      <Section
        title={t("components.section.glass.title")}
        description={t("components.section.glass.desc")}
      >
        <ColorField label={t("components.field.glassFrom")} value={components.glassFrom} onChange={(v) => set("glassFrom", v)} />
        <ColorField label={t("components.field.glassTo")} value={components.glassTo} onChange={(v) => set("glassTo", v)} />
        <ColorField label={t("components.field.glassBorder")} value={components.glassBorder} onChange={(v) => set("glassBorder", v)} />
        <ColorField label={t("components.field.ctaGlow")} value={components.ctaGlow} onChange={(v) => set("ctaGlow", v)} />
      </Section>

      <Section
        title={t("components.section.nav.title")}
        description={t("components.section.nav.desc")}
      >
        <ColorField label={t("components.field.navFrom")} value={components.navFrom} onChange={(v) => set("navFrom", v)} />
        <ColorField label={t("components.field.navTo")} value={components.navTo} onChange={(v) => set("navTo", v)} />
        <ColorField label={t("components.field.navBorder")} value={components.navBorder} onChange={(v) => set("navBorder", v)} />
      </Section>

      <Section title={t("components.section.shadow.title")} description={shadowHint}>
        <Field label={t("components.field.shadowGlass")} hint={shadowHint}>
          <TextInput value={components.shadowGlass} onChange={(v) => set("shadowGlass", v)} />
        </Field>
        <Field label={t("components.field.shadowNeon")} hint={shadowHint}>
          <TextInput value={components.shadowNeon} onChange={(v) => set("shadowNeon", v)} />
        </Field>
        <Field label={t("components.field.shadowPink")} hint={shadowHint}>
          <TextInput value={components.shadowPink} onChange={(v) => set("shadowPink", v)} />
        </Field>
        <Field label={t("components.field.shadowGold")} hint={shadowHint}>
          <TextInput value={components.shadowGold} onChange={(v) => set("shadowGold", v)} />
        </Field>
      </Section>
    </div>
  );
}
