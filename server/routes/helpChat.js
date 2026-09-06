// POST /api/help-chat — AI help assistant.
//
// Answers a user's question conversationally, grounded strictly in the live
// help-bot knowledge base (server/docs/help-bot-knowledge.md), and replies in
// the user's own language. Uses Claude Haiku via a plain fetch to the Messages
// API — this is a high-volume, low-complexity, cost-sensitive task and there is
// no Anthropic SDK in the repo.
//
// The knowledge file is English-only; the system prompt tells the model to
// translate its answer into the user's language. It also carries the asking
// user's plan / Bar & Charges add-on / rental mode so the model can honour the
// plan- and mode-awareness rules the file spells out in its Section 0.
//
// ANTHROPIC_API_KEY must be set in server/.env (never hardcoded, never in
// ecosystem.config.cjs — same rule as STRIPE_MODE). If it's missing the route
// still responds, with a friendly "not available right now" message.

import { Router } from 'express';
import db from '../db/database.js';
import { readHelpKnowledge } from '../utils/helpContent.js';

export const helpChatRouter = Router();

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 800;

// The 5 UI languages the assistant can reply in / that the canned messages
// below cover. Mirrors HELP_CHAT_LANGS in client/src/components/helpChatStrings.js.
const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es', 'nl'];

// ── Per-user rate limit — 30 messages per rolling hour ───────────────────────
// In-memory (same approach as routes/superAdminAuth.js). Keyed by user id.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map(); // userId -> number[] (request timestamps, ms)

function checkRateLimit(userId) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

// Occasionally sweep stale entries so the Map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [userId, times] of hits) {
    const recent = times.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length) hits.set(userId, recent);
    else hits.delete(userId);
  }
}, RATE_WINDOW_MS).unref?.();

// ── Localised canned messages ───────────────────────────────────────────────
const RATE_LIMITED_MSG = {
  en: "You've asked me a lot in a short space of time — give it a few minutes and then ask me again.",
  fr: "Vous m'avez posé beaucoup de questions en peu de temps — patientez quelques minutes puis réessayez.",
  de: "Sie haben in kurzer Zeit viel gefragt — warten Sie ein paar Minuten und fragen Sie dann erneut.",
  es: "Me has preguntado mucho en poco tiempo — espera unos minutos y vuelve a intentarlo.",
  nl: "Je hebt me in korte tijd veel gevraagd — wacht een paar minuten en probeer het dan opnieuw.",
};

const UNAVAILABLE_MSG = {
  en: "The help assistant isn't available right now. You can browse the full Help Centre, or use the error-report tool at the bottom of Settings to reach our team.",
  fr: "L'assistant d'aide n'est pas disponible pour le moment. Consultez le centre d'aide complet, ou utilisez l'outil de signalement en bas des Paramètres pour joindre notre équipe.",
  de: "Der Hilfe-Assistent ist gerade nicht verfügbar. Sie können das vollständige Hilfe-Center durchsuchen oder das Fehlerbericht-Tool unten in den Einstellungen nutzen, um unser Team zu erreichen.",
  es: "El asistente de ayuda no está disponible ahora mismo. Puedes consultar el Centro de ayuda completo o usar la herramienta de informe de errores al final de Ajustes para contactar con nuestro equipo.",
  nl: "De hulpassistent is momenteel niet beschikbaar. Bekijk het volledige Helpcentrum of gebruik de foutrapportagetool onderaan Instellingen om ons team te bereiken.",
};

// One query for everything the prompt needs about the asking user. The JWT
// only carries userId / role / propertyId, so plan / add-on / rental mode have
// to come from the DB — but this replaces (not adds to) the language lookup
// the route already did, so it's still a single round-trip.
function loadUserContext(userId) {
  try {
    return db.prepare(`
      SELECT u.language, u.plan, u.has_charges_addon,
             p.rental_type, p.un_sub_type, p.ir_room_mode
      FROM users u
      LEFT JOIN properties p ON p.id = u.property_id
      WHERE u.id = ?
    `).get(userId) ?? null;
  } catch {
    return null;
  }
}

function resolveLang(bodyLang, ctx) {
  if (SUPPORTED_LANGS.includes(bodyLang)) return bodyLang;
  if (ctx && SUPPORTED_LANGS.includes(ctx.language)) return ctx.language;
  return 'en';
}

// Human-readable rental-mode label, matching the "Mode key" in Section 0 of
// the knowledge file.
function describeMode(ctx) {
  if (!ctx || !ctx.rental_type) return 'Not set up yet (no property configured)';
  if (ctx.rental_type === 'whole_property') return 'WP (Whole Property)';
  if (ctx.rental_type === 'units') {
    return {
      aparthotel:         'SC-A (Self-Catering, Aparthotel sub-type)',
      glamping:           'SC-G (Self-Catering, Glamping sub-type)',
      serviced_apartment: 'SC-H (Self-Catering, Holiday Rentals sub-type)',
    }[ctx.un_sub_type] ?? 'SC (Self-Catering)';
  }
  return ctx.ir_room_mode === 'categories'
    ? 'IR-C (Individual Rooms, Categories)'
    : 'IR-N (Individual Rooms, Named Rooms)';
}

