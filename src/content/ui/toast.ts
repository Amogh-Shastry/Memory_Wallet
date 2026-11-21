import { buildTokenStyleEl } from "../../ui/contentTokens";
import { brandMarkSvg } from "../../ui/brand";

/* Toast + Floating Pill styles for Memory Wallet.
   Token variables injected via buildTokenStyleEl(). */
const TOAST_COMPONENT_CSS = `
.mw-toast {
  position: fixed; bottom: 64px; left: 24px; z-index: 2147483647;
  display: flex; align-items: center; gap: 10px;
  background: rgba(14, 16, 26, 0.95);
  background-image: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 80%);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  color: #f1f2f8; border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 14px; padding: 10px 16px;
  font-family: var(--font-sans);
  font-feature-settings: "cv02", "cv03", "cv04", "cv11", "tnum";
  letter-spacing: -0.011em;
  font-size: 13px; font-weight: 600;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(99, 102, 241, 0.2);
  animation: mw-toast-in 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes mw-toast-in {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.mw-toast svg { flex: 0 0 auto; }
.mw-toast.success svg { color: #10b981; }
.mw-toast.warn svg { color: #f59e0b; }
.mw-toast.info svg { color: #a5b4fc; }

.mw-pill-cluster {
  position: fixed; bottom: 24px; right: 24px; z-index: 2147483646;
  display: flex; align-items: center; gap: 8px;
}

.mw-import-btn {
  background: rgba(14, 16, 26, 0.92);
  color: #c8cad8; border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 999px; padding: 8px 12px; cursor: pointer;
  font-family: var(--font-sans); font-size: 11.5px; font-weight: 700;
  transition: all 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.mw-import-btn:hover { border-color: #6366f1; color: #fff; background: #191b2b; }
.mw-import-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.6); }

.mw-pill {
  z-index: 2147483646;
  display: flex; align-items: center; gap: 7px;
  background: rgba(14, 16, 26, 0.92);
  background-image: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(6, 182, 212, 0.15) 100%);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  color: #f1f2f8; border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 999px; padding: 8px 16px; cursor: pointer;
  font-family: var(--font-sans);
  font-size: 12.5px; font-weight: 700;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 12px rgba(99, 102, 241, 0.25);
  transition: all 140ms cubic-bezier(0.16, 1, 0.3, 1);
}

.mw-pill:hover {
  transform: translateY(-2px) scale(1.02);
  border-color: #6366f1;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 20px rgba(99, 102, 241, 0.45);
}

.mw-pill:active {
  transform: scale(0.98);
}

.mw-pill:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.6);
}

.mw-pill svg { color: #a5b4fc; }

/* Share receipt — says exactly what was shared and how to stop future shares. */
.mw-receipt {
  position: fixed; bottom: 76px; right: 24px; z-index: 2147483647;
  width: 320px; max-width: calc(100vw - 48px);
  background: rgba(14, 16, 26, 0.96);
  background-image: radial-gradient(circle at 100% 0%, rgba(6, 182, 212, 0.14) 0%, transparent 70%);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  color: #f1f2f8; border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 14px; padding: 12px 14px;
  font-family: var(--font-sans);
  font-size: 12.5px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.6), 0 0 16px rgba(16, 185, 129, 0.15);
  animation: mw-toast-in 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.mw-receipt-head {
  display: flex; align-items: center; gap: 7px;
  font-weight: 700;
}

.mw-receipt-head svg { color: #10b981; flex: 0 0 auto; }

.mw-receipt-close {
  margin-left: auto; background: none; border: none; cursor: pointer;
  color: #828599; font-size: 15px; line-height: 1; padding: 2px 4px; border-radius: 5px;
}
.mw-receipt-close:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.mw-receipt-close:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.6); }

.mw-receipt-body {
  margin: 7px 0 10px; color: #c8cad8; font-size: 11.5px; line-height: 1.45;
}

.mw-receipt-actions { display: flex; gap: 8px; }

.mw-receipt-link {
  flex: 1; cursor: pointer; text-align: center;
  background: #191b2b; border: 1px solid #2c2e46; border-radius: 8px;
  color: #c8cad8; padding: 6px 8px;
  font-family: var(--font-sans); font-size: 11px; font-weight: 700;
  transition: all 120ms;
}
.mw-receipt-link:hover { background: #232538; color: #fff; border-color: #41435e; }
.mw-receipt-link.danger { color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); }
.mw-receipt-link.danger:hover { background: rgba(239, 68, 68, 0.15); color: #fecaca; }
.mw-receipt-link:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.6); }
`;

