import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import {
  isProductImagePathForProduct,
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_BUCKET,
  productImageStoragePath,
  validateProductImageFile,
} from "@/lib/product-image-upload";
import { MAX_PRODUCT_IMAGES } from "@/lib/product-admin";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function json(message, status) {
  return Response.json({ success: false, message }, { status });
}

function uuid(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(candidate) ? candidate : null;
}

function publicUrl(db, path) {
  return db.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function authenticateVendor(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return { error: json("Authorization required", 401) };

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { error: json("Authorization required", 401) };

  const userClient = getSupabaseForUser(token);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser(token);
  if (authError || !user) return { error: json("Invalid token", 401) };

  const { data: store, error: storeError } = await userClient
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (storeError) throw storeError;
  if (!store) return { error: json("Vendor store not found", 403) };

  return { user, store };
}

async function ownedProduct(db, productId, storeId) {
  const { data, error } = await db
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("store_id", storeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function ownedImage(db, imageId, storeId) {
  const { data: image, error } = await db
    .from("product_images")
    .select("id, product_id, storage_path, is_primary, alt_text, sort_order")
    .eq("id", imageId)
    .maybeSingle();
  if (error) throw error;
  if (!image) return null;

  const product = await ownedProduct(db, image.product_id, storeId);
  if (!product) return null;
  return image;
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
    const { allowed } = await checkRateLimitAsync(
      `vendor-product-images:${getClientIp(request)}`,
      { maxRequests: 30, windowMs: 60_000, failureMode: "fail_closed" }
    );
    if (!allowed) return json("Too many uploads. Please try again shortly.", 429);

    const auth = await authenticateVendor(request);
    if (auth.error) return auth.error;

    const form = await request.formData().catch(() => null);
    if (!form) return json("Expected multipart/form-data", 400);

    const productId = uuid(form.get("product_id"));
    if (!productId) return json("Invalid product id", 400);

    const db = getServiceRoleClient();
    const product = await ownedProduct(db, productId, auth.store.id);
    if (!product) return json("Product not found", 404);

    const files = [...form.getAll("files"), ...form.getAll("file")].filter(
      (entry) => entry && typeof entry === "object" && "arrayBuffer" in entry
    );
    if (files.length === 0) return json("No image files provided", 400);

    const { count, error: countError } = await db
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);

    if (countError) throw countError;
    if (Number(count ?? 0) + files.length > MAX_PRODUCT_IMAGES) {
      return json(`A product can have at most ${MAX_PRODUCT_IMAGES} images`, 400);
    }

    const altText = String(form.get("alt_text") || "").trim().slice(0, 300) || null;
    const makePrimary = String(form.get("is_primary") || "") === "true";
    const existingPrimary = await db
      .from("product_images")
      .select("id")
      .eq("product_id", productId)
      .eq("is_primary", true)
      .maybeSingle();

    // Validate every file before writing anything so a bad file late in the
    // list cannot leave earlier files half-uploaded.
    const validations = files.map((file) => ({
      file,
      validation: validateProductImageFile({ type: file.type, size: file.size }),
    }));
    const invalid = validations.find((entry) => !entry.validation.ok);
    if (invalid && !invalid.validation.ok) return json(invalid.validation.message, 400);

    let sortOrder = await nextSortOrder(db, productId);
    const uploaded = [];
    const createdImageIds = [];
    const createdPaths = [];
    const previousPrimaryId = existingPrimary.data?.id ?? null;

    try {
      for (const [index, entry] of validations.entries()) {
        if (!entry.validation.ok) continue;
        const { file, validation } = entry;
        if (Number(file.size) > MAX_PRODUCT_IMAGE_BYTES) {
          throw new Error("Each image must be 5MB or smaller");
        }

        const storagePath = productImageStoragePath(productId, validation.extension);
        if (!isProductImagePathForProduct(storagePath, productId)) {
          throw new Error("Invalid image path");
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await db.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .upload(storagePath, buffer, {
            contentType: validation.contentType,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        createdPaths.push(storagePath);

        const shouldBePrimary =
          (makePrimary && index === 0 && uploaded.length === 0) ||
          (!existingPrimary.data && index === 0 && uploaded.length === 0);

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

        if (insertError) throw insertError;
        createdImageIds.push(imageRow.id);

        if (shouldBePrimary) {
          await db
            .from("product_images")
            .update({ is_primary: false })
            .eq("product_id", productId)
            .neq("id", imageRow.id);
        }

        uploaded.push({ ...imageRow, public_url: publicUrl(db, storagePath) });
      }
    } catch (uploadError) {
      // Best-effort rollback: each step is independent so one failed cleanup
      // does not skip the others. Orphaned storage objects are preferable to a
      // database row pointing at a missing object.
      if (createdImageIds.length > 0) {
        const { error: cleanupError } = await db
          .from("product_images")
          .delete()
          .in("id", createdImageIds);
        if (cleanupError) {
          logger.warn("[Vendor Product Images POST] rollback delete failed", {
            error: cleanupError.message,
          });
        }
      }
      if (createdPaths.length > 0) {
        const { error: cleanupError } = await db.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .remove(createdPaths);
        if (cleanupError) {
          logger.warn("[Vendor Product Images POST] rollback storage remove failed", {
            error: cleanupError.message,
          });
        }
      }
      if (previousPrimaryId) {
        const { error: cleanupError } = await db
          .from("product_images")
          .update({ is_primary: true })
          .eq("id", previousPrimaryId);
        if (cleanupError) {
          logger.warn("[Vendor Product Images POST] rollback primary restore failed", {
            error: cleanupError.message,
          });
        }
      }
      throw uploadError;
    }

    return Response.json({ success: true, images: uploaded }, { status: 201 });
  } catch (error) {
    logger.error("[Vendor Product Images POST] failed", error);
    return handleApiError(error, "Vendor Product Images POST", "Failed to upload image");
  }
}

export async function PATCH(request) {
  try {
    const { allowed } = await checkRateLimitAsync(
      `vendor-product-images-write:${getClientIp(request)}`,
      { maxRequests: 60, windowMs: 60_000, failureMode: "fail_closed" }
    );
    if (!allowed) return json("Too many requests. Please try again shortly.", 429);

    const auth = await authenticateVendor(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const imageId = uuid(body?.image_id);
    if (!imageId) return json("Invalid image id", 400);

    const db = getServiceRoleClient();
    const image = await ownedImage(db, imageId, auth.store.id);
    if (!image) return json("Image not found", 404);

    if (body.action === "set_primary") {
      if (image.is_primary) return Response.json({ success: true });

      const { data: previousPrimary } = await db
        .from("product_images")
        .select("id")
        .eq("product_id", image.product_id)
        .eq("is_primary", true)
        .neq("id", imageId)
        .maybeSingle();

      const { error: clearError } = await db
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", image.product_id);
      if (clearError) throw clearError;

      const { error: setError } = await db
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", imageId);
      if (setError) {
        // Do not leave the product without a primary image.
        if (previousPrimary?.id) {
          await db
            .from("product_images")
            .update({ is_primary: true })
            .eq("id", previousPrimary.id);
        }
        throw setError;
      }
      return Response.json({ success: true });
    }

    if (body.action === "reorder") {
      const sortOrder = Number(body.sort_order);
      if (!Number.isFinite(sortOrder)) return json("Invalid sort order", 400);
      const { error } = await db
        .from("product_images")
        .update({ sort_order: Math.trunc(sortOrder) })
        .eq("id", imageId);
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (body.action === "alt_text") {
      const altText = String(body.alt_text || "").trim().slice(0, 300) || null;
      const { error } = await db
        .from("product_images")
        .update({ alt_text: altText })
        .eq("id", imageId);
      if (error) throw error;
      return Response.json({ success: true, alt_text: altText });
    }

    return json("Invalid action", 400);
  } catch (error) {
    return handleApiError(error, "Vendor Product Images PATCH", "Failed to update image");
  }
}

export async function DELETE(request) {
  try {
    const { allowed } = await checkRateLimitAsync(
      `vendor-product-images-write:${getClientIp(request)}`,
      { maxRequests: 60, windowMs: 60_000, failureMode: "fail_closed" }
    );
    if (!allowed) return json("Too many requests. Please try again shortly.", 429);

    const auth = await authenticateVendor(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const imageId = uuid(searchParams.get("id"));
    if (!imageId) return json("Invalid image id", 400);

    const db = getServiceRoleClient();
    const image = await ownedImage(db, imageId, auth.store.id);
    if (!image) return json("Image not found", 404);

    // Never delete a storage object that another row still references.
    const { data: shared, error: sharedError } = await db
      .from("product_images")
      .select("id")
      .eq("storage_path", image.storage_path)
      .neq("id", imageId)
      .limit(1);
    if (sharedError) throw sharedError;

    // Delete the row first. If that fails, the image must remain readable. A
    // failed storage cleanup only leaves an orphan object, which is safer than
    // a database row pointing at a missing object.
    const { error: deleteError } = await db
      .from("product_images")
      .delete()
      .eq("id", imageId);
    if (deleteError) throw deleteError;

    if ((shared ?? []).length === 0) {
      const { error: removeError } = await db.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .remove([image.storage_path]);
      if (removeError) {
        logger.warn(
          "[Vendor Product Images DELETE] storage remove failed:",
          removeError.message
        );
      }
    }

    if (image.is_primary) {
      const { data: next } = await db
        .from("product_images")
        .select("id")
        .eq("product_id", image.product_id)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next) {
        await db
          .from("product_images")
          .update({ is_primary: true })
          .eq("id", next.id);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Vendor Product Images DELETE", "Failed to delete image");
  }
}
