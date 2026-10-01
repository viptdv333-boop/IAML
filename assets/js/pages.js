/* ═══════════════════════════════════════════════════
   IAML — page interactions (content pages)
   Carousels · card→modal · News · Events · Publications ·
   Participants · Contacts (+ contact forms) · Useful Links ·
   custom pages (?slug=).

   Every page first asks IAML.live() (GET /api/health). When there is
   no backend (GitHub Pages draft) the static placeholders / forms /
   data below keep working exactly as before; with a backend they are
   replaced by live data from the API (docs/API.md).
   Load after api.js + app.js.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = window.IAML || {};
  var el = IAML.el, ui = IAML.ui, fmt = IAML.fmt;
  var prefersReduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; }
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  function esc(s) { return IAML.esc ? IAML.esc(s) : String(s); }

  /* ═══ Live-section plumbing ═══ */

  /* The static placeholders stay hidden (no flash of fake content) until we know whether a backend answers. */
  function withBackend(host, onLive, onStatic) {
    host.classList.add("live-pending");
    IAML.live().then(function (ok) {
      if (!ok) { if (onStatic) onStatic(); return null; }
      return Promise.resolve().then(onLive);
    }).then(null, function (err) {
      showStatus(host, loadError(err, function () { withBackend(host, onLive, onStatic); }));
    }).then(function () { host.classList.remove("live-pending"); }, function () { host.classList.remove("live-pending"); });
  }

  function statusBox(host) {
    var n = host.nextElementSibling;
    while (n && !n.classList.contains("live-status")) n = n.nextElementSibling;
    if (!n) {
      n = el("div", { "class": "live-status", "aria-live": "polite" });
      host.parentNode.insertBefore(n, host.nextSibling);
    }
    return n;
  }
  /* node → shown instead of the host (empty / error state); null → host visible again */
  function showStatus(host, node) {
    var box = statusBox(host);
    clear(box);
    if (node) box.appendChild(node);
    host.hidden = !!node;
  }
  function loadError(err, retry) {
    return el("div", { "class": "live-error", role: "alert" },
      el("p", null, "We couldn’t load this content. " + IAML.errorText(err)),
      el("button", { "class": "btn btn--o btn--sm", type: "button", on: { click: retry } }, "Try again"));
  }
  function emptyState(title, sub) {
    return el("div", { "class": "empty" }, el("p", { "class": "empty__t" }, title), sub ? el("p", { "class": "empty__s" }, sub) : null);
  }

  /* ═══ Carousels ═══ */
  function initCarousel(c) {
    var track = c.querySelector("[data-carousel-track]");
    var prev = c.querySelector("[data-carousel-prev]");
    var next = c.querySelector("[data-carousel-next]");
    if (!track) return;
    if (c.__carousel) { c.__carousel.update(); return; }   // re-init after (re-)rendering: just refresh the arrows

    function pages() { return qsa(track, ".carousel__page"); }
    /* "paged" = live cards grouped in .carousel__page grids (6 per view); on phones the pages dissolve into a swipe row */
    function isPaged() {
      var ps = pages();
      return ps.length > 0 && window.getComputedStyle(ps[0]).display !== "contents";
    }
    function pageIndex(ps) {
      var tl = track.getBoundingClientRect().left, best = 0, bestD = Infinity;
      for (var i = 0; i < ps.length; i++) {
        var d = Math.abs(ps[i].getBoundingClientRect().left - tl);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }
    function goPage(i) {
      var ps = pages();
      if (!ps.length) return;
      i = Math.max(0, Math.min(ps.length - 1, i));
      var left = track.scrollLeft + (ps[i].getBoundingClientRect().left - track.getBoundingClientRect().left);
      track.scrollTo({ left: left, behavior: prefersReduced ? "auto" : "smooth" });
    }
    function step() { return Math.max(track.clientWidth * 0.9, 280); }

    var pager = null;
    function update() {
      var ps = pages();
      var paged = isPaged();
      var atStart, atEnd;
      if (paged) {
        var i = pageIndex(ps);
        atStart = i <= 0; atEnd = i >= ps.length - 1;
        if (!pager && ps.length > 1) {
          pager = el("p", { "class": "carousel__pager", "data-carousel-pager": "", "aria-live": "polite" });
          c.parentNode.insertBefore(pager, c.nextSibling);
        }
        if (pager) pager.textContent = "Page " + (i + 1) + " of " + ps.length;
      } else {
        atStart = track.scrollLeft <= 4;
        atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
        if (pager) pager.textContent = "";
      }
      c.classList.toggle("carousel--single", paged && ps.length <= 1);
      if (prev) prev.disabled = atStart;
      if (next) next.disabled = atEnd;
    }

    if (prev) prev.addEventListener("click", function () {
      if (isPaged()) goPage(pageIndex(pages()) - 1);
      else track.scrollBy({ left: -step(), behavior: prefersReduced ? "auto" : "smooth" });
    });
    if (next) next.addEventListener("click", function () {
      if (isPaged()) goPage(pageIndex(pages()) + 1);
      else track.scrollBy({ left: step(), behavior: prefersReduced ? "auto" : "smooth" });
    });
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    c.__carousel = { update: update };
    update();
  }

  function initCarousels() {
    qsa(document, "[data-carousel]").forEach(initCarousel);
  }

  /* cards are grouped into pages of `perPage` (a 3×2 grid on desktop) */
  function fillPaged(track, cards, perPage) {
    clear(track);
    track.parentNode.classList.add("carousel--paged");
    for (var i = 0; i < cards.length; i += perPage) {
      track.appendChild(el("div", { "class": "carousel__page" }, cards.slice(i, i + perPage)));
    }
    track.scrollLeft = 0;
  }

  /* ═══ Card → content modal ═══ */
  function openCard(card) {
    if (typeof card.__open === "function") { card.__open(card); return; }   // live cards build their modal from API data
    var tpl = card.querySelector(".card__full");
    if (!tpl || !window.IAML) return;
    window.IAML.openContentModal(tpl.innerHTML);                            // static placeholders (trusted markup)
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

  /* ═══ Static mode only: gated forms / buttons (until the backend is connected) ═══ */
  function initForms() {
    document.addEventListener("submit", function (e) {
      var form = e.target.closest("form[data-gated]");
      if (!form) return;
      e.preventDefault();
      var msg = form.querySelector("[data-form-msg]");
      if (window.IAML && window.IAML.isLive) return; // live pages wire their own forms
      if (msg) { msg.textContent = "Thanks — this will be delivered once the backend is connected."; msg.className = (msg.className.indexOf("cform__msg") > -1 ? "cform__msg" : "auth__msg") + " is-ok"; }
      try { form.reset(); } catch (x) {}
    });
  }

  function initForum() {
    document.addEventListener("click", function (e) {
      var ask = e.target.closest("[data-new-thread]");
      if (ask) {
        e.preventDefault();
        if (!(window.IAML && window.IAML.isLive) && window.IAML) window.IAML.openAuth("login");
        return;
      }
      var rep = e.target.closest("[data-report]");
      if (rep) { e.preventDefault(); rep.textContent = "Reported"; rep.disabled = true; }
    });
  }

  /* Avatar preview of the static (gated) account form; the live account page is handled by account.js */
  function initAvatar() {
    document.addEventListener("change", function (e) {
      if (window.IAML && window.IAML.isLive) return;
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

  /* ═══ News ═══ */
  function newsCard(item) {
    var when = fmt.dateTime(item.published_at);
    var card = el("article", { "class": "card news-card", "data-card-open": "", tabindex: "0", role: "button" },
      el("time", { "class": "card__date", datetime: item.published_at }, when),
      el("h3", { "class": "card__title" }, item.title),
      el("p", { "class": "card__preview" }, item.preview || ""),
      el("span", { "class": "card__more" }, "Read more →"));
    card.__open = function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(el("time", { "class": "card__date", datetime: item.published_at }, when));
      frag.appendChild(el("h2", null, item.title));
      frag.appendChild(IAML.paragraphs(item.body));
      IAML.openContentModal(frag);
    };
    return card;
  }

  function initNews() {
    var host = $("newsCarousel");
    if (!host) return;
    withBackend(host, function () {
      return IAML.api.get("/news", { limit: 200 }).then(function (res) {
        var items = res.items || [];
        if (!items.length) { showStatus(host, emptyState("No news yet.", "Announcements from the association will appear here.")); return; }
        showStatus(host, null);
        fillPaged(host.querySelector("[data-carousel-track]"), items.map(newsCard), 6);
        initCarousel(host);
        if (res.total > items.length) {
          statusBox(host).appendChild(el("p", { "class": "live-note" }, "Showing the " + items.length + " most recent of " + res.total + " items."));
        }
      });
    });
  }

  /* ═══ Events ═══ */
  function dayOf(iso) { return fmt.dateTime(iso).slice(0, 10); }
  function stripTz(s) { return String(s).replace(/ \(UTC\+3\)$/, ""); }
  /* list: "09:00 – 17:00 (UTC+3)"  ·  multi-day: "2026-12-15 · 06:00 → 2026-12-17 · 14:00 (UTC+3)" */
  function evTime(ev) {
    if (!ev.ends_at) return fmt.time(ev.starts_at);
    if (dayOf(ev.starts_at) === dayOf(ev.ends_at)) return stripTz(fmt.time(ev.starts_at)) + " – " + fmt.time(ev.ends_at);
    return stripTz(fmt.dateTime(ev.starts_at)) + " → " + fmt.dateTime(ev.ends_at);
  }
  function evTimeLong(ev) {
    if (!ev.ends_at) return fmt.long(ev.starts_at);
    if (dayOf(ev.starts_at) === dayOf(ev.ends_at)) return stripTz(fmt.long(ev.starts_at)) + " – " + fmt.time(ev.ends_at);
    return stripTz(fmt.long(ev.starts_at)) + " – " + fmt.long(ev.ends_at);
  }
  function eventNode(ev) {
    var chip = fmt.chip(ev.starts_at) || { month: "", day: "", year: "" };
    var meta = [ev.location, evTime(ev)].filter(Boolean).join(" · ");
    var node = el("div", { "class": "ev" + (ev.is_past ? " ev--past" : ""), "data-card-open": "", tabindex: "0", role: "button" },
      el("div", { "class": "ev__accent" }),
      el("div", { "class": "ev__date" },
        el("span", { "class": "ev__month" }, chip.month), el("span", { "class": "ev__day" }, chip.day), el("span", { "class": "ev__year" }, chip.year)),
      el("div", { "class": "ev__body" },
        el("h3", null, ev.title),
        el("p", { "class": "ev__loc" }, meta),
        ev.summary ? el("p", { "class": "ev__desc" }, ev.summary) : null,
        el("span", { "class": "btn btn--o btn--sm" }, "Details")));
    node.__open = function () {
      var frag = document.createDocumentFragment();
      if (ev.is_past) frag.appendChild(el("span", { "class": "pa__tag" }, "Past event"));
      frag.appendChild(el("h2", null, ev.title));
      frag.appendChild(el("p", { "class": "ev__loc" }, [ev.location, evTimeLong(ev)].filter(Boolean).join(" · ")));
      if (ev.summary) frag.appendChild(el("p", { "class": "cmodal__lead pre-line" }, ev.summary));
      frag.appendChild(IAML.paragraphs(ev.body));
      IAML.openContentModal(frag);
    };
    return node;
  }

  function initEvents() {
    var host = $("events-list");
    if (!host) return;
    withBackend(host, function () {
      return IAML.api.get("/events").then(function (res) {
        var items = res.items || [];
        showStatus(host, null);
        clear(host);
        if (!items.length) { host.appendChild(emptyState("No events yet.", "Conferences and workshops will be announced here.")); return; }
        var upcoming = items.filter(function (e) { return !e.is_past; });
        var past = items.filter(function (e) { return e.is_past; });
        if (upcoming.length) upcoming.forEach(function (e) { host.appendChild(eventNode(e)); });
        else host.appendChild(emptyState("No upcoming events at the moment.", "Please check back soon."));
        if (past.length) {
          host.appendChild(el("h2", { "class": "ev-sub" }, "Past events"));
          past.forEach(function (e) { host.appendChild(eventNode(e)); });
        }
      });
    });
  }

  /* ═══ Publications ═══ */
  function pubCard(p) {
    var card = el("article", { "class": "card pub-card", "data-card-open": "", tabindex: "0", role: "button" },
      p.topic ? el("span", { "class": "pa__tag" }, p.topic) : null,
      el("h3", { "class": "card__title" }, p.title),
      el("p", { "class": "card__authors" }, p.authors),
      el("p", { "class": "card__preview" }, p.preview || ""),
      el("span", { "class": "card__more" }, "Read more →"));
    card.__open = function () {
      var frag = document.createDocumentFragment();
      if (p.topic) frag.appendChild(el("span", { "class": "pa__tag" }, p.topic));
      frag.appendChild(el("h2", null, p.title));
      frag.appendChild(el("p", { "class": "card__authors" }, p.authors));
      frag.appendChild(el("p", { "class": "card__date" }, "Announced " + fmt.date(p.published_at)));
      frag.appendChild(IAML.paragraphs(p.summary));
      IAML.openContentModal(frag);
    };
    return card;
  }

  function initPublications() {
    var host = $("pubsCarousel");
    if (!host) return;
    withBackend(host, function () {
      return IAML.api.get("/publications", { limit: 200 }).then(function (res) {
        var items = res.items || [];
        if (!items.length) { showStatus(host, emptyState("No publications yet.", "New articles and books will be announced here.")); return; }
        showStatus(host, null);
        fillPaged(host.querySelector("[data-carousel-track]"), items.map(pubCard), 6);
        initCarousel(host);
        if (res.total > items.length) {
          statusBox(host).appendChild(el("p", { "class": "live-note" }, "Showing the " + items.length + " most recent of " + res.total + " items."));
        }
      });
    });
  }

  /* ═══ Contact forms (Contacts + Participants pages) → POST /contact ═══ */
  var hpSeq = 0;
  function honeypot() {
    var id = "hp" + (++hpSeq);
    return el("div", { "class": "hp", "aria-hidden": "true" },
      el("label", { "for": id }, "Website"),
      el("input", { type: "text", name: "website", id: id, tabindex: "-1", autocomplete: "off" }));
  }

  function wireContactForm(form, source) {
    if (!form) return;
    IAML.live().then(function (ok) {
      if (!ok) return;                    // static mode: the gated form keeps working as before
      form.removeAttribute("data-gated");
      var submit = form.querySelector('button[type="submit"]');
      submit.parentNode.insertBefore(honeypot(), submit);
      var msg = form.querySelector("[data-form-msg]");
      if (msg) msg.setAttribute("aria-live", "polite");
      var nameIn = form.elements.name, emailIn = form.elements.email;
      if (nameIn) nameIn.maxLength = 100;
      if (form.elements.subject) form.elements.subject.maxLength = 150;
      if (form.elements.message) form.elements.message.maxLength = 4000;

      function prefill(user) {            // convenience for logged-in members
        if (!user) return;
        if (nameIn && !nameIn.value) nameIn.value = ((user.first_name || "") + " " + (user.last_name || "")).trim();
        if (emailIn && !emailIn.value) emailIn.value = user.email || "";
      }
      IAML.whenUser().then(prefill);
      IAML.api.session.onChange(prefill);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        ui.clearErrors(form);
        ui.setStatus(msg, "");
        var data = { source: source, website: form.elements.website.value };
        ["name", "email", "subject", "message"].forEach(function (k) {
          if (form.elements[k]) data[k] = form.elements[k].value.trim();
        });
        var missing = null;
        ["name", "email", "message"].forEach(function (k) {
          var c = form.elements[k];
          if (c && !data[k]) { ui.fieldError(form, c, ui.fieldLabel(form, c) + " is required"); if (!missing) missing = c; }
        });
        if (missing) { ui.setStatus(msg, "Please fill in the highlighted fields.", "error"); ui.focus(missing); return; }
        if (!data.subject) delete data.subject;
        ui.busy(submit, true);
        ui.setStatus(msg, "Sending…");
        IAML.api.post("/contact", data).then(function () {
          form.reset();
          prefill(IAML.api.session.user);
          ui.setStatus(msg, "Thank you — your message has been sent. We will reply by e-mail.", "ok");
        }, function (err) {
          ui.applyErrors(form, err, { status: msg });
        }).then(function () { ui.busy(submit, false); });
      });
    });
  }

  /* ═══ Participants roster ═══ */
  function renderRoster(mount, positions) {
    clear(mount);
    if (!positions.length) { mount.appendChild(emptyState("The participants list will appear here soon.")); return; }
    positions.forEach(function (pos) {
      var role = pos.singular || pos.name;
      var cards = (pos.participants || []).map(function (p) {
        return el("article", { "class": "pcard" },
          el("span", { "class": "pcard__avatar", "aria-hidden": "true" }, fmt.initials(p.name)),
          el("div", { "class": "pcard__body" },
            el("h4", null, p.name),
            el("p", { "class": "pcard__role" }, role),
            p.org ? el("p", { "class": "pcard__org" }, p.org) : null));
      });
      mount.appendChild(el("div", { "class": "pgroup" },
        el("h3", { "class": "pgroup__title" }, pos.name),
        el("div", { "class": "pgrid" }, cards)));
    });
  }

  /* static roster from the members file (GitHub Pages draft without a backend) */
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

  function renderStaticParticipants(mount) {
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

  function initParticipants() {
    var mount = $("participants-list");
    if (!mount) return;
    withBackend(mount, function () {
      return IAML.api.get("/participants").then(function (res) {
        showStatus(mount, null);
        renderRoster(mount, res.positions || []);
      });
    }, function () { renderStaticParticipants(mount); });
    wireContactForm(document.querySelector(".contact-admin form"), "participants");
  }

  /* ═══ Useful Links ═══ */
  var LINK_CATEGORIES = [
    { id: "corpora",      title: "Corpora",      blurb: "Text and speech corpora of Mongolic languages." },
    { id: "data-banks",   title: "Data banks",   blurb: "Databases and archives of linguistic data." },
    { id: "dictionaries", title: "Dictionaries", blurb: "Dictionaries and lexical resources." },
    { id: "textbooks",    title: "Textbooks",    blurb: "Learning and teaching materials." },
    { id: "monographs",   title: "Monographs",   blurb: "Monographs and scholarly books available online." }
  ];
  var USEFUL_LINKS = [
    { cat: "corpora",      title: "Resource title", desc: "A short description of this resource will appear here.", url: "" },
    { cat: "corpora",      title: "Resource title", desc: "A short description of this resource will appear here.", url: "" },
    { cat: "data-banks",   title: "Resource title", desc: "A short description of this resource will appear here.", url: "" },
    { cat: "data-banks",   title: "Resource title", desc: "A short description of this resource will appear here.", url: "" },
    { cat: "dictionaries", title: "Resource title", desc: "A short description of this resource will appear here.", url: "" },
    { cat: "dictionaries", title: "Resource title", desc: "A short description of this resource will appear here.", url: "" },
    { cat: "textbooks",    title: "Resource title", desc: "A short description of this resource will appear here.", url: "" },
    { cat: "textbooks",    title: "Resource title", desc: "A short description of this resource will appear here.", url: "" },
    { cat: "monographs",   title: "Resource title", desc: "A short description of this resource will appear here.", url: "" },
    { cat: "monographs",   title: "Resource title", desc: "A short description of this resource will appear here.", url: "" }
  ];

  function renderStaticLinks(mount) {
    function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
    function card(l) {
      var safe = /^https?:\/\//i.test(l.url || "");
      var body = '<h4>' + esc(l.title) + '</h4>' + (l.desc ? '<p>' + esc(l.desc) + '</p>' : '');
      if (!safe) return '<div class="lcard lcard--soon">' + body + '<span class="lcard__tag">Link coming soon</span></div>';
      return '<a class="lcard" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + body +
        '<span class="lcard__url">' + esc(host(l.url)) + ' ↗</span></a>';
    }
    var cats = $("links-cats");
    if (cats) cats.innerHTML = LINK_CATEGORIES.map(function (c) {
      return '<a class="chip" href="#' + esc(c.id) + '">' + esc(c.title) + '</a>';
    }).join("");
    mount.innerHTML = LINK_CATEGORIES.map(function (c) {
      var items = USEFUL_LINKS.filter(function (l) { return l.cat === c.id; });
      if (!items.length) return "";
      return '<div class="pgroup lgroup" id="' + esc(c.id) + '"><h3 class="pgroup__title">' + esc(c.title) + '</h3>' +
        (c.blurb ? '<p class="lgroup__blurb">' + esc(c.blurb) + '</p>' : '') +
        '<div class="lgrid">' + items.map(card).join("") + '</div></div>';
    }).join("");
  }

  function linkHost(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
  function linkCard(l) {
    var url = IAML.safeUrl(l.url);
    var body = [el("h4", null, l.title), l.description ? el("p", null, l.description) : null];
    if (!url) return el("div", { "class": "lcard lcard--soon" }, body, el("span", { "class": "lcard__tag" }, "Link coming soon"));
    return el("a", { "class": "lcard", href: url, target: "_blank", rel: "noopener noreferrer" }, body,
      el("span", { "class": "lcard__url" }, linkHost(url) + " ", el("span", { "aria-hidden": "true" }, "↗"), el("span", { "class": "sr-only" }, " (opens in a new tab)")));
  }
  function catId(c) { return "cat-" + String(c.slug || c.id).replace(/[^A-Za-z0-9_-]+/g, "-"); }

  function renderLinks(mount, cats, categories) {
    clear(mount); if (cats) clear(cats);
    if (!categories.length) {
      if (cats) cats.hidden = true;
      mount.appendChild(emptyState("Links will appear here soon."));
      return;
    }
    if (cats) {
      cats.hidden = false;
      categories.forEach(function (c) { cats.appendChild(el("a", { "class": "chip", href: "#" + catId(c) }, c.title)); });
    }
    categories.forEach(function (c) {
      mount.appendChild(el("div", { "class": "pgroup lgroup", id: catId(c) },
        el("h3", { "class": "pgroup__title" }, c.title),
        c.blurb ? el("p", { "class": "lgroup__blurb" }, c.blurb) : null,
        el("div", { "class": "lgrid" }, (c.links || []).map(linkCard))));
    });
  }

  function initUsefulLinks() {
    var mount = $("links-list");
    if (!mount) return;
    var cats = $("links-cats");
    withBackend(mount, function () {
      return IAML.api.get("/links").then(function (res) {
        showStatus(mount, null);
        renderLinks(mount, cats, res.categories || []);
      });
    }, function () { renderStaticLinks(mount); });
  }

  /* ═══ Contacts ═══ */
  var CONTACT_PEOPLE = [
    { position: "President", name: "Juha Janhunen", email: "" },
    { position: "Executive Director", name: "Erdene-Ochir Tumen-Ochir", email: "" },
    { position: "CTO (Chief Technology Officer)", name: "Denis Tikhomirov", email: "" }
  ];

  function renderStaticContacts(mount) {
    mount.innerHTML = CONTACT_PEOPLE.map(function (p) {
      var mail = /^[^\s@<>]+@[^\s@<>]+$/.test(p.email || "")
        ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>'
        : '<span class="is-empty">Email to be added</span>';
      return '<article class="pcontact">' +
        '<p class="pcontact__pos">' + esc(p.position) + '</p>' +
        '<h4 class="pcontact__name' + (p.name ? '' : ' is-empty') + '">' + esc(p.name || "First Last") + '</h4>' +
        '<p class="pcontact__mail">' + mail + '</p></article>';
    }).join("");
  }

  var MAIL_RE = /^[^\s@<>]+@[^\s@<>]+$/;
  function contactCard(p) {
    var mail = MAIL_RE.test(p.email || "")
      ? el("a", { href: "mailto:" + p.email }, p.email)
      : el("span", { "class": "is-empty" }, "Email to be added");
    return el("article", { "class": "pcontact" },
      el("p", { "class": "pcontact__pos" }, p.position),
      el("h4", { "class": "pcontact__name" }, p.name),
      el("p", { "class": "pcontact__mail" }, mail));
  }
  function renderContacts(mount, data) {
    clear(mount);
    mount.classList.add("contacts__people--live");
    (data.people || []).forEach(function (p) { mount.appendChild(contactCard(p)); });
    if (data.email || data.address) {
      mount.appendChild(el("article", { "class": "pcontact pcontact--general" },
        el("p", { "class": "pcontact__pos" }, "General enquiries"),
        data.email && MAIL_RE.test(data.email) ? el("p", { "class": "pcontact__mail" }, el("a", { href: "mailto:" + data.email }, data.email)) : null,
        data.address ? el("p", { "class": "pcontact__addr pre-line" }, data.address) : null));
    }
    if (!mount.firstChild) mount.appendChild(emptyState("Contact details will appear here soon."));
  }

  function initContacts() {
    var mount = $("contacts-people");
    if (!mount) return;
    withBackend(mount, function () {
      return IAML.api.get("/contacts").then(function (res) {
        showStatus(mount, null);
        renderContacts(mount, res || {});
      });
    }, function () { renderStaticContacts(mount); });
    wireContactForm($("contactForm"), "contacts");
  }

  /* ═══ Custom page (?slug=) ═══ */
  function initCustomPage() {
    if (document.body.getAttribute("data-page") !== "custom") return;
    var slug = new URLSearchParams(location.search).get("slug");
    var t = $("customPageTitle");
    var body = $("customPageBody");
    if (slug && t) {                      // static placeholder: a pretty version of the slug
      var pretty = slug.replace(/[-_]+/g, " ").replace(/\b\w/g, function (m) { return m.toUpperCase(); });
      t.textContent = pretty;
      document.title = pretty + " — IAML";
    }
    if (!body) return;

    function notFound() {
      if (t) t.textContent = "Page not found";
      document.title = "Page not found — IAML";
      clear(body);
      body.appendChild(el("p", { "class": "section__lead" }, "The page you are looking for doesn’t exist, has moved or is not published yet."));
      body.appendChild(el("a", { "class": "btn btn--p", href: "index.html" }, "Return home"));
    }
    withBackend(body, function () {
      if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/i.test(slug)) { notFound(); return null; }
      return IAML.api.get("/pages/" + encodeURIComponent(slug.toLowerCase())).then(function (page) {
        if (t) t.textContent = page.title;
        document.title = page.title + " — IAML";
        if (IAML.md) IAML.md.into(body, page.body);
        else { clear(body); body.appendChild(IAML.paragraphs(page.body)); }
      }, function (err) {
        if (err && err.status === 404) { notFound(); return null; }
        throw err;
      });
    });
  }

  ready(function () {
    try { initCarousels(); } catch (e) {}
    try { initCards(); } catch (e) {}
    try { initForms(); } catch (e) {}
    try { initForum(); } catch (e) {}
    try { initAvatar(); } catch (e) {}
    try { initNews(); } catch (e) {}
    try { initEvents(); } catch (e) {}
    try { initPublications(); } catch (e) {}
    try { initParticipants(); } catch (e) {}
    try { initUsefulLinks(); } catch (e) {}
    try { initContacts(); } catch (e) {}
    try { initCustomPage(); } catch (e) {}
  });
})();
