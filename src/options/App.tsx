import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { useWalletState } from "../ui/hooks";
import { BrandMark } from "../ui/BrandMark";
import { Card, SectionTitle, Toggle } from "./components";
import { relativeTime } from "../ui/format";
import { EMBED_MSG } from "../shared/messages";
import { CATEGORY_LABELS } from "../shared/constants";
import { extractFacts, KNOW_ME_PROMPT, proposalFromRaw } from "../shared/extract";
import type { Proposal, SkippedLine } from "../shared/extract";
import type { RequestStatus } from "../shared/types";
import {
  IconBot,
  IconBrain,
  IconCheck,
  IconCopy,
  IconDashboard,
  IconExternal,
  IconFolder,
  IconInbox,
  IconShield,
  IconSliders,
  IconSparkle,
  IconX,
} from "../ui/icons";

type SectionId =
  | "overview"
  | "profiles"
  | "memories"
  | "apps"
  | "permissions"
  | "requests"
  | "settings";

const NAV: { id: SectionId; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: "overview", label: "Overview", icon: IconDashboard },
  { id: "profiles", label: "Profiles", icon: IconFolder },
  { id: "memories", label: "Memories", icon: IconBrain },
  { id: "apps", label: "AI Apps", icon: IconBot },
  { id: "permissions", label: "Permissions", icon: IconShield },
  { id: "requests", label: "Requests", icon: IconInbox },
  { id: "settings", label: "Settings", icon: IconSliders },
];

