/* ═══════════════════════════════════════════════════
   IAML — site interactions
   reveal-on-scroll · mobile menu · auth modal
   Backend calls are gated behind window.iamlBackendReady
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Reveal on scroll ── */
  function initReveal() {
    var els = document.querySelectorAll(".reveal, .obj-tiles, .act-tiles");
    if (prefersReduced || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("visible"); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { obs.observe(el); });
  }

  /* ── Mobile menu ── */
  function initMenu() {
    var burger = document.getElementById("burger");
    var links = document.getElementById("navLinks");
    if (!burger || !links) return;
    function close() { links.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); }
    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // Close menu after tapping a link
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", close);
    });
  }

  /* ── Auth modal ── */
  function initAuth() {
    var modal = document.getElementById("authModal");
    if (!modal) return;
    var body = document.body;
    var lastFocus = null;

    function setTab(name) {
      modal.querySelectorAll("[data-auth-tab]").forEach(function (t) {
        t.classList.toggle("is-active", t.getAttribute("data-auth-tab") === name);
      });
      modal.querySelectorAll(".auth__form").forEach(function (f) {
        f.classList.remove("is-active");
      });
      var form = document.getElementById(name === "register" ? "authRegister" : "authLogin");
      if (form) {
        form.classList.add("is-active");
        var first = form.querySelector("input");
        if (first) { try { first.focus(); } catch (e) {} }
      }
    }

    function open(tab) {
      lastFocus = document.activeElement;
      modal.hidden = false;
      body.classList.add("auth-open");
      setTab(tab || "login");
    }
    function close() {
      modal.hidden = true;
      body.classList.remove("auth-open");
      modal.querySelectorAll("[data-auth-msg]").forEach(function (m) {
        m.textContent = ""; m.className = "auth__msg";
      });
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    }

    // Triggers anywhere on the page
    document.addEventListener("click", function (e) {
      var trigger = e.target.closest("[data-auth]");
      if (trigger) { e.preventDefault(); open(trigger.getAttribute("data-auth")); return; }
      if (e.target.closest("[data-auth-close]")) { e.preventDefault(); close(); return; }
      var tab = e.target.closest("[data-auth-tab]");
      if (tab && modal.contains(tab)) { setTab(tab.getAttribute("data-auth-tab")); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) close();
    });

    // Form submit — gated on backend availability
    function handleSubmit(form, kind) {
      if (!form) return;
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var msg = form.querySelector("[data-auth-msg]");
        if (!window.iamlBackendReady) {
          if (msg) {
            msg.textContent = "Accounts are opening soon — the member system is being connected.";
            msg.className = "auth__msg is-error";
          }
          return;
        }
        // Phase 2 wires real Supabase auth here (kind = "login" | "register").
        if (msg) { msg.textContent = "Connecting…"; msg.className = "auth__msg"; }
      });
    }
    handleSubmit(document.getElementById("authLogin"), "login");
    handleSubmit(document.getElementById("authRegister"), "register");

    // Open from a #login / #register / #join hash on load
    var h = (location.hash || "").replace("#", "");
    if (h === "login" || h === "register") open(h);
  }

  function init() {
    try { initReveal(); } catch (e) {}
    try { initMenu(); } catch (e) {}
    try { initAuth(); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
