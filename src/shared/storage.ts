import type {
  AIApplication,
  Memory,
  MemoryCategory,
  MemoryRequest,
  Permission,
  Profile,
  WalletState,
} from "./types";
import {
  DEFAULT_SETTINGS,
  DEMO_MARKER,
  DEMO_SEED_KEY,
  STORAGE_KEYS,
  STORAGE_VERSION,
  STORAGE_VERSION_KEY,
  nowISO,
} from "./constants";
import { DEMO_DATA } from "./demoData";

async function get<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? fallback;
}

async function set<T>(key: string, value: T): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("QUOTA_BYTES") || msg.toLowerCase().includes("quota")) {
      console.error("[Memory Wallet] storage quota exceeded for", key, e);
      throw new Error("Storage quota exceeded — try deleting some memories or profiles.");
    }
    throw e;
  }
}

interface DemoSeed {
  memoryIds?: string[];
  profileIds?: string[];
}

/**
 * Remove sample data by every signal available: exact IDs recorded at seed
 * time, content matching the known demo specs, and the legacy origin/marker.
 * No single signal is trusted on its own — an older install has none of the
 * newer ones, which is exactly why the previous cleanup silently did nothing.
 */
export async function removeDemoData(): Promise<{ memories: number; profiles: number }> {
  const seed = await get<DemoSeed>(DEMO_SEED_KEY, {});
  const demoContents = new Set(Object.values(DEMO_DATA).flat().map((s) => s.content));
  const memories = await getMemories();

  const ids = new Set<string>(seed.memoryIds ?? []);
  for (const m of memories) {
    if (m.origin === "demo" || m.content.includes(DEMO_MARKER) || demoContents.has(m.content)) {
      ids.add(m.id);
    }
  }

  if (ids.size > 0) {
    await saveMemories(memories.filter((m) => !ids.has(m.id)));
    const requests = await getRequests();
    await saveRequests(
      requests.map((r) => ({
        ...r,
        matchedMemoryIds: r.matchedMemoryIds?.filter((id) => !ids.has(id)) ?? null,
      })),
    );
    try {
      const { deleteVectors } = await import("./vectorStore");
      await deleteVectors([...ids]);
    } catch {
      // IndexedDB may be unavailable (e.g. visual harness) — ignore.
    }
  }

  const profiles = await getProfiles();
  const legacy = new Set([
    "profile_personal", "profile_work", "profile_startup",
    "profile-personal", "profile-work", "profile-startup",
  ]);
  const profileIds = new Set<string>(seed.profileIds ?? []);
  for (const p of profiles) {
    if (legacy.has(p.id) && !memories.some((m) => m.profileId === p.id && !ids.has(m.id))) {
      profileIds.add(p.id);
    }
  }

  let removedProfiles = 0;
  if (profileIds.size > 0) {
    const remaining = profiles.filter((p) => !profileIds.has(p.id));
    removedProfiles = profiles.length - remaining.length;
    await saveProfiles(remaining);
    const active = (await getSettings()).activeProfileId;
    if (active && profileIds.has(active)) {
      await saveSettings({ activeProfileId: remaining[0]?.id ?? null });
    }
  }

  await chrome.storage.local.remove(DEMO_SEED_KEY);
  return { memories: ids.size, profiles: removedProfiles };
}

