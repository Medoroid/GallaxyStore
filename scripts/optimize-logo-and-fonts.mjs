import fs from "node:fs";
import sharp from "sharp";

const src = "public/logo.png";
const out = "public/logo-optimized.webp";
await sharp(src).resize({ width: 432, withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toFile(out);
console.log(JSON.stringify({ out, bytes: fs.statSync(out).size }));

// Generate a TS module that inlines the @font-face rules into <head>.
const css = fs.readFileSync("app/fonts.css", "utf8");
const ts = `/* Generated from app/fonts.css so font faces are discoverable from the initial HTML. */\nexport const FONT_FACES_CSS = ${JSON.stringify(css)};\n`;
fs.writeFileSync("app/fonts-inline.ts", ts);
console.log(JSON.stringify({ tsBytes: fs.statSync("app/fonts-inline.ts").size }));
