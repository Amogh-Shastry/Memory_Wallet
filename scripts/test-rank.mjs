/**
 * Zero-framework tests for phrase/anchor-aware retrieval scoring.
 * Bundles the pure rank.ts module — no chrome.* stub needed.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/shared/rank.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "node18",
  logLevel: "silent",
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const { analyzeQuery, buildDf, scoreMatch, isCompoundFalseFriend } = mod;

const docs = [
  { id: "colour", content: "My brand background colour is #0B0C13.", category: "identity", importance: 0.8 },
  { id: "ai", content: "I have experience with artificial intelligence and machine learning.", category: "technical", importance: 0.7 },
  { id: "python", content: "I have 7+ years of hands-on Python experience.", category: "technical", importance: 0.8 },
  { id: "cgpa", content: "My CGPA was 7.6.", category: "identity", importance: 0.8 },
  { id: "react", content: "My chatbot frontend uses React and TypeScript.", category: "technical", importance: 0.7 },
  { id: "season", content: "I enjoy the spring season.", category: "personal", importance: 0.5 },
  { id: "framework", content: "I build services with Spring Boot.", category: "technical", importance: 0.7 },
];
const df = buildDf(docs);

function rank(query) {
  const signals = analyzeQuery(query);
  return docs
    .map((doc) => ({ id: doc.id, ...scoreMatch(doc, signals, df, docs.length, []) }))
    .filter((m) => m.qualified)
    .sort((a, b) => b.score - a.score);
}

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

check("ambiguous single word is not evidence on its own", () => {
  const hits = rank("Tell me about my background");
  assert.equal(hits.some((h) => h.id === "colour"), false);
});

check("a phrase about AI beats the literal word 'background'", () => {
  const hits = rank("I'm a recruiter — what is my background in artificial intelligence?");
  assert.equal(hits.some((h) => h.id === "colour"), false);
  assert.ok(hits.some((h) => h.id === "ai"));
});

check("acronym anchor still matches a one-word query", () => {
  const hits = rank("What's my CGPA?");
  assert.equal(hits[0]?.id, "cgpa");
});

check("proper noun anchor matches React", () => {
  const hits = rank("What projects have I built with React?");
  assert.ok(hits.some((h) => h.id === "react"));
});

check("ambiguous proper noun resolves via a second anchor", () => {
  const hits = rank("I use Spring Boot at work");
  assert.ok(hits.some((h) => h.id === "framework"));
  assert.equal(hits.some((h) => h.id === "season"), false);
});

check("a lowercase ambiguous word alone is ignored", () => {
  const hits = rank("I like spring");
  assert.equal(hits.some((h) => h.id === "season"), false);
});

check("category hint alone cannot rescue a weak match", () => {
  const signals = analyzeQuery("background");
  const result = scoreMatch(docs[0], signals, df, docs.length, ["identity"]);
  assert.equal(result.qualified, false);
});

check("two distinct weak words do qualify", () => {
  const hits = rank("brand colour");
  assert.ok(hits.some((h) => h.id === "colour"));
});

check("section context is searchable, not just display metadata", () => {
  const sectioned = [
    { id: "outreach", content: "I organised a guest lecture.", category: "work", importance: 0.7, context: "Recent Faculty Outreach" },
    { id: "other", content: "I have experience with data analysis.", category: "technical", importance: 0.7 },
  ];
  const sectionDf = buildDf(sectioned);
  const signals = analyzeQuery("What faculty outreach have I done?");
  const scores = sectioned.map((d) => ({ id: d.id, ...scoreMatch(d, signals, sectionDf, sectioned.length, []) }));
  assert.equal(scores.find((s) => s.id === "outreach").qualified, true);
  assert.ok(scores.find((s) => s.id === "outreach").score > scores.find((s) => s.id === "other").score);
});

check("actual experience outranks merely explored topics", () => {
  const experience = [
    { id: "did", content: "I worked as an SDE Intern at Kodnest.", category: "work", importance: 0.7 },
    { id: "considered", content: "I explored embedded systems internships.", category: "work", importance: 0.7 },
  ];
  const expDf = buildDf(experience);
  const signals = analyzeQuery("What internships have I had?");
  // retrieval expands QUERY_SYNONYMS (internship -> intern, work, experience).
  signals.tokens.push("intern", "work", "experience");
  const scores = experience.map((d) => ({ id: d.id, ...scoreMatch(d, signals, expDf, experience.length, []) }));
  assert.ok(scores.find((s) => s.id === "did").score > scores.find((s) => s.id === "considered").score);
});

check("compound-word false friends are flagged, real inflections are not", () => {
  const query = analyzeQuery("What languages do I speak?").tokens;
  assert.equal(isCompoundFalseFriend(query, "I work with LangChain."), true);
  assert.equal(isCompoundFalseFriend(query, "I work with working systems."), false);
});

console.log(`\n[rank] OK — ${passed} checks passed\n`);
