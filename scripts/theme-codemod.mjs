#!/usr/bin/env node
/**
 * theme-codemod.mjs — one-shot codemod for the Theme Management System (Phase 2).
 *
 * Replaces repeated brand hex literals scattered across the UI with the
 * semantic theme-engine CSS variables defined in app/globals.css. After this
 * run, a seasonal theme only needs to override :root variables to re-skin the
 * whole store — no page-level edits, no seasonal hacks.
 *
 * Safety rules:
 *  - Only exact, allow-listed literals are replaced (no fuzzy matching).
 *  - Product color swatches and print colors are DATA, not UI — the files that
 *    own them (productDetailsClient.jsx, custom-print) are excluded from the
 *    unbracketed (string-literal) pass entirely.
 *  - Google logo SVG fills are never touched (their hexes are not allow-listed).
 *  - Tailwind arbitrary values keep working: `text-[#FF4FD8]` -> `text-[var(--brand)]`.
 *
 * Usage:
 *   node scripts/theme-codemod.mjs          # apply changes
 *   node scripts/theme-codemod.mjs --dry    # report only, write nothing
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "app");
const EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".js"]);
const DRY = process.argv.includes("--dry");

/** Files whose hex values are product/print data or third-party brand marks. */
const UNBRACKETED_DENY_FILES = new Set([
  "productDetailsClient.jsx", // product color swatches are data
  "custom-print/page.tsx", // print ink colors are data
  "login/page.jsx", // Google logo SVG fills
]);

/**
 * Tailwind arbitrary-value map: [#literal] -> [var(--token)]
 * (case-insensitive; applied only inside square brackets)
 */
const BRACKET_RULES = [
  ["#ff4fd8", "var(--brand)"],
  ["#a855f7", "var(--brand-2)"],
  ["#ffd166", "var(--gold)"],
  ["#0a0018", "var(--bg-deep)"],
  ["#ff6fe0", "var(--brand-hover)"],
  ["#1a0a24", "var(--bg-elevated)"],
  ["#14001e", "var(--bg-card-btn)"],
  ["#2a1035", "var(--bg-elevated-2)"],
  ["#12001f", "var(--bg-panel)"],
  ["#170122", "var(--bg-panel)"],
  ["#120018", "var(--background)"],
];

/**
 * Whole-token replacements (exact substrings; order matters — longest first).
 * Underscores inside arbitrary values are Tailwind's whitespace escape.
 */
const LITERAL_RULES = [
  // CTA hover glows (were inline rgba(255,79,216,0.3) literals)
  ["shadow-[0_0_30px_rgba(255,79,216,0.3)]", "shadow-cta"],
  ["shadow-[0_0_20px_rgba(255,79,216,0.3)]", "shadow-cta-sm"],
  [
    "shadow-[inset_0_0_0_1px_rgba(255,79,216,0.4)]",
    "shadow-[inset_0_0_0_1px_var(--brand-ring)]",
  ],
  [
    "drop-shadow-[0_0_18px_rgba(255,79,216,0.8)]",
    "drop-shadow-[0_0_18px_var(--brand-glow-strong)]",
  ],
  // Auth page glows: follow the brand pair instead of fixed fuchsia/pink
  [
    "shadow-[0_0_20px_4px_rgba(236,72,153,0.6)]",
    "shadow-[0_0_20px_4px_var(--brand-glow-mid)]",
  ],
  [
    "shadow-[0_0_60px_-10px_rgba(217,70,239,0.35)]",
    "shadow-[0_0_60px_-10px_color-mix(in_srgb,_var(--brand-2)_35%,_transparent)]",
  ],
  [
    "shadow-[0_0_25px_-5px_rgba(217,70,239,0.7)]",
    "shadow-[0_0_25px_-5px_color-mix(in_srgb,_var(--brand-2)_70%,_transparent)]",
  ],
  // Auth decorative gradients (purple ramps stay available for status badges)
  [
    "from-purple-500 via-pink-500 to-purple-500",
    "from-[var(--brand-2)] via-[var(--brand)] to-[var(--brand-2)]",
  ],
  ["from-purple-600 to-pink-500", "from-[var(--primary)] to-pink-500"],
];

/**
 * Unbracketed (string-literal) replacements — ONLY for values that never
 * appear as product/print data. Currently just the toast background.
 */
const UNBRACKETED_RULES = [["#1a0a24", "var(--bg-elevated)"]];

/** rgba(18,0,24,α) hero/banner overlays -> themeable background color-mix. */
const OVERLAY_RE = /rgba\(18,\s*0,\s*24,\s*(\.?\d+(?:\.\d+)?)\)/g;

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function transform(source, relPath) {
  let out = source;
  const counts = [];

  // 1) Bracketed arbitrary values: [#hex] -> [var(--token)]
  for (const [hex, token] of BRACKET_RULES) {
    const re = new RegExp(`\\[#${hex.slice(1)}\\]`, "gi");
    out = out.replace(re, () => {
      counts.push(`[${hex}]`);
      return `[${token}]`;
    });
  }

  // 2) Whole-token literal rules (shadows, gradients)
  for (const [from, to] of LITERAL_RULES) {
    if (out.includes(from)) {
      const n = out.split(from).length - 1;
      out = out.split(from).join(to);
      counts.push(`${from} x${n}`);
    }
  }

  // 3) Unbracketed string literals (skipped for data/brand-mark files)
  const denied = UNBRACKETED_DENY_FILES.has(relPath);
  if (!denied) {
    for (const [hex, token] of UNBRACKETED_RULES) {
      const re = new RegExp(hex, "gi");
      out = out.replace(re, () => {
        counts.push(`(str)${hex}`);
        return token;
      });
    }
    // 4) rgba overlay gradients (inline style strings keep real spaces)
    out = out.replace(OVERLAY_RE, (match, alpha) => {
      const pct = Math.round(Number(alpha) * 100);
      counts.push(`overlay ${match}`);
      return `color-mix(in srgb, var(--background) ${pct}%, transparent)`;
    });
  }

  return { out, counts };
}

const files = await walk(ROOT);
let changed = 0;
let totalRules = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const source = await readFile(file, "utf8");
  const { out, counts } = transform(source, rel);
  if (out !== source) {
    changed += 1;
    totalRules += counts.length;
    const preview = [...new Set(counts)].slice(0, 6).join(", ");
    console.log(`${rel}: ${counts.length} replacement(s) [${preview}${counts.length > 6 ? ", …" : ""}]`);
    if (!DRY) await writeFile(file, out, "utf8");
  }
}

console.log(
  `\n${DRY ? "[dry-run] " : ""}${changed} file(s), ${totalRules} replacement(s) across app/`
);
