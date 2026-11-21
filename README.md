# 🔐 Memory Wallet

> **Your AI memory. Your rules.**

A local-first browser extension that lets you own the memory you share with AI
applications. Profiles act as context boundaries; AI apps must *request* access, and you decide.

**How it works on ChatGPT/Claude:** when you press Enter or click Send, your message is paused,
a permission card appears instantly, and only after you ALLOW does `[Memory Wallet Context]`
+ your question go out together — so the answer is generated *with* your memory. DENY sends
your original question unchanged.

Everything is stored in `chrome.storage.local` on your device. There is no backend, no auth, no analytics, and **no outbound network request at all** — the embedding model and fonts ship inside the extension package (see [Privacy Policy](docs/PRIVACY.md)).

---

## Folder structure

```
memplug/
├── package.json               # deps: react, react-dom | dev: esbuild, typescript, @types/chrome
├── tsconfig.json
├── scripts/
│   ├── build.mjs              # esbuild bundling → dist/ (+ model + wasm copy)
│   ├── fetch-model.mjs        # downloads the hash-pinned model into models/ (gitignored)
│   ├── check-no-remote.mjs    # release gate: fails if dist/ can reach any remote resource
│   └── icons.mjs              # generates PNG icons (already run; output committed in src/assets)
├── src/
│   ├── manifest.json          # MV3 manifest (copied to dist/)
│   ├── managed-schema.json    # Chrome Enterprise policy schema (managed storage)
│   ├── assets/                # generated icons 16/48/128 + bundled fonts
│   ├── offscreen/             # hidden page that hosts the bundled embedding model
│   │   ├── offscreen.html
│   │   └── offscreen.ts       # Transformers.js — all-MiniLM-L6-v2, local files only
│   ├── shared/                # code shared by background, content, popup, options
│   │   ├── types.ts           # Profile / Memory / … + MemorySource + Settings
│   │   ├── constants.ts       # storage keys, categories, synonym map, priority
│   │   ├── storage.ts         # chrome.storage.local repos
│   │   ├── retrieval.ts       # hybrid: keyword → semantic → general fallback
│   │   ├── vectorStore.ts     # IndexedDB vector store for semantic search
│   │   ├── contextBlock.ts    # builds [Memory Wallet Context] (Matched/Semantic/General)
│   │   ├── permissions.ts     # get/set per (AI app × profile) access level
│   │   ├── actions.ts         # CRUD + nested-JSON import
│   ├── extract.ts         # pasted AI answer → reviewable memory proposals (pure)
│   ├── classify.ts        # keyword category inference (pure, no chrome.*)
│   │   ├── messages.ts        # runtime message contracts (incl. EMBED_MSG)
│   │   └── demoData.ts        # demo profiles + memories
│   ├── providers/             # AIProviderAdapter abstraction
│   │   ├── types.ts           # adapter interface
│   │   ├── chatgpt.ts
│   │   ├── claude.ts
│   │   └── registry.ts
│   ├── background/
│   │   ├── index.ts           # service worker entry
│   │   ├── orchestrator.ts    # permission resolution, request lifecycle, logging
│   │   └── embeddingService.ts# offscreen lifecycle, index upkeep, status
│   ├── content/
│   │   ├── index.ts           # wires detector + modal + injector per provider
│   │   ├── detector.ts        # send interception + bubble fallback
│   │   ├── injector.ts        # fills composer, retries, clipboard fallback
│   │   └── ui/
│   │       ├── modal.ts       # Shadow-DOM modal (profile chips, live preview)
│   │       └── toast.ts       # toasts + pill
│   ├── ui/                    # shared React hooks + formatting helpers
│   ├── popup/                 # extension popup (React)
│   └── options/               # full dashboard (React)
└── dist/                      # build output → load this folder as an unpacked extension
└── import-files/              # gitignored — your 47 LIBRO memories split by profile (npm run split-memory)
```

## Install locally (Chrome)

1. `npm install`
2. `npm run fetch:model` — one-time, needs internet. Downloads the hash-pinned
   embedding model into `models/` (gitignored, ~23 MB). The build refuses to run
   without it, because a build without the model would silently lose semantic search.
