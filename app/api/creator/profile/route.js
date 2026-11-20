import { handleApiError } from "@/lib/api-errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  isMissingRelation,
  migrationRequiredResponse,
  requireUser,
} from "@/lib/creator/api";
import { validateProfilePatch } from "@/lib/creator/profile-validation";

// The public-persona contract. Nothing private lives in creator_profiles by
// construction (email/phone stay in profiles), and identity/flag fields are
// written only from the verified session, never from the payload.
const PERSONA_COLUMNS =
  "id, username, display_name, avatar_url, bio, social_links, is_featured, is_active, can_publish, created_at, updated_at";

const MAX_AVATAR_FALLBACK = 500;

/**
 * First-time creation defaults from the private account row: a usable
 * full_name for the display name (fallback: the username, which is always
 * >= 3 chars so the column CHECK 2-60 can never fail) and the account avatar
 * so the persona is never empty. Both stay server-side — the payload cannot
 * influence them beyond supplying its own display_name/avatar_url.
 */
async function loadAccountPersona(client, userId, username) {
  try {
    const { data } = await client
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    const fromAccount =
      typeof data?.full_name === "string" ? data.full_name.trim() : "";
    const displayName =
      (fromAccount.length >= 2 ? fromAccount : username).slice(0, 60);
    const avatarUrl =
      typeof data?.avatar_url === "string" && data.avatar_url.trim()
        ? data.avatar_url.trim().slice(0, MAX_AVATAR_FALLBACK)
        : null;
    return { displayName, avatarUrl };
  } catch {
    return { displayName: String(username ?? "").slice(0, 60), avatarUrl: null };
  }
}

// GET — the caller's own persona (RLS-scoped to their session).
export async function GET(request) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { data, error } = await auth.client
      .from("creator_profiles")
      .select(PERSONA_COLUMNS)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error)) {
        return migrationRequiredResponse("creator.profile.get");
      }
      throw error;
    }

    return Response.json({ success: true, profile: data ?? null });
  } catch (error) {
    return handleApiError(
      error,
      "Creator Profile GET",
      "Could not load the creator profile."
    );
  }
}

// PATCH — create (no existing row) or update the caller's own persona.
// Writes go through the service role because creator_profiles is SELECT-only
// under RLS (plan D5): there is no client write path to abuse.
export async function PATCH(request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`creator-profile:${ip}`, {
      maxRequests: 30,
      failureMode: "fail_open",
    });
    if (!allowed) {
      return Response.json(
        {
          success: false,
          message: "Too many requests. Please try again in a minute.",
        },
        { status: 429 }
      );
    }

    // Authentication before validation: a guest always gets an honest 401,
    // never a misleading 400 about fields they were never allowed to send.
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { success: false, message: "Request body must be a JSON object." },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await auth.client
      .from("creator_profiles")
      .select("id")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (existingError) {
      if (isMissingRelation(existingError)) {
        return migrationRequiredResponse("creator.profile.patch");
      }
      throw existingError;
    }

    const isCreate = !existing;
    const result = validateProfilePatch(body, { requireIdentity: isCreate });
    if (!result.ok) {
      return Response.json(
        {
          success: false,
          message: "Invalid profile data.",
          errors: result.errors,
        },
        { status: 400 }
      );
    }

    const value = result.value;

    // user_id always comes from the verified JWT — a payload-supplied user_id
    // (or is_featured/can_publish/is_active) was already rejected by the
    // allow-list in validateProfilePatch.
    const payload = { user_id: auth.user.id };
    if (value.username !== undefined) payload.username = value.username;
    if (value.bio !== undefined) payload.bio = value.bio;
    if (value.avatar_url !== undefined) payload.avatar_url = value.avatar_url;
    if (value.social_links !== undefined) {
      payload.social_links = value.social_links;
    }

    if (value.display_name !== undefined) {
      payload.display_name = value.display_name;
    }

    if (isCreate) {
      // Fill whatever the creator did not supply from the private account row.
      const needsDefaults =
        value.display_name === undefined || value.avatar_url === undefined;
      const account = needsDefaults
        ? await loadAccountPersona(auth.client, auth.user.id, value.username)
        : null;
      if (value.display_name === undefined) {
        payload.display_name = account.displayName;
      }
      if (value.avatar_url === undefined) {
        payload.avatar_url = account.avatarUrl;
      }
    }

    const admin = getServiceRoleClient();
    const { data, error } = await admin
      .from("creator_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select(PERSONA_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") {
        return Response.json(
          {
            success: false,
            code: "username_taken",
            message: "That username is already taken.",
          },
          { status: 409 }
        );
      }
      if (isMissingRelation(error)) {
        return migrationRequiredResponse("creator.profile.patch");
      }
      throw error;
    }

    return Response.json({ success: true, profile: data });
  } catch (error) {
    return handleApiError(
      error,
      "Creator Profile PATCH",
      "Could not save the creator profile."
    );
  }
}
