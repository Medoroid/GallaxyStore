/**
 * @jest-environment node
 *
 * Static guards for the Creator Design Studio core migration (phase 2).
 *
 * The migration cannot be executed by the unit test run (and must never be
 * pushed without an isolated staging environment), so these guards keep the
 * reviewed invariants visible:
 *   - it only extends the live baseline, never rebuilds or drops it
 *   - the four new tables are SELECT-only under RLS (no client write path,
 *     therefore no self-approval path)
 *   - ownership, publication and fulfillment boundaries are column-level facts
 *   - storage changes are additive and scoped to the two design buckets
 *   - the file is idempotent (drop-then-create / IF NOT EXISTS pairing)
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const FILE = "20261110120000_creator_studio_core.sql";

function migration(name: string) {
  return readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
}

const sql = migration(FILE);
const flat = sql.replace(/\s+/g, " ").toLowerCase();

function createTableBlock(table: string) {
  const marker = `create table if not exists public.${table}`;
  const start = flat.indexOf(marker);
  if (start < 0) throw new Error(`missing create table for ${table}`);
  const end = flat.indexOf(");", start);
  if (end < 0) throw new Error(`unterminated create table for ${table}`);
  return flat.slice(start, end + 2);
}

/** Extract `create policy <name> on <table>` statements with their body. */
function policyStatements() {
  const out: Array<{ name: string; table: string; body: string }> = [];
  const re = /create policy (\w+)\s+on ([\w.]+)([\s\S]*?);/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    out.push({ name: match[1], table: match[2], body: match[3].replace(/\s+/g, " ").toLowerCase() });
  }
  return out;
}

function droppedObjects(kind: "policy" | "trigger") {
  const re = new RegExp(`drop ${kind} if exists (\\w+)\\s+on ([\\w.]+)`, "g");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) out.push(`${match[1]}@${match[2]}`);
  return out.sort();
}

function createdObjects(kind: "policy" | "trigger") {
  const re =
    kind === "policy"
      ? /create policy (\w+)\s+on ([\w.]+)/g
      : /create trigger (\w+)\s+(?:before|after|instead of)[\s\S]*?\son ([\w.]+)/g;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) out.push(`${match[1]}@${match[2]}`);
  return out.sort();
}

describe("creator studio core migration — file placement", () => {
  test("version is unique and applies before follow-up studio migrations", () => {
    const files = readdirSync(join(process.cwd(), "supabase", "migrations")).filter((f) =>
      f.endsWith(".sql")
    );
    const mine = FILE.match(/^(\d+)/)?.[1];
    expect(mine).toBe("20261110120000");

    const others = files
      .filter((f) => f !== FILE)
      .map((f) => ({ file: f, version: f.match(/^(\d+)/)?.[1] }))
      .filter((entry): entry is { file: string; version: string } => Boolean(entry.version));

    expect(others.map((o) => o.version)).not.toContain(mine);

    for (const { file, version } of others) {
      if (file.includes("_creator_studio_")) {
        // Follow-up phase migrations (template seed, publish functions, …)
        // INSERT into this file's tables — they must apply AFTER it.
        expect(Number(version)).toBeGreaterThan(Number(mine));
      }
      // Non-studio migrations are the live baseline OR unrelated follow-on
      // work that legitimately lands later (e.g. admin performance fixes) —
      // they don't order against the studio family. The preflight DO block
      // inside this migration is the apply-time guard for its real deps.
    }
  });
});

describe("creator studio core migration — baseline safety", () => {
  test("fails early when the live design subsystem baseline is missing", () => {
    for (const dep of [
      "to_regclass('public.user_designs')",
      "to_regclass('public.design_versions')",
      "to_regclass('public.design_files')",
      "to_regclass('public.design_categories')",
      "to_regclass('public.profiles')",
      "to_regclass('public.products')",
      "to_regprocedure('public.is_admin()')",
      "to_regprocedure('public.set_updated_at()')",
      "to_regprocedure('public.owns_design(uuid)')",
      "to_regtype('public.design_status')",
      "to_regtype('public.design_file_format')",
    ]) {
      expect(flat).toContain(dep);
    }
    expect(flat).toContain("dependency missing: public.user_designs");
    expect(flat).toContain("dependency missing: public.owns_design(uuid)");
  });

  test("never drops or rebuilds baseline objects", () => {
    expect(flat).not.toContain("drop table");
    expect(flat).not.toContain("drop type");
    expect(flat).not.toContain("delete from");
    expect(flat).not.toContain("alter table public.user_designs");
    expect(flat).not.toContain("alter table public.products");
    expect(flat).not.toContain("alter table public.profiles");
    expect(flat).not.toContain("alter table public.design_files");
    expect(flat).not.toContain("insert into public.products");
    expect(flat).not.toContain("insert into public.user_designs");
  });

  test("extends design_versions with editor state only (additive)", () => {
    expect(flat).toContain(
      "alter table public.design_versions add column if not exists editor_state jsonb not null default '{}'::jsonb"
    );
  });

  test("adds jpg/webp to the file format enum without inserting those values here", () => {
    expect(flat).toContain("alter type public.design_file_format add value if not exists 'jpg'");
    expect(flat).toContain("alter type public.design_file_format add value if not exists 'webp'");
    // Using a new enum value inside the same transaction is unsafe; the seed of
    // rows using 'jpg'/'webp' must happen at runtime, not in this file.
    expect(flat).not.toContain("insert into public.design_files");
  });
});

