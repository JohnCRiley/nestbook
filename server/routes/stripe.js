import { Router } from 'express';
import Stripe from 'stripe';
import db from '../db/database.js';
import { sendUpgradeWelcome, sendMultiWelcome, sendPaymentFailedEmail, sendPromoPaymentConfirmedEmail } from '../email/emailService.js';
import { logAction, getIp } from '../utils/auditLog.js';

export const stripeRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLAN_PRICES = {
  pro:   process.env.STRIPE_PRICE_PRO,
  multi: process.env.STRIPE_PRICE_MULTI,
};

// ── GET /api/stripe/subscription ─────────────────────────────────────────────
// Returns the logged-in user's current plan and subscription status.
stripeRouter.get('/subscription', (req, res) => {
  const user = db.prepare('SELECT plan, subscription_status, past_due_since FROM users WHERE id = ?').get(req.user.userId);
  const sub  = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.userId);

  res.json({
    plan:                user?.plan                ?? 'free',
    status:              sub?.status               ?? 'active',
    subscription_status: user?.subscription_status ?? 'active',
    past_due_since:      user?.past_due_since       ?? null,
    current_period_end:  sub?.current_period_end   ?? null,
    cancel_at_period_end: sub?.cancel_at_period_end ?? 0,
    notes:               sub?.notes                ?? null,
  });
});

// ── POST /api/stripe/cancel-subscription ─────────────────────────────────────
// Customer-facing: cancels at period end so they keep access until it expires.
stripeRouter.post('/cancel-subscription', async (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.userId);

  if (!sub?.stripe_subscription_id) {
    return res.status(400).json({ error: 'No active Stripe subscription found.' });
  }
  if (sub.cancel_at_period_end) {
    return res.status(400).json({ error: 'Subscription is already scheduled for cancellation.' });
  }

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
    db.prepare('UPDATE subscriptions SET cancel_at_period_end = 1 WHERE user_id = ?')
      .run(req.user.userId);
    res.json({ success: true, cancel_at: sub.current_period_end });
  } catch (err) {
    console.error('[stripe/cancel-subscription]', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription. Please try again.' });
  }
});

