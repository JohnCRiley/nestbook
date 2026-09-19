# Pricing update — Phase A (logic) + Phase B (display surfaces) DONE; awaiting deploy

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

## Phase A — DONE (committed to main, NOT deployed)
New prices: Pro £14/€16, Multi £25/€29, Bar & Charges £4/€5 (Channel add-on unchanged £9/€10, Pro only). Fixed per-currency Prices, no Adaptive Pricing.
- Env (server/.env local is reference only; PRODUCTION .env must be updated by hand before deploy): STRIPE_PRICE_{PRO,MULTI}_{GBP,EUR} and STRIPE_PRICE_CHARGES_ADDON_{GBP,EUR} = new IDs. Old STRIPE_PRICE_PRO/MULTI are only READ as a legacy fallback for plan detection (utils/stripePrices.js) — safe to delete once John is migrated.
- server/utils/currency.js + client/src/utils/currency.js: language→currency (en→GBP, fr/de/es/nl→EUR, other→GBP). Client also has PLAN_PRICES + planPrice(plan, lang) for Phase B display.
- server/utils/stripePrices.js: ID lookup/reverse-lookup, PLAN_MRR {pro:{GBP:14,EUR:16},multi:{GBP:25,EUR:29}}, sumMrr.
- Checkout / promo-checkout / registration-coupon subscription pick the Price by currency: existing Stripe customer's currency wins, else users.language. Coupons are percent-off, so no recalculation needed.
- subscriptions.currency column added (schema.js); written by checkout webhook, sync-session, promo path, subscription.updated webhook, registration-coupon path. NULL = GBP.
- Channel Manager: hasChannelManagerAccess(plan, flag) (server/utils/channelManagerAccess.js; mirrored in client currency.js) used by properties.js gate, Sidebar, ChannelManager page. Multi bypasses flag; add route rejects Multi; Billing card shows 'Included in your Multi plan' badge. Webhook still mirrors real add-on line items.
- MRR: every admin figure is now {GBP,EUR} (never summed). Endpoints: /stats, /bi (mrr, mrrTrend[].mrr/proMrr/multiMrr, netNewRevenue), /business/stats (mrr, arr objects; vatRolling12 = GBP only), /business/month (+revenueEur), /export (flat mrrGBP/mrrEUR/revenueGBP/revenueEUR, per-row currency). UK tax/P&L pages stay GBP-only by design (no FX assumed). Revenue.jsx dashboard + accountant exports updated.
- Verified locally: logic harness (ids, lang→ccy, gate, MRR), all admin MRR endpoints (£92 = 3 Pro + 2 Multi). NOT verified: real Stripe calls (no key locally).
- server/scripts/migrate-sub-to-fixed-price.mjs: dry-run-by-default migration for John's sub. NOT RUN — awaiting confirmation of sub id.

## Still to do
- Phase B: all display surfaces (see locations above) — use client planPrice(); index.html/compare.html/marketing/blogs are static HTML and need their own language switch logic.
- Migrate John's subscription (Stripe) — see script. Update prod .env. Then deploy (update.sh) only after Phase B.
- Channel Manager add-on text on landing/compare/help still says add-on on Multi — Phase B.

