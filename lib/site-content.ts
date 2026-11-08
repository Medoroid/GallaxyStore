/**
 * Site content model — admin-managed banners and sections.
 *
 * Pure module (no Supabase imports) so the same validation, scheduling and
 * ordering rules are shared by the admin API routes and the storefront
 * renderer, and stay unit-testable in Jest.
 *
 * DB counterpart: supabase/migrations/20261108130000_site_content_banners_sections.sql
 * The CHECK constraints there must stay in sync with the lists below.
 */

export const SITE_BANNER_BUCKET = "site-banners";

/** Zones a banner can render in. `top_strip` is banner-only. */
export const BANNER_PLACEMENTS = [
  "top_strip",
  "after_hero",
  "mid_page",
  "before_footer",
] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

/** Zones a section can render in. */
export const SECTION_PLACEMENTS = [
  "after_hero",
  "mid_page",
  "before_footer",
] as const;
export type SectionPlacement = (typeof SECTION_PLACEMENTS)[number];

export const SECTION_TYPES = ["rich_text", "image_text", "cards", "cta"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const CONTENT_PAGES = ["home"] as const;
export type ContentPage = (typeof CONTENT_PAGES)[number];

const PAGE_RE = /^[a-z0-9_-]{1,40}$/;
const MAX_TITLE = 160;
const MAX_SUBTITLE = 300;
const MAX_EYEBROW = 60;
const MAX_BODY = 4000;
const MAX_BUTTON_LABEL = 40;
const MAX_URL = 2000;
const MAX_CARDS = 8;
const MAX_CARD_TITLE = 80;
const MAX_CARD_BODY = 300;

export type SiteBanner = {
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

export type SectionCard = {
  title: string;
  body: string | null;
  link_url: string | null;
  image_url: string | null;
};

export type SiteSection = {
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
  config: { cards?: SectionCard[] } & Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function fail<T>(message: string): ValidationResult<T> {
  return { ok: false, message };
}

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Accepts http(s) URLs and site-relative paths; empty becomes null. */
export function validateContentUrl(value: unknown): ValidationResult<string | null> {
  const text = asTrimmed(value);
  if (!text) return { ok: true, value: null };
  if (text.length > MAX_URL) return fail("The URL is too long");
  if (text.startsWith("/") && !text.startsWith("//")) {
    return { ok: true, value: text };
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail("Must be a valid URL (https://… or a /path)");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return fail("Must be an http(s) URL");
  }
  return { ok: true, value: url.toString() };
}

function validateText(
  value: unknown,
  max: number,
  label: string,
  { required = false }: { required?: boolean } = {}
): ValidationResult<string | null> {
  const text = asTrimmed(value);
  if (!text) {
    return required ? fail(`${label} is required`) : { ok: true, value: null };
  }
  if (text.length > max) {
    return fail(`${label} must be ${max} characters or fewer`);
  }
  return { ok: true, value: text };
}

function validateDate(value: unknown, label: string): ValidationResult<string | null> {
  const text = asTrimmed(value);
  if (!text) return { ok: true, value: null };
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return fail(`${label} must be a valid date`);
  return { ok: true, value: new Date(parsed).toISOString() };
}

function validateWindow(
  startsAt: string | null,
  endsAt: string | null
): ValidationResult<true> {
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return fail("The end date must be after the start date");
  }
  return { ok: true, value: true };
}

function validatePage(value: unknown, fallback: string): ValidationResult<string> {
  const text = asTrimmed(value) ?? fallback;
  if (!PAGE_RE.test(text)) {
    return fail("Page must be 1-40 characters (letters, numbers, - or _)");
  }
  return { ok: true, value: text };
}

function validateSortOrder(value: unknown, fallback: number): ValidationResult<number> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: fallback };
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 1_000_000) {
    return fail("Sort order must be a number between 0 and 1000000");
  }
  return { ok: true, value: Math.trunc(num) };
}

function validateBool(value: unknown, fallback: boolean): ValidationResult<boolean> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: fallback };
  }
  if (typeof value !== "boolean") return fail("Active flag must be true or false");
  return { ok: true, value };
}

function validatePlacement<T extends string>(
  value: unknown,
  allowed: readonly T[],
  { required }: { required: boolean }
): ValidationResult<T | null> {
  const text = asTrimmed(value);
  if (!text) {
    return required
      ? fail(`Placement is required (${allowed.join(", ")})`)
      : { ok: true, value: null };
  }
  if (!(allowed as readonly string[]).includes(text)) {
    return fail(`Placement must be one of: ${allowed.join(", ")}`);
  }
  return { ok: true, value: text as T };
}

