/* IAML — responsive layout for logo/brand design pages on mobile.

   Pages here come in two flavours:
   (A) React design-canvas pages (Logo v2..v11, Concepts) — a Figma-style
       horizontal canvas of frames driven by design-canvas.jsx.
   (B) Plain HTML pages (Brand Guide, Logo Circle Guide, Logo Circle, Logo D)
       — single fixed-width exports, mostly already fluid via flex-wrap but
       held back by a few min-width:300px / min-height:500px constraints.

   Strategy on viewports < 900px:
   - Always inject one CSS payload (gated by media query) that
       (a) disarms the React canvas viewport and stacks frames vertically,
       (b) softens the plain-HTML constraints so flex-wrap can do its job
           (drops min-widths, stacks hero panels vertically, trims padding).
   - For React canvases we additionally scale each .dc-card via JS so each
     artboard's fixed pixel width fits the viewport.
   - For plain HTML pages, we ONLY fall back to body-wrap+transform-scale
     when the page is *still* overflowing horizontally by more than a small
     tolerance after the CSS reflow. */
(function () {
  var BREAKPOINT = 900;
  var TOLERANCE  = 24;
  var SIDE_PAD   = 16;
  var WRAP_CLASS = 'iaml-canvas-scale-wrap';
  var CARD_WRAP  = 'iaml-card-scale-wrap';
  var SKIP_CLASS = 'iaml-vote-dock';

  /* ── CSS payload (mobile-only via media query) ──────────────────────── */
  var mobileCss = ''
    + '@media (max-width: ' + (BREAKPOINT - 1) + 'px){'

    /* baseline: let the document scroll naturally */
    +   'html,body{height:auto!important;width:100%!important;'
    +     'overflow-x:hidden!important;overflow-y:auto!important;'
    +     'touch-action:auto!important;overscroll-behavior:auto!important;'
    +     'margin:0!important;padding:0!important;max-width:100vw!important}'

    /* ── React design-canvas viewport ──────────────────────────────── */
    +   '.design-canvas{height:auto!important;width:100%!important;min-width:0!important;'
    +     'overflow:visible!important;position:static!important;'
    +     'touch-action:auto!important;overscroll-behavior:auto!important}'
    /* worldRef — neutralize pan/zoom transform */
    +   '.design-canvas > div[style*="transform-origin"]{position:static!important;'
    +     'transform:none!important;width:100%!important;min-width:0!important;'
    +     'padding:20px 0 40px!important}'
    /* hide huge grid background */
    +   '.design-canvas > div[style*="transform-origin"] > div:first-child{display:none!important}'
    /* hide editor chrome (section selector at top, dots at bottom) */
    +   '.design-canvas > div[style*="position: absolute"]:not([style*="transform-origin"]){display:none!important}'
    /* drop calc() margin that depends on canvas zoom */
    +   '[data-dc-section]{margin-bottom:48px!important;position:relative!important}'
    +   '[data-dc-section] > div[style*="padding: 0 60px"]:first-child{padding:0 ' + SIDE_PAD + 'px!important}'
    /* frame row: column instead of row, full width */
    +   '[data-dc-section] > div[style*="display: flex"][style*="max-content"]{'
    +     'display:flex!important;flex-direction:column!important;width:100%!important;'
    +     'padding:0 ' + SIDE_PAD + 'px!important;gap:28px!important;align-items:center!important}'
    /* each artboard slot — let card wrapper centre it */
    +   '[data-dc-slot]{flex-shrink:1!important;width:auto!important;align-self:center!important;'
    +     'max-width:100%!important}'
    +   '.' + CARD_WRAP + '{position:relative;overflow:hidden;margin:0 auto;max-width:100%}'
    +   '.' + CARD_WRAP + ' > .dc-card{transform-origin:top left}'
    /* hide per-frame editor chrome (drag-grip, kebab, expand) */
    +   '.design-canvas .dc-header .dc-btns,'
    +   '.design-canvas .dc-header .dc-grip{display:none!important}'
    +   '.design-canvas .dc-header{padding:6px 4px!important}'

    /* ── Plain HTML brand guides (Brand Guide / Circle Guide / etc.) ─ */
    /* shrink the generous outer paddings */
    +   'section{padding:30px ' + SIDE_PAD + 'px!important;max-width:100%!important}'
    +   '.divider{margin:0 ' + SIDE_PAD + 'px!important;max-width:none!important}'

    /* hero (two-side colour comparison) → stack vertically */
    +   '.hero{flex-direction:column!important;min-height:0!important;margin-bottom:40px!important}'
    +   '.hero-side{padding:40px 20px!important;min-height:260px!important;flex:0 0 auto!important}'

    /* lockup row → drop min-width so cards stack */
    +   '.lockup-row{flex-direction:column!important;gap:16px!important}'
    +   '.lockup-card{min-width:0!important;width:100%!important;flex:0 0 auto!important;'
    +     'padding:22px 18px!important;gap:14px!important}'
    +   '.lockup-card .lockup-text{min-width:0!important;flex:1 1 auto!important}'
    +   '.lockup-card .lockup-name{font-size:14px!important;letter-spacing:1px!important;line-height:1.25!important}'

    /* size / scale / mono / spec rows */
    +   '.size-row,.scale-row,.spec-row,.app-grid{flex-wrap:wrap!important;justify-content:center!important;'
    +     'gap:16px!important}'
    +   '.mono-card,.size-card,.spec-card{min-width:0!important;flex:1 1 240px!important;max-width:100%!important}'

    /* fixed-width swatches / badges / journals / letterheads — let them shrink */
    +   '.badge,.journal,.letterhead{max-width:calc(100vw - 48px)!important}'
    +   '.app-icon{flex:0 0 auto!important}'

    /* section headers — reasonable mobile sizing */
    +   '.section-title{font-size:22px!important;line-height:1.2!important}'
    +   '.section-sub{font-size:12px!important;margin-bottom:24px!important}'

    /* plain-HTML wrapper scaling helper (only used as last resort) */
    +   '.' + WRAP_CLASS + '{transform-origin:top left;will-change:transform}'

    + '}'
    ;

  function injectCss() {
    if (document.getElementById('iaml-responsive-css')) return;
    var s = document.createElement('style');
    s.id = 'iaml-responsive-css';
    s.textContent = mobileCss;
    document.head.appendChild(s);
  }

  /* ── React canvas: scale each .dc-card ──────────────────────────── */
  function scaleCards() {
    var cards = document.querySelectorAll('.design-canvas .dc-card');
    if (!cards.length) return false;

    var avail = window.innerWidth - SIDE_PAD * 2;
    var isMobile = window.innerWidth < BREAKPOINT;

    cards.forEach(function (card) {
      var wrap = card.parentElement;
      if (!wrap || !wrap.classList.contains(CARD_WRAP)) {
        wrap = document.createElement('div');
        wrap.className = CARD_WRAP;
        card.parentNode.insertBefore(wrap, card);
        wrap.appendChild(card);
      }
      card.style.transform = '';
      wrap.style.width = '';
      wrap.style.height = '';
      if (!isMobile) return;

      var natW = parseFloat(card.style.width) || card.offsetWidth || card.scrollWidth;
      var natH = parseFloat(card.style.height) || card.offsetHeight || card.scrollHeight;
      if (!natW || natW <= avail) return;

      var scale = avail / natW;
      card.style.transform = 'scale(' + scale + ')';
      wrap.style.width  = (natW * scale) + 'px';
      wrap.style.height = (natH * scale) + 'px';
    });
    return true;
  }

  /* ── Plain HTML: only scale as last resort if CSS didn't fix it ─── */
  function getOrMakeBodyWrap() {
    var existing = document.querySelector('body > .' + WRAP_CLASS);
    if (existing) return existing;
    if (!document.body) return null;
    var wrap = document.createElement('div');
    wrap.className = WRAP_CLASS;
    var nodes = Array.prototype.slice.call(document.body.childNodes);
    nodes.forEach(function (n) {
      if (n.nodeType === 1) {
        var cls = n.className && n.className.toString ? n.className.toString() : '';
        if (cls.indexOf(SKIP_CLASS) !== -1) return;
        if (n.tagName === 'SCRIPT') return;
      }
      wrap.appendChild(n);
    });
    if (!wrap.childNodes.length) return null;
    document.body.insertBefore(wrap, document.body.firstChild);
    return wrap;
  }
  function scaleBodyIfStillOverflowing() {
    var wrap = getOrMakeBodyWrap();
    if (!wrap) return;
    wrap.style.transform = '';
    wrap.style.width = '';
    document.body.style.minHeight = '';
    if (window.innerWidth >= BREAKPOINT) return;
    // Let CSS take effect first, then measure
    var nat = wrap.scrollWidth;
    if (nat <= window.innerWidth + TOLERANCE) return; // CSS handled it, leave fluid
    var scale = window.innerWidth / nat;
    wrap.style.transform = 'scale(' + scale + ')';
    wrap.style.width = nat + 'px';
    document.body.style.minHeight = Math.ceil(wrap.scrollHeight * scale) + 'px';
  }

  function apply() {
    injectCss();
    var isCanvas = !!document.querySelector('.design-canvas');
    if (isCanvas) scaleCards();
    else          scaleBodyIfStillOverflowing();
  }

  var t;
  function debounced() { clearTimeout(t); t = setTimeout(apply, 80); }

  function start() {
    apply();
    var mo = new MutationObserver(debounced);
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    [200, 600, 1500, 3000].forEach(function (ms) { setTimeout(apply, ms); });
    setTimeout(function () { mo.disconnect(); }, 4500);
  }

  if (document.readyState === 'complete') setTimeout(start, 50);
  else window.addEventListener('load', function () { setTimeout(start, 50); });

  window.addEventListener('resize', debounced);
  window.addEventListener('orientationchange', debounced);
})();
