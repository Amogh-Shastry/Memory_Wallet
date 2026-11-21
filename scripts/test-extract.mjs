/**
 * Zero-framework tests for the memory extractor.
 *
 * Bundles `src/shared/extract.ts` with esbuild (already a dev dependency) and
 * imports it as a data URL, so no test runner, ts-node, or chrome.* stub is
 * needed. Run with: node scripts/test-extract.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/shared/extract.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "node18",
  logLevel: "silent",
});
const code = bundle.outputFiles[0].text;
const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const { extractFacts, KNOW_ME_PROMPT, MAX_PROPOSALS } = mod;

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

function show(label, result) {
  console.log(`\n[${label}] ${result.proposals.length} proposal(s), ${result.skipped.length} skipped`);
  for (const f of result.proposals) {
    const ctx = f.context ? ` (${f.context})` : "";
    console.log(`  · [${f.category} ${f.importance}]${ctx} ${f.content}`);
  }
}

/* ------------------------------------------------------------------ */
/* Fixture 1 — a real-shaped ChatGPT bullet answer                     */
/* ------------------------------------------------------------------ */

const chatgpt = `Here's everything I remember about you:

- Your name is Alex.
- You're building a Chrome extension called Memory Wallet.
- You live in London and work as a software engineer.
- You prefer concise answers with bullet points.
- You're studying for a master's in machine learning.
- You have a dog named Milo.
- Based on our conversations, you care deeply about privacy.
- I don't have any information about your family.
- What would you like me to help with next?
`;

const chatgptResult = extractFacts(chatgpt, []);
show("ChatGPT bullets", chatgptResult);

