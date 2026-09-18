# Feature: split Settings into 5 tabs (Property Setup / Booking & Availability / Guest Experience / Marketing & Distribution / Admin & Support)

Status: **scoping only** — no code written yet. This file captures the
investigation pass done 2026-09-18 so the real build prompt/session doesn't
need to re-derive any of it. Not started.

## Confirmed facts

**File structure.** [Settings.jsx](../../client/src/pages/Settings.jsx) is one
file, 5243 lines — not split into per-section files. It IS partially
decomposed: ~20 named helper components live in the same file below the main
component (`AccessCodeSection`, `EmbedSection`, `FacebookActionSection`,
`QrCodeSection`, `GuestNotesSection`, `SpecialsBannerSection`,
`CustomSectionSection`, `WifiQrSection`, `SeasonalPricingSection`,
`RoomCategoriesSection`, `AtAGlanceSection`, `PropertyAmenitiesSection`,
`DepositSection`, `UnSubTypeSection`, `PartnershipLinksSection`,
`RoomOrganizationCard`, `PropertyHeroPhoto`, plus modals). The main component
(`export default function Settings()`, line 98) renders everything as one
`<>...</>` with a single `.settings-layout` two-column CSS grid (line 647),
each "section" a `.settings-card` div (or a bare component that renders its
own `.settings-card` internally). There is no tab or accordion wrapper today —
just ~25 stacked cards split across a left and right column purely by grid
position, in source order. Full left/right order below.

**Left column** (line 650): sample-data-deletion banner (conditional) →
Property Details card (name/type/description, `PropertyHeroPhoto`,
`AtAGlanceSection`, `PropertyAmenitiesSection`) → Room Organization card
(IR "named" mode only) → Unit Sub-Type (Units mode only) → Partnership Links
(Pro/Multi, `PlanGate`) → Multi-property management (Multi plan, owner) →
Breakfast service hours → Appearance/theme picker → Room Categories (IR
"categories" mode) → Report an Issue.

**Right column** (line 1251): Dev Tools plan switcher (dev-only, hidden in
prod) → Features toggle-list card (also holds the property-wide breakfast
toggle and min-stay/block-booking-threshold fields) → Widget embed code
(Pro, `EmbedSection`) → QR Code → WiFi QR → Specials Banner → Custom Section →
Facebook Action Button & slug editor → Guest Access/access code (WP mode
only) → Deposit & Balance (WP mode only) → Seasonal Pricing/rate periods
(Pro+) → Calendar Sync accordion (iCal export + iCal import, collapsible,
closed by default) → Review Requests (Pro/Multi) → Service/Charges
Categories (Multi plan or Charges add-on) → Access & Roles (staff list +
invite).

Confirmed NOT in Settings.jsx: Bar & Charges, Payment & Deposit Manager,
Property Info Sheet, Stripe Connect — all live in
[Billing.jsx](../../client/src/pages/Billing.jsx) (1220 lines), a separate
top-level page. Not touched, not moving.

**Theme CSS variables.** Defined in [index.css](../../client/src/index.css),
`:root` (lines 2-35) holds the Forest defaults; each other theme is an
`html[data-theme="<id>"] { ... }` override block (royal at 38, ember at 70,
ruby at 98, sky at 130, lavender at 162, aero at 194, charcoal at 277, slate
at 310, storm at 343, hessian at 376). Full Forest/default variable set:
`--sidebar-bg`, `--sidebar-hover`, `--sidebar-active`, `--sidebar-text`,
`--accent`, `--accent-dark`, `--tint-bg`, `--tint-border`, `--tint-text`,
`--light-green`, `--card-bg`, `--panel-bg`, `--header-bg`, `--header-text`,
`--heading-text`, `--accent-bar`, `--section-bg`, `--section-text`,
`--btn-secondary-bg`, `--btn-secondary-text`, `--toggle-on`, `--toggle-off`,
plus neutrals `--page-bg`, `--border`, `--text-primary`, `--text-secondary`,
`--text-muted`, `--shadow-sm`, `--shadow-md`, `--radius`. **11 themes
confirmed** (count was stale at 7): forest, royal (label "Navy"), ember
(label "Warm Gold"), ruby, sky (label "Sky Blue"), lavender, aero, charcoal,
slate, storm, hessian — list is `THEMES` const, Settings.jsx line 58.
(There's a second, separate `THEME_COLOURS` const at line 29, "must stay in
sync with `THEME_COLOURS` in server/routes/bookingPage.js" — that's the
guest-facing booking-page palette, not the admin-app CSS vars above; don't
conflate the two when building the tab UI.)

