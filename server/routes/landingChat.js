// POST /api/landing-chat — public landing-page AI assistant.
//
// A chat widget for ANONYMOUS visitors on the public marketing site. No auth,
// no logged-in user, no property/plan context. Answers "should I use NestBook /
// what does it cost / does it suit my property / how is it different" grounded
// strictly in server/docs/landing-ai-knowledge.md, read FRESH on every request
// (so an edit to that file is live with no restart).
//
// This is a completely separate route from /api/help-chat — different audience,
// different knowledge file, different (IP-based) rate-limit bucket. Do not merge.
//
// Uses Claude Haiku via a plain fetch to the Messages API (no Anthropic SDK in
// the repo). ANTHROPIC_API_KEY must be in server/.env; if it's missing the route
// still responds, with a friendly localized "not available right now" message.

import { Router } from 'express';
import { readKnowledge } from '../utils/helpContent.js';
import { getIp } from '../utils/auditLog.js';

export const landingChatRouter = Router();

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 800;

const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es', 'nl'];

// ── Per-IP rate limit — 20 messages per rolling hour ────────────────────────
// In-memory (same approach as routes/helpChat.js, but keyed by IP since there
// is no logged-in user here). A separate Map — NOT shared with /api/help-chat.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map(); // ip -> number[] (request timestamps, ms)

function checkRateLimit(ip) {
  const key = ip || 'unknown';
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// Occasionally sweep stale entries so the Map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) {
    const recent = times.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length) hits.set(key, recent);
    else hits.delete(key);
  }
}, RATE_WINDOW_MS).unref?.();

// ── Localised canned messages ──────────────────────────────────────────────
const RATE_LIMITED_MSG = {
  en: "You've asked a lot in a short space of time — please give it a few minutes and then try again. For anything urgent, email hello@nestbook.io.",
  fr: "Vous avez posé beaucoup de questions en peu de temps — patientez quelques minutes puis réessayez. Pour une demande urgente, écrivez à hello@nestbook.io.",
  de: "Sie haben in kurzer Zeit viel gefragt — bitte warten Sie ein paar Minuten und versuchen Sie es erneut. Bei dringenden Fragen schreiben Sie an hello@nestbook.io.",
  es: "Has preguntado mucho en poco tiempo — espera unos minutos y vuelve a intentarlo. Si es urgente, escribe a hello@nestbook.io.",
  nl: "Je hebt in korte tijd veel gevraagd — wacht een paar minuten en probeer het opnieuw. Voor dringende zaken: mail hello@nestbook.io.",
};

const UNAVAILABLE_MSG = {
  en: "The assistant isn't available right now. You can browse the site, or email hello@nestbook.io and a real person will reply, usually within 24 hours.",
  fr: "L'assistant n'est pas disponible pour le moment. Parcourez le site ou écrivez à hello@nestbook.io — une vraie personne vous répondra, généralement sous 24 heures.",
  de: "Der Assistent ist gerade nicht verfügbar. Sie können die Website durchstöbern oder an hello@nestbook.io schreiben — eine echte Person antwortet, meist innerhalb von 24 Stunden.",
  es: "El asistente no está disponible ahora mismo. Puedes explorar el sitio o escribir a hello@nestbook.io y una persona real te responderá, normalmente en 24 horas.",
  nl: "De assistent is momenteel niet beschikbaar. Bekijk de site of mail naar hello@nestbook.io — een echt persoon reageert, meestal binnen 24 uur.",
};

function resolveLang(bodyLang) {
  return SUPPORTED_LANGS.includes(bodyLang) ? bodyLang : 'en';
}

