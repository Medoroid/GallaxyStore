import { cloneDefaultThemeConfig } from "./defaults";
import { validateThemeConfig } from "./validate";
import type {
  ResolvedTheme,
  StoreThemeRow,
  ThemeConflict,
  ThemeSettingsRow,
} from "./types";

/**
 * Theme resolution — pure, synchronous, dependency-free.
 *
 * The precedence contract (docs/THEME-SYSTEM-PLAN.md §10):
 *
 *   1. manual override        theme_settings.manual_override_theme_id
 *   2. highest-priority eligible scheduled/active theme
 *   3. theme_settings.default_theme_id
 *   4. built-in Galaxy Store default (globals.css, no overrides emitted)
 *
 * Eligibility: status ∈ {active, scheduled} AND the activation window is open
 * for `now`. `activation_mode = manual` publishes immediately and ignores the
 * window (the admin deactivates it by hand); `scheduled` enforces the window,
 * and `is_recurring` rebuilds it from month/day/time each year in the row's
 * IANA timezone (handles Dec→Jan spanning windows).
 *
 * Overlapping eligible themes are reported as conflicts (winner = highest
 * priority, then most recently updated) so the admin can see — not guess —
 * which theme actually ships.
 *
 * Timezone math uses a two-pass Intl offset probe instead of a date library:
 * guess UTC, read the wall-clock offset at that instant, correct, repeat once
 * (converges for every real-world UTC offset including DST transitions).
 */

export type ResolveInput = {
  themes: StoreThemeRow[];
  settings: ThemeSettingsRow | null;
  now?: Date;
};

export type ResolveOutput = {
  theme: ResolvedTheme;
  source: ResolvedTheme["source"];
  conflicts: ThemeConflict[];
};

/** The engine's floor: current globals.css, emitted as no overrides at all. */
export const BUILTIN_THEME: ResolvedTheme = {
  id: null,
  name: "Galaxy Store Default",
  slug: "galaxy-default",
  category: "default",
  preview_image: null,
  config: cloneDefaultThemeConfig(),
  source: "builtin",
};

// ---------------------------------------------------------------------------
// Timezone helpers (IANA via Intl; no external dependencies)
// ---------------------------------------------------------------------------

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(timeZone, fmt);
  }
  return fmt;
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Offset (local wall clock − UTC) in ms for an instant in a timezone. */
function tzOffsetMs(instantMs: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  // Drop sub-second noise: formatToParts has second precision.
  const floored = Math.floor(instantMs / 1000) * 1000;
  return asUtc - floored;
}

/** Wall-clock time in a timezone -> UTC instant (two-pass DST correction). */
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  let ts = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const first = tzOffsetMs(ts, timeZone);
  ts -= first;
  const second = tzOffsetMs(ts, timeZone);
  if (second !== first) ts -= second - first;
  return ts;
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function wallClockAt(iso: string, timeZone: string): WallClock | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

// ---------------------------------------------------------------------------
// Eligibility / windows
// ---------------------------------------------------------------------------

/** `manual` mode ignores the window (explicit admin publish/deactivate). */
function windowOpen(row: StoreThemeRow, nowMs: number): boolean {
  if (row.activation_mode === "manual") return true;

  const tz = isValidTimeZone(row.timezone) ? row.timezone : "UTC";

  if (row.is_recurring && row.starts_at && row.ends_at) {
    return recurringWindowOpen(row, nowMs, tz);
  }

  const start = row.starts_at ? Date.parse(row.starts_at) : null;
  const end = row.ends_at ? Date.parse(row.ends_at) : null;
  if (start === null && end === null) return true;
  if (start !== null && nowMs < start) return false;
  if (end !== null && nowMs > end) return false;
  return true;
}

/**
 * Rebuild the annual window from the month/day/time stored in starts_at /
 * ends_at, interpreted in the row's timezone. The end month may precede the
 * start month (Dec 15 → Jan 5); we then test the three candidate years around
 * now so a window spanning New Year is open in early January too.
 */
