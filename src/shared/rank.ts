/**
 * Pure ranking primitives — no chrome.*, no IndexedDB, no embeddings.
 *
 * The old scorer treated every token as equally informative, so one ambiguous
 * word ("background" in "my background in AI") could beat an entire answer
 * about artificial intelligence. This module makes three general changes:
 *   1. phrases (bigrams) count, not just isolated words
 *   2. proper nouns / acronyms / numbers are strong anchors; a lone common
 *      lowercase word is not enough evidence on its own
 *   3. category is only a tiebreaker, never a reason to include a memory
 */
import type { MemoryCategory } from "./types";

export const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "of", "to", "in", "on", "at", "by",
  "with", "from", "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "doing",
  "have", "has", "had", "i", "me", "my", "mine", "we", "our", "you", "your", "it", "its", "this", "that",
  "these", "those", "what", "which", "who", "whom", "how", "when", "where", "why", "should", "could",
  "would", "will", "can", "use", "using", "used", "about", "as", "into", "over", "under", "not",
  "remind", "reminds", "told", "tell",
]);

export interface RankDoc {
  id: string;
  content: string;
  /** Section from the pasted answer — searchable metadata, not display-only. */
  context?: string;
  category: MemoryCategory;
  importance: number;
}

export interface QuerySignals {
  /** Lowercased content words (synonyms may be added by the caller). */
  tokens: string[];
  /** Adjacent word pairs from the literal query — phrases are the strongest clue. */
  bigrams: string[];
  /** Proper nouns, acronyms and numbers — reliable single-word anchors. */
  anchors: string[];
  /** Query asks about things actually done, not things merely considered. */
  actualExperience: boolean;
}

export interface MatchResult {
  qualified: boolean;
  score: number;
  bigramHits: number;
  anchorHits: number;
  weakHits: number;
}

function words(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9-]/g, ""))
    .filter(Boolean);
}