describe("creator studio core migration — tables", () => {
  test("creates exactly the four planned tables, all idempotently", () => {
    for (const table of [
      "creator_profiles",
      "creator_product_templates",
      "creator_design_products",
      "creator_gallery_items",
    ]) {
      expect(flat).toContain(`create table if not exists public.${table}`);
    }
    expect(flat).not.toContain("create table if not exists public.creator_submissions");
    expect(flat).not.toContain("create table if not exists public.creator_designs");
    const createTables = flat.match(/create table(?! if not exists)/g) ?? [];
    expect(createTables).toHaveLength(0);
  });

  test("creator_profiles is a public persona with no private account fields", () => {
    const block = createTableBlock("creator_profiles");
    expect(block).toContain("user_id uuid not null unique");
    expect(block).toContain("username text not null unique");
    expect(block).toContain("username ~ '^[a-z0-9_]{3,30}$'");
    expect(block).toContain("can_publish boolean not null default true");
    expect(block).toContain("is_featured boolean not null default false");
    // Private data stays in profiles (which has no public read policy).
    expect(block).not.toContain("email");
    expect(block).not.toContain("phone");
    expect(block).not.toContain("password");
  });

  test("creator_design_products links to real entities instead of duplicating them", () => {
    const block = createTableBlock("creator_design_products");
    expect(block).toContain("design_id uuid not null references public.user_designs (id) on delete cascade");
    expect(block).toContain(
      "template_id uuid not null references public.creator_product_templates (id) on delete restrict"
    );
    expect(block).toContain(
      "creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade"
    );
    expect(block).toContain("product_id uuid references public.products (id) on delete set null");
    // Price, ownership and approval live on products / designs / review columns —
    // never re-declared here where they could drift.
    expect(block).not.toContain("base_price");
    expect(block).not.toContain("owner_id");
    expect(block).not.toContain("created_by");
  });

  test("review state uses the existing design_status enum with soft delete", () => {
    for (const table of ["creator_design_products", "creator_gallery_items"]) {
      const block = createTableBlock(table);
      expect(block).toContain("status public.design_status not null default 'draft'");
      expect(block).toContain("rejection_reason text");
      expect(block).toContain("reviewed_by uuid references public.profiles (id)");
      expect(block).toContain("deleted_at timestamptz");
    }
  });

  test("fulfillment boundary is explicit and defaults to unconfigured", () => {
    const block = createTableBlock("creator_design_products");
    expect(block).toContain(
      "fulfillment_mode text not null default 'unconfigured' constraint creator_design_products_fulfillment_check check (fulfillment_mode in ('unconfigured', 'configured'))"
    );
    expect(block).toContain("stock_buffer integer not null default 0");
    expect(block).toContain("check (stock_buffer between 0 and 100000)");
  });

  test("gallery items carry publication state and can later link to a product", () => {
    const block = createTableBlock("creator_gallery_items");
    expect(block).toContain("owner_id uuid not null references public.profiles (id) on delete cascade");
    expect(block).toContain("published_at timestamptz");
    expect(block).toContain("visibility text not null default 'public'");
    expect(block).toContain("check (visibility in ('public', 'unlisted'))");
    expect(block).toContain("product_id uuid references public.products (id) on delete set null");
  });

  test("one live configuration per design per product type", () => {
    expect(flat).toContain(
      "create unique index if not exists creator_design_products_design_template_uq on public.creator_design_products (design_id, template_id) where deleted_at is null"
    );
  });

  test("template geometry columns are typed jsonb with format guard", () => {
    const block = createTableBlock("creator_product_templates");
    expect(block).toContain("dimensions_mm jsonb not null");
    expect(block).toContain("views jsonb not null");
    expect(block).toContain("colors jsonb not null");
    expect(block).toContain("sizes jsonb not null");
    expect(block).toContain("check (mockup_format in ('png', 'jpg', 'webp'))");
  });
});

