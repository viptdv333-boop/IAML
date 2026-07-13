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

  /* ── Participants roster (from the members file; Phase B: fetched from DB) ── */
  var POSITIONS = ["President", "Honorary President", "Vice Presidents", "Executive Director", "Board Members"];
  var ROLE_SINGULAR = { "Vice Presidents": "Vice President", "Board Members": "Board Member" };
  var PARTICIPANTS = [
    { name: "Juha Janhunen", position: "President", org: "Institute for Linguistic Studies, Russian Academy of Sciences" },
    { name: "Tumurtogoo Domii", position: "Honorary President", org: "Institute of Language and Literature, Mongolian Academy of Sciences, Mongolia" },
    { name: "Bat-Ireedui Jantsan", position: "Vice Presidents", org: "Institute of Language and Literature, Mongolian Academy of Sciences, Mongolia" },
    { name: "Pavel Rykin", position: "Vice Presidents", org: "School of Mongolian Studies, Inner Mongolia University, China" },
    { name: "Veronika Kapišovská", position: "Vice Presidents", org: "Charles University, Czech Republic" },
    { name: "Nakashima Yoshiteru", position: "Vice Presidents", org: "Osaka University, Japan" },
    { name: "Erdene-Ochir Tumen-Ochir", position: "Executive Director", org: "Department of Mongolian Language and Linguistics, National University of Mongolia" },
    { name: "Zayabaatar Dalai", position: "Board Members", org: "National University of Mongolia & International Association for Mongolian Studies" },
    { name: "Bold Luvsandorj", position: "Board Members", org: "Institute of Language and Literature, Mongolian Academy of Sciences, Mongolia" },
    { name: "Unurbayan Tsedev", position: "Board Members", org: "Mongolian National University of Education, Mongolia" },
    { name: "Lee Seong Gyu", position: "Board Members", org: "Dankook University, Republic of Korea" },
    { name: "Khabtagaeva Bayarma", position: "Board Members", org: "University of Naples L'Orientale, Italy" },
    { name: "Elena Skribnik", position: "Board Members", org: "Ludwig-Maximilian-Universität München, Germany" },
    { name: "Ölmez Mehmet", position: "Board Members", org: "Istanbul University, Republic of Türkiye" },
    { name: "Kereidjin.D.Bürgüd", position: "Board Members", org: "Chinese Academy of Social Sciences, People's Republic of China" },
    { name: "Elisabetta Ragagnin", position: "Board Members", org: "Ca' Foscari University of Venice, Republic of Italy" },
    { name: "Veronika Zikmundová", position: "Board Members", org: "Charles University, Czech Republic" },
    { name: "Rákos Attila", position: "Board Members", org: "Department of Mongolian and Inner Asian Studies, ELTE, Hungary" },
    { name: "Benjamin Brosig", position: "Board Members", org: "Nazarbayev University, Republic of Kazakhstan" },
    { name: "Ekaterina V. Sundueva", position: "Board Members", org: "Institute for Mongolian, Buddhist and Tibetan Studies of Siberian Branch of Russian Academy of Sciences" },
    { name: "Peng Daruhan", position: "Board Members", org: "School of Mongolian Studies, Inner Mongolia University, People's Republic of China" },
    { name: "Yamada Yohei", position: "Board Members", org: "Tokyo University of Foreign Studies, Japan" },
    { name: "Jan Rogala", position: "Board Members", org: "University of Warsaw, Republic of Poland" },
    { name: "Kukanova Victoria Vasilievna", position: "Board Members", org: "Director of Kalmyk Scientific Center, the Russian Academy of Sciences" },
    { name: "Park Sangchul", position: "Board Members", org: "Seoul National University, Republic of Korea" },
    { name: "Jargal Badagarov", position: "Board Members", org: "Heidelberg, Germany" },
    { name: "Baranova Vlada", position: "Board Members", org: "Hamburg, Germany" },
    { name: "Andrew Shimunek", position: "Board Members", org: "Indiana, USA" },
    { name: "Bao Wuyun", position: "Board Members", org: "Inner Mongolian Normal University, People's Republic of China" },
    { name: "Saiyinjiya CAIDENGDUOERJI", position: "Board Members", org: "Paris, France" }
  ];

  function initParticipants() {
    var mount = document.getElementById("participants-list");
    if (!mount) return;
    var esc = (window.IAML && window.IAML.esc) || function (s) { return String(s); };
    function initials(name) {
      var parts = name.split(/\s+/).filter(Boolean);
      var s = parts.slice(0, 2).map(function (w) { return w.charAt(0); }).join("");
      return (s || "•").toUpperCase();
    }
    mount.innerHTML = POSITIONS.map(function (pos) {
      var members = PARTICIPANTS.filter(function (p) { return p.position === pos; });
      if (!members.length) return "";
      var cards = members.map(function (p) {
        return '<article class="pcard">' +
          '<span class="pcard__avatar">' + esc(initials(p.name)) + '</span>' +
          '<div class="pcard__body"><h4>' + esc(p.name) + '</h4>' +
          '<p class="pcard__role">' + esc(ROLE_SINGULAR[pos] || pos) + '</p>' +
          (p.org ? '<p class="pcard__org">' + esc(p.org) + '</p>' : '') +
          '</div></article>';
      }).join("");
      return '<div class="pgroup"><h3 class="pgroup__title">' + esc(pos) + '</h3><div class="pgrid">' + cards + '</div></div>';
    }).join("");
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
    try { initParticipants(); } catch (e) {}
    try { initCustomPage(); } catch (e) {}
  });
})();