// ── POST /api/stripe/sync-session ────────────────────────────────────────────
// Retrieves a completed Stripe checkout session by ID and syncs the resulting
// subscription to the database. Called by the success page so the plan updates
// immediately without needing a webhook — useful in local dev and as a fallback.
stripeRouter.post('/sync-session', async (req, res) => {
  const { sessionId } = req.body;
  console.log('[sync-session] received sessionId:', sessionId);

  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    console.log('[sync-session] session status:', session.status, '| payment_status:', session.payment_status);
    console.log('[sync-session] metadata:', session.metadata);

    // Accept 'paid' or 'no_payment_required' (Stripe can return either on
    // subscription sessions depending on timing and trial configuration).
    const isComplete = session.status === 'complete' ||
                       session.payment_status === 'paid' ||
                       session.payment_status === 'no_payment_required';
    if (!isComplete) {
      console.log('[sync-session] session not complete — aborting');
      return res.status(400).json({ error: 'Session not yet complete.' });
    }

    const userId     = session.metadata?.userId;
    const sub        = session.subscription;
    const priceId    = sub?.items?.data[0]?.price?.id;
    const plan       = priceId === process.env.STRIPE_PRICE_MULTI ? 'multi' : 'pro';
    const customerId = session.customer;

    console.log('[sync-session] userId:', userId, '| plan resolved to:', plan);
    console.log('[sync-session] priceId from Stripe:', priceId);
    console.log('[sync-session] STRIPE_PRICE_PRO env:', process.env.STRIPE_PRICE_PRO);
    console.log('[sync-session] raw current_period_end:', sub?.current_period_end);

    // current_period_end can be null in test mode if the subscription hasn't
    // fully settled yet — fall back to 30 days from now rather than crashing.
    const rawEnd    = sub?.current_period_end;
    const periodEnd = rawEnd
      ? new Date(rawEnd * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Capture current plan before updating so we can detect upgrades.
    const oldUser = db.prepare('SELECT id, name, email, plan FROM users WHERE id = ?').get(userId);
    const oldPlan = oldUser?.plan ?? 'free';

    // Update the user's plan first — this is the critical step.
    const userUpdate = db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);
    console.log('[sync-session] UPDATE users changes:', userUpdate.changes, '| userId used:', userId);

    // Upsert the subscription record for billing history.
    const existingSub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(userId);
    console.log('[sync-session] existing subscription row:', existingSub);

    if (existingSub) {
      const result = db.prepare(`
        UPDATE subscriptions
        SET stripe_customer_id = ?, stripe_subscription_id = ?, plan = ?,
            status = 'active', current_period_end = ?, cancel_at_period_end = 0
        WHERE user_id = ?
      `).run(customerId, sub?.id, plan, periodEnd, userId);
      console.log('[sync-session] UPDATE subscriptions changes:', result.changes);
    } else {
      db.prepare(`
        INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
        VALUES (?, ?, ?, ?, 'active', ?)
      `).run(userId, customerId, sub?.id, plan, periodEnd);
      console.log('[sync-session] INSERT subscriptions done');
    }

    // Increment discount code usage if the user had one applied
    const userRow = db.prepare('SELECT discount_code FROM users WHERE id = ?').get(userId);
    if (userRow?.discount_code) {
      db.prepare('UPDATE discount_codes SET current_uses = current_uses + 1 WHERE code = ? AND active = 1')
        .run(userRow.discount_code.toUpperCase());
    }

    // Fire upgrade email + audit log if the plan actually changed upward.
    console.log('[stripe/upgrade] Old plan:', oldPlan, '→ New plan:', plan);
    console.log('[stripe/upgrade] User:', oldUser?.email);
    console.log('[email] RESEND_API_KEY set:', !!process.env.RESEND_API_KEY);
    if (oldPlan !== plan && oldUser) {
      const property = db.prepare('SELECT * FROM properties WHERE owner_id = ? ORDER BY id LIMIT 1').get(userId);
      if (plan === 'multi') {
        sendMultiWelcome(oldUser, property)
          .catch(err => console.error('[stripe] Multi email failed:', err.message));
      } else {
        sendUpgradeWelcome(oldUser, property, periodEnd)
          .catch(err => console.error('[stripe] Upgrade email failed:', err.message));
      }
      logAction(db, {
        propertyId: property?.id ?? null,
        userId:     Number(userId),
        userName:   oldUser.name,
        userEmail:  oldUser.email,
        userRole:   'owner',
        action:     'PLAN_UPGRADED',
        category:   'auth',
        detail:     `${oldPlan} → ${plan}`,
        ipAddress:  getIp(req),
      });
    } else {
      console.log('[stripe/upgrade] Skipping email — plan unchanged or user missing');
    }

    res.json({ plan });
  } catch (err) {
    console.error('[sync-session] error:', err.message);
    res.status(500).json({ error: 'Failed to sync session.' });
  }
});

// ── POST /api/stripe/create-checkout-session ──────────────────────────────────
// Creates a Stripe Checkout session for the chosen plan, returns the hosted URL.
// Automatically applies the user's discount code if valid.
stripeRouter.post('/create-checkout-session', async (req, res) => {
  const { plan } = req.body;

  if (!plan || !PLAN_PRICES[plan]) {
    return res.status(400).json({ error: 'Invalid plan. Choose "pro" or "multi".' });
  }

  const user = db.prepare('SELECT id, name, email, discount_code FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Resolve any valid discount code for this user
  let discounts = [];
  if (user.discount_code) {
    const dc = db.prepare(`
      SELECT * FROM discount_codes
      WHERE code = ? AND active = 1
    `).get(user.discount_code.toUpperCase());

    if (dc?.stripe_coupon_id && (!dc.max_uses || dc.current_uses < dc.max_uses)) {
      discounts = [{ coupon: dc.stripe_coupon_id }];
    }
  }

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  try {
    const session = await stripe.checkout.sessions.create({
      mode:       'subscription',
      line_items: [{ price: PLAN_PRICES[plan], quantity: 1 }],
      customer_email: user.email,
      metadata:   { userId: String(user.id) },
      subscription_data: { trial_period_days: 30 },
      success_url: `https://nestbook.io/app/dashboard?upgraded=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `https://nestbook.io/app/pricing`,
      ...(discounts.length ? { discounts } : {}),
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

// ── POST /api/stripe/create-promo-checkout ────────────────────────────────────
// Creates a Stripe Checkout session for promotional Pro users.
// Saves the card and creates a subscription that only charges after trial_ends_at.
stripeRouter.post('/create-promo-checkout', async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (!user.trial_ends_at) {
      return res.status(400).json({ error: 'No promotional period found.' });
    }

    // Create or reuse Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email,
        name:     user.name || user.email,
        metadata: { nestbook_user_id: String(user.id) },
      });
      customerId = customer.id;
      db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?')
        .run(customerId, user.id);
    }

    const trialEnd = Math.floor(new Date(user.trial_ends_at).getTime() / 1000);

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_end: trialEnd,
        metadata: {
          userId:           String(user.id),
          promo_conversion: 'true',
        },
      },
      success_url: `https://nestbook.io/app/billing?billing=success`,
      cancel_url:  `https://nestbook.io/app/billing?billing=cancelled`,
      metadata: {
        userId: String(user.id),
        type:   'promo_conversion',
      },
    });

    console.log(`[stripe] Promo checkout created for ${user.email} — trial ends ${user.trial_ends_at}`);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] create-promo-checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stripe/invoices ──────────────────────────────────────────────────
