/**
 * Keyword classification — deliberately dependency-free.
 *
 * Lives apart from `retrieval.ts` because retrieval touches `chrome.*` and
 * IndexedDB, while the memory extractor must stay a pure function that can be
 * unit-tested in plain Node (no extension runtime, no bundler shims).
 */
import type { MemoryCategory } from "./types";
import { CATEGORY_HINTS } from "./constants";

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Infer which memory categories a query touches (keyword hints, no ML). */
export function inferCategoriesFromQuery(query: string): MemoryCategory[] {
  const matched: MemoryCategory[] = [];
  for (const [cat, hints] of Object.entries(CATEGORY_HINTS) as [MemoryCategory, string[]][]) {
    // Match whole words/phrases only: "networking" must not trip the "work" hint.
    if (hints.some((h) => new RegExp(`\\b${escapeRegExp(h)}\\b`, "i").test(query))) {
      matched.push(cat);
    }
  }
  return matched;
}

/** Strongest single category for a statement, or "other" when nothing hints. */
export function inferCategory(text: string): MemoryCategory {
  return inferCategoriesFromQuery(text)[0] ?? "other";
}