/** Backfill missing settings keys after upgrades (no data loss). */
export async function migrateIfNeeded(): Promise<void> {
  const raw = await chrome.storage.local.get(STORAGE_VERSION_KEY);
  const current = (raw[STORAGE_VERSION_KEY] as number | undefined) ?? 0;
  if (current >= STORAGE_VERSION) return;

  if (current < 1) {
    // v0 → v1: ensure every DEFAULT_SETTINGS key exists.
    const existing = await get<Partial<WalletState["settings"]>>(STORAGE_KEYS.settings, {});
    const merged = { ...DEFAULT_SETTINGS, ...existing };
    // Only write if something was missing.
    const needsWrite = Object.keys(DEFAULT_SETTINGS).some(
      (k) => (existing as Record<string, unknown>)[k] === undefined,
    );
    if (needsWrite) await set(STORAGE_KEYS.settings, merged);
  }

  if (current < 2) {
    // v1 → v2: backfill memory provenance. Additive only — content untouched.
    const memories = await get<Memory[]>(STORAGE_KEYS.memories, []);
    let changed = false;
    const next = memories.map((m) => {
      if (m.origin) return m;
      changed = true;
      return {
        ...m,
        origin: m.content.includes(DEMO_MARKER) ? ("demo" as const) : ("manual" as const),
      };
    });
    if (changed) await set(STORAGE_KEYS.memories, next);
  }

  if (current < 3) {
    // v2 → v3: one-time cleanup of the old demo/sample wallet. Only demo-origin
    // memories are removed; anything the user actually saved is untouched.
    const memories = await getMemories();
    const demoIds = new Set(
      memories
        .filter((m) => m.origin === "demo" || m.content.includes(DEMO_MARKER))
        .map((m) => m.id),
    );
    if (demoIds.size > 0) {
      await saveMemories(memories.filter((m) => !demoIds.has(m.id)));
      const requests = await getRequests();
      await saveRequests(
        requests.map((r) => ({
          ...r,
          matchedMemoryIds: r.matchedMemoryIds?.filter((id) => !demoIds.has(id)) ?? null,
        })),
      );
    }

    // Retire the old seeded profiles only when they are empty. A profile that
    // holds real memories is never removed.
    const legacy = new Set([
      "profile_personal", "profile_work", "profile_startup",
      "profile-personal", "profile-work", "profile-startup",
    ]);
    const profiles = await getProfiles();
    const emptyLegacy = profiles.filter(
      (p) => legacy.has(p.id) && !memories.some((m) => m.profileId === p.id && !demoIds.has(m.id)),
    );
    if (emptyLegacy.length > 0) {
      const kept = profiles.filter((p) => !emptyLegacy.some((x) => x.id === p.id));
      await saveProfiles(kept);
      const activeProfileId = (await getSettings()).activeProfileId;
      if (emptyLegacy.some((p) => p.id === activeProfileId)) {
        await saveSettings({ activeProfileId: kept[0]?.id ?? null });
      }
    }

    if ((await getProfiles()).length === 0) {
      const t = nowISO();
      const me: Profile = {
        id: "profile_me",
        name: "Me",
        description: "What the AI should know about you.",
        icon: "🧠",
        createdAt: t,
        updatedAt: t,
      };
      await saveProfiles([me]);
      await saveSettings({ activeProfileId: me.id });
    }
  }

  if (current < 4) {
    // v3 → v4: the v3 cleanup keyed only off origin/marker and missed sample
    // data seeded before provenance existed. Catch it by recorded IDs and
    // known content too. Real memories are never touched.
    await removeDemoData();

    if ((await getProfiles()).length === 0) {
      const t = nowISO();
      const me: Profile = {
        id: "profile_me",
        name: "Me",
        description: "What the AI should know about you.",
        icon: "🧠",
        createdAt: t,
        updatedAt: t,
      };
      await saveProfiles([me]);
      await saveSettings({ activeProfileId: me.id });
    }
  }

  await chrome.storage.local.set({ [STORAGE_VERSION_KEY]: STORAGE_VERSION });
}

export async function getProfiles(): Promise<Profile[]> {
  return get<Profile[]>(STORAGE_KEYS.profiles, []);
}
export async function saveProfiles(profiles: Profile[]): Promise<void> {
  await set(STORAGE_KEYS.profiles, profiles);
}

