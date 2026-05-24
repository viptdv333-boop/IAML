/* IAML logo voting widget — backed by abacus.jasoncameron.dev (free, anonymous counter API).
   Embedded admin keys are intentional: they are write-only tokens for this single namespace,
   used to allow "unlike" (delta -1). Worst-case abuse is vote vandalism on these counters. */
(function () {
  var API  = 'https://abacus.jasoncameron.dev';
  var NS   = 'iaml-logo-votes-2026';
  var KEYS = {
    'concepts'   : '27144f05-97c9-4fe8-91d1-f957771d54da',
    'mark-circle': '3fb40bf6-a997-424e-a0cf-46334b915221',
    'mark-d'     : 'c237649a-7600-493b-a77f-8eb74286ae29',
    'logo-v2'    : '14fb80ac-5204-41d9-938c-8f082b15874a',
    'logo-v3'    : '60fd4950-3e43-4574-8592-0e985c3ba703',
    'logo-v4'    : 'f7566236-c1c2-459d-94d2-4eb1ba028f29',
    'logo-v5'    : '6283faeb-2cc7-4da1-b56b-61dea655d9ef',
    'logo-v6'    : 'af6ef375-f3f8-4c63-9d2e-3de4c52589f3',
    'logo-v7'    : 'b7ee30d2-e8a0-4141-b30a-0a88a9001b81',
    'logo-v8'    : 'f27f1248-abb5-4e59-aa3c-92cab75f0b59',
    'logo-v9'    : 'e365ac1a-eebe-422d-b496-72a013453ccd',
    'logo-v10'   : '27fea970-6d3d-41ff-8483-4d174b586cad',
    'logo-v11'   : 'f50d0869-9ca2-4bce-bd43-ef2b94bf4683'
  };

  var slug  = window.IAML_LOGO_SLUG;
  var label = window.IAML_LOGO_LABEL || slug || 'this design';
  if (!slug || !KEYS[slug]) return;
  var token = KEYS[slug];
  var lsKey = 'iaml-vote-' + slug;

  /* Styles — big, centered bottom dock --------------------------------- */
  var css = ''
    + '.iaml-vote-dock{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);'
    + 'z-index:2147483000;display:flex;align-items:center;gap:18px;'
    + 'padding:18px 28px 18px 24px;min-width:280px;max-width:calc(100vw - 32px);'
    + 'background:#ffffff;color:#015197;'
    + 'border:1px solid rgba(6,14,26,.12);border-radius:999px;'
    + 'font:600 16px/1 "DM Sans",system-ui,-apple-system,sans-serif;'
    + 'box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12);'
    + 'cursor:pointer;user-select:none;'
    + 'transition:transform .18s ease,background .18s ease,color .18s ease,border-color .18s ease,box-shadow .18s ease;'
    + 'animation:iamlVotePulse 1.9s ease-out 0.4s 3 both}'
    + '.iaml-vote-dock:hover{transform:translateX(-50%) translateY(-3px) scale(1.02);box-shadow:0 22px 56px rgba(1,81,151,.34),0 6px 14px rgba(1,81,151,.16);animation:none}'
    + '.iaml-vote-dock:active{transform:translateX(-50%) translateY(0) scale(.98);animation:none}'
    + '.iaml-vote-dock[data-voted="1"]{background:linear-gradient(135deg,#C4272F 0%,#a91d24 100%);color:#fff;border-color:#a91d24;animation:none}'
    + '.iaml-vote-dock[data-voted="1"]:hover{background:linear-gradient(135deg,#d12a32 0%,#b41f27 100%);border-color:#a91d24}'
    + '.iaml-vote-dock .ivf-heart{font-size:30px;line-height:1;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}'
    + '.iaml-vote-dock[data-voted="1"] .ivf-heart{transform:scale(1.18)}'
    + '.iaml-vote-dock .ivf-text{display:flex;flex-direction:column;gap:2px;text-align:left}'
    + '.iaml-vote-dock .ivf-label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;opacity:.7;font-weight:700}'
    + '.iaml-vote-dock[data-voted="1"] .ivf-label{opacity:.85}'
    + '.iaml-vote-dock .ivf-action{font-size:17px;font-weight:700;letter-spacing:-.01em}'
    + '.iaml-vote-dock .ivf-count{font:700 22px/1 "EB Garamond",serif;font-variant-numeric:tabular-nums;'
    + 'min-width:36px;text-align:center;padding-left:18px;margin-left:4px;'
    + 'border-left:1px solid currentColor;opacity:.95}'
    + '.iaml-vote-dock[aria-busy="true"]{opacity:.6;pointer-events:none}'
    + '@keyframes iamlVotePulse{'
    + '0%{box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12),0 0 0 0 rgba(196,39,47,.55)}'
    + '70%{box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12),0 0 0 22px rgba(196,39,47,0)}'
    + '100%{box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12),0 0 0 0 rgba(196,39,47,0)}}'
    + '@keyframes iamlVotePop{0%{transform:scale(1)}50%{transform:scale(1.45)}100%{transform:scale(1.18)}}'
    + '.iaml-vote-dock.popping .ivf-heart{animation:iamlVotePop .35s ease}'
    + '@media (max-width:520px){'
    + '.iaml-vote-dock{padding:14px 20px 14px 18px;gap:14px;min-width:0;bottom:18px}'
    + '.iaml-vote-dock .ivf-heart{font-size:26px}'
    + '.iaml-vote-dock .ivf-action{font-size:15px}'
    + '.iaml-vote-dock .ivf-count{font-size:20px;padding-left:14px;min-width:32px}}'
    + '@media (prefers-reduced-motion:reduce){'
    + '.iaml-vote-dock,.iaml-vote-dock .ivf-heart{animation:none!important;transition:none!important}}'
    ;
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* Button -------------------------------------------------------------- */
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'iaml-vote-dock';
  btn.setAttribute('aria-label', 'Like this design');
  btn.setAttribute('title', 'Click to like — click again to remove your vote');
  btn.innerHTML =
      '<span class="ivf-heart" aria-hidden="true">&#9829;</span>'
    + '<span class="ivf-text">'
    +   '<span class="ivf-label">Vote</span>'
    +   '<span class="ivf-action">Like this design</span>'
    + '</span>'
    + '<span class="ivf-count" aria-live="polite">·</span>';

  var countEl, actionEl;

  function liked()  { try { return localStorage.getItem(lsKey) === '1'; } catch (e) { return false; } }
  function setLiked(v) {
    try { v ? localStorage.setItem(lsKey, '1') : localStorage.removeItem(lsKey); } catch (e) {}
    btn.setAttribute('data-voted', v ? '1' : '0');
    if (actionEl) actionEl.textContent = v ? 'You liked this' : 'Like this design';
  }
  function render(v) { if (countEl) countEl.textContent = (v == null ? '·' : String(v)); }

  function fetchCount() {
    return fetch(API + '/get/' + NS + '/' + slug, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && typeof j.value === 'number') ? j.value : null; })
      .catch(function () { return null; });
  }
  function changeCount(delta) {
    return fetch(API + '/update/' + NS + '/' + slug + '?value=' + delta, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && typeof j.value === 'number') ? j.value : null; })
      .catch(function () { return null; });
  }

  btn.addEventListener('click', function () {
    btn.setAttribute('aria-busy', 'true');
    btn.classList.remove('popping'); void btn.offsetWidth; btn.classList.add('popping');
    var wasLiked = liked();
    setLiked(!wasLiked);
    changeCount(wasLiked ? -1 : 1).then(function (v) {
      if (v == null) { setLiked(wasLiked); }
      else { render(v); }
      btn.removeAttribute('aria-busy');
    });
  });

  function mount() {
    document.body.appendChild(btn);
    countEl  = btn.querySelector('.ivf-count');
    actionEl = btn.querySelector('.ivf-action');
    setLiked(liked());
    fetchCount().then(render);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