export function tokenize(text: string): string[] {
  return words(text)
    .map((w) => w.toLowerCase())
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .map((w) => (w.length > 4 && w.endsWith("ed") ? w.slice(0, -2) : w))
    .map((w) => (w.length > 5 && w.endsWith("ing") ? w.slice(0, -3) : w))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function isAnchor(word: string): boolean {
  if (/\d/.test(word)) return true;
  // Capitalised mid-sentence → proper noun/acronym. Carries real information
  // even when it appears alone ("CGPA", "React", "Java", "Spring Boot").
  return word.length >= 3 && /[A-Z]/.test(word);
}

/** Analyse a query once; the result is reused for every candidate memory. */
export function analyzeQuery(text: string): QuerySignals {
  const raw = words(text);
  const lower = tokenize(text);
  const anchors = [...new Set(
    raw
      .filter(isAnchor)
      .map((w) => w.toLowerCase())
      .filter((w) => !STOPWORDS.has(w)),
  )];
  const bigrams: string[] = [];
  for (let i = 0; i < lower.length - 1; i++) bigrams.push(`${lower[i]} ${lower[i + 1]}`);
  const actualExperience = /\b(did|had|worked as|worked on|built|career|internships have i had|projects have i built)\b/i.test(text);
  return { tokens: lower, bigrams, anchors, actualExperience };
}

function bigramsOf(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

/** Document frequency for words and phrases across a profile. */
export function buildDf(docs: RankDoc[]): Map<string, number> {
  const df = new Map<string, number>();
  const bump = (key: string) => df.set(key, (df.get(key) ?? 0) + 1);
  for (const doc of docs) {
    const tokens = [...tokenize(doc.content), ...tokenize(doc.context ?? "")];
    for (const token of new Set(tokens)) bump(token);
    for (const bigram of new Set(bigramsOf(tokens))) bump(`bi:${bigram}`);
  }
  return df;
}

/**
 * Detect a compound word that merely shares a prefix with a query word
 * ("languages" vs "LangChain") — a classic source of embedding false friends.
 * Real inflections ("work"/"worked", "system"/"systems") are excluded because
 * one is a prefix of the other.
 */
export function isCompoundFalseFriend(queryTokens: string[], docText: string): boolean {
  const docTokens = tokenize(docText);
  return queryTokens.some((query) => {
    if (query.length < 5) return false;
    const prefix = query.slice(0, 4);
    return docTokens.some((token) =>
      token.length >= query.length && token.startsWith(prefix) && !token.startsWith(query),
    );
  });
}

function idf(count: number, total: number): number {
  return 1 + Math.log((1 + total) / (1 + count));
}

/**
 * Score one memory. `qualified` is false when the only evidence is a single
 * common lowercase word — that is what used to let "background colour" win.
 */
export function scoreMatch(
  doc: RankDoc,
  query: QuerySignals,
  df: Map<string, number>,
  totalDocs: number,
  hintedCategories: MemoryCategory[],
): MatchResult {
  const contentTokens = tokenize(doc.content);
  const contextTokens = tokenize(doc.context ?? "");
  const contentSet = new Set(contentTokens);
  const contextSet = new Set(contextTokens);
  const docTokens = new Set([...contentTokens, ...contextTokens]);
  const contentBigrams = new Set(bigramsOf(contentTokens));
  const contextBigrams = new Set(bigramsOf(contextTokens));
  const anchorSet = new Set(query.anchors);

  let bigramHits = 0;
  let anchorHits = 0;
  let weakHits = 0;
  let evidence = 0;

  for (const bigram of query.bigrams) {
    if (contentBigrams.has(bigram)) {
      bigramHits++;
      evidence += 1.6 * idf(df.get(`bi:${bigram}`) ?? 0, totalDocs);
    } else if (contextBigrams.has(bigram)) {
      // A section title is real evidence: "faculty outreach" should find the
      // whole Recent Faculty Outreach section, not just literal fact text.
      bigramHits++;
      evidence += 1.4 * idf(df.get(`bi:${bigram}`) ?? 0, totalDocs);
    }
  }
  for (const anchor of query.anchors) {
    if (contentSet.has(anchor) || contextSet.has(anchor)) {
      anchorHits++;
      evidence += 1.4 * idf(df.get(anchor) ?? 0, totalDocs);
    }
  }
  for (const token of query.tokens) {
    if (docTokens.has(token) && !anchorSet.has(token)) {
      weakHits++;
      evidence += 0.7 * idf(df.get(token) ?? 0, totalDocs);
    }
  }

  // One anchor is only decisive when it is genuinely rare in this profile.
  // "Spring" appearing in two memories is ambiguous; "CGPA" in one is not.
  const rareThreshold = Math.max(1, Math.ceil(totalDocs * 0.02));
  const loneAnchorIsRare = query.anchors.some(
    (anchor) => docTokens.has(anchor) && (df.get(anchor) ?? 0) <= rareThreshold,
  );
  const qualified =
    bigramHits > 0 ||
    anchorHits >= 2 ||
    (anchorHits === 1 && loneAnchorIsRare) ||
    weakHits >= 2;
  if (!qualified) return { qualified: false, score: 0, bigramHits, anchorHits, weakHits };

  let score = evidence * (0.5 + doc.importance);
  // "What internships have I had?" should prefer "I worked as an SDE Intern"
  // over "I explored an internship" — the latter only mentions the topic.
  if (query.actualExperience && /^I (have )?(explored|wanted|want|plan|planned|am exploring|am considering)\b/i.test(doc.content.trim())) {
    score *= 0.35;
  }
  // A category hint breaks near-ties; it never rescues a weak match.
  const tiebreak = hintedCategories.includes(doc.category) ? 0.1 * doc.importance : 0;
  return { qualified: true, score: score + tiebreak, bigramHits, anchorHits, weakHits };
}
