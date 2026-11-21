/**
 * One-click "import what your AI knows" — the recurring on-ramp.
 *
 * Disclosed, reversible-ish flow:
 *  1. refuse when there is an unsent draft (never clobber the user's writing)
 *  2. tell the user we will send one message and that it stays in their history
 *  3. fill + submit the shipped prompt, with wallet interception suppressed
 *  4. watch the assistant reply until streaming completes, extract local facts
 *  5. review/edit proposals, then save via the background into the active profile
 *
 * The manual paste path in the setup wizard remains the fallback: if DOM
 * detection fails, we say so and point the user there instead of guessing.
 */
import type { AIProviderAdapter } from "../providers/types";
import type { ExistingMemory, Proposal } from "../shared/extract";
import { KNOW_ME_PROMPT, extractFacts, proposalFromRaw } from "../shared/extract";
import { MSG } from "../shared/messages";
import { isImporting, setImporting } from "./importState";
import { submitQuestion } from "./injector";
import { showToast } from "./ui/toast";
import { buildTokenStyleEl } from "../ui/contentTokens";
import { ensureContentFont } from "./font";

const CSS = `
* { box-sizing: border-box; }
.mw-import-overlay {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: flex-start; justify-content: flex-end; padding: 20px;
  background: rgba(0,0,0,0.45); backdrop-filter: blur(4px);
  font-family: var(--font-sans); animation: mw-fade 180ms ease-out;
}
@keyframes mw-fade { from { opacity: 0; } to { opacity: 1; } }
.mw-import-card {
  width: 400px; max-height: calc(100vh - 40px); overflow-y: auto;
  background: rgba(14,16,26,0.97); color: #f1f2f8;
  border: 1px solid rgba(99,102,241,0.35); border-radius: 18px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.7); padding: 18px;
  display: flex; flex-direction: column; gap: 12px;
}
.mw-import-card h2 { margin: 0; font-size: 16px; }
.mw-import-card p { margin: 0; font-size: 12px; line-height: 1.55; color: #c8cad8; }
.mw-import-card .mw-warn {
  background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.3);
  border-radius: 10px; padding: 9px 11px; color: #fcd34d;
}
.mw-import-prompt {
  background: #141522; border: 1px solid #232538; border-radius: 10px;
  padding: 10px 12px; font-size: 11.5px; color: #a5b4fc; line-height: 1.5;
}
.mw-import-row {
  display: flex; align-items: center; gap: 8px; background: #141522;
  border: 1px solid #232538; border-radius: 9px; padding: 7px 9px;
}
.mw-import-row input[type="checkbox"] { accent-color: #6366f1; cursor: pointer; }
.mw-import-row input[type="text"] { flex: 1; min-width: 0; background: transparent; border-color: transparent; color: #f1f2f8; }
.mw-import-row.unchecked { opacity: 0.5; }
.mw-ctx { font-size: 9px; color: #cbd5e1; background: rgba(148,163,184,0.15); border-radius: 5px; padding: 2px 5px; white-space: nowrap; }
.mw-import-skipped { border: 1px solid #232538; border-radius: 10px; padding: 8px 10px; }
.mw-import-skipped ul { list-style: none; margin: 6px 0 0; padding: 0; max-height: 120px; overflow-y: auto; font-size: 10.5px; color: #828599; }
.mw-import-skipped li { display: flex; gap: 8px; padding: 3px 0; }
.mw-import-skipped li em { font-style: normal; white-space: nowrap; }
.mw-link { background: none; border: none; color: #a5b4fc; cursor: pointer; font-family: var(--font-sans); font-size: 11px; text-decoration: underline; }
.mw-update-note { color: #fcd34d !important; }
.mw-import-update { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); border-radius: 10px; padding: 9px 11px; display: flex; flex-direction: column; gap: 6px; }
.mw-import-update strong { font-size: 10.5px; color: #cbd5e1; }
.mw-old { font-size: 11px; color: #828599; text-decoration: line-through; }
.mw-new-label { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #c8cad8; }
.mw-choice-row { display: flex; gap: 5px; }
.mw-choice-row button { flex: 1; cursor: pointer; background: #141522; border: 1px solid #2c2e46; border-radius: 6px; color: #c8cad8; padding: 5px; font-size: 10px; font-family: var(--font-sans); }
.mw-choice-row button.active { background: #6366f1; border-color: #6366f1; color: #fff; }
.mw-import-actions { display: flex; gap: 8px; margin-top: 4px; }
.mw-import-btn-action {
  flex: 1; padding: 10px; border-radius: 10px; border: none; cursor: pointer;
  font-size: 12.5px; font-weight: 700; font-family: var(--font-sans);
}
.mw-import-btn-action.primary { background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; }
.mw-import-btn-action.ghost { background: #1c1e30; color: #c8cad8; border: 1px solid #31344e; }
.mw-import-btn-action:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(99,102,241,0.6); }
`;

