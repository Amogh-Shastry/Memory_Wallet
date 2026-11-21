/* In-memory chrome.* stub + seeded wallet store for the visual harness.
   Must be imported BEFORE anything that touches chrome APIs. */

const now = () => new Date().toISOString();
const t = (offsetMin: number) => new Date(Date.now() - offsetMin * 60_000).toISOString();

export const store: Record<string, unknown> = {
  mw_settings: {
    localOnlyMode: true,
    autoSendContext: true,
    activeProfileId: "profile_me",
    maxMemoriesPerRequest: 4,
    showToolbarButton: true,
    pauseBeforeShare: true,
    allowGeneralFallback: true,
    semanticSearch: true,
    onboardingDone: false,
    requireApproval: false,
  },
  // Clean harness: one profile, no demo memories, no seeded request log.
  mw_profiles: [
    { id: "profile_me", name: "Me", icon: "🧠", description: "", createdAt: t(9000), updatedAt: t(9000) },
  ],
  mw_memories: [],
  mw_ai_applications: [
    { id: "chatgpt", name: "ChatGPT", domain: "chatgpt.com" },
    { id: "claude", name: "Claude", domain: "claude.ai" },
  ],
  mw_permissions: [],
  mw_requests: [],
  mw_embed_status: { state: "ready", indexed: 0, total: 0 },
};

type Listener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
const listeners = new Set<Listener>();

function get(keys: string | string[] | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
  for (const k of list) if (k in store) out[k] = JSON.parse(JSON.stringify(store[k]));
  return out;
}

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (keys: string | string[] | null) => get(keys),
      set: async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
        listeners.forEach((l) =>
          l(Object.fromEntries(Object.keys(obj).map((k) => [k, { newValue: obj[k] }])), "local"),
        );
      },
      remove: async (keys: string | string[]) => {
        for (const k of [].concat(keys as never)) delete store[k as string];
      },
    },
    onChanged: {
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
    },
  },
  runtime: {
    sendMessage: async () => ({ ok: true }),
    onMessage: { addListener: () => {}, removeListener: () => {} },
    getURL: (path: string) => path,
    openOptionsPage: () => {},
  },
  tabs: { create: () => {} },
};
