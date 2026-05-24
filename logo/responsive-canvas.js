/* IAML — responsive layout for logo/brand design pages on mobile.

   Two kinds of pages live here:
   (A) React design-canvas pages (Logo v2..v11, Concepts) — a Figma-style
       horizontal canvas of frames driven by design-canvas.jsx.
   (B) Plain HTML pages (Brand Guide, Logo Circle Guide, Logo Circle, Logo D)
       — a single fixed-width export.

   On viewports < 900px:
   - Type A: inject CSS that disarms the panable canvas (height auto, no
     transform, no viewport-lock), stacks the horizontal frame row into a
     vertical column, hides the editor chrome, and then per-card we apply
     a CSS transform: scale() so each artboard's fixed pixel width fits the
     viewport without internal overflow.
   - Type B: wrap body children (except our fixed voting dock) in a single
     wrapper and scale that wrapper to fit. */
(function () {
  var BREAKPOINT = 900;
  var WRAP_CLASS = 'iaml-canvas-scale-wrap';
  var CARD_WRAP  = 'iaml-card-scale-wrap';
  var SKIP_CLASS = 'iaml-vote-dock';
  var SIDE_PAD   = 16; // px each side on mobile

  /* CSS — applied once, gated by media query so desktop is untouched ---- */
  var mobileCss = ''
    + '@media (max-width: ' + (BREAKPOINT - 1) + 'px){'
    +   'html,body{height:auto!important;width:100%!important;'
    +     'overflow-x:hidden!important;overflow-y:auto!important;'
    +     'touch-action:auto!important;overscroll-behavior:auto!important}'
    /* design-canvas viewport: unlock from 100vh/100vw */
    +   '.design-canvas{height:auto!important;width:100%!important;min-width:0!important;'
    +     'overflow:visible!important;position:static!important;'
    +     'touch-action:auto!important;overscroll-behavior:auto!important}'
    /* worldRef: the panable/zoomable wrapper — neutralize transform */
    +   '.design-canvas > div[style*="transform-origin"]{position:static!important;'
    +     'transform:none!important;width:100%!important;min-width:0!important;'
    +     'padding:20px 0 40px!important}'
    /* huge grid background — hide */
    +   '.design-canvas > div[style*="transform-origin"] > div:first-child{display:none!important}'
    /* editor chrome at top (section selector) and bottom (pagination dots) */
    +   '.design-canvas > div[style*="position: absolute"]:not([style*="transform-origin"]){display:none!important}'
    /* section spacing — drop the calc() that depends on canvas zoom */
    +   '[data-dc-section]{margin-bottom:48px!important;position:relative!important}'
    /* sectionhead row — tighten side padding */
    +   '[data-dc-section] > div[style*="padding: 0 60px"]:first-child{padding:0 ' + SIDE_PAD + 'px!important}'
    /* the frame row: was flex with width:max-content — go vertical */
    +   '[data-dc-section] > div[style*="display: flex"][style*="max-content"]{'
    +     'display:flex!important;flex-direction:column!important;width:100%!important;'
    +     'padding:0 ' + SIDE_PAD + 'px!important;gap:28px!important;align-items:stretch!important}'
    /* each artboard slot — reserve space for the scaled card via JS */
    +   '[data-dc-slot]{flex-shrink:1!important;width:auto!important;align-self:center!important;'
    +     'max-width:100%!important}'
    +   '.iaml-card-scale-wrap{position:relative;overflow:hidden;margin:0 auto;max-width:100%}'
    +   '.iaml-card-scale-wrap > .dc-card{transform-origin:top left}'
    /* hide design-canvas's pointer chrome on each frame on mobile */
    +   '.design-canvas .dc-header .dc-btns,'
    +   '.design-canvas .dc-header .dc-grip{display:none!important}'
    /* keep just the label visible, but compact */
    +   '.design-canvas .dc-header{padding:6px 4px!important}'
    /* plain-HTML wrapper scaling helper */
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

  /* ── Type A: design-canvas pages — scale each .dc-card ────────────── */
  function scaleCards() {
    var cards = document.querySelectorAll('.design-canvas .dc-card');
    if (!cards.length) return false;

    var avail = window.innerWidth - SIDE_PAD * 2;
    var isMobile = window.innerWidth < BREAKPOINT;

    cards.forEach(function (card) {
      // wrap card once so we can reserve correct height after scale
      var wrap = card.parentElement;
      if (!wrap || !wrap.classList.contains(CARD_WRAP)) {
        wrap = document.createElement('div');
        wrap.className = CARD_WRAP;
        card.parentNode.insertBefore(wrap, card);
        wrap.appendChild(card);
      }

      // reset
      card.style.transform = '';
      wrap.style.width = '';
      wrap.style.height = '';

      if (!isMobile) return;

      // measure natural card width from its inline style (set by artboard size)
      var natW = card.offsetWidth || parseFloat(card.style.width) || card.scrollWidth;
      var natH = card.offsetHeight || parseFloat(card.style.height) || card.scrollHeight;
      if (!natW || natW <= avail) return;

      var scale = avail / natW;
      card.style.transform = 'scale(' + scale + ')';
      wrap.style.width  = (natW * scale) + 'px';
      wrap.style.height = (natH * scale) + 'px';
    });
    return true;
  }

  /* ── Type B: plain HTML pages — wrap body & scale ─────────────────── */
  var bodyWrap;
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
  function scaleBodyWrap() {
    bodyWrap = getOrMakeBodyWrap();
    if (!bodyWrap) return;
    bodyWrap.style.transform = '';
    bodyWrap.style.width = '';
    document.body.style.minHeight = '';
    if (window.innerWidth >= BREAKPOINT) return;
    var nat = bodyWrap.scrollWidth;
    if (nat <= window.innerWidth + 4) return;
    var scale = window.innerWidth / nat;
    bodyWrap.style.transform = 'scale(' + scale + ')';
    bodyWrap.style.width = nat + 'px';
    document.body.style.minHeight = Math.ceil(bodyWrap.scrollHeight * scale) + 'px';
  }

  /* Apply both, whichever matches the page ----------------------------- */
  function apply() {
    injectCss();
    var didCanvas = scaleCards();
    if (!didCanvas) scaleBodyWrap();
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