export type BannerInput = {
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

/**
 * Validates a banner payload. `partial: true` (PATCH) only validates the
 * keys that are present and requires none of them; full validation (POST)
 * requires a placement, and at least a title or an image so a banner is
 * never invisible.
 */
export function validateBannerInput(
  raw: unknown,
  { partial = false }: { partial?: boolean } = {}
): ValidationResult<Partial<BannerInput>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("Banner payload must be an object");
  }
  const input = raw as Record<string, unknown>;
  const value: Partial<BannerInput> = {};

  if (!partial || input.page !== undefined) {
    const result = validatePage(input.page, "home");
    if (!result.ok) return fail(result.message);
    value.page = result.value;
  }

  if (!partial || input.placement !== undefined) {
    const result = validatePlacement<BannerPlacement>(input.placement, BANNER_PLACEMENTS, {
      required: !partial,
    });
    if (!result.ok) return fail(result.message);
    if (result.value) value.placement = result.value;
  }

  if (!partial || input.title !== undefined) {
    const result = validateText(input.title, MAX_TITLE, "Title");
    if (!result.ok) return fail(result.message);
    value.title = result.value;
  }
  if (!partial || input.subtitle !== undefined) {
    const result = validateText(input.subtitle, MAX_SUBTITLE, "Subtitle");
    if (!result.ok) return fail(result.message);
    value.subtitle = result.value;
  }
  if (!partial || input.button_label !== undefined) {
    const result = validateText(input.button_label, MAX_BUTTON_LABEL, "Button label");
    if (!result.ok) return fail(result.message);
    value.button_label = result.value;
  }
  if (!partial || input.image_url !== undefined) {
    const result = validateContentUrl(input.image_url);
    if (!result.ok) return fail(result.message);
    value.image_url = result.value;
  }
  if (!partial || input.link_url !== undefined) {
    const result = validateContentUrl(input.link_url);
    if (!result.ok) return fail(result.message);
    value.link_url = result.value;
  }
  if (!partial || input.sort_order !== undefined) {
    const result = validateSortOrder(input.sort_order, 0);
    if (!result.ok) return fail(result.message);
    value.sort_order = result.value;
  }
  if (!partial || input.is_active !== undefined) {
    const result = validateBool(input.is_active, true);
    if (!result.ok) return fail(result.message);
    value.is_active = result.value;
  }

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  const hasStarts = !partial || input.starts_at !== undefined;
  const hasEnds = !partial || input.ends_at !== undefined;
  if (hasStarts) {
    const result = validateDate(input.starts_at, "Start date");
    if (!result.ok) return fail(result.message);
    startsAt = result.value;
    value.starts_at = result.value;
  }
  if (hasEnds) {
    const result = validateDate(input.ends_at, "End date");
    if (!result.ok) return fail(result.message);
    endsAt = result.value;
    value.ends_at = result.value;
  }

  // Window check needs both sides; in partial mode fall back to the DB row
  // only at the API layer, so here we only compare what we were given.
  // In partial mode only one side may be present; the API route merges the
  // stored row in before re-checking the window, so compare only when both
  // sides are known here.
  if (hasStarts && hasEnds) {
    const windowCheck = validateWindow(startsAt, endsAt);
    if (!windowCheck.ok) return fail(windowCheck.message);
  }

  if (!partial && !value.title && !value.image_url) {
    return fail("A banner needs at least a title or an image");
  }

  return { ok: true, value };
}

export type SectionInput = {
  page: string;
  placement: SectionPlacement;
  section_type: SectionType;
  eyebrow: string | null;
  title: string | null;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
  button_label: string | null;
  config: { cards?: SectionCard[] };
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

/** Normalizes the `cards` config for section_type = 'cards'. */
export function normalizeCardsConfig(
  raw: unknown
): ValidationResult<{ cards: SectionCard[] }> {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: { cards: [] } };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return fail("Cards config must be an object");
  }
  const cards = (raw as { cards?: unknown }).cards;
  if (cards === undefined || cards === null) return { ok: true, value: { cards: [] } };
  if (!Array.isArray(cards)) return fail("cards must be an array");
  if (cards.length > MAX_CARDS) return fail(`A section can hold at most ${MAX_CARDS} cards`);

  const normalized: SectionCard[] = [];
  for (const [index, entry] of cards.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return fail(`Card ${index + 1} must be an object`);
    }
    const card = entry as Record<string, unknown>;
    const title = validateText(card.title, MAX_CARD_TITLE, `Card ${index + 1} title`, {
      required: true,
    });
    if (!title.ok) return fail(title.message);
    const body = validateText(card.body, MAX_CARD_BODY, `Card ${index + 1} body`);
    if (!body.ok) return fail(body.message);
    const link = validateContentUrl(card.link_url);
    if (!link.ok) return fail(`Card ${index + 1}: ${link.message}`);
    const image = validateContentUrl(card.image_url);
    if (!image.ok) return fail(`Card ${index + 1}: ${image.message}`);

    normalized.push({
      title: title.value as string,
      body: body.value,
      link_url: link.value,
      image_url: image.value,
    });
  }
  return { ok: true, value: { cards: normalized } };
}

