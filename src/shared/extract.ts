/**
 * Turns a pasted AI answer into reviewable memory proposals.
 *
 * The on-ramp is: ask ChatGPT/Claude "what do you know about me?", paste the
 * reply, and get a list of facts the user can tick and edit before anything is
 * saved. This module is the whole feature's logic, and it is deliberately pure:
 * no `chrome.*`, no network, no DOM. That keeps it unit-testable in plain Node
 * and means the same rules can run inside the content script.
 *
 * Design stance: extraction reads the *shape* of text, not its meaning. It will
 * sometimes be wrong. The review step is not politeness — it is the safety net,
 * so nothing is silently dropped: every rejected line is returned with a reason.
 */
import type { MemoryCategory } from "./types";
import { inferCategory } from "./classify";

/**
 * The exact wording we hand the user to paste into ChatGPT/Claude.
 * Shipped as a constant so the copy button, the one-click injector and the docs
 * all use one prompt. One fact per bullet gives clean boundaries; "only things
 * I told you" cuts hallucination; "no commentary" removes framing sentences.
 */
export const KNOW_ME_PROMPT =
  "List everything you remember about me as short bullet points — one fact per bullet, no commentary. Only include things I explicitly told you. If you're unsure, leave it out.";

/** No recall limit: every distinct fact in a paste becomes a proposal.
 *  Kept as an exported constant so callers/tests can state the policy. */
export const MAX_PROPOSALS = Number.POSITIVE_INFINITY;
/** Longest single memory we will produce. */
export const MAX_FACT_CHARS = 200;

/** Existing memory as seen by the extractor. Strings are accepted too. */
export interface ExistingMemory {
  id: string;
  content: string;
  context?: string;
  category?: MemoryCategory;
  previousValues?: string[];
}

export interface Proposal {
  content: string;
  category: MemoryCategory;
  importance: number;
  /** Section from the pasted answer (e.g. "Technical Skills"). Metadata only. */
  context?: string;
  /** "update" means this looks like a changed version of an existing fact. */
  kind: "new" | "update";
  /** The memory an update would replace. Never applied without review. */
  previous?: ExistingMemory;
}

export interface SkippedLine {
  raw: string;
  reason: string;
  context?: string;
}

export interface ExtractionResult {
  proposals: Proposal[];
  skipped: SkippedLine[];
}

/* ------------------------------------------------------------------ */
/* Structure                                                          */
/* ------------------------------------------------------------------ */