export async function getMemories(): Promise<Memory[]> {
  return get<Memory[]>(STORAGE_KEYS.memories, []);
}
export async function saveMemories(memories: Memory[]): Promise<void> {
  await set(STORAGE_KEYS.memories, memories);
}
export async function getMemoriesForProfile(profileId: string): Promise<Memory[]> {
  const all = await getMemories();
  return all
    .filter((m) => m.profileId === profileId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAIApplications(): Promise<AIApplication[]> {
  return get<AIApplication[]>(STORAGE_KEYS.aiApplications, []);
}
export async function saveAIApplications(apps: AIApplication[]): Promise<void> {
  await set(STORAGE_KEYS.aiApplications, apps);
}

export async function getPermissions(): Promise<Permission[]> {
  return get<Permission[]>(STORAGE_KEYS.permissions, []);
}
export async function savePermissions(perms: Permission[]): Promise<void> {
  await set(STORAGE_KEYS.permissions, perms);
}

export async function getRequests(): Promise<MemoryRequest[]> {
  return get<MemoryRequest[]>(STORAGE_KEYS.requests, []);
}
export async function saveRequests(requests: MemoryRequest[]): Promise<void> {
  // Keep the log bounded.
  await set(STORAGE_KEYS.requests, requests.slice(0, 100));
}

/** Enterprise policy pushed via Chrome's managed storage (no backend involved).
 *  Values here always win over local settings: an admin who requires approval
 *  must not be overridable by a user toggling a switch. */
interface ManagedPolicy {
  RequireApproval?: boolean;
  MaxMemoriesPerRequest?: number;
  DisableSemanticSearch?: boolean;
  DisableGeneralFallback?: boolean;
}

async function getManagedOverrides(): Promise<Partial<WalletState["settings"]>> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.managed) return {};
    const raw = (await chrome.storage.managed.get()) as ManagedPolicy;
    const out: Partial<WalletState["settings"]> = {};
    // Policy forces the permission card on EVERY request, even when a standing
    // grant exists. `pauseBeforeShare` must also be forced on: without holding
    // the message there is no card to show, so a policy that could not actually
    // require approval would be worse than useless.
    if (raw.RequireApproval === true) {
      out.requireApproval = true;
      out.pauseBeforeShare = true;
    }
    if (typeof raw.MaxMemoriesPerRequest === "number") {
      out.maxMemoriesPerRequest = Math.max(1, Math.min(10, Math.round(raw.MaxMemoriesPerRequest)));
    }
    if (raw.DisableSemanticSearch === true) out.semanticSearch = false;
    if (raw.DisableGeneralFallback === true) out.allowGeneralFallback = false;
    return out;
  } catch {
    // No policy configured, or managed storage unavailable (unpacked dev build).
    return {};
  }
}

export async function getSettings() {
  const raw = await get<Partial<WalletState["settings"]>>(STORAGE_KEYS.settings, {});
  const managed = await getManagedOverrides();
  return { ...DEFAULT_SETTINGS, ...raw, ...managed } as WalletState["settings"];
}
export async function saveSettings(settings: Partial<WalletState["settings"]>) {
  const current = await getSettings();
  await set(STORAGE_KEYS.settings, { ...current, ...settings });
}

/** Full state snapshot used by popup + dashboard. */
export async function getState(): Promise<WalletState> {
  const [profiles, memories, aiApplications, permissions, requests, settings] =
    await Promise.all([
      getProfiles(),
      getMemories(),
      getAIApplications(),
      getPermissions(),
      getRequests(),
      getSettings(),
    ]);
  return { profiles, memories, aiApplications, permissions, requests, settings };
}

export async function ensureSeeded(defaultApps: AIApplication[], defaultProfiles: Profile[]) {
  const apps = await getAIApplications();
  if (apps.length === 0) await saveAIApplications(defaultApps);

  const profiles = await getProfiles();
  if (profiles.length === 0 && defaultProfiles.length > 0) {
    await saveProfiles(defaultProfiles);
    await saveSettings({ activeProfileId: defaultProfiles[0].id });
  }
}

export async function clearAllData(): Promise<void> {
  await chrome.storage.local.remove([
    ...Object.values(STORAGE_KEYS),
    STORAGE_VERSION_KEY,
    DEMO_SEED_KEY,
    "mw_embed_status",
  ]);
  // Session grants and pending requests live in storage.session; wipe them too so
  // a reset cannot leave a standing grant or a wedged tab behind.
  try {
    await chrome.storage.session?.remove(["mw_session_grants", "mw_pending_requests"]);
  } catch {
    // session storage may be unavailable in some contexts
  }
  try {
    const { clearVectorStore } = await import("./vectorStore");
    await clearVectorStore();
  } catch {
    // IndexedDB may be unavailable (e.g. harness stub) — ignore.
  }
  try {
    indexedDB.deleteDatabase("memory-wallet-embeddings");
  } catch {
    // ignore
  }
}
