/* Floating "← Catalog" link in the top-left of every design page so the
   user can always get back to /logo/. */
(function () {
  function mount() {
    if (document.querySelector('.iaml-back-link')) return;
    var css = ''
      + '.iaml-back-link{position:fixed;top:14px;left:14px;z-index:2147483001;'
      + 'display:inline-flex;align-items:center;gap:8px;'
      + 'padding:9px 16px 9px 12px;'
      + 'background:rgba(255,255,255,.96);color:#015197;text-decoration:none;'
      + 'border:1px solid rgba(6,14,26,.14);border-radius:999px;'
      + 'font:600 13px/1 "DM Sans",system-ui,-apple-system,sans-serif;'
      + 'box-shadow:0 6px 18px rgba(1,81,151,.22),0 2px 6px rgba(0,0,0,.08);'
      + 'backdrop-filter:saturate(1.4) blur(6px);'
      + '-webkit-backdrop-filter:saturate(1.4) blur(6px);'
      + 'transition:transform .15s ease,background .15s ease,color .15s ease,box-shadow .15s ease}'
      + '.iaml-back-link:hover{transform:translateY(-1px);background:#015197;color:#fff;'
      + 'box-shadow:0 10px 24px rgba(1,81,151,.34)}'
      + '.iaml-back-link .arrow{font-size:16px;line-height:1;transition:transform .15s ease}'
      + '.iaml-back-link:hover .arrow{transform:translateX(-3px)}'
      + '@media (max-width:520px){.iaml-back-link{top:10px;left:10px;padding:8px 14px 8px 10px;font-size:12px}}'
      ;
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    var a = document.createElement('a');
    a.className = 'iaml-back-link';
    a.href = './';                       // relative to /logo/, lands on the catalog
    a.setAttribute('aria-label', 'Back to logo catalog');
    a.innerHTML = '<span class="arrow" aria-hidden="true">←</span><span>Catalog</span>';
    document.body.appendChild(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