/** Fenced code blocks are examples, not facts. Drop them whole. */
const FENCED_CODE = /```[\s\S]*?```/g;
/** "1. ", "- ", "• ", "a) " at the start of a line. */
const BULLET_PREFIX = /^\s*(?:[-*•·–—]+|\d+[.)]|[a-z][.)])\s+/i;
/** "## Heading", "> quote". */
const MARKDOWN_PREFIX = /^\s*(?:#{1,6}\s*|>\s*)/;
/** "Name: Alex", "Location: London" — but not "I'm building X: a thing". */
const KEY_VALUE = /^([A-Z][A-Za-z]*(?: [A-Za-z]+){0,3})\s*:\s*(.+)$/;

function cleanHeading(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

/** Markdown headings and short label lines are context, not memories. */
function detectHeading(raw: string): string | null {
  const line = raw.trim();
  if (!line) return null;
  const md = /^#{1,6}\s+(.+)$/.exec(line);
  if (md) return cleanHeading(md[1]);
  const bold = /^\*\*([^*]+)\*\*$/.exec(line);
  if (bold) return cleanHeading(bold[1]);
  if (line.endsWith(":") && line.length <= 80 && line.split(/\s+/).length <= 8 && !KEY_VALUE.test(line)) {
    return cleanHeading(line.slice(0, -1));
  }
  return null;
}

function stripMarkdown(text: string): string {
  return text
    .replace(MARKDOWN_PREFIX, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]*)`/g, "$1") // keep the code text, drop the ticks
    .trim();
}

/** Conservative sentence split: only breaks before a capital/digit/quote. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const CONTINUATION =
  /^(?:it|it's|its|this|that|these|those|they|them|their|he|she|his|her|there|which|and|but|so|also|plus|however|though|while)\b/i;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** "I built LIBRO. It's a chatbot." is one fact, not two. */
function mergeContinuations(sentences: string[]): string[] {
  const out: string[] = [];
  for (const sentence of sentences) {
    const prev = out[out.length - 1];
    const shouldMerge =
      prev !== undefined &&
      (CONTINUATION.test(sentence) || wordCount(sentence) <= 2) &&
      prev.length + 1 + sentence.length <= MAX_FACT_CHARS;
    if (shouldMerge) out[out.length - 1] = `${prev} ${sentence}`;
    else out.push(sentence);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Key: value lines                                                   */
/* ------------------------------------------------------------------ */

const KEY_MAP: Record<string, (v: string) => string> = {
  name: (v) => `My name is ${v}.`,
  "full name": (v) => `My name is ${v}.`,
  location: (v) => `I live in ${v}.`,
  lives: (v) => `I live in ${v}.`,
  "lives in": (v) => `I live in ${v}.`,
  "based in": (v) => `I live in ${v}.`,
  city: (v) => `I live in ${v}.`,
  country: (v) => `I live in ${v}.`,
  timezone: (v) => `My timezone is ${v}.`,
  "time zone": (v) => `My timezone is ${v}.`,
  job: (v) => `I work as ${v}.`,
  occupation: (v) => `I work as ${v}.`,
  profession: (v) => `I work as ${v}.`,
  role: (v) => `I work as ${v}.`,
  company: (v) => `I work at ${v}.`,
  employer: (v) => `I work at ${v}.`,
  workplace: (v) => `I work at ${v}.`,
};

function keyValueToFact(key: string, value: string): string {
  const k = key.toLowerCase();
  const mapped = KEY_MAP[k];
  if (mapped) return mapped(value);
  if (k === "age" && /^\d+$/.test(value.trim())) return `I am ${value.trim()} years old.`;
  const plural = k.endsWith("s");
  return `My ${k} ${plural ? "are" : "is"} ${value}.`;
}

/* ------------------------------------------------------------------ */
/* AI-commentary removal                                              */
/* ------------------------------------------------------------------ */

/** Peel the model's framing off a fact: "You stated that X" -> "X". */
function unwrapMeta(sentence: string): string {
  return sentence
    .replace(/^you (?:have |had )?(?:stated|mentioned|noted|said|told us) that\s+/i, "")
    .replace(/^according to your (?:resume[^,]*|profile|chat history|memories)[^,]*,\s*/i, "")
    .replace(/,\s*according to your (?:resume[^.]*|profile|draft)\s*/i, "")
    .trim();
}

/** The model talking about itself or about the list, not about the user. */
const META_PATTERNS: RegExp[] = [
  /^based on\b/i,
  /^from (?:our|your|the) (?:conversations?|chats?|sessions?)\b/i,
  /^here(?:'s| is| are)\b/i,
  /^below (?:is|are)\b/i,
  /^these are\b/i,
  /^the following\b/i,
  /^as an ai\b/i,
  /^i (?:don't|do not) (?:have|know|remember|recall)\b/i,
  /^i (?:only|just) (?:have|know|remember)\b/i,
  /^i (?:can|could) see\b/i,
  /^i remember\b/i,
  /^i(?:'ve| have) mentioned\b/i,
  /^i've (?:listed|summari[sz]ed|noted)\b/i,
  /^i (?:hope|apologize|apologise)\b/i,
  /^i'm happy to\b/i,
  /^i (?:can|could|will) help\b/i,
  /^let me know\b/i,
  /^feel free\b/i,
  /^would you like\b/i,
  /^you (?:can|could) (?:ask|check|see|find|look|visit|enable|turn)\b/i,
  /^you (?:haven't|have not) (?:told|shared|mentioned)\b/i,
  /^unfortunately\b/i,
  /^note\s*[:—-]/i,
  /^please\b/i,
  /^that(?:'s| is) (?:all|everything)\b/i,
  /^if you(?:'d| would)? like\b/i,
  /^memory wallet context/i,
];

const BARE_URL = /^(?:https?:\/\/|www\.)\S+$/i;

const isMeta = (s: string): boolean => META_PATTERNS.some((re) => re.test(s));
const isQuestion = (s: string): boolean => /\?\s*$/.test(s);
const isBareUrl = (s: string): boolean => BARE_URL.test(s);
const withoutUrls = (s: string): string =>
  s.replace(/\bhttps?:\/\/\S+/gi, "").replace(/\bwww\.\S+/gi, "").trim();

/* ------------------------------------------------------------------ */
/* Second → first person                                              */
/* ------------------------------------------------------------------ */

/**
 * Ordered rules. Object pronouns come before the bare `you` rule so
 * "update you" becomes "update me", not "update I". Quoted spans are skipped:
 * a brand line like "Your AI memory. Your rules." must survive verbatim.
 */
const PRONOUN_RULES: [RegExp, string][] = [
  [/\byou're\b/gi, "i'm"],
  [/\byou are\b/gi, "i am"],
  [/\byou've\b/gi, "i've"],
  [/\byou have\b/gi, "i have"],
  [/\byou were\b/gi, "i was"],
  [/\byou'll\b/gi, "i'll"],
  [/\byou will\b/gi, "i will"],
  [/\byou'd\b/gi, "i'd"],
  [/\byou would\b/gi, "i would"],
  [/\byou aren't\b/gi, "i'm not"],
  [/\byou're not\b/gi, "i'm not"],
  [/\byou haven't\b/gi, "i haven't"],
  [/\byou hasn't\b/gi, "i haven't"],
  [/\byou don't\b/gi, "i don't"],
  [/\byou do not\b/gi, "i do not"],
  [/\byou didn't\b/gi, "i didn't"],
  [/\byou can't\b/gi, "i can't"],
  [/\byou cannot\b/gi, "i cannot"],
  [/\byou can\b/gi, "i can"],
  // Object pronouns — these refer to the reader, i.e. "me" after the flip.
  [/\bupdate you\b/gi, "update me"],
  [/\btell you\b/gi, "tell me"],
  [/\btold you\b/gi, "told me"],
  [/\basked you\b/gi, "asked me"],
  [/\bask you\b/gi, "ask me"],
  [/\binform you\b/gi, "inform me"],
  [/\babout you\b/gi, "about me"],
  [/\byou\b/gi, "i"],
  [/\byourselves\b/gi, "ourselves"],
  [/\byourself\b/gi, "myself"],
  [/\byours\b/gi, "mine"],
  [/\byour\b/gi, "my"],
  [/\bthe user is\b/gi, "i am"],
  [/\bthe user has\b/gi, "i have"],
  [/\bthe user's\b/gi, "my"],
  [/\bthe user\b/gi, "i"],
];

/** Double quotes and backticks only — an apostrophe is not a quote here. */
const QUOTED_SPAN = /("[^"\n]*"|“[^”\n]*”|`[^`\n]*`)/;

function mapOutsideQuotes(text: string, fn: (s: string) => string): string {
  return text
    .split(QUOTED_SPAN)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

function capitalize(text: string): string {
  const i = text.search(/[a-z]/i);
  if (i === -1) return text;
  if (i !== 0 && !/^[\s"'“(]/.test(text.slice(0, i))) return text;
  return text.slice(0, i) + text[i].toUpperCase() + text.slice(i + 1);
}

function toFirstPerson(text: string): string {
  const flipped = mapOutsideQuotes(text, (segment) =>
    PRONOUN_RULES.reduce((acc, [re, to]) => acc.replace(re, to), segment),
  );
  return capitalize(flipped);
}

/* ------------------------------------------------------------------ */
/* Dedupe + truncation                                                */
/* ------------------------------------------------------------------ */

function compareTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

const NEAR_DUPLICATE = 0.8;

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!;:,]+$/g, "")
    .trim();
}

function clamp(sentence: string): string {
  if (sentence.length <= MAX_FACT_CHARS) return sentence;
  const cut = sentence.slice(0, MAX_FACT_CHARS - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Turn a manually recovered skipped line into an editable proposal.
 *  Used by "Add these too" in the review UI — no filtering, user decides. */
export function proposalFromRaw(raw: string, context?: string): Proposal {
  const content = clamp(raw.replace(/\s+/g, " ").trim());
  const category = inferCategory(content.replace(/['’]/g, ""));
  return {
    content,
    category,
    importance: category === "identity" ? 0.8 : 0.7,
    context,
    kind: "new",
  };
}

/* ------------------------------------------------------------------ */
/* Update detection                                                   */
/* ------------------------------------------------------------------ */

/** Content with values (numbers) and filler removed — "graduated in 2025"
 *  and "graduated in 2026" share the same topic key. */
function topicKey(text: string): string {
  return normalizeKey(text)
    .replace(/\b\d+(?:\.\d+)?\b/g, "#")
    .replace(/\b(?:a|an|the|and|of|in|at|to|for|with|is|am|are|was|were|have|has|had|my|i)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeUpdate(
  content: string,
  context: string | undefined,
  category: MemoryCategory,
  entry: ExistingMemory,
): boolean {
  const oldContent = entry.content;
  if (topicKey(content) === topicKey(oldContent) && normalizeKey(content) !== normalizeKey(oldContent)) {
    return true;
  }
  const oldTokens = compareTokens(oldContent);
  const newTokens = compareTokens(content);
  const score = similarity(newTokens, oldTokens);
  if (score > NEAR_DUPLICATE) return true;
  const oldCategory = entry.category ?? inferCategory(oldContent.replace(/['’]/g, ""));
  // Same section + same category + a substantial token overlap: likely the
  // same fact with a changed detail, not a second independent fact.
  return score >= 0.5 && oldCategory === category && !!context && context === entry.context;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                        */
/* ------------------------------------------------------------------ */

/**
 * Extract every reviewable fact from a pasted AI answer.
 *
 * @param raw      Whatever the user pasted (markdown headings, bullets, prose).
 * @param existing Memories already in the target profile. Exact repeats are
 *                 skipped; changed versions become reviewable "update" proposals.
 * @returns proposals plus every skipped line and why, so the UI can offer
 *          "add these too" instead of silently losing information.
 */
export function extractFacts(
  raw: string,
  existing: (ExistingMemory | string)[] = [],
): ExtractionResult {
  if (typeof raw !== "string" || raw.trim() === "") return { proposals: [], skipped: [] };

  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(FENCED_CODE, "\n")
    .replace(/[•·]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  const entries: ExistingMemory[] = existing.map((e, i) =>
    typeof e === "string" ? { id: `existing-${i}`, content: e } : e,
  );
  const exactExisting = new Set(entries.map((e) => normalizeKey(e.content)));
  const claimed = new Set<string>();
  const newKeys = new Set<string>();
  const newTokenSets: Set<string>[] = [];
  const proposals: Proposal[] = [];
  const skipped: SkippedLine[] = [];
  const skip = (rawLine: string, reason: string) => {
    const clean = rawLine.trim();
    if (clean) skipped.push({ raw: clean, reason, context: currentContext });
  };

  const push = (candidate: string, context?: string): boolean => {
    const content = clamp(candidate.replace(/\s+/g, " ").trim());
    if (!content) return false;

    const key = normalizeKey(content);
    if (!key) return false;
    if (exactExisting.has(key) || newKeys.has(key)) return false;
    const tokens = compareTokens(content);
    if (newTokenSets.some((t) => similarity(tokens, t) > NEAR_DUPLICATE)) return false;

    // Apostrophes would hide category hints ("master's" vs "masters").
    const category = inferCategory(content.replace(/['’]/g, ""));
    const matched = entries.find(
      (e) => !claimed.has(e.id) && looksLikeUpdate(content, context, category, e),
    );
    if (matched) claimed.add(matched.id);

    newKeys.add(key);
    newTokenSets.push(tokens);
    proposals.push({
      content,
      category,
      importance: category === "identity" ? 0.8 : 0.7,
      context,
      kind: matched ? "update" : "new",
      previous: matched,
    });
    return true;
  };

  let currentContext: string | undefined;

  for (const rawLine of text.split("\n")) {
    const heading = detectHeading(rawLine);
    if (heading) {
      currentContext = heading;
      continue;
    }

    const line = stripMarkdown(rawLine.replace(BULLET_PREFIX, ""));
    if (!line) continue;

    const kv = KEY_VALUE.exec(line);
    if (kv) {
      if (!push(toFirstPerson(keyValueToFact(kv[1].trim(), kv[2].trim())), currentContext)) {
        skip(line, "Already in wallet or repeated in this paste");
      }
      continue;
    }

    for (const sentence of mergeContinuations(splitSentences(line))) {
      const clean = unwrapMeta(sentence);
      if (isMeta(clean)) {
        skip(sentence, "AI commentary, not a fact about you");
        continue;
      }
      if (isQuestion(clean)) {
        skip(sentence, "Question");
        continue;
      }
      if (isBareUrl(clean)) {
        skip(sentence, "Link only");
        continue;
      }
      const stripped = withoutUrls(clean);
      if (wordCount(stripped) < 3) {
        skip(sentence, "Too short to stand alone");
        continue;
      }
      if (!push(toFirstPerson(stripped), currentContext)) {
        skip(sentence, "Already in wallet or repeated in this paste");
      }
    }
  }

  return { proposals, skipped };
}
