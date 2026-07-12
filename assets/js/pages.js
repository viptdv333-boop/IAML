/* ═══════════════════════════════════════════════════
   IAML — page interactions (content pages)
   Carousels · card→modal · gated forms · forum buttons
   · avatar preview · custom-page slug.
   Data still comes from static placeholders here;
   Phase B/C/D swap in Supabase fetches.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  /* ── Carousels ── */
  function initCarousels() {
    document.querySelectorAll("[data-carousel]").forEach(function (c) {
      var track = c.querySelector("[data-carousel-track]");
      var prev = c.querySelector("[data-carousel-prev]");
      var next = c.querySelector("[data-carousel-next]");
      if (!track) return;
      function step() { return Math.max(track.clientWidth * 0.9, 280); }
      function update() {
        if (prev) prev.disabled = track.scrollLeft <= 4;
        if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      }
      if (prev) prev.addEventListener("click", function () { track.scrollBy({ left: -step(), behavior: "smooth" }); });
      if (next) next.addEventListener("click", function () { track.scrollBy({ left: step(), behavior: "smooth" }); });
      track.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
      update();
    });
  }

  /* ── Card → content modal ── */
  function openCard(card) {
    var tpl = card.querySelector(".card__full");
    if (!tpl || !window.IAML) return;
    window.IAML.openContentModal(tpl.innerHTML);
  }
  function initCards() {
    document.addEventListener("click", function (e) {
      var card = e.target.closest("[data-card-open]");
      if (card) { e.preventDefault(); openCard(card); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest("[data-card-open]");
      if (card && card === document.activeElement) { e.preventDefault(); openCard(card); }
    });
  }

  /* ── Gated forms (until backend is connected) ── */
  function initForms() {
    document.addEventListener("submit", function (e) {
      var form = e.target.closest("form[data-gated]");
      if (!form) return;
      e.preventDefault();
      var msg = form.querySelector("[data-form-msg]");
      if (window.iamlBackendReady) return; // Phase B+: real submit wired per page
      if (msg) { msg.textContent = "Thanks — this will be delivered once the backend is connected."; msg.className = (msg.className.indexOf("cform__msg") > -1 ? "cform__msg" : "auth__msg") + " is-ok"; }
      try { form.reset(); } catch (x) {}
    });
  }

  /* ── Forum buttons (ask / report) ── */
  function initForum() {
    document.addEventListener("click", function (e) {
      var ask = e.target.closest("[data-new-thread]");
      if (ask) {
        e.preventDefault();
        if (!window.iamlBackendReady && window.IAML) window.IAML.openAuth("login");
        return;
      }
      var rep = e.target.closest("[data-report]");
      if (rep) { e.preventDefault(); rep.textContent = "Reported"; rep.disabled = true; }
    });
  }

  /* ── Avatar preview (account) ── */
  function initAvatar() {
    document.addEventListener("change", function (e) {
      var inp = e.target.closest('input[name="avatar"]');
      if (!inp || !inp.files || !inp.files[0]) return;
      var f = inp.files[0];
      var msg = document.querySelector(".profile-form [data-form-msg]");
      if (f.size > 2 * 1024 * 1024) {
        if (msg) { msg.textContent = "Image must be under 2 MB."; msg.className = "cform__msg is-error"; }
        inp.value = ""; return;
      }
      var prev = document.getElementById("avatarPreview");
      if (prev) {
        var url = URL.createObjectURL(f);
        prev.style.backgroundImage = "url(" + url + ")";
        prev.classList.add("avatar--img");
        prev.textContent = "";
      }
    });
  }

  /* ── Custom page slug (placeholder until Phase B) ── */
  function initCustomPage() {
    if (document.body.getAttribute("data-page") !== "custom") return;
    var slug = new URLSearchParams(location.search).get("slug");
    var t = document.getElementById("customPageTitle");
    if (slug && t) {
      var pretty = slug.replace(/[-_]+/g, " ").replace(/\b\w/g, function (m) { return m.toUpperCase(); });
      t.textContent = pretty;
      document.title = pretty + " — IAML";
    }
  }

  ready(function () {
    try { initCarousels(); } catch (e) {}
    try { initCards(); } catch (e) {}
    try { initForms(); } catch (e) {}
    try { initForum(); } catch (e) {}
    try { initAvatar(); } catch (e) {}
    try { initCustomPage(); } catch (e) {}
  });
})();