3. `npm run build`
4. Open `chrome://extensions` in Chrome.
5. Enable **Developer mode** (top-right toggle).
6. Click **Load unpacked** and select the `dist/` folder.
7. Pin "Memory Wallet" from the puzzle-piece menu.

For development with rebuild-on-save: `npm run watch`, then hit ↻ on `chrome://extensions`
after changes. Typecheck with `npm run typecheck`. Verify the model with `npm run check:model`
and the offline guarantee with `npm run build && npm run check:no-remote`.

## Run it up & check (checklist)

1. **Build**: `npm run build` (or `npm run watch` while developing).
2. **Load**: `chrome://extensions` → Developer mode ON → **Load unpacked** → select `dist/`.
   - Changed code? Click ↻ on the Memory Wallet card **and refresh AI tabs**.
3. **Sanity-check the wallet**: click the extension icon.
   - Green ● dot top-right = background service worker responding.
   - Red ○ dot = background failed; open `chrome://extensions` → Memory Wallet →
     **service worker** link → read the console error.
4. **Open chatgpt.com** (a fresh reload matters). You should see a small **🔐 ChatGPT pill**
   bottom-right — that proves the content script is alive.
5. Ask your question normally. Console (`F12`) will show
   `[Memory Wallet] question detected (N chars)` and `[Memory Wallet] query sent to wallet`.
6. The 🔐 request card appears top-right → Allow → context block fills the composer and sends.
7. No card? Click the **pill** — it re-runs sharing for your last question without needing detection.
8. Check **Requests** in the dashboard to see exactly what was logged.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| No pill visible | Content script not injected — hard-refresh the ChatGPT/Claude tab (Ctrl+F5). |
| Pill there, nothing happens on send | Check the page console for `[Memory Wallet]` lines; site markup may have changed — selectors live in `src/providers/chatgpt.ts`. |
| Red status dot in popup | Background worker crashed — open its console via `chrome://extensions`. |
| "Memory Wallet was reloaded — refresh this tab" toast | Extension was reloaded/updated; refresh the AI tab. |
| Two stacked cards / deny acted twice (pre-v0.4) | Double content-script injection; fixed via the `__memoryWalletLoaded` guard — update and reload tabs. |
| Deny/Allow loops back to a new card (pre-v0.4.1) | Our own programmatic re-send was being intercepted; fixed via the `isTrusted` event guard. |
| Card taller than the screen / Allow cut off (pre-v0.5.1) | The card now scrolls internally with Deny/Allow pinned; durations compacted to one row, previews clamp to 2 lines. |
| Semantic status shows an error | The bundled model failed to load (rare). Settings → Semantic search → **Reset model**, then **Rebuild index**; check the offscreen console. No network is involved. |
| `SyntaxError: Cannot use 'import.meta' outside a module` (pre-v0.6.1) | Offscreen script was loaded as a classic script; now loaded as a module — update and reload. |

## Website (waitlist landing)

Source in `site/src/`, built to `dist-site/` (gitignored):

