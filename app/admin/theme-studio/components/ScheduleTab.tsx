"use client";

import type { ActivationMode, ThemeStatus } from "@/lib/themes/types";
import { Field, NumberInput, RangeInput, Section, SelectInput, Toggle } from "./editorFields";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Schedule tab — lifecycle + server-side scheduling fields.
 *
 * The API folds these into the same PATCH as the config (validated in
 * app/api/admin/_lib/themeAdmin.js: ISO dates, ends_at > starts_at, IANA
 * timezone). Recurring means "repeat the window every year in this
 * timezone" — the resolver handles Dec→Jan spans and DST via a two-pass
 * Intl offset probe, so the admin only picks dates.
 */

export type ScheduleDraft = {
  status: ThemeStatus;
  activation_mode: ActivationMode;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  is_recurring: boolean;
  priority: number;
};

type ScheduleTabProps = {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  /** Field-level error from the editor (window ordering), if any. */
  error?: string;
};

const STATUS_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "draft", labelKey: "schedule.status.draft" },
  { value: "scheduled", labelKey: "schedule.status.scheduled" },
  { value: "active", labelKey: "schedule.status.active" },
  { value: "archived", labelKey: "schedule.status.archived" },
];

const MODE_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "manual", labelKey: "schedule.mode.manual" },
  { value: "scheduled", labelKey: "schedule.mode.scheduled" },
];

const COMMON_ZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Lagos",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Istanbul",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

/** datetime-local ↔ ISO helpers (same convention as the content manager). */
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

export default function ScheduleTab({ value, onChange, error }: ScheduleTabProps) {
  const { t } = useAdminT();
  const set = <K extends keyof ScheduleDraft>(key: K, next: ScheduleDraft[K]) =>
    onChange({ ...value, [key]: next });

  // Keep a stored custom zone selectable even if it is not in the common list.
  const zoneOptions = COMMON_ZONES.includes(value.timezone)
    ? COMMON_ZONES
    : [value.timezone, ...COMMON_ZONES];

  const windowVisible = value.activation_mode === "scheduled";

  return (
    <div className="space-y-6">
      <Section
        title={t("schedule.section.lifecycle.title")}
        description={t("schedule.section.lifecycle.desc")}
      >
        <Field label={t("schedule.field.status")}>
          <SelectInput
            value={value.status}
            onChange={(v) => set("status", v as ThemeStatus)}
            options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          />
        </Field>
        <Field label={t("schedule.field.mode")}>
          <SelectInput
            value={value.activation_mode}
            onChange={(v) => set("activation_mode", v as ActivationMode)}
            options={MODE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          />
        </Field>
      </Section>

      <Section
        title={t("schedule.section.window.title")}
        description={
          windowVisible
            ? t("schedule.section.window.descVisible")
            : t("schedule.section.window.descManual")
        }
      >
        <Field label={t("schedule.field.startsAt")}>
          <input
            type="datetime-local"
            value={toLocalInput(value.starts_at)}
            onChange={(e) => set("starts_at", fromLocalInput(e.target.value))}
            disabled={!windowVisible}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-[var(--brand)]/50 transition-colors text-sm disabled:opacity-40 [color-scheme:dark]"
          />
        </Field>
        <Field label={t("schedule.field.endsAt")}>
          <input
            type="datetime-local"
            value={toLocalInput(value.ends_at)}
            onChange={(e) => set("ends_at", fromLocalInput(e.target.value))}
            disabled={!windowVisible}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-[var(--brand)]/50 transition-colors text-sm disabled:opacity-40 [color-scheme:dark]"
          />
        </Field>
        <Field
          label={t("schedule.field.timezone")}
          hint={t("schedule.field.timezone.hint")}
          error={error}
        >
          <SelectInput
            value={value.timezone}
            onChange={(v) => set("timezone", v)}
            options={zoneOptions.map((zone) => ({ value: zone, label: zone }))}
          />
        </Field>
        <div className="flex items-end">
          <Toggle
            label={t("schedule.toggle.recurring")}
            hint={t("schedule.toggle.recurring.hint")}
            checked={value.is_recurring}
            onChange={(on) => set("is_recurring", on)}
          />
        </div>
      </Section>

      <Section
        title={t("schedule.section.priority.title")}
        description={t("schedule.section.priority.desc")}
      >
        <Field label={t("schedule.field.priority")}>
          <RangeInput
            value={value.priority}
            onChange={(v) => set("priority", Math.round(v))}
            min={-100}
            max={100}
            step={1}
          />
        </Field>
        <Field label={t("schedule.field.exactPriority")} hint={t("schedule.field.exactPriority.hint")}>
          <NumberInput
            value={value.priority}
            onChange={(v) => set("priority", v)}
            min={-1000}
            max={1000}
            step={1}
          />
        </Field>
      </Section>
    </div>
  );
}
