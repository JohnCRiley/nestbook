/* NestBook — shared navbar behaviour (mega menu + lang dropdown) */
(function () {
  var menuBtn  = document.querySelector('.menu-toggle');
  var megaMenu = document.getElementById('megaMenu');
  var backdrop = document.querySelector('.mega-backdrop');
  var langToggle = document.querySelector('.lang-toggle');
  var langPanel  = document.querySelector('.lang-panel');

  var langLabels = {
    en: '🌐 EN ▾',
    fr: '🌐 FR ▾',
    es: '🌐 ES ▾',
    de: '🌐 DE ▾',
    nl: '🌐 NL ▾'
  };

  function updateLangToggle(lang) {
    if (langToggle) langToggle.textContent = langLabels[lang] || langLabels.en;
  }

  function closeMegaMenu() {
    if (!megaMenu) return;
    megaMenu.classList.remove('open');
    backdrop.classList.remove('open');
    menuBtn.textContent = 'Menu ▾';
  }

  function closeLangPanel() {
    if (langPanel) langPanel.classList.remove('open');
  }

  /* ── Menu toggle ──────────────────────────────────────────────────────── */
  if (menuBtn && megaMenu && backdrop) {
    menuBtn.addEventListener('click', function () {
      var isOpen = megaMenu.classList.contains('open');
      megaMenu.classList.toggle('open', !isOpen);
      backdrop.classList.toggle('open', !isOpen);
      menuBtn.textContent = isOpen ? 'Menu ▾' : 'Close ✕';
      closeLangPanel();
    });

    backdrop.addEventListener('click', function () {
      closeMegaMenu();
    });

    /* Close mega menu when any nav link inside it is clicked */
    megaMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { closeMegaMenu(); });
    });

    /* Close mega menu when a mega-lang button is clicked */
    megaMenu.querySelectorAll('.mega-lang').forEach(function (btn) {
      btn.addEventListener('click', function () { closeMegaMenu(); });
    });
  }

  /* ── Language dropdown ────────────────────────────────────────────────── */
  if (langToggle && langPanel) {
    langToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var opening = !langPanel.classList.contains('open');
      langPanel.classList.toggle('open', opening);
      if (opening) closeMegaMenu();
    });

    /* Close panel after choosing a language */
    langPanel.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { closeLangPanel(); });
    });

    /* Close panel on outside click */
    document.addEventListener('click', function () { closeLangPanel(); });
  }

  /* ── Sync lang-toggle label with active language ──────────────────────── */
  /* Runs once on load to pick up the language chosen by applyLang */
  function syncToggleFromActive() {
    var active = document.querySelector('.lang-btn.active');
    if (active) updateLangToggle(active.getAttribute('data-lang') || 'en');
  }

  /* After applyLang has had a chance to run (it's an IIFE at bottom of page) */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncToggleFromActive);
  } else {
    syncToggleFromActive();
  }

  /* Also update label whenever any lang-btn is clicked (works for both
     the dropdown panel and the mega-menu language column) */
  document.querySelectorAll('.lang-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      updateLangToggle(btn.getAttribute('data-lang') || 'en');
    });
  });
})();
