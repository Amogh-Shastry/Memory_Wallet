# Memory Wallet — UI Architecture Guide

## Tech Stack
- React 18 + TypeScript, bundled with esbuild
- Chrome Extension Manifest V3 (popup, options page, content scripts)
- No CSS framework — all styles are hand-written CSS with custom properties
- Content scripts use Shadow DOM for style isolation

## File Map

```
src/
├── ui/                        # Shared design foundation
│   ├── tokens.css             # All CSS custom properties (colors, type, spacing, motion)
│   ├── animations.css         # Reusable @keyframes + utility classes
│   ├── contentTokens.ts       # Token string for shadow DOM injection (literal hex, not var())
│   ├── icons.tsx              # SVG icon components (stroke-based, currentColor)
│   ├── hooks.ts               # useWalletState() React hook
│   └── format.ts              # relativeTime(), memoryCountFor()
├── popup/                     # Browser action popup (380×480)
│   ├── main.tsx               # Entry: imports tokens.css → animations.css → styles.css
│   ├── App.tsx                # Popup React component
│   └── styles.css             # Popup-specific layout + components
├── options/                   # Full-page dashboard + onboarding wizard
│   ├── main.tsx               # Entry: imports tokens.css → animations.css → styles.css
│   ├── App.tsx                # All dashboard sections (Overview, Profiles, Memories, etc.)
│   ├── components.tsx         # Reusable: Toggle, Card, SectionTitle, StatCard
│   └── styles.css             # Dashboard layout + all component styles
├── content/                   # Injected into ChatGPT/Claude pages
│   ├── index.ts               # Content script entry
│   ├── detector.ts            # Query detection (intercept + fallback)
│   ├── pendingFlow.ts         # Request coordination flow
│   ├── importFlow.ts          # One-click "import what your AI knows" (disclose → send → review)
│   ├── importState.ts         # Suppresses wallet interception during our own import prompt
│   ├── injector.ts            # Composer fill + submit
│   └── ui/
│       ├── modal.ts           # Memory request card (Shadow DOM)
│       └── toast.ts           # Toast notifications + floating pill (Shadow DOM)
└── shared/
    ├── types.ts               # All TypeScript interfaces (Profile, Memory, Settings, etc.)
    ├── actions.ts             # CRUD operations for profiles/memories
    ├── extract.ts             # pasted AI answer → reviewable proposals (PURE — no chrome.*)
    ├── classify.ts            # keyword category inference (PURE — no chrome.*)
    ├── consent.ts             # standing-grant decision rules (PURE — no chrome.*)
    ├── storage.ts             # chrome.storage.local wrappers
    └── messages.ts            # Message types for background ↔ content communication
```

## Design Token System (`src/ui/tokens.css`)

All visual values are defined as CSS custom properties on `:root`. **Never hardcode colors, sizes, or timing values in component CSS.** Always reference tokens.

### Color Tokens
```css
/* Surfaces */
--bg              /* page background */
--bg-subtle        /* slightly lighter (sidebar bg) */
--bg-raised        /* card backgrounds */
--bg-hover         /* hover states */
--bg-inset         /* inset/recessed areas */
--bg-glass         /* glassmorphism surfaces */

/* Strokes */
--border           /* default borders */
--border-strong    /* emphasized borders */
--border-subtle    /* lighter dividers */

/* Text */
--text             /* primary text */
--text-soft        /* secondary text */
--text-muted       /* tertiary / labels */
--text-faint       /* placeholders, disabled */

/* Brand */
--accent           /* #6366f1 indigo — primary actions */
--accent-hover     /* lighter indigo */
--accent-soft      /* tinted backgrounds */
--accent-text      /* text on accent backgrounds */
--accent-glow      /* glow ring color */

/* Status */
--green / --green-soft / --green-border
--red / --red-soft / --red-border
--amber / --amber-soft / --amber-border
```

### Typography Scale
```css
--text-2xs: 10px    --text-xs: 11px    --text-sm: 12px
--text-base: 13px   --text-md: 14px    --text-lg: 15px
--text-xl: 17px     --text-2xl: 20px   --text-3xl: 26px

--fw-normal: 400    --fw-medium: 500   --fw-semibold: 600
--fw-bold: 700      --fw-extrabold: 800

--leading-tight: 1.2    --leading-normal: 1.45    --leading-relaxed: 1.6
```

### Spacing Scale
```css
--space-1: 4px    --space-2: 8px     --space-3: 12px
--space-4: 16px   --space-5: 20px    --space-6: 24px
--space-8: 32px   --space-10: 40px   --space-12: 48px
```

### Elevation
```css
--shadow-xs    /* subtle lift */
--shadow-sm    /* card default */
--shadow-md    /* dropdown / popover */
--shadow-lg    /* modal overlay */
--shadow-glow  /* accent glow ring (use with box-shadow) */
```

### Motion
```css
--ease          /* standard ease */
--ease-out      /* decelerate (entrance) */
--ease-spring   /* overshoot (bouncy) */
--dur-fast: 120ms
--dur-normal: 200ms
--dur-slow: 350ms
```

### Geometry
```css
--radius-xs: 6px   --radius-sm: 8px    --radius-md: 10px
--radius-lg: 14px  --radius-xl: 18px   --radius-full: 999px
```

## Animation System (`src/ui/animations.css`)

Imported by `popup/main.tsx` and `options/main.tsx` (after tokens, before component styles).

### Keyframes
| Name | Effect |
|------|--------|
| `mw-fadeIn` | opacity 0→1 |
| `mw-slideUp` | translateY(8px)+opacity → natural |
| `mw-slideDown` | translateY(-8px)+opacity → natural |
| `mw-scaleIn` | scale(0.96)+opacity → natural |
| `mw-pulseGlow` | accent ring expand/fade |
| `mw-shimmer` | background-position sweep |