function recurringWindowOpen(
  row: StoreThemeRow,
  nowMs: number,
  timeZone: string
): boolean {
  const s = wallClockAt(row.starts_at!, timeZone);
  const e = wallClockAt(row.ends_at!, timeZone);
  if (!s || !e) return false;

  const nowParts = wallClockAt(new Date(nowMs).toISOString(), timeZone);
  const thisYear = nowParts?.year ?? new Date(nowMs).getUTCFullYear();

  for (let y = thisYear - 1; y <= thisYear + 1; y += 1) {
    const startTs = zonedToUtc(y, s.month, s.day, s.hour, s.minute, timeZone);
    let endTs = zonedToUtc(
      y,
      e.month,
      e.day,
      e.hour,
      e.minute,
      timeZone
    );
    if (endTs <= startTs) {
      // Window wraps the New Year (Dec → Jan): end lands next year.
      endTs = zonedToUtc(y + 1, e.month, e.day, e.hour, e.minute, timeZone);
    }
    if (nowMs >= startTs && nowMs < endTs) return true;
  }
  return false;
}

export function isEligible(row: StoreThemeRow, nowMs: number): boolean {
  if (row.status !== "active" && row.status !== "scheduled") return false;
  return windowOpen(row, nowMs);
}

// ---------------------------------------------------------------------------
// Conflicts + winner selection
// ---------------------------------------------------------------------------

function compare(a: StoreThemeRow, b: StoreThemeRow): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const ta = Date.parse(a.updated_at) || 0;
  const tb = Date.parse(b.updated_at) || 0;
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every pair of themes that is live at the same instant. */
function findConflicts(eligible: StoreThemeRow[]): ThemeConflict[] {
  const conflicts: ThemeConflict[] = [];
  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const a = eligible[i];
      const b = eligible[j];
      const winner = compare(a, b) <= 0 ? a : b;
      conflicts.push({
        a: { id: a.id, name: a.name, priority: a.priority },
        b: { id: b.id, name: b.name, priority: b.priority },
        winnerId: winner.id,
      });
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function buildResolved(
  row: StoreThemeRow,
  source: ResolvedTheme["source"]
): ResolvedTheme {
  // A hostile or outdated config must never break the storefront: fall back
  // to the built-in defaults for the parts that fail validation.
  const validated = validateThemeConfig(row.theme_config);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    preview_image: row.preview_image,
    config: validated.ok ? validated.config : cloneDefaultThemeConfig(),
    source,
  };
}

export function resolveTheme({
  themes,
  settings,
  now = new Date(),
}: ResolveInput): ResolveOutput {
  const nowMs = now.getTime();
  const eligible = themes.filter((row) => isEligible(row, nowMs));
  const conflicts = findConflicts(eligible);

  // 1. Manual override beats everything (archived rows are retired).
  const overrideId = settings?.manual_override_theme_id ?? null;
  if (overrideId) {
    const row = themes.find((t) => t.id === overrideId);
    if (row && row.status !== "archived") {
      return { theme: buildResolved(row, "override"), source: "override", conflicts };
    }
  }

  // 2. Highest-priority eligible theme (priority desc, then newest update).
  const winner = [...eligible].sort(compare)[0];
  if (winner) {
    return { theme: buildResolved(winner, "scheduled"), source: "scheduled", conflicts };
  }

  // 3. Admin-chosen default theme.
  const defaultId = settings?.default_theme_id ?? null;
  if (defaultId) {
    const row = themes.find((t) => t.id === defaultId);
    if (row && row.status !== "archived") {
      return { theme: buildResolved(row, "default"), source: "default", conflicts };
    }
  }

  // 4. Built-in default — no overrides are emitted for this one.
  return { theme: { ...BUILTIN_THEME, config: cloneDefaultThemeConfig() }, source: "builtin", conflicts };
}
