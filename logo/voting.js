/* IAML logo voting widget v3 — two modes, backed by abacus.jasoncameron.dev.

   MODE A — PER-CARD (React design-canvas pages with multiple artboards):
     Set window.IAML_LOGO_PAGE_SLUG = 'concepts'  (or 'logo-v2', etc.) before
     loading this script. We auto-mount a small Like / Dislike widget inside
     EACH [data-dc-slot] card. Slug = pageSlug + '__' + cardId. Every vote
     also bumps the page-level counter (= pageSlug alone) so the leaderboard
     can render per-page totals fast without fetching every per-card counter.

   MODE B — SINGLE PAGE (plain HTML single-design pages, e.g. Brand Guide):
     Set window.IAML_LOGO_SLUG = 'brand-guide' before loading this script.
     We mount the existing big centred Like / Dislike dock at the bottom.

   Both modes use /hit/ for increments (no admin token needed; counter is
   auto-created on first hit). One vote per browser per slug — once you've
   voted, both buttons lock with reduced opacity; the choice is remembered
   in localStorage so the locked state survives reloads. */
(function () {
  var API     = 'https://abacus.jasoncameron.dev';
  var UP_NS   = 'iaml-logo-votes-2026';
  var DOWN_NS = 'iaml-logo-dislikes-2026';

  var pageSlug   = window.IAML_LOGO_PAGE_SLUG;
  var singleSlug = window.IAML_LOGO_SLUG;
  var singleLabel = window.IAML_LOGO_LABEL || singleSlug || 'this design';

  injectCss();
  if (pageSlug)        setupPerCard(pageSlug);
  else if (singleSlug) setupSingleDock(singleSlug, singleLabel);

  /* ── Network helpers ────────────────────────────────────────────── */
  function getCount(ns, key) {
    return fetch(API + '/get/' + ns + '/' + key, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && typeof j.value === 'number') ? j.value : 0; })
      .catch(function () { return null; });
  }
  function hit(ns, key) {
    return fetch(API + '/hit/' + ns + '/' + key)
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && typeof j.value === 'number') ? j.value : null; })
      .catch(function () { return null; });
  }
  function getLs(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setLs(k, v) {
    try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {}
  }
  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  /* ── MODE A: per-card widget under each artboard ────────────────── */
  function setupPerCard(pageSlug) {
    function tryMount() {
      var slots = document.querySelectorAll('.design-canvas [data-dc-slot]');
      slots.forEach(function (slot) {
        if (slot.querySelector('.iaml-vote-mini')) return;
        var id = slot.getAttribute('data-dc-slot');
        if (!id) return;
        var slug  = pageSlug + '__' + id;
        var label = labelOf(slot, id);
        slot.appendChild(buildMiniWidget(slug, label, pageSlug));
      });
    }
    function labelOf(slot, id) {
      var t = slot.querySelector('.dc-header .dc-labeltext');
      var txt = t && t.textContent ? t.textContent.trim() : '';
      return txt || id;
    }
    if (document.readyState === 'complete') setTimeout(tryMount, 80);
    else window.addEventListener('load', function () { setTimeout(tryMount, 80); });

    var mo = new MutationObserver(function () { tryMount(); });
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 8000);
  }

  function buildMiniWidget(slug, label, pageSlug) {
    var lsKey = 'iaml-vote-' + slug;
    var wrap = document.createElement('div');
    wrap.className = 'iaml-vote-mini';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Vote on ' + label);
    wrap.innerHTML =
        '<button type="button" class="ivm-btn ivm-up" data-pol="up" '
      +   'title="Like" aria-label="Like ' + escAttr(label) + '">'
      +   '<span class="ivm-icon" aria-hidden="true">&#9829;</span>'
      +   '<span class="ivm-label">Like</span>'
      +   '<span class="ivm-count" aria-live="polite">·</span>'
      + '</button>'
      + '<button type="button" class="ivm-btn ivm-down" data-pol="down" '
      +   'title="Dislike" aria-label="Dislike ' + escAttr(label) + '">'
      +   '<span class="ivm-icon" aria-hidden="true">&#10006;</span>'
      +   '<span class="ivm-label">Dislike</span>'
      +   '<span class="ivm-count" aria-live="polite">·</span>'
      + '</button>';

    var upBtn   = wrap.querySelector('.ivm-up');
    var downBtn = wrap.querySelector('.ivm-down');
    var upN     = upBtn.querySelector('.ivm-count');
    var downN   = downBtn.querySelector('.ivm-count');

    function render(u, d) {
      upN.textContent   = (u == null ? '·' : u);
      downN.textContent = (d == null ? '·' : d);
    }
    function applyLock() {
      var v = getLs(lsKey);
      wrap.setAttribute('data-voted', v || '0');
    }
    applyLock();

    Promise.all([getCount(UP_NS, slug), getCount(DOWN_NS, slug)])
      .then(function (vs) { render(vs[0], vs[1]); });

    function castVote(pol) {
      if (getLs(lsKey)) return;     // one vote per browser, locked
      setLs(lsKey, pol);
      applyLock();
      wrap.setAttribute('aria-busy', 'true');
      var ns = (pol === 'up') ? UP_NS : DOWN_NS;
      Promise.all([ hit(ns, slug), hit(ns, pageSlug) ])
        .then(function (vs) {
          if (vs[0] == null) {
            setLs(lsKey, null); applyLock();
          } else {
            if (pol === 'up') upN.textContent = vs[0];
            else              downN.textContent = vs[0];
          }
          wrap.removeAttribute('aria-busy');
        });
    }
    upBtn.addEventListener('click',   function () { castVote('up');   });
    downBtn.addEventListener('click', function () { castVote('down'); });
    return wrap;
  }

  /* ── MODE B: single floating dock (plain HTML single-design pages) ─ */
  function setupSingleDock(slug, label) {
    var lsKey = 'iaml-vote-' + slug;
    var dock = document.createElement('div');
    dock.className = 'iaml-vote-dock';
    dock.setAttribute('role', 'group');
    dock.setAttribute('aria-label', 'Vote on ' + label);
    dock.innerHTML =
        '<button type="button" class="iaml-vote-btn iaml-up" data-pol="up" aria-label="Like ' + escAttr(label) + '" title="Like — one vote per browser">'
      +   '<span class="ivf-icon" aria-hidden="true">&#9829;</span>'
      +   '<span class="ivf-text"><span class="ivf-label">Vote</span><span class="ivf-action">Like</span></span>'
      +   '<span class="ivf-count" aria-live="polite">·</span>'
      + '</button>'
      + '<div class="iaml-vote-divider" aria-hidden="true"></div>'
      + '<button type="button" class="iaml-vote-btn iaml-down" data-pol="down" aria-label="Dislike ' + escAttr(label) + '" title="Dislike — one vote per browser">'
      +   '<span class="ivf-icon" aria-hidden="true">&#10006;</span>'
      +   '<span class="ivf-text"><span class="ivf-label">Vote</span><span class="ivf-action">Dislike</span></span>'
      +   '<span class="ivf-count" aria-live="polite">·</span>'
      + '</button>';

    var upBtn   = dock.querySelector('.iaml-up');
    var downBtn = dock.querySelector('.iaml-down');
    var upN     = upBtn.querySelector('.ivf-count');
    var downN   = downBtn.querySelector('.ivf-count');

    function applyLock() { dock.setAttribute('data-voted', getLs(lsKey) || '0'); }
    function render(u, d) { upN.textContent = (u == null ? '·' : u); downN.textContent = (d == null ? '·' : d); }

    function castVote(pol) {
      if (getLs(lsKey)) return;
      setLs(lsKey, pol);
      applyLock();
      dock.setAttribute('aria-busy', 'true');
      var ns = (pol === 'up') ? UP_NS : DOWN_NS;
      hit(ns, slug).then(function (v) {
        if (v == null) { setLs(lsKey, null); applyLock(); }
        else {
          if (pol === 'up') upN.textContent = v;
          else              downN.textContent = v;
        }
        dock.removeAttribute('aria-busy');
      });
    }
    upBtn.addEventListener('click',   function () { castVote('up'); });
    downBtn.addEventListener('click', function () { castVote('down'); });

    function mount() {
      document.body.appendChild(dock);
      applyLock();
      Promise.all([getCount(UP_NS, slug), getCount(DOWN_NS, slug)])
        .then(function (vs) { render(vs[0], vs[1]); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }

  /* ── Styles ─────────────────────────────────────────────────────── */
  function injectCss() {
    if (document.getElementById('iaml-vote-css')) return;
    var css = ''
      /* PER-CARD mini widget --------------------------------------- */
      + '.iaml-vote-mini{display:flex;gap:8px;justify-content:center;align-items:center;'
      +   'margin:10px auto 0;padding:4px;'
      +   'font:600 12px/1 "DM Sans",system-ui,-apple-system,sans-serif;'
      +   'position:relative;z-index:5}'
      + '.iaml-vote-mini .ivm-btn{appearance:none;cursor:pointer;'
      +   'background:#ffffff;border:1px solid rgba(6,14,26,.18);color:#015197;'
      +   'display:inline-flex;align-items:center;gap:7px;'
      +   'padding:8px 13px;border-radius:999px;font:inherit;'
      +   'transition:transform .12s ease,background .15s ease,color .15s ease,border-color .15s ease,box-shadow .15s ease}'
      + '.iaml-vote-mini .ivm-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(1,81,151,.18);border-color:#015197}'
      + '.iaml-vote-mini .ivm-icon{font-size:14px;line-height:1}'
      + '.iaml-vote-mini .ivm-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.7}'
      + '.iaml-vote-mini .ivm-count{font:700 14px/1 "EB Garamond",serif;font-variant-numeric:tabular-nums;'
      +   'padding-left:8px;margin-left:2px;border-left:1px solid currentColor;min-width:18px;text-align:right}'
      /* voted-state styling */
      + '.iaml-vote-mini[data-voted="up"]   .ivm-up{background:linear-gradient(135deg,#C4272F,#a91d24);color:#fff;border-color:#a91d24}'
      + '.iaml-vote-mini[data-voted="down"] .ivm-down{background:linear-gradient(135deg,#3a4658,#1f2937);color:#fff;border-color:#1f2937}'
      + '.iaml-vote-mini[data-voted="up"]   .ivm-up:hover,'
      + '.iaml-vote-mini[data-voted="down"] .ivm-down:hover{transform:none;box-shadow:none}'
      + '.iaml-vote-mini[data-voted]:not([data-voted="0"]) .ivm-btn{cursor:default}'
      + '.iaml-vote-mini[data-voted="up"]   .ivm-down,'
      + '.iaml-vote-mini[data-voted="down"] .ivm-up{opacity:.35;border-color:rgba(6,14,26,.1)}'
      + '.iaml-vote-mini[data-voted="up"]   .ivm-down:hover,'
      + '.iaml-vote-mini[data-voted="down"] .ivm-up:hover{transform:none;box-shadow:none;background:#fff;border-color:rgba(6,14,26,.1)}'
      + '.iaml-vote-mini[aria-busy="true"]{opacity:.55;pointer-events:none}'

      /* SINGLE-PAGE dock ------------------------------------------- */
      + '.iaml-vote-dock{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);'
      +   'z-index:2147483000;display:flex;align-items:stretch;gap:0;'
      +   'background:#ffffff;color:#015197;'
      +   'border:1px solid rgba(6,14,26,.12);border-radius:999px;'
      +   'font:600 16px/1 "DM Sans",system-ui,-apple-system,sans-serif;'
      +   'box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12);'
      +   'user-select:none;overflow:hidden;max-width:calc(100vw - 24px);'
      +   'animation:iamlVotePulse 1.9s ease-out 0.4s 3 both}'
      + '.iaml-vote-dock:hover{animation:none}'
      + '.iaml-vote-btn{appearance:none;background:transparent;border:0;cursor:pointer;'
      +   'display:flex;align-items:center;gap:12px;padding:16px 24px;'
      +   'color:inherit;font:inherit;transition:background .15s ease,color .15s ease,transform .1s ease}'
      + '.iaml-vote-btn:hover{background:rgba(1,81,151,.06)}'
      + '.iaml-vote-btn:active{transform:scale(.97)}'
      + '.iaml-vote-dock[data-voted="up"]   .iaml-up{background:linear-gradient(135deg,#C4272F,#a91d24);color:#fff}'
      + '.iaml-vote-dock[data-voted="down"] .iaml-down{background:linear-gradient(135deg,#3a4658,#1f2937);color:#fff}'
      + '.iaml-vote-dock[data-voted]:not([data-voted="0"]) .iaml-vote-btn{cursor:default}'
      + '.iaml-vote-dock[data-voted="up"]   .iaml-down,'
      + '.iaml-vote-dock[data-voted="down"] .iaml-up{opacity:.45}'
      + '.iaml-vote-divider{width:1px;background:rgba(6,14,26,.12);align-self:stretch;flex:0 0 auto}'
      + '.iaml-vote-btn .ivf-icon{font-size:24px;line-height:1}'
      + '.iaml-vote-btn .ivf-text{display:flex;flex-direction:column;gap:2px;text-align:left}'
      + '.iaml-vote-btn .ivf-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;opacity:.7;font-weight:700}'
      + '.iaml-vote-btn .ivf-action{font-size:15px;font-weight:700;letter-spacing:-.01em}'
      + '.iaml-vote-btn .ivf-count{font:700 20px/1 "EB Garamond",serif;font-variant-numeric:tabular-nums;'
      +   'min-width:28px;text-align:center;opacity:.95;margin-left:4px}'
      + '.iaml-vote-dock[aria-busy="true"]{opacity:.55;pointer-events:none}'
      + '@keyframes iamlVotePulse{'
      +   '0%{box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12),0 0 0 0 rgba(196,39,47,.5)}'
      +   '70%{box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12),0 0 0 22px rgba(196,39,47,0)}'
      +   '100%{box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12),0 0 0 0 rgba(196,39,47,0)}}'
      + '@media (max-width:560px){'
      +   '.iaml-vote-dock{bottom:18px}'
      +   '.iaml-vote-btn{padding:12px 16px;gap:8px}'
      +   '.iaml-vote-btn .ivf-icon{font-size:20px}'
      +   '.iaml-vote-btn .ivf-action{font-size:13px}'
      +   '.iaml-vote-btn .ivf-label{font-size:9px}'
      +   '.iaml-vote-btn .ivf-count{font-size:17px;min-width:24px}}'
      + '@media (prefers-reduced-motion:reduce){'
      +   '.iaml-vote-dock,.iaml-vote-btn,.iaml-vote-mini .ivm-btn{animation:none!important;transition:none!important}}'
      ;
    var s = document.createElement('style');
    s.id = 'iaml-vote-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
})();
