// POST /api/help-chat — AI help assistant.
//
// Answers a user's question conversationally, grounded strictly in the live
// Help Centre content (server/public/help.html), in the user's own language.
// Uses Claude Haiku via a plain fetch to the Messages API — this is a
// high-volume, low-complexity, cost-sensitive task and there is no Anthropic
// SDK in the repo.
//
// ANTHROPIC_API_KEY must be set in server/.env (never hardcoded, never in
// ecosystem.config.cjs — same rule as STRIPE_MODE). If it's missing the route
// still responds, with a friendly "not available right now" message.

import { Router } from 'express';
import db from '../db/database.js';
import { extractHelpText, SUPPORTED_HELP_LANGS } from '../utils/helpContent.js';

export const helpChatRouter = Router();

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 800;

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

function resolveLang(bodyLang, userId) {
  if (SUPPORTED_HELP_LANGS.includes(bodyLang)) return bodyLang;
  try {
    const row = db.prepare('SELECT language FROM users WHERE id = ?').get(userId);
    if (row && SUPPORTED_HELP_LANGS.includes(row.language)) return row.language;
  } catch {
    // fall through to default
  }
  return 'en';
}

function buildSystemPrompt(helpText, lang) {
  const langName = { en: 'English', fr: 'French', de: 'German', es: 'Spanish', nl: 'Dutch' }[lang] ?? 'English';
  return `You are the in-app help assistant for NestBook, booking and property-management software for small hospitality businesses (B&Bs, gîtes, guesthouses, holiday rentals).

Your job: answer the user's question helpfully, using ONLY the Help Centre content provided below.

How to answer:
- Write in your own words, conversationally. NEVER quote or paste the help text verbatim — always paraphrase and explain it as if talking to the person.
- Stay strictly grounded in the Help Centre content below. Do NOT invent features, prices, plan limits, or policies that aren't in it. If two things could be true, say what the help content actually says.
- If the question genuinely isn't covered by the content below, say plainly: "I'm not sure about that — try the error-report tool at the bottom of your Settings page and our team will help." Do not guess.
- Keep answers short and direct — usually 1 to 4 sentences. Give steps as a short list only when the task actually has steps.
- Match NestBook's brand voice: warm, direct, human, plain-spoken. Never corporate, never salesy, no filler like "Great question!" or "I'd be happy to help".
- Reply in ${langName} — the same language the user is writing in — regardless of the language of the help content.

Help Centre content:
---
${helpText}
---`;
}

// ── POST /api/help-chat ─────────────────────────────────────────────────────
helpChatRouter.post('/', async (req, res) => {
  const userId = req.user?.userId;
  const { message, conversation_history, route, language } = req.body ?? {};

  const lang = resolveLang(language, userId);

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

  let helpText;
  try {
    ({ text: helpText } = extractHelpText(lang));
  } catch (err) {
    console.error('[help-chat] Failed to read help.html:', err.message);
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
        system: [
          {
            type: 'text',
            text: buildSystemPrompt(helpText, lang),
            // Cache the (large, mostly-stable) help content so repeat questions
            // in the same session are far cheaper. Re-warms automatically after
            // any help.html edit.
            cache_control: { type: 'ephemeral' },
          },
        ],
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
