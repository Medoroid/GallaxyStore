/**
 * Server-side SVG sanitizer — pure TypeScript, no dependencies, no DOM.
 *
 * Strategy: tokenize the markup and REBUILD it from an allow-list. Anything
 * not explicitly allowed (scripts, event handlers, foreign objects, external
 * references, unknown elements/attributes) simply never reaches the output,
 * and dropped elements take their whole subtree with them. The DOCTYPE is
 * always removed, which also neutralizes entity-based (XXE) constructs —
 * this tokenizer never resolves entities in the first place; predefined ones
 * (`&amp;` etc.) are round-tripped through decode→escape so text renders
 * exactly as authored.
 *
 * Run on BOTH client (instant feedback, preview from sanitized markup) and
 * server (authoritative — only sanitized bytes are ever stored).
 */

import { ARTWORK_LIMITS } from "./types";

export type SvgSanitizeResult =
  | { ok: true; svg: string; changed: boolean }
  | { ok: false; code: "svg_too_large" | "not_svg"; message: string };

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const ALLOWED_ELEMENTS = new Set([
  // structure / documents
  "svg", "g", "defs", "symbol", "use", "a", "switch", "title", "desc", "metadata", "style",
  // shapes
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  // text
  "text", "tspan", "textPath",
  // paint servers / clipping
  "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "marker",
  // raster embed (only same-document or allow-listed data: URIs pass href rules)
  "image",
  // filters
  "filter", "feBlend", "feColorMatrix", "feComposite", "feConvolveMatrix", "feDiffuseLighting",
  "feDisplacementMap", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR",
  "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset",
  "feSpecularLighting", "feTile", "feTurbulence", "fePointLight", "feDistantLight", "feSpotLight",
  "feComponentTransfer",
]);

/** Case-tolerant lookup (HTML-inlined SVG is lowercased by sloppy editors). */
const ALLOWED_LOWER = new Map<string, string>();
for (const name of ALLOWED_ELEMENTS) ALLOWED_LOWER.set(name.toLowerCase(), name);

const ALLOWED_ATTRS = new Set([
  // namespaces / core
  "xmlns", "xmlns:xlink", "xml:space", "id", "class", "transform", "style",
  "role", "aria-hidden", "aria-label",
  // geometry
  "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "x1", "y1", "x2", "y2",
  "points", "d", "viewBox", "preserveAspectRatio",
  // paint / stroke
  "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
  "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "paint-order", "vector-effect", "clip-rule",
  // compositing
  "opacity", "display", "visibility", "filter", "mask", "clip-path", "mix-blend-mode",
  "isolation", "color", "color-interpolation", "color-interpolation-filters",
  "shape-rendering", "text-rendering", "image-rendering",
  // text
  "font-family", "font-size", "font-weight", "font-style", "font-variant", "text-anchor",
  "dominant-baseline", "alignment-baseline", "letter-spacing", "word-spacing",
  "text-decoration", "text-transform", "writing-mode", "direction", "unicode-bidi",
  "xml:lang", "lang",
  // gradients / patterns / markers / clip / mask
  "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod",
  "patternUnits", "patternContentUnits", "patternTransform", "markerWidth", "markerHeight",
  "markerUnits", "orient", "refX", "refY", "clipPathUnits", "maskUnits", "maskContentUnits",
  // filter primitives
  "filterUnits", "primitiveUnits", "result", "in", "in2", "mode", "type", "values",
  "tableValues", "slope", "intercept", "k1", "k2", "k3", "k4", "scale", "operator", "radius",
  "stdDeviation", "baseFrequency", "numOctaves", "seed", "order", "azimuth", "elevation",
  "surfaceScale", "diffuseConstant", "specularConstant", "specularExponent", "pointsAtX",
  "pointsAtY", "pointsAtZ", "lighting-color", "kernelMatrix", "divisor", "bias",
  "targetX", "targetY", "preserveAlpha", "dx", "dy",
  // links
  "target",
]);

/** Attribute values that reference something — restricted to safe targets. */
const HREF_ATTRS = new Set(["href", "xlink:href"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    return NAMED_ENTITIES[body] ?? match; // unknown entities stay literal (never resolved)
  });
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/**
 * CSS safety net for `style` attributes and `<style>` blocks: external loads,
 * imports and legacy script vectors are neutralised; everything else passes
 * through (CSS cannot execute script in supported browsers).
 */
