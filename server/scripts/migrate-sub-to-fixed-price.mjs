// One-off: move an existing Stripe subscription's plan line item onto one of
// the new fixed per-currency Prices, without cancelling it.
//
//   Dry run (default — prints what it WOULD do, changes nothing):
//     node --env-file=.env scripts/migrate-sub-to-fixed-price.mjs sub_XXXX
//   Apply:
//     node --env-file=.env scripts/migrate-sub-to-fixed-price.mjs sub_XXXX --apply
//
// Run on the host that has the live STRIPE_SECRET_KEY (STRIPE_MODE=live). The
// target Price is chosen by the subscription's own currency, because Stripe
// will not swap a subscription onto a Price in a different currency. Only the
// plan item is swapped — add-on items are left alone — and no proration is
// created (the customer's next invoice simply uses the new amount).
import { stripe } from '../lib/stripeClient.js';
import { planPriceId, planFromPriceId } from '../utils/stripePrices.js';
import { normaliseCurrency } from '../utils/currency.js';

const [subId, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
if (!subId?.startsWith('sub_')) { console.error('Usage: migrate-sub-to-fixed-price.mjs sub_XXXX [--apply]'); process.exit(1); }
if (!stripe) { console.error('No Stripe secret key configured in this environment.'); process.exit(1); }

const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] });
const currency = normaliseCurrency(sub.currency);
console.log(`Subscription ${sub.id}  status=${sub.status}  currency=${sub.currency}  customer=${sub.customer}`);
console.log(`  trial_end=${sub.trial_end}  current_period_end=${sub.current_period_end}  cancel_at_period_end=${sub.cancel_at_period_end}`);
console.log(`  discounts=${JSON.stringify((sub.discounts ?? []).map(d => d.coupon?.id ?? d))}`);
for (const i of sub.items.data) {
  console.log(`  item ${i.id}: price=${i.price.id}  ${(i.price.unit_amount ?? 0) / 100} ${i.price.currency}  recurring=${i.price.recurring?.interval}  plan=${planFromPriceId(i.price.id) ?? '(add-on/other)'}`);
}

const planItem = sub.items.data.find(i => planFromPriceId(i.price.id));
if (!planItem) { console.error('No plan (Pro/Multi) item found on this subscription.'); process.exit(1); }
const plan = planFromPriceId(planItem.price.id);
const target = planPriceId(plan, currency);
if (!target) { console.error(`No STRIPE_PRICE_${plan.toUpperCase()}_${currency} configured.`); process.exit(1); }
if (planItem.price.id === target) { console.log('Already on the target Price — nothing to do.'); process.exit(0); }

console.log(`\nPlan: ${plan}. Would swap item ${planItem.id}: ${planItem.price.id} -> ${target} (proration_behavior=none)`);
if (!apply) { console.log('DRY RUN — re-run with --apply to make the change.'); process.exit(0); }

const updated = await stripe.subscriptions.update(subId, {
  items: [{ id: planItem.id, price: target }],
  proration_behavior: 'none',
});
console.log(`Done. Items now: ${updated.items.data.map(i => `${i.price.id} (${(i.price.unit_amount ?? 0) / 100} ${i.price.currency})`).join(', ')}`);