describe("creator studio core migration — RLS is select-only", () => {
  const newTables = [
    "public.creator_profiles",
    "public.creator_product_templates",
    "public.creator_design_products",
    "public.creator_gallery_items",
  ];

  test("row level security is enabled on all four tables", () => {
    for (const table of newTables) {
      expect(flat).toContain(`alter table ${table} enable row level security`);
    }
  });

  test("no INSERT/UPDATE/DELETE policy exists on any new table", () => {
    const statements = policyStatements().filter((p) => p.table.startsWith("public.creator_"));
    expect(statements.length).toBeGreaterThanOrEqual(6);
    for (const statement of statements) {
      expect(newTables).toContain(statement.table);
      expect(statement.body).toMatch(/\bfor select\b/);
      expect(statement.body).not.toMatch(/\bfor insert\b/);
      expect(statement.body).not.toMatch(/\bfor update\b/);
      expect(statement.body).not.toMatch(/\bfor delete\b/);
      expect(statement.body).not.toMatch(/\bfor all\b/);
    }
  });

  test("public gallery read requires approved, public, non-deleted rows", () => {
    const policy = policyStatements().find((p) => p.name === "creator_gallery_items_public_select");
    expect(policy).toBeDefined();
    expect(policy?.body).toContain("status = 'approved'");
    expect(policy?.body).toContain("visibility = 'public'");
    expect(policy?.body).toContain("deleted_at is null");
  });

  test("public read of a product configuration requires a live published product", () => {
    const policy = policyStatements().find((p) => p.name === "creator_design_products_public_select");
    expect(policy).toBeDefined();
    expect(policy?.body).toContain("product_id is not null");
    expect(policy?.body).toContain("p.status = 'published'");
    expect(policy?.body).toContain("p.visibility = 'visible'");
    expect(policy?.body).toContain("p.deleted_at is null");
  });

  test("owner read goes through the owns_design baseline helper", () => {
    const policy = policyStatements().find((p) => p.name === "creator_design_products_owner_select");
    expect(policy?.body).toContain("using (public.owns_design(design_id))");
  });

  test("every create policy is preceded by a drop policy if exists (idempotent)", () => {
    expect(droppedObjects("policy")).toEqual(createdObjects("policy"));
  });

  test("every create trigger is preceded by a drop trigger if exists", () => {
    expect(droppedObjects("trigger")).toEqual(createdObjects("trigger"));
  });

  test("grants: storefront reads, service role writes", () => {
    for (const table of [
      "creator_profiles",
      "creator_product_templates",
      "creator_design_products",
      "creator_gallery_items",
    ]) {
      expect(flat).toContain(
        `revoke all on public.${table} from public, anon, authenticated`
      );
      expect(flat).toContain(`grant select on public.${table} to anon, authenticated`);
      expect(flat).toContain(`grant all on public.${table} to service_role`);
    }
  });
});

describe("creator studio core migration — storage", () => {
  test("both design buckets exist on a fresh environment without clobbering live config", () => {
    expect(flat).toContain("insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)");
    expect(flat).toContain("'design-uploads'");
    expect(flat).toContain("'design-previews'");
    expect((flat.match(/on conflict \(id\) do nothing/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(flat).not.toContain("on conflict (id) do update");
  });

  test("originals stay private, generated previews stay public", () => {
    expect(flat).toMatch(/'design-uploads', 'design-uploads', false, 209715200/);
    expect(flat).toMatch(/'design-previews', 'design-previews', true, 5242880/);
  });

  test("design-uploads MIME list gains jpeg and webp additively", () => {
    const update = flat.slice(flat.indexOf("update storage.buckets"));
    expect(update).toContain("where id = 'design-uploads'");
    expect(update).toContain("'image/jpeg'");
    expect(update).toContain("'image/webp'");
    expect(update).toContain("'image/png'");
    expect(update).toContain("'image/svg+xml'");
    // Only additive: never narrows what the live bucket already accepts.
    expect(update).toContain("and not (allowed_mime_types @> array['image/jpeg', 'image/webp'])");
  });

  test("owner-folder upload policies scope to the authenticated user", () => {
    const ownerPolicies = ["design_uploads_owner_insert", "design_uploads_owner_or_admin_select"];
    for (const name of ownerPolicies) {
      const policy = policyStatements().find((p) => p.name === name);
      expect(policy).toBeDefined();
      expect(policy?.body).toContain("bucket_id = 'design-uploads'");
      expect(policy?.body).toContain("storage.foldername(name))[1] = (select auth.uid())::text");
    }
  });

  test("never touches buckets owned by other features", () => {
    for (const bucket of [
      "product-images",
      "gallery-images",
      "avatars",
      "site-banners",
      "payment-receipts",
      "custom-print-designs",
      "review-media",
      "fonts",
      "customization-previews",
    ]) {
      expect(flat).not.toContain(`'${bucket}'`);
    }
  });
});