check("chatgpt: keeps six real facts", () => assert.equal(chatgptResult.proposals.length, 6));
check("chatgpt: drops meta-sentences and questions", () => {
  const all = chatgptResult.proposals.map((f) => f.content).join(" | ");
  assert.doesNotMatch(all, /Based on|don't have|\?/);
  assert.ok(chatgptResult.skipped.length >= 3);
});
check("chatgpt: rewrites second person to first", () => {
  for (const f of chatgptResult.proposals) assert.match(f.content, /^(I|My)\b/);
});
check("chatgpt: name is classified identity with higher importance", () => {
  const name = chatgptResult.proposals.find((f) => f.content === "My name is Alex.");
  assert.ok(name, "expected a name fact");
  assert.equal(name.category, "identity");
  assert.equal(name.importance, 0.8);
});

/* ------------------------------------------------------------------ */
/* Fixture 2 — Claude prose (no bullets)                               */
/* ------------------------------------------------------------------ */

const claude = `Based on our past conversations, here's what I know about you. You are a designer based in Berlin who cares about typography. You work on a Chrome extension called Memory Wallet. Your favourite approach is to prototype quickly and iterate. I don't have any details about your family. You usually prefer short, direct answers with examples.`;

const claudeResult = extractFacts(claude, []);
show("Claude prose", claudeResult);

check("claude: splits prose into four facts", () => assert.equal(claudeResult.proposals.length, 4));
check("claude: framing sentences are gone", () => {
  const all = claudeResult.proposals.map((f) => f.content).join(" | ");
  assert.doesNotMatch(all, /Based on|here's what|don't have/);
});
check("claude: first fact is first-person", () => {
  assert.equal(claudeResult.proposals[0].content, "I am a designer based in Berlin who cares about typography.");
});

/* ------------------------------------------------------------------ */
/* Fixture 3 — a refusal / fresh account                               */
/* ------------------------------------------------------------------ */

const refusal = `I don't have memory enabled, so I can't tell you anything about yourself. You can check your settings if you'd like.`;
const refusalResult = extractFacts(refusal, []);
show("Refusal", refusalResult);
check("refusal: produces nothing (wizard falls back to questions)", () => {
  assert.equal(refusalResult.proposals.length, 0);
});

/* ------------------------------------------------------------------ */
/* Fixture 4 — messy paste                                             */
/* ------------------------------------------------------------------ */

const messy = `## Memory
1. **Name:** Alex
2. **Location:** London
3. **Job:** Software engineer

Everything I know:
- You're building Memory Wallet.
- You prefer concise answers.
- You're building Memory Wallet.
- https://example.com/profile
- \`console.log("hi")\`
- You use TypeScript and React.
- Based on our conversations, you like coffee.
- I remember that you told me you like coffee.
\`\`\`
function secret(){ return "not a memory"; }
\`\`\`
`;

const messyResult = extractFacts(messy, []);
show("Messy paste", messyResult);

check("messy: extracts six facts and dedupes the repeated bullet", () => {
  assert.equal(messyResult.proposals.length, 6);
  assert.equal(messyResult.proposals.filter((f) => /building Memory Wallet/.test(f.content)).length, 1);
});
check("messy: converts Key: value lines to sentences", () => {
  const all = messyResult.proposals.map((f) => f.content).join(" | ");
  assert.match(all, /My name is Alex/);
  assert.match(all, /I live in London/);
  assert.match(all, /I work as Software engineer/);
});
check("messy: drops URLs, inline code and fenced code blocks", () => {
  const all = messyResult.proposals.map((f) => f.content).join(" | ");
  assert.doesNotMatch(all, /https?:|console\.log|function secret/);
});
check("messy: dedupes against memories the wallet already has", () => {
  const withExisting = extractFacts(messy, ["I prefer concise answers."]);
  assert.equal(withExisting.proposals.length, 5);
  assert.doesNotMatch(
    withExisting.proposals.map((f) => f.content).join(" | "),
    /prefer concise/,
  );
});

/* ------------------------------------------------------------------ */
/* Fixture 5 — the real, long answer from ChatGPT (the regression)     */
/* ------------------------------------------------------------------ */

// Synthetic long answer: same structure and edge cases as a real recall dump,
// without committing anyone's personal memories to the repo.
const realAnswer = readFileSync("scripts/fixtures/long-answer.example.md", "utf8");
const realResult = extractFacts(realAnswer, []);
const realText = realResult.proposals.map((f) => f.content).join("\n");

check("real answer: extracts every bullet, not a truncated dozen", () => {
  assert.ok(realResult.proposals.length >= 100, `only got ${realResult.proposals.length}`);
  assert.ok(realResult.proposals.length < MAX_PROPOSALS);
});
check("real answer: markdown headings become context, not memories", () => {
  for (const heading of ["Personal and Education", "Technical Skills", "Memory Wallet Startup", "Recent Faculty Outreach"]) {
    assert.ok(
      realResult.proposals.some((p) => p.context === heading),
      `missing context ${heading}`,
    );
    assert.ok(!realResult.proposals.some((p) => p.content === heading), `heading leaked: ${heading}`);
  }
});
check("real answer: 'You have stated that X' is unwrapped to X", () => {
  assert.match(realText, /I have 7\+ years of hands-on Python experience\./);
  assert.match(realText, /I have 3 years of AI development experience\./);
  assert.doesNotMatch(realText, /have stated that/i);
});
check("real answer: resume-draft hedge is dropped", () => {
  assert.match(realText, /I was working at ExampleCorp from March 2025\./);
  assert.doesNotMatch(realText, /according to your resume/i);
});
check("real answer: object pronouns flip to me, not I", () => {
  assert.match(realText, /update me about contacting Uday/);
  assert.doesNotMatch(realText, /update I\b/);
});
check("real answer: quoted brand lines stay verbatim", () => {
  assert.match(realText, /"Your AI memory\. Your rules\."/);
});
check("real answer: original repo constraint survived", () => {
  assert.match(realText, /the original repository remain unmodified/);
});

/* ------------------------------------------------------------------ */
/* Fixture 6 — changed facts become reviewable updates, never silent   */
/* ------------------------------------------------------------------ */

const oldFact = {
  id: "mem_old",
  content: "I graduated in 2025.",
  context: "Personal and Education",
  category: "identity",
};

const changed = extractFacts("- You graduated in 2026.", [oldFact]);
check("update: a changed year is an update proposal with its previous memory", () => {
  assert.equal(changed.proposals.length, 1);
  assert.equal(changed.proposals[0].kind, "update");
  assert.equal(changed.proposals[0].previous.id, "mem_old");
  assert.equal(changed.proposals[0].content, "I graduated in 2026.");
});

const unchanged = extractFacts("- You graduated in 2025.", [oldFact]);
check("update: an identical fact is skipped, not duplicated", () => {
  assert.equal(unchanged.proposals.length, 0);
  assert.match(unchanged.skipped[0].reason, /Already in wallet/);
});

const place = { id: "mem_place", content: "I live in London.", context: "Personal", category: "other" };
const moved = extractFacts("### Personal\n- You live in Berlin.", [place]);
check("update: a changed value in the same section is an update", () => {
  assert.equal(moved.proposals.length, 1);
  assert.equal(moved.proposals[0].kind, "update");
});

const unrelated = extractFacts("- You enjoy science fiction.", [place]);
check("update: unrelated new facts stay new", () => {
  assert.equal(unrelated.proposals.length, 1);
  assert.equal(unrelated.proposals[0].kind, "new");
});

/* ------------------------------------------------------------------ */
/* Fixture 7 — no cap and degenerate input                             */
/* ------------------------------------------------------------------ */

const manyLines = Array.from({ length: 250 }, (_, i) => `- You like flavour number ${i}.`).join("\n");
check("no limit: no cap on proposals or total memories", () => {
  assert.equal(MAX_PROPOSALS, Number.POSITIVE_INFINITY);
  assert.equal(extractFacts(manyLines, []).proposals.length, 250);
});
check("empty input: returns nothing", () => {
  assert.deepEqual(extractFacts(""), { proposals: [], skipped: [] });
  assert.deepEqual(extractFacts("   \n  "), { proposals: [], skipped: [] });
});
check("prompt: shipped wording contains the anti-hallucination guard", () => {
  assert.match(KNOW_ME_PROMPT, /one fact per bullet/);
  assert.match(KNOW_ME_PROMPT, /Only include things I explicitly told you/);
  assert.match(KNOW_ME_PROMPT, /If you're unsure, leave it out/);
});

console.log(`\n[extract] OK — ${passed} checks passed\n`);