### Utility Classes
```html
<div class="anim-fade-in">...</div>
<div class="anim-slide-up">...</div>
<div class="anim-scale-in">...</div>

<!-- Staggered children -->
<ul class="anim-stagger">
  <li>enters at 0ms</li>
  <li>enters at 40ms</li>
  <li>enters at 80ms</li>
</ul>
```

## Content Script Shadow DOM

Content scripts (`modal.ts`, `toast.ts`) render in Shadow DOM to isolate from host page styles. They **cannot** use CSS `var()` from the page.

### Solution: Cloned Token Stylesheet
`src/ui/contentTokens.ts` exports:
- `CONTENT_TOKENS_CSS` — all token values as literal hex/px strings
- `buildTokenStyleEl()` — returns a `<style>` element with all tokens

Each shadow root appends this before its component styles:
```ts
import { buildTokenStyleEl } from "../../ui/contentTokens";

shadow.appendChild(buildTokenStyleEl());          // tokens first
const style = document.createElement("style");
style.textContent = MODAL_COMPONENT_CSS;          // component styles second
shadow.appendChild(style);
```

**When adding a new token to `tokens.css`, you MUST also add it to `contentTokens.ts`.**

## Component Patterns

### Toggle (`src/options/components.tsx`)
```tsx
<Toggle checked={value} onChange={(v) => setValue(v)} />
```
Styled via `.toggle` / `.toggle.on` / `.knob` classes in `options/styles.css`.

### Card (`src/options/components.tsx`)
```tsx
<Card>content</Card>              {/* default: border only */}
<Card elevated>content</Card>     {/* adds shadow-sm */}
<Card className="stat">...</Card> {/* custom class */}
```

### SectionTitle
```tsx
<SectionTitle title="Overview" subtitle="Description text" />
```

### Status Chips (used in both popup and options)
```css
.chip-allow   /* green */
.chip-deny    /* red */
.chip-pending /* amber */
```
Apply via `<span className="chip chip-allow">Allowed</span>`.

## CSS Naming Conventions

- **Layout classes**: `.popup`, `.dashboard`, `.sidebar`, `.content`, `.grid-two`, `.stack`
- **Component classes**: `.card`, `.btn`, `.toggle`, `.chip`, `.pill`, `.nav-item`
- **BEM-ish modifiers**: `.btn-primary`, `.btn-small`, `.card-accent`, `.nav-item.active`
- **Utility classes**: `.muted`, `.small`, `.grow`, `.block`
- **New CSS classes for App.tsx**: prefix with purpose (`.request-detail-block`, `.expanded-content`, `.section-label`)

### Button Variants
```css
.btn               /* base */
.btn-primary       /* accent bg, white text */
.btn.small         /* compact padding */
.btn.danger        /* red accent */
.btn-icon          /* icon-only square */
```

## Website (`site/`)

- Static HTML in `site/src/`, no framework, no new runtime deps; built to gitignored `dist-site/` by `scripts/build-site.mjs`
- `site/src/site.css` imports `tokens.css` + `animations.css` (same order invariant) then overrides surface tokens to a light paper/ink scheme — dark appears **only** inside real product screenshots
- `npm run site:shots` Playwright-captures the REAL UI into `site/assets/shots/*.webp` (fixture `site/src/card-shot.ts` renders `MemoryRequestModal`); `npm run site:check` is a hard gate: banned vibecode + Web3 lexicon (sign/signature/persona/sovereign/vault/ledger/crypto/0xMem…), alt text, meta/canonical, link resolution, image budgets
- Site copy inherits wording from README/launch-kit/PRIVACY — never invent; placeholders carry `PLACEHOLDER`/`TODO(founder)` tags and must be resolved before launch
- After extending tokens: also mirror any *component* tokens the site uses; the site only consumes surface tokens it overrides — keep `contentTokens.ts` (extension) unaffected

## Adding a New Component
1. **Check existing patterns** in `options/components.tsx` and `options/styles.css`
2. **Use token variables** for all colors, sizes, spacing — never hardcode
3. **Add CSS classes** to the appropriate `styles.css` file (popup or options)
4. **Convert inline styles** — if you add `style={}` in TSX, move it to a CSS class instead
5. **For content script UI**: add styles to the component's CSS string, use literal hex values from `contentTokens.ts`

## Build & Verify

```bash
npm run build          # builds all bundles to dist/
npm run typecheck      # TypeScript check (no emit)
npm test               # extractor + consent + migration fixtures (esbuild + node:assert)
npm run watch          # rebuild on file changes
```

### Build outputs
```
dist/
├── popup/popup.html + main.js + main.css
├── options/options.html + main.js + main.css
├── background/background.js
├── content/content.js
├── offscreen/offscreen.js + offscreen.html + wasm/
├── assets/icon*.png
├── manifest.json
└── test/ui.html + harness.js + harness.css
```

### Visual harness
Open `dist/test/ui.html` in browser. Add `?view=popup` for popup view.

## Key Invariants

1. **No CSS frameworks** — all hand-written, token-based
2. **No inline styles in production TSX** — use CSS classes (only harness.tsx may use `style={}`)
3. **Shadow DOM surfaces must mirror token values** via `contentTokens.ts`
4. **Import order matters**: `tokens.css` → `fonts.css` → `animations.css` → component `styles.css`
5. **All interactive elements** need `:hover`, `:active`, and `:focus-visible` states
6. **Transitions** use `var(--dur-*) var(--ease-*)` — never raw ms/easing values
7. **No remote resources** — fonts and the embedding model are bundled; run `npm run check:no-remote` before shipping
