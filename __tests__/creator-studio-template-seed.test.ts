/**
 * Phase 5 — template seed migration guard (static, SQL never executed here).
 *
 * The seed must mirror the TypeScript registry (the rendering authority):
 * same 8 keys in order, same geometry, colors, sizes and categories — a drift
 * between the two would let a mockup render one product while commerce sells
 * another. Also asserts idempotency (ON CONFLICT DO NOTHING) and absence of
 * destructive statements.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { TEMPLATE_KEYS } from "@/lib/design-studio/types";
import { TEMPLATES } from "@/lib/design-studio/templates";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261110160000_creator_studio_template_seed.sql"),
  "utf8"
);

type SeedRow = {
  key: string;
  name: string;
  nameAr: string;
  category: string;
  dimensions: Record<string, number>;
  views: Array<{
    key: string;
    label: string;
    canvas: { w: number; h: number };
    print_area: { x: number; y: number; w: number; h: number };
  }>;
  colors: Array<{ key: string; name: string; name_ar: string; hex: string; shade_hex: string }>;
  sizes: Array<{ key: string; name: string; label: string }>;
  sort: number;
};

/** One row of the VALUES list — the exact formatter the migration uses. */
const ROW_RE =
  /\(\s*\n\s*'([a-z0-9_]+)',\s*'([^']*)',\s*'([^']*)',\s*'([a-z0-9_-]+)',\s*\n\s*'(\{[\s\S]*?\})'::jsonb,\s*\n\s*'(\[[\s\S]*?\])'::jsonb,\s*\n\s*'(\[[\s\S]*?\])'::jsonb,\s*\n\s*'(\[[\s\S]*?\])'::jsonb,\s*\n\s*'png',\s*true,\s*(\d+)\s*\n\s*\)/g;

function parseRows(): SeedRow[] {
  const rows: SeedRow[] = [];
  for (const match of SQL.matchAll(ROW_RE)) {
    rows.push({
      key: match[1],
      name: match[2],
      nameAr: match[3],
      category: match[4],
      dimensions: JSON.parse(match[5]),
      views: JSON.parse(match[6]),
      colors: JSON.parse(match[7]),
      sizes: JSON.parse(match[8]),
      sort: Number(match[9]),
    });
  }
  return rows;
}

const rows = parseRows();

describe("creator_studio_template_seed migration", () => {
  it("seeds exactly the 8 registry keys, in registry order", () => {
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.key)).toEqual([...TEMPLATE_KEYS]);
    expect(rows.map((r) => r.sort)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("inserts into the catalog idempotently and never destructively", () => {
    expect(SQL).toMatch(/insert into public\.creator_product_templates/);
    expect(SQL).toContain("on conflict (template_key) do nothing;");
    expect(SQL.toLowerCase()).not.toContain("drop table");
    expect(SQL.toLowerCase()).not.toContain("truncate");
    expect(SQL.toLowerCase()).not.toContain("delete from");
  });

  it("mirrors registry names, categories and dimensions per row", () => {
    for (const [index, row] of rows.entries()) {
      const template = TEMPLATES[index];
      expect(row.key).toBe(template.key);
      expect(row.name).toBe(template.name);
      expect(row.nameAr).toBe(template.nameAr);
      expect(row.category).toBe(template.category);
      expect(row.category).toMatch(/^[a-z0-9_-]{1,40}$/);
      expect(row.dimensions).toEqual(template.dimensionsMm);
    }
  });

  it("mirrors every view's canvas and print area exactly", () => {
    for (const [index, row] of rows.entries()) {
      const template = TEMPLATES[index];
      expect(row.views).toHaveLength(template.views.length);

      for (const [viewIndex, view] of row.views.entries()) {
        const expected = template.views[viewIndex];
        expect(view.key).toBe(expected.key);
        expect(view.label).toBe(expected.label);
        expect(view.canvas).toEqual(expected.canvas);
        expect(view.print_area).toEqual(expected.printArea);

        // geometry sanity inside the SQL itself (independent of the registry)
        const { x, y, w, h } = view.print_area;
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(view.canvas.w);
        expect(y + h).toBeLessThanOrEqual(view.canvas.h);
      }
    }
  });

  it("mirrors colors (keys, hex, shade, Arabic) and sizes exactly", () => {
    for (const [index, row] of rows.entries()) {
      const template = TEMPLATES[index];

      expect(row.colors).toHaveLength(template.colors.length);
      for (const [colorIndex, color] of row.colors.entries()) {
        const expected = template.colors[colorIndex];
        expect(color).toEqual({
          key: expected.key,
          name: expected.name,
          name_ar: expected.nameAr,
          hex: expected.hex,
          shade_hex: expected.shadeHex,
        });
      }

      expect(row.sizes).toHaveLength(template.sizes.length);
      for (const [sizeIndex, size] of row.sizes.entries()) {
        expect(size).toEqual(template.sizes[sizeIndex]);
      }
    }
  });
});
