# Memory Wallet — Launch Kit (v1.0)

> Audience: mainstream ChatGPT/Claude users. Tone: plain, no jargon. Trust anchor: local-only + private by design.

---

## 1. Landing page copy

### Headlines — pick one (A is the current tagline, kept as option)

**A. Your AI memory. Your rules.**
Sub: ChatGPT remembers you. Shouldn't you decide what it remembers? Memory Wallet lets you own the memory you share — AI apps ask, you approve, nothing leaves your device.

**B. Stop letting AI remember you without asking.**
Sub: Memory Wallet puts a permission gate between your memories and every AI you use. You choose the profile, you see exactly what will be shared, then you allow — or don't. 100% on-device.

**C. One wallet for everything AI knows about you.**
Sub: Work, personal, side projects — keep them separate. When ChatGPT or Claude wants context, Memory Wallet shows you the request, the reason, and the preview. One click to share. Private by design, local-only.

### Feature blocks (use real UI names/screenshots)

**1. AI asks. You decide.**
When you hit Enter, your message pauses and a Memory Request card appears — who is asking, which profile, what info, why, and a preview of the memories that will be shared. Allow shares context + question together. Deny sends your question unchanged. No surprises.

**2. Profiles are boundaries. Not folders.**
Startup ≠ Work ≠ Personal. Each profile is a separate context. Switch the active profile in the popup — the on-page pill updates live. The card even lets you tap a different profile before you allow.

**3. Nothing leaves this device. Ever. And you can check.**
No backend, no account, no analytics. Memories live in your browser's local storage. The extension's bundled JavaScript runs on your device — open `chrome://extensions` → Inspect views, or watch the Network tab while you use it. Every request is also logged in the dashboard with the exact memories that were shared.

### How it works (3 steps, matches the wizard)

1. **Set up in 30 seconds** — import your real ChatGPT memory JSON, load sample data, or start empty. Pick your active profile.
2. **Ask AI normally** — on ChatGPT or Claude, type your question and press Enter.
3. **Approve and send** — review the preview, pick Once / Session / Always, hit Allow. The AI answers with your context.

### Social proof / trust strip (pre-launch placeholder)

> Local-only by design · Works on ChatGPT & Claude · No account · No data leaves your device

After you have 5–10 beta users, replace with a single quote: *"Finally I can let ChatGPT help with LIBRO without pasting my whole background every time."*

### FAQ

**Is my data safe?**
Yes. Everything is stored in `chrome.storage.local` on your device. There is no server. If you uninstall the extension, the data is gone unless you exported it. Every request is logged in the dashboard, so you can audit exactly what was shared and when.

**Which AI apps work?**
ChatGPT (`chatgpt.com`) and Claude (`claude.ai`) today. More providers are added via one small adapter file each — Gemini is next on the list.

**What does it cost?**
Free during the beta/validation period.

**What if ChatGPT updates its site and breaks the extension?**
Detection lives in one file per provider (`src/providers/chatgpt.ts`). We ship fixes quickly, and the on-page pill lets you manually re-trigger sharing if auto-detection misses a send.

**Can I bring my existing ChatGPT memories?**
Yes. Dashboard → Memories → Import ChatGPT memory JSON. Paste the list from Settings → Personalization → Memory → Manage, or import your data-export `memories.json`. Duplicates are skipped, categories inferred.

### CTA section

**Head:** Be first to try it.
**Body:** Join the waitlist — we'll invite a small beta group as the storage layer stabilizes. No spam, one email when your invite is ready.
**Fields:** Email + one optional question (see Validation kit below)
**Button:** Join waitlist
**Microcopy below button:** Local-only · Private by design · Unsubscribe anytime.

### Meta (SEO / social)

- **Title:** Memory Wallet — Your AI memory. Your rules. (Local-first, private by design)
- **Description:** Own the memory you share with AI. Memory Wallet is a local-first browser extension where ChatGPT and Claude must ask before they access your memories. You preview, you approve, nothing leaves your device.
- **OG image suggestion:** Screenshot of the permission card on top of a blurred ChatGPT chat, with the pill visible bottom-right. No mockups.

---

## 2. Demo video — 26s, 1920×1080, silent

**Goal:** Prove the core loop in one take. No voiceover — captions do the work, and the user adds music in post.

**Delivered assets** (`dist/demo/`):
- `memory-wallet-demo.mp4` — 1920×1080, 25 fps, H.264, 26.28s, no audio stream
- `captions.srt` — sidecar captions matching the burned-in overlays
- `poster.png` — 1920×1080 poster from the real card still
- `memory-wallet-demo.gif` — short loop for the landing page

**Setup:**
- 1920×1080 recording viewport, bookmarks bar hidden, one clean ChatGPT tab, new chat.
- Personal profile active with the real `import-files/personal.json` memories. The card picks 5: name, career status, education, academic topics, leadership/extracurriculars.
- Record against the controlled ChatGPT stage (`scripts/recordLiveDemo.mjs`) so the take is deterministic. The extension and every wallet surface are real; do not screenshot during the video take.
- No baked-in captions in the recording — overlays are added in post by `scripts/editDemo.mjs`.

