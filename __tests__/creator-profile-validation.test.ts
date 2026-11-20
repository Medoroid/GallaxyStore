/**
 * @jest-environment node
 *
 * Phase 3 — creator profile payload validation (pure, no I/O):
 *   - username: regex, normalization, reserved words, identity requirement
 *   - allow-list: identity/flag fields (user_id, is_featured, can_publish,
 *     is_active, id…) are rejected — the client can never write them
 *   - display name / bio / avatar bounds
 *   - social links: known networks only, http(s) only, capped, empties dropped
 */

import {
  RESERVED_USERNAMES,
  SOCIAL_LINK_KEYS,
  USERNAME_RE,
  validateProfilePatch,
} from "@/lib/creator/profile-validation";
import {
  isMissingRelation,
  migrationRequiredResponse,
} from "@/lib/creator/api";

describe("username rules", () => {
  test("accepts a valid username", () => {
    const result = validateProfilePatch(
      { username: "star_artist" },
      { requireIdentity: true }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.username).toBe("star_artist");
  });

  test("normalizes case and surrounding whitespace", () => {
    const result = validateProfilePatch(
      { username: "  Star_Artist  " },
      { requireIdentity: true }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.username).toBe("star_artist");
  });

  test.each([
    ["too short", "ab"],
    ["too long", "a".repeat(31)],
    ["hyphen not allowed", "star-artist"],
    ["space not allowed", "star artist"],
    ["dot not allowed", "star.artist"],
    ["non ascii", "نجم"],
  ])("rejects username: %s", (_label, username) => {
    const result = validateProfilePatch({ username }, { requireIdentity: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.username).toBeTruthy();
  });

  test("rejects every reserved username", () => {
    for (const reserved of RESERVED_USERNAMES) {
      const result = validateProfilePatch(
        { username: reserved },
        { requireIdentity: true }
      );
      expect(result.ok).toBe(false);
      // Names short enough to fail the regex first are still rejected; the
      // ones that pass the regex must fail specifically as reserved.
      if (!result.ok && USERNAME_RE.test(reserved)) {
        expect(result.errors.username).toMatch(/reserved/i);
      }
    }
  });

  test("requires a username only when creating", () => {
    const create = validateProfilePatch({}, { requireIdentity: true });
    expect(create.ok).toBe(false);
    if (!create.ok) expect(create.errors.username).toBeTruthy();

    // Partial patches (e.g. bio-only updates) may omit the username.
    const patch = validateProfilePatch({ bio: "Hello" }, { requireIdentity: false });
    expect(patch.ok).toBe(true);
  });

  test("USERNAME_RE matches what the validator accepts", () => {
    expect(USERNAME_RE.test("star_artist")).toBe(true);
    expect(USERNAME_RE.test("Star")).toBe(false);
    expect(USERNAME_RE.test("ab")).toBe(false);
  });
});

describe("allow-list rejects identity and flag fields", () => {
  test.each([
    "user_id",
    "is_featured",
    "can_publish",
    "is_active",
    "id",
    "created_at",
    "updated_at",
    "deleted_at",
    "moderation_note",
  ])("rejects %s even alongside valid fields", (field) => {
    const result = validateProfilePatch({
      username: "star_artist",
      display_name: "Star Artist",
      [field]: field === "is_featured" || field === "can_publish" ? true : "x",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[field]).toBe("Field is not allowed");
      // No value is ever produced when any field is rejected.
      expect("value" in result).toBe(false);
    }
  });
});

describe("display name and bio bounds", () => {
  test("display name length limits", () => {
    expect(
      validateProfilePatch({ display_name: "A" }).ok
    ).toBe(false);
    expect(
      validateProfilePatch({ display_name: "A".repeat(60) }).ok
    ).toBe(true);
    expect(
      validateProfilePatch({ display_name: "A".repeat(61) }).ok
    ).toBe(false);
  });

  test("display name is trimmed", () => {
    const result = validateProfilePatch({ display_name: "  Star Artist  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.display_name).toBe("Star Artist");
  });

  test("bio accepts null, caps at 500 and rejects non-text", () => {
    expect(validateProfilePatch({ bio: null }).ok).toBe(true);
    expect(validateProfilePatch({ bio: "B".repeat(500) }).ok).toBe(true);
    expect(validateProfilePatch({ bio: "B".repeat(501) }).ok).toBe(false);
    expect(validateProfilePatch({ bio: 42 }).ok).toBe(false);
  });
});

describe("avatar url rules", () => {
  test.each([
    ["https url", "https://example.com/a.png", true],
    ["storage path", "avatars/me.png", true],
    ["design preview path", "design-previews/mockup-1.png", true],
    ["javascript scheme", "javascript:alert(1)", false],
    ["ftp scheme", "ftp://example.com/a.png", false],
    ["file scheme", "file:///etc/passwd", false],
    ["relative path without bucket", "me.png", false],
  ])("%s", (_label, value, valid) => {
    const result = validateProfilePatch({ avatar_url: value });
    expect(result.ok).toBe(valid);
  });

  test("empty avatar clears to null", () => {
    const result = validateProfilePatch({ avatar_url: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.avatar_url).toBeNull();
  });
});

describe("social links", () => {
  test("accepts known networks with http(s) links", () => {
    const result = validateProfilePatch({
      social_links: { instagram: "https://instagram.com/star", website: "https://star.art" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.social_links).toEqual({
        instagram: "https://instagram.com/star",
        website: "https://star.art",
      });
    }
  });

  test("rejects unknown networks", () => {
    const result = validateProfilePatch({
      social_links: { snapchat: "https://snapchat.com/add/star" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["social_links.snapchat"]).toBeTruthy();
  });

  test("rejects non-http links", () => {
    const result = validateProfilePatch({ social_links: { website: "not-a-url" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["social_links.website"]).toBeTruthy();
  });

  test("caps the number of links", () => {
    const links: Record<string, string> = {};
    let index = 0;
    for (const key of SOCIAL_LINK_KEYS) {
      if (index >= 7) break;
      links[key] = `https://example.com/${key}`;
      index += 1;
    }
    const result = validateProfilePatch({ social_links: links });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.social_links).toMatch(/At most 6/i);
  });

  test("drops empty values instead of erroring", () => {
    const result = validateProfilePatch({
      social_links: { website: "https://star.art", instagram: "" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.social_links).toEqual({ website: "https://star.art" });
    }
  });

  test("rejects non-object social links", () => {
    expect(validateProfilePatch({ social_links: "instagram" }).ok).toBe(false);
    expect(validateProfilePatch({ social_links: ["instagram"] }).ok).toBe(false);
  });
});

describe("input shape", () => {
  test.each([[null], ["a string"], [[]], [42]])(
    "rejects non-object body %p",
    (body) => {
      const result = validateProfilePatch(body);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.body).toBeTruthy();
    }
  );
});

describe("missing-relation detection and 503 contract", () => {
  test("recognizes Postgres/PostgREST missing-table errors", () => {
    expect(isMissingRelation({ code: "PGRST202" })).toBe(true);
    expect(isMissingRelation({ code: "42P01" })).toBe(true);
    expect(
      isMissingRelation({ message: "Could not find the table 'public.creator_profiles' in the schema cache" })
    ).toBe(true);
    expect(isMissingRelation({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
    expect(isMissingRelation("boom")).toBe(false);
  });

  test("migration response is an honest 503 with an actionable message", async () => {
    const res = migrationRequiredResponse("creator.profile.get");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("MIGRATION_REQUIRED");
    expect(body.context).toBe("creator.profile.get");
    expect(body.message).toMatch(/20261110120000_creator_studio_core\.sql/);
  });
});
