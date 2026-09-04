/**
 * Feature Interest widget — shared behaviour.
 *
 * Generic and reusable: auto-initialises every
 *   <div class="feature-interest" data-feature-slug="your-slug"></div>
 * found on the page. A new feature just needs a new slug — no backend
 * changes required (see server/routes/featureInterest.js).
 *
 * Two states are remembered per-browser via localStorage (never a server-side
 * account or IP check — this is a lightweight interest gauge, not a
 * security-critical count):
 *   nb_voted_${slug}          — this browser already voted; never let it vote
 *                               again, but still show the "thanks" state.
 *   nb_fi_email_done_${slug}  — this browser already gave an email or
 *                               explicitly skipped that step; don't re-show
 *                               the optional email prompt on a later reload.
 */
(function () {
  function renderCountText(count) {
    if (count === 0) return "Be the first to say you're interested.";
    if (count === 1) return '1 property owner is interested so far.';
    return count + ' property owners are interested so far.';
  }

  function initWidget(container) {
    const slug = container.dataset.featureSlug;
    if (!slug) return;

    const voteKey = 'nb_voted_' + slug;
    const emailDoneKey = 'nb_fi_email_done_' + slug;

    container.innerHTML =
      '<p class="fi-question">Would you use this?</p>' +
      '<p class="fi-count" data-fi-count>Loading interest so far…</p>' +
      '<button type="button" class="btn btn-primary" data-fi-vote>I’d use this →</button>' +
      '<div class="fi-thanks-wrap" data-fi-thanks-wrap hidden>' +
        '<p class="fi-thanks">Thanks — we’ve counted your interest.</p>' +
        '<div class="fi-email-step" data-fi-email-step>' +
          '<p class="fi-email-prompt">Want to be first in line when it launches? Leave your email (optional).</p>' +
          '<form class="fi-email-form" data-fi-email-form>' +
            '<input type="email" class="fi-email-input" placeholder="you@example.com" required>' +
            '<button type="submit" class="btn btn-outline">Notify me</button>' +
          '</form>' +
          '<button type="button" class="btn btn-ghost" data-fi-email-skip>No thanks</button>' +
        '</div>' +
      '</div>' +
      '<p class="fi-error" data-fi-error hidden></p>';

    const countEl     = container.querySelector('[data-fi-count]');
    const voteBtn     = container.querySelector('[data-fi-vote]');
    const thanksWrap  = container.querySelector('[data-fi-thanks-wrap]');
    const emailStep   = container.querySelector('[data-fi-email-step]');
    const emailForm   = container.querySelector('[data-fi-email-form]');
    const emailInput  = container.querySelector('.fi-email-input');
    const emailSubmit = emailForm.querySelector('button[type="submit"]');
    const emailSkip   = container.querySelector('[data-fi-email-skip]');
    const errorEl     = container.querySelector('[data-fi-error]');

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }

    let alreadyVoted = false;
    try { alreadyVoted = localStorage.getItem(voteKey) === '1'; } catch (_) {}
    let emailDone = false;
    try { emailDone = localStorage.getItem(emailDoneKey) === '1'; } catch (_) {}

    if (alreadyVoted) {
      voteBtn.hidden = true;
      thanksWrap.hidden = false;
      if (emailDone) emailStep.hidden = true;
    }

    fetch('/api/feature-interest/count?slug=' + encodeURIComponent(slug))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('bad response')); })
      .then(function (data) { countEl.textContent = renderCountText(data.count); })
      .catch(function () { countEl.textContent = 'Interest count unavailable right now.'; });

    voteBtn.addEventListener('click', function () {
      voteBtn.disabled = true;
      fetch('/api/feature-interest/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug }),
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('bad response')); })
        .then(function (data) {
          countEl.textContent = renderCountText(data.count);
          try { localStorage.setItem(voteKey, '1'); } catch (_) {}
          voteBtn.hidden = true;
          thanksWrap.hidden = false;
        })
        .catch(function () {
          voteBtn.disabled = false;
          showError('Something went wrong — please try again.');
        });
    });

    emailForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = emailInput.value.trim();
      if (!email) return;
      emailSubmit.disabled = true;
      fetch('/api/feature-interest/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, email: email }),
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('bad response')); })
        .then(function () {
          try { localStorage.setItem(emailDoneKey, '1'); } catch (_) {}
          emailStep.innerHTML = '<p class="fi-thanks">Thanks — we’ll email you when it’s ready.</p>';
        })
        .catch(function () {
          emailSubmit.disabled = false;
          showError('Could not save your email — please try again.');
        });
    });

    emailSkip.addEventListener('click', function () {
      try { localStorage.setItem(emailDoneKey, '1'); } catch (_) {}
      emailStep.hidden = true;
    });
  }

  function init() {
    document.querySelectorAll('.feature-interest[data-feature-slug]').forEach(initWidget);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