export function sanitizeCss(css: string): string {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/@import[^;{]*;?/gi, "");

  const neutralize = (match: string, target: string | undefined): string => {
    const t = (target ?? "").trim();
    if (t.startsWith("#")) return match;
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(t)) return match;
    return "url(about:invalid)";
  };
  // Quoted first (targets may contain ')'), then bare targets.
  out = out.replace(/url\(\s*(['"])([\s\S]*?)\1\s*\)/gi, (m, _quote: string, target: string) =>
    neutralize(m, target)
  );
  out = out.replace(/url\(\s*([^)'"]+)\s*\)/gi, (m, target: string) => neutralize(m, target));

  // Legacy script vectors — `data:` is intentionally NOT in this list: it is
  // already governed per-URL above, and a blanket rule would corrupt the raster
  // data URIs that are allowed through.
  out = out.replace(/(javascript|vbscript)\s*:/gi, "blocked:");
  out = out.replace(/expression\s*\(/gi, "blocked(");
  out = out.replace(/behaviou?r\s*:/gi, "blocked:");
  out = out.replace(/-moz-binding\s*:/gi, "blocked:");
  return out;
}

/** Same-document fragments and small raster data URIs only — no external fetches. */
export function hrefAllowed(value: string): boolean {
  const t = value.trim();
  if (t.startsWith("#")) return true;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(t)) return true;
  return false;
}

type AttrToken = [string, string];
type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; name: string; attrs: AttrToken[]; selfClosing: boolean }
  | { kind: "close"; name: string };

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[-A-Za-z0-9_:.]/;

function skipDoctype(src: string, start: number): number {
  let j = start + 9; // past "<!DOCTYPE"
  let inSubset = false;
  for (; j < src.length; j += 1) {
    const ch = src[j];
    if (ch === "[") inSubset = true;
    else if (ch === "]") inSubset = false;
    else if (ch === ">" && !inSubset) return j + 1;
  }
  return src.length;
}

/** Parse the document into raw tokens. Never throws — malformed input degrades. */
function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const pushText = (value: string) => {
    if (value) tokens.push({ kind: "text", value });
  };

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      pushText(src.slice(i));
      break;
    }
    if (lt > i) pushText(src.slice(i, lt));

    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      const content = src.slice(lt + 9, end === -1 ? src.length : end);
      pushText(content); // re-escaped on serialize — CDATA cannot smuggle markup
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (/^<!DOCTYPE/i.test(src.slice(lt, lt + 9))) {
      i = skipDoctype(src, lt);
      continue;
    }
    if (src.startsWith("<!", lt)) {
      const end = src.indexOf(">", lt + 2);
      i = end === -1 ? src.length : end + 1;
      continue;
    }

    if (src.startsWith("</", lt)) {
      let j = lt + 2;
      let name = "";
      while (j < src.length && NAME_CHAR.test(src[j])) {
        name += src[j];
        j += 1;
      }
      const gt = src.indexOf(">", j);
      i = gt === -1 ? src.length : gt + 1;
      if (name) tokens.push({ kind: "close", name });
      continue;
    }

    // Opening tag (or a bare "<" used as text, e.g. "a < b").
    const afterLt = lt + 1;
    if (afterLt >= src.length || !NAME_START.test(src[afterLt])) {
      pushText("<");
      i = lt + 1;
      continue;
    }

    let j = afterLt;
    let name = "";
    while (j < src.length && NAME_CHAR.test(src[j])) {
      name += src[j];
      j += 1;
    }

    const attrs: AttrToken[] = [];
    const seen = new Set<string>();
    let selfClosing = false;
    while (j < src.length) {
      while (j < src.length && /\s/.test(src[j])) j += 1;
      if (src[j] === ">") {
        j += 1;
        break;
      }
      if (src[j] === "/" && src[j + 1] === ">") {
        selfClosing = true;
        j += 2;
        break;
      }
      const attrMatch = /^([^\s=/>]+)/.exec(src.slice(j));
      if (!attrMatch) {
        j += 1; // stray character inside the tag — skip it
        continue;
      }
      const attrName = attrMatch[1];
      j += attrName.length;
      while (j < src.length && /\s/.test(src[j])) j += 1;
      let value = "";
      if (src[j] === "=") {
        j += 1;
        while (j < src.length && /\s/.test(src[j])) j += 1;
        const quote = src[j];
        if (quote === '"' || quote === "'") {
          const end = src.indexOf(quote, j + 1);
          value = src.slice(j + 1, end === -1 ? src.length : end);
          j = end === -1 ? src.length : end + 1;
        } else {
          let end = j;
          while (end < src.length && !/[\s>]/.test(src[end])) end += 1;
          value = src.slice(j, end);
          j = end;
        }
      }
      if (!seen.has(attrName)) {
        seen.add(attrName); // first occurrence wins — duplicate-attribute smuggling dies here
        attrs.push([attrName, value]);
      }
    }

    tokens.push({ kind: "open", name, attrs, selfClosing });
    i = j;
  }

  return tokens;
}

function cleanAttrs(attrs: AttrToken[]): AttrToken[] {
  const out: AttrToken[] = [];
  for (const [rawName, rawValue] of attrs) {
    const value = decodeEntities(rawValue);
    if (rawName === "xmlns") {
      if (value === SVG_NS) out.push([rawName, value]); // foreign namespaces dropped
      continue;
    }
    if (rawName === "xmlns:xlink") {
      if (value === XLINK_NS) out.push([rawName, value]);
      continue;
    }
    if (HREF_ATTRS.has(rawName)) {
      if (!hrefAllowed(value)) continue;
      out.push([rawName, value]);
      continue;
    }
    if (rawName === "style") {
      out.push([rawName, sanitizeCss(value)]);
      continue;
    }
    if (ALLOWED_ATTRS.has(rawName)) out.push([rawName, value]);
    // everything else (on*, xml:base, data-*, foreign attrs) is dropped
  }
  return out;
}

/**
 * Sanitize an SVG document. The caller decides size limits for raster files;
 * this enforces the SVG text cap itself so it is safe standalone.
 */
export function sanitizeSvg(source: string | Uint8Array): SvgSanitizeResult {
  const text =
    typeof source === "string" ? source : new TextDecoder("utf-8").decode(source);

  if (text.length > ARTWORK_LIMITS.svgMaxBytes) {
    return {
      ok: false,
      code: "svg_too_large",
      message: "SVG is larger than the 2MB limit.",
    };
  }

  const tokens = tokenize(text);
  const out: string[] = [];
  const stack: string[] = [];
  let rootClosed = false; // becomes true once the first allowed element closes
  let sawRootOpen = false;

  let skipUntil: string | null = null;
  let skipDepth = 0;

  for (const token of tokens) {
    if (skipUntil !== null) {
      if (token.kind === "open" && (token.name === skipUntil || token.name.toLowerCase() === skipUntil.toLowerCase())) {
        if (!token.selfClosing) skipDepth += 1;
      } else if (token.kind === "close" && (token.name === skipUntil || token.name.toLowerCase() === skipUntil.toLowerCase())) {
        if (skipDepth === 0) skipUntil = null;
        else skipDepth -= 1;
      }
      continue;
    }

    if (token.kind === "open") {
      const canonical = ALLOWED_ELEMENTS.has(token.name)
        ? token.name
        : ALLOWED_LOWER.get(token.name.toLowerCase());
      if (!canonical) {
        // Denied element: swallow its entire subtree so content can't leak out.
        if (!token.selfClosing) {
          skipUntil = token.name;
          skipDepth = 0;
        }
        continue;
      }

      const attrs = cleanAttrs(token.attrs);

      if (!sawRootOpen) {
        sawRootOpen = true;
        if (canonical !== "svg") {
          // First real element is not <svg> — not an SVG document at all.
          return { ok: false, code: "not_svg", message: "File is not a valid SVG document." };
        }
        if (!attrs.some(([k]) => k === "xmlns")) attrs.unshift(["xmlns", SVG_NS]);
        // Declared unconditionally: an xlink:href appearing anywhere deeper must
        // resolve against a bound prefix, or XML parsing of the whole image fails.
        if (!attrs.some(([k]) => k === "xmlns:xlink")) attrs.push(["xmlns:xlink", XLINK_NS]);
      }

      let open = `<${canonical}`;
      for (const [k, v] of attrs) open += ` ${k}="${escapeAttr(v)}"`;
      // <style> text content is run through sanitizeCss when its text token
      // arrives (see below: parent === "style").
      out.push(token.selfClosing ? `${open} />` : `${open}>`);
      if (token.selfClosing) {
        if (canonical === "svg") rootClosed = true;
      } else {
        stack.push(canonical);
      }
      continue;
    }

    if (token.kind === "close") {
      const canonical = ALLOWED_ELEMENTS.has(token.name)
        ? token.name
        : ALLOWED_LOWER.get(token.name.toLowerCase());
      if (!canonical) continue;
      const idx = stack.lastIndexOf(canonical);
      if (idx === -1) continue;
      // Close everything still open above it (recovery for mismatched markup).
      for (let s = stack.length - 1; s >= idx; s -= 1) {
        out.push(`</${stack[s]}>`);
        if (stack[s] === "svg") rootClosed = true;
      }
      stack.length = idx;
      continue;
    }

    // Text
    if (stack.length === 0) continue; // whitespace outside the root
    const decoded = decodeEntities(token.value);
    const parent = stack[stack.length - 1];
    out.push(parent === "style" ? sanitizeCss(decoded) : escapeText(decoded));
  }

  // Close anything the source left open.
  for (let s = stack.length - 1; s >= 0; s -= 1) {
    out.push(`</${stack[s]}>`);
    if (stack[s] === "svg") rootClosed = true;
  }

  if (!sawRootOpen || !rootClosed) {
    return { ok: false, code: "not_svg", message: "File is not a valid SVG document." };
  }

  const svg = out.join("");
  return { ok: true, svg, changed: svg !== text };
}
