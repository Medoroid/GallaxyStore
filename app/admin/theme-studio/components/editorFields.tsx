"use client";

import type { ReactNode } from "react";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Labeled input primitives shared by the Theme Editor tabs. They are purely
 * presentational: every control receives its value + onChange from the tab,
 * which owns the working ThemeConfig copy.
 *
 * Direction-aware: padding/positioning uses logical utilities (ps/pe, start/end)
 * so the whole editor mirrors correctly under RTL without per-language styles.
 */

const INPUT_CLASS =
  "w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50 transition-colors text-sm";

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {description ? <p className="text-xs text-gray-500 mt-0.5">{description}</p> : null}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs text-gray-400 block mb-1.5">{label}</span>
      {children}
      {error ? (
        <span className="text-[11px] text-red-400 block mt-1">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-gray-600 block mt-1">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLASS}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT_CLASS} resize-y`}
    />
  );
}

/** Number input that ignores empty/partial input (keeps the last value). */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <span className="relative block">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value === "") return;
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className={`${INPUT_CLASS} ${suffix ? "pe-10" : ""}`}
      />
      {suffix ? (
        <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

export function RangeInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="flex-1 accent-[var(--brand)]"
      />
      <span className="text-xs text-gray-300 font-mono w-16 text-end shrink-0">
        {value}
        {suffix ?? ""}
      </span>
    </div>
  );
}

export function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function toHex6(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/**
 * Color row: free-text field (hex / rgb() / hsl() — the validator decides)
 * plus the native picker when the current value is representable as hex.
 */
export function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const { t } = useAdminT();
  const hex = toHex6(value);
  return (
    <Field label={label} hint={hint}>
      <span className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT_CLASS} font-mono`}
        />
        <span
          className="relative w-10 h-10 shrink-0 rounded-xl border border-white/10 overflow-hidden"
          style={{ background: hex ?? value }}
          title={hex ? t("editor.pickColor") : t("editor.hexOnly")}
        >
          <input
            type="color"
            value={hex ?? "#000000"}
            disabled={!hex}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            aria-label={t("editor.colorPickerAria").replace("{label}", label)}
          />
        </span>
      </span>
    </Field>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${
          checked ? "bg-[var(--brand)]" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
            checked ? "start-[22px]" : "start-0.5"
          }`}
        />
      </span>
      <span>
        <span className="text-sm text-gray-200 block">{label}</span>
        {hint ? <span className="text-[11px] text-gray-500 block mt-0.5">{hint}</span> : null}
      </span>
    </label>
  );
}
