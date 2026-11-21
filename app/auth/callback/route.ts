import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/redirect";

type PendingCookie = { name: string; value: string; options?: CookieOptions };

function safeRedirect(next: string, origin: string): string {
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("://") ||
    next.includes("\\")
  ) {
    // Next 16 requires an absolute URL in NextResponse.redirect.
    return new URL("/", origin).toString();
  }
  return new URL(next, origin).toString();
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    const errorMessage = errorDescription || error;
    const nextParam = safeNext(next) !== "/" ? `&next=${encodeURIComponent(safeNext(next))}` : "";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorMessage)}${nextParam}`, origin)
    );
  }

  if (code) {
    // Cookies produced by the code exchange MUST be attached to the response
    // we actually return. Setting them on a throwaway NextResponse.next() and
    // then returning a fresh redirect silently drops the session.
    const pendingCookies: PendingCookie[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            pendingCookies.push(...cookiesToSet);
          },
        },
      }
    );

    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      const redirectResponse = NextResponse.redirect(safeRedirect(next, origin));
      for (const { name, value, options } of pendingCookies) {
        redirectResponse.cookies.set(name, value, options);
      }
      return redirectResponse;
    }
  }

  const nextParam = safeNext(next) !== "/" ? `&next=${encodeURIComponent(safeNext(next))}` : "";
  return NextResponse.redirect(
    new URL(
      `/login?error=${encodeURIComponent("Authentication failed. Please try again.")}${nextParam}`,
      origin
    )
  );
}
