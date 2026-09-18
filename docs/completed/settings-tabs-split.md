# Feature: split Settings into 5 tabs (Property Setup / Booking & Availability / Guest Experience / Marketing & Distribution / Admin & Support)

Status: **built + verified in-browser** 2026-09-18. Committed to `main`.
Layout reorganization only — no section internals rewritten, no schema/API
changes. Superseded the scoping-only pass in
[docs/in-progress/settings-tabs-split.md] (now removed).

## What changed

[Settings.jsx](../../client/src/pages/Settings.jsx): removed the old
`.settings-layout` two-column grid. Added `activeTab` state
(`useState('propertySetup')`) and five content consts
(`propertySetupTab`, `bookingTab`, `guestExperienceTab`, `marketingTab`,
`adminTab`), each built once from the exact original JSX of its member
sections (moved, not rewritten) and rendered from both a desktop/tablet
connected tab bar (`.settings-tab-bar` + one `.settings-tab-panel` per tab,
all five always mounted, `style={{display: activeTab===key?'block':'none'}}`)
and a mobile pill accordion (`.settings-accordion-group`, same mount-and-hide
pattern, `activeTab` doubling as "which pill is open" so only one is ever
open). The sample-data-deletion banner stays outside the tab system,
directly under the page header. [index.css](../../client/src/index.css) got
the new `.settings-tab-*` / `.settings-accordion-*` rules (replacing the
removed `.settings-layout` block) — every color is a `var(--...)` token, no
hardcoded values, verified against all 11 themes in-browser (Forest, Navy,
Warm Gold, Ruby, Sky Blue, Lavender, Aero, Charcoal, Slate, Storm, Hessian).
[i18n/index.js](../../client/src/i18n/index.js) got 5 new
`settings.tab*` keys × 5 languages (en/fr/es/de/nl), inserted next to the
existing `settings.widgetEmbed` key, following the established
`settings.<camelCase>` convention.

## Final tab contents (source-order within each tab)

