/**
 * Vendors the on-device embedding model into ./models/ so the extension can
 * ship it inside the package.
 *
 * Why: the extension promises "nothing leaves your device". Downloading model
 * weights from Hugging Face at first run broke that promise, added a 30 MB
 * surprise download, and created a store-review question. The model is now
 * bundled instead — this script is the only thing that ever touches the network,
 * and it runs at build time on a developer machine, never in the browser.
 *
 * Usage:
 *   npm run fetch:model            # download missing files, verify hashes
 *   npm run fetch:model -- --force # re-download everything
 *   npm run check:model            # verify only; exits 1 when incomplete
 *   node scripts/fetch-model.mjs --print   # print sha256 for pinning
 *
 * The output directory is gitignored. Hashes are pinned below; a mismatch means
 * upstream changed or the download was corrupted, and the build must not ship it.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const MODEL_DIR = "all-MiniLM-L6-v2";
const ROOT = "models";
const DEST = join(ROOT, MODEL_DIR);
const MANIFEST = join(ROOT, ".model-manifest.json");
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;

/**
 * Pinned per-file size and sha256. Sizes come from the HF repo listing; hashes
 * are the file digests (for LFS blobs this equals the LFS oid). Keep both in
 * sync when bumping the model.
 */
const FILES = [
  { path: "config.json", size: 650, sha256: "7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7" },
  { path: "special_tokens_map.json", size: 125, sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3" },
  { path: "tokenizer.json", size: 711661, sha256: "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0" },
  { path: "tokenizer_config.json", size: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
  { path: "vocab.txt", size: 231508, sha256: "07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3" },
  { path: "onnx/model_quantized.onnx", size: 22972370, sha256: "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1" },
];

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const CHECK_ONLY = args.has("--check");
const PRINT = args.has("--print");

const MB = 1024 * 1024;
const fmt = (n) => `${(n / MB).toFixed(1)} MB`;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

async function download(relPath, expectedSize) {
  const url = `${BASE_URL}/${relPath}`;
  const out = join(DEST, relPath);
  const part = `${out}.part`;
  await mkdir(dirname(out), { recursive: true });

  process.stdout.write(`  ↓ ${relPath} (${fmt(expectedSize)}) `);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!res.body) throw new Error(`empty response body for ${url}`);

  const chunks = [];
  let received = 0;
  let lastTick = 0;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    received += chunk.length;
    const tick = Math.floor((received / Math.max(expectedSize, 1)) * 10);
    if (tick > lastTick) {
      lastTick = tick;
      process.stdout.write(`${tick * 10}% `);
    }
  }
  const buf = Buffer.concat(chunks);
  if (buf.length !== expectedSize) {
    throw new Error(`size mismatch: expected ${expectedSize}, got ${buf.length}`);
  }
  await writeFile(part, buf);
  await rename(part, out);
  process.stdout.write("done\n");
  return buf;
}

async function verify(entry) {
  const path = join(DEST, entry.path);
  if (!(await exists(path))) return { ok: false, reason: "missing" };
  const buf = await readFile(path);
  if (buf.length !== entry.size) {
    return { ok: false, reason: `size ${buf.length} ≠ ${entry.size}` };
  }
  if (!entry.sha256) return { ok: true, buf, unpinned: true };
  const actual = sha256(buf);
  if (actual !== entry.sha256) {
    return { ok: false, reason: `sha256 ${actual} ≠ ${entry.sha256}`, buf };
  }
  return { ok: true, buf };
}

async function main() {
  if (CHECK_ONLY) {
    const problems = [];
    for (const entry of FILES) {
      const res = await verify(entry);
      if (!res.ok) problems.push(`${entry.path}: ${res.reason}`);
    }
    if (problems.length > 0) {
      console.error("\n[model] Bundled embedding model is missing or invalid:");
      for (const p of problems) console.error(`  ✗ ${p}`);
      console.error("\nRun `npm run fetch:model` once (needs internet), then rebuild.\n");
      process.exit(1);
    }
    console.log(`[model] OK — ${FILES.length} files in ${DEST}`);
    return;
  }

  console.log(`[model] ${MODEL_ID} → ${DEST}`);
  await mkdir(DEST, { recursive: true });

  const results = [];
  let total = 0;
  for (const entry of FILES) {
    let buf = null;
    const present = await verify(entry);
    if (present.ok && !FORCE) {
      process.stdout.write(`  ✓ ${entry.path} (cached)\n`);
      buf = present.buf;
    } else {
      if (present.ok === false && present.reason !== "missing" && !FORCE) {
        process.stdout.write(`  ! ${entry.path} (${present.reason}) — refetching\n`);
      }
      buf = await download(entry.path, entry.size);
    }
    const digest = sha256(buf);
    total += buf.length;
    results.push({ path: entry.path, size: buf.length, sha256: digest });
  }

  if (PRINT) {
    console.log("\n--- pin these in scripts/fetch-model.mjs ---");
    for (const r of results) console.log(`  { path: "${r.path}", size: ${r.size}, sha256: "${r.sha256}" },`);
    console.log("-------------------------------------------\n");
  }

  const unpinned = results.filter((r, i) => !FILES[i].sha256);
  if (unpinned.length > 0) {
    console.warn(
      `[model] WARNING: ${unpinned.length} file(s) have no pinned sha256 — downloads are not verified.`,
    );
  }

  await writeFile(
    MANIFEST,
    JSON.stringify(
      { model: MODEL_ID, fetchedAt: new Date().toISOString(), totalBytes: total, files: results },
      null,
      2,
    ) + "\n",
  );

  console.log(`[model] ready — ${FILES.length} files, ${fmt(total)} total`);
}

main().catch((err) => {
  console.error(`\n[model] FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