## Phase B — DONE (committed to main, NOT deployed; deploy Phase A+B together)
- React: Pricing.jsx (single currency via planPrice(plan, locale); sends currency to checkout so displayed == charged — server: create-checkout-session accepts optional currency, existing Stripe customer's locked currency still wins), UpgradeModal (5 langs, 'From £14' / '16 €' etc.), i18n planProFeatures/planProAddonLine/chargesAddonPrice/channelAddonPrice (EN £, FR/ES/DE/NL €; channelAddonPrice added for FR/ES/DE/NL). EN Multi feature list now has 'Channel Manager included…'. Revenue.jsx PDF literals were already replaced in Phase A.
- Static pages (blob/dictionary edits, each language its own single currency): index.html (blob + meta + JSON-LD 14/25 GBP + pricing cards now data-i18n pricing.pro.price/multi.price), compare.html (headers, mobile cards, B&C row, detail.trial, new compare.pro.price/multi.price keys, 5 langs), how-it-works.html (blob + statics; p2/p3 amounts now data-i18n so they translate), calculator.html, help.html (blob 5 langs; also fixed old Multi £38 -> £25), marketing/compare-plans.html (EN, £ only).
- Annual figure: 14 x 12 = £168 (EUR 16 x 12 = €192 in FR/ES/DE/NL). nbFlat/NB_FLAT constants updated; how-it-works default calc verified by running its JS: saves £732/yr vs Booking.com, £762 vs Airbnb, £61/mo, break-even 4 bookings; static HTML defaults match.
- landing-ai-knowledge.md: all prices, currency-by-language rule, Channel Manager add-on section (live; included on Multi), 'not built yet' notes removed, VAT-section prices. schema.js seeded outreach email templates 'from £14' (only affects fresh DBs — existing email_templates rows are NOT rewritten).
- PhoneOutreach.jsx call-script £19 -> £14. Unreferenced extra-language JSONs (zh-CN, vi, th, ms, ja, id) + en-translations.json: £19 -> £14 (unused/dead, trivial).
- Dead scripts: add_bc_marketing.mjs, fix_bc_tiles.mjs — one-off HTML patchers (23 Jul 2026), no references; NOT updated, and must never be re-run (they would re-insert old £6/£19 strings).
- NOT touched (per John): all print flyers/handouts/feather-flag, blog posts.

## Open items needing John's wording (FR/ES/DE/NL not drafted)
- Multi feature bullet 'Channel Manager included…' in i18n planMultiFeatures (fr/es/de/nl) and in UpgradeModal / index.html pricing.multi / compare.html (no CM row, deferred).
- channelIncludedInPlan badge ('Included in your Multi plan') + the other channelAddon* Billing strings are EN-only.
- Landing 'channelManager.caption' (index.html blob, all 5 langs) still says 'Add-on available on the Pro and Multi plans' — price now correct but wording is wrong for Multi (included).
- Pricing.jsx footnote planAdaptivePricingNote ('Price shown in your local currency at checkout') is now slightly stale; wording decision.

## Final wording pass — DONE (John-supplied translations, committed, NOT deployed)
- 'Channel Manager included' bullet (EN/FR/ES/DE/NL): i18n planMultiFeatures (all 5), UpgradeModal Multi list (name-only entry, desc now optional), index.html Multi card (new key pricing.multi.fCM in blob).
- channelIncludedInPlan badge: all 5 languages in i18n/index.js.
- Landing channelManager.caption: replaced entirely in all 5 languages + static EN HTML.
- planAdaptivePricingNote: EN only -> 'Prices shown in your selected language's currency.' NOTE: FR/ES/DE/NL still carry the OLD translated 'price shown in your local currency at checkout' wording (the key exists in all 5 languages) — needs John's translations.
- Remaining channelAddon* Billing strings (Title/Desc/Add/Adding/Active/Remove/Removing/RemoveConfirm/Activated/Removed/GenericError) are still EN-only — awaiting John's translations.

## Starter heading fix — DONE (committed, NOT deployed)
- Pricing.jsx Starter tile heading was hardcoded 'Free' + translated '/suffix'. Now new i18n key planStarterPrice (EN Free / FR Gratuit / ES Gratis / DE Kostenlos / NL Gratis), suffix removed for the free tile only (Pro/Multi keep '/per month'). Verified live in all 5 languages (property.locale switched via API, restored to en). No other hardcoded-English-word patterns found in Pricing.jsx or UpgradeModal.jsx.
- STILL OPEN (no translations have been supplied — never applied): the 11 channelAddon* keys (Title, Desc, Add, Adding, Active, Remove, Removing, RemoveConfirm, Activated, Removed, GenericError) are EN-only; planAdaptivePricingNote FR/ES/DE/NL still carry the OLD 'price shown in your local currency at checkout' wording.
