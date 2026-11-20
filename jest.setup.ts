/**
 * Jest setup: jsdom does not provide the WHATWG text encoding globals, but
 * the app code (SVG sniffing/sanitizing, header parsing) uses them in both
 * browser and server contexts. Polyfill from Node — only when missing, so
 * environments that already define them are untouched.
 */
import { TextDecoder, TextEncoder } from "node:util";

const scope = globalThis as {
  TextEncoder?: unknown;
  TextDecoder?: unknown;
};

if (typeof scope.TextEncoder === "undefined") {
  scope.TextEncoder = TextEncoder;
}
if (typeof scope.TextDecoder === "undefined") {
  scope.TextDecoder = TextDecoder;
}

export {};
