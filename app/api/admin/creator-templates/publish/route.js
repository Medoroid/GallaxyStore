import { verifyAdmin } from "../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { handleApiError } from "@/lib/api-errors";
import { isMissingRelation, migrationRequiredResponse } from "@/lib/creator/api";
import {
  validateTemplateGeometry,
  hasUnpublishedChanges,
} from "@/lib/design-studio/template-schema";
import { clearTemplateCatalogCache } from "@/lib/design-studio/template-catalog";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/creator-templates/publish
 *
 * The ONLY path that mutates published geometry. Validates the admin draft,
 * snapshots it into published_* and bumps geometry_version (which invalidates
 * cached mockups). Draft fields are never written here.
 */
export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const id = body?.id;
    if (!UUID_RE.test(String(id ?? ""))) {
      return Response.json(
        { success: false, code: "invalid_id", message: "Template id is required." },
        { status: 400 }
      );
    }

    const db = getServiceRoleClient();
    const { data: row, error: readError } = await db
      .from("creator_product_templates")
      .select(
        "id, template_key, name, name_ar, category, dimensions_mm, views, colors, sizes, published_dimensions_mm, published_views, published_colors, published_sizes, is_published, geometry_version"
      )
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      if (isMissingRelation(readError)) return migrationRequiredResponse("admin.creator-templates.publish");
      throw readError;
    }
    if (!row) {
      return Response.json(
        { success: false, code: "not_found", message: "Template not found." },
        { status: 404 }
      );
    }

    const geometry = validateTemplateGeometry({
      dimensions_mm: row.dimensions_mm,
      views: row.views,
      colors: row.colors,
      sizes: row.sizes,
    });
    if (!geometry.ok) {
      return Response.json(
        {
          success: false,
          code: `invalid_${geometry.field}`,
          field: geometry.field,
          message: geometry.message,
        },
        { status: 400 }
      );
    }

    if (!hasUnpublishedChanges(row)) {
      return Response.json({ success: true, unchanged: true, geometry_version: row.geometry_version });
    }

    const { data, error } = await db
      .from("creator_product_templates")
      .update({
        published_dimensions_mm: geometry.value.dimensions_mm,
        published_views: geometry.value.views,
        published_colors: geometry.value.colors,
        published_sizes: geometry.value.sizes,
        is_published: true,
        published_at: new Date().toISOString(),
        geometry_version: Number(row.geometry_version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, template_key, is_published, published_at, geometry_version")
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error)) return migrationRequiredResponse("admin.creator-templates.publish");
      throw error;
    }

    clearTemplateCatalogCache();

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "creator_template.publish",
      entityType: "creator_product_template",
      entityId: id,
      details: {
        template_key: row.template_key,
        geometry_version: data?.geometry_version,
      },
    });

    return Response.json({ success: true, template: data });
  } catch (error) {
    return handleApiError(error, "Admin Creator Templates PUBLISH", "Could not publish the template");
  }
}