function accountContextBlock(ctx) {
  const plan = ctx?.plan ?? 'free';
  const planLabel = { free: 'Free', pro: 'Pro', multi: 'Multi' }[plan] ?? plan;
  return `THIS USER'S ACCOUNT (use as the source of truth for what they can and can't do — never guess from the screen they're on):
- Plan: ${planLabel}
- Bar & Charges add-on: ${ctx?.has_charges_addon ? 'yes' : 'no'}
- Rental mode: ${describeMode(ctx)}

Apply the plan- and mode-awareness rules from Section 0 of the knowledge base: only describe a feature as available to this user if their plan and mode actually support it, and if they ask about something they don't have, say so plainly and name what unlocks it — factually, never as a sales pitch.`;
}

// Two system blocks: the big, stable knowledge base first (cached — shared
// across every user and language), then the small per-request instruction +
// account-context block (not worth caching, changes with lang/plan/mode).
function buildSystemBlocks(knowledge, lang, ctx) {
  const langName = { en: 'English', fr: 'French', de: 'German', es: 'Spanish', nl: 'Dutch' }[lang] ?? 'English';

  const knowledgeBlock = `You are the in-app help assistant for NestBook, booking and property-management software for small hospitality businesses (B&Bs, gîtes, guesthouses, holiday rentals).

The NestBook knowledge base below is your single source of truth. Follow the instructions inside it, especially Section 0 (how to answer, plan/mode awareness) and Section 14 (handling gaps).

NestBook knowledge base:
---
${knowledge}
---`;

  const instructionBlock = `Answer the user's question using ONLY the NestBook knowledge base above.

Core rules (the knowledge base expands on these):
- Write conversationally, in your own words. NEVER quote or paste the knowledge base text verbatim — always paraphrase and explain.
- Stay strictly grounded in it. Do NOT invent features, prices, plan limits, or policies that aren't there.
- If the question genuinely isn't covered, say plainly: "I'm not sure about that — try the error-report tool at the bottom of your Settings page and our team will help." Do not guess.
- Keep answers short and direct — usually 1 to 4 sentences. Use a short list only when the task genuinely has steps.
- NestBook's voice: warm, direct, human, plain-spoken. Never corporate, never salesy, no filler like "Great question!" or "I'd be happy to help".
- Reply in ${langName} — the same language the user is writing in — even though the knowledge base is written in English.

${accountContextBlock(ctx)}`;

  return [
    { type: 'text', text: knowledgeBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: instructionBlock },
  ];
}

// ── POST /api/help-chat ─────────────────────────────────────────────────────
helpChatRouter.post('/', async (req, res) => {
  const userId = req.user?.userId;
  const { message, conversation_history, route, language } = req.body ?? {};

  const ctx = loadUserContext(userId);
  const lang = resolveLang(language, ctx);

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A message is required.' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'That message is too long.' });
  }

  if (userId && !checkRateLimit(userId)) {
    return res.json({ reply: RATE_LIMITED_MSG[lang] ?? RATE_LIMITED_MSG.en, rate_limited: true });
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) {
    console.warn('[help-chat] ANTHROPIC_API_KEY is not set in server/.env — help chat is disabled.');
    return res.json({ reply: UNAVAILABLE_MSG[lang] ?? UNAVAILABLE_MSG.en, unavailable: true });
  }

  let knowledge;
  try {
    knowledge = readHelpKnowledge();
  } catch (err) {
    console.error('[help-chat] Failed to read help-bot-knowledge.md:', err.message);
    return res.json({ reply: UNAVAILABLE_MSG[lang] ?? UNAVAILABLE_MSG.en, unavailable: true });
  }

  // Trim history to the last few turns, plain user/assistant text only.
  const history = Array.isArray(conversation_history) ? conversation_history : [];
  const trimmedHistory = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const routeNote = typeof route === 'string' && route
    ? `\n\n(The user is currently on the "${route}" screen of the app — use this only as a hint to what they might be asking about.)`
    : '';

  const messages = [
    ...trimmedHistory,
    { role: 'user', content: message.trim() + routeNote },
  ];

  try {
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // First block (the knowledge base) is cache_control'd — it's large and
        // only changes when help-bot-knowledge.md is edited, at which point the
        // cache re-warms automatically on the next request.
        system: buildSystemBlocks(knowledge, lang, ctx),
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text().catch(() => '');
      console.error(`[help-chat] Anthropic API ${anthropicRes.status}:`, detail.slice(0, 500));
      return res.json({ reply: UNAVAILABLE_MSG[lang] ?? UNAVAILABLE_MSG.en, unavailable: true });
    }

    const data = await anthropicRes.json();
    const reply = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!reply) {
      return res.json({ reply: UNAVAILABLE_MSG[lang] ?? UNAVAILABLE_MSG.en, unavailable: true });
    }

    return res.json({ reply });
  } catch (err) {
    console.error('[help-chat] Request failed:', err.message);
    return res.json({ reply: UNAVAILABLE_MSG[lang] ?? UNAVAILABLE_MSG.en, unavailable: true });
  }
});
