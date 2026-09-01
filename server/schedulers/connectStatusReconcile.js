import db from '../db/database.js';
import { stripe } from '../lib/stripeClient.js';
import { applyConnectAccountState } from '../lib/connectStatus.js';

// ── Stripe Connect status reconciliation ─────────────────────────────────────
// Safety net for a missed / silently-failed account.updated webhook.
//
// Any owner whose Connect account is still marked non-'active' locally is
// spot-checked against Stripe's live account state. If Stripe reports the
// account fully enabled (charges + payouts + details) we upgrade to 'active'
// via the same shared evaluator the webhook uses.
//
// Deliberately narrow: only corrects drift, only ever ratchets forward (the
// shared evaluator won't downgrade), logs every correction, and notifies
// nobody — owners are covered by the webhook path going forward.
//
// Runs on boot and every 6 hours.
export async function reconcilePendingConnectAccounts() {
  if (!stripe) {
    console.log('[connect-reconcile] Stripe client not configured — skipping');
    return;
  }

  try {
    const candidates = db.prepare(`
      SELECT id, email, stripe_connect_account_id,
             stripe_connect_status, stripe_connect_details_submitted
      FROM users
      WHERE stripe_connect_account_id IS NOT NULL
        AND (stripe_connect_status IS NULL OR stripe_connect_status != 'active')
    `).all();

    if (candidates.length === 0) return;

    console.log(`[connect-reconcile] Checking ${candidates.length} non-active Connect account(s) against Stripe`);

    let corrected = 0;
    for (const user of candidates) {
      try {
        const account = await stripe.accounts.retrieve(user.stripe_connect_account_id);
        const before  = user.stripe_connect_status ?? null;
        const after   = applyConnectAccountState(user, account, 'reconcile');
        if (after !== before) {
          corrected++;
          console.log(
            `[connect-reconcile] Corrected user ${user.id} (${user.email}) ` +
            `${before} → ${after} — ${user.stripe_connect_account_id} (missed webhook)`
          );
        }
      } catch (err) {
        console.error(
          `[connect-reconcile] ${user.stripe_connect_account_id} (user ${user.id}): ${err.message}`
        );
      }
    }

    console.log(`[connect-reconcile] Done — ${corrected} correction(s) applied`);
  } catch (err) {
    console.error('[connect-reconcile] Error:', err.message);
  }
}
