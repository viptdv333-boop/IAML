/* ═══════════════════════════════════════════════════
   IAML — safe Markdown subset renderer (docs/API.md §6).
   Builds DOM nodes only — NEVER uses innerHTML, so page bodies
   edited in the admin panel cannot inject markup or scripts.

   IAML.md.render(text) → DocumentFragment
   IAML.md.into(element, text)   (clears the element first)
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";
  var IAML = (window.IAML = window.IAML || {});

  var INLINE = /(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(`([^`\n]+)`)|(\[([^\]\n]+)\]\(([^)\s]+)\))/g;

  function inline(parent, text) {
    var re = new RegExp(INLINE.source, "g");
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        var b = document.createElement("strong"); inline(b, m[2]); parent.appendChild(b);
      } else if (m[3]) {
        var i = document.createElement("em"); inline(i, m[4]); parent.appendChild(i);
      } else if (m[5]) {
        var c = document.createElement("code"); c.textContent = m[6]; parent.appendChild(c);
      } else {
        var href = m[9];
        if (/^(https?:|mailto:)/i.test(href)) {
          var a = document.createElement("a");
          a.setAttribute("href", href);
          a.setAttribute("rel", "noopener noreferrer");
          if (/^https?:/i.test(href)) a.setAttribute("target", "_blank");
          inline(a, m[8]);
          parent.appendChild(a);
        } else {
          parent.appendChild(document.createTextNode(m[0])); // unsafe scheme → literal text
        }
      }
      last = re.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  var RE_H = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
  var RE_UL = /^\s*[-*]\s+(.*)$/;
  var RE_OL = /^\s*\d+[.)]\s+(.*)$/;
  var RE_Q = /^\s*>\s?(.*)$/;

  function isBlockStart(line) { return RE_H.test(line) || RE_UL.test(line) || RE_OL.test(line) || RE_Q.test(line); }

  function render(src) {
    var frag = document.createDocumentFragment();
    var lines = String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n");
    var i = 0, n = lines.length, m;
    while (i < n) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }

      if ((m = RE_H.exec(line))) {
        var h = document.createElement("h" + (m[1].length + 1)); // # → h2 (page title is the h1)
        inline(h, m[2]); frag.appendChild(h); i++; continue;
      }
      if (RE_UL.test(line)) {
        var ul = document.createElement("ul");
        while (i < n && (m = RE_UL.exec(lines[i]))) { var li = document.createElement("li"); inline(li, m[1]); ul.appendChild(li); i++; }
        frag.appendChild(ul); continue;
      }
      if (RE_OL.test(line)) {
        var ol = document.createElement("ol");
        while (i < n && (m = RE_OL.exec(lines[i]))) { var oli = document.createElement("li"); inline(oli, m[1]); ol.appendChild(oli); i++; }
        frag.appendChild(ol); continue;
      }
      if (RE_Q.test(line)) {
        var bq = document.createElement("blockquote"), qp = document.createElement("p"), first = true;
        while (i < n && (m = RE_Q.exec(lines[i]))) {
          if (!first) qp.appendChild(document.createElement("br"));
          inline(qp, m[1]); first = false; i++;
        }
        bq.appendChild(qp); frag.appendChild(bq); continue;
      }
      var p = document.createElement("p"), firstLine = true;
      while (i < n && lines[i].trim() && (firstLine || !isBlockStart(lines[i]))) {
        if (!firstLine) p.appendChild(document.createElement("br"));
        inline(p, lines[i].replace(/\s+$/, "")); firstLine = false; i++;
      }
      frag.appendChild(p);
    }
    return frag;
  }

  IAML.md = {
    render: render,
    into: function (el, text) { while (el.firstChild) el.removeChild(el.firstChild); el.appendChild(render(text)); return el; }
  };
})();
