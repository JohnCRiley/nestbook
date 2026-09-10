# WP CTA "Free cancellation up to N days before arrival" line

Status: **investigation complete, awaiting John's decision** (fix styling / make consistent across modes / remove). Do not fix yet.

## The line in question

Rendered in `server/routes/bookingPage.js` in the `isWholeProperty` CTA branch:

- `bookingPage.js:1121-1124` — builds the text:
  - `cancellation_days > 0` → `Free cancellation up to ${cancellation_days} days before arrival`
  - `cancellation_days === 0` → `Flexible cancellation — contact owner`
- `bookingPage.js:1134-1139` — the markup:
  ```html
  <div class="nb-step-item" style="margin-top:16px;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#475569;">
    <span class="nb-step-num" style="display:flex;align-items:center;">
      <i class="ti ti-shield-check" style="font-size:1.1rem;color:${palette.dark}"></i>
    </span>
    <span>${esc(cancellationText)}</span>
  </div>
  ```

## 1. Which modes show it

**WP only.** `ctaSection` has exactly two branches (`bookingPage.js:1126-1151`):
- `isWholeProperty` → `.cta-section` **with** the cancellation `<div>`
- everything else (`units` / IR-categories / `rooms`/SC) → plain `.cta` section, **no cancellation line**, no conditional that could add it.

No dependency on deposit / payment / policy config — it renders unconditionally in WP mode (text just switches at `cancellation_days === 0`). Confirmed independently by **AUDIT_MASTER_LIST.md M5** (line 140-146), which already flags the WP-only scoping as a question for John.

## 2. Where the text/styling comes from

Added whole-cloth in commit **e6803935** (2026-06-15, "Add configurable cancellation policy for whole_property mode", Claude Sonnet 4.6 session). Not orphaned markup — it was born in the CTA. But:

- `nb-step-item` — **no CSS rule anywhere in the served booking page.** The only `nb-step-item` with CSS is in `server/public/widget.js` (`renderStepIndicator()`, the widget's 4-step progress bar) — different component, not loaded here.
- `nb-step-num` — **exists in no file except `bookingPage.js`.** Phantom class. (widget.js uses `nb-step-dot` / `nb-step-label`, not `nb-step-num`.)
- All actual styling is the inline `style=""`. The class names are dead copy-paste residue from the widget/landing "steps" pattern.
- `color:#475569` (slate-600) is the exact value used throughout `widget.js` for step/help text **on white backgrounds** (widget.js:1521, 1644, 1676, 2675). It was lifted along with the class names.
- Icon colour was `#16a34a` (green) in e6803935, later changed to `palette.dark` in **75d3353d** (2026-08-16). The text `#475569` was never revisited.

## 3. Is it a real, configurable setting

**Yes — genuinely configurable, not a hollow claim.** Same commit e6803935 wired the full stack:
- `server/db/schema.js:1577` — `ALTER TABLE properties ADD COLUMN cancellation_days INTEGER DEFAULT 7`
- `client/src/pages/Settings.jsx:2341-2357` — dropdown (0/1/2/3/7/14/21/30 days), inside `AccessCodeSection`, which is rendered **only for `rental_type === 'whole_property'`** (`Settings.jsx:1410`).
- `server/routes/properties.js:296,376,420` — persisted via `PUT /api/properties/:id` (falls back to 7 if null).
- `server/routes/bookings.js:1668-1696` — `DELETE /api/bookings/:id` **enforces** it server-side, **WP only**: blocks cancellation once `daysUntil <= cancellation_days`, blocks entirely once `daysUntil <= 0`.
- Also drives `BookingPanel.jsx` cancel-button states.

Caveats on the *wording*:
- "Free" — NestBook charges no cancellation fee and has no penalty logic, so defensible. But refund of any deposit/Stripe payment is **not** handled in this path — owner does that manually. "Free" speaks to NestBook not blocking/charging, not to guaranteed money-back.
- "up to N days before arrival" — enforcement is `daysUntil <= cancellation_days` → **blocked at exactly N days out**. Strictly the copy should say "more than N days before". Off-by-one, cosmetic.
- **No `data-i18n`** on the `<span>` (unlike its `<h2>`/`<p>` siblings). Renders in **English on FR/ES/DE/NL** booking pages. The e6803935 translations covered Settings + BookingPanel, not this string.
- There is **no guest self-service cancellation** anywhere in the app — a guest cancels by contacting the owner. So the line describes an owner-dashboard capability, phrased as a guest-facing promise.

## Best explanation for the colour / alignment mismatch

The `.cta-section` (dark `palette.dark` background; its own rules force text to `#fff` / `rgba(255,255,255,0.85)`, `text-align:center`) existed since commit **45d3595 (2026-06-10)** — *before* this line was added on 06-15.

- **Colour:** inline `color:#475569` (slate-600) was copied from the widget's step-text styling, which sits on white. On the dark CTA background it renders as a dim low-contrast smudge, visibly off from the white heading/paragraph/button. Nobody re-checked the value against the section it landed in.
- **Alignment:** `.cta-inner` is a 600px block, `margin:0 auto`, `text-align:center` — h2/p/button all inherit that. The cancellation `<div>` overrides with inline `display:flex; align-items:center` and **no `justify-content`**, so the flex row shrink-wraps icon+text and pins to the left (main-start) edge → "left-floating" out of alignment with the rest of the strip.
- **Dead classes:** `nb-step-item` / `nb-step-num` contribute nothing (no matching CSS on this page); they're just the fingerprint of the copy-paste from the widget/landing steps pattern.

Net: a later feature commit dropped a snippet styled for a light "steps" context into a dark, centered CTA without adapting it — not a leftover from a previous design, a mismatched *addition*.

## Ruled out / not the cause
- Not orphaned/leftover markup from an earlier build — added deliberately in e6803935, just poorly fitted.
- Not condition-dependent — renders in every WP page regardless of deposit/policy config.
- Not a cross-mode inconsistency in *rendering logic* — the other 3 modes simply never had it (matches M5).

## Files referenced (all confirmed, no need to re-check)
- `server/routes/bookingPage.js:1121-1151` (build + render), `:2370-2378` (`.cta-section` CSS), `:2284-2287` (`.cta` CSS for other modes)
- `server/routes/bookings.js:1668-1696` (enforcement)
- `server/routes/properties.js:296,376,420` (persistence)
- `client/src/pages/Settings.jsx:1410` (WP gate), `:2341-2357` (dropdown)
- `server/db/schema.js:1577` (column)
- `server/public/widget.js:1697-1711` (origin of `nb-step-item` pattern)
- `AUDIT_MASTER_LIST.md` M5 (line 140-146)
- Commits: e6803935 (added), 75d3353d (icon colour), 45d3595 (dark CTA predates it)
