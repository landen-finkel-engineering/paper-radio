#!/usr/bin/env node
/**
 * Bundles the app into one self-contained HTML file.
 *
 *   node tools/build-single-file.mjs            -> dist/paper-radio.html   (full document)
 *   node tools/build-single-file.mjs --fragment -> dist/paper-radio.fragment.html
 *
 * The fragment form omits <!doctype>/<html>/<head>/<body> for hosts that supply
 * their own page skeleton. Both forms inline the stylesheet, the app, and both
 * PDF.js files, so the result runs from a file:// URL with no network at all.
 *
 * Loading pdf.worker.min.js in the page (rather than pointing PDF.js at a URL)
 * makes PDF.js register a main-thread message handler and skip creating a real
 * Worker — the only way to run it where blob: workers are blocked.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const fragment = process.argv.includes("--fragment");

const html = read("index.html");
const body = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"));
const markup = body
  .replace(/<script[^>]*>[\s\S]*?<\/script>\s*/g, "")   // drop the external script tags
  .trim();

const fonts = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)"[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g)]
  .map((m) => m[0])
  .join("\n");

const guard = (js) => js.replace(/<\/script>/gi, "<\\/script>");

const head = [
  "<title>Paper Radio</title>",
  fonts,
  "<style>\n" + read("assets/styles.css") + "</style>",
].join("\n");

const scripts = [
  "<script>" + guard(read("vendor/pdf.worker.min.js")) + "</script>",
  "<script>" + guard(read("vendor/pdf.min.js")) + "</script>",
  "<script>" + guard(read("assets/app.js")) + "</script>",
].join("\n");

const inner = head + "\n" + markup + "\n" + scripts;
const out = fragment
  ? inner
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n${head}\n</head>\n<body>\n${markup}\n${scripts}\n</body>\n</html>\n`;

const dest = fragment ? "dist/paper-radio.fragment.html" : "dist/paper-radio.html";
mkdirSync(resolve(root, "dist"), { recursive: true });
writeFileSync(resolve(root, dest), out);
console.log(`${dest}  ${(out.length / 1048576).toFixed(2)} MB`);
