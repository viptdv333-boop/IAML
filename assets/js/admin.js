/* ═══════════════════════════════════════════════════
   IAML admin — app shell: auth gate, sidebar, hash router, badges.
   Loaded LAST (after api.js, md.js, admin-ui/crud/content/ops.js):
   the section files register themselves with A.register(key, def),
   this file builds the navigation from that registry and boots.

   Auth gate:  /api/auth/me → null → login card
                           → role !== "admin" → access denied
                           → admin → app
   Routes:     #/dashboard  #/news  #/events  #/participants[/positions]  …
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = window.IAML;
  var A = IAML.admin;
  var h = A.h;
  var api = IAML.api;

  var GROUPS = ["Overview", "Content", "Community", "System"];
  var state = { mode: "boot", user: null, ctl: null, navBadges: {}, loginShown: false };
  var rootEl = null;

  function setRoot(node) {
    A.closeModals();
    document.body.classList.remove("nav-open");
    A.clear(rootEl);
    rootEl.appendChild(node);
  }

  /* ───────────────────────── plain cards (login / denied / error) ───────────────────────── */
  function authCard(children, o) {
    return h("div", { class: "auth" }, h("div", { class: "auth__card" + (o && o.wide ? " auth__card--wide" : "") }, [
      h("div", { class: "auth__brand" }, [
        h("img", { src: "favicon.svg", alt: "", width: "44", height: "44" }),
        h("div", null, [h("div", { class: "auth__name", text: "IAML" }), h("div", { class: "auth__sub", text: "Administration" })])
      ])
    ].concat(children)));
  }

  function renderBoot() {
    state.mode = "boot";
    document.title = "Admin — IAML";
    setRoot(h("div", { class: "boot" }, A.loading("Loading the admin panel…")));
  }

  function renderBootError(err) {
    state.mode = "error";
    var offline = !err || err.status === 0 || err.status === 404 || err.code === "http_error";
    setRoot(authCard([
      h("h1", { class: "auth__title", text: offline ? "The IAML backend is not reachable" : "Something went wrong" }),
      h("p", { class: "auth__text", text: offline
        ? "The admin panel needs the IAML server (the /api endpoints on this site). It did not answer — if you are viewing the static draft site, the admin panel is not available there."
        : A.errText(err) }),
      h("div", { class: "auth__actions" }, [A.btn("Try again", { kind: "primary", icon: "refresh", onClick: boot }), A.btn("Back to the site", { kind: "secondary", href: "index.html" })])
    ]));
  }

  function loginMessage(err, email) {
    if (err.code === "rate_limited") {
      var s = err.extra && err.extra.retryAfter;
      return "Too many login attempts. " + (s ? "Please wait " + (s > 90 ? Math.ceil(s / 60) + " minutes" : s + " seconds") + " and try again." : "Please wait a little and try again.");
    }
    if (err.code === "email_not_verified") {
      return "This account's e-mail address has not been confirmed yet" + ((err.extra && err.extra.email) || email ? " (" + ((err.extra && err.extra.email) || email) + ")" : "") +
        ". A new confirmation code was e-mailed to it — confirm it on the site (log in there and enter the code), then come back here.";
    }
    if (err.code === "account_disabled") return "This account has been disabled. Please contact another administrator.";
    return A.errText(err);
  }

  function renderLogin(notice) {
    state.mode = "login";
    state.loginShown = true;
    document.title = "Log in — IAML Admin";
    var form = A.form([
      { name: "email", label: "E-mail", type: "email", required: true, autocomplete: "username", inputmode: "email", autocapitalize: "none" },
      { name: "password", label: "Password", type: "password", required: true, autocomplete: "current-password" }
    ]);
    form.el.setAttribute("autocomplete", "on"); // let password managers fill the login form
    var banner = h("div", { class: "banner banner--error", role: "alert", hidden: true });
    var info = notice ? h("div", { class: "banner banner--info", role: "status", text: notice }) : null;
    var btn = A.btn("Log in", { kind: "primary", type: "submit", form: form.id, block: true });
    var busy = false;

    function show(msg) { banner.textContent = msg || ""; banner.hidden = !msg; }

    form.el.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      var v = form.get();
      form.clearErrors(); show("");
      if (!v.email.trim() || !v.password) {
        var miss = {};
        if (!v.email.trim()) miss.email = "is required";
        if (!v.password) miss.password = "is required";
        var r0 = form.setErrors(miss); if (r0.first) r0.first.focus();
        return;
      }
      busy = true; A.setBusy(btn, true, "Logging in…");
      api.post("/auth/login", { email: v.email.trim(), password: v.password }).then(function (res) {
        state.loginShown = false;
        api.session.setUser(res && res.user);
        boot();
      }, function (err) {
        busy = false; A.setBusy(btn, false);
        if (err && err.fields) { var r = form.setErrors(err.fields); if (r.first) r.first.focus(); }
        show(loginMessage(err || {}, v.email.trim()));
        form.fields.password.set("");
        if (err && err.code === "invalid_credentials") form.fields.password.focus();
      });
    });

    setRoot(authCard([
      h("h1", { class: "auth__title", text: "Log in" }),
      h("p", { class: "auth__text", text: "Sign in with your administrator account to manage the IAML website." }),
      info, banner, form.el,
      h("div", { class: "auth__actions" }, btn),
      h("p", { class: "auth__foot" }, h("a", { href: "index.html", text: "← Back to the site" }))
    ]));
    var first = form.fields.email;
    if (first) first.focus();
  }

  function renderDenied(user) {
    state.mode = "denied";
    document.title = "Access denied — IAML Admin";
    setRoot(authCard([
      h("div", { class: "auth__icon auth__icon--warn" }, A.icon("shield", 28)),
      h("h1", { class: "auth__title", text: "Access denied" }),
      h("p", { class: "auth__text", text: "You are logged in as " + (A.fullName(user) || user.email) + " (" + user.email + "), but this area is restricted to administrators." }),
      h("div", { class: "auth__actions" }, [
        A.btn("Go to the site", { kind: "primary", href: "index.html" }),
        A.btn("Log out", { kind: "secondary", icon: "logout", onClick: logout })
      ])
    ]));
  }

  /* ───────────────────────── session ───────────────────────── */
  function boot() {
    renderBoot();
    api.session.me(true).then(function (user) {
      state.user = user || null;
      if (!user) { renderLogin(); return; }
      if (user.role !== "admin") { renderDenied(user); return; }
      renderApp(user);
    }, renderBootError);
  }

  function logout() {
    api.session.logout().then(function () {
      state.user = null;
      renderLogin("You have been logged out.");
    }, function (err) { A.fail(err); });
  }

  A.onUnauthenticated = function () {
    if (state.loginShown) return;
    api.session.setUser(null);
    state.user = null;
    teardown();
    renderLogin("Your session has expired. Please log in again.");
  };

  function teardown() {
    if (state.ctl && state.ctl.destroy) { try { state.ctl.destroy(); } catch (e) { /* ignore */ } }
    state.ctl = null;
  }

  /* ───────────────────────── app shell ───────────────────────── */
  function sortedSections() {
    return Object.keys(A.sections).map(function (k) { return A.sections[k]; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function buildNav() {
    var nav = h("nav", { class: "nav", "aria-label": "Admin sections" });
    state.navBadges = {};
    var all = sortedSections();
    GROUPS.forEach(function (g) {
      var items = all.filter(function (d) { return d.group === g; });
      if (!items.length) return;
      var ul = h("ul", { class: "nav__list" });
      items.forEach(function (d) {
        var badge = null;
        if (d.badge) {
          badge = h("span", { class: "nav__badge" + (d.badgeTone === "danger" ? " nav__badge--danger" : ""), hidden: true });
          state.navBadges[d.key] = badge;
        }
        ul.appendChild(h("li", null, h("a", { class: "nav__link", href: "#/" + d.key, "data-key": d.key }, [A.icon(d.icon, 18), h("span", { class: "nav__text", text: d.label }), badge])));
      });
      nav.appendChild(h("div", { class: "nav__group" }, [h("div", { class: "nav__title", text: g }), ul]));
    });
    return nav;
  }

  function openNav() {
    document.body.classList.add("nav-open");
    var burger = document.getElementById("adm-burger");
    if (burger) { burger.setAttribute("aria-expanded", "true"); burger.setAttribute("aria-label", "Close menu"); }
    var first = document.querySelector("#adm-side .nav__link");
    if (first) first.focus();
  }
  function closeNav(restoreFocus) {
    if (!document.body.classList.contains("nav-open")) return;
    document.body.classList.remove("nav-open");
    var burger = document.getElementById("adm-burger");
    if (burger) { burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", "Open menu"); if (restoreFocus) burger.focus(); }
  }

  function renderApp(user) {
    state.mode = "app";
    var name = A.fullName(user) || user.email;
    var main = h("main", { id: "adm-main", class: "view", tabindex: "-1" });

    var side = h("aside", { class: "side", id: "adm-side" }, [
      h("a", { class: "side__brand", href: "#/dashboard", "aria-label": "IAML Admin — dashboard" }, [
        h("img", { src: "favicon.svg", alt: "", width: "38", height: "38" }),
        h("div", null, [h("span", { class: "side__name", text: "IAML" }), h("span", { class: "side__sub", text: "Admin panel" })])
      ]),
      buildNav(),
      h("div", { class: "side__foot" }, [
        h("a", { class: "side__sitelink", href: "index.html", target: "_blank", rel: "noopener" }, [A.icon("globe", 16), "View site"]),
        h("span", { class: "side__tz", text: "Times shown in UTC+3" })
      ])
    ]);

    var burger = h("button", { type: "button", class: "top__burger", id: "adm-burger", "aria-label": "Open menu", "aria-expanded": "false", "aria-controls": "adm-side", onclick: function () {
      if (document.body.classList.contains("nav-open")) closeNav(true); else openNav();
    } }, A.icon("menu", 22));

    var top = h("header", { class: "top" }, [
      burger,
      h("a", { class: "top__brand", href: "#/dashboard", text: "IAML Admin" }),
      h("div", { class: "top__spacer" }),
      h("div", { class: "top__user" }, [
        A.avatar({ name: name, avatar_url: user.avatar_url }, "sm"),
        h("span", { class: "top__name", text: name, title: user.email }),
        A.btn("View site", { kind: "ghost", size: "sm", icon: "external", href: "index.html", target: "_blank", className: "top__site" }),
        A.btn("Log out", { kind: "secondary", size: "sm", icon: "logout", onClick: logout })
      ])
    ]);

    var skip = h("button", { type: "button", class: "skip", onclick: function () { main.focus(); } }, "Skip to content");
    var scrim = h("div", { class: "scrim", onclick: function () { closeNav(true); } });

    setRoot(h("div", { class: "shell" }, [skip, side, scrim, h("div", { class: "main" }, [top, main])]));
    route(true);
    A.refreshBadges();
  }

  /* ───────────────────────── badges ───────────────────────── */
  A.updateBadges = function (s) {
    s = s || {};
    Object.keys(A.sections).forEach(function (k) {
      var d = A.sections[k], el = state.navBadges[k];
      if (!d.badge || !el) return;
      var n = s[d.badge] | 0;
      A.clear(el);
      el.appendChild(document.createTextNode(n > 99 ? "99+" : String(n)));
      if (d.badgeLabel) el.appendChild(h("span", { class: "sr-only", text: " " + d.badgeLabel }));
      el.hidden = n < 1;
    });
  };
  var refreshNow = function () {
    if (state.mode !== "app") return;
    api.get("/admin/stats").then(A.updateBadges, function (err) { if (err && err.status === 401) A.fail(err); });
  };
  A.refreshBadges = A.debounce(refreshNow, 150);

  /* ───────────────────────── router ───────────────────────── */
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  function parseHash() {
    var raw = String(location.hash || "").replace(/^#\/?/, "");
    var query = {}, qi = raw.indexOf("?");
    if (qi >= 0) {
      raw.slice(qi + 1).split("&").forEach(function (p) {
        if (!p) return;
        var kv = p.split("=");
        query[dec(kv[0])] = dec((kv[1] || "").replace(/\+/g, " "));
      });
      raw = raw.slice(0, qi);
    }
    var path = raw.split("/").filter(Boolean).map(dec);
    return { path: path, key: path[0] || "dashboard", sub: path.slice(1), query: query };
  }

  function route(initial) {
    if (state.mode !== "app") return;
    var main = document.getElementById("adm-main");
    if (!main) return;
    var r = parseHash();
    var def = A.sections[r.key];
    A.closeModals();
    teardown();
    A.clear(main);
    closeNav(false);

    document.querySelectorAll("#adm-side .nav__link").forEach(function (a) {
      var on = def && a.getAttribute("data-key") === def.key;
      a.classList.toggle("is-active", !!on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });

    if (!def) {
      document.title = "Not found — IAML Admin";
      main.appendChild(A.pageHead("Page not found", "There is no admin section called “" + r.key + "”."));
      main.appendChild(A.empty("Nothing here", "Use the menu to pick a section.", A.btn("Go to the dashboard", { kind: "primary", href: "#/dashboard" })));
    } else {
      document.title = (def.title || def.label) + " — IAML Admin";
      try {
        state.ctl = def.mount(main, r) || null;
      } catch (e) {
        if (window.console && console.error) console.error(e);
        A.clear(main);
        main.appendChild(A.pageHead(def.title || def.label));
        main.appendChild(A.errorState({ message: "This section failed to start. Reload the page and try again." }, function () { route(false); }));
      }
    }
    window.scrollTo(0, 0);
    if (!initial) {
      var hd = main.querySelector("h1");
      if (hd) { try { hd.focus({ preventScroll: true }); } catch (e2) { hd.focus(); } }
    }
    A.refreshBadges();
  }

  window.addEventListener("hashchange", function () { route(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.classList.contains("nav-open")) closeNav(true);
  });
  /* leaving the narrow layout: make sure the drawer state is reset */
  window.addEventListener("resize", A.debounce(function () { if (window.innerWidth > 900) closeNav(false); }, 150));

  /* ───────────────────────── start ───────────────────────── */
  function start() {
    rootEl = document.getElementById("adm-root");
    if (!rootEl) { rootEl = h("div", { id: "adm-root" }); document.body.appendChild(rootEl); }
    boot();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