/** Inline stroke icons (thin-line, currentColor) for shadow-DOM templates. */
function svgIcon(name: "lock" | "check" | "warn", size = 15): string {
  const paths: Record<string, string> = {
    lock:
      '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    warn: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

let currentToast: HTMLDivElement | null = null;
let pillHost: HTMLDivElement | null = null;
let pillButton: HTMLButtonElement | null = null;

export function showToast(message: string, tone: "info" | "success" | "warn" = "info"): void {
  currentToast?.remove();
  const host = document.createElement("div");
  host.id = "memory-wallet-toast-root";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.appendChild(buildTokenStyleEl());
  const style = document.createElement("style");
  style.textContent = TOAST_COMPONENT_CSS;
  shadow.appendChild(style);

  const icon = svgIcon(tone === "success" ? "check" : tone === "warn" ? "warn" : "lock");
  const container = document.createElement("div");
  container.insertAdjacentHTML(
    "beforeend",
    `<div class="mw-toast ${tone}" role="status" aria-live="polite">${icon}</div>`,
  );
  const toastEl = container.firstElementChild as HTMLDivElement | null;
  if (toastEl) {
    const span = document.createElement("span");
    span.textContent = message;
    toastEl.appendChild(span);
  }
  shadow.appendChild(container);

  document.documentElement.appendChild(host);
  currentToast = host;
  window.setTimeout(() => {
    host.remove();
    if (currentToast === host) currentToast = null;
  }, 5000);
}

export interface ShareReceiptData {
  appName: string;
  profileName: string;
  memoryCount: number;
  durationLabel: string;
  canRevoke: boolean;
  onRevoke?: () => void;
}

let currentReceipt: HTMLDivElement | null = null;

/**
 * Post-share receipt. Unlike a toast it stays long enough to act on, states
 * exactly what left the device, and offers an honest "stop future shares"
 * action — the message already went out, so this revokes permission, not the send.
 */
export function showShareReceipt(data: ShareReceiptData): void {
  currentReceipt?.remove();

  const host = document.createElement("div");
  host.id = "memory-wallet-receipt-root";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.appendChild(buildTokenStyleEl());
  const style = document.createElement("style");
  style.textContent = TOAST_COMPONENT_CSS;
  shadow.appendChild(style);

  const card = document.createElement("div");
  card.className = "mw-receipt";
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");
  shadow.appendChild(card);

  const head = document.createElement("div");
  head.className = "mw-receipt-head";
  head.innerHTML = svgIcon("check", 15);
  const title = document.createElement("strong");
  title.textContent = `Shared with ${data.appName}`;
  head.appendChild(title);
  const close = document.createElement("button");
  close.className = "mw-receipt-close";
  close.setAttribute("aria-label", "Dismiss receipt");
  close.textContent = "×";
  close.addEventListener("click", () => dismiss());
  head.appendChild(close);
  card.appendChild(head);

  const body = document.createElement("p");
  body.className = "mw-receipt-body";
  body.textContent = `${data.memoryCount} ${data.memoryCount === 1 ? "memory" : "memories"} from "${data.profileName}" · ${data.durationLabel}`;
  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "mw-receipt-actions";

  const view = document.createElement("button");
  view.className = "mw-receipt-link";
  view.textContent = "View receipt";
  view.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html#requests") });
    dismiss();
  });
  actions.appendChild(view);

  if (data.canRevoke) {
    const revoke = document.createElement("button");
    revoke.className = "mw-receipt-link danger";
    revoke.textContent = "Stop auto-sharing";
    revoke.addEventListener("click", () => {
      data.onRevoke?.();
      body.textContent = "Future messages will ask again. This one was already sent.";
      revoke.remove();
      window.setTimeout(dismiss, 4000);
    });
    actions.appendChild(revoke);
  }
  card.appendChild(actions);

  document.documentElement.appendChild(host);
  currentReceipt = host;

  function dismiss(): void {
    host.remove();
    if (currentReceipt === host) currentReceipt = null;
  }

  window.setTimeout(dismiss, 9000);
}

export function showPill(label: string, onImport?: () => void, aiName = "your AI"): void {
  if (pillHost) {
    updatePill(label);
    return;
  }
  const host = document.createElement("div");
  host.id = "memory-wallet-pill-root";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.appendChild(buildTokenStyleEl());
  const style = document.createElement("style");
  style.textContent = TOAST_COMPONENT_CSS;
  shadow.appendChild(style);

  const cluster = document.createElement("div");
  cluster.className = "mw-pill-cluster";

  const importBtn = document.createElement("button");
  importBtn.className = "mw-import-btn";
  importBtn.title = `Import what ${aiName} knows about you`;
  importBtn.textContent = `Import what ${aiName} knows`;
  importBtn.addEventListener("click", () => onImport?.());
  cluster.appendChild(importBtn);

  const pill = document.createElement("button");
  pill.className = "mw-pill";
  pill.title = "Memory Wallet — request context injection for your last prompt";
  pillButton = pill;
  pill.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("mw-pill-click"));
  });
  cluster.appendChild(pill);
  shadow.appendChild(cluster);

  document.documentElement.appendChild(host);
  pillHost = host;
  updatePill(label);
}

/** Update the pill label without recreating it (e.g. active profile changed). */
export function updatePill(label: string): void {
  if (!pillButton) return;
  pillButton.replaceChildren();
  pillButton.insertAdjacentHTML("afterbegin", brandMarkSvg(15));
  const span = document.createElement("span");
  span.textContent = label;
  pillButton.appendChild(span);
}

export function removePill(): void {
  pillHost?.remove();
  pillHost = null;
  pillButton = null;
}
