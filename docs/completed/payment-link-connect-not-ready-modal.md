# "Payment links aren't available" modal — Stripe Connect not ready

**Status:** shipped & verified in-browser (all 5 languages). Source-only change;
`client/dist` is gitignored and rebuilt on deploy.

## Problem

If an owner's `stripe_connect_status` was anything other than `'active'`
(misconfigured, or silently stuck `'pending'` from the webhook bug fixed in
`335cd13`/`4e7792c`), the "Send payment link" slot in BookingPanel simply
didn't render. Free-plan owners rely entirely on the manual payment-link flow,
so the feature vanishing with no explanation left them unable to take payment
and no obvious way to flag it — which is exactly how the Pawsitive Effect
booking went unpaid until the guest chased it.

## Change

**`client/src/pages/bookings/BookingPanel.jsx`**
- The payment-link slot now renders for any owner on a `confirmed` / `arriving`
  / `in_house` booking, regardless of Connect status.
- `PaymentLinkButton` takes `connectReady` (default `true`, so no other caller
  changes) + `onConnectNotReady`. When `!connectReady` it renders just the
  "Send payment link" button; clicking it opens a `ConfirmModal` (variant
  `warning`) instead of calling the API.
- Modal: `bookingPanel.connectNotReady.{title,body,button}`, cancel =
  `common.cancel`. Confirm ("Report this issue") does
  `navigate('/settings?report=1')`.
- `useNavigate` added; `navigate` lives in `ViewMode` (not the outer
  `BookingPanel`) — that's the component that owns `connectStatus` and the slot.

**`client/src/i18n/index.js`** — `bookingPanel.connectNotReady.{title,body,button}`
in all 5 locales, verbatim from the request (not machine-translated).

**`client/src/pages/Settings.jsx`**
- The existing "Report an issue" card (the real error-report tool, gated on
  `bugReportingEnabled` from `/api/error-reports/enabled`, POSTs to
  `/api/error-reports`) got `id="report-issue"` + a ref.
- New effect: on `?report=1`, scroll that card into view. The Settings page
  keeps growing for ~1–2s as Pro-gated cards / async data land, so a one-shot
  scroll misses — instead a `ResizeObserver` on `document.body` re-pins it on
  every layout change for a 3s window, then disconnects and hands scroll back.

## Server side

No change. `POST /api/bookings/:id/create-payment-link` already returns
`400 { error: 'Stripe Connect not set up' }` when
`stripe_connect_status !== 'active'` — kept as the safety net.

## Verified (local, QA property 27 / booking 69 / user 38)

- Connect `active` → unchanged: amount input pre-filled + "Send payment link".
- Connect `pending`/`null` → button shows, opens the modal.
- Modal "Report this issue" → `/app/settings?report=1`, scrolls to the report
  form.
- Modal copy exact in EN/FR/ES/DE/NL (read from the DOM, matched verbatim).

## Test-data touched during verification (all restored)

user 38 password_hash / `stripe_connect_*` / language, property 27 `locale`,
booking 69 status → all put back to original values.