export function validateSectionInput(
  raw: unknown,
  { partial = false }: { partial?: boolean } = {}
): ValidationResult<Partial<SectionInput>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("Section payload must be an object");
  }
  const input = raw as Record<string, unknown>;
  const value: Partial<SectionInput> = {};

  if (!partial || input.page !== undefined) {
    const result = validatePage(input.page, "home");
    if (!result.ok) return fail(result.message);
    value.page = result.value;
  }

  if (!partial || input.placement !== undefined) {
    const result = validatePlacement<SectionPlacement>(input.placement, SECTION_PLACEMENTS, {
      required: !partial,
    });
    if (!result.ok) return fail(result.message);
    if (result.value) value.placement = result.value;
  }

  if (!partial || input.section_type !== undefined) {
    const result = validatePlacement<SectionType>(input.section_type, SECTION_TYPES, {
      required: !partial,
    });
    if (!result.ok) return fail(`Type: ${result.message}`);
    if (result.value) value.section_type = result.value;
  }

  if (!partial || input.eyebrow !== undefined) {
    const result = validateText(input.eyebrow, MAX_EYEBROW, "Eyebrow");
    if (!result.ok) return fail(result.message);
    value.eyebrow = result.value;
  }
  if (!partial || input.title !== undefined) {
    const result = validateText(input.title, MAX_TITLE, "Title");
    if (!result.ok) return fail(result.message);
    value.title = result.value;
  }
  if (!partial || input.body !== undefined) {
    const result = validateText(input.body, MAX_BODY, "Body");
    if (!result.ok) return fail(result.message);
    value.body = result.value;
  }
  if (!partial || input.button_label !== undefined) {
    const result = validateText(input.button_label, MAX_BUTTON_LABEL, "Button label");
    if (!result.ok) return fail(result.message);
    value.button_label = result.value;
  }
  if (!partial || input.image_url !== undefined) {
    const result = validateContentUrl(input.image_url);
    if (!result.ok) return fail(result.message);
    value.image_url = result.value;
  }
  if (!partial || input.link_url !== undefined) {
    const result = validateContentUrl(input.link_url);
    if (!result.ok) return fail(result.message);
    value.link_url = result.value;
  }
  if (!partial || input.config !== undefined) {
    const result = normalizeCardsConfig(input.config);
    if (!result.ok) return fail(result.message);
    value.config = result.value;
  }
  if (!partial || input.sort_order !== undefined) {
    const result = validateSortOrder(input.sort_order, 0);
    if (!result.ok) return fail(result.message);
    value.sort_order = result.value;
  }
  if (!partial || input.is_active !== undefined) {
    const result = validateBool(input.is_active, true);
    if (!result.ok) return fail(result.message);
    value.is_active = result.value;
  }

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  const hasStarts = !partial || input.starts_at !== undefined;
  const hasEnds = !partial || input.ends_at !== undefined;
  if (hasStarts) {
    const result = validateDate(input.starts_at, "Start date");
    if (!result.ok) return fail(result.message);
    startsAt = result.value;
    value.starts_at = result.value;
  }
  if (hasEnds) {
    const result = validateDate(input.ends_at, "End date");
    if (!result.ok) return fail(result.message);
    endsAt = result.value;
    value.ends_at = result.value;
  }
  if (hasStarts && hasEnds) {
    const windowCheck = validateWindow(startsAt, endsAt);
    if (!windowCheck.ok) return fail(windowCheck.message);
  }

  if (!partial) {
    if (!value.title) return fail("Title is required");
    if (value.section_type === "rich_text" && !value.body) {
      return fail("Body text is required for rich text sections");
    }
    if (value.section_type === "image_text" && !value.image_url) {
      return fail("An image is required for image + text sections");
    }
    if (value.section_type === "cards" && (value.config?.cards?.length ?? 0) === 0) {
      return fail("Add at least one card");
    }
  }

  return { ok: true, value };
}

type Schedulable = {
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

/** True when the row is active and inside its schedule window at `now`. */
export function isWithinActiveWindow(row: Schedulable, now: Date = new Date()): boolean {
  if (!row.is_active) return false;
  const time = now.getTime();
  const starts = row.starts_at ? Date.parse(row.starts_at) : NaN;
  const ends = row.ends_at ? Date.parse(row.ends_at) : NaN;
  if (Number.isFinite(starts) && starts > time) return false;
  if (Number.isFinite(ends) && ends <= time) return false;
  return true;
}

/**
 * Client-side belt-and-braces filtering: RLS already exposes only active,
 * in-window rows, but the renderer re-checks so a mis-configured policy can
 * never show an expired campaign. Sorts by sort_order then creation time.
 */
export function selectForZone<T extends Schedulable & { page: string; placement: string; sort_order: number; created_at?: string }>(
  rows: T[] | null | undefined,
  page: string,
  zone: string,
  now: Date = new Date()
): T[] {
  return (rows ?? [])
    .filter((row) => row.page === page && row.placement === zone)
    .filter((row) => isWithinActiveWindow(row, now))
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
}

/**
 * Extracts the storage object path from a public bucket URL so a delete can
 * remove the file too. Returns null for external or site-relative URLs.
 */
export function storagePathFromPublicUrl(
  url: unknown,
  bucket: string = SITE_BANNER_BUCKET
): string | null {
  if (typeof url !== "string" || !url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = decodeURIComponent(url.slice(index + marker.length));
  if (!path || path.includes("..") || path.includes("\\")) return null;
  return path;
}
