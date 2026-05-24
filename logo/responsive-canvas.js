/* IAML — responsive canvas auto-scaler for logo/brand design pages.
   Many of these pages were exported from a fixed-width design canvas (~1200–1440 px)
   and overflow on phones. We scale the whole canvas down proportionally using a CSS
   transform so the layout fits the viewport without horizontal scroll. The fixed
   voting dock (.iaml-vote-dock) stays attached to <body>, untouched by the scale,
   so it renders at full size. */
(function () {
  var BREAKPOINT = 900; // only act when viewport is narrower than this
  var WRAP_CLASS = 'iaml-canvas-scale-wrap';
  var SKIP_CLASS = 'iaml-vote-dock';

  /* Returns the element we should scale.
     React pages: #root after it has been populated.
     Plain HTML pages: a wrapper we insert around all body children
     (excluding the voting dock and other floating UI). */
  function getCanvas() {
    var root = document.getElementById('root');
    if (root && root.childElementCount > 0 && !root.classList.contains(WRAP_CLASS + '-skip')) return root;

    var existing = document.querySelector('.' + WRAP_CLASS);
    if (existing) return existing;

    if (!document.body) return null;
    var wrap = document.createElement('div');
    wrap.className = WRAP_CLASS;
    var nodes = Array.prototype.slice.call(document.body.childNodes);
    nodes.forEach(function (n) {
      if (n.nodeType === 1) {
        var cls = n.className && n.className.toString ? n.className.toString() : '';
        if (cls.indexOf(SKIP_CLASS) !== -1) return;
        if (n.tagName === 'SCRIPT') return; // leave scripts in place
      }
      wrap.appendChild(n);
    });
    if (!wrap.childNodes.length) return null;
    document.body.insertBefore(wrap, document.body.firstChild);
    return wrap;
  }

  function reset(canvas) {
    canvas.style.transform = '';
    canvas.style.width = '';
    canvas.style.transformOrigin = '';
    document.body.style.minHeight = '';
    document.body.style.overflowX = '';
    document.documentElement.style.overflowX = '';
  }

  function apply() {
    var canvas = getCanvas();
    if (!canvas) return;
    reset(canvas);

    if (window.innerWidth >= BREAKPOINT) return;

    var natural = canvas.scrollWidth;
    if (natural <= window.innerWidth + 4) return;

    var scale = window.innerWidth / natural;
    canvas.style.transformOrigin = 'top left';
    canvas.style.transform = 'scale(' + scale + ')';
    canvas.style.width = natural + 'px';
    document.body.style.minHeight = Math.ceil(canvas.scrollHeight * scale) + 'px';
    document.body.style.overflowX = 'hidden';
    document.documentElement.style.overflowX = 'hidden';
  }

  var t;
  function debounced() { clearTimeout(t); t = setTimeout(apply, 80); }

  function start() {
    apply();
    // React / Babel may keep mounting for a while after `load`
    var mo = new MutationObserver(debounced);
    if (document.body) mo.observe(document.body, { childList: true, subtree: false });
    var stops = [200, 600, 1500, 3000];
    stops.forEach(function (ms) { setTimeout(apply, ms); });
    setTimeout(function () { mo.disconnect(); }, 4500);
  }

  if (document.readyState === 'complete') {
    setTimeout(start, 50);
  } else {
    window.addEventListener('load', function () { setTimeout(start, 50); });
  }
  window.addEventListener('resize', debounced);
  window.addEventListener('orientationchange', debounced);
})();
