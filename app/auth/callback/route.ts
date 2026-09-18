import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function safeRedirect(next: string, origin: string): string {
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("://") ||
    next.includes("\\")
  ) {
    return "/";
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
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorMessage)}`, origin)
    );
  }

  if (code) {
    let supabaseResponse = NextResponse.next({ request });

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
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      return NextResponse.redirect(safeRedirect(next, origin));
    }
  }

  return NextResponse.redirect(
    new URL(
      `/login?error=${encodeURIComponent("Authentication failed. Please try again.")}`,
      origin
    )
  );
}
