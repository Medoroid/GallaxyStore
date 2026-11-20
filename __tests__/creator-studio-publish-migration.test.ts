/**
 * @jest-environment node
 *
 * Static guards for the Phase 7 publish/review functions migration.
 *
 * The migration cannot be executed by the unit test run (and must never be
 * pushed without an isolated staging environment), so these guards keep the
 * reviewed invariants visible:
 *   - file placement: after core + template seed, unique version
 *   - preflight fails early when the studio/core schema is missing
 *   - creator_publish_product: FOR UPDATE lock, status gates, can_publish
 *     re-check, first-publish creates a HIDDEN DRAFT (never visible), the
 *     create branch is guarded by `product_id is null` (the resubmit branch
 *     only ever UPDATEs — never a second product), stock follows the D8
 *     fulfillment boundary, images capped at 12 with an empty → error
 *   - the payload can never smuggle status/visibility/slug/store columns
 *   - admin_review_creator_submission: only product|gallery, approve|reject,
 *     reason required on reject, pending_review-only, approval flips the
 *     product to published+visible, rejection demotes it, audit row written
 *   - both functions are service-role-only (no self-approval via PostgREST)
 *   - additive/idempotent: create or replace / if not exists, no drops
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const FILE = "20261110170000_creator_studio_publish_functions.sql";

function migration(name: string) {
  return readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
}

const sql = migration(FILE);
const flat = sql.replace(/\s+/g, " ").toLowerCase();

/** Slice one `create or replace function public.<name>` body for asserts. */
function functionBody(name: string) {
  const marker = `create or replace function public.${name}`;
  const start = flat.indexOf(marker);
  if (start < 0) throw new Error(`missing function ${name}`);
  const end = flat.indexOf("$$;", start);
  if (end < 0) throw new Error(`unterminated function ${name}`);
  return flat.slice(start, end + 3);
}

describe("publish functions migration — file placement", () => {
  test("version is unique and applies after core + template seed", () => {
    const files = readdirSync(join(process.cwd(), "supabase", "migrations")).filter((f) =>
      f.endsWith(".sql")
    );
    const mine = FILE.match(/^(\d+)/)?.[1];
    expect(mine).toBe("20261110170000");

    const others = files
      .filter((f) => f !== FILE)
      .map((f) => ({ file: f, version: f.match(/^(\d+)/)?.[1] }))
      .filter((entry): entry is { file: string; version: string } => Boolean(entry.version));

    expect(others.map((o) => o.version)).not.toContain(mine);

    for (const { file, version } of others) {
      if (file.includes("_creator_studio_")) {
        // Core + template seed are this migration's dependencies — it
        // INSERTs into their tables, so it must apply AFTER them.
        expect(Number(mine)).toBeGreaterThan(Number(version));
      }
      // Non-studio migrations are the live baseline OR unrelated follow-on
      // work that legitimately lands later — they don't order against this
      // file. The preflight DO block inside the migration is the apply-time
      // guard for its real dependencies.
    }

    // Named baseline dependency: the review function writes the audit log.
    const audit = others.find((o) => o.file.includes("admin_audit_log"));
    expect(audit).toBeDefined();
    if (audit) expect(Number(mine)).toBeGreaterThan(Number(audit.version));
  });
});

