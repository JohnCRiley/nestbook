# Channel Manager landing page teaser

## Status: text/layout/CSS complete and shipped to main. Blocked only on the final graphic asset.

## What's done
- New section added to `server/public/index.html`, id `#channel-manager`,
  directly below the "Everything included" section (`#features`) and above
  "Which Plan Is Right for You?".
- Reuses the exact gradient-on-outer-wrapper wave technique already used by
  `#features` (`.hf-bg`) and `#testimonials` (`.tm-bg`) — new classes
  `.cm-bg`/`.cm-wave`/`.cm-bg-bottom`, same cream→white 57%/100% gradient,
  same 50px wave SVG path. `#channel-manager` uses the shared `.section`
  class (88px top/bottom) + `padding-top: 40px` on `.container` for wave
  clearance, matching `#testimonials`' pattern exactly (not `#features`'
  older bespoke-padding variant).
- All text (title, 3 body lines, caption, "Coming Soon" stamp) is real
  `data-i18n` HTML, translated into all 5 languages inside index.html's own
  base64-encoded `I18N` blob (same mechanism as every other string on this
  page — confirmed NOT baked into any image). New keys, all under
  `channelManager.*`: `title`, `line1`, `line2`, `line3`, `caption`,
  `comingSoon`.
- **The "Coming Soon" stamp is a new CSS element, not a reused one.**
  Investigated first, per instruction: the marketing site's original Coming
  Soon section (built for Stripe Connect / Global Directory) was fully
  *removed* in commit `a990896` ("Give testimonials the wave treatment,
  remove Coming Soon section") once Stripe Connect shipped — nothing to
  reuse structurally. Even when it existed, it was never a diagonal ribbon;
  just a small uppercase "On the horizon" eyebrow line above a dark card
  (see `git show a990896^:server/public/index.html`, `.coming-soon-eyebrow`).
  No diagonal/rotated badge pattern exists anywhere else in the codebase
  either (checked both `server/public/*` and `client/src/**/*.css`).
  Built fresh (`.cm-stamp`, `rotate(-18deg)`, semi-transparent `var(--mid)`,
  `text-transform: uppercase`) to match the approved mock-up's look. The
  **translated string itself** is reused verbatim, not invented: it's the
  one genuinely-existing "Coming soon" translation anywhere in the codebase
  — `billing.comingSoon` in `client/src/i18n/index.js` (dead/unused there,
  but real and already translated into all 5 languages) — copied into
  index.html's own blob under `channelManager.comingSoon`. CSS
  `text-transform: uppercase` normalizes the display casing across
  languages rather than baking in a fresh casing choice.
- Live-verified in the browser: renders correctly in EN, and all 5
  languages confirmed via `applyLang()` (text genuinely changes, not an
  image) for the title/lines/caption/stamp. Mobile (375px) collapses to a
  single centered column correctly. `#features`/`#testimonials` unaffected
  — no regression, checked via full page text dump and console (the only
  404s present — `/images/landing/dashboard.jpg`, `calendar.jpg` — are
  pre-existing local-dev-only gaps, unrelated to this change; nothing new
  introduced, since the graphic column is a placeholder `<div>`, not a live
  `<img>` yet).

## What's blocked
- The hub-and-spoke icon graphic itself. John is providing a **text-free**
  version of the mock-up image (icon/diagram only, no baked-in title/body/
  caption/"Coming Soon" text — those are all real HTML now, would double up
  with baked text otherwise). Until then, `.cm-graphic` holds a dashed-
  border placeholder box (`.cm-graphic-placeholder`) sized to the same
  aspect ratio (5:3) so the layout won't jump when the real image drops in.
- **Next step once the image is supplied**: save it to
  `server/public/images/landing/channel-manager-hub.png` (or whatever
  filename/extension John provides), then in `server/public/index.html`
  swap the placeholder div for the commented-out `<img>` tag already sitting
  right above it (search for `channel-manager-hub.png` — the exact
  replacement is already spelled out in an HTML comment at the insertion
  point). Remove the placeholder div and its CSS rule once no longer
  needed (check nothing else references `.cm-graphic-placeholder` first).
- No other work is planned on this section beyond swapping in the graphic —
  delete this file once that's done and verified live.