**Tab/accordion patterns already in the codebase.** No pre-built pill-tab or
segmented-control component exists anywhere in the app — searched for
`tab-nav`/`tab-pill`/`role="tab"`/`.pill` and found only status badges
(`.status-pill`, `.count-pill`, `.billing-status-pill`), not navigation.
Two usable precedents:
- **Underline tabs**: [BookingPanel.jsx:685-722](../../client/src/pages/bookings/BookingPanel.jsx)
  — a 2-tab Details/Charges bar, inline-styled (no CSS classes), active tab
  gets `borderBottom: '2px solid var(--accent-dark)'`. Simplest possible
  reference if the desktop tab bar ends up underline-style rather than pills.
- **Collapsible accordion**: Settings.jsx's own Calendar Sync section
  (line 1507) reuses `.danger-zone-card` / `.danger-zone-toggle` /
  `.danger-zone-chevron` / `.danger-zone-body` (CSS in index.css line
  4644-4680+) — originally built for the delete-account danger zone,
  already repurposed generically. State is a plain `useState(false)` per
  section (e.g. `calendarSyncOpen`, line 138) with a ▲/▼ chevron and
  `aria-expanded`. This is the closest thing to a "mobile pill-accordion"
  pattern already proven in Settings.jsx itself — recommend reusing
  `.danger-zone-*` classes (renamed/generalized) over inventing new CSS.
  Other accordions exist too (Phone Outreach call-prompts,
  `PhoneOutreach.jsx` `openPrompt`/`isOpen` state around line 372; guest
  phone-notes accordion same file ~451-668; compare.html's plain-JS
  `.feat-row.expanded` click-to-expand rows) but they're all bespoke
  inline-style, not more reusable than the danger-zone pattern.

**Responsive breakpoints.** Settings-specific CSS uses exactly one
breakpoint: `@media (max-width: 767px)` (index.css line 2913) collapses
`.settings-layout` from `grid-template-columns: 1fr 1fr` to `1fr`, and a
second `max-width: 767px` block (line 5040) stacks `.settings-form-row` to
one column. That's functionally the "768px" convention the rest of the app
uses elsewhere — confirmed. **480px is NOT used anywhere in the admin
client** (`client/src/index.css` or any `client/src/**/*.jsx`) — it only
shows up in guest-facing surfaces (`server/routes/bookingPage.js`,
`server/routes/widget.js`, `server/public/widget.js`,
`server/email/emailService.js`). So the mobile pill-accordion breakpoint
should almost certainly key off 767/768px, not 480px, to match Settings'
own existing convention — flag this if the build prompt assumes a 480px
mobile tier.

**i18n keys.** [client/src/i18n/index.js](../../client/src/i18n/index.js) —
`export const LANGS = { en: {...}, fr: {...}, es: {...}, de: {...}, nl: {...} }`
(5 locales, `SUPPORTED_LOCALES` line 5), each a flat object of
`'dot.case.key': 'string'` pairs, all 5 languages keeping the same key set
at different line offsets (e.g. `'settings.appearance'` at line 1126 in
`en`, 2883 in `fr`, 4638 in `es`, 6393 in `de`, 8205 in `nl`). Existing
Settings section-label keys follow `settings.<camelCase>`, e.g.
`settings.appearance`, `settings.widgetEmbed`, `settings.seasonalPricing`,
`settings.calendarSync`, `settings.reviewRequests`, `settings.accessTitle`.
New tab-label keys should follow the same convention, e.g.
`settings.tabPropertySetup`, `settings.tabBookingAvailability`,
`settings.tabGuestExperience`, `settings.tabMarketingDistribution`,
`settings.tabAdminSupport` (naming not yet decided — just confirming the
pattern) — need one key added per language, 5 languages × 5 tabs = 25 new
lines.

## Explicitly ruled out / not touched

- Not moving Bar & Charges, Payment & Deposit Manager, Property Info Sheet,
  or Stripe Connect — confirmed they live in Billing.jsx and stay there.
- No icons in this feature (explicit instruction from John).
- No new tab/pill code written yet — this pass was investigation only.

## What's next

Waiting on John's real build prompt, which will assign each of the ~25
existing cards/sections above to one of the 5 new tabs and specify the tab
bar's visual style (pill vs underline) and the mobile collapse behaviour.
