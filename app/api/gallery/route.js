import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "../admin/_lib/verifyAdmin";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

function getSupabasePublic() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET() {
  try {
    const SupabaseClient = getSupabasePublic();
    const { data, error } = await SupabaseClient
      .from("gallery_images")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      // If table doesn't exist, return empty gallery instead of 500
      if (
        error.code === "PGRST205" ||
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("Could not find the table")
      ) {
        logger.warn("[Gallery] gallery_images table does not exist yet. Run supabase/migrations/20260916_fix_broken_endpoints.sql");
        return Response.json({ success: true, images: [] });
      }
      throw error;
    }
    return Response.json({ success: true, images: data ?? [] });
  } catch (error) {
    logger.error("[Gallery GET Error]", error);
    return Response.json(
      { success: false, images: [], message: "Failed to fetch gallery" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return Response.json(
      { success: false, message: "Authorization required" },
      { status: 401 }
    );
  }

  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);

    const { title, description, image_url, category, is_featured } = await request.json();

    if (!title || !image_url) {
      return Response.json(
        { success: false, message: "Title and image_url are required" },
        { status: 400 }
      );
    }

    const { data, error } = await SupabaseClient
      .from("gallery_images")
      .insert({
        title,
        description: description ?? null,
        image_url,
        category: category ?? "custom-prints",
        is_featured: is_featured ?? false,
      })
      .select()
      .single();

    if (error) throw error;
    return Response.json({ success: true, image: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Gallery POST", "Failed to add image");
  }
}

export async function DELETE(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return Response.json(
      { success: false, message: "Authorization required" },
      { status: 401 }
    );
  }

  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { success: false, message: "Image ID is required" },
        { status: 400 }
      );
    }

    const { error } = await SupabaseClient
      .from("gallery_images")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return Response.json({ success: true, message: "Image deleted" });
  } catch (error) {
    return handleApiError(error, "Gallery DELETE", "Failed to delete image");
  }
}
