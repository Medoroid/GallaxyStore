import { verifyAdmin } from "../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { isMissingRelation, migrationRequiredResponse } from "@/lib/creator/api";
import { validateTemplatePayload, templateToRow, rowToTemplate } from "@/lib/mockup-library/validate";

export const runtime = "nodejs";

const MIGRATION_FILE = "supabase/migrations/20261116130000_custom_print_studio.sql";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bad(message, status = 400, field) {
  return Response.json({ success: false, message, ...(field ? { field } : {}) }, { status });
}

async function guardAuth(request) {
  const auth = await verifyAdmin(request);
  return auth.error ? { error: bad(auth.error, auth.status) } : { auth };
}

/** GET — full mockup catalog including geometry, for the admin editor. */
export async function GET(request) {
  try {
    const checked = await guardAuth(request);
    if (checked.error) return checked.error;

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("mockup_templates")
      .select("*")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (isMissingRelation(error)) return migrationRequiredResponse("admin.templates", MIGRATION_FILE);
    if (error) throw error;

    return Response.json({ success: true, templates: (data ?? []).map(rowToTemplate) });
  } catch (error) {
    return handleApiError(error, "Admin mockup templates GET", "Could not load mockup templates.");
  }
}

/**
 * POST — create a template. `template_key` becomes immutable on insert; all
 * render-affecting fields are validated and SVG fragments are sanitised first.
 */
export async function POST(request) {
  try {
    const checked = await guardAuth(request);
    if (checked.error) return checked.error;
    const { allowed } = await checkRateLimitAsync(`mockup-create:${getClientIp(request)}`, {
      maxRequests: 30,
      failureMode: "fail_open",
    });
    if (!allowed) return bad("Too many requests.", 429);

    const parsed = validateTemplatePayload(await request.json().catch(() => null));
    if (!parsed.ok) return bad(parsed.error, 400, parsed.field);

    const row = templateToRow(parsed.value);
    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("mockup_templates")
      .insert(row)
      .select("*")
      .single();
    if (isMissingRelation(error)) return migrationRequiredResponse("admin.templates.create", MIGRATION_FILE);
    if (error?.code === "23505") return bad("That template_key already exists.", 409, "template_key");
    if (error) throw error;

    await db.from("admin_audit_log").insert({
      actor_id: checked.auth.user.id,
      actor_email: checked.auth.user.email ?? null,
      action: "mockup_template_created",
      entity_type: "mockup_template",
      entity_id: data.id,
      details: { template_key: data.template_key, provenance: row.provenance },
    });

    return Response.json({ success: true, template: rowToTemplate(data) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin mockup templates POST", "Could not create the template.");
  }
}

/** PATCH — edit geometry/colours/views/SVG. `template_key` is frozen. */
export async function PATCH(request) {
  try {
    const checked = await guardAuth(request);
    if (checked.error) return checked.error;

    const body = await request.json().catch(() => null);
    const id = String(body?.id ?? "");
    if (!UUID_RE.test(id)) return bad("A valid template id is required.", 400, "id");

    const parsed = validateTemplatePayload(body?.template ?? body);
    if (!parsed.ok) return bad(parsed.error, 400, parsed.field);

    const db = getServiceRoleClient();
    // Read the existing key first: template_key namespaces stored mockup paths.
    const { data: existing, error: readError } = await db
      .from("mockup_templates")
      .select("template_key")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (isMissingRelation(readError)) return migrationRequiredResponse("admin.templates.update", MIGRATION_FILE);
    if (readError) throw readError;
    if (!existing) return bad("Template not found.", 404);
    if (existing.template_key !== parsed.value.key) {
      return bad("template_key cannot be changed; it namespaces saved mockups.", 409, "template_key");
    }

    const patch = templateToRow(parsed.value);
    delete patch.template_key;
    if (Number.isFinite(Number(body.sort_order))) patch.sort_order = Number(body.sort_order);
    patch.updated_at = new Date().toISOString();
    const { data, error } = await db
      .from("mockup_templates")
      .update(patch)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw error;

    await db.from("admin_audit_log").insert({
      actor_id: checked.auth.user.id,
      actor_email: checked.auth.user.email ?? null,
      action: "mockup_template_updated",
      entity_type: "mockup_template",
      entity_id: id,
      details: { template_key: existing.template_key, views: patch.views?.length ?? 0 },
    });

    return Response.json({ success: true, template: rowToTemplate(data ?? { ...patch, id }) });
  } catch (error) {
    return handleApiError(error, "Admin mockup templates PATCH", "Could not update the template.");
  }
}

/** DELETE — soft delete only (customer orders may reference the template). */
export async function DELETE(request) {
  try {
    const checked = await guardAuth(request);
    if (checked.error) return checked.error;

    const id = String(new URL(request.url).searchParams.get("id") ?? "");
    if (!UUID_RE.test(id)) return bad("A valid template id is required.", 400, "id");

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("mockup_templates")
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id, template_key")
      .maybeSingle();
    if (isMissingRelation(error)) return migrationRequiredResponse("admin.templates.delete", MIGRATION_FILE);
    if (error) throw error;
    if (!data) return bad("Template not found.", 404);

    await db.from("admin_audit_log").insert({
      actor_id: checked.auth.user.id,
      actor_email: checked.auth.user.email ?? null,
      action: "mockup_template_deleted",
      entity_type: "mockup_template",
      entity_id: id,
      details: { template_key: data.template_key },
    });

    return Response.json({ success: true, template: data });
  } catch (error) {
    return handleApiError(error, "Admin mockup templates DELETE", "Could not delete the template.");
  }
}