describe("publish functions migration — preflight & idempotency", () => {
  test("fails early when any dependency table is missing", () => {
    for (const dep of [
      "to_regclass('public.creator_profiles')",
      "to_regclass('public.creator_product_templates')",
      "to_regclass('public.creator_design_products')",
      "to_regclass('public.creator_gallery_items')",
      "to_regclass('public.products')",
      "to_regclass('public.product_variants')",
      "to_regclass('public.product_images')",
      "to_regclass('public.categories')",
      "to_regclass('public.profiles')",
      "to_regclass('public.admin_audit_log')",
    ]) {
      expect(flat).toContain(dep);
    }
    expect(flat).toContain("dependency missing: public.creator_design_products");
    expect(flat).toContain("dependency missing: public.admin_audit_log");
  });

  test("never drops or rebuilds baseline objects", () => {
    expect(flat).not.toContain("drop table");
    expect(flat).not.toContain("drop type");
    expect(flat).not.toContain("drop function");
    expect(flat).not.toContain("alter table");
    expect(flat).not.toContain("delete from public.products");
    expect(flat).not.toContain("delete from public.profiles");
    expect(flat).not.toContain("update public.profiles");
  });

  test("exactly two functions, both created idempotently", () => {
    const creates = flat.match(/create or replace function/g) ?? [];
    expect(creates).toHaveLength(2);
    expect(flat).toContain("create or replace function public.creator_publish_product");
    expect(flat).toContain("create or replace function public.admin_review_creator_submission");
  });

  test("gallery submissions get a unique (design × owner) race backstop", () => {
    expect(flat).toContain(
      "create unique index if not exists creator_gallery_items_design_owner_uq on public.creator_gallery_items (design_id, owner_id) where deleted_at is null"
    );
  });
});

describe("creator_publish_product — signatures & grants", () => {
  test("exact signature matches the plan (uuid, jsonb) → uuid", () => {
    expect(flat).toMatch(
      /create or replace function public\.creator_publish_product\( p_design_product_id uuid, p_payload jsonb \) returns uuid/
    );
  });

  test("service-role-only: revoked from public/anon/authenticated", () => {
    expect(flat).toContain(
      "revoke execute on function public.creator_publish_product(uuid, jsonb) from public, anon, authenticated"
    );
    expect(flat).toContain(
      "grant execute on function public.creator_publish_product(uuid, jsonb) to service_role"
    );
    // Never granted to a client-reachable role.
    expect(flat).not.toMatch(
      /grant execute on function public\.creator_publish_product\(uuid, jsonb\) to (public|anon|authenticated)/
    );
  });
});