- **Property Setup**: Property Details → Multi-property management →
  Room Organization / Unit Sub-Type / Room Categories (mutually exclusive,
  kept adjacent) → Breakfast service hours → Appearance → Dev-only plan
  switcher (kept immediately adjacent to Features rather than literally
  nested inside it, to avoid touching either section's internals) →
  Features toggle list.
- **Booking & Availability**: Widget embed (PlanGate pro) → Deposit &
  Balance (WP mode only) → Seasonal Pricing (PlanGate pro) → Calendar Sync
  (its own internal open/close accordion state, `calendarSyncOpen`,
  untouched).
- **Guest Experience**: Specials Banner → Custom Section → Guest Notes
  (PlanGate pro; confirmed original location was directly after Review
  Requests, before the old right column's "Billing — moved to dedicated
  page" paragraph) → Review Requests (PlanGate pro) → Guest Access/door
  code (WP mode only).
- **Marketing & Distribution**: QR Code → WiFi Card → Facebook Action
  Button → Partnership Links (PlanGate pro).
- **Admin & Support**: Service/Charges Categories → Access & Roles →
  Report an Issue → "Billing — moved to dedicated page" paragraph.

**Two placements John should sanity-check** — the build prompt's 5 group
lists didn't mention these two sections at all, so they were placed on
best-guess thematic fit rather than explicit instruction:
- **Deposit & Balance** (WP-mode financial policy) → put in Booking &
  Availability, right after Embed.
- **Guest Access/door code** (WP-mode guest-facing info) → put in Guest
  Experience, last item.

The **Billing paragraph** ("Manage your plan… Billing page" link) was also
unlisted; placed at the end of Admin & Support since that's the closest
thematic fit and it was directly adjacent to Charges Categories in the
original source.

## Two bugs the double-mount architecture would otherwise have caused

The build prompt's own spec mounts every tab's content twice at once (once
under the desktop `.settings-tab-panel`, once under the mobile
`.settings-accordion-body`, each hidden via CSS depending on viewport) so
that switching tabs never unmounts a section and loses typed input. Two
pre-existing pieces of code assumed there'd only ever be one copy of a
section in the DOM at a time, which a literal implementation would have
silently broken:

1. **"Report an issue" deep link** (`?report=1`, used by BookingPanel's
   "payment links aren't available" modal) — used to find its target via
   `document.getElementById('report-issue')`. With two mounted copies,
   `getElementById` always resolves to the same one regardless of which is
   actually visible, so the scroll would silently no-op on whichever
   viewport wasn't holding that copy. Fixed: swapped the `id` for
   `data-report-anchor`, and the effect now does
   `document.querySelectorAll('[data-report-anchor]')` and scrolls whichever
   candidate has `offsetParent !== null` (i.e. is actually visible). The
   effect now also does `setActiveTab('admin')` so the tab containing the
   report card is switched to (and its accordion pill opened) before the
   scroll happens — previously irrelevant since there was only one column
   layout, now required since the target could be on a hidden tab.
2. **Charges Categories "Add category" empty-state button** — used to call
   a shared `newCatInputRef.current?.focus()`. With two mounted copies of
   the input, the shared ref always points at whichever copy rendered last,
   so the button would sometimes focus the wrong (hidden) copy's input.
   Fixed: the button now scopes the focus to its own subtree —
   `e.currentTarget.closest('.settings-card-body')?.querySelector('input')?.focus()`
   — instead of relying on the shared ref.

Grepped for other component-scope `ref`/`id` attached directly inside the
moved JSX (as opposed to a `useRef` local to a child component like
`QrCodeSection`, which is safe since each `<QrCodeSection>` instantiation
gets its own independent hook state) — only these two existed, both now
fixed. The only remaining incidental duplicate is `id="timezone-options"`
on Property Details' `<datalist>`, harmless because both mounted copies
render byte-identical `<option>` children, so it doesn't matter which one a
browser's `list=` attribute resolves to.

## Known trade-off — not fixed, flagged instead

`PlanGate` (used by Embed, Seasonal Pricing, Partnership Links, Review
Requests, and the Access & Roles invite button — 5 usages) calls `usePlan()`
internally, which fires its own `GET /api/stripe/subscription` on mount.
Because the build prompt's mount-and-hide design keeps **all 5 tabs**
mounted at once (not just the active one) and doubles that again for
desktop/mobile, page load now fires roughly 3-4× as many redundant
`/api/stripe/subscription` requests as the original one-column layout
already did (it was already firing one per `PlanGate` instance before this
change). Confirmed via the browser's network panel during testing — no
functional impact (the endpoint is cheap, and `usePlan()` already seeds
from a localStorage cache before refreshing), just more idle network
chatter than ideal. Not fixed here since doing so would mean changing
`PlanGate`/`usePlan` (shared, out-of-scope code) or abandoning the
mount-and-hide requirement itself. Worth a follow-up if it ever shows up in
real usage metrics.

## Verified in-browser (2026-09-18, demo@nestbook.io / Multi plan / Gîte,
individual-rooms mode)

- Desktop: 5 connected tabs, Property Setup open by default, active tab
  visually welded to its panel.
- Typed an unsaved value into Property Name, switched to Marketing tab and
  back to Property Setup — value survived (confirms mount-and-hide, not
  conditional unmount).
- Tablet width (850px): tab bar wraps to a second row rather than
  truncating or overflowing (flex-wrap on the bar, not text-wrap within a
  button — a deliberate implementation choice, easy to change if John wants
  per-button text wrap instead).
- Switched property locale to German and confirmed all 5 tab labels render
  correctly with no truncation/overflow at both desktop and tablet widths,
  then reverted locale to English.
- Mobile (375px): tab bar hidden, 5 pills stacked; tapping one opens it and
  closes any other open pill; tapping the open one again closes it
  (all-closed state confirmed). This required one CSS fix beyond the build
  prompt's literal spec — see "Real bug caught" below.
- All 11 themes render correctly (theme picker screenshot taken on
  desktop).
- Toggled the dev-only plan switcher to Free — confirmed PlanGate's
  🔒 upgrade prompt correctly appears for Embed and Seasonal Pricing inside
  Booking & Availability, and disappears again once switched back to Multi.
- `?report=1` deep link correctly switches to the Admin & Support tab and
  scrolls the visible copy of the Report an Issue card into view.
- No new console errors/warnings; `vite build` succeeds cleanly (pending
  chunk-size warning is pre-existing, unrelated).

## Real bug caught during verification

The build prompt's own example CSS relied on inline `style={{display:
activeTab===key?'block':'none'}}` on `.settings-tab-panel` PLUS a separate
`@media (max-width:767px) { .settings-tab-panel { display:none } }` rule to
hide it on mobile. Inline styles always beat stylesheet rules regardless of
media query, so the active tab's panel stayed visible (duplicated
underneath the mobile accordion) until `!important` was added to that one
mobile media-query rule. Caught by an actual mobile-viewport screenshot,
not just code review — worth remembering for any future
inline-style-plus-responsive-override pattern.
