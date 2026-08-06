import { useState } from 'react';
import '../../../server/public/navbar.css';

const LANGS = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'nl', label: '🇳🇱 Nederlands' },
];

const LANG_LABEL = { en: '🌐 EN ▾', fr: '🌐 FR ▾', es: '🌐 ES ▾', de: '🌐 DE ▾', nl: '🌐 NL ▾' };

export default function PublicNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const currentLang = (() => {
    try { return localStorage.getItem('nb-lang') || 'en'; } catch { return 'en'; }
  })();

  function switchLang(lang) {
    try { localStorage.setItem('nb-lang', lang); } catch {}
    window.location.reload();
  }

  function toggleMenu() {
    setMenuOpen(o => !o);
    setLangOpen(false);
  }

  function toggleLang(e) {
    e.stopPropagation();
    setLangOpen(o => !o);
    if (!langOpen) setMenuOpen(false);
  }

  function closeAll() {
    setMenuOpen(false);
    setLangOpen(false);
  }

  return (
    <>
      <header className="navbar">
        <div className="navbar-inner">
          <a href="https://nestbook.io/" className="nb-logo">
            <img src="/icon.svg" className="nb-logo-img" alt="NestBook" />
            NestBook
          </a>
          <div className="navbar-controls">
            <div className="lang-dropdown">
              <button className="lang-toggle" onClick={toggleLang}>
                {LANG_LABEL[currentLang] || LANG_LABEL.en}
              </button>
              <div className={`lang-panel${langOpen ? ' open' : ''}`}>
                {LANGS.map(l => (
                  <button
                    key={l.code}
                    className={`lang-btn${currentLang === l.code ? ' active' : ''}`}
                    data-lang={l.code}
                    onClick={() => { setLangOpen(false); switchLang(l.code); }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="menu-toggle" onClick={toggleMenu}>
              {menuOpen ? 'Close ✕' : 'Menu ▾'}
            </button>
          </div>
        </div>
      </header>

      <div className={`mega-menu${menuOpen ? ' open' : ''}`} id="megaMenu">
        <div className="mega-inner">
          <div className="mega-col">
            <div className="mega-label">NestBook</div>
            <a href="https://nestbook.io/">Home</a>
            <a href="/how-it-works">How it works</a>
            <a href="/#features">Features</a>
            <a href="/#pricing">Pricing</a>
            <a href="/compare.html">Compare plans</a>
            <a href="/blog/">Blog</a>
            <a href="/book/domaine-des-lavandes">Live demo</a>
          </div>
          <div className="mega-col">
            <div className="mega-label">Get started</div>
            <a href="/app/register" className="mega-cta" onClick={closeAll}>
              <span>🌿 Start free trial</span>
              <span>No credit card needed</span>
            </a>
            <a href="/app/login">Sign in</a>
          </div>
          <div className="mega-col">
            <div className="mega-label">Language</div>
            {LANGS.map(l => (
              <button
                key={l.code}
                className={`lang-btn mega-lang${currentLang === l.code ? ' active' : ''}`}
                data-lang={l.code}
                onClick={() => { closeAll(); switchLang(l.code); }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {menuOpen && <div className="mega-backdrop open" onClick={closeAll} />}
    </>
  );
}