describe("creator_publish_product — transactional authority", () => {
  const body = functionBody("creator_publish_product");

  test("locks the row FOR UPDATE so concurrent publishes serialize", () => {
    expect(body).toContain("and deleted_at is null for update");
    expect(body).toContain("raise exception 'publish:design_product_not_found'");
  });

  test("status gates: pending → already submitted, others → invalid status", () => {
    expect(body).toContain("if v_row.status = 'pending_review' then raise exception 'publish:already_submitted';");
    expect(body).toContain(
      "elsif v_row.status not in ('draft', 'rejected') then"
    );
    expect(body).toContain("raise exception 'publish:invalid_status';");
  });

  test("re-checks can_publish server-side (admin-managed permission)", () => {
    expect(body).toContain("from public.creator_profiles where id = v_row.creator_profile_id");
    expect(body).toContain("if not found or not v_profile.can_publish then");
    expect(body).toContain("raise exception 'publish:publish_disabled';");
  });

  test("first publish creates the product as a hidden, unfeatured draft", () => {
    expect(body).toContain("if v_row.product_id is null then");
    expect(body).toContain("'draft', 'hidden', false, v_price");
    // published_at is a NULL value in the insert (columns and values are
    // separate lists in flat SQL) — the listing can never pre-date approval.
    expect(body).toContain("color, available_colors, published_at, created_at, updated_at");
    expect(body).toContain("'{}'::text[], null, now(), now()");
    expect(body).toContain("brand_id, store_id"); // no vendor/store attribution
    // Slug is derived server-side from the name — never from the payload.
    expect(body).toContain("regexp_replace(lower(trim(v_name)), '[^a-z0-9]+', '-', 'g')");
    expect(body).not.toContain("p_payload ->> 'slug'");
  });

  test("re-submission UPDATES the same product — never a second listing", () => {
    // The else branch must update by the row's existing product_id and flip
    // the listing back to hidden draft for re-review.
    expect(body).toContain("where id = v_row.product_id");
    expect(body).toContain("returning id into v_product_id");
    expect(body).toContain("status = 'draft', visibility = 'hidden', published_at = null");
    // Exactly one products INSERT (the create branch) — and it lives BEFORE
    // the resubmit else-branch, which only ever UPDATEs.
    const inserts = body.match(/insert into public\.products/g) ?? [];
    expect(inserts).toHaveLength(1);
    const insertIndex = body.indexOf("insert into public.products");
    const elseIndex = body.indexOf("else -- re-submission");
    expect(insertIndex).toBeGreaterThan(-1);
    expect(elseIndex).toBeGreaterThan(insertIndex);
    expect(body.indexOf("insert into public.products", elseIndex)).toBe(-1);
  });

  test("payload can never set status/visibility/store_id/currency tricks", () => {
    expect(body).not.toContain("p_payload ->> 'status'");
    expect(body).not.toContain("p_payload ->> 'visibility'");
    expect(body).not.toContain("p_payload ->> 'store_id'");
    expect(body).not.toContain("p_payload ->> 'slug'");
    expect(body).not.toContain("p_payload ->> 'owner_id'");
    expect(body).not.toContain("p_payload ->> 'creator_profile_id'");
  });

  test("prices bounded; compare-at only kept above base price", () => {
    expect(body).toContain("v_price < 0 or v_price > 99999999");
    expect(body).toContain("raise exception 'publish:invalid_price';");
    expect(body).toContain("v_compare <= v_price or v_compare > 99999999");
    expect(body).toContain("v_compare := null;");
  });

  test("currency validated as a 3-letter code with an EGP fallback", () => {
    expect(body).toMatch(
      /upper\(coalesce\(\s*nullif\(trim\(coalesce\(p_payload ->> 'currency', ''\)\), ''\),\s*'egp'\s*\)\)/
    );
    expect(body).toContain("v_currency !~ '^[a-z]{3}$'");
    expect(body).toContain("raise exception 'publish:invalid_currency';");
  });

  test("images capped at 12; empty image list refuses the publish", () => {
    expect(body).toContain("t.ord <= 12");
    expect(body).toContain("length(t.value) <= 2048");
    expect(body).toContain("raise exception 'publish:no_mockups';");
    expect(body).toContain("array_length(v_images, 1)");
  });

  test("stock follows the D8 fulfillment boundary (0 unless configured)", () => {
    expect(body).toContain(
      "v_stock := case when v_row.fulfillment_mode = 'configured' then greatest(coalesce(v_row.stock_buffer, 0), 0) else 0 end;"
    );
  });

  test("the submission ends as pending_review with submitted_at stamped", () => {
    expect(body).toContain(
      "set product_id = v_product_id, status = 'pending_review', rejection_reason = null, submitted_at = now()"
    );
    expect(body).toContain("return v_product_id;");
  });

  test("default variant mirrors the product price and D8 stock", () => {
    expect(body).toContain("insert into public.product_variants");
    expect(body).toContain("is_active, is_default, created_at, updated_at");
    expect(body).toContain("v_price, v_compare, v_stock, true, true");
    expect(body).toContain("upper(left(v_slug || '-' || replace(v_product_id::text, '-', ''), 120))");
  });

  test("product images are replaced from the row's mockups (first is primary)", () => {
    expect(body).toContain("delete from public.product_images where product_id = v_product_id;");
    expect(body).toContain("u.ord = 1, u.ord - 1");
  });

  test("sets its own search_path (no hijackable search path)", () => {
    expect(body).toContain("set search_path = public, pg_temp");
  });
});

