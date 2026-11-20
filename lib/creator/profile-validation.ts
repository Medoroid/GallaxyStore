/**
 * Server-side validation for creator profile payloads.
 *
 * The client is never trusted: only the fields below may ever reach the
 * `creator_profiles` table. Identity, feature flags, publishing permission and
 * timestamps are session/server-owned and rejected here if supplied.
 */

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

/** Names that would collide with app routes or invite impersonation. */
export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "shop",
  "store",
  "stores",
  "studio",
  "creator",
  "creators",
  "official",
  "support",
  "root",
  "system",
  "superadmin",
  "galaxy",
  "gallaxy",
  "me",
  "new",
  "edit",
  "settings",
  "login",
  "register",
  "logout",
  "cart",
  "checkout",
  "orders",
  "products",
  "product",
  "vendor",
  "vendors",
  "gallery",
  "about",
  "contact",
]);

/** Persona links a creator may publish. Anything else is rejected. */
export const SOCIAL_LINK_KEYS = new Set([
  "website",
  "instagram",
  "x",
  "twitter",
  "facebook",
  "tiktok",
  "youtube",
  "pinterest",
  "behance",
  "deviantart",
]);

const ALLOWED_FIELDS = new Set([
  "username",
  "display_name",
  "bio",
  "avatar_url",
  "social_links",
]);

const MAX_SOCIAL_LINKS = 6;
const MAX_SOCIAL_URL = 200;
const MAX_AVATAR_URL = 500;
const STORAGE_PATH_RE = /^(avatars|design-previews|product-images)\/[A-Za-z0-9._\-/]+$/;

export type CreatorProfileInput = {
  username?: string;
  display_name?: string;
  bio?: string | null;
  avatar_url?: string | null;
  social_links?: Record<string, string>;
};

export type ProfileValidation =
  | { ok: true; value: CreatorProfileInput }
  | { ok: false; errors: Record<string, string> };

function isHttpUrl(value: string, maxLength: number): boolean {
  if (value.length > maxLength) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isUsableAvatar(value: string): boolean {
  return isHttpUrl(value, MAX_AVATAR_URL) || STORAGE_PATH_RE.test(value);
}

/**
 * Validate a partial profile patch.
 *
 * @param requireIdentity when true (first-time creation) a username must be
 *   present; display name may still be derived server-side from the account.
 */
export function validateProfilePatch(
  input: unknown,
  { requireIdentity = false }: { requireIdentity?: boolean } = {}
): ProfileValidation {
  const errors: Record<string, string> = {};

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: { body: "Expected a JSON object" } };
  }

  const raw = input as Record<string, unknown>;

  // Reject anything not on the allow-list — including identity/flag fields the
  // client must never set (user_id, is_featured, can_publish, is_active, id…).
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_FIELDS.has(key)) {
      errors[key] = "Field is not allowed";
    }
  }

  const value: CreatorProfileInput = {};

  if ("username" in raw) {
    if (typeof raw.username !== "string") {
      errors.username = "Username must be a string";
    } else {
      const username = raw.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) {
        errors.username = "Use 3-30 letters, numbers or underscores";
      } else if (RESERVED_USERNAMES.has(username)) {
        errors.username = "This username is reserved";
      } else {
        value.username = username;
      }
    }
  } else if (requireIdentity) {
    errors.username = "Username is required";
  }

  if ("display_name" in raw) {
    if (typeof raw.display_name !== "string") {
      errors.display_name = "Display name must be a string";
    } else {
      const display = raw.display_name.trim();
      if (display.length < 2 || display.length > 60) {
        errors.display_name = "Use 2-60 characters";
      } else {
        value.display_name = display;
      }
    }
  }

  if ("bio" in raw) {
    if (raw.bio === null) {
      value.bio = null;
    } else if (typeof raw.bio !== "string") {
      errors.bio = "Bio must be text";
    } else {
      const bio = raw.bio.trim();
      if (bio.length > 500) {
        errors.bio = "Keep the bio under 500 characters";
      } else {
        value.bio = bio;
      }
    }
  }

  if ("avatar_url" in raw) {
    if (raw.avatar_url === null || raw.avatar_url === "") {
      value.avatar_url = null;
    } else if (typeof raw.avatar_url !== "string" || !isUsableAvatar(raw.avatar_url)) {
      errors.avatar_url = "Use an http(s) URL or a storage path";
    } else {
      value.avatar_url = raw.avatar_url;
    }
  }

  if ("social_links" in raw) {
    if (raw.social_links === null || raw.social_links === undefined) {
      value.social_links = {};
    } else if (
      typeof raw.social_links !== "object" ||
      Array.isArray(raw.social_links)
    ) {
      errors.social_links = "Social links must be an object";
    } else {
      const links: Record<string, string> = {};
      const entries = Object.entries(raw.social_links as Record<string, unknown>);
      if (entries.length > MAX_SOCIAL_LINKS) {
        errors.social_links = `At most ${MAX_SOCIAL_LINKS} links`;
      }
      for (const [rawKey, rawValue] of entries) {
        const key = rawKey.trim().toLowerCase();
        if (!SOCIAL_LINK_KEYS.has(key)) {
          errors[`social_links.${rawKey}`] = "Unsupported social network";
          continue;
        }
        if (rawValue === null || rawValue === "") continue; // dropped, not an error
        if (typeof rawValue !== "string" || !isHttpUrl(rawValue, MAX_SOCIAL_URL)) {
          errors[`social_links.${rawKey}`] = "Must be an http(s) link";
          continue;
        }
        links[key] = rawValue;
      }
      value.social_links = links;
    }
  }

  if (requireIdentity && !value.username && !errors.username) {
    errors.username = "Username is required";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value };
}
