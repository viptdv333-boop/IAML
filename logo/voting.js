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
  var label = window.IAML_LOGO_LABEL || slug || '';
  if (!slug || !KEYS[slug]) return; // no slug declared → do nothing
  var token = KEYS[slug];
  var lsKey = 'iaml-vote-' + slug;

  /* Styles ---------------------------------------------------------------- */
  var css = ''
    + '.iaml-vote-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;'
    + 'display:flex;align-items:center;gap:12px;padding:12px 18px;'
    + 'background:#ffffff;color:#015197;'
    + 'border:1px solid rgba(6,14,26,.15);border-radius:999px;'
    + 'font:600 14px/1 "DM Sans",system-ui,-apple-system,sans-serif;'
    + 'box-shadow:0 10px 28px rgba(1,81,151,.18);'
    + 'cursor:pointer;user-select:none;'
    + 'transition:transform .15s ease,background .15s ease,color .15s ease,border-color .15s ease,box-shadow .15s ease}'
    + '.iaml-vote-fab:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(1,81,151,.22)}'
    + '.iaml-vote-fab[data-voted="1"]{background:#C4272F;color:#fff;border-color:#C4272F}'
    + '.iaml-vote-fab[data-voted="1"]:hover{background:#a91d24;border-color:#a91d24}'
    + '.iaml-vote-fab .ivf-heart{font-size:18px;line-height:1}'
    + '.iaml-vote-fab .ivf-label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.85}'
    + '.iaml-vote-fab .ivf-count{font-variant-numeric:tabular-nums;min-width:18px;text-align:right;'
    + 'padding-left:10px;margin-left:2px;border-left:1px solid currentColor;opacity:.9}'
    + '.iaml-vote-fab[aria-busy="true"]{opacity:.55;pointer-events:none}'
    + '@media (max-width:480px){.iaml-vote-fab{right:12px;bottom:12px;padding:10px 14px}}'
    ;
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* Button ---------------------------------------------------------------- */
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'iaml-vote-fab';
  btn.setAttribute('aria-label', 'Like ' + label);
  btn.setAttribute('title', 'Like / unlike this design');
  btn.innerHTML =
      '<span class="ivf-heart" aria-hidden="true">&#9829;</span>'
    + '<span class="ivf-label">Like</span>'
    + '<span class="ivf-count" aria-live="polite">&middot;</span>';

  var countEl;

  function liked()  { try { return localStorage.getItem(lsKey) === '1'; } catch (e) { return false; } }
  function setLiked(v) {
    try { v ? localStorage.setItem(lsKey, '1') : localStorage.removeItem(lsKey); } catch (e) {}
    btn.setAttribute('data-voted', v ? '1' : '0');
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
    var wasLiked = liked();
    setLiked(!wasLiked);                       // optimistic
    changeCount(wasLiked ? -1 : 1).then(function (v) {
      if (v == null) { setLiked(wasLiked); }   // rollback on error
      else { render(v); }
      btn.removeAttribute('aria-busy');
    });
  });

  function mount() {
    document.body.appendChild(btn);
    countEl = btn.querySelector('.ivf-count');
    setLiked(liked());
    fetchCount().then(render);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
