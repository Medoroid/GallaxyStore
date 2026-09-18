import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getAdminEmails(): string[] {
  const emails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",")
    : [];
  return emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect admin routes
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const isAdminByEmail = getAdminEmails().includes(
      (user.email || "").toLowerCase()
    );

    let isAdminInDb = false;

    // Check admin_users table
    try {
      const { data } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .single();
      if (data) isAdminInDb = true;
    } catch {
      // Table might not exist
    }

    // Fallback: check profiles.role
    if (!isAdminInDb) {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (data?.role === "admin" || data?.role === "superadmin")
          isAdminInDb = true;
      } catch {
        // ignore
      }
    }

    if (!isAdminByEmail && !isAdminInDb) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Protect checkout, orders, wishlist, profile (require auth)
  const protectedPaths = ["/checkout", "/orders", "/wishlist", "/profile"];
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/checkout/:path*",
    "/orders/:path*",
    "/wishlist/:path*",
    "/profile/:path*",
  ],
};
