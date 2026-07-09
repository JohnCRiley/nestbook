import Stripe from 'stripe';

// Single mode-aware Stripe client shared across all server routes.
// Controlled by STRIPE_MODE in server/.env:
//   test → STRIPE_TEST_SECRET_KEY  (sandbox, no real money)
//   live → STRIPE_SECRET_KEY       (production, real payments)
//
// Pinned to acacia (last stable v1-era API version) so Stripe emits v1 events
// (account.updated etc.) rather than v2.core.* events introduced in dahlia.
// stripe@21 hardcodes 2026-03-25.dahlia which routes webhooks through v2.
export const STRIPE_MODE = process.env.STRIPE_MODE ?? 'live';

const stripeSecretKey = STRIPE_MODE === 'test'
  ? process.env.STRIPE_TEST_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' })
  : null;
