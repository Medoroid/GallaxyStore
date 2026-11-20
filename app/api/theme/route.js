import { getResolvedTheme } from "@/lib/themes/server";

/**
 * GET /api/theme — the storefront's theme endpoint.
 *
 * Public and read-only. Returns the currently resolved theme (override >
 * scheduled > default > built-in) with its validated config, exactly as the
 * root layout will inject it into the page. The response carries a short CDN
 * cache so a burst of page views does not translate into a burst of database
 * reads; server-side resolution itself is additionally cached for 30 s
 * (lib/themes/server.ts).
 *
 * Before the theme migration is applied this returns the built-in default
 * (source: "builtin") — the store keeps rendering today's design unchanged.
 */
export async function GET() {
  try {
    const { theme, resolvedAt } = await getResolvedTheme();

    return Response.json(
      { success: true, theme, resolvedAt },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    // getResolvedTheme() already degrades to the built-in default; this is a
    // belt-and-braces guard so the endpoint never returns a 500 to visitors.
    return Response.json(
      { success: false, message: "Theme unavailable" },
      { status: 500 }
    );
  }
}
