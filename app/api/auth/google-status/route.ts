import { logger } from "@/lib/logger";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const base64Url = (bytes: Uint8Array) =>
  Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * Reports whether Google sign-in is actually switched on in Supabase.
 *
 * When the provider is disabled, `GET /auth/v1/authorize?provider=google`
 * answers a bare `400 {"msg":"Unsupported provider: provider is not enabled"}`
 * page â€” navigating the browser there dumps raw JSON at the person. The login
 * page calls this route first so it can show a real message instead.
 *
 * The probe never redirects anyone: it only inspects responses, and any
 * failure degrades to `enabled: true` so a hiccup here can never block sign-in.
 *
 * It also inspects the provider's Google authorize URL. If Google rejects the
 * registered redirect URI, the login page can show the exact URI to add in
 * Google Cloud Console instead of dropping the person on a raw Google error.
 */

function googleCallbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/auth/v1/callback`;
}

/** Google encodes the OAuth error in a base64url `authError` query parameter. */
function decodeGoogleError(value: string | null): string {
  if (!value) return "";
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

async function googleRedirectConfigured(clientId: string): Promise<boolean | null> {
  const callback = googleCallbackUrl();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "email profile");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  try {
    const res = await fetch(url.toString(), { redirect: "manual", cache: "no-store" });
    const location = res.headers.get("location") ?? "";
    let decoded = "";
    try {
      const loc = new URL(location, "https://accounts.google.com");
      decoded = `${decodeGoogleError(loc.searchParams.get("authError"))} ${loc.searchParams.get("error") ?? ""}`;
    } catch {
      // Location may be relative or absent — the raw string check still applies.
    }
    const body = res.status >= 400 ? await res.text() : "";
    const combined = `${location} ${decoded} ${body}`;
    if (
      /redirect_uri_mismatch|invalid_request|origin is not allowed|origin not allowed|unauthorized_client/i.test(
        combined
      )
    ) {
      return false;
    }
    return true;
  } catch {
    return null; // inconclusive — never block sign-in on a probe failure
  }
}
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return Response.json({ enabled: true });
  }

  const ip = getClientIp(request);
  const limit = await checkRateLimitAsync(`auth:google-status:${ip}`, {
    windowMs: 60_000,
    maxRequests: 30,
  });
  if (!limit.allowed) {
    return Response.json({ enabled: true });
  }

  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const redirect = `${siteUrl.replace(/\/$/, "")}/auth/callback`;
  const challenge = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const probe =
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/authorize` +
    `?provider=google&redirect_to=${encodeURIComponent(redirect)}` +
    `&code_challenge=${challenge}&code_challenge_method=s256`;

  try {
    // GoTrue requires the publishable/anon key on the authorize endpoint.
    // Without it Cloudflare returns a bare 400 with an empty body, which made
    // the old probe report `enabled:true` even when Google was disabled.
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await fetch(probe, {
      redirect: "manual",
      cache: "no-store",
      headers: anonKey ? { apikey: anonKey, Accept: "application/json" } : undefined,
    });

    if (res.status === 400) {
      const text = await res.text();
      let parsed: { msg?: string; message?: string; error_code?: string } | null = null;
      try {
        const candidate: unknown = JSON.parse(text);
        if (candidate && typeof candidate === "object") {
          parsed = candidate as { msg?: string; message?: string; error_code?: string };
        }
      } catch {
        // Non-JSON error page — fall back to the raw text check below.
      }
      const message = `${parsed?.msg ?? ""} ${parsed?.message ?? ""} ${text}`;
      if (/unsupported provider|provider is not enabled/i.test(message)) {
        logger.warn("[Auth] Google provider is disabled in Supabase");
        return Response.json({ enabled: false });
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId) {
      const redirectConfigured = await googleRedirectConfigured(clientId);
      if (redirectConfigured === false) {
        logger.warn("[Auth] Google callback URL is not registered in Google Cloud Console");
        return Response.json({
          enabled: true,
          configured: false,
          redirectUri: googleCallbackUrl(),
        });
      }
    }

    return Response.json({ enabled: true });
  } catch (error) {
    logger.warn(
      "[Auth] Google provider probe failed:",
      error instanceof Error ? error.message : "unknown"
    );
    return Response.json({ enabled: true });
  }
}
