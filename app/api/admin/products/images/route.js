import { verifyAdmin } from "../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const BUCKET = "product-images";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function publicUrl(db, path) {
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function nextSortOrder(db, productId) {
  const { data } = await db
    .from("product_images")
    .select("sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.sort_order ?? -1) + 1;
}

export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return Response.json(
        { success: false, message: "Expected multipart/form-data" },
        { status: 400 }
      );
    }

    const productId = String(form.get("product_id") || "");
    if (!UUID_RE.test(productId)) {
      return Response.json({ success: false, message: "Invalid product id" }, { status: 400 });
    }

    const altText = String(form.get("alt_text") || "").trim() || null;
    const makePrimary = String(form.get("is_primary") || "") === "true";

    const files = [
      ...form.getAll("files"),
      ...form.getAll("file"),
    ].filter((entry) => entry && typeof entry === "object" && "arrayBuffer" in entry);

    if (files.length === 0) {
      return Response.json({ success: false, message: "No image files provided" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const { data: product, error: productError } = await db
      .from("products")
      .select("id")
      .eq("id", productId)
      .is("deleted_at", null)
      .maybeSingle();

    if (productError) throw productError;
    if (!product) {
      return Response.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    const { data: existingImages } = await db
      .from("product_images")
      .select("id")
      .eq("product_id", productId);

    let sortOrder = await nextSortOrder(db, productId);
    const uploaded = [];

    for (const [index, file] of files.entries()) {
      const type = String(file.type || "").toLowerCase();
      const extension = MIME_EXTENSIONS[type];
      if (!extension) {
        return Response.json(
          { success: false, message: `Unsupported image type: ${type || "unknown"}` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        return Response.json(
          { success: false, message: "Each image must be 5MB or smaller" },
          { status: 400 }
        );
      }

      const storagePath = `${productId}/${crypto.randomUUID()}.${extension}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: type, upsert: false });

      if (uploadError) throw uploadError;

      const isPrimary = makePrimary && index === 0 && uploaded.length === 0
        ? true
        : false;
      const shouldBePrimary = isPrimary || (index === 0 && (existingImages ?? []).length === 0 && uploaded.length === 0);

      const { data: imageRow, error: insertError } = await db
        .from("product_images")
        .insert({
          product_id: productId,
          storage_path: storagePath,
          alt_text: altText,
          sort_order: sortOrder++,
          is_primary: shouldBePrimary,
        })
        .select("id, storage_path, alt_text, is_primary, sort_order")
        .single();

      if (insertError) {
        await db.storage.from(BUCKET).remove([storagePath]);
        throw insertError;
      }

      if (shouldBePrimary) {
        await db
          .from("product_images")
          .update({ is_primary: false })
          .eq("product_id", productId)
          .neq("id", imageRow.id);
      }

      uploaded.push({ ...imageRow, public_url: publicUrl(db, storagePath) });
    }

    return Response.json({ success: true, images: uploaded }, { status: 201 });
  } catch (error) {
    logger.error("[Admin Product Images POST] failed", error);
    return handleApiError(error, "Admin Product Images POST", "Failed to upload image");
  }
}

export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const imageId = String(body?.image_id || "");
    if (!UUID_RE.test(imageId)) {
      return Response.json({ success: false, message: "Invalid image id" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const { data: image, error } = await db
      .from("product_images")
      .select("id, product_id")
      .eq("id", imageId)
      .maybeSingle();
    if (error) throw error;
    if (!image) {
      return Response.json({ success: false, message: "Image not found" }, { status: 404 });
    }

    if (body.action === "set_primary") {
      await db
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", image.product_id);
      const { error: setError } = await db
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", imageId);
      if (setError) throw setError;
      return Response.json({ success: true });
    }

    if (body.action === "reorder") {
      const sortOrder = Number(body.sort_order);
      if (!Number.isFinite(sortOrder)) {
        return Response.json({ success: false, message: "Invalid sort order" }, { status: 400 });
      }
      const { error: reorderError } = await db
        .from("product_images")
        .update({ sort_order: Math.trunc(sortOrder) })
        .eq("id", imageId);
      if (reorderError) throw reorderError;
      return Response.json({ success: true });
    }

    return Response.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleApiError(error, "Admin Product Images PATCH", "Failed to update image");
  }
}

export async function DELETE(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("id") || "";
    if (!UUID_RE.test(imageId)) {
      return Response.json({ success: false, message: "Invalid image id" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const { data: image, error } = await db
      .from("product_images")
      .select("id, product_id, storage_path, is_primary")
      .eq("id", imageId)
      .maybeSingle();
    if (error) throw error;
    if (!image) {
      return Response.json({ success: false, message: "Image not found" }, { status: 404 });
    }

    // Remove the object first; if that fails, keep the row so an orphan is
    // visible rather than silently leaking a file.
    const { error: removeError } = await db.storage.from(BUCKET).remove([image.storage_path]);
    if (removeError) {
      logger.warn("[Admin Product Images DELETE] storage remove failed:", removeError.message);
    }

    const { error: deleteError } = await db.from("product_images").delete().eq("id", imageId);
    if (deleteError) throw deleteError;

    if (image.is_primary) {
      const { data: next } = await db
        .from("product_images")
        .select("id")
        .eq("product_id", image.product_id)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next) {
        await db.from("product_images").update({ is_primary: true }).eq("id", next.id);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Admin Product Images DELETE", "Failed to delete image");
  }
}
