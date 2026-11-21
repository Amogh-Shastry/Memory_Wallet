export interface Profile {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export type MemoryCategory =
  | "identity"
  | "preference"
  | "project"
  | "technical"
  | "work"
  | "personal"
  | "goal"
  | "other";

/** Where a memory came from. Used for provenance in Activity and for
 *  "forget this batch" after an import, without duplicating memory content. */
export type MemoryOrigin = "ai-import" | "wizard" | "paste" | "import" | "manual" | "demo";

export interface Memory {
  id: string;
  profileId: string;
  content: string;
  category: MemoryCategory;
  importance: number; // 0..1
  createdAt: string;
  updatedAt: string;
  origin?: MemoryOrigin;
  /** Section the fact came from in an imported answer (e.g. "Technical Skills").
   *  Metadata, not text — so the memory itself stays clean and portable. */
  context?: string;
  /** Older values this fact replaced, newest last. Keeps updates reversible. */
  previousValues?: string[];
}

export interface AIApplication {
  id: string;
  name: string;
  domain: string;
}

export type AccessLevel = "allow" | "deny" | "ask";

export interface Permission {
  id: string;
  aiApplicationId: string;
  profileId: string;
  access: AccessLevel;
  createdAt: string;
  updatedAt: string;
}

export type RequestStatus = "pending" | "approved" | "denied" | "cancelled";
export type RequestDuration = "once" | "session" | "always";

export interface MemoryRequest {
  id: string;
  tabId?: number;
  aiApplicationId: string;
  profileId: string;
  query: string;
  requestedCategories: MemoryCategory[];
  reason: string;
  status: RequestStatus;
  duration: RequestDuration | null;
  matchedMemoryIds: string[] | null;
  createdAt: string;
  resolvedAt?: string;
}

export type MemorySource = "keyword" | "semantic" | "general";

export interface Settings {
  localOnlyMode: boolean;
  autoSendContext: boolean;
  activeProfileId: string | null;
  maxMemoriesPerRequest: number;
  showToolbarButton: boolean;
  pauseBeforeShare: boolean;
  /** When no direct match, fill requests with the profile's strongest memories. */
  allowGeneralFallback: boolean;
  /** Tier-2 semantic (embedding) matches — degrades silently when unavailable. */
  semanticSearch: boolean;
  /** First-run wizard completed (or skipped). */
  onboardingDone: boolean;
  /** Never auto-approve, even with a standing grant (also forced by policy). */
  requireApproval: boolean;
}

export interface WalletState {
  profiles: Profile[];
  memories: Memory[];
  aiApplications: AIApplication[];
  permissions: Permission[];
  requests: MemoryRequest[];
  settings: Settings;
}
