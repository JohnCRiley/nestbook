/* NestBook — cookie consent banner (shared across all public pages) */
(function () {
  'use strict';

  function init() {
    var accepted = false;
    try { accepted = localStorage.getItem('nb-cookies') === 'accepted'; } catch (e) {}
    if (accepted) return;

    var banner = document.createElement('div');
    banner.setAttribute('id', 'nb-cookie-banner');
    banner.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0',
      'background:#1a4710', 'color:#fff',
      'padding:14px 20px', 'z-index:99999',
      'display:flex', 'align-items:center',
      'justify-content:space-between', 'flex-wrap:wrap', 'gap:12px',
      'box-shadow:0 -2px 12px rgba(0,0,0,0.25)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:0.875rem', 'line-height:1.5'
    ].join(';');

    var msg = document.createElement('span');
    msg.style.cssText = 'flex:1;min-width:200px;';
    msg.innerHTML = 'We use cookies to improve your experience on NestBook. ' +
      '<a href="/cookies.html" style="color:#d9f0cc;text-decoration:underline;">Learn more</a>';

    var btn = document.createElement('button');
    btn.textContent = 'Got it';
    btn.style.cssText = [
      'background:#fff', 'color:#1a4710', 'border:none',
      'padding:8px 18px', 'border-radius:6px', 'font-weight:600',
      'cursor:pointer', 'white-space:nowrap', 'flex-shrink:0',
      'font-family:inherit', 'font-size:0.875rem'
    ].join(';');

    btn.addEventListener('click', function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
      try { localStorage.setItem('nb-cookies', 'accepted'); } catch (e) {}
    });

    banner.appendChild(msg);
    banner.appendChild(btn);
    document.body.appendChild(banner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