export function App() {
  const state = useWalletState();
  const [forceOnboarding, setForceOnboarding] = useState(false);
  const [section, setSection] = useState<SectionId>(() => {
    const h = window.location.hash.replace("#", "");
    return NAV.some((n) => n.id === h) ? (h as SectionId) : "overview";
  });

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (NAV.some((n) => n.id === h)) setSection(h as SectionId);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Stays open for the "You're live" step after a save, but a saved wallet
  // must never trap the user back in the wizard on the next visit.
  const [wizardSticky, setWizardSticky] = useState(false);
  const showWizard =
    !!state && (forceOnboarding || wizardSticky || !state.settings.onboardingDone);

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark size={40} className="brand-mark" />
          <div>
            <h1>Memory Wallet</h1>
            <p>Your AI memory. Your rules.</p>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${section === n.id ? "active" : ""}`}
              disabled={showWizard}
              onClick={() => {
                setSection(n.id);
                window.location.hash = n.id;
              }}
            >
              <span className="nav-icon"><n.icon size={16} /></span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">Local-only · v1.0.0</div>
      </aside>

      <main className="content">
        {!state ? (
          <p className="empty-hint">Loading…</p>
        ) : showWizard ? (
          <Onboarding
            onSaved={() => setWizardSticky(true)}
            onDone={() => {
              setForceOnboarding(false);
              setWizardSticky(false);
              setSection("overview");
            }}
          />
        ) : (
          <>
            {section === "overview" && <Overview />}
            {section === "profiles" && <Profiles />}
            {section === "memories" && <Memories onImport={() => setForceOnboarding(true)} />}
            {section === "apps" && <AIApps />}
            {section === "permissions" && <Permissions />}
            {section === "requests" && <Requests />}
            {section === "settings" && <Settings onRunSetup={() => setForceOnboarding(true)} />}
          </>
        )}
      </main>
    </div>
  );
}

function Overview() {
  const state = useWalletState();
  if (!state) return null;
  const recent = state.requests.slice(0, 6);

  return (
    <>
      <SectionTitle
        title="Overview"
        subtitle="A snapshot of your wallet. Everything is stored locally on this device."
      />
      <div className="stats">
        <Card className="stat">
          <span className="stat-value">{state.memories.length}</span>
          <span className="stat-label">Total memories</span>
        </Card>
        <Card className="stat">
          <span className="stat-value">{state.profiles.length}</span>
          <span className="stat-label">Profiles</span>
        </Card>
        <Card className="stat">
          <span className="stat-value">{state.aiApplications.length}</span>
          <span className="stat-label">Connected AI apps</span>
        </Card>
        <Card className="stat">
          <span className="stat-value">{state.requests.filter((r) => r.status === "approved").length}</span>
          <span className="stat-label">Approved requests</span>
        </Card>
      </div>

      <h2 className="sub-head">Recent access requests</h2>
      <Card>
        {recent.length === 0 ? (
          <p className="empty-hint">No access requests yet.</p>
        ) : (
          <ul className="rows">
            {recent.map((r) => {
              const app = state.aiApplications.find((a) => a.id === r.aiApplicationId);
              const profile = state.profiles.find((p) => p.id === r.profileId);
              return (
                <li key={r.id} className="row">
                  <span className="row-title">{app?.name ?? r.aiApplicationId} → {profile?.name ?? "?"}</span>
                  <span className="muted">{relativeTime(r.createdAt)}</span>
                  <StatusChip status={r.status} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

export function StatusChip({ status }: { status: RequestStatus }) {
  const map: Record<RequestStatus, { label: string; cls: string }> = {
    approved: { label: "Allowed", cls: "chip-allow" },
    denied: { label: "Denied", cls: "chip-deny" },
    pending: { label: "Pending", cls: "chip-pending" },
    cancelled: { label: "Cancelled", cls: "chip-pending" },
  };
  const meta = map[status];
  return <span className={`chip ${meta.cls}`}>{meta.label}</span>;
}

/* ------------------------------------------------------------------ */
/* First-run wizard                                                    */
/* ------------------------------------------------------------------ */

/** Fallback on-ramp when the AI hasn't stored anything yet (or refuses). */
const FALLBACK_QUESTIONS = [
  "What do you do? (job, studies, or what you spend your days on)",
  "What are you working on right now?",
  "How do you like answers — short, detailed, with examples?",
  "Anything an AI keeps getting wrong about you?",
];

function Onboarding({ onDone, onSaved }: { onDone: () => void; onSaved: () => void }) {
  const state = useWalletState();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState("");
  const [proposals, setProposals] = useState<(Proposal & { checked: boolean })[]>([]);
  const [skipped, setSkipped] = useState<SkippedLine[]>([]);
  const [showSkipped, setShowSkipped] = useState(false);
  const [reviewQuery, setReviewQuery] = useState("");
  const [resolutions, setResolutions] = useState<Record<number, "new" | "old" | "both">>({});
  const [showQuestions, setShowQuestions] = useState(false);
  const [answers, setAnswers] = useState(["", "", "", ""]);
  const [copied, setCopied] = useState(false);

  if (!state) return null;
  const current = state;
  const profileId = state.settings.activeProfileId ?? state.profiles[0]?.id ?? "";
  const profileName = state.profiles.find((p) => p.id === profileId)?.name ?? "your wallet";
  const selectedCount = proposals.filter((p, i) => {
    if (!p.checked || !p.content.trim()) return false;
    if (p.kind === "update") return (resolutions[i] ?? "new") !== "old";
    return true;
  }).length;

  async function finish(): Promise<void> {
    const { saveSettings } = await import("../shared/storage");
    await saveSettings({ onboardingDone: true });
    onDone();
  }

  async function copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(KNOW_ME_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setMsg("Couldn't copy automatically — select the prompt above and copy it.");
    }
  }

  function handleExtract(): void {
    const source = showQuestions ? answers.filter((a) => a.trim()).join("\n") : raw;
    const existing = current.memories
      .filter((m) => m.profileId === profileId)
      .map((m) => ({
        id: m.id,
        content: m.content,
        context: m.context,
        category: m.category,
        previousValues: m.previousValues,
      }));
    const found = extractFacts(source, existing);
    if (found.proposals.length === 0) {
      if (!showQuestions) {
        setShowQuestions(true);
        setMsg("Nothing to pull out of that answer — the four questions below are the fallback.");
      } else {
        setMsg("Add a little more detail to at least one answer, then try again.");
      }
      return;
    }
    setMsg("");
    setProposals(found.proposals.map((p) => ({ ...p, checked: true })));
    setResolutions({}); // unset = "Use new"; every update is still shown for review
    setSkipped(found.skipped);
    setShowSkipped(false);
    setReviewQuery("");
    setStep(1);
  }

  async function handleImportFile(file: File): Promise<void> {
    setBusy(true);
    setMsg("");
    try {
      const actions = await import("../shared/actions");
      const parsed = actions.parseMemoryJson(await file.text());
      if (parsed.length === 0) {
        setMsg("Could not find any memories in that file.");
        return;
      }
      if (!profileId) return;
      const res = await actions.importMemoriesIntoProfile(profileId, parsed, "import");
      await actions.setActiveProfile(profileId);
      setMsg(`Imported ${res.imported} memories into ${profileName}.`);
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  async function handleSample(): Promise<void> {
    setBusy(true);
    try {
      const actions = await import("../shared/actions");
      await actions.loadDemoData(); // also points the wallet at the demo profile
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  async function startEmpty(): Promise<void> {
    if (profileId) {
      const { setActiveProfile } = await import("../shared/actions");
      await setActiveProfile(profileId);
    }
    setStep(2);
  }

  async function handleSave(): Promise<void> {
    if (!profileId || selectedCount === 0) return;
    setBusy(true);
    try {
      const actions = await import("../shared/actions");
      for (const [i, p] of proposals.entries()) {
        if (!p.checked || !p.content.trim()) continue;

        if (p.kind === "update" && p.previous) {
          const choice = resolutions[i] ?? "new";
          if (choice === "old") continue;
          if (choice === "new") {
            await actions.updateMemory(p.previous.id, {
              content: p.content.trim(),
              category: p.category,
              importance: p.importance,
              context: p.context ?? p.previous.context,
              previousValues: [...(p.previous.previousValues ?? []), p.previous.content],
            });
          } else {
            // "Keep both": leave the old memory and save the new version beside it.
            await actions.addMemory({
              profileId,
              content: p.content.trim(),
              category: p.category,
              importance: p.importance,
              origin: "ai-import",
              context: p.context,
            });
          }
          continue;
        }

        await actions.addMemory({
          profileId,
          content: p.content.trim(),
          category: p.category,
          importance: p.importance,
          origin: "ai-import",
          context: p.context,
        });
      }
      // The worker may still be waking; a failed wake-up is harmless because
      // the next query re-indexes anyway, but it must not log an unhandled error.
      void chrome.runtime.sendMessage({ type: EMBED_MSG.REBUILD_INDEX }).catch(() => undefined);
      await actions.setActiveProfile(profileId);
      const { saveSettings } = await import("../shared/storage");
      await saveSettings({ onboardingDone: true });
      onSaved();
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  const updateProposals = proposals
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.kind === "update");

  const visibleProposals = proposals
    .map((p, index) => ({ ...p, index }))
    .filter((p) => {
      if (p.kind === "update") return false;
      const q = reviewQuery.trim().toLowerCase();
      if (!q) return true;
      return p.content.toLowerCase().includes(q) || (p.context ?? "").toLowerCase().includes(q);
    });
  const grouped = new Map<string, typeof visibleProposals>();
  for (const p of visibleProposals) {
    const key = p.context ?? "Other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  function toggleGroup(items: typeof visibleProposals, checked: boolean): void {
    const indexes = new Set(items.map((p) => p.index));
    setProposals((prev) => prev.map((p, i) => (indexes.has(i) ? { ...p, checked } : p)));
  }

  function addSkipped(): void {
    setProposals((prev) => [
      ...prev,
      ...skipped.map((s) => ({ ...proposalFromRaw(s.raw, s.context), checked: true })),
    ]);
    setSkipped([]);
    setShowSkipped(false);
  }

  return (
    <div className="wizard">
      <header className="wizard-head">
        <h1>Bring what your AI already knows</h1>
        <p>One paste. You check every line. Nothing is saved until you say so.</p>
      </header>

      <ol className="wizard-steps">
        {["What your AI knows", "Review", "Try it live"].map((label, i) => (
          <li key={label} className={i === step ? "current" : i < step ? "done" : ""}>
            <span className="step-num">{i < step ? <IconCheck size={11} /> : i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="stack">
          <Card>
            <h3 className="card-title"><IconSparkle size={15} className="title-icon" /> Ask your AI, then paste the answer</h3>
            <p className="muted small">
              Open ChatGPT or Claude, send it the prompt below, then paste its answer here. Or, on
              either site, click <strong>Import what ChatGPT knows</strong> next to the floating
              pill to do it in one click. Everything is extracted on this device — no upload, no account.
            </p>

            <div className="prompt-box">
              <p className="prompt-text">“{KNOW_ME_PROMPT}”</p>
              <button className="btn small" onClick={() => void copyPrompt()}>
                <IconCopy size={13} /> {copied ? "Copied" : "Copy prompt"}
              </button>
            </div>

            {!showQuestions ? (
              <>
                <textarea
                  className="paste-box"
                  rows={7}
                  placeholder="Paste what ChatGPT or Claude said about you…"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
                <div className="btn-row">
                  <button className="btn btn-primary" disabled={!raw.trim()} onClick={handleExtract}>
                    Extract memories
                  </button>
                  <button className="btn small" onClick={() => setShowQuestions(true)}>
                    No memory yet? Answer 4 quick questions
                  </button>
                </div>
              </>
            ) : (
              <div className="fallback-questions">
                <p className="muted small">
                  Answer any of these in your own words — skip what doesn't apply.
                </p>
                {FALLBACK_QUESTIONS.map((q, i) => (
                  <div className="question-block" key={q}>
                    <label className="section-label" htmlFor={`mw-q-${i}`}>{q}</label>
                    <textarea
                      id={`mw-q-${i}`}
                      rows={2}
                      value={answers[i]}
                      placeholder="A sentence or two is plenty"
                      onChange={(e) => {
                        const next = [...answers];
                        next[i] = e.target.value;
                        setAnswers(next);
                      }}
                    />
                  </div>
                ))}
                <div className="btn-row">
                  <button
                    className="btn btn-primary"
                    disabled={!answers.some((a) => a.trim())}
                    onClick={handleExtract}
                  >
                    Make memories
                  </button>
                  <button className="btn small" onClick={() => { setShowQuestions(false); setMsg(""); }}>
                    Back to paste
                  </button>
                </div>
              </div>
            )}
            {msg && <p className="muted small">{msg}</p>}
          </Card>

          <details className="advanced-disclosure">
            <summary className="muted small">Advanced — import JSON or load samples</summary>
            <div className="stack">
              <div className="wizard-option">
                <div className="wizard-option-head"><strong>Import memory JSON</strong></div>
                <p className="muted small">
                  Already have a <code>memories.json</code> from a data export? Choose it here.
                </p>
                <label className="btn file-btn">
                  {busy ? "Importing…" : "Choose file"}
                  <input
                    type="file"
                    accept=".json,application/json,.txt"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setFileName(f.name);
                        void handleImportFile(f);
                      }
                    }}
                  />
                </label>
                {fileName && <p className="muted small">Selected: {fileName}</p>}
              </div>
              <div className="wizard-option">
                <div className="wizard-option-head"><strong>Load sample data</strong></div>
                <p className="muted small">Clearly-marked demo memories, so you can try the flow first.</p>
                <button className="btn" disabled={busy} onClick={() => void handleSample()}>
                  Load sample data
                </button>
              </div>
              <button className="btn small" onClick={() => void startEmpty()}>
                Skip and start empty
              </button>
            </div>
          </details>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <Card>
            <div className="wizard-option-head">
              <h3 className="card-title">Review before saving</h3>
              <span className="pill">Saving {selectedCount} of {proposals.length}</span>
            </div>
            <p className="review-warning">
              <IconShield size={14} /> ChatGPT may have guessed. Check each line before saving.
            </p>
            {updateProposals.length > 0 && (
              <div className="update-section">
                <div className="update-section-head">
                  <strong>{updateProposals.length} possible update{updateProposals.length === 1 ? "" : "s"}</strong>
                  <span className="muted small">The AI said something different about an existing memory. You decide.</span>
                </div>
                {updateProposals.map((p) => {
                  const choice = resolutions[p.index] ?? "new";
                  return (
                    <div key={p.index} className="update-row">
                      <div className="update-row-title">{p.context ?? "Existing memory"}</div>
                      <div className="update-old">Was: {p.previous?.content}</div>
                      <label className="update-new-label">
                        Now:
                        <input
                          className="update-new"
                          value={p.content}
                          aria-label="Updated memory text"
                          onChange={(e) =>
                            setProposals((prev) =>
                              prev.map((x, i) => (i === p.index ? { ...x, content: e.target.value } : x)),
                            )
                          }
                        />
                      </label>
                      <div className="update-choices">
                        {(["old", "new", "both"] as const).map((option) => (
                          <button
                            key={option}
                            className={`btn small ${choice === option ? "btn-primary" : ""}`}
                            onClick={() => setResolutions((prev) => ({ ...prev, [p.index]: option }))}
                          >
                            {option === "old" ? "Keep old" : option === "new" ? "Use new" : "Keep both"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <input
              className="review-search"
              placeholder="Search memories or sections…"
              value={reviewQuery}
              onChange={(e) => setReviewQuery(e.target.value)}
            />
            <div className="review-groups">
              {[...grouped.entries()].map(([section, items]) => {
                const allChecked = items.every((p) => p.checked);
                return (
                  <section key={section} className="review-group">
                    <div className="review-group-head">
                      <strong>{section}</strong>
                      <span className="muted small">{items.length} facts</span>
                      <button className="btn small" onClick={() => toggleGroup(items, !allChecked)}>
                        {allChecked ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <ul className="review-list">
                      {items.map((p) => (
                        <li key={p.index} className={`review-row ${p.checked ? "" : "unchecked"}`}>
                          <input
                            type="checkbox"
                            checked={p.checked}
                            aria-label={`Save: ${p.content}`}
                            onChange={(e) =>
                              setProposals((prev) =>
                                prev.map((x, i) =>
                                  i === p.index ? { ...x, checked: e.target.checked } : x,
                                ),
                              )
                            }
                          />
                          <input
                            className="review-text"
                            value={p.content}
                            aria-label="Memory text"
                            onChange={(e) =>
                              setProposals((prev) =>
                                prev.map((x, i) =>
                                  i === p.index ? { ...x, content: e.target.value } : x,
                                ),
                              )
                            }
                          />
                          <span className="chip chip-pending">{CATEGORY_LABELS[p.category]}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>

            {skipped.length > 0 && (
              <div className="skipped-panel">
                <button
                  className="btn small"
                  onClick={() => setShowSkipped((v) => !v)}
                  aria-expanded={showSkipped}
                >
                  {showSkipped ? "Hide" : "Show"} {skipped.length} skipped line
                  {skipped.length === 1 ? "" : "s"}
                </button>
                {showSkipped && (
                  <>
                    <ul className="skipped-list">
                      {skipped.map((s, i) => (
                        <li key={i}>
                          <span>{s.raw}</span>
                          <em>{s.reason}</em>
                        </li>
                      ))}
                    </ul>
                    <button className="btn small" onClick={addSkipped}>
                      Add these too
                    </button>
                  </>
                )}
              </div>
            )}

            <p className="muted small">
              Saved to “{profileName}”. You can edit or delete any of these later in Memories.
            </p>
          </Card>
          <div className="btn-row">
            <button className="btn" onClick={() => setStep(0)}>Back</button>
            <button
              className="btn btn-primary"
              disabled={busy || selectedCount === 0}
              onClick={() => void handleSave()}
            >
              {busy ? "Saving…" : `Save ${selectedCount} memories`}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <Card>
          <h3 className="card-title"><IconSparkle size={15} className="title-icon" /> You're live</h3>
          <ol className="wizard-try">
            <li>Open ChatGPT (or Claude) and start a new chat.</li>
            <li>
              Ask something your memories can answer — e.g.{" "}
              <em>"What architecture should I use for my library chatbot?"</em>
            </li>
            <li>Your message pauses and a Memory Request card appears. Pick Once → Allow.</li>
            <li>The context block + your question are sent together — the answer uses your memory.</li>
          </ol>
          {msg && <p className="muted small">{msg}</p>}
          <div className="btn-row">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button
              className="btn btn-primary"
              onClick={() => chrome.tabs.create({ url: "https://chatgpt.com" })}
            >
              Open ChatGPT <IconExternal size={14} />
            </button>
            <button className="btn" onClick={() => void finish()}>
              Finish
            </button>
          </div>
        </Card>
      )}

      <footer className="wizard-footer">
        <button className="btn small" onClick={() => void finish()}>
          Skip setup
        </button>
      </footer>
    </div>
  );
}

function Profiles() {
  return (
    <>
      <SectionTitle
        title="Profiles"
        subtitle="Profiles are context boundaries. AI apps only ever see the profile they are granted."
      />
      <ProfilesSection />
    </>
  );
}

function ProfilesSection() {
  const state = useWalletState();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [selected, setSelected] = useState<string | null>(null);

  if (!state) return null;
  const selProfile = state.profiles.find((p) => p.id === selected);

  async function handleCreate() {
    if (!name.trim()) return;
    const { createProfile } = await import("../shared/actions");
    await createProfile(name, undefined, icon);
    setName("");
    setIcon("📁");
  }

  return (
    <div className="grid-two">
      <div className="stack">
        <Card>
          <h3 className="card-title">New profile</h3>
          <div className="form-row">
              <input
                placeholder="Icon (emoji)"
                value={icon}
                maxLength={4}
                onChange={(e) => setIcon(e.target.value)}
                className="input-icon"
              />
            <input
              placeholder="Profile name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            />
            <button className="btn btn-primary" onClick={() => void handleCreate()}>
              Create
            </button>
          </div>
        </Card>

        {state.profiles.map((p) => {
          const count = state.memories.filter((m) => m.profileId === p.id).length;
          const isActive = p.id === state.settings.activeProfileId;
          return (
            <Card key={p.id} className={isActive ? "card-accent" : ""}>
              <div className="profile-card-head">
                <span className="profile-big">{p.icon}</span>
                <div className="grow">
                  <strong>{p.name}</strong>
                  {isActive && <span className="pill">Active</span>}
                  <div className="muted small">{count} memories</div>
                </div>
              </div>
              {p.description && <p className="muted small desc">{p.description}</p>}
              <div className="btn-row">
                <button className="btn small" onClick={() => setSelected(p.id)}>View</button>
                <button
                  className="btn small"
                  onClick={() => {
                    const newName = window.prompt("Rename profile", p.name);
                    if (newName?.trim()) {
                      void import("../shared/actions").then((a) =>
                        a.updateProfile(p.id, { name: newName.trim(), icon: p.icon }),
                      );
                    }
                  }}
                >
                  Rename
                </button>
                <button
                  className="btn small danger"
                  onClick={() => {
                    if (window.confirm(`Delete "${p.name}" and all of its memories?`)) {
                      void import("../shared/actions").then((a) => a.deleteProfile(p.id));
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="stack">
        {selProfile ? (
          <Card>
            <h3 className="card-title">
              {selProfile.icon} {selProfile.name} — recent memories
            </h3>
            <ul className="rows">
              {state.memories
                .filter((m) => m.profileId === selProfile.id)
                .slice(0, 8)
                .map((m) => (
                  <li key={m.id} className="row">
                    <span className="row-title">{m.content}</span>
                    <span className="muted small">{m.category}</span>
                  </li>
                ))}
              {state.memories.filter((m) => m.profileId === selProfile.id).length === 0 && (
                <li className="empty-hint">No memories in this profile yet.</li>
              )}
            </ul>
            <p className="muted small">Permissions:</p>
            <ul className="rows">
              {state.aiApplications.map((app) => {
                const perm = state.permissions.find(
                  (x) => x.profileId === selProfile.id && x.aiApplicationId === app.id,
                );
                return (
                  <li key={app.id} className="row">
                    <span>{app.name}</span>
                    <span className="muted small">{perm ? perm.access.toUpperCase() : "ASK (default)"}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card><p className="empty-hint">Select a profile to view details.</p></Card>
        )}
      </div>
    </div>
  );
}

function Memories({ onImport }: { onImport: () => void }) {
  return (
    <>
      <SectionTitle
        title="Memories"
        subtitle="Add facts about yourself manually, or re-import and update what your AI already knows. Memories never leave this device unless you approve a request."
      />
      <div className="btn-row">
        <button className="btn btn-primary" onClick={onImport}>
          Import or update from ChatGPT
        </button>
      </div>
      <MemoriesSection />
    </>
  );
}

function MemoriesSection() {
  const state = useWalletState();
  const [profileId, setProfileId] = useState("");
  const [category, setCategory] = useState("project");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(0.8);
  const [filterProfile, setFilterProfile] = useState("all");
  const [importTarget, setImportTarget] = useState("");
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");

  if (!state) return null;

  const effectiveProfileId = profileId || state.profiles[0]?.id || "";
  const shown = state.memories
    .filter((m) => filterProfile === "all" || m.profileId === filterProfile)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function handleSave() {
    if (!effectiveProfileId || !content.trim()) return;
    const actions = await import("../shared/actions");
    await actions.addMemory({
      profileId: effectiveProfileId,
      content,
      category: category as never,
      importance,
    });
    setContent("");
  }

  async function handleImport() {
    if (!importTarget) {
      setImportMsg("Pick a target profile first.");
      return;
    }
    let raw = importText.trim();
    // If a file was chosen, its content is already loaded into importText.
    if (!raw) {
      setImportMsg("Choose a .json file or paste JSON first.");
      return;
    }
    const actions = await import("../shared/actions");
    const parsed = actions.parseMemoryJson(raw);
    if (parsed.length === 0) {
      setImportMsg("Could not find any memories in that JSON.");
      return;
    }
    const result = await actions.importMemoriesIntoProfile(importTarget, parsed);
    setImportMsg(
      `Imported ${result.imported} of ${result.total} memories (${result.duplicates} already existed).`,
    );
    setImportText("");
    const fileInput = document.getElementById("mw-import-file") as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
  }

  return (
    <div className="grid-two">
      <Card>
        <h3 className="card-title">Add Memory</h3>
        <label className="field">
          Profile
          <select value={effectiveProfileId} onChange={(e) => setProfileId(e.target.value)}>
            {state.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {["identity","preference","project","technical","work","personal","goal","other"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Memory
          <textarea
            rows={4}
            placeholder="I am building an AI Memory Wallet."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
        <label className="field">
          Importance: <strong>{importance.toFixed(1)}</strong>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={importance}
            onChange={(e) => setImportance(parseFloat(e.target.value))}
          />
        </label>
        <button className="btn btn-primary" onClick={() => void handleSave()} disabled={!effectiveProfileId}>
          Save Memory
        </button>

        <h3 className="card-title card-title-spaced">
          Import ChatGPT memory JSON
        </h3>
        <p className="muted small">
          Works with the memory list from ChatGPT Settings → Personalization → Memory → Manage, or a
          data-export <code>memories.json</code>. Memories stay on this device.
        </p>
        <label className="field">
          Target profile
          <select value={importTarget} onChange={(e) => setImportTarget(e.target.value)}>
            <option value="">Select profile…</option>
            {state.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          JSON file
          <input
            id="mw-import-file"
            type="file"
            accept=".json,application/json,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void file.text().then((t) => setImportText(t));
            }}
          />
        </label>
        <label className="field">
          …or paste JSON
          <textarea
            rows={3}
            placeholder='["Prefers concise answers", {"content": "Lives in Berlin"}]'
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
        </label>
        <div className="btn-row btn-row-flush">
          <button className="btn btn-primary" onClick={() => void handleImport()}>
            Import
          </button>
          {importMsg && <span className="muted small">{importMsg}</span>}
        </div>
      </Card>

      <Card>
        <div className="form-row form-row-compact">
          <select value={filterProfile} onChange={(e) => setFilterProfile(e.target.value)}>
            <option value="all">All profiles</option>
            {state.profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
            ))}
          </select>
          <span className="muted small">{shown.length} memories</span>
        </div>
        <ul className="rows">
          {shown.map((m) => {
            const p = state.profiles.find((x) => x.id === m.profileId);
            return (
              <li key={m.id} className="row memory-row">
                <div className="memory-main">
                  <span>{m.content}</span>
                  <span className="muted small">
                    {p?.icon} {p?.name} · {m.category} · importance {m.importance.toFixed(1)}
                  </span>
                </div>
                <button
                  className="btn small danger icon-btn"
                  aria-label="Delete memory"
                  onClick={() => {
                    if (!window.confirm(`Delete this memory?\n\n${m.content}`)) return;
                    void import("../shared/actions").then((a) => a.deleteMemory(m.id));
                  }}
                >
                  <IconX size={12} />
                </button>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="empty-hint">
              No memories yet. Ask ChatGPT “what do you know about me?”, paste its answer in Setup,
              or run Setup again from Settings.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function AIApps() {
  return (
    <>
      <SectionTitle
        title="AI Apps"
        subtitle="Applications that can request context from your wallet. New providers can be added via provider adapters."
      />
      <AIAppsSection />
    </>
  );
}

function AIAppsSection() {
  const state = useWalletState();
  if (!state) return null;
  return (
    <div className="cards-grid">
      {state.aiApplications.map((app) => (
        <Card key={app.id}>
          <div className="profile-card-head">
            <span className={`app-dot ${app.id}`}>{app.id === "claude" ? "C" : app.id === "chatgpt" ? "G" : <IconBot size={15} />}</span>
            <div className="grow">
              <strong>{app.name}</strong>
              <div className="muted small">{app.domain}</div>
            </div>
            <span className="pill pill-green">Connected</span>
          </div>
          <p className="muted small">
            Permission default:{" "}
            {(() => {
              const anyPerm = state.permissions.some(
                (p) => p.aiApplicationId === app.id && p.access !== "ask",
              );
              return anyPerm ? "per-profile (see Permissions)" : "Ask on every request";
            })()}
          </p>
        </Card>
      ))}
    </div>
  );
}

function Permissions() {
  return (
    <>
      <SectionTitle
        title="Permissions"
        subtitle="Control which AI application may access which profile, and under what conditions."
      />
      <PermissionsSection />
    </>
  );
}

function PermissionsSection() {
  const state = useWalletState();
  if (!state) return null;

  async function setPerm(appId: string, profileId: string, access: string) {
    const { setAccessLevel } = await import("../shared/permissions");
    await setAccessLevel(appId, profileId, access as never);
  }

  return (
    <Card>
      <table className="perm-table">
        <thead>
          <tr>
            <th>AI App</th>
            {state.profiles.map((p) => (
              <th key={p.id}>{p.icon} {p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.aiApplications.map((app) => (
            <tr key={app.id}>
              <td><strong>{app.name}</strong></td>
              {state.profiles.map((p) => {
                const perm = state.permissions.find(
                  (x) => x.aiApplicationId === app.id && x.profileId === p.id,
                );
                const current = perm?.access ?? "ask";
                return (
                  <td key={p.id}>
                    <select
                      value={current}
                      onChange={(e) => void setPerm(app.id, p.id, e.target.value)}
                    >
                      <option value="ask">Ask</option>
                      <option value="allow">Allow</option>
                      <option value="deny">Deny</option>
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Ask → show permission modal · Allow → share relevant memories automatically · Deny → never
        share from that profile.
      </p>
    </Card>
  );
}

function Requests() {
  const state = useWalletState();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  if (!state) return null;
  const sorted = state.requests.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function handleCopy(req: (typeof sorted)[number]) {
    const matched = state!.memories.filter((m) => req.matchedMemoryIds?.includes(m.id));
    if (matched.length === 0) return;
    const profile = state!.profiles.find((p) => p.id === req.profileId);
    const block = `[Memory Wallet Context]\nProfile: ${profile?.name ?? "Unknown"}\n${matched.map((m) => `- ${m.content}`).join("\n")}\n[End Memory Wallet Context]`;
    try {
      await navigator.clipboard.writeText(block);
      setCopied(req.id);
      setTimeout(() => setCopied((cur) => (cur === req.id ? null : cur)), 2000);
    } catch {
      // clipboard blocked
    }
  }

  return (
    <>
      <SectionTitle
        title="Requests"
        subtitle="Full audit log of every memory access request. Memory content itself is never logged — only IDs."
      />
      <Card>
        {sorted.length === 0 ? (
          <p className="empty-hint">No requests logged yet.</p>
        ) : (
          <ul className="rows">
            {sorted.map((r) => {
              const app = state.aiApplications.find((a) => a.id === r.aiApplicationId);
              const profile = state.profiles.find((p) => p.id === r.profileId);
              const matched = state.memories.filter((m) => r.matchedMemoryIds?.includes(m.id));
              const isExpanded = expanded === r.id;
              return (
                <li
                  key={r.id}
                  className="row request-log-row request-detail-block"
                >
                  <div className="request-detail-top">
                    <div className="memory-main">
                      <span>
                        <strong>{app?.name ?? r.aiApplicationId}</strong> requested{" "}
                        <strong>{profile?.name ?? "?"}</strong>
                        {r.duration ? ` (${r.duration})` : ""}
                      </span>
                      <span className="muted small query-preview">"{r.query.slice(0, 120)}"</span>
                    </div>
                    <span className="muted small query-truncated">
                      {relativeTime(r.createdAt)}
                    </span>
                    <StatusChip status={r.status} />
                  </div>
                  <div className="request-detail-actions">
                    <button className="btn small" onClick={() => setExpanded(isExpanded ? null : r.id)}>
                      {isExpanded ? "Hide" : "View"}
                    </button>
                    {matched.length > 0 && (
                      <button className="btn small" onClick={() => void handleCopy(r)}>
                        {copied === r.id ? "Copied!" : `Copy context (${matched.length})`}
                      </button>
                    )}
                    <span className="muted small muted-right">
                      {r.requestedCategories?.length ? r.requestedCategories.join(", ") : ""}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="expanded-content">
                      <div>
                        <strong>Full query:</strong> <span className="muted">"{r.query}"</span>
                      </div>
                      <div>
                        <strong>Reason:</strong> <span className="muted">{r.reason}</span>
                      </div>
                      <div>
                        <strong>Requested categories:</strong>{" "}
                        <span className="muted">{r.requestedCategories?.join(", ") || "\u2014"}</span>
                      </div>
                      {matched.length > 0 ? (
                        <div className="memory-section">
                          <strong>Shared memories ({matched.length}):</strong>
                          <ul className="memory-list">
                            {matched.map((m) => (
                              <li key={m.id}>
                                {m.content} <span className="muted small">· {m.category}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="muted small memory-section">
                          No memories were shared for this request.
                        </div>
                      )}
                      <div className="muted small memory-section">
                        ID: {r.id} · {new Date(r.createdAt).toLocaleString()}
                        {r.resolvedAt ? ` → ${new Date(r.resolvedAt).toLocaleString()}` : ""}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

interface EmbedStatus {
  state?: "idle" | "indexing" | "ready" | "error";
  indexed?: number;
  total?: number;
  error?: string;
}

function SemanticSearchCard(props: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [status, setStatus] = useState<EmbedStatus | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let mounted = true;
    const read = () => {
      void chrome.storage.local.get("mw_embed_status").then((res) => {
        if (mounted) setStatus(res["mw_embed_status"] ?? { state: "idle" });
      });
    };
    read();
    chrome.storage.onChanged.addListener(read);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(read);
    };
  }, []);

  const s = status ?? { state: "idle" as const };
  const stateLabel =
    s.state === "indexing"
      ? `Indexing memories… ${s.indexed ?? 0}/${s.total ?? 0}`
      : s.state === "ready"
        ? `Ready — ${s.indexed ?? 0} of ${s.total ?? 0} memories indexed`
        : s.state === "error"
          ? `Unavailable — retries automatically${s.error ? ` (${s.error})` : ""}`
          : "Idle — will prepare on next use";

  return (
    <Card>
      <h3 className="card-title">Semantic search</h3>
      <p className="muted small">
        Matches memories by meaning, not just keywords, using a small AI model that runs entirely
        on this device. The model ships inside the extension — nothing is downloaded at runtime
        and no data leaves your machine. When unavailable, the wallet falls back to keyword matching.
      </p>
      <div className="setting-row">
        <div>
          <strong>Enable semantic matching</strong>
          <p className="muted small">Status: {stateLabel}</p>
        </div>
        <Toggle checked={props.enabled} onChange={props.onToggle} />
      </div>
      <div className="btn-row">
        <button
          className="btn small"
          onClick={() => {
            setMsg("Rebuilding index…");
            void chrome.runtime.sendMessage({ type: EMBED_MSG.REBUILD_INDEX });
          }}
        >
          Rebuild index
        </button>
        <button
          className="btn small"
          onClick={() => {
            setMsg("Resetting model…");
            void chrome.runtime.sendMessage({ type: EMBED_MSG.CLEAR_MODEL_CACHE });
          }}
        >
          Reset model
        </button>
        {msg && <span className="muted small">{msg}</span>}
      </div>
    </Card>
  );
}

function Settings({ onRunSetup }: { onRunSetup: () => void }) {
  const state = useWalletState();
  const [demoMsg, setDemoMsg] = useState("");
  if (!state) return null;
  const s = state.settings;

  return (
    <>
      <SectionTitle title="Settings" subtitle="All data stays on this device in chrome.storage.local. No backend." />
      <div className="stack">
        <Card>
          <div className="muted small section-label">Sharing</div>
          <div className="setting-row">
            <div>
              <strong>Ask for memory before my message is sent</strong>
              <p className="muted small">
                Pauses your message when you hit Enter, shows the permission card first, then sends
                context + question together. Turn off to let messages send immediately and share
                memory afterwards.
              </p>
            </div>
            <Toggle
              checked={s.pauseBeforeShare !== false}
              onChange={(v) =>
                void import("../shared/storage").then((st) => st.saveSettings({ pauseBeforeShare: v }))
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Always ask before sharing memory</strong>
              <p className="muted small">
                After your first Allow, later messages share silently. Turn this on to require the
                permission card every time. An enterprise policy can force this on.
              </p>
            </div>
            <Toggle
              checked={s.requireApproval === true}
              onChange={(v) =>
                void import("../shared/storage").then((st) => st.saveSettings({ requireApproval: v }))
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Automatically send context with your question</strong>
              <p className="muted small">
                When approved, the context block and your question are submitted together. Turn off to
                review before sending.
              </p>
            </div>
            <Toggle
              checked={s.autoSendContext}
              onChange={(v) =>
                void import("../shared/storage").then((st) => st.saveSettings({ autoSendContext: v }))
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>When nothing matches, share top general memories</strong>
              <p className="muted small">
                If keyword matching finds no direct match, fill the request with your profile's
                strongest context (education, work, projects). The card preview always shows exactly
                what will be shared.
              </p>
            </div>
            <Toggle
              checked={s.allowGeneralFallback !== false}
              onChange={(v) =>
                void import("../shared/storage").then((st) => st.saveSettings({ allowGeneralFallback: v }))
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Max memories per request</strong>
              <p className="muted small">How many top-matched memories to include (3–5).</p>
            </div>
            <select
              value={s.maxMemoriesPerRequest}
              onChange={(e) =>
                void import("../shared/storage").then((st) =>
                  st.saveSettings({ maxMemoriesPerRequest: parseInt(e.target.value, 10) }),
                )
              }
            >
              {[3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </Card>

        <Card>
          <div className="muted small section-label">Appearance & privacy</div>
          <div className="setting-row">
            <div>
              <strong>Show wallet button on AI sites</strong>
              <p className="muted small">
                A small pill on ChatGPT/Claude that re-triggers context sharing for your last question.
              </p>
            </div>
            <Toggle
              checked={s.showToolbarButton}
              onChange={(v) =>
                void import("../shared/storage").then((st) => st.saveSettings({ showToolbarButton: v }))
              }
            />
          </div>
          <div className="setting-row setting-row-muted">
            <div>
              <strong>Local-only mode</strong>
              <p className="muted small">Your memory stays on this device. No backend, no analytics.</p>
            </div>
            <Toggle checked disabled />
          </div>
        </Card>

        <SemanticSearchCard
          enabled={s.semanticSearch !== false}
          onToggle={(v) =>
            void import("../shared/storage").then((st) => st.saveSettings({ semanticSearch: v }))
          }
        />

        <Card>
          <h3 className="card-title">Your data</h3>
          <p className="muted small">
            Everything lives in this browser profile. Export gives you a single JSON file with every
            memory, profile, permission and the request log — no account, no upload.
          </p>
          <div className="btn-row">
            <button
              className="btn"
              onClick={() => {
                void (async () => {
                  const { exportAllData } = await import("../shared/actions");
                  const json = await exportAllData();
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `memory-wallet-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                })();
              }}
            >
              Export all data
            </button>
            <button
              className="btn"
              onClick={() => {
                void (async () => {
                  const { clearDemoData } = await import("../shared/actions");
                  const res = await clearDemoData();
                  setDemoMsg(
                    res.memories === 0 && res.profiles === 0
                      ? "No sample data found — nothing to clear."
                      : `Removed ${res.memories} sample memories and ${res.profiles} sample profiles.`,
                  );
                })();
              }}
            >
              Clear demo data
            </button>
          </div>
          {demoMsg && <p className="muted small">{demoMsg}</p>}
        </Card>

        <Card>
          <h3 className="card-title">Sample data</h3>
          {state.memories.length === 0 ? (
            <>
              <p className="muted small">
                Loads clearly-marked Startup / Work / Personal demo profiles with sample memories and
                sets Startup as the active profile. Only offered while the wallet is empty.
              </p>
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  onClick={() => void import("../shared/actions").then((a) => a.loadDemoData())}
                >
                  Load sample data
                </button>
              </div>
            </>
          ) : (
            <p className="muted small">
              Sample data is only offered while the wallet is empty, so demo memories can never mix
              with real ones. Factory reset clears everything if you want it back.
            </p>
          )}
          <div className="btn-row">
            <button className="btn" onClick={onRunSetup} title="Reopens the first-run wizard; your data is untouched">
              Run setup again
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (window.confirm("Erase ALL profiles, memories, permissions and settings?")) {
                  void import("../shared/actions").then((a) => a.factoryReset());
                }
              }}
            >
              Factory reset
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}


