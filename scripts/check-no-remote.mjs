/**
 * Launch gate: proves the built extension cannot reach a remote resource.
 *
 * "Nothing leaves your device" is a claim in the store listing, so it needs a
 * mechanical check rather than a promise. This script fails the release if a
 * font CDN, script CDN, or missing model file sneaks into dist/.
 *
 * Run: npm run check:no-remote   (after npm run build)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const DIST = "dist";
const SKIP_DIRS = new Set(["test"]); // visual harness is not shipped
const TEXT_EXT = new Set([".js", ".css", ".html", ".json"]);

/** Hosts that would mean a runtime fetch. huggingface.co is checked separately:
 *  transformers.js bakes it into dead config strings even when remote loading
 *  is disabled, so banning the string would be a false positive. */
const BANNED_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "ajax.googleapis.com",
];

const problems = [];
const suppressed = [];

/** onnxruntime-web ships a CDN default for its wasm binaries. We override
 *  `wasmPaths` with chrome.runtime.getURL("offscreen/wasm/") before the pipeline
 *  is created, so the branch containing this string is unreachable. Only this
 *  exact vendor default is suppressed; any other jsdelivr reference fails. */
const ONNX_CDN_DEFAULT = /cdn\.jsdelivr\.net\/npm\/onnxruntime-web@/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error("[no-remote] dist/ not found — run `npm run build` first.");
  process.exit(1);
}

const files = walk(DIST);

for (const file of files) {
  if (!TEXT_EXT.has(extname(file))) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  for (const host of BANNED_HOSTS) {
    lines.forEach((line, i) => {
      if (!line.includes(host)) return;
      if (ONNX_CDN_DEFAULT.test(line)) {
        suppressed.push(`${relative(DIST, file)}:${i + 1} onnxruntime CDN default (unreachable)`);
        return;
      }
      problems.push(`${relative(DIST, file)}:${i + 1} references ${host}`);
    });
  }
  // Remote stylesheet or font references in markup / CSS.
  if (extname(file) === ".css") {
    lines.forEach((line, i) => {
      if (/url\(\s*['"]?https?:/i.test(line)) {
        problems.push(`${relative(DIST, file)}:${i + 1} loads a remote url()`);
      }
    });
  }
  if (extname(file) === ".html") {
    lines.forEach((line, i) => {
      if (/<link[^>]+href=["']https?:/i.test(line) || /<script[^>]+src=["']https?:/i.test(line)) {
        problems.push(`${relative(DIST, file)}:${i + 1} loads a remote link/script`);
      }
    });
  }
}

/* 1. The embedding model must be inside the package. */
const MODEL = join(DIST, "offscreen", "models", "all-MiniLM-L6-v2", "onnx", "model_quantized.onnx");
if (!existsSync(MODEL)) problems.push(`missing bundled model: ${MODEL}`);

/* 2. Remote model loading must be disabled in source (survives minification). */
const offscreenSrc = readFileSync("src/offscreen/offscreen.ts", "utf8");
if (!/allowRemoteModels\s*=\s*false/.test(offscreenSrc)) {
  problems.push("src/offscreen/offscreen.ts does not set allowRemoteModels = false");
}
if (!/allowLocalModels\s*=\s*true/.test(offscreenSrc)) {
  problems.push("src/offscreen/offscreen.ts does not set allowLocalModels = true");
}

/* 2b. The suppressed onnxruntime CDN default is only safe because wasmPaths is
 *     set from the extension package before any pipeline is created. */
if (!/offscreen\/wasm\//.test(offscreenSrc)) {
  problems.push("src/offscreen/offscreen.ts does not point onnxruntime at offscreen/wasm/");
}
const offscreenBundle = join(DIST, "offscreen", "offscreen.js");
if (!existsSync(offscreenBundle) || !readFileSync(offscreenBundle, "utf8").includes("offscreen/wasm/")) {
  problems.push("built offscreen bundle does not reference the bundled wasm path");
}

/* 3. No broad host access. */
const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));
const hosts = JSON.stringify(manifest.host_permissions ?? []);
if (hosts.includes("<all_urls>")) problems.push("manifest requests <all_urls>");
if ((manifest.permissions ?? []).includes("unlimitedStorage")) {
  problems.push("manifest requests unlimitedStorage");
}

if (problems.length > 0) {
  console.error("\n[no-remote] FAILED — the build is not offline-clean:\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("");
  process.exit(1);
}

console.log(`[no-remote] OK — ${files.length} files scanned, model bundled, no remote resources.`);
if (suppressed.length > 0) {
  for (const s of suppressed) console.log(`[no-remote]   · suppressed: ${s}`);
}