- `npm run site:build` — pages + one CSS bundle (`site/src/site.css` imports the same `src/ui/tokens.css`/`animations.css`) + robots.txt/sitemap.xml + favicons (reuses `scripts/icons.mjs`'s zero-dep renderer)
- `npm run site:shots` — Playwright captures **real** UI: the permission card (fixture renders `MemoryRequestModal` from `src/content/ui/modal.ts`), popup + dashboard sections via `dist/test/ui.html`, and the 1200×630 OG image; compressed webp lands in `site/assets/shots/`
- `npm run site:check` — QA gate: banned vibecode **and** Web3 wording (sign/signature/persona/vault/ledger/crypto/…), alt text on every image, meta/canonical completeness, internal link resolution, image budgets. Fails the build on violations.

Deploy: `.github/workflows/pages.yml` builds the extension, re-captures shots, runs the gate, deploys `dist-site/` to GitHub Pages (one-time: Settings → Pages → Source: **GitHub Actions**).

Placeholders marked before launch: domain (`scripts/build-site.mjs` `SITE_URL` + canonical/OG tags), waitlist endpoint (Formspree form id in `site/src/index.html` and `site/src/site.js`), contact email, Plausible domain — all tagged `PLACEHOLDER` or `TODO(founder)`.

## Getting memories in

**Primary path — "what does my AI know about me?"** On first open (or Settings → Run setup again):

1. Copy the shipped prompt: *"List everything you remember about me as short bullet points — one fact per bullet, no commentary. Only include things I explicitly told you. If you're unsure, leave it out."*
2. Send it in ChatGPT or Claude, then paste the answer into the wizard.
3. **Review** every proposal — untick or edit any line. ChatGPT can guess, so nothing is saved until you confirm.
4. **Save**, then try it live. No JSON export, no file picker, no settings page.

If the AI has no memory yet (or refuses), the wizard offers four short questions as a fallback. JSON import still works under **Advanced** in setup and from the Memories tab; the parser accepts arrays of strings, arrays of objects (`content`/`text`/`title`/…), and wrappers like `{ "memories": [...] }`. Everything is extracted locally — nothing is uploaded.

Run `npm test` for extractor output on ChatGPT bullets, Claude prose, a refusal, a messy paste,
and a real 140-fact answer — plus consent rules and the v4 demo-cleanup migration regression.

## Manual test procedure (the 2-minute demo)

**Option A — quick demo (generic data):**
Click the Memory Wallet icon → **Load sample data** in the empty-state (or **Get started** → wizard → sample data) → Startup / Work / Personal appear; Startup becomes active.

**Option B — your real LIBRO data (47 memories):**
Dashboard → **Memories** → *Import ChatGPT memory JSON* → import `import-files/startup.json` → Startup (24), `work.json` → Work (17), `personal.json` → Personal (6). Or import `chatgpt-memories.json` whole into any profile. Regenerate splits anytime via `npm run split-memory`.

Then run the 16 steps:

1. Open Memory Wallet (extension icon → green ● = background running).
2. Confirm **🚀 Startup** profile is active (click it in the popup if not).
3. Dashboard → **Memories** → filter Startup → see your LIBRO / Memory Wallet memories (24 in Startup).
4. Open https://chatgpt.com → new chat. Type: *"I'm working on my library chatbot LIBRO — what architecture should I use?"*
5. Press **Enter** — message is paused, 🔐 **Memory Request** appears instantly: profile Startup, categories, reason, READ ONLY, **preview of 3 memories that will be shared** (e.g., `Library Chatbot › Architecture — Vectorless RAG…`), duration.
6. Choose **Always** (suggested) → **Share & Send** → composer fills with `[Memory Wallet Context]` (previewed memories) + your question and submits as ONE message. A receipt shows what was shared. Ask a second question: it shares silently, no card. Use **Stop auto-sharing** on the receipt to revoke and confirm the next question asks again.
7. **Wrong profile?** While the card is open, tap another profile chip (e.g. 💼 Work) — the "will share" list swaps instantly. Allow shares from that profile; "Always allow" then targets it.
8. **Deny test**: ask again → **Deny** (or ✕) → your exact question sends once, unchanged, no context, no lingering card.
9. **Unrelated-question test** ("Should I do Masters?"): the card shows **"No direct match — sharing N general memories from this profile"** with your education/career entries dimmed and tagged *general* → **Allow** → those flow in as a `General context:` section, so the AI can advise using your real background. **Deny** → sends once, no new card.
10. Fallback is a setting: dashboard → Settings → "When nothing matches, share top general memories" — turn it OFF to return to share-nothing behavior.
11. Switch to https://claude.ai → ask: *"How should I price and deploy LIBRO for engineering colleges?"*
12. **Claude triggers its own Memory Request** → see profile, categories, reason, previewed memories, READ ONLY, duration.
13. **Allow** → same injection flow → context appears in Claude's composer before sending.
14. Verify retrieval & audit: dashboard → **Requests** → latest entries show which profile was used; click **View** for full query/reason/shared memories; **Copy context** copies the exact block.
15. Confirm **Claude answers using that context** (mentions Vectorless RAG, Render, white-label etc. from your memories).
16. **Revoke**: dashboard → **Permissions** → set Claude × Startup to **Deny** → next Claude question sends immediately with no card (logged as Denied).

## What works

- **Designed UI (v0.8)**: shared design tokens, thin-line SVG icon set replacing UI emoji,
  consistent focus rings/hover states across popup + dashboard + on-page permission card
  (profile emoji like 🚀 stay — they're user data)
- **Visual harness**: after building, open `dist/test/ui.html` in a browser — renders the real
  dashboard and popup (`?view=popup`) against a stubbed store; no extension reload needed
- **First-run wizard**: fresh wallet opens a 3-step setup — **What your AI knows** (copy the
  prompt, paste the answer) → **Review** → **Try it live**. Review groups facts by the section
  they came from, supports search/select-all, and shows every skipped line with a reason plus
  **Add these too** — nothing is silently discarded. Four questions are the fallback when the AI
  has no memory; JSON import/sample data live under Advanced. Once memories are saved, reopening the
  dashboard never drops you back into setup. Reopenable from Memories → **Import or update from
  ChatGPT** (also Settings → "Run setup again"); data is untouched.
- **Intercept-at-send flow**: pause message → permission card → allow → context + question sent
  together; deny/timeout → original question sent unchanged (exactly once). Listeners attach in the
  window capture phase so they run before the site's own document handlers, and a suspended service
  worker is retried — a failed wake releases your question unchanged instead of stranding it.
  Abandoning a card (navigating away, closing the tab, or the 20 s watchdog) cancels the pending
  request, so the next question gets its own card instead of a silent passthrough; the request log
  records it as **Cancelled**.
- **Preview before you allow + switch profile in-card**: modal shows the top 3 memories per profile
  so you can tap a different profile chip and see what *would* be shared before deciding; Allow
  uses the selected profile; Deny is one-off
- **Standing grants + share receipts**: the first Allow suggests "Always", so the second message
  needs zero clicks. Every successful share shows a receipt (app, profile, memory count) with
  **View receipt** and **Stop auto-sharing**. Revoke anytime in Permissions, or force the card on
  with Settings → *Always ask before sharing* / policy `RequireApproval`.
- **General-context fallback**: when direct + semantic matching finds no match, requests fill with the profile's strongest memories, labeled honestly — toggleable in Settings
- **Semantic matching (on-device, bundled)**: local embeddings (Transformers.js, all-MiniLM-L6-v2, ~23 MB shipped inside the package) as Tier 2 between keyword hits and general fill — toggleable, degrades to keyword matching when unavailable; status + controls in Settings. No download, no network.
- Profiles + manual memory CRUD (create/rename/delete profile; add/edit/delete memory)
- **Plain-text "AI knows me" import** — paste any ChatGPT/Claude answer; `extract.ts` extracts
  *everything* with **no cap**, unwraps "you stated that" framing, flips second person to first,
  keeps section headings as a `context` metadata field, and infers categories. Identical facts are
  skipped; changed facts become **update proposals** shown side-by-side with the old value, where
  you choose **Keep old / Use new / Keep both** (old values are retained in `previousValues`).
  Nothing is written without review. The injected context block renders `[Section] fact` tags.
- **One-click import** — a button next to the floating pill on ChatGPT/Claude sends the same prompt
  for you with disclosure, refuses to clobber an unsent draft, waits for streaming to finish, and
  opens the same review panel. The send retries until the editor has registered the text, and reply
  detection reads `innerText` from the current assistant container (`[data-dil-response]`) so bullet
  line breaks survive into the extractor. If DOM detection fails it points you back to manual paste.
- **Import of ChatGPT memory JSON** into any profile (nested-profile flattener, dedupe,
  category inference) + pre-split `import-files/` for your 47 LIBRO memories
- **Export everything** — Settings → Export all data writes one JSON file with profiles,
  memories, permissions and the request log. No account, no upload.
- **Clear demo data** — Settings → Your data → Clear demo data removes only sample memories and
  their profiles (recorded by exact ID at seed time, plus content/origin fallbacks for old
  installs). No factory reset needed.
- **One default profile ("Me")** — new installs get a single memory bank instead of three
  empty ones. Extra profiles remain available in Advanced for anyone who wants boundaries.
- **Enterprise policy hook** — Chrome managed-storage schema (`src/managed-schema.json`) lets
  an admin require approval, cap memories per request, or disable semantic/general matching.
  Read on-device from `chrome.storage.managed`; never transmitted.
- **Offline by construction** — model and fonts are bundled; `npm run check:no-remote` fails
  the release if `dist/` contains any remote resource.
- Active-profile switching in the popup (wallet metaphor) + on-page pill shows the active profile, live
- **Popup declutter**: Open Wallet + settings only; sample data offered exclusively while the wallet
  is empty — demo memories can never mix with real ones
- Site detection + send interception for ChatGPT & Claude via provider adapters, with mutation-
  observer fallback and an on-site 🔐 pill for manual re-triggering
- Auto-injection of the content script into already-open AI tabs after install/reload
- Specific permission modal (who / which profile / what info / why / preview / READ ONLY / duration)
- ASK / ALLOW / DENY per (AI app × profile) + Once / This browser / Always grants
- Share receipt after every successful share, with revoke action
- Keyword/synonym + semantic + general hybrid scoring (`retrieveRelevantMemories`) returning top-N matches; all tiers local
- **Request audit log with View + Copy context** — expand any request to see full query, reason, shared memories and copy the exact `[Memory Wallet Context]` block
- Revoke controls, factory reset, local-only mode (always on), demo data marked as `[demo]`

## Known limitations

- **DOM selectors and send interception are fragile** — ChatGPT/Claude markup changes can break
  detection, injection or send-pausing; everything lives in one small file per provider by design.
  If interception fails (non-standard send handling), the extension falls back to after-send mode.
- Context is delivered via the visible composer (not invisible injection) — intentional and honest.
- While a memory request is open, pressing Enter again shows "still handling your previous request".
- "This browser" grants live in `chrome.storage.session` and reset when the browser closes. "Always" grants are persisted in `chrome.storage.local`. Both are revoked from the receipt or Permissions.
- Retrieval is hybrid and meaning-first: local embedding similarity outranks keyword matches, then phrase/anchor evidence (`src/shared/rank.ts`), then opt-in general fill — all on-device, fully offline. A single ambiguous word ("my background in AI" matching "background colour") is not enough evidence; bigrams, proper nouns/acronyms/numbers and rare words are. Category hints only break ties. Section headings (`context`) are embedded and searchable, so "faculty outreach" finds that whole section. Profile-summary questions ("what do you know about me?") answer from the strongest identity/work facts, and "which facts are outdated?" uses update history. Non-English queries get an honest general-context fallback because the bundled model is English-only; compound-word false friends ("languages" → "LangChain") are filtered. An empty result skips the permission card entirely instead of asking to share nothing. The model is warmed at startup so the first question does not wait for the wasm compile, and the bundled ONNX runtime includes the `asyncify` build that extension pages actually use.
- No cross-device sync, no encryption-at-rest beyond Chrome's profile storage, no Gemini.
- No limit on the number of memories or on facts per paste. Very large pastes make the review list
  long; grouping, search and per-section select-all exist to keep it usable, and individual
  memories can be deleted at any time in Dashboard → Memories.

## Three decisions to make next

1. **Context delivery mechanism** — keep visible composer injection (transparent, robust, but
   pollutes the message) vs. clipboard/overlay hand-off vs. pursuing deeper editor integration.
   This defines the product's honesty/UX trade-off.
2. **Semantic quality vs cost** — settled for v1: the 23 MB model ships in the package so the
   extension is provably offline. Next lever is tuning the semantic threshold / fusion order,
   or evaluating a larger model against the retrieval eval set.
3. **Permission granularity** — is (app × profile) the right unit, or do users need field-level /
   memory-level allowlists, time-boxed grants, and a proper "session" that survives service-worker
   eviction? This shapes the whole authorization layer.

## Next phases (queued)

The data model now carries `origin` and `context` on every memory, which unlocks the next work
without another migration:

1. **Per-memory delete everywhere** — individual delete lives in Dashboard → Memories (now with a
   confirmation) and the popup; next is surfacing it in the review list and share receipt too (no
   bulk/batch wipe).
2. **Receipt detail** — expand the post-share receipt to list the exact memories shared (currently
   it names the app, profile and count; the full text is in Requests → View).
3. **Enterprise packaging** — document `managed-schema.json` deployment for IT admins; policy
   enforcement itself is already wired through `chrome.storage.managed`.
4. **Retrieval eval** — build a small labelled query/memory set and tune the semantic threshold and
   tier fusion against it, rather than by feel.
5. **Context delivery alternatives** — explore clipboard/overlay hand-off as an opt-in alongside
   the honest visible-composer injection.