let host: HTMLDivElement | null = null;

interface Panel {
  card: HTMLElement;
  close: () => void;
}

async function openPanel(inner: string): Promise<Panel> {
  await ensureContentFont();
  const h = document.createElement("div");
  h.id = "memory-wallet-import-root";
  const shadow = h.attachShadow({ mode: "open" });
  shadow.appendChild(buildTokenStyleEl());
  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const overlay = document.createElement("div");
  overlay.className = "mw-import-overlay";
  overlay.innerHTML = `<div class="mw-import-card" role="dialog" aria-label="Memory Wallet import">${inner}</div>`;
  shadow.appendChild(overlay);
  document.documentElement.appendChild(h);
  host = h;

  const card = overlay.firstElementChild as HTMLElement;
  return {
    card,
    close: () => {
      h.remove();
      if (host === h) host = null;
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Explicit disclosure — sending on the user's behalf must never be silent. */
async function confirmDisclosure(aiName: string): Promise<boolean> {
  const panel = await openPanel(`
    <h2>Import what ${escapeHtml(aiName)} knows</h2>
    <p>Memory Wallet will send this one message for you, then read the reply and propose memories for you to check.</p>
    <div class="mw-import-prompt">${escapeHtml(KNOW_ME_PROMPT)}</div>
    <p class="mw-warn">This message will appear in your chat history. We can't delete it afterwards. Your current draft must be empty.</p>
    <div class="mw-import-actions">
      <button class="mw-import-btn-action ghost" data-action="cancel">Cancel</button>
      <button class="mw-import-btn-action primary" data-action="go">Send & continue</button>
    </div>
  `);
  return new Promise((resolve) => {
    panel.card.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
      panel.close();
      resolve(false);
    });
    panel.card.querySelector('[data-action="go"]')?.addEventListener("click", () => {
      panel.close();
      resolve(true);
    });
  });
}

interface ImportSaveProposal {
  content: string;
  category: Proposal["category"];
  importance: number;
  context?: string;
  kind?: "new" | "update";
  previous?: { id: string; content: string; context?: string };
  resolution?: "new" | "old" | "both";
}

/** Review step — extraction reads shape, not meaning, so every row is editable. */
async function reviewProposals(
  aiName: string,
  proposals: Proposal[],
  skipped: { raw: string; reason: string; context?: string }[],
): Promise<ImportSaveProposal[] | null> {
  const updateCount = proposals.filter((p) => p.kind === "update").length;
  const panel = await openPanel(`
    <h2>Review ${proposals.length} memories</h2>
    <p>${escapeHtml(aiName)} may have guessed. Check every line — nothing is saved until you confirm.</p>
    ${updateCount ? `<p class="mw-update-note">${updateCount} line(s) differ from what the wallet already knows. Choose what to do with each.</p>` : ""}
    <div class="mw-import-list"></div>
    ${skipped.length ? `<div class="mw-import-skipped">
      <p>${skipped.length} line(s) skipped. <button class="mw-link" data-action="add-skipped">Add them all</button></p>
      <ul>${skipped.map((s) => `<li><span>${escapeHtml(s.raw)}</span><em>${escapeHtml(s.reason)}</em></li>`).join("")}</ul>
    </div>` : ""}
    <div class="mw-import-actions">
      <button class="mw-import-btn-action ghost" data-action="cancel">Cancel</button>
      <button class="mw-import-btn-action primary" data-action="save">Save memories</button>
    </div>
  `);
  const list = panel.card.querySelector<HTMLElement>(".mw-import-list")!;
  const draft: (ImportSaveProposal & { checked: boolean; original?: Proposal["previous"] })[] =
    proposals.map((p) => ({
      content: p.content,
      category: p.category,
      importance: p.importance,
      context: p.context,
      kind: p.kind,
      previous: p.previous ? { id: p.previous.id, content: p.previous.content, context: p.previous.context } : undefined,
      resolution: p.kind === "update" ? "new" : undefined,
      checked: true,
    }));

  const render = () => {
    list.innerHTML = draft
      .map((p, i) => {
        if (p.previous) {
          const choice = p.resolution ?? "new";
          return `<div class="mw-import-update">
            <strong>${escapeHtml(p.context ?? "Existing memory")}</strong>
            <div class="mw-old">Was: ${escapeHtml(p.previous.content)}</div>
            <label class="mw-new-label">Now: <input type="text" data-i="${i}" value="${escapeHtml(p.content)}"></label>
            <div class="mw-choice-row">
              ${(["old", "new", "both"] as const)
                .map(
                  (opt) => `<button data-choice="${opt}" data-i="${i}" class="${choice === opt ? "active" : ""}">${
                    opt === "old" ? "Keep old" : opt === "new" ? "Use new" : "Keep both"
                  }</button>`,
                )
                .join("")}
            </div>
          </div>`;
        }
        return `<div class="mw-import-row ${p.checked ? "" : "unchecked"}">
          <input type="checkbox" data-i="${i}" ${p.checked ? "checked" : ""} aria-label="Save this memory">
          <input type="text" data-i="${i}" value="${escapeHtml(p.content)}" aria-label="Memory text">
          ${p.context ? `<span class="mw-ctx">${escapeHtml(p.context)}</span>` : ""}
        </div>`;
      })
      .join("");
    list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) =>
      box.addEventListener("change", () => {
        const i = Number(box.dataset.i);
        draft[i].checked = box.checked;
        box.parentElement?.classList.toggle("unchecked", !box.checked);
      }),
    );
    list.querySelectorAll<HTMLInputElement>('input[type="text"]').forEach((input) =>
      input.addEventListener("input", () => {
        draft[Number(input.dataset.i)].content = input.value;
      }),
    );
    list.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.i);
        draft[i].resolution = btn.dataset.choice as "new" | "old" | "both";
        render();
      }),
    );
  };
  render();

  panel.card.querySelector('[data-action="add-skipped"]')?.addEventListener("click", () => {
    const recovered = skipped.map((s) => ({ ...proposalFromRaw(s.raw, s.context), checked: true }));
    draft.push(
      ...recovered.map((p) => ({ ...p, previous: undefined, resolution: undefined })),
    );
    skipped.length = 0;
    render();
    panel.card.querySelector(".mw-import-skipped")?.remove();
  });

  return new Promise((resolve) => {
    panel.card.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
      panel.close();
      resolve(null);
    });
    panel.card.querySelector('[data-action="save"]')?.addEventListener("click", () => {
      const chosen = draft
        .filter((p) => p.checked && p.content.trim())
        .filter((p) => !p.previous || p.resolution !== "old")
        .map((p) => ({
          content: p.content.trim(),
          category: p.category,
          importance: p.importance,
          context: p.context,
          kind: p.kind,
          previous: p.previous,
          resolution: p.resolution,
        }));
      panel.close();
      resolve(chosen);
    });
  });
}