describe("admin_review_creator_submission — signatures & grants", () => {
  test("exact signature matches the plan, actor params optional", () => {
    expect(flat).toMatch(
      /create or replace function public\.admin_review_creator_submission\( p_target text, p_id uuid, p_decision text, p_reason text, p_actor_id uuid default null, p_actor_email text default null \) returns jsonb/
    );
  });

  test("service-role-only: revoked from public/anon/authenticated", () => {
    expect(flat).toContain(
      "revoke execute on function public.admin_review_creator_submission(text, uuid, text, text, uuid, text) from public, anon, authenticated"
    );
    expect(flat).toContain(
      "grant execute on function public.admin_review_creator_submission(text, uuid, text, text, uuid, text) to service_role"
    );
    expect(flat).not.toMatch(
      /grant execute on function public\.admin_review_creator_submission\([^)]*\) to (public|anon|authenticated)/
    );
  });
});

describe("admin_review_creator_submission — decision authority", () => {
  const body = functionBody("admin_review_creator_submission");

  test("only product|gallery targets and approve|reject decisions", () => {
    expect(body).toContain("if v_target not in ('product', 'gallery') then");
    expect(body).toContain("raise exception 'review:invalid_target';");
    expect(body).toContain("if v_decision not in ('approve', 'reject') then");
    expect(body).toContain("raise exception 'review:invalid_decision';");
    // No third target (design review has no submit path in this phase).
    expect(body).not.toContain("'design'");
  });

  test("rejecting requires a reason", () => {
    expect(body).toContain("if v_decision = 'reject' and v_reason is null then");
    expect(body).toContain("raise exception 'review:reason_required';");
  });

  test("locks a pending row only — anything else is invalid/not found", () => {
    expect(body).toContain("and deleted_at is null for update");
    expect(body).toContain("raise exception 'review:not_found';");
    expect(body).toContain("if v_crow.status <> 'pending_review' then");
    expect(body).toContain("raise exception 'review:invalid_status';");
  });

  test("approval flips the product to published + visible + published_at", () => {
    expect(body).toContain("set status = 'published', visibility = 'visible', published_at = now()");
    expect(body).toContain("raise exception 'review:product_missing';");
    expect(body).toContain("where id = v_crow.product_id and deleted_at is null");
  });

  test("approval stock still follows the D8 fulfillment boundary", () => {
    expect(body).toContain(
      "set stock_quantity = case when v_crow.fulfillment_mode = 'configured' then greatest(coalesce(v_crow.stock_buffer, 0), 0) else 0 end"
    );
  });

  test("rejection demotes any visible listing back to hidden draft", () => {
    expect(body).toContain("set status = 'draft', visibility = 'hidden'");
    expect(body).toContain("and (status <> 'draft' or visibility <> 'hidden')");
    expect(body).toContain("set status = 'rejected', rejection_reason = v_reason");
  });

  test("gallery approval stamps published_at; rejection stores the reason", () => {
    expect(body).toContain(
      "set status = 'approved', rejection_reason = null, reviewed_by = v_reviewer, reviewed_at = now(), published_at = now()"
    );
    expect(body).toContain(
      "set status = 'rejected', rejection_reason = v_reason, reviewed_by = v_reviewer, reviewed_at = now()"
    );
  });

  test("every decision writes one admin_audit_log row with actor + details", () => {
    expect(body).toContain("insert into public.admin_audit_log (actor_id, actor_email, action, entity_type, entity_id, details)");
    expect(body).toContain("'creator_submission_' || case v_decision when 'approve' then 'approved' else 'rejected' end");
    expect(body).toContain("'creator_design_product'");
    expect(body).toContain("'creator_gallery_item'");
    expect(body).toContain("'decision', v_decision");
    // reviewed_by only references an actor that actually has a profile row.
    expect(body).toContain("select 1 from public.profiles where id = p_actor_id");
  });

  test("returns a jsonb summary of the decision", () => {
    expect(body).toContain("return jsonb_build_object( 'target', v_target, 'id', p_id");
    expect(body).toContain("'published', v_decision = 'approve'");
  });

  test("sets its own search_path (no hijackable search path)", () => {
    expect(body).toContain("set search_path = public, pg_temp");
  });
});
