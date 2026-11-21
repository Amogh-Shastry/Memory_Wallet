# Privacy Policy — Memory Wallet

**Last updated:** October 29, 2026
**Applies to:** Memory Wallet Chrome extension v1.0.0 (and later), distributed via the Chrome Web Store.

Memory Wallet is **local-first by design**. We do not operate a backend, we do not create accounts, and we do not collect analytics.

## Summary

- All your memories, profiles, permissions, and request logs are stored **only on your device** in `chrome.storage.local` and `IndexedDB`.
- Nothing is uploaded to our servers — because there are no servers.
- The extension makes **no outbound network requests at all**. The open-source embedding model ships inside the extension package rather than being downloaded at runtime.
- Every request is logged locally — query, memories shared, and decision — so you can audit exactly what was shared and when.

## Data we store (on-device only)

| Data | Where | Purpose |
|------|-------|---------|
| Profiles (name, icon, description) | `chrome.storage.local` (`mw_profiles`) | Context boundaries you create |
| Memories (content, category, importance, origin, context, previousValues) | `chrome.storage.local` (`mw_memories`) + vectors in `IndexedDB` (`memory-wallet-embeddings`) | Matched locally to answer your questions. `origin` records where a fact came from, `context` the section of an imported answer, and `previousValues` older values an update replaced. All stay on-device. |
| Permissions (AI app × profile → allow/deny/ask) | `chrome.storage.local` (`mw_permissions`) | Enforce your sharing rules |
| Request log (query, categories, matched IDs, status) | `chrome.storage.local` (`mw_requests`, last 100) | Audit trail — memory content itself is not duplicated in the log |
| Settings | `chrome.storage.local` (`mw_settings`) | Your preferences |

All keys are prefixed `mw_`. Uninstalling the extension deletes `chrome.storage.local`. You can also wipe everything via **Dashboard → Settings → Factory reset** (also clears `IndexedDB` vectors).

## Consent and share receipts

The first time an AI app asks for a profile, a permission card shows exactly which memories would be shared. **Always** (the suggested choice) creates a standing grant for that AI app + profile pair, so later messages share silently; **This browser** grants the same thing for the current browser session only; **Once** shares a single message and asks again next time.

- After every successful share you get a receipt naming the app, the profile and the number of memories shared, with **View receipt** (the local request log) and **Stop auto-sharing** (revokes future standing access for that pair). Revocation cannot unsend a message that was already submitted — the receipt says so.
- You can also revoke anytime in **Dashboard → Permissions** (set the pair to Ask or Deny), or turn on **Settings → Always ask before sharing memory** to require the card for every request.
- An explicit Deny always beats a stale grant. Enterprise policy `RequireApproval` forces the card on regardless of any grant.
- Standing grants for "This browser" live in `chrome.storage.session` and disappear when the browser closes. Persisted "Always" grants live in `chrome.storage.local`. Neither is transmitted anywhere.

## Network access

### 1. AI sites you use
The extension injects a content script into `https://chatgpt.com/*` and `https://claude.ai/*` (declared in `host_permissions`) to detect when you press Enter/click Send and to show the permission card. It does not read your browsing history and does not contact any other site.

### 2. No remote resources
The open-source embedding model **Xenova/all-MiniLM-L6-v2** (Apache-2.0, ~23 MB) is bundled inside the extension package. Fonts are bundled as well. Remote model loading is disabled in configuration (`allowRemoteModels = false`) and the ONNX runtime is served from the package, not a CDN.

- Nothing is fetched at install time, first run, or afterwards.
- `npm run check:no-remote` enforces this mechanically: it fails the release build if a font CDN, script CDN, or remote `url()` appears in `dist/`, or if the model is missing from the package.
- Semantic matching can still be disabled in **Dashboard → Settings → Semantic search**; the extension then uses keyword matching only.

No outbound network activity occurs from the extension.

## Enterprise policy

The extension declares a Chrome managed-storage schema. Administrators can push policy to block or bound sharing — for example `RequireApproval`, `MaxMemoriesPerRequest`, `DisableSemanticSearch`, or `DisableGeneralFallback`. Policy is read from `chrome.storage.managed` on the device and always overrides local settings; it is never transmitted anywhere.

## Permissions — why each is needed (Chrome Web Store Data Use Disclosure)

| Permission | Why |
|------------|-----|
| `storage` | Persist profiles, memories, permissions, and settings on-device |
| `scripting` | Inject `content/content.js` into ChatGPT/Claude tabs and auto-inject into already-open AI tabs after install |
| `offscreen` | Run the local embedding model in an offscreen document (`offscreen/offscreen.html`) — required by Chrome for `Transformers.js` + `onnxruntime-web` WASM |
| `host_permissions: https://chatgpt.com/*, https://claude.ai/*` | Detect send actions and show the permission modal on the two supported AI sites |

The extension does **not** request `tabs`, `<all_urls>`, `cookies`, `history`, or any broad host access.

## Data sharing

We do not sell, share, or transmit your data to any third party. There are no external fetches at all.

## Your controls

- **Export:** Settings → **Export all data** downloads a single JSON file with every memory, profile, permission and the request log. Requests → Copy context copies one shared block.
- **Delete per-item:** Delete any memory or profile from the dashboard (vectors are also removed).
- **Wipe all:** Settings → Factory reset (re-seeds one empty profile so the wallet is usable immediately).
- **Revoke access:** Dashboard → Permissions → set any (AI app × profile) to Deny; or Deny a single request in the card (one-off).

## Children's privacy

The extension is not directed to children under 13 and does not knowingly collect data from them.

## Changes to this policy

We will update this file and the version date above for material changes.

## Contact

Email hello@memorywallet.app.