stripeRouter.get('/invoices', async (req, res) => {
  try {
    const user = db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(req.user.userId);
    if (!user?.stripe_customer_id) {
      return res.json({ invoices: [] });
    }
    const result = await stripe.invoices.list({
      customer: user.stripe_customer_id,
      limit: 24,
    });
    const invoices = result.data.map(inv => ({
      id:                 inv.id,
      date:               inv.created,
      total:              inv.total / 100,
      currency:           inv.currency,
      status:             inv.status,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf:        inv.invoice_pdf,
    }));
    res.json({ invoices });
  } catch (e) {
    console.error('[stripe] invoices list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/stripe/webhook ──────────────────────────────────────────────────
// Exported as a plain handler and mounted directly in index.js BEFORE
// requireAuth and express.json(). Stripe uses its own signature verification
// via stripe.webhooks.constructEvent() — no JWT needed.
export async function stripeWebhookHandler(req, res) {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    // If webhook secret is not yet configured, skip signature verification
    // (safe for local dev; always set it in production).
    event = secret
      ? stripe.webhooks.constructEvent(req.body, sig, secret)
      : JSON.parse(req.body.toString());
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session        = event.data.object;
        const userId         = session.metadata?.userId;
        const subscriptionId = session.subscription;
        const customerId     = session.customer;
        const isPromoConversion = session.metadata?.type === 'promo_conversion';

        if (!userId || !subscriptionId) break;

        if (isPromoConversion) {
          // Promo user added card — save Stripe IDs to users table and upsert subscriptions
          db.prepare(`
            UPDATE users
            SET stripe_customer_id = ?, stripe_subscription_id = ?
            WHERE id = ?
          `).run(customerId, subscriptionId, userId);

          const existingPromoSub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(userId);
          const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
          const periodEnd = stripeSub.current_period_end
            ? new Date(stripeSub.current_period_end * 1000).toISOString()
            : null;
          if (existingPromoSub) {
            db.prepare(`
              UPDATE subscriptions
              SET stripe_customer_id = ?, stripe_subscription_id = ?, plan = 'pro',
                  status = 'active', current_period_end = ?, cancel_at_period_end = 0
              WHERE user_id = ?
            `).run(customerId, subscriptionId, periodEnd, userId);
          } else {
            db.prepare(`
              INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
              VALUES (?, ?, ?, 'pro', 'active', ?)
            `).run(userId, customerId, subscriptionId, periodEnd);
          }

          const promoUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
          if (promoUser) {
            sendPromoPaymentConfirmedEmail(promoUser)
              .catch(err => console.error('[stripe] Promo confirmed email failed:', err.message));
          }
          console.log(`[stripe] Promo conversion complete for user ${userId}`);
          break;
        }

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId   = stripeSub.items.data[0]?.price?.id;
        const plan      = priceId === process.env.STRIPE_PRICE_MULTI ? 'multi' : 'pro';
        const periodEnd = stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000).toISOString()
          : null;

        const oldWebhookUser = db.prepare('SELECT id, name, email, plan FROM users WHERE id = ?').get(userId);
        const oldWebhookPlan = oldWebhookUser?.plan ?? 'free';

        const existingSub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(userId);
        if (existingSub) {
          db.prepare(`
            UPDATE subscriptions
            SET stripe_customer_id = ?, stripe_subscription_id = ?, plan = ?,
                status = 'active', current_period_end = ?, cancel_at_period_end = 0
            WHERE user_id = ?
          `).run(customerId, subscriptionId, plan, periodEnd, userId);
        } else {
          db.prepare(`
            INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
            VALUES (?, ?, ?, ?, 'active', ?)
          `).run(userId, customerId, subscriptionId, plan, periodEnd);
        }

        db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);
        console.log(`✓ Subscription activated: user ${userId} → ${plan}`);
        console.log('[stripe/webhook/upgrade] Old plan:', oldWebhookPlan, '→ New plan:', plan);
        console.log('[stripe/webhook/upgrade] User:', oldWebhookUser?.email);
        console.log('[email] RESEND_API_KEY set:', !!process.env.RESEND_API_KEY);

        if (oldWebhookPlan !== plan && oldWebhookUser) {
          const webhookProperty = db.prepare('SELECT * FROM properties WHERE owner_id = ? ORDER BY id LIMIT 1').get(userId);
          if (plan === 'multi') {
            sendMultiWelcome(oldWebhookUser, webhookProperty)
              .catch(err => console.error('[stripe] Multi email failed (webhook):', err.message));
          } else {
            sendUpgradeWelcome(oldWebhookUser, webhookProperty, periodEnd)
              .catch(err => console.error('[stripe] Upgrade email failed (webhook):', err.message));
          }
          logAction(db, {
            propertyId: webhookProperty?.id ?? null,
            userId:     Number(userId),
            userName:   oldWebhookUser.name,
            userEmail:  oldWebhookUser.email,
            userRole:   'owner',
            action:     'PLAN_UPGRADED',
            category:   'auth',
            detail:     `${oldWebhookPlan} → ${plan}`,
            ipAddress:  null,
          });
        } else {
          console.log('[stripe/webhook/upgrade] Skipping email — plan unchanged or user missing');
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub     = event.data.object;
        const priceId = sub.items.data[0]?.price?.id;
        const plan    = priceId === process.env.STRIPE_PRICE_MULTI ? 'multi' : 'pro';
        const status  = sub.status === 'past_due' ? 'past_due' : 'active';
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        const cancelAtEnd = sub.cancel_at_period_end ? 1 : 0;

        db.prepare(`
          UPDATE subscriptions
          SET plan = ?, status = ?, current_period_end = ?, cancel_at_period_end = ?
          WHERE stripe_subscription_id = ?
        `).run(plan, status, periodEnd, cancelAtEnd, sub.id);

        db.prepare(`
          UPDATE users SET plan = ?
          WHERE id = (SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?)
        `).run(plan, sub.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice    = event.data.object;
        const customerId = invoice.customer;
        const user = db.prepare(`
          SELECT u.id, u.email FROM users u
          JOIN subscriptions s ON s.user_id = u.id
          WHERE s.stripe_customer_id = ?
        `).get(customerId);
        if (user) {
          db.prepare(`
            UPDATE users
            SET subscription_status = 'past_due', past_due_since = datetime('now')
            WHERE id = ? AND subscription_status != 'past_due'
          `).run(user.id);
          sendPaymentFailedEmail(user.email, invoice.hosted_invoice_url)
            .catch(err => console.error('[stripe] Payment-failed email error:', err.message));
          console.log('[webhook] Payment failed for user:', user.email);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice    = event.data.object;
        const customerId = invoice.customer;
        const user = db.prepare(`
          SELECT u.id, u.email FROM users u
          JOIN subscriptions s ON s.user_id = u.id
          WHERE s.stripe_customer_id = ?
        `).get(customerId);
        if (user) {
          db.prepare(`
            UPDATE users
            SET subscription_status = 'active', past_due_since = NULL
            WHERE id = ?
          `).run(user.id);
          console.log('[webhook] Payment succeeded for user:', user.email);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;

        db.prepare(`
          UPDATE subscriptions SET status = 'cancelled', cancel_at_period_end = 0
          WHERE stripe_subscription_id = ?
        `).run(sub.id);

        db.prepare(`
          UPDATE users SET plan = 'free'
          WHERE id = (SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?)
        `).run(sub.id);
        console.log(`✓ Subscription cancelled: ${sub.id}`);
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed.' });
  }

  res.json({ received: true });
}
