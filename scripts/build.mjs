import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const watch = process.argv.includes("--watch");
const isProd = process.argv.includes("--production");

mkdirSync("dist", { recursive: true });

// Clean the directories this script owns. Without this, files removed from the
// build (an unused wasm build, an old screenshot profile, a deleted bundle)
// stay in dist/ forever and ship in the store zip.
for (const dir of ["popup", "options", "background", "content", "offscreen", "assets", "test"]) {
  rmSync(join("dist", dir), { recursive: true, force: true });
}

// The embedding model ships inside the package. There is no runtime download,
// so a build without it would ship a silently-degraded extension — fail loudly.
const MODEL_SRC = join("models", "all-MiniLM-L6-v2");
const MODEL_FILES = [
  "config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.txt",
  "onnx/model_quantized.onnx",
];
const missingModel = MODEL_FILES.filter((f) => !existsSync(join(MODEL_SRC, f)));
if (missingModel.length > 0) {
  console.error(
    `\n[build] Bundled embedding model is incomplete in ${MODEL_SRC}:\n` +
      missingModel.map((f) => `  ✗ ${f}`).join("\n") +
      "\n\nRun `npm run fetch:model` once (needs internet), then rebuild.\n",
  );
  process.exit(1);
}

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  minify: isProd,
  sourcemap: isProd ? false : "inline",
  logLevel: "info",
  target: ["chrome120"],
  loader: { ".woff2": "dataurl" },
};

const pages = [
  { entry: "src/popup/main.tsx", outdir: "dist/popup" },
  { entry: "src/options/main.tsx", outdir: "dist/options" },
];

const watchOpt = watch ? {} : undefined;

for (const p of pages) {
  await build({
    ...shared,
    entryPoints: [p.entry],
    outdir: p.outdir,
    jsx: "automatic",
    ...(watch ? { watch: {} } : {}),
  });
}

await build({
  ...shared,
  entryPoints: ["src/background/index.ts"],
  outfile: "dist/background/background.js",
  format: "esm",
  ...(watch ? { watch: {} } : {}),
});

await build({
  ...shared,
  entryPoints: ["src/content/index.ts"],
  outfile: "dist/content/content.js",
  format: "iife",
  ...(watch ? { watch: {} } : {}),
});

// Offscreen document: hosts the local embedding model (semantic search).
// ESM so import.meta / top-level constructs from transformers.js survive.
await build({
  ...shared,
  entryPoints: ["src/offscreen/offscreen.ts"],
  outfile: "dist/offscreen/offscreen.js",
  format: "esm",
  ...(watch ? { watch: {} } : {}),
});

cpSync("src/offscreen/offscreen.html", join("dist", "offscreen", "offscreen.html"));

// Ship the hash-pinned embedding model with the extension — no CDN, no
// first-run download, no network request from the browser at any point.
cpSync(MODEL_SRC, join("dist", "offscreen", "models", "all-MiniLM-L6-v2"), { recursive: true });

// ONNX Runtime wasm binaries are served from the extension itself — no CDN.
// Extension pages are NOT cross-origin isolated, so ORT cannot use threads and
// dynamically imports the "asyncify" build instead. Shipping only the plain
// pair made every real install fail with "no available backend found".
// JSEP/WebGPU and JSPI are unused, so those pairs stay out of the package.
mkdirSync(join("dist", "offscreen", "wasm"), { recursive: true });
for (const base of ["ort-wasm-simd-threaded", "ort-wasm-simd-threaded.asyncify"]) {
  for (const ext of ["mjs", "wasm"]) {
    const f = `${base}.${ext}`;
    cpSync(join("node_modules", "onnxruntime-web", "dist", f), join("dist", "offscreen", "wasm", f));
  }
}

cpSync("src/manifest.json", join("dist", "manifest.json"));
cpSync("src/managed-schema.json", join("dist", "managed-schema.json"));
cpSync("src/assets", join("dist", "assets"), { recursive: true });

/* Fonts are bundled and inlined by esbuild (see src/ui/fonts.css).
   No <link> to a font CDN — the extension must never phone home. */

writeFileSync(
  join("dist", "popup", "popup.html"),
  `<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="main.css"></head>
<body><div id="root"></div><script src="main.js"></script></body>
</html>`,
);

writeFileSync(
  join("dist", "options", "options.html"),
  `<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="main.css"><title>Memory Wallet</title></head>
<body><div id="root"></div><script src="main.js"></script></body>
</html>`,
);

// Visual harness: renders the real UI against a stubbed chrome.* store.
// Open dist/test/ui.html (or ?view=popup) in a browser after building.
await build({
  ...shared,
  entryPoints: ["src/test/harness.tsx"],
  outdir: "dist/test",
  jsx: "automatic",
});

writeFileSync(
  join("dist", "test", "ui.html"),
  `<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="harness.css"><title>Memory Wallet · harness</title></head>
<body><div id="root"></div><script src="harness.js"></script></body>
</html>`,
);

console.log(`Build complete → dist/ ${isProd ? "(production)" : ""}`);

if (process.argv.includes("--zip")) {
  const tmp = join("dist-store");
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // Copy everything except local-only artifacts: the visual harness (test/) and
  // demo video renders (demo/). Neither belongs in a store package.
  const EXCLUDE = ["/test", "/demo"];
  cpSync("dist", tmp, {
    recursive: true,
    filter: (src) => {
      const p = src.replaceAll("\\", "/");
      return !EXCLUDE.some((x) => p.includes(`${x}/`) || p.endsWith(x));
    },
  });
  // Remove test folder if it slipped through
  const testInTmp = join(tmp, "test");
  if (existsSync(testInTmp)) rmSync(testInTmp, { recursive: true, force: true });
  try {
    if (process.platform === "win32") {
      execSync(`powershell -Command "Compress-Archive -Path '${tmp}\\*' -DestinationPath 'dist.zip' -Force"`, { stdio: "inherit" });
    } else {
      execSync(`zip -r dist.zip ${tmp}/*`, { stdio: "inherit" });
    }
    console.log("Store zip → dist.zip (excludes test harness)");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
