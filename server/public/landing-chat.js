/* ─────────────────────────────────────────────────────────────────────────────
   NestBook — landing-page AI assistant (public marketing site)

   A floating chat widget for anonymous visitors. Self-contained: injects its
   own styles, builds its own DOM, talks to POST /api/landing-chat (no auth).

   - Separate from the in-app Help Chat in every way.
   - UI copy in all 5 site languages; follows the page's current language
     (the site-wide nb-lang / ?lang= mechanism — no separate detection).
   - Palette uses the marketing site's own CSS vars with hard fallbacks so it
     also works on pages/contexts where the vars aren't defined.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  if (window.__nbLandingChatLoaded) return;
  window.__nbLandingChatLoaded = true;

  var API_URL       = '/api/landing-chat';
  var SUPPORTED     = ['en', 'fr', 'de', 'es', 'nl'];
  var STORE_KEY     = 'nb_landing_chat';   // sessionStorage: { open, history }
  var MAX_HISTORY   = 10;                   // turns sent to the server
  var SUPPORT_EMAIL = 'hello@nestbook.io';

  /* ── UI copy ──────────────────────────────────────────────────────────── */
  var STRINGS = {
    en: {
      triggerAria: 'Open the NestBook assistant',
      title: 'NestBook AI Assistant',
      greeting: "Hi! I can answer questions about NestBook — pricing, plans, how it works, whether it suits your property. What would you like to know?",
      starters: ['What does it cost?', 'Is there a free plan?', 'How is this different from Airbnb?'],
      placeholder: 'Ask about NestBook…',
      send: 'Send',
      close: 'Close',
      error: 'Something went wrong there. Give it a moment and try again — or email ' + SUPPORT_EMAIL + '.',
      footer: "Answers are based on NestBook's own site content.",
    },
    fr: {
      triggerAria: "Ouvrir l'assistant NestBook",
      title: 'Assistant IA NestBook',
      greeting: "Bonjour ! Je réponds aux questions sur NestBook — tarifs, forfaits, fonctionnement, adéquation avec votre hébergement. Que souhaitez-vous savoir ?",
      starters: ['Combien ça coûte ?', 'Existe-t-il un forfait gratuit ?', 'Quelle différence avec Airbnb ?'],
      placeholder: 'Une question sur NestBook…',
      send: 'Envoyer',
      close: 'Fermer',
      error: "Un problème est survenu. Patientez un instant et réessayez — ou écrivez à " + SUPPORT_EMAIL + '.',
      footer: "Les réponses s'appuient sur le contenu du site NestBook.",
    },
    de: {
      triggerAria: 'NestBook-Assistent öffnen',
      title: 'NestBook KI-Assistent',
      greeting: 'Hallo! Ich beantworte Fragen zu NestBook — Preise, Tarife, Funktionsweise, ob es zu Ihrer Unterkunft passt. Was möchten Sie wissen?',
      starters: ['Was kostet es?', 'Gibt es einen kostenlosen Tarif?', 'Worin unterscheidet es sich von Airbnb?'],
      placeholder: 'Frage zu NestBook…',
      send: 'Senden',
      close: 'Schließen',
      error: 'Da ist etwas schiefgelaufen. Warten Sie kurz und versuchen Sie es erneut — oder schreiben Sie an ' + SUPPORT_EMAIL + '.',
      footer: 'Die Antworten basieren auf den Inhalten der NestBook-Website.',
    },
    es: {
      triggerAria: 'Abrir el asistente de NestBook',
      title: 'Asistente de IA de NestBook',
      greeting: '¡Hola! Puedo responder preguntas sobre NestBook — precios, planes, cómo funciona, si encaja con tu alojamiento. ¿Qué quieres saber?',
      starters: ['¿Cuánto cuesta?', '¿Hay un plan gratuito?', '¿En qué se diferencia de Airbnb?'],
      placeholder: 'Pregunta sobre NestBook…',
      send: 'Enviar',
      close: 'Cerrar',
      error: 'Algo ha ido mal. Espera un momento e inténtalo de nuevo — o escribe a ' + SUPPORT_EMAIL + '.',
      footer: 'Las respuestas se basan en el contenido del sitio de NestBook.',
    },
    nl: {
      triggerAria: 'De NestBook-assistent openen',
      title: 'NestBook AI-assistent',
      greeting: 'Hoi! Ik beantwoord vragen over NestBook — prijzen, abonnementen, hoe het werkt, of het bij jouw accommodatie past. Wat wil je weten?',
      starters: ['Wat kost het?', 'Is er een gratis abonnement?', 'Wat is het verschil met Airbnb?'],
      placeholder: 'Vraag over NestBook…',
      send: 'Versturen',
      close: 'Sluiten',
      error: 'Er ging iets mis. Wacht even en probeer het opnieuw — of mail ' + SUPPORT_EMAIL + '.',
      footer: 'Antwoorden zijn gebaseerd op de inhoud van de NestBook-site.',
    },
  };

  function s() { return STRINGS[lang] || STRINGS.en; }

  /* ── Language: reuse the site-wide nb-lang / ?lang= / auto-detect state ─ */
  function detectLang() {
    var v;
    try { v = localStorage.getItem('nb-lang'); } catch (e) {}
    if (SUPPORTED.indexOf(v) !== -1) return v;
    try { v = sessionStorage.getItem('nb_lang_auto'); } catch (e) {}
    if (SUPPORTED.indexOf(v) !== -1) return v;
    v = (document.documentElement.lang || '').toLowerCase().split('-')[0];
    if (SUPPORTED.indexOf(v) !== -1) return v;
    return 'en';
  }
  var lang = detectLang();

  /* ── Persisted state (client-side only; server stores nothing) ─────────── */
  var state = { open: false, history: [] };
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}');
    if (saved && typeof saved === 'object') {
      state.open = !!saved.open;
      state.history = Array.isArray(saved.history) ? saved.history.slice(-40) : [];
    }
  } catch (e) {}
  function persist() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ── Styles ───────────────────────────────────────────────────────────── */
  var CSS = [
    '#nb-lc-root{position:fixed;right:20px;bottom:20px;z-index:9998;',
      'display:flex;flex-direction:column;align-items:flex-end;gap:12px;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}',
    '#nb-lc-root.nb-lc-cookie{bottom:76px;}',

    /* trigger */
    '#nb-lc-trigger{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;',
      'background:var(--mid,#405440);box-shadow:0 6px 20px rgba(51,67,51,0.32);',
      'display:flex;align-items:center;justify-content:center;padding:0;transition:transform .15s ease,box-shadow .15s ease;}',
    '#nb-lc-trigger:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(51,67,51,0.4);}',
    '#nb-lc-trigger img{width:30px;height:30px;display:block;border-radius:7px;}',
    '#nb-lc-trigger.nb-lc-hidden{display:none;}',

    /* panel */
    '#nb-lc-panel{width:370px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);',
      'display:none;flex-direction:column;overflow:hidden;border-radius:18px;',
      'background:rgba(240,237,232,0.92);-webkit-backdrop-filter:blur(14px) saturate(1.1);backdrop-filter:blur(14px) saturate(1.1);',
      'border:1px solid rgba(224,236,219,0.9);box-shadow:0 18px 50px rgba(51,67,51,0.28);}',
    '#nb-lc-panel.nb-lc-show{display:flex;animation:nb-lc-in .2s ease;}',
    '@keyframes nb-lc-in{from{opacity:0;transform:translateY(12px) scale(.98);}to{opacity:1;transform:none;}}',

    /* header */
    '#nb-lc-head{display:flex;align-items:center;gap:10px;padding:13px 14px;',
      'background:var(--mid,#405440);color:#fff;flex-shrink:0;}',
    '#nb-lc-head img{width:24px;height:24px;border-radius:6px;display:block;flex-shrink:0;}',
    '#nb-lc-head .nb-lc-title{font-weight:700;font-size:0.95rem;flex:1;line-height:1.2;}',
    '#nb-lc-close{background:rgba(255,255,255,0.16);border:none;color:#fff;width:28px;height:28px;',
      'border-radius:7px;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;}',
    '#nb-lc-close:hover{background:rgba(255,255,255,0.28);}',

    /* thread */
    '#nb-lc-thread{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:10px;}',
    '.nb-lc-msg{max-width:85%;padding:9px 13px;border-radius:14px;font-size:0.9rem;line-height:1.5;',
      'white-space:normal;word-wrap:break-word;overflow-wrap:anywhere;}',
    '.nb-lc-msg a{color:var(--mid,#405440);font-weight:600;}',
    '.nb-lc-user{align-self:flex-end;background:var(--mid,#405440);color:#fff;border-bottom-right-radius:5px;}',
    '.nb-lc-user a{color:#fff;}',
    '.nb-lc-bot{align-self:flex-start;background:#fff;color:var(--dark,#334333);border:1px solid rgba(224,236,219,0.9);border-bottom-left-radius:5px;}',
    '.nb-lc-msg p{margin:0 0 8px;}', '.nb-lc-msg p:last-child{margin-bottom:0;}',

    /* typing */
    '.nb-lc-typing{align-self:flex-start;background:#fff;border:1px solid rgba(224,236,219,0.9);',
      'border-radius:14px;border-bottom-left-radius:5px;padding:11px 14px;display:flex;gap:4px;}',
    '.nb-lc-typing span{width:6px;height:6px;border-radius:50%;background:var(--mid,#405440);opacity:.4;',
      'animation:nb-lc-bounce 1.2s infinite ease-in-out;}',
    '.nb-lc-typing span:nth-child(2){animation-delay:.15s;}',
    '.nb-lc-typing span:nth-child(3){animation-delay:.3s;}',
    '@keyframes nb-lc-bounce{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-5px);opacity:1;}}',

    /* starters */
    '#nb-lc-starters{display:flex;flex-wrap:wrap;gap:7px;padding:0 14px 4px;}',
    '.nb-lc-starter{background:rgba(255,255,255,0.75);border:1px solid rgba(224,236,219,0.9);',
      'color:var(--dark,#334333);border-radius:16px;padding:6px 12px;font-size:0.82rem;cursor:pointer;',
      'font-family:inherit;line-height:1.3;transition:background .12s ease;}',
    '.nb-lc-starter:hover{background:#fff;}',

    /* input */
    '#nb-lc-form{display:flex;gap:8px;padding:12px 14px;border-top:1px solid rgba(224,236,219,0.9);',
      'background:rgba(255,255,255,0.55);flex-shrink:0;}',
    '#nb-lc-input{flex:1;resize:none;border:1px solid rgba(224,236,219,1);border-radius:11px;',
      'padding:9px 12px;font-size:0.9rem;font-family:inherit;line-height:1.4;max-height:96px;',
      'background:#fff;color:var(--dark,#334333);outline:none;}',
    '#nb-lc-input:focus{border-color:var(--mid,#405440);}',
    '#nb-lc-send{background:var(--mid,#405440);border:none;color:#fff;border-radius:11px;',
      'padding:0 15px;font-weight:600;font-size:0.88rem;cursor:pointer;font-family:inherit;flex-shrink:0;}',
    '#nb-lc-send:disabled{opacity:.5;cursor:default;}',

    '#nb-lc-foot{font-size:0.68rem;color:var(--muted,#6B6A66);text-align:center;padding:0 14px 10px;line-height:1.4;}',

    /* mobile */
    '@media (max-width:479px){',
      '#nb-lc-root{right:14px;bottom:14px;left:14px;align-items:flex-end;}',
      '#nb-lc-root.nb-lc-cookie{bottom:74px;}',
      '#nb-lc-panel{width:100%;max-width:100%;height:70vh;max-height:calc(100vh - 96px);}',
    '}',
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.id = 'nb-lc-style';
  styleEl.textContent = CSS;

  /* ── DOM ──────────────────────────────────────────────────────────────── */
  var ICON = '/icon.svg';
  var root = document.createElement('div');
  root.id = 'nb-lc-root';
  root.innerHTML =
    '<div id="nb-lc-panel" role="dialog" aria-label="' + esc(s().title) + '">' +
      '<div id="nb-lc-head">' +
        '<img src="' + ICON + '" alt="">' +
        '<span class="nb-lc-title"></span>' +
        '<button id="nb-lc-close" type="button" aria-label="' + esc(s().close) + '">✕</button>' +
      '</div>' +
      '<div id="nb-lc-thread"></div>' +
      '<div id="nb-lc-starters"></div>' +
      '<form id="nb-lc-form">' +
        '<textarea id="nb-lc-input" rows="1"></textarea>' +
        '<button id="nb-lc-send" type="submit"></button>' +
      '</form>' +
      '<div id="nb-lc-foot"></div>' +
    '</div>' +
    '<button id="nb-lc-trigger" type="button"><img src="' + ICON + '" alt=""></button>';

  var panel, thread, startersWrap, form, input, sendBtn, trigger, titleEl, closeBtn, footEl;
  var busy = false;

  function mount() {
    document.head.appendChild(styleEl);
    document.body.appendChild(root);

    panel        = root.querySelector('#nb-lc-panel');
    thread       = root.querySelector('#nb-lc-thread');
    startersWrap = root.querySelector('#nb-lc-starters');
    form         = root.querySelector('#nb-lc-form');
    input        = root.querySelector('#nb-lc-input');
    sendBtn      = root.querySelector('#nb-lc-send');
    trigger      = root.querySelector('#nb-lc-trigger');
    titleEl      = root.querySelector('.nb-lc-title');
    closeBtn     = root.querySelector('#nb-lc-close');
    footEl       = root.querySelector('#nb-lc-foot');

    applyStrings();
    renderHistory();
    updateCookieOffset();

    trigger.addEventListener('click', openPanel);
    closeBtn.addEventListener('click', closePanel);
    form.addEventListener('submit', onSubmit);
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(e); }
    });

    // Follow a language switch made via the site's own lang buttons.
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(function () {
          var next = detectLang();
          if (next !== lang) { lang = next; applyStrings(); renderHistory(); }
        }, 0);
      });
    });

    // Reposition when the cookie banner appears / is dismissed.
    if ('MutationObserver' in window) {
      new MutationObserver(updateCookieOffset).observe(document.body, { childList: true });
    }

    if (state.open) openPanel(true);
  }

  function applyStrings() {
    var t = s();
    titleEl.textContent = t.title;
    trigger.setAttribute('aria-label', t.triggerAria);
    closeBtn.setAttribute('aria-label', t.close);
    panel.setAttribute('aria-label', t.title);
    input.setAttribute('placeholder', t.placeholder);
    sendBtn.textContent = t.send;
    footEl.textContent = t.footer;
    renderStarters();
  }

  function renderStarters() {
    startersWrap.innerHTML = '';
    // Only before the visitor has said anything.
    if (state.history.length > 0) { startersWrap.style.display = 'none'; return; }
    startersWrap.style.display = 'flex';
    s().starters.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nb-lc-starter';
      b.textContent = q;
      b.addEventListener('click', function () { submitMessage(q); });
      startersWrap.appendChild(b);
    });
  }

  function updateCookieOffset() {
    var hasBanner = !!document.getElementById('nb-cookie-banner');
    root.classList.toggle('nb-lc-cookie', hasBanner);
  }

  /* ── Open / close ─────────────────────────────────────────────────────── */
  function openPanel(skipFocus) {
    state.open = true; persist();
    panel.classList.add('nb-lc-show');
    trigger.classList.add('nb-lc-hidden');
    if (state.history.length === 0 && thread.childElementCount === 0) {
      addBubble('bot', s().greeting);
    }
    scrollThread();
    if (skipFocus !== true) setTimeout(function () { input.focus(); }, 60);
  }

  function closePanel() {
    state.open = false; persist();
    panel.classList.remove('nb-lc-show');
    trigger.classList.remove('nb-lc-hidden');
  }

  /* ── Messaging ────────────────────────────────────────────────────────── */
  function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    submitMessage(input.value);
  }

  function submitMessage(raw) {
    var text = (raw || '').trim();
    if (!text || busy) return;

    input.value = ''; autoGrow();
    addBubble('user', text);
    state.history.push({ role: 'user', content: text });
    persist();
    renderStarters();

    busy = true;
    sendBtn.disabled = true;
    var typing = addTyping();

    fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversation_history: state.history.slice(-MAX_HISTORY),
        language: lang,
      }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        typing.remove();
        var reply = (data && data.reply) ? data.reply : s().error;
        addBubble('bot', reply);
        state.history.push({ role: 'assistant', content: reply });
        persist();
      })
      .catch(function () {
        typing.remove();
        addBubble('bot', s().error);
      })
      .finally(function () {
        busy = false;
        sendBtn.disabled = false;
        scrollThread();
        input.focus();
      });
  }

  function renderHistory() {
    thread.innerHTML = '';
    if (state.history.length === 0) {
      if (state.open) addBubble('bot', s().greeting);
    } else {
      state.history.forEach(function (m) {
        addBubble(m.role === 'user' ? 'user' : 'bot', m.content);
      });
    }
    scrollThread();
  }

  function addBubble(kind, text) {
    var el = document.createElement('div');
    el.className = 'nb-lc-msg ' + (kind === 'user' ? 'nb-lc-user' : 'nb-lc-bot');
    if (kind === 'user') el.textContent = text;
    else el.innerHTML = renderRich(text);
    thread.appendChild(el);
    scrollThread();
    return el;
  }

  function addTyping() {
    var el = document.createElement('div');
    el.className = 'nb-lc-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    thread.appendChild(el);
    scrollThread();
    return el;
  }

  function scrollThread() {
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  function autoGrow() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  }

  /* ── Tiny, safe rich-text renderer for bot replies ────────────────────── */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderRich(text) {
    var paras = esc(text).trim().split(/\n\s*\n/);
    return paras.map(function (p) {
      p = p.replace(/\n/g, '<br>');
      // **bold**
      p = p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // [label](url)
      p = p.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>');
      // bare emails
      p = p.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
        '<a href="mailto:$1">$1</a>');
      // bare urls (not already inside an href)
      p = p.replace(/(^|[\s(])((https?:\/\/)[^\s<)]+)/g,
        '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
      return '<p>' + p + '</p>';
    }).join('');
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