// Two system blocks: the big stable knowledge base first (cache_control'd —
// shared across every visitor and language), then the small per-request
// instruction block (changes with language, not worth caching).
function buildSystemBlocks(knowledge, lang) {
  const langName = { en: 'English', fr: 'French', de: 'German', es: 'Spanish', nl: 'Dutch' }[lang] ?? 'English';

  const knowledgeBlock = `You are the landing-page assistant for NestBook, booking and property-management software for small, independent hospitality businesses in Europe (B&Bs, guesthouses, gîtes, holiday cottages, lodges, villas, glamping sites and similar).

You are talking to an ANONYMOUS visitor on NestBook's public marketing website. They have not signed up and are not logged in. Their question is some version of: should I use NestBook, what does it cost, does it suit my property, how is it different from what I use now.

The NestBook knowledge base below is your single source of truth. Follow the instructions inside it, especially Section 0 (how to answer) and Section 9 (common prospect questions).

NestBook knowledge base:
---
${knowledge}
---`;

  const instructionBlock = `Answer the visitor's question using ONLY the NestBook knowledge base above.

Core rules:
- Write conversationally, in your own words and matched to how the visitor asked. NEVER quote or paste the knowledge base text verbatim — paraphrase and explain.
- Stay strictly grounded in the knowledge base. Do NOT invent prices, features, plan limits, competitor figures, or policies that aren't in it.
- If the question genuinely isn't covered — a custom requirement, an unusual property type, an exact legal or refund detail, a region or currency not listed — say plainly: "I'm not sure about that — please contact hello@nestbook.io and a real person will help." Do not guess.
- If the visitor asks how to *do* something inside a NestBook account (a setup step, where a button is, how a screen works), don't try to answer it from this marketing material. Say that's covered once they've signed in — through the in-app help assistant — or they can email hello@nestbook.io, and leave it there. Never fabricate an in-app walkthrough.
- Keep answers short and direct — usually 1 to 4 sentences. Use a short list only when it genuinely helps.
- NestBook's voice: warm, plain, honest, never pushy. No hard sell, no "Great question!", no filler. If NestBook honestly isn't the right fit for this visitor (they need real-time channel management across many platforms, they run a large hotel), say so plainly — the knowledge base explains why that builds trust.
- Reply in ${langName} — the same language the visitor is writing in — even though the knowledge base is written in English.
- Never include any personal or biographical detail about anyone at NestBook. If asked who is behind it, the only line is: NestBook is a small, independent, EU-based team.`;

  return [
    { type: 'text', text: knowledgeBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: instructionBlock },
  ];
}

// ── POST /api/landing-chat ─────────────────────────────────────────────────
landingChatRouter.post('/', async (req, res) => {
  const { message, conversation_history, language } = req.body ?? {};
  const lang = resolveLang(language);

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A message is required.' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'That message is too long.' });
  }

  if (!checkRateLimit(getIp(req))) {
    return res.json({ reply: RATE_LIMITED_MSG[lang] ?? RATE_LIMITED_MSG.en, rate_limited: true });
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) {
    console.warn('[landing-chat] ANTHROPIC_API_KEY is not set in server/.env — landing chat is disabled.');
    return res.json({ reply: UNAVAILABLE_MSG[lang] ?? UNAVAILABLE_MSG.en, unavailable: true });
  }

  let knowledge;
  try {
    knowledge = readKnowledge('landing');
  } catch (err) {
    console.error('[landing-chat] Failed to read landing-ai-knowledge.md:', err.message);
    return res.json({ reply: UNAVAILABLE_MSG[lang] ?? UNAVAILABLE_MSG.en, unavailable: true });
  }

  // Trim history to the last few turns, plain user/assistant text only.
  const history = Array.isArray(conversation_history) ? conversation_history : [];
  const trimmedHistory = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const messages = [
    ...trimmedHistory,
    { role: 'user', content: message.trim() },
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
        // First block (the knowledge base) is cache_control'd — large and only
        // changes when landing-ai-knowledge.md is edited, at which point the
        // cache re-warms automatically on the next request.
        system: buildSystemBlocks(knowledge, lang),
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text().catch(() => '');
      console.error(`[landing-chat] Anthropic API ${anthropicRes.status}:`, detail.slice(0, 500));
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
    console.error('[landing-chat] Request failed:', err.message);
    return res.json({ reply: UNAVAILABLE_MSG[lang] ?? UNAVAILABLE_MSG.en, unavailable: true });
  }
});
