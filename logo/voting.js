/* IAML logo voting widget — like + dislike, backed by abacus.jasoncameron.dev.
   Two counters per design (one namespace per polarity). One user can pick like OR dislike OR neither.
   Embedded admin keys are intentional: write-only tokens scoped to these counters. */
(function () {
  var API = 'https://abacus.jasoncameron.dev';

  var UP_NS   = 'iaml-logo-votes-2026';
  var DOWN_NS = 'iaml-logo-dislikes-2026';

  var UP_KEYS = {
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
  var DOWN_KEYS = {
    'concepts'   : '8caa1018-ee9c-42ee-8f20-4669c03b3d95',
    'mark-circle': 'e96f2c80-3b31-4341-b10a-627256014726',
    'mark-d'     : '3272da55-5899-46a2-9be5-af344ff2c987',
    'logo-v2'    : '344b4a84-4f83-4bb2-b8f2-83eac40d0b2c',
    'logo-v3'    : 'df7b7963-f59d-4133-b619-628d57e92b27',
    'logo-v4'    : '46caf279-8092-48c6-a8a5-e2b2d595b522',
    'logo-v5'    : '6a85add3-7e07-4918-a26f-0584767a7978',
    'logo-v6'    : 'd6467404-d1b7-415c-9c8a-401d85ac6ffb',
    'logo-v7'    : '2a0db8bc-491d-4a60-b687-94ae87879841',
    'logo-v8'    : '5b109bc2-3374-4d14-8aba-22f2dd4918d5',
    'logo-v9'    : '61e2b631-a0c8-477f-84c9-c1b93dccdd76',
    'logo-v10'   : 'afff7c04-819a-4e67-bf6c-6eaac86bd566',
    'logo-v11'   : '913b9c45-1a12-4b11-adcc-e19256be7ff1'
  };

  var slug = window.IAML_LOGO_SLUG;
  if (!slug || !UP_KEYS[slug] || !DOWN_KEYS[slug]) return;
  var upToken   = UP_KEYS[slug];
  var downToken = DOWN_KEYS[slug];
  var lsKey = 'iaml-vote-' + slug; // value: 'up' | 'down' | absent

  /* Styles --------------------------------------------------------------- */
  var css = ''
    + '.iaml-vote-dock{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);'
    + 'z-index:2147483000;display:flex;align-items:stretch;gap:0;'
    + 'background:#ffffff;color:#015197;'
    + 'border:1px solid rgba(6,14,26,.12);border-radius:999px;'
    + 'font:600 16px/1 "DM Sans",system-ui,-apple-system,sans-serif;'
    + 'box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12);'
    + 'user-select:none;overflow:hidden;'
    + 'animation:iamlVotePulse 1.9s ease-out 0.4s 3 both;max-width:calc(100vw - 24px)}'
    + '.iaml-vote-dock:hover{animation:none}'
    + '.iaml-vote-btn{appearance:none;background:transparent;border:0;cursor:pointer;'
    + 'display:flex;align-items:center;gap:12px;padding:16px 24px;'
    + 'color:inherit;font:inherit;transition:background .18s ease,color .18s ease,transform .12s ease}'
    + '.iaml-vote-btn:hover{background:rgba(1,81,151,.06)}'
    + '.iaml-vote-btn:active{transform:scale(.97)}'
    + '.iaml-vote-btn[data-active="1"].iaml-up{background:linear-gradient(135deg,#C4272F 0%,#a91d24 100%);color:#fff}'
    + '.iaml-vote-btn[data-active="1"].iaml-up:hover{background:linear-gradient(135deg,#d12a32 0%,#b41f27 100%)}'
    + '.iaml-vote-btn[data-active="1"].iaml-down{background:linear-gradient(135deg,#3a4658 0%,#1f2937 100%);color:#fff}'
    + '.iaml-vote-btn[data-active="1"].iaml-down:hover{background:linear-gradient(135deg,#475266 0%,#2a3340 100%)}'
    + '.iaml-vote-divider{width:1px;background:rgba(6,14,26,.12);align-self:stretch;flex:0 0 auto}'
    + '.iaml-vote-btn .ivf-icon{font-size:24px;line-height:1;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}'
    + '.iaml-vote-btn[data-active="1"] .ivf-icon{transform:scale(1.2)}'
    + '.iaml-vote-btn .ivf-text{display:flex;flex-direction:column;gap:2px;text-align:left}'
    + '.iaml-vote-btn .ivf-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;opacity:.7;font-weight:700}'
    + '.iaml-vote-btn[data-active="1"] .ivf-label{opacity:.85}'
    + '.iaml-vote-btn .ivf-action{font-size:15px;font-weight:700;letter-spacing:-.01em}'
    + '.iaml-vote-btn .ivf-count{font:700 20px/1 "EB Garamond",serif;font-variant-numeric:tabular-nums;'
    + 'min-width:28px;text-align:center;opacity:.95;margin-left:4px}'
    + '.iaml-vote-dock[aria-busy="true"]{opacity:.55;pointer-events:none}'
    + '@keyframes iamlVotePulse{'
    + '0%{box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12),0 0 0 0 rgba(196,39,47,.5)}'
    + '70%{box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12),0 0 0 22px rgba(196,39,47,0)}'
    + '100%{box-shadow:0 18px 48px rgba(1,81,151,.28),0 4px 12px rgba(1,81,151,.12),0 0 0 0 rgba(196,39,47,0)}}'
    + '@keyframes iamlVotePop{0%{transform:scale(1)}50%{transform:scale(1.5)}100%{transform:scale(1.2)}}'
    + '.iaml-vote-btn.popping .ivf-icon{animation:iamlVotePop .35s ease}'
    + '@media (max-width:560px){'
    + '.iaml-vote-dock{bottom:18px}'
    + '.iaml-vote-btn{padding:12px 16px;gap:8px}'
    + '.iaml-vote-btn .ivf-icon{font-size:20px}'
    + '.iaml-vote-btn .ivf-action{font-size:13px}'
    + '.iaml-vote-btn .ivf-label{font-size:9px}'
    + '.iaml-vote-btn .ivf-count{font-size:17px;min-width:24px}}'
    + '@media (prefers-reduced-motion:reduce){'
    + '.iaml-vote-dock,.iaml-vote-btn,.iaml-vote-btn .ivf-icon{animation:none!important;transition:none!important}}'
    ;
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* DOM ----------------------------------------------------------------- */
  var dock = document.createElement('div');
  dock.className = 'iaml-vote-dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Vote on this design');
  dock.innerHTML =
      '<button type="button" class="iaml-vote-btn iaml-up" aria-label="Like this design" title="Like — click again to remove">'
    +   '<span class="ivf-icon" aria-hidden="true">&#9829;</span>'
    +   '<span class="ivf-text"><span class="ivf-label">Vote</span><span class="ivf-action">Like</span></span>'
    +   '<span class="ivf-count" aria-live="polite">·</span>'
    + '</button>'
    + '<div class="iaml-vote-divider" aria-hidden="true"></div>'
    + '<button type="button" class="iaml-vote-btn iaml-down" aria-label="Dislike this design" title="Dislike — click again to remove">'
    +   '<span class="ivf-icon" aria-hidden="true">&#10006;</span>'
    +   '<span class="ivf-text"><span class="ivf-label">Vote</span><span class="ivf-action">Dislike</span></span>'
    +   '<span class="ivf-count" aria-live="polite">·</span>'
    + '</button>';

  var upBtn   = dock.querySelector('.iaml-up');
  var downBtn = dock.querySelector('.iaml-down');
  var upCountEl   = upBtn.querySelector('.ivf-count');
  var downCountEl = downBtn.querySelector('.ivf-count');

  /* State --------------------------------------------------------------- */
  function getVote() { try { return localStorage.getItem(lsKey); } catch (e) { return null; } }
  function setVote(v) {
    try {
      if (v) localStorage.setItem(lsKey, v);
      else   localStorage.removeItem(lsKey);
    } catch (e) {}
    upBtn.setAttribute('data-active',   v === 'up'   ? '1' : '0');
    downBtn.setAttribute('data-active', v === 'down' ? '1' : '0');
  }
  function renderUp(v)   { upCountEl.textContent   = (v == null ? '·' : String(v)); }
  function renderDown(v) { downCountEl.textContent = (v == null ? '·' : String(v)); }

  /* API ----------------------------------------------------------------- */
  function getCount(ns) {
    return fetch(API + '/get/' + ns + '/' + slug, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && typeof j.value === 'number') ? j.value : null; })
      .catch(function () { return null; });
  }
  function updateCount(ns, token, delta) {
    return fetch(API + '/update/' + ns + '/' + slug + '?value=' + delta, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && typeof j.value === 'number') ? j.value : null; })
      .catch(function () { return null; });
  }

  /* Click handlers ------------------------------------------------------ */
  function vote(target) {
    var current = getVote();           // 'up' | 'down' | null
    var next    = (current === target) ? null : target; // toggle off if same, else switch
    var ops = []; // each: {ns, token, delta, kind:'up'|'down'}

    if (current === 'up'   && next !== 'up')   ops.push({ns: UP_NS,   token: upToken,   delta: -1, kind: 'up'});
    if (current === 'down' && next !== 'down') ops.push({ns: DOWN_NS, token: downToken, delta: -1, kind: 'down'});
    if (next    === 'up'   && current !== 'up')   ops.push({ns: UP_NS,   token: upToken,   delta: +1, kind: 'up'});
    if (next    === 'down' && current !== 'down') ops.push({ns: DOWN_NS, token: downToken, delta: +1, kind: 'down'});

    if (!ops.length) return;

    dock.setAttribute('aria-busy', 'true');
    var btn = (target === 'up') ? upBtn : downBtn;
    btn.classList.remove('popping'); void btn.offsetWidth; btn.classList.add('popping');
    setVote(next); // optimistic

    Promise.all(ops.map(function (o) { return updateCount(o.ns, o.token, o.delta).then(function (v) { return {kind: o.kind, value: v}; }); }))
      .then(function (results) {
        var anyFail = results.some(function (r) { return r.value == null; });
        if (anyFail) {
          setVote(current); // rollback
          // refresh from server to recover counts
          Promise.all([getCount(UP_NS), getCount(DOWN_NS)]).then(function (vs) { renderUp(vs[0]); renderDown(vs[1]); });
        } else {
          results.forEach(function (r) {
            if (r.kind === 'up')   renderUp(r.value);
            if (r.kind === 'down') renderDown(r.value);
          });
        }
        dock.removeAttribute('aria-busy');
      });
  }

  upBtn.addEventListener('click',   function () { vote('up');   });
  downBtn.addEventListener('click', function () { vote('down'); });

  function mount() {
    document.body.appendChild(dock);
    setVote(getVote());
    Promise.all([getCount(UP_NS), getCount(DOWN_NS)]).then(function (vs) {
      renderUp(vs[0]); renderDown(vs[1]);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
