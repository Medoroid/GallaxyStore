/**
 * Server-only helpers for the design API routes (Node crypto + multipart).
 *
 * ⚠️ This module must never be imported from client components — it uses
 * `node:crypto`. The browser shares the PURE modules instead:
 * `validate.ts`, `svg-sanitize.ts`, `placement.ts`, `history.ts`,
 * `editor-state.ts`, `design-input.ts`.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation, migrationRequiredResponse } from "@/lib/creator/api";
import { sanitizeSvg } from "./svg-sanitize";
import { validateArtwork, type ArtworkValidation } from "./validate";
import type { ArtworkErrorCode, ArtworkFormat } from "./types";

export const DESIGN_UPLOAD_BUCKET = "design-uploads";

const CANONICAL_MIME: Record<ArtworkFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const EXTENSION: Record<ArtworkFormat, string> = {
  png: "png",
  jpg: "jpg",
  webp: "webp",
  svg: "svg",
};

/** Failure returned by `prepareArtwork`, shaped for a direct 400 response. */
export type UploadFailure = {
  ok: false;
  status: 400 | 503;
  code: ArtworkErrorCode | "not_svg" | "storage_rejected" | "MIGRATION_REQUIRED";
  message: string;
};

export type PreparedArtwork = {
  ok: true;
  format: ArtworkFormat;
  widthPx: number | null;
  heightPx: number | null;
  dpi: number | null;
  colorMode: string | null;
  hasTransparency: boolean | null;
  warnings: string[];
  /** Bytes to persist — for SVG this is the SANITIZED markup, never the original. */
  storeBytes: Uint8Array;
  contentType: string;
  extension: string;
  sha256: string;
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Validate an uploaded file and, for SVG, run the sanitizer. The stored bytes
 * are always the safe ones; the original SVG text is never written to Storage.
 */
export function prepareArtwork(
  bytes: Uint8Array,
  opts: { filename?: string; mimeType?: string } = {}
): PreparedArtwork | UploadFailure {
  const validation: ArtworkValidation = validateArtwork(bytes, opts);
  if (!validation.ok || !validation.format) {
    return {
      ok: false,
      status: 400,
      code: validation.code ?? "invalid_file",
      message: validation.message ?? "This file could not be read.",
    };
  }

  const format = validation.format;
  let storeBytes: Uint8Array = bytes;
  if (format === "svg") {
    const sanitized = sanitizeSvg(bytes);
    if (!sanitized.ok) {
      return {
        ok: false,
        status: 400,
        code: sanitized.code === "not_svg" ? "not_svg" : "svg_too_large",
        message: sanitized.message,
      };
    }
    storeBytes = new TextEncoder().encode(sanitized.svg);
  }

  return {
    ok: true,
    format,
    widthPx: validation.widthPx ?? null,
    heightPx: validation.heightPx ?? null,
    dpi: validation.dpi ?? null,
    colorMode: validation.colorMode ?? null,
    hasTransparency: validation.hasTransparency ?? null,
    warnings: validation.warnings,
    storeBytes,
    contentType: CANONICAL_MIME[format],
    extension: EXTENSION[format],
    sha256: sha256Hex(storeBytes),
  };
}

/** Collision-proof object name inside the owner/design folder. */
export function artworkObjectName(format: ArtworkFormat): string {
  return `${crypto.randomUUID()}.${EXTENSION[format]}`;
}

/** `${owner}/${design}/${file}` — first folder must be the owner (storage policy). */
export function artworkStoragePath(
  userId: string,
  designId: string,
  format: ArtworkFormat
): string {
  return `${userId}/${designId}/${artworkObjectName(format)}`;
}

/**
 * Pre-flight: the studio's `editor_state` column ships in the Creator Studio
 * migration. When it is absent, every surface that reads or writes it fails
 * with an honest 503 BEFORE any side effects — never a half-working studio
 * or a fake success. Returns true when the response should be sent as-is.
 */
export async function migrationGuard(
  client: SupabaseClient,
  context: string
): Promise<{ missing: false } | { missing: true; response: Response }> {
  const { error } = await client.from("design_versions").select("editor_state").limit(1);
  if (error && isMissingRelation(error)) {
    return { missing: true, response: migrationRequiredResponse(context) };
  }
  if (error) throw error;
  return { missing: false };
}

/** Parse a multipart upload request ONCE (the body is one-shot) and return
 * the form plus the parsed file bytes; a 400 failure when malformed. */
export async function readUpload(
  request: Request,
  fieldName = "file"
): Promise<
  | { ok: true; form: FormData; file: File; bytes: Uint8Array }
  | { ok: false; response: Response }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      ok: false,
      response: Response.json(
        { success: false, code: "invalid_content_type", message: "Expected multipart/form-data." },
        { status: 400 }
      ),
    };
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return {
      ok: false,
      response: Response.json(
        { success: false, code: "invalid_form", message: "Could not read the form data." },
        { status: 400 }
      ),
    };
  }

  const file = form.get(fieldName);
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return {
      ok: false,
      response: Response.json(
        {
          success: false,
          code: "missing_file",
          message: "Choose a file to upload (PNG, JPG, WebP or SVG).",
        },
        { status: 400 }
      ),
    };
  }

  const upload = file as File;
  const bytes = new Uint8Array(await upload.arrayBuffer());
  return { ok: true, form, file: upload, bytes };
}

export function uploadFailure(failure: UploadFailure): Response {
  return Response.json(
    { success: false, code: failure.code, message: failure.message },
    { status: failure.status }
  );
}
