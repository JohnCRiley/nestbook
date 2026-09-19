# Pricing update — audit (scoping only, no code changed)

Current: Pro £19/€22, Multi £39/€45, Bar & Charges £6/€7 (Pro only), Channel Manager add-on £9/€10 (Pro AND Multi).
Change coming: new plan prices (TBD) and Channel Manager included free on Multi (Pro still needs `has_channel_manager_addon`).

## Confirmed facts
- Stripe Price IDs are env-only: `STRIPE_PRICE_PRO`, `STRIPE_PRICE_MULTI` (single ID each, no GBP/EUR split), `STRIPE_PRICE_CHARGES_ADDON_GBP/EUR`, `STRIPE_PRICE_CHANNEL_ADDON_GBP/EUR`.
- Local `server/.env` only has the CHANNEL_ADDON pair (no Pro/Multi/Charges IDs, no Stripe secret key). Live IDs must be read from the prod host env / Stripe dashboard.
- No amounts live in server Stripe code; amounts come from the Stripe Prices. New prices = new Stripe Prices + env swap.
- Discount codes are percent-based only (`percent_off`), created in `server/routes/admin.js` ~302-337. No `amount_off`, no fixed-amount coupon logic anywhere. Existing coupons need no recalculation, but they attach to `STRIPE_PRICE_PRO` (auth.js:93) and stripe.js:306.
- No plan prices are hardcoded in any email template (userMailer/guestMailer/emailService/emailWrapper).
- Register.jsx / Onboarding.jsx / Login.jsx show no plan prices.

## Locations (see the audit reply for detail)
Live app: client/src/pages/Pricing.jsx (27-39), client/src/components/UpgradeModal.jsx (31,109,187,265,343),
client/src/i18n/index.js (Pro/Multi feature lists ~198-203 + 5 langs; chargesAddonPrice 1056 etc; channelAddonPrice 1066 EN ONLY),
client/src/pages/Billing.jsx (add-on cards 512-625), client/src/admin/pages/Revenue.jsx (4, 313-314, 617-621 labels say € but calc is £),
server/routes/admin.js (PLAN_MRR line 31, used 62,1201,1239,1268,1635,1656,1704).
Public: server/public/index.html (meta 9/20/36, JSON-LD 53-67, 1761 CM caption, 1781/1792, 1996-1998, 2019), compare.html (556,558,566,771,844,921,923,960,970 + i18n dict 1191-1217 x5 langs),
how-it-works.html (1166,1234,1352,1361), calculator.html (462,484), help.html (1079, base64 i18n blob).
Marketing: compare-plans.html (251,259,451), flyer-a4{,-nl,-fr,-es,-de}.html, handout-a5{,-fr,-es}.html, feather-flag.html:327.
Docs/knowledge: server/docs/landing-ai-knowledge.md (107,124,136,243,426), server/db/schema.js 1193/1242 (seeded AI help text).
Scripts (one-off, likely stale): add_bc_marketing.mjs, fix_bc_tiles.mjs, en-translations.json.
Blogs (flag only): airbnb-new-fee-structure-2026:370, are-you-paying-too-much:371,412, why-we-built-nestbook:350, what-does-a-bnb-need:351, whole-property-rental:390,471, what-inns-with-rooms-need:320,361.
Channel gating (Multi must bypass the flag): client/src/components/Sidebar.jsx:130-132, client/src/pages/ChannelManager.jsx:36,
server/routes/properties.js:1239-1242 (`requireOwnerChannelManagerAccess`), server/routes/stripe.js add/remove 610-670 + webhook 999-1017,
Settings.jsx dev plan switcher 620-640, 1138-1176; auth.js dev switch 509-531; Billing.jsx CM card 569-625 (should be hidden/“included” on Multi).

## Next
Get user decisions (new prices, whether existing Multi subs with the add-on line item get it removed/refunded), then implement as one change.
