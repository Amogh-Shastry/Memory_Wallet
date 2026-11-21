import type { AIProviderAdapter } from "../providers/types";
import { getSettings } from "../shared/storage";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A contenteditable's textContent concatenates block elements with no
 *  separators at all ("…Context]Profile: MeMatched memories:…"), while the
 *  block we build has newlines. Compare with whitespace removed entirely or
 *  the fill check fails on ChatGPT's current composer and nothing is sent. */
const squash = (s: string): string => s.replace(/\s+/g, "");

export interface InjectionResult {
  filled: boolean;
  submitted: boolean;
}

/**
 * Fill the composer with the context block + original question.
 * Retries because the editor may be briefly unmounted during SPA updates.
 */
export async function injectContextIntoConversation(
  provider: AIProviderAdapter,
  contextText: string,
  originalQuery: string,
): Promise<InjectionResult> {
  const combined = `${contextText}\n\n${originalQuery}`;
  const expected = squash(combined.slice(0, 80));

  let filled = false;
  for (let attempt = 0; attempt < 3 && !filled; attempt++) {
    filled = provider.setComposerText(combined);
    if (filled) filled = squash(provider.readComposerText()).includes(expected);
    if (!filled) await sleep(250);
  }

  if (!filled) {
    try {
      await navigator.clipboard.writeText(combined);
    } catch {
      // Clipboard may be blocked without focus; nothing more we can do.
    }
    return { filled: false, submitted: false };
  }

  const settings = await getSettings();
  if (!settings.autoSendContext) return { filled: true, submitted: false };

  // Small delay lets the editor settle before clicking send.
  await sleep(250);
  let submitted = false;
  for (let attempt = 0; attempt < 24 && !submitted; attempt++) {
    submitted = provider.submitComposer();
    if (!submitted) await sleep(250);
  }
  return { filled: true, submitted };
}

/** Put just the original question back into the composer and send it. */
export async function submitQuestion(
  provider: AIProviderAdapter,
  originalQuery: string,
): Promise<boolean> {
  let filled = false;
  for (let attempt = 0; attempt < 3 && !filled; attempt++) {
    filled = provider.setComposerText(originalQuery);
    if (filled) filled = squash(provider.readComposerText()).includes(squash(originalQuery.slice(0, 40)));
    if (!filled) await sleep(200);
  }
  if (!filled) return false;
  await sleep(200);
  let submitted = false;
  for (let attempt = 0; attempt < 24 && !submitted; attempt++) {
    submitted = provider.submitComposer();
    if (!submitted) await sleep(250);
  }
  return submitted;
}