| Shot | What happens | On-screen caption | Duration |
|------|--------------|-------------------|----------|
| 1 | Title card. | `Memory Wallet` / `Your AI memory. Your rules.` | 3.0s |
| 2 | Type the Personal networking question and press Enter. | `Ask ChatGPT a question, just like normal.` | 4.25s |
| 3 | The send pauses; the permission card shows 5 Personal memories. Hold so the viewer can read the preview. | `The send pauses. Five Personal memories appear — nothing is sent yet.` | 4.15s |
| 4 | Click **Share & Send**. The answer streams in, mentioning Souhadra and MS Ramaiah Institute of Technology. | `Approve once. Only those five memories are shared.` → `The reply uses your context — no copy-paste, no re-explaining.` | 6.67s |
| 5 | Cut to Dashboard → Requests: the request is logged with the exact memories, decision, and timestamp. | `Every request is logged on your device, with the exact memories shared.` | 3.4s |
| 6 | End card. No CTA. | `Memory Wallet` / `Your AI memory. Your rules.` / `Local-only. Nothing leaves your device.` | 3.4s |

**Editing notes:**
- Intro and end cards are rendered at 1920×1080 with Playwright, not screen-recorded.
- Captions sit bottom-left at 72px / 150px, clear of the permission card, the “Shared 5 memories” toast, the account row, and the composer.
- Hold the settled answer for 1.4s before cutting to the audit view.
- Export H.264 with **no audio track** — the user adds music separately.
- Music suggestions: DensoMusic “Minimal Technology Corporate” or Bensound “Hopeful Ambient.” Keep it instrumental and under the visuals.

---

## 3. Launch posts

### Reddit — r/ChatGPT (or r/LocalLLaMA if you want more technical eyes)

**Title:** I built a browser extension where ChatGPT has to ask before it accesses your memories

**Body:**
I was tired of ChatGPT remembering things about me with no way to control what it actually uses.

So I built Memory Wallet — a local-first Chrome extension. When you press Enter on ChatGPT or Claude, your message pauses and a permission card appears: who is asking, which profile (Work / Personal / Startup), what info, why, and a preview of the memories that will be shared. You hit Allow and it sends context + question together. Deny sends your question unchanged.

Everything stays on your device — no backend, no account, no analytics. Every request is logged locally, so you can audit exactly what was shared.

It's v1.0 — works on ChatGPT and Claude, ~30MB local model for semantic matching, one-time download then offline.

Looking to validate if people actually want this. If you do, join the waitlist [link] — inviting a small beta as the storage layer settles. Happy to answer anything, and brutal feedback welcome.

[attach demo GIF]

### X / Twitter — 4-post thread

**1/4** ChatGPT remembers you. But you can't decide *what* it remembers.

I built Memory Wallet — a Chrome extension where AI has to ask before it accesses your memories. You preview, you approve, nothing leaves your device.

Demo:

**2/4** Hit Enter → your message pauses → a card shows who is asking, which profile, and exactly what will be shared.

Allow = context + question sent together.
Deny = your question sent unchanged.

**3/4** Profiles are boundaries. Startup ≠ Work ≠ Personal. Switch in the popup, the on-page pill updates live.

100% local. No backend. Every request is logged on your device, with the exact memories that were shared.

**4/4** It's v1.0 on ChatGPT + Claude. Trying to validate demand before I ship wider.

If you want in → [waitlist link]

What would you trust / not trust about an AI remembering you?

### One-line pitch (bio / directory / Product Hunt tagline)

**Memory Wallet — your AI memory, your rules. A local-first wallet where AI apps must ask before they access your memories.**

---

## 4. Validation kit

### Form (Tally / Formspree — 2 fields)

1. **Email** (required) — label: `Email`
2. **Optional:** `What would you trust — or not trust — about an AI remembering you?` (textarea, placeholder: `e.g., I want it to remember my project context but not my personal notes`)

Keep it to 2 fields. Every extra field halves conversions at this stage.

### Success threshold

- **Signal:** 50–100 emails from 2–3 posts = real demand. Below 20 = rethink positioning or audience.
- **Secondary signal:** reply quality on the open-ended question — look for repeated pains (e.g., "I copy-paste the same context every time").

### UTM tagging (so you know what worked)

Create one link per surface, same destination:

- `?utm_source=reddit&utm_medium=post&utm_campaign=waitlist`
- `?utm_source=x&utm_medium=thread&utm_campaign=waitlist`
- `?utm_source=landing&utm_medium=hero&utm_campaign=waitlist`

Tally shows referrer; or add a hidden field that captures `utm_source`.

### What to do with the list

- One confirmation email: "You're on the list — small beta invites as storage stabilizes. Reply with the hardest thing about AI memory for you?"
- No drip sequence yet. Wait until you have a beta build worth inviting to.

---

## Notes for you

- Record the demo *after* your new-user test pass — if the wizard or card has rough edges, patch first so the video shows a clean flow.
- Landing build is yours per your call — this file is copy only. Drop it into whatever stack you use (Framer / Webflow / plain HTML on any static host all work).