/** Streaming-complete detector: stable text + no visible stop button. */
async function waitForReply(provider: AIProviderAdapter, timeoutMs: number): Promise<string | null> {
  const start = Date.now();
  let last = "";
  let stable = 0;
  while (Date.now() - start < timeoutMs) {
    await sleep(500);
    const text = (provider.detectAssistantReply() ?? "").trim();
    if (text.length > 40 && !provider.isGenerating()) {
      if (text === last) {
        if (++stable >= 2) return text;
      } else {
        stable = 0;
        last = text;
      }
    } else {
      stable = 0;
      last = text;
    }
  }
  return null;
}

async function existingMemories(): Promise<ExistingMemory[]> {
  try {
    const res = await chrome.storage.local.get("mw_memories");
    return ((res["mw_memories"] as ExistingMemory[] | undefined) ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      context: m.context,
      category: m.category,
      previousValues: m.previousValues,
    }));
  } catch {
    return [];
  }
}

export async function startOneClickImport(provider: AIProviderAdapter): Promise<void> {
  if (host || isImporting()) return;

  const draft = provider.readComposerText().trim();
  if (draft) {
    showToast("Send or clear your draft first, then try importing", "warn");
    return;
  }
  if (!(await confirmDisclosure(provider.name))) return;
  if (!provider.getComposer()) {
    showToast("Can't find the message box — use the setup wizard's paste option", "warn");
    return;
  }

  setImporting(true);
  try {
    // A synthetic click immediately after filling the editor is ignored while
    // React's state catches up. submitQuestion verifies the text and retries
    // the send button with short delays instead of one optimistic click.
    if (!(await submitQuestion(provider, KNOW_ME_PROMPT))) {
      showToast("Couldn't send the prompt — paste it manually in Setup", "warn");
      return;
    }
    const reply = await waitForReply(provider, 45000);
    setImporting(false);
    if (!reply) {
      showToast("Couldn't read the reply — paste it into Setup instead", "warn");
      return;
    }
    const result = extractFacts(reply, await existingMemories());
    if (result.proposals.length === 0) {
      showToast("Nothing to import — try the setup wizard's questions", "info");
      return;
    }
    const chosen = await reviewProposals(provider.name, result.proposals, result.skipped);
    if (!chosen || chosen.length === 0) return;
    const res = (await chrome.runtime.sendMessage({
      type: MSG.SAVE_IMPORTED_MEMORIES,
      payload: { proposals: chosen },
    })) as { ok?: boolean } | undefined;
    if (res?.ok) showToast(`Saved ${chosen.length} memories from ${provider.name}`, "success");
    else showToast("Couldn't save — try again", "warn");
  } catch {
    showToast("Import failed — paste the answer into Setup instead", "warn");
  } finally {
    setImporting(false);
  }
}
