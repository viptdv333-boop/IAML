/* ═══════════════════════════════════════════════════
   IAML admin — UI toolkit.
   DOM builder (h), inline SVG icons, toasts, dialogs, form fields,
   tables, pager, empty/loading/error states.

   NEVER uses innerHTML: every node is built with createElement /
   textContent, so API data (untrusted text) cannot inject markup.
   Loaded after api.js; exposes window.IAML.admin.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = (window.IAML = window.IAML || {});
  var A = (IAML.admin = IAML.admin || {});
  var has = Object.prototype.hasOwnProperty;
  var counter = 0;

  function uid(prefix) { counter += 1; return (prefix || "a") + "-" + counter; }
  A.uid = uid;

  /* ── section registry (sections register themselves; admin.js builds the nav) ── */
  A.sections = {};
  A.register = function (key, def) { def.key = key; A.sections[key] = def; };

  /* ───────────────────────── DOM builder ───────────────────────── */
  var PROPS = { value: 1, checked: 1, disabled: 1, selected: 1, indeterminate: 1, readOnly: 1, multiple: 1 };

  function append(parent, c) {
    if (c === null || c === undefined || c === false || c === true) return;
    if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) append(parent, c[i]); return; }
    if (c.nodeType) { parent.appendChild(c); return; }
    parent.appendChild(document.createTextNode(String(c)));
  }

  /* h("div", { class: "x", onclick: fn, text: "…" }, [children]) — values are always set as text/attributes */
  function h(tag, attrs, children) {
    var el = document.createElement(tag), props = null, k, v;
    if (attrs) {
      for (k in attrs) {
        if (!has.call(attrs, k)) continue;
        v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (PROPS[k] === 1) { props = props || {}; props[k] = v; }
        else if (k.length > 2 && k.charAt(0) === "o" && k.charAt(1) === "n" && typeof v === "function") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    append(el, children);
    if (props) for (k in props) el[k] = props[k];
    return el;
  }
  A.h = h;
  A.append = append;
  A.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ───────────────────────── icons (stroke paths, 24×24) ───────────────────────── */
  var SVGNS = "http://www.w3.org/2000/svg";
  var ICONS = {
    dashboard: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
    news: ["M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2", "M18 14h-8", "M15 18h-5", "M10 6h8v4h-8V6z"],
    calendar: ["M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 10h18"],
    book: ["M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"],
    users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
    file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"],
    list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
    link: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
    contact: ["M16 2v2", "M7 22v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2", "M8 2v2", "M12 8a3 3 0 1 0 0 6a3 3 0 0 0 0-6z", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"],
    inbox: ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"],
    chat: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
    user: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8z"],
    send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
    clock: ["M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20z", "M12 6v6l4 2"],
    audit: ["M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z", "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "M12 11h4", "M12 16h4", "M8 11h.01", "M8 16h.01"],
    plus: ["M12 5v14", "M5 12h14"],
    edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"],
    trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M10 11v6", "M14 11v6"],
    up: ["M18 15l-6-6-6 6"],
    down: ["M6 9l6 6 6-6"],
    left: ["M15 18l-6-6 6-6"],
    right: ["M9 18l6-6-6-6"],
    search: ["M11 3a8 8 0 1 0 0 16a8 8 0 0 0 0-16z", "M21 21l-4.35-4.35"],
    external: ["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", "M15 3h6v6", "M10 14L21 3"],
    check: ["M20 6L9 17l-5-5"],
    x: ["M18 6L6 18", "M6 6l12 12"],
    eye: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z"],
    eyeoff: ["M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24", "M1 1l22 22"],
    logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
    refresh: ["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"],
    download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
    alert: ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
    info: ["M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20z", "M12 16v-4", "M12 8h.01"],
    menu: ["M3 12h18", "M3 6h18", "M3 18h18"],
    mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M22 6l-10 7L2 6"],
    reply: ["M9 17l-5-5 5-5", "M20 18v-2a4 4 0 0 0-4-4H4"],
    globe: ["M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20z", "M2 12h20", "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"],
    shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
    flag: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],
    restore: ["M1 4v6h6", "M3.51 15a9 9 0 1 0 2.13-9.36L1 10"],
    ban: ["M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20z", "M4.93 4.93l14.14 14.14"]
  };

  function icon(name, size) {
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size || 18));
    svg.setAttribute("height", String(size || 18));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "ic");
    var paths = ICONS[name] || [];
    for (var i = 0; i < paths.length; i++) {
      var p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", paths[i]);
      svg.appendChild(p);
    }
    return svg;
  }
  A.icon = icon;

  /* ───────────────────────── formatting & small helpers ───────────────────────── */
  function wordCount(s) { s = String(s == null ? "" : s).trim(); return s ? s.split(/\s+/).length : 0; }
  var F = function () { return IAML.fmt || {}; };

  A.fmt = {
    /* "2026-07-10 14:30" — UTC+3 wall clock (column headers carry the "(UTC+3)" label) */
    dt: function (iso) { var s = F().toInput ? F().toInput(iso) : ""; return s ? s.replace("T", " ") : "—"; },
    date: function (iso) { var s = F().toInput ? F().toInput(iso) : ""; return s ? s.slice(0, 10) : "—"; },
    n: function (x) { return Number(x || 0).toLocaleString("en-GB"); },
    words: wordCount,
    clip: function (s, n) {
      s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
      return s.length > n ? s.slice(0, n - 1).replace(/\s+$/, "") + "…" : s;
    }
  };

  A.isFuture = function (iso) { var t = new Date(iso).getTime(); return !isNaN(t) && t > Date.now(); };
  A.nowIso = function () { return new Date().toISOString(); };
  A.fullName = function (u) { return u ? ((u.first_name || "") + " " + (u.last_name || "")).trim() || u.name || u.email || "" : ""; };

  /* only absolute http(s) URLs are ever put into an href */
  A.safeHttp = function (u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : null; };

  /* mailto: with percent-encoded address part (an address like "a?bcc=x@y.org" must not smuggle headers) */
  A.mailto = function (email, subject, body) {
    var addr = String(email || "").replace(/[^A-Za-z0-9._+@-]/g, function (c) { return encodeURIComponent(c); });
    var q = [];
    if (subject) q.push("subject=" + encodeURIComponent(subject));
    if (body) q.push("body=" + encodeURIComponent(body));
    return "mailto:" + addr + (q.length ? "?" + q.join("&") : "");
  };

  A.debounce = function (fn, ms) {
    var t = null;
    function d() { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }
    d.cancel = function () { clearTimeout(t); };
    return d;
  };

  /* visually-hidden polite live region for screen-reader announcements */
  A.say = function (text) {
    var el = document.getElementById("adm-live");
    if (!el) { el = h("div", { id: "adm-live", class: "sr-only", "aria-live": "polite", role: "status" }); document.body.appendChild(el); }
    el.textContent = "";
    setTimeout(function () { el.textContent = text; }, 30);
  };

  /* ───────────────────────── errors ───────────────────────── */
  A.errText = function (err) {
    if (!err) return "Something went wrong.";
    if (err.code === "rate_limited") {
      var s = err.extra && err.extra.retryAfter;
      return "Too many requests" + (s ? " — please wait " + (s > 90 ? Math.ceil(s / 60) + " minutes" : s + " seconds") : "") + " and try again.";
    }
    return err.message || "Something went wrong.";
  };

  /* Toast an API failure; a 401 sends the user back to the login card instead. */
  A.fail = function (err, prefix) {
    if (err && err.status === 401) { if (A.onUnauthenticated) A.onUnauthenticated(); return; }
    var m = A.errText(err);
    A.toast(prefix ? prefix + " " + m : m, "error");
  };

  /* ───────────────────────── buttons, badges, switches ───────────────────────── */
  A.btn = function (label, o) {
    o = o || {};
    var cls = "btn btn--" + (o.kind || "secondary") + (o.size === "sm" ? " btn--sm" : "") + (o.block ? " btn--block" : "") + (o.className ? " " + o.className : "");
    var kids = [];
    if (o.icon) kids.push(icon(o.icon, o.size === "sm" ? 16 : 18));
    if (label) kids.push(h("span", { class: "btn__label", text: label }));
    var attrs = { class: cls, title: o.title, "aria-label": o.aria, onclick: o.onClick, disabled: o.disabled };
    var el;
    if (o.href) {
      attrs.href = o.href;
      if (o.target) { attrs.target = o.target; attrs.rel = "noopener noreferrer"; }
      if (o.download) attrs.download = "";
      el = h("a", attrs, kids);
    } else {
      attrs.type = o.type || "button";
      el = h("button", attrs, kids);
      if (o.form) el.setAttribute("form", o.form);
    }
    return el;
  };

  A.iconBtn = function (name, label, onClick, o) {
    o = o || {};
    return A.btn("", { icon: name, title: label, aria: label, onClick: onClick, kind: o.kind || "secondary", size: "sm", className: "btn--icon" + (o.className ? " " + o.className : ""), disabled: o.disabled, href: o.href, target: o.target });
  };

  A.setBusy = function (btn, on, busyLabel) {
    if (!btn) return;
    btn.disabled = !!on;
    if (on) { btn.setAttribute("aria-busy", "true"); btn.classList.add("is-busy"); }
    else { btn.removeAttribute("aria-busy"); btn.classList.remove("is-busy"); }
    var lab = btn.querySelector(".btn__label");
    if (lab) {
      if (on && busyLabel) { btn._idle = lab.textContent; lab.textContent = busyLabel; }
      else if (!on && btn._idle) { lab.textContent = btn._idle; btn._idle = null; }
    }
  };

  A.badge = function (text, tone) { return h("span", { class: "badge badge--" + (tone || "neutral"), text: text }); };

  /* stand-alone switch (e.g. inside a table row); "label" is the accessible name */
  A.switchEl = function (o) {
    var input = h("input", { type: "checkbox", role: "switch", checked: !!o.checked, disabled: !!o.disabled, "aria-label": o.label, onchange: function () { if (o.onChange) o.onChange(input.checked, input); } });
    return h("label", { class: "switch" + (o.text ? "" : " switch--bare") }, [input, h("span", { class: "switch__ui", "aria-hidden": "true" }), o.text ? h("span", { class: "switch__text", text: o.text }) : null]);
  };

  A.avatar = function (u, size) {
    var name = (u && (u.name || A.fullName(u))) || "";
    var url = u && u.avatar_url && /^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/.test(u.avatar_url) ? u.avatar_url : null;
    var initials = F().initials ? F().initials(name) : "?";
    return h("span", { class: "avatar" + (size ? " avatar--" + size : ""), "aria-hidden": "true" }, url ? h("img", { src: url, alt: "", loading: "lazy" }) : initials);
  };

  /* ───────────────────────── toasts ───────────────────────── */
  A.toast = function (message, kind, ms) {
    kind = kind || "ok";
    var host = document.getElementById("adm-toasts");
    if (!host) { host = h("div", { id: "adm-toasts", class: "toasts", "aria-live": "polite", "aria-atomic": "false" }); document.body.appendChild(host); }
    while (host.children.length >= 4) host.removeChild(host.firstChild);
    var timer = null;
    function remove() {
      clearTimeout(timer);
      if (t.parentNode) t.parentNode.removeChild(t);
    }
    var t = h("div", { class: "toast toast--" + kind, role: kind === "error" ? "alert" : "status" }, [
      h("span", { class: "toast__ic" }, icon(kind === "error" ? "alert" : kind === "info" ? "info" : "check", 18)),
      h("div", { class: "toast__msg", text: message }),
      h("button", { type: "button", class: "toast__x", "aria-label": "Dismiss", onclick: remove }, icon("x", 16))
    ]);
    host.appendChild(t);
    timer = setTimeout(remove, ms || (kind === "error" ? 9000 : 4500));
    return { close: remove };
  };

  /* ───────────────────────── dialogs ───────────────────────── */
  var openModals = [];

  /*  modal({ title, body, footer, size: sm|md|lg|xl, focus, dismissOnBackdrop, persistent(): bool, onClose })
      Native <dialog> (focus trap, Esc, inert background). Returns { el, body, close, setTitle }. */
  function modal(o) {
    var titleId = uid("dlg-title");
    var finished = false;
    var opener = document.activeElement;
    var downOnBackdrop = false;
    var titleEl = h("h2", { class: "modal__title", id: titleId, text: o.title || "" });
    var closeBtn = h("button", { type: "button", class: "modal__x", "aria-label": "Close dialog", onclick: function () { if (!(o.persistent && o.persistent())) api.close("cancel"); } }, icon("x", 20));
    var bodyEl = h("div", { class: "modal__body" }, o.body);
    var footEl = o.footer ? h("div", { class: "modal__foot" }, o.footer) : null;
    var dlg = h("dialog", { class: "modal modal--" + (o.size || "md"), "aria-labelledby": titleId }, [
      h("div", { class: "modal__head" }, [titleEl, closeBtn]), bodyEl, footEl
    ]);

    function finish(reason) {
      if (finished) return;
      finished = true;
      var i = openModals.indexOf(api);
      if (i >= 0) openModals.splice(i, 1);
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      if (!openModals.length) document.body.classList.remove("has-modal");
      if (opener && opener.focus && document.contains(opener)) { try { opener.focus(); } catch (e) { /* ignore */ } }
      if (o.onClose) o.onClose(reason);
    }
    var api = {
      el: dlg,
      body: bodyEl,
      setTitle: function (t) { titleEl.textContent = t; },
      close: function (reason) {
        if (finished) return;
        try { if (dlg.close) dlg.close(); } catch (e) { /* ignore */ }
        finish(reason || "close");
      }
    };

    dlg.addEventListener("cancel", function (ev) { // Esc
      if (o.persistent && o.persistent()) { ev.preventDefault(); return; }
      /* the native "close" event can arrive late (e.g. in a hidden tab): clean up without waiting for it */
      setTimeout(function () { if (!finished && !dlg.open) finish("esc"); }, 30);
    });
    dlg.addEventListener("close", function () { finish("close"); });
    dlg.addEventListener("mousedown", function (ev) { downOnBackdrop = ev.target === dlg; });
    dlg.addEventListener("click", function (ev) {
      if (o.dismissOnBackdrop && ev.target === dlg && downOnBackdrop && !(o.persistent && o.persistent())) api.close("backdrop");
    });

    document.body.appendChild(dlg);
    document.body.classList.add("has-modal");
    openModals.push(api);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");

    var target = typeof o.focus === "function" ? o.focus() : o.focus;
    if (!target) target = bodyEl.querySelector("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])");
    if (!target && footEl) target = footEl.querySelector("button:not([disabled]), a[href]");
    try { (target || closeBtn).focus(); } catch (e) { /* ignore */ }
    return api;
  }
  A.modal = modal;
  A.closeModals = function () { openModals.slice().forEach(function (m) { m.close("route"); }); };

  /* confirm({ title, message, detail, confirmLabel, cancelLabel, danger }) → Promise<boolean> */
  A.confirm = function (o) {
    return new Promise(function (resolve) {
      var done = false;
      function settle(v) { if (done) return; done = true; m.close(); resolve(v); }
      var cancel = A.btn(o.cancelLabel || "Cancel", { kind: "secondary", onClick: function () { settle(false); } });
      var ok = A.btn(o.confirmLabel || "Confirm", { kind: o.danger ? "danger" : "primary", onClick: function () { settle(true); } });
      var m = modal({
        title: o.title || "Please confirm",
        size: "sm",
        body: [h("p", { class: "confirm__msg", text: o.message || "" }), o.detail ? h("p", { class: "confirm__detail", text: o.detail }) : null],
        footer: [cancel, ok],
        focus: o.danger ? cancel : ok,
        dismissOnBackdrop: true,
        onClose: function () { settle(false); }
      });
    });
  };

  /* ask({ title, message, label, placeholder, confirmLabel, danger }) → Promise<string|null> (null = cancelled) */
  A.ask = function (o) {
    return new Promise(function (resolve) {
      var done = false;
      var ta = h("textarea", { class: "input textarea", rows: 3, id: uid("ask"), placeholder: o.placeholder || "" });
      function settle(v) { if (done) return; done = true; m.close(); resolve(v); }
      var cancel = A.btn("Cancel", { kind: "secondary", onClick: function () { settle(null); } });
      var ok = A.btn(o.confirmLabel || "Confirm", { kind: o.danger ? "danger" : "primary", onClick: function () { settle(ta.value.trim()); } });
      var m = modal({
        title: o.title,
        size: "sm",
        body: [h("p", { class: "confirm__msg", text: o.message || "" }), h("div", { class: "field" }, [h("label", { class: "field__label", "for": ta.id, text: o.label || "Reason (optional)" }), ta])],
        footer: [cancel, ok],
        focus: ta,
        onClose: function () { settle(null); }
      });
    });
  };

  /* ───────────────────────── form fields ───────────────────────── */
  function fieldMessage(f, msg) {
    msg = String(msg || "");
    if (/^[a-z]/.test(msg)) return (f.spec.short || f.spec.label || f.name) + " " + msg;
    return msg;
  }

  /*  field(spec): type text|email|url|password|number|textarea|select|datetime|switch|note|heading
      spec: { name, label, short, type, required, hint, placeholder, rows, options, numeric, w:"half", counter:{words,chars}|max,
              autocomplete, mono, render(values) (note) }                                           */
  function field(spec) {
    var type = spec.type || "text";
    var id = uid("f");
    var f = { name: spec.name, spec: spec, isInput: type !== "note" && type !== "heading" };
    var wrap = h("div", { class: "field field--" + type + (spec.w === "half" ? " field--half" : ""), "data-field": spec.name || null });
    f.el = wrap;

    if (type === "heading") { wrap.appendChild(h("h3", { class: "form__h", text: spec.label })); return f; }
    if (type === "note") {
      var noteEl = h("div", { class: "field__note", hidden: true });
      wrap.appendChild(noteEl);
      f.update = function (values) {
        var r = spec.render ? spec.render(values) : null;
        if (r && typeof r === "string") r = { text: r };
        noteEl.className = "field__note" + (r && r.tone ? " field__note--" + r.tone : "");
        noteEl.textContent = r && r.text ? r.text : "";
        noteEl.hidden = !(r && r.text);
      };
      return f;
    }

    var errEl = h("div", { class: "field__err", id: id + "-err", hidden: true });
    var hintEl = spec.hint ? h("div", { class: "field__hint", id: id + "-hint", text: spec.hint }) : null;
    var input;

    function describedBy(withErr) {
      var ids = [];
      if (hintEl) ids.push(hintEl.id);
      if (withErr) ids.push(errEl.id);
      return ids.join(" ");
    }
    function applyDescribed(withErr) {
      var d = describedBy(withErr);
      if (d) input.setAttribute("aria-describedby", d); else input.removeAttribute("aria-describedby");
    }

    if (type === "switch") {
      input = h("input", { type: "checkbox", role: "switch", id: id, name: spec.name });
      wrap.appendChild(h("label", { class: "switch", "for": id }, [input, h("span", { class: "switch__ui", "aria-hidden": "true" }), h("span", { class: "switch__text", text: spec.label })]));
      if (hintEl) wrap.appendChild(hintEl);
      wrap.appendChild(errEl);
      f.get = function () { return !!input.checked; };
      f.set = function (v) { input.checked = !!v; };
      input.addEventListener("change", function () { f.clearError(); });
    } else {
      var head = h("div", { class: "field__head" }, [
        h("label", { class: "field__label", "for": id }, [spec.label, spec.required ? h("span", { class: "req", "aria-hidden": "true", text: " *" }) : null])
      ]);
      var common = { id: id, name: spec.name, "aria-required": spec.required ? "true" : null };
      if (type === "textarea") {
        input = h("textarea", { class: "input textarea" + (spec.mono ? " input--mono" : ""), id: id, name: spec.name, rows: spec.rows || 4, placeholder: spec.placeholder, "aria-required": common["aria-required"] });
      } else if (type === "markdown") {
        input = h("textarea", { class: "input textarea input--mono", id: id, name: spec.name, rows: spec.rows || 18, placeholder: spec.placeholder, "aria-required": common["aria-required"] });
      } else if (type === "select") {
        input = h("select", { class: "input select", id: id, name: spec.name, "aria-required": common["aria-required"] });
        if (spec.placeholder) input.appendChild(h("option", { value: "", text: spec.placeholder }));
        (spec.options || []).forEach(function (o) { input.appendChild(h("option", { value: String(o.value), text: o.label })); });
      } else if (type === "datetime") {
        input = h("input", { class: "input", id: id, name: spec.name, type: "datetime-local", step: "60", "aria-required": common["aria-required"] });
      } else {
        input = h("input", {
          class: "input" + (spec.mono ? " input--mono" : ""), id: id, name: spec.name, type: type, placeholder: spec.placeholder,
          autocomplete: spec.autocomplete || "off", spellcheck: (spec.spellcheck === false || type === "email" || type === "url" || type === "password") ? "false" : null,
          inputmode: spec.inputmode, autocapitalize: spec.autocapitalize, "aria-required": common["aria-required"]
        });
      }

      /* live counter (words / characters) */
      var c = spec.counter;
      if (c || (spec.max && type !== "select")) {
        var countEl = h("span", { class: "field__count" });
        head.appendChild(countEl);
        var upd = function () {
          var s = input.value, over = false, txt = "";
          if (c && c.words) {
            var w = wordCount(s);
            over = w > c.words || (c.chars && s.length > c.chars);
            txt = A.fmt.n(w) + " / " + A.fmt.n(c.words) + " words";
            if (c.chars && s.length > c.chars * 0.8) txt += " · " + A.fmt.n(s.length) + " / " + A.fmt.n(c.chars) + " characters";
          } else {
            var lim = (c && c.chars) || spec.max, len = s.trim().length;
            over = len > lim;
            txt = (type === "textarea" || type === "markdown" || len > lim * 0.7) ? A.fmt.n(len) + " / " + A.fmt.n(lim) : "";
          }
          countEl.textContent = txt;
          countEl.classList.toggle("is-over", !!over);
        };
        input.addEventListener("input", upd);
        f.refreshCount = upd;
        upd();
      }

      wrap.appendChild(head);
      if (type === "markdown") {
        /* editor + syntax help on the left, live preview (built as DOM by IAML.md) on the right */
        var previewEl = h("div", { class: "rich md__preview", "aria-label": "Preview", role: "region" });
        var paint = function () { A.renderMarkdown(previewEl, input.value); };
        input.addEventListener("input", A.debounce(paint, 120));
        f.afterSet = paint;
        wrap.appendChild(h("div", { class: "md" }, [
          h("div", { class: "md__edit" }, [input, spec.help || null]),
          h("div", { class: "md__view" }, [h("div", { class: "md__viewlabel", text: "Live preview" }), previewEl])
        ]));
        paint();
      } else {
        wrap.appendChild(input);
      }
      if (hintEl) wrap.appendChild(hintEl);
      wrap.appendChild(errEl);

      if (type === "datetime") {
        /* The input only has minute precision. Untouched fields keep the exact original instant (no silent drift
           when an item is saved); the value "now" means "the moment the form is saved". */
        f.get = function () {
          if (f.orig && input.value && input.value === f.origInput) return f.isNow ? A.nowIso() : f.orig;
          var iso = F().fromInput ? F().fromInput(input.value) : null;
          return iso || null;
        };
        f.set = function (v) {
          f.isNow = v === "now";
          var iso = f.isNow ? A.nowIso() : v;
          input.value = iso && F().toInput ? F().toInput(iso) : "";
          f.orig = iso || null;
          f.origInput = input.value;
        };
      } else if (type === "number") {
        f.get = function () { return input.value === "" ? null : Number(input.value); };
        f.set = function (v) { input.value = v == null ? "" : String(v); if (f.refreshCount) f.refreshCount(); };
      } else if (type === "select" && spec.numeric) {
        f.get = function () { return input.value === "" ? null : Number(input.value); };
        f.set = function (v) { input.value = v == null ? "" : String(v); };
      } else {
        f.get = function () { return input.value; };
        f.set = function (v) { input.value = v == null ? "" : String(v); if (f.refreshCount) f.refreshCount(); if (f.afterSet) f.afterSet(); };
      }
      input.addEventListener(type === "select" || type === "datetime" ? "change" : "input", function () { f.clearError(); });
    }

    applyDescribed(false);
    f.input = input;
    f.setError = function (msg) {
      errEl.textContent = msg; errEl.hidden = false;
      wrap.classList.add("has-error");
      input.setAttribute("aria-invalid", "true");
      applyDescribed(true);
    };
    f.clearError = function () {
      if (errEl.hidden) return;
      errEl.textContent = ""; errEl.hidden = true;
      wrap.classList.remove("has-error");
      input.removeAttribute("aria-invalid");
      applyDescribed(false);
    };
    f.focus = function () { try { input.focus(); } catch (e) { /* ignore */ } };
    return f;
  }
  A.field = field;

  /*  form(specs) → { el, id, fields, get(), set(values), setErrors(map) → {first, unmatched[]}, clearErrors() }  */
  A.form = function (specs) {
    var fid = uid("form");
    var el = h("form", { class: "form", id: fid, novalidate: true, autocomplete: "off" });
    var grid = h("div", { class: "form__grid" });
    var fields = {}, list = [];
    specs.forEach(function (s) {
      if (!s) return;
      var f = field(s);
      list.push(f);
      if (s.name) fields[s.name] = f;
      grid.appendChild(f.el);
    });
    el.appendChild(grid);

    function get() {
      var o = {};
      list.forEach(function (f) { if (f.isInput && f.name) o[f.name] = f.get(); });
      return o;
    }
    function notes() {
      var v = null;
      list.forEach(function (f) { if (f.update) { v = v || get(); f.update(v); } });
    }
    el.addEventListener("input", notes);
    el.addEventListener("change", notes);

    return {
      el: el,
      id: fid,
      fields: fields,
      get: get,
      set: function (values) {
        list.forEach(function (f) { if (f.isInput && f.name && values && has.call(values, f.name)) f.set(values[f.name]); });
        notes();
      },
      clearErrors: function () { list.forEach(function (f) { if (f.clearError) f.clearError(); }); },
      setErrors: function (map) {
        var first = null, unmatched = [];
        Object.keys(map || {}).forEach(function (k) {
          var f = fields[k];
          if (f && f.setError) { f.setError(fieldMessage(f, map[k])); if (!first) first = f; }
          else unmatched.push(k === "_" ? String(map[k]) : k + " " + map[k]);
        });
        return { first: first, unmatched: unmatched };
      }
    };
  };

  /* Markdown-subset preview: IAML.md builds DOM nodes (no innerHTML); plain text if md.js did not load */
  A.renderMarkdown = function (el, text) {
    A.clear(el);
    var t = String(text == null ? "" : text);
    if (!t.trim()) { el.appendChild(h("p", { class: "md__empty", text: "Nothing to preview yet." })); return; }
    if (IAML.md && typeof IAML.md.render === "function") el.appendChild(IAML.md.render(t));
    else el.appendChild(h("pre", { text: t }));
  };

  /* ───────────────────────── tables, pager, states ───────────────────────── */
  /*  table(columns, rows, { rowClass(row,i), className }) — columns: { label, cls, srOnly, render(row, i) → node|string|array } */
  A.table = function (columns, rows, o) {
    o = o || {};
    var head = h("tr");
    columns.forEach(function (c) {
      head.appendChild(h("th", { scope: "col", class: c.cls || null }, c.srOnly ? h("span", { class: "sr-only", text: c.label }) : (c.label == null ? "" : c.label)));
    });
    var tbody = h("tbody");
    rows.forEach(function (row, i) {
      var tr = h("tr", { class: o.rowClass ? o.rowClass(row, i) : null, "data-id": row && row.id != null ? row.id : null });
      columns.forEach(function (c) {
        var td = h("td", { class: c.cls || null });
        append(td, c.render(row, i));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    return h("div", { class: "tbl-wrap", tabindex: "0", role: "region", "aria-label": o.label || "Data table" }, h("table", { class: "tbl" + (o.className ? " " + o.className : "") }, [h("thead", null, head), tbody]));
  };

  /* pager({ offset, limit, total, onChange(newOffset) }) */
  A.pager = function (o) {
    var total = o.total || 0;
    var from = total ? o.offset + 1 : 0, to = Math.min(total, o.offset + o.limit);
    var pages = Math.max(1, Math.ceil(total / o.limit)), page = Math.floor(o.offset / o.limit) + 1;
    var info = h("span", { class: "pager__info", text: total ? "Showing " + A.fmt.n(from) + "–" + A.fmt.n(to) + " of " + A.fmt.n(total) : "No results" });
    var nav = null;
    if (pages > 1) {
      var prev = A.btn("Previous", { size: "sm", icon: "left", disabled: o.offset <= 0, onClick: function () { o.onChange(Math.max(0, o.offset - o.limit)); } });
      var next = A.btn("Next", { size: "sm", disabled: o.offset + o.limit >= total, onClick: function () { o.onChange(o.offset + o.limit); } });
      next.appendChild(icon("right", 16));
      nav = h("div", { class: "pager__nav" }, [prev, h("span", { class: "pager__page", text: "Page " + page + " of " + pages }), next]);
    }
    return h("div", { class: "pager" }, [info, nav]);
  };

  A.loading = function (msg) {
    return h("div", { class: "state state--loading", role: "status" }, [h("span", { class: "spinner", "aria-hidden": "true" }), h("p", { text: msg || "Loading…" })]);
  };
  A.empty = function (title, desc, action) {
    return h("div", { class: "state state--empty" }, [
      h("div", { class: "state__ic" }, icon("inbox", 28)),
      h("h3", { class: "state__title", text: title }),
      desc ? h("p", { class: "state__desc", text: desc }) : null,
      action || null
    ]);
  };
  A.errorState = function (err, retry) {
    return h("div", { class: "state state--error", role: "alert" }, [
      h("div", { class: "state__ic" }, icon("alert", 28)),
      h("h3", { class: "state__title", text: "Could not load this data" }),
      h("p", { class: "state__desc", text: A.errText(err) }),
      retry ? A.btn("Try again", { kind: "secondary", icon: "refresh", onClick: retry }) : null
    ]);
  };

  A.pageHead = function (title, desc, actions) {
    return h("header", { class: "page-head" }, [
      h("div", { class: "page-head__text" }, [h("h1", { class: "page-head__title", tabindex: "-1", text: title }), desc ? h("p", { class: "page-head__desc", text: desc }) : null]),
      actions ? h("div", { class: "page-head__actions" }, actions) : null
    ]);
  };

  /* tabs([{ label, href, active, count }], ariaLabel) — hash links, current page marked */
  A.tabs = function (items, label) {
    return h("nav", { class: "tabs", "aria-label": label || "Sections" }, items.map(function (t) {
      return h("a", { class: "tab" + (t.active ? " is-active" : ""), href: t.href, "aria-current": t.active ? "page" : null }, [t.label, t.count ? h("span", { class: "tab__count", text: String(t.count) }) : null]);
    }));
  };

  /* segmented([{ value, label, count }], current, onChange, ariaLabel) */
  A.segmented = function (items, current, onChange, label) {
    var wrap = h("div", { class: "seg", role: "group", "aria-label": label || "Filter" });
    items.forEach(function (it) {
      var on = it.value === current;
      wrap.appendChild(h("button", { type: "button", class: "seg__btn" + (on ? " is-on" : ""), "aria-pressed": on ? "true" : "false", onclick: function () { onChange(it.value); } },
        [it.label, it.count != null ? h("span", { class: "seg__count", text: String(it.count) }) : null]));
    });
    return wrap;
  };

  /* key/value definition list */
  A.kv = function (pairs) {
    var dl = h("dl", { class: "kv" });
    pairs.forEach(function (p) {
      if (!p) return;
      dl.appendChild(h("dt", { text: p[0] }));
      dl.appendChild(h("dd", null, p[1]));
    });
    return dl;
  };
})();
