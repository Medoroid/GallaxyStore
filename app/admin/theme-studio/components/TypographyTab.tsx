"use client";

import type { ThemeTypography } from "@/lib/themes/types";
import { FONT_WHITELIST } from "@/lib/themes/validate";
import { Field, NumberInput, RangeInput, Section, SelectInput, Toggle } from "./editorFields";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Typography tab — fonts (strict whitelist, all loaded via the Google Fonts
 * stylesheet), weights, base size and heading scale. Null line-height /
 * letter-spacing mean "browser default" (the toggle turns them back on).
 */

type TypographyTabProps = {
  typography: ThemeTypography;
  onChange: (typography: ThemeTypography) => void;
};

const FONT_OPTIONS = FONT_WHITELIST.map((font) => ({ value: font, label: font }));
const WEIGHT_OPTIONS = [300, 400, 500, 600, 700, 800, 900].map((weight) => ({
  value: String(weight),
  label: String(weight),
}));

export default function TypographyTab({ typography, onChange }: TypographyTabProps) {
  const { t } = useAdminT();
  const set = <K extends keyof ThemeTypography>(key: K, value: ThemeTypography[K]) =>
    onChange({ ...typography, [key]: value });

  return (
    <div className="space-y-6">
      <Section
        title={t("typography.section.fonts.title")}
        description={t("typography.section.fonts.desc")}
      >
        <Field label={t("typography.field.headingFont")}>
          <SelectInput
            value={typography.headingFont}
            onChange={(v) => set("headingFont", v)}
            options={FONT_OPTIONS}
          />
        </Field>
        <Field label={t("typography.field.bodyFont")}>
          <SelectInput
            value={typography.bodyFont}
            onChange={(v) => set("bodyFont", v)}
            options={FONT_OPTIONS}
          />
        </Field>
        <Field label={t("typography.field.headingWeight")}>
          <SelectInput
            value={String(typography.headingWeight)}
            onChange={(v) => set("headingWeight", Number(v))}
            options={WEIGHT_OPTIONS}
          />
        </Field>
        <Field label={t("typography.field.bodyWeight")}>
          <SelectInput
            value={String(typography.bodyWeight)}
            onChange={(v) => set("bodyWeight", Number(v))}
            options={WEIGHT_OPTIONS}
          />
        </Field>
      </Section>

      <Section
        title={t("typography.section.scale.title")}
        description={t("typography.section.scale.desc")}
      >
        <Field label={t("typography.field.baseSize")} hint="14–20 px">
          <RangeInput
            value={typography.baseSize}
            onChange={(v) => set("baseSize", v)}
            min={14}
            max={20}
            step={1}
            suffix="px"
          />
        </Field>
        <Field
          label={t("typography.field.letterSpacingHeading")}
          hint={t("typography.field.letterSpacingHeading.hint")}
        >
          <RangeInput
            value={typography.letterSpacingHeading}
            onChange={(v) => set("letterSpacingHeading", v)}
            min={-0.5}
            max={0.5}
            step={0.01}
            suffix="em"
          />
        </Field>
        <Field label={t("typography.field.h1")}>
          <NumberInput value={typography.h1} onChange={(v) => set("h1", v)} min={1.2} max={4} step={0.1} suffix="em" />
        </Field>
        <Field label={t("typography.field.h2")}>
          <NumberInput value={typography.h2} onChange={(v) => set("h2", v)} min={1} max={3} step={0.1} suffix="em" />
        </Field>
        <Field label={t("typography.field.h3")}>
          <NumberInput value={typography.h3} onChange={(v) => set("h3", v)} min={0.9} max={2.5} step={0.05} suffix="em" />
        </Field>
        <Field label={t("typography.field.h4")}>
          <NumberInput value={typography.h4} onChange={(v) => set("h4", v)} min={0.8} max={2} step={0.05} suffix="em" />
        </Field>
      </Section>

      <Section
        title={t("typography.section.rhythm.title")}
        description={t("typography.section.rhythm.desc")}
      >
        <div className="sm:col-span-2 space-y-4">
          <Toggle
            label={t("typography.toggle.lineHeight")}
            checked={typography.lineHeightBody !== null}
            onChange={(on) => set("lineHeightBody", on ? 1.6 : null)}
          />
          {typography.lineHeightBody !== null && (
            <Field label={t("typography.field.lineHeight")} hint={t("typography.field.lineHeight.hint")}>
              <RangeInput
                value={typography.lineHeightBody}
                onChange={(v) => set("lineHeightBody", v)}
                min={1}
                max={2.5}
                step={0.05}
              />
            </Field>
          )}
          <Toggle
            label={t("typography.toggle.letterSpacingBody")}
            checked={typography.letterSpacingBody !== null}
            onChange={(on) => set("letterSpacingBody", on ? 0 : null)}
          />
          {typography.letterSpacingBody !== null && (
            <Field label={t("typography.field.letterSpacing")} hint={t("typography.field.letterSpacing.hint")}>
              <RangeInput
                value={typography.letterSpacingBody}
                onChange={(v) => set("letterSpacingBody", v)}
                min={-0.2}
                max={1}
                step={0.005}
                suffix="em"
              />
            </Field>
          )}
        </div>
      </Section>
    </div>
  );
}
