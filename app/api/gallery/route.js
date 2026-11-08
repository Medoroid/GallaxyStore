import { verifyAdmin } from "../admin/_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const BUCKET = "gallery-images";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function resolveImageUrl(db, imageUrl) {
  const value = String(imageUrl || "").trim();
  if (!value) return value;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
    return value;
  }
  const path = value.startsWith(`${BUCKET}/`) ? value.slice(BUCKET.length + 1) : value;
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function storagePathOf(imageUrl) {
  const value = String(imageUrl || "").trim();
  if (!value || value.startsWith("http") || value.startsWith("/")) return null;
  return value.startsWith(`${BUCKET}/`) ? value.slice(BUCKET.length + 1) : value;
}

export async function GET() {
  try {
    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("gallery_images")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const images = (data ?? []).map((image) => ({
      ...image,
      image_url: resolveImageUrl(db, image.image_url),
    }));

    return Response.json({ success: true, images });
  } catch (error) {
    logger.error("[Gallery GET] failed", error);
    return Response.json(
      { success: false, images: [], message: "Failed to fetch gallery" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const contentType = request.headers.get("content-type") || "";
    let title = "";
    let description = null;
    let category = "custom-prints";
    let isFeatured = false;
    let imageUrl = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData().catch(() => null);
      if (!form) {
        return Response.json({ success: false, message: "Invalid form data" }, { status: 400 });
      }

      title = String(form.get("title") || "").trim();
      description = String(form.get("description") || "").trim() || null;
      category = String(form.get("category") || "custom-prints").trim() || "custom-prints";
      isFeatured = String(form.get("is_featured") || "") === "true";

      const file = form.get("file");
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        const type = String(file.type || "").toLowerCase();
        const extension = MIME_EXTENSIONS[type];
        if (!extension) {
          return Response.json(
            { success: false, message: "Unsupported image type. Use JPG, PNG, WebP, GIF or AVIF." },
            { status: 400 }
          );
        }
        if (file.size > MAX_FILE_BYTES) {
          return Response.json(
            { success: false, message: "Image must be 8MB or smaller" },
            { status: 400 }
          );
        }

        const path = `gallery/${crypto.randomUUID()}.${extension}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await db.storage
          .from(BUCKET)
          .upload(path, buffer, { contentType: type, upsert: false });
        if (uploadError) throw uploadError;
        imageUrl = path;
      } else {
        imageUrl = String(form.get("image_url") || "").trim();
      }
    } else {
      const body = await request.json().catch(() => ({}));
      title = String(body?.title || "").trim();
      description = String(body?.description || "").trim() || null;
      category = String(body?.category || "custom-prints").trim() || "custom-prints";
      isFeatured = Boolean(body?.is_featured);
      imageUrl = String(body?.image_url || "").trim();
    }

    if (!title || title.length > 160) {
      return Response.json(
        { success: false, message: "Title is required (max 160 characters)" },
        { status: 400 }
      );
    }
    if (!imageUrl) {
      return Response.json(
        { success: false, message: "An image file or image URL is required" },
        { status: 400 }
      );
    }
    if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith("/") && !imageUrl.includes("/")) {
      return Response.json({ success: false, message: "Invalid image URL" }, { status: 400 });
    }

    const { data: maxRow } = await db
      .from("gallery_images")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortOrder = Number(maxRow?.sort_order ?? 0) + 1;

    const { data, error } = await db
      .from("gallery_images")
      .insert({
        title,
        description,
        image_url: imageUrl,
        category,
        is_featured: isFeatured,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (error) {
      const path = storagePathOf(imageUrl);
      if (path && !imageUrl.startsWith("http")) {
        await db.storage.from(BUCKET).remove([path]);
      }
      throw error;
    }

    return Response.json(
      { success: true, image: { ...data, image_url: resolveImageUrl(db, data.image_url) } },
      { status: 201 }
    );
  } catch (error) {
    logger.error("[Gallery POST] failed", error);
    return handleApiError(error, "Gallery POST", "Failed to add image");
  }
}

export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const db = getServiceRoleClient();

    if (Array.isArray(body?.order)) {
      const updates = body.order
        .filter((entry) => entry && UUID_RE.test(String(entry.id)))
        .map((entry, index) => ({
          id: String(entry.id),
          sort_order: index + 1,
          updated_at: new Date().toISOString(),
        }));

      for (const update of updates) {
        const { error } = await db
          .from("gallery_images")
          .update({ sort_order: update.sort_order, updated_at: update.updated_at })
          .eq("id", update.id);
        if (error) throw error;
      }
      return Response.json({ success: true, updated: updates.length });
    }

    const imageId = String(body?.id || "");
    if (!UUID_RE.test(imageId)) {
      return Response.json({ success: false, message: "Invalid image id" }, { status: 400 });
    }

    const payload = {};
    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title || title.length > 160) {
        return Response.json({ success: false, message: "Invalid title" }, { status: 400 });
      }
      payload.title = title;
    }
    if (typeof body.description === "string") payload.description = body.description.trim() || null;
    if (typeof body.category === "string") payload.category = body.category.trim() || "custom-prints";
    if (typeof body.is_featured === "boolean") payload.is_featured = body.is_featured;
    if (body.sort_order !== undefined) {
      const sortOrder = Number(body.sort_order);
      if (!Number.isFinite(sortOrder)) {
        return Response.json({ success: false, message: "Invalid sort order" }, { status: 400 });
      }
      payload.sort_order = Math.trunc(sortOrder);
    }

    if (Object.keys(payload).length === 0) {
      return Response.json({ success: false, message: "Nothing to update" }, { status: 400 });
    }
    payload.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from("gallery_images")
      .update(payload)
      .eq("id", imageId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json({ success: false, message: "Image not found" }, { status: 404 });
    }

    return Response.json({
      success: true,
      image: { ...data, image_url: resolveImageUrl(db, data.image_url) },
    });
  } catch (error) {
    return handleApiError(error, "Gallery PATCH", "Failed to update image");
  }
}

export async function DELETE(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !UUID_RE.test(id)) {
      return Response.json({ success: false, message: "Invalid image id" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const { data: image, error: readError } = await db
      .from("gallery_images")
      .select("id, image_url")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!image) {
      return Response.json({ success: false, message: "Image not found" }, { status: 404 });
    }

    const { error } = await db.from("gallery_images").delete().eq("id", id);
    if (error) throw error;

    const path = storagePathOf(image.image_url);
    if (path) {
      const { error: removeError } = await db.storage.from(BUCKET).remove([path]);
      if (removeError) {
        logger.warn("[Gallery DELETE] storage remove failed:", removeError.message);
      }
    }

    return Response.json({ success: true, message: "Image deleted" });
  } catch (error) {
    return handleApiError(error, "Gallery DELETE", "Failed to delete image");
  }
}
