/**
 * Strict sanitiser for admin-editable SVG fragments.
 *
 * Template rows live in the database and are rendered into public mockups, so
 * they are UNTRUSTED input even when only admins can write them. This module
 * keeps a small allow-list of SVG geometry elements/attributes and drops
 * everything else — scripts, event handlers, external references, CSS, foreign
 * objects and data-URL payloads that are not images.
 *
 * Pure string processing: identical behaviour in Node (API routes) and the
 * browser (preview), no DOM dependency.
 */

const ALLOWED_ELEMENTS = new Set([
  "path", "rect", "circle", "ellipse", "g", "line", "polygon", "polyline",
  "defs", "pattern", "lineargradient", "radialgradient", "stop", "clippath",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity",
  "transform", "x", "y", "x1", "y1", "x2", "y2", "width", "height",
  "rx", "ry", "cx", "cy", "r", "id", "patternunits", "viewbox",
  "gradientunits", "offset", "points", "preserveaspectratio",
]);

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const TAG_RE = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

function safeValue(name: string, value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:text/html")) return false;
  if (lower.startsWith("url(") && !lower.startsWith("url(#")) return false;
  // Colour tokens are resolved later into validated hex values.
  if (/\{\{(hex|shade|highlight)\}\}/.test(value)) return name === "fill" || name === "stroke";
  if (name === "href" || name === "xlink:href" || name === "style") return false;
  return !/[<>]/.test(value);
}

/** Strip tags/attributes not on the allow-list. Never throws. */
export function sanitizeSvgFragment(fragment: unknown): string {
  const source = String(fragment ?? "");
  if (!source) return "";

  // Remove scripts/foreign objects/styles entirely (including nested content).
  let clean = source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  clean = clean.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, "");
  clean = clean.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
  clean = clean.replace(/<!--[\s\S]*?-->/g, "");

  return clean.replace(TAG_RE, (whole, closing: string, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(name)) return "";
    if (closing) return `</${name}>`;

    const kept: string[] = [];
    let match: RegExpExecArray | null;
    ATTR_RE.lastIndex = 0;
    while ((match = ATTR_RE.exec(attrs)) !== null) {
      const key = match[1].toLowerCase();
      const value = match[2] ?? match[3] ?? "";
      if (ALLOWED_ATTRIBUTES.has(key) && safeValue(key, value)) {
        kept.push(`${key}="${value.replace(/"/g, "&quot;")}"`);
      }
    }
    const selfClosing = /\/\s*$/.test(attrs) ? "/" : "";
    return `<${name}${kept.length ? ` ${kept.join(" ")}` : ""}${selfClosing}>`;
  });
}

/** True when the fragment contains nothing after sanitising but had content. */
export function isDangerousFragment(fragment: unknown): boolean {
  const original = String(fragment ?? "").trim();
  if (!original) return false;
  return sanitizeSvgFragment(original).length < original.length;
}
