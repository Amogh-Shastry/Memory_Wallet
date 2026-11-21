import type { AIProviderAdapter } from "../providers/types";
import { showToast, showShareReceipt } from "./ui/toast";
import { grantLabel } from "../shared/consent";
import {
  injectContextIntoConversation,
  submitQuestion,
} from "./injector";
import { MemoryRequestModal } from "./ui/modal";
import {
  MSG,
  type InjectContextPayload,
  type ShowMemoryRequestPayload,
} from "../shared/messages";

type Outcome = "auto-approved" | "needs-approval" | "denied" | "no-profile" | "no-memories" | "busy" | "error";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WATCHDOG_MS = 20_000; // background roundtrip safety net (intercepted mode)
const POST_DECISION_GRACE_MS = 10_000;

interface FlowState {
  query: string;
  /** True when the user's unsent message is being held by us. */
  paused: boolean;
  /** Set when a card is shown, so an abandoned card can be cancelled later. */
  requestId?: string;
}

/**
 * Coordinates wallet requests for a detected question.
 *
 * Intercepted mode (paused=true): the send event was cancelled and the draft
 * is held. Exactly one submission happens at the end:
 *   allow + context   -> composer = [context] + question, auto-send
 *   allow, no context -> original question sent unchanged
 *   deny / timeout    -> original question sent unchanged
 *
 * Legacy mode (paused=false): the message already went out (post-send
 * detection). We only ever inject afterwards; NEVER re-submit the question.
 */
export class PendingFlow {
  private state: FlowState | null = null;
  private watchdog: number | null = null;
  private modal = new MemoryRequestModal();

  constructor(private provider: AIProviderAdapter) {}

  isActive(): boolean {
    return this.state !== null || this.modal.isOpen();
  }

  /** Used on pagehide so an abandoned card releases its tab slot. */
  get pendingRequestId(): string | null {
    return this.state?.requestId ?? null;
  }

  async begin(query: string, paused: boolean): Promise<void> {
    if (this.isActive()) return;
    this.state = { query, paused };
    if (paused) this.armWatchdog(WATCHDOG_MS);

    let outcome: Outcome | null = null;
    try {
      // An idle MV3 worker can miss the first wake-up ("Receiving end does not
      // exist"). Retry briefly before giving up — the user's send is held.
      let res: { outcome?: Outcome } | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = (await chrome.runtime.sendMessage({
            type: MSG.QUERY_DETECTED,
            payload: { appId: this.provider.id, query, url: location.href },
          })) as { outcome?: Outcome } | undefined;
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          await sleep(200 * (attempt + 1));
        }
      }
      outcome = res?.outcome ?? "error";
    } catch {
      // Never strand a held message: release it unchanged.
      showToast("Memory Wallet was unreachable — sending your question without context", "warn");
      await this.finish(true);
      return;
    }

    switch (outcome) {
      case "needs-approval":
      case "auto-approved":
        // SHOW_MEMORY_REQUEST / INJECT_CONTEXT will arrive as messages.
        break;
      case "denied":
        if (paused) {
          showToast("Memory sharing is denied for this profile — sending without it", "warn");
          await this.finish(true);
        } else {
          this.state = null;
        }
        break;
      case "no-memories":
        if (paused) {
          showToast("No relevant memories — sending your question unchanged", "info");
          await this.finish(true);
        } else {
          this.state = null;
        }
        break;
      default:
        // no-profile / busy / error
        if (paused) {
          await this.finish(true);
        } else {
          this.state = null;
        }
        break;
    }
  }

  async handleShowRequest(payload: ShowMemoryRequestPayload): Promise<void> {
    this.disarmWatchdog();
    if (this.state) this.state.requestId = payload.requestId;
    payload.paused = Boolean(this.state?.paused);

    const decision = await this.modal.show(payload);
    try {
      await chrome.runtime.sendMessage({
        type: MSG.REQUEST_DECISION,
        payload: { ...decision, requestId: payload.requestId },
      });
    } catch {
      if (payload.paused) await this.finish(true);
      return;
    }

    if (decision.decision === "deny") {
      if (payload.paused) {
        showToast("Denied — sending your original question", "info");
        await this.finish(true);
      } else {
        showToast("Memory request denied", "warn");
      }
    } else if (payload.paused) {
      // INJECT_CONTEXT should arrive momentarily.
      this.armWatchdog(POST_DECISION_GRACE_MS);
    }
  }

  async handleInjected(payload: InjectContextPayload): Promise<void> {
    const paused = Boolean(this.state?.paused);
    this.disarmWatchdog();

    if (paused && !payload.contextText) {
      showToast("No relevant memories in this profile — sending your question", "info");
      await this.finish(true);
      return;
    }

    if (!payload.contextText) {
      showToast("Memory Wallet: no relevant memories found in this profile");
      this.state = null;
      return;
    }

    const queryForFill = this.state?.query ?? payload.query;
    const result = await injectContextIntoConversation(this.provider, payload.contextText, queryForFill);

    if (result.filled && result.submitted) {
      showShareReceipt({
        appName: payload.appName,
        profileName: payload.profileName,
        memoryCount: payload.memoryCount,
        durationLabel: payload.requireApproval
          ? "Policy requires approval every time"
          : grantLabel(payload.duration),
        canRevoke: payload.standingGranted,
        onRevoke: () => {
          void chrome.runtime.sendMessage({
            type: MSG.REVOKE_GRANT,
            payload: { appId: this.provider.id, profileId: payload.profileId },
          });
        },
      });
    } else if (result.filled) {
      showToast(
        `Context inserted — review and press Enter to send (${payload.memoryCount} memories)`,
        "success",
      );
    } else {
      showToast("Couldn't reach the message box — context copied to clipboard (Ctrl+V)", "warn");
    }
    this.state = null;
  }

  handleDenied(): void {
    if (!this.state) return;
    if (this.state.paused) {
      showToast("Request closed — sending your original question", "info");
      void this.finish(true);
    } else {
      showToast("Memory request denied", "warn");
      this.state = null;
    }
  }

  /** Pill button / new queries are only accepted while idle. */
  canAcceptQuery(): boolean {
    return !this.isActive();
  }

  /**
   * Clear the pause. When `sendOriginal`, put the untouched question back into
   * the composer and submit it — only valid in intercepted mode.
   */
  private async finish(sendOriginal: boolean): Promise<void> {
    this.disarmWatchdog();
    const state = this.state;
    this.state = null;
    if (!state || !state.paused || !sendOriginal) return;

    const submitted = await submitQuestion(this.provider, state.query);
    if (!submitted) {
      showToast("Press Enter to send your message", "info");
    }
  }

  private armWatchdog(ms: number): void {
    this.disarmWatchdog();
    this.watchdog = window.setTimeout(() => {
      const state = this.state;
      if (!state?.paused) return;
      // Tell the worker the card is abandoned, or its pending slot would keep
      // blocking this tab until the TTL expires.
      if (state.requestId) {
        void chrome.runtime
          .sendMessage({ type: MSG.CANCEL_REQUEST, payload: { requestId: state.requestId } })
          .catch(() => undefined);
      }
      showToast("Memory Wallet timed out — sending your original question", "warn");
      void this.finish(true);
    }, ms);
  }

  private disarmWatchdog(): void {
    if (this.watchdog !== null) {
      window.clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }
}
