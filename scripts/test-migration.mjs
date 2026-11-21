/**
 * Regression test for the v4 demo-data cleanup.
 *
 * Reproduces the exact legacy shape that defeated v3: sample memories with no
 * `origin`, no `[demo]` marker and no recorded seed IDs. They must still be
 * removed, while real memories survive.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";

function makeStore(seed) {
  const store = structuredClone(seed);
  const listeners = new Set();
  const clone = (v) => JSON.parse(JSON.stringify(v));

  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
          for (const k of list) if (k in store) out[k] = clone(store[k]);
          return out;
        },
        set: async (obj) => {
          Object.assign(store, clone(obj));
        },
        remove: async (keys) => {
          for (const k of [].concat(keys)) delete store[k];
        },
      },
      session: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
      },
      onChanged: {
        addListener: (l) => listeners.add(l),
        removeListener: (l) => listeners.delete(l),
      },
    },
  };
  return store;
}

const bundle = await build({
  entryPoints: ["src/shared/storage.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "node18",
  logLevel: "silent",
});
const code = bundle.outputFiles[0].text;
const { migrateIfNeeded, removeDemoData } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

/* --- Legacy store: no origin, no marker, no seed key ------------------ */
const legacy = makeStore({
  mw_storage_version: 3,
  mw_settings: { activeProfileId: "profile-startup", onboardingDone: true },
  mw_profiles: [
    { id: "profile-startup", name: "Startup", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "profile-real", name: "Me", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  ],
  mw_memories: [
    // exact content from DEMO_DATA, but provenance backfilled as "manual"
    { id: "demo1", profileId: "profile-startup", content: "I am building an AI Memory Wallet.", category: "project", importance: 0.9, createdAt: "x", updatedAt: "x", origin: "manual" },
    { id: "real1", profileId: "profile-real", content: "I have a dog named Milo.", category: "personal", importance: 0.7, createdAt: "x", updatedAt: "x", origin: "manual" },
  ],
  mw_requests: [
    { id: "req1", aiApplicationId: "chatgpt", profileId: "profile-startup", query: "q", requestedCategories: [], reason: "r", status: "approved", duration: "once", matchedMemoryIds: ["demo1", "real1"], createdAt: "x" },
  ],
});

await migrateIfNeeded();

check("v4: legacy sample memory removed by content match", () => {
  assert.equal(legacy.mw_memories.some((m) => m.id === "demo1"), false);
});
check("v4: real memory preserved", () => {
  assert.equal(legacy.mw_memories.some((m) => m.id === "real1"), true);
});
check("v4: empty legacy sample profile removed", () => {
  assert.equal(legacy.mw_profiles.some((p) => p.id === "profile-startup"), false);
  assert.equal(legacy.mw_profiles.some((p) => p.id === "profile-real"), true);
});
check("v4: request log no longer references the removed memory", () => {
  assert.deepEqual(legacy.mw_requests[0].matchedMemoryIds, ["real1"]);
});
check("v4: storage version bumped", () => {
  assert.equal(legacy.mw_storage_version, 4);
});

/* --- Recorded seed IDs catch samples with arbitrary content ----------- */
const seeded = makeStore({
  mw_storage_version: 4,
  mw_settings: { activeProfileId: "profile-real" },
  mw_profiles: [
    { id: "profile-real", name: "Me", createdAt: "x", updatedAt: "x" },
    { id: "sample-2", name: "Work", createdAt: "x", updatedAt: "x" },
  ],
  mw_memories: [
    { id: "real2", profileId: "profile-real", content: "I use TypeScript.", category: "technical", importance: 0.7, createdAt: "x", updatedAt: "x" },
    { id: "sample-mem", profileId: "sample-2", content: "arbitrary sample text", category: "other", importance: 0.5, createdAt: "x", updatedAt: "x" },
  ],
  mw_demo_seed: { memoryIds: ["sample-mem"], profileIds: ["sample-2"] },
});

const removed = await removeDemoData();

check("explicit cleanup: removes by recorded IDs", () => {
  assert.equal(removed.memories, 1);
  assert.equal(removed.profiles, 1);
  assert.deepEqual(seeded.mw_memories.map((m) => m.id), ["real2"]);
  assert.deepEqual(seeded.mw_profiles.map((p) => p.id), ["profile-real"]);
});
check("explicit cleanup: clears the seed key so it cannot re-fire", () => {
  assert.equal("mw_demo_seed" in seeded, false);
});

console.log(`\n[migration] OK — ${passed} checks passed\n`);
