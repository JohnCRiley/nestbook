import db from '../db/database.js';

// ── Stripe Connect status evaluation ─────────────────────────────────────────
// Single place that turns a Stripe account object into our stored
// users.stripe_connect_status. Used by both the account.updated webhook and the
// periodic reconciliation job so the two can never disagree on the rules.
//
// Rules:
//   • status is 'active' ONLY when charges_enabled && payouts_enabled &&
//     details_submitted are all true — never on a partial subset.
//   • Stripe fires several account.updated events during onboarding and they can
//     arrive out of order / close together. An earlier, less-complete event must
//     never clobber a later, more-complete one, so we never downgrade an
//     already-'active' account back to 'pending' from an incoming event. If one
//     tries, we log a WARNING (not silently swallow it) and keep 'active'.
//   • details_submitted is likewise only ratcheted up (1 stays 1) to stop an
//     out-of-order event flipping the Billing-page flag back off.
//   • Idempotent: re-processing the same event is a harmless no-op.
//
// `connectUser` must have { id, stripe_connect_status, stripe_connect_details_submitted }.
// `source` is a short label for the logs ('webhook' | 'reconcile').
// Returns the status string that is now stored.
export function applyConnectAccountState(connectUser, account, source = 'webhook') {
  const chargesEnabled   = !!account.charges_enabled;
  const payoutsEnabled   = !!account.payouts_enabled;
  const detailsSubmitted = !!account.details_submitted;
  const fullyEnabled     = chargesEnabled && payoutsEnabled && detailsSubmitted;
  const computedStatus   = fullyEnabled ? 'active' : 'pending';

  const currentStatus          = connectUser.stripe_connect_status ?? null;
  const currentDetailsFlag     = connectUser.stripe_connect_details_submitted ? 1 : 0;

  console.log(
    `[stripe] Connect account ${account.id} (${source}) — ` +
    `charges_enabled=${chargesEnabled}, payouts_enabled=${payoutsEnabled}, ` +
    `details_submitted=${detailsSubmitted}, current_status=${currentStatus}, ` +
    `computed_status=${computedStatus}`
  );

  // Never downgrade a genuinely-active account off the back of an incoming
  // event. Log loudly so we have visibility if this recurs — a real Stripe
  // disablement (fraud review, missing info after the fact) would land here and
  // needs a human to action it deliberately.
  if (currentStatus === 'active' && computedStatus === 'pending') {
    console.warn(
      `[stripe] ⚠️  Connect account ${account.id} (user ${connectUser.id}) would downgrade ` +
      `active → pending via ${source} (charges=${chargesEnabled}, payouts=${payoutsEnabled}, ` +
      `details=${detailsSubmitted}). Suppressed — keeping 'active'. If Stripe has genuinely ` +
      `disabled this account, correct users.stripe_connect_status manually.`
    );
    return 'active';
  }

  const nextDetailsFlag = detailsSubmitted ? 1 : currentDetailsFlag;

  if (computedStatus === currentStatus && nextDetailsFlag === currentDetailsFlag) {
    // Nothing to do — idempotent no-op.
    return currentStatus;
  }

  db.prepare(
    'UPDATE users SET stripe_connect_status = ?, stripe_connect_details_submitted = ? WHERE id = ?'
  ).run(computedStatus, nextDetailsFlag, connectUser.id);

  if (computedStatus !== currentStatus) {
    console.log(
      `[stripe] Connect account ${account.id} (user ${connectUser.id}) status ` +
      `${currentStatus} → ${computedStatus} (${source})`
    );
  }

  return computedStatus;
}
