/* ═══════════════════════════════════════════════════
   IAML — member pages: My account · Mongolist subscriptions
   Both need a log-in; they update live when somebody logs in / out
   (IAML.api.session.onChange) — no page reload.   docs/API.md §3
   Static mode (no backend): the gate + gated forms stay as they are.
   Load after api.js + app.js + pages.js.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = window.IAML;
  if (!IAML || !IAML.el) return;
  var el = IAML.el, ui = IAML.ui, clear = IAML.clear, t = IAML.t;
  var page = document.body.getAttribute("data-page");

  function $(id) { return document.getElementById(id); }
  function loadingNode() { return el("p", { "class": "live-loading" }, t("Loading…")); }

  /* ═══════════════ MY ACCOUNT ═══════════════ */
  function initAccount() {
    var box = $("accountBox"), gate = $("accountGate"), form = $("profileForm"), more = $("accountMore");
    if (!box || !gate || !form || !more) return;
    var preview = $("avatarPreview"), fileIn = $("avatarFile"), removeBtn = $("avatarRemove"), avatarMsg = $("avatarMsg");
    var profileMsg = form.querySelector("[data-form-msg]");
    var pwForm = $("passwordForm"), pwMsg = pwForm.querySelector("[data-form-msg]");
    var shownId; // undefined = nothing rendered yet

    box.classList.add("live-pending");   // hide the static gate + gated form until the session is known

    function fillFields(u) {
      form.elements.first_name.value = u.first_name || "";
      form.elements.last_name.value = u.last_name || "";
      form.elements.workplace.value = u.workplace || "";
      form.elements.email.value = u.email || "";
    }

    function renderAvatar(u) {
      clear(preview);
      preview.style.backgroundImage = "";
      preview.classList.remove("avatar--img");
      var a = ui.avatar(u, "lg");
      var img = a.querySelector("img");
      if (img) preview.appendChild(img); else preview.textContent = a.textContent;
      removeBtn.hidden = !u.avatar_url;
    }

    function show(u) {
      var id = u ? u.id : null;
      gate.hidden = !!u;
      form.hidden = !u;
      more.hidden = !u;
      if (!u) { shownId = null; return; }
      if (id !== shownId) {              // first display / another account: (re)fill the form once
        fillFields(u);
        ui.setStatus(profileMsg, ""); ui.setStatus(avatarMsg, ""); ui.setStatus(pwMsg, "");
        ui.clearErrors(form); ui.clearErrors(pwForm);
        pwForm.reset();
      }
      shownId = id;
      renderAvatar(u);                   // the avatar follows every change (upload / remove)
    }

    /* ── profile ── */
    form.addEventListener("submit", function (e) {
      if (!IAML.isLive) return;           // static mode: the gated-form notice (pages.js) handles it
      e.preventDefault();
      ui.clearErrors(form);
      ui.setStatus(profileMsg, "");
      var data = {
        first_name: form.elements.first_name.value.trim(),
        last_name: form.elements.last_name.value.trim(),
        workplace: form.elements.workplace.value.trim()
      };
      var first = null;
      ["first_name", "last_name", "workplace"].forEach(function (k) {
        var c = form.elements[k];
        if (!data[k]) { ui.fieldError(form, c, t("{field} is required", { field: ui.fieldLabel(form, c) })); if (!first) first = c; }
      });
      if (first) { ui.setStatus(profileMsg, t("Please fill in the highlighted fields."), "error"); ui.focus(first); return; }
      var btn = form.querySelector('button[type="submit"]');
      ui.busy(btn, true);
      IAML.api.patch("/me", data).then(function (res) {
        IAML.api.session.setUser(res.user);   // header name/avatar update immediately
        fillFields(res.user);
        ui.setStatus(profileMsg, t("Profile saved."), "ok");
      }, function (err) {
        sessionLost(err) || ui.applyErrors(form, err, { status: profileMsg });
      }).then(function () { ui.busy(btn, false); });
    });

    /* ── avatar ── */
    var MAX_BYTES = 2 * 1024 * 1024;
    function allowedImage(f) {
      if (/^image\/(jpeg|png|webp)$/i.test(f.type)) return true;
      return !f.type && /\.(jpe?g|png|webp)$/i.test(f.name || "");
    }
    fileIn.addEventListener("change", function () {
      if (!IAML.isLive) return;
      var f = fileIn.files && fileIn.files[0];
      fileIn.value = "";                  // allows choosing the same file again later
      if (!f) return;
      ui.setStatus(avatarMsg, "");
      if (!allowedImage(f)) { ui.setStatus(avatarMsg, t("Please choose a JPEG, PNG or WebP image."), "error"); return; }
      if (f.size > MAX_BYTES) { ui.setStatus(avatarMsg, t("The image must be 2 MB or smaller."), "error"); return; }
      // client-side preview while the upload runs
      var url = URL.createObjectURL(f);
      clear(preview);
      preview.appendChild(el("img", { src: url, alt: "" }));
      ui.setStatus(avatarMsg, t("Uploading…"));
      var fd = new FormData();
      fd.append("avatar", f);
      IAML.api.upload("/me/avatar", fd).then(function (res) {
        IAML.api.session.setUser(res.user);   // header avatar updates immediately
        ui.setStatus(avatarMsg, t("Photo updated."), "ok");
      }, function (err) {
        if (!sessionLost(err)) ui.setStatus(avatarMsg, IAML.errorText(err), "error");
        if (IAML.api.session.user) renderAvatar(IAML.api.session.user);
      }).then(function () { URL.revokeObjectURL(url); });
    });

    removeBtn.addEventListener("click", function () {
      if (!IAML.isLive) return;
      ui.setStatus(avatarMsg, "");
      ui.busy(removeBtn, true);
      IAML.api.del("/me/avatar").then(function (res) {
        IAML.api.session.setUser(res.user);
        ui.setStatus(avatarMsg, t("Photo removed."), "ok");
      }, function (err) {
        if (!sessionLost(err)) ui.setStatus(avatarMsg, IAML.errorText(err), "error");
      }).then(function () { ui.busy(removeBtn, false); });
    });

    /* ── change password ── */
    pwForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!IAML.isLive) return;
      ui.clearErrors(pwForm);
      ui.setStatus(pwMsg, "");
      var cur = pwForm.elements.current_password, nw = pwForm.elements.new_password;
      var bad = null;
      if (!cur.value) { ui.fieldError(pwForm, cur, t("Current password is required")); bad = cur; }
      if (nw.value.length < 8) { ui.fieldError(pwForm, nw, t("New password must be at least 8 characters")); bad = bad || nw; }
      if (bad) { ui.setStatus(pwMsg, t("Please check the highlighted fields."), "error"); ui.focus(bad); return; }
      var btn = pwForm.querySelector('button[type="submit"]');
      ui.busy(btn, true);
      IAML.api.post("/me/password", { current_password: cur.value, new_password: nw.value }).then(function () {
        pwForm.reset();
        ui.setStatus(pwMsg, t("Password changed. You were logged out on your other devices."), "ok");
      }, function (err) {
        sessionLost(err) || ui.applyErrors(pwForm, err, { status: pwMsg });
      }).then(function () { ui.busy(btn, false); });
    });

    /* ── delete account / log out ── */
    $("deleteAccountBtn").addEventListener("click", function () {
      if (!IAML.isLive) return;
      IAML.dialog.form({
        title: t("Delete your account?"),
        intro: t("This permanently deletes your account, your Mongolist subscriptions and your photo. Your Discuss posts stay, shown as “Deleted user”. This can’t be undone."),
        fields: [{ name: "password", type: "password", label: t("Your password"), help: t("Enter your password to confirm."), required: true, autocomplete: "current-password" }],
        submitLabel: t("Delete my account"), danger: true,
        onSubmit: function (v) { return IAML.api.del("/me", { password: v.password }); }
      }).then(function (done) {
        if (!done) return;
        IAML.api.session.setUser(null);
        window.location.href = "index.html";
      });
    });
    $("logoutBtn").addEventListener("click", function () { if (IAML.isLive && IAML.auth) IAML.auth.logout(); });

    /* the session ended in the background (expired / revoked): fall back to the gate */
    function sessionLost(err) {
      if (!err || err.code !== "unauthenticated") return false;
      IAML.api.session.me(true).then(null, function () {});
      return true;
    }

    function reveal() { box.classList.remove("live-pending"); }
    IAML.live().then(function (ok) {
      if (!ok) return null;                    // static mode: gate + gated form stay
      form.removeAttribute("data-gated");
      var emailRow = $("accountEmailRow");
      if (emailRow) emailRow.hidden = false;   // read-only e-mail field is only meaningful with a backend
      return IAML.whenUser().then(function (u) {
        show(u);
        IAML.api.session.onChange(show);
      });
    }).then(reveal, reveal);
  }

  /* ═══════════════ MONGOLIST SUBSCRIPTIONS ═══════════════ */
  var TOPICS = [
    { key: "news", label: t("News") },
    { key: "events", label: t("Events") },
    { key: "publications", label: t("Publications") },
    { key: "participants", label: t("New participants") },
    { key: "discuss", label: t("New Discuss questions") }
  ];
  var FREQS = [["instant", t("Instant")], ["daily", t("Daily digest")], ["weekly", t("Weekly digest")]];

  function initMongolist() {
    var box = $("mlistBox"), gate = $("mlistGate"), form = $("subForm");
    if (!box || !gate || !form) return;
    var shownId;

    box.classList.add("live-pending");   // hide the static gate + gated form until the session is known

    function topicRow(topic, data) {
      var cb = el("input", { type: "checkbox", name: topic.key });
      cb.checked = !!data.enabled;
      var sel = el("select", { name: topic.key + "_freq", "aria-label": t("{topic} — how often", { topic: topic.label }) },
        FREQS.map(function (f) { return el("option", { value: f[0] }, f[1]); }));
      sel.value = data.frequency || "daily";
      sel.disabled = !data.enabled;
      var row = el("div", { "class": "sub-row" + (data.enabled ? "" : " sub-row--off") },
        el("label", { "class": "sub-row__topic" }, cb, topic.label), sel);
      cb.addEventListener("change", function () {
        sel.disabled = !cb.checked;
        row.classList.toggle("sub-row--off", !cb.checked);
      });
      return row;
    }

    function renderForm(res) {
      var byTopic = {};
      (res.topics || []).forEach(function (tp) { byTopic[tp.topic] = tp; });
      clear(form);
      var hint = el("p", { "class": "sub-hint", id: "subHint", hidden: res.configured ? "" : null },
        t("These are suggested defaults — nothing is e-mailed until you save."));
      var msg = el("p", { "class": "cform__msg", "aria-live": "polite", "data-form-msg": "" });
      var save = el("button", { "class": "btn btn--p", type: "submit" }, t("Save preferences"));
      form.appendChild(hint);
      form.appendChild(el("p", { "class": "sub-form__intro" }, t("Choose topics and how often you want to hear about each.")));
      TOPICS.forEach(function (tp) { form.appendChild(topicRow(tp, byTopic[tp.key] || { enabled: false, frequency: "daily" })); });
      form.appendChild(save);
      form.appendChild(msg);
      form.appendChild(el("p", { "class": "sub-note" }, t("Every e-mail from Mongolist includes an unsubscribe link, so you can opt out at any time.")));
    }

    function load(u) {
      var id = u.id;
      clear(form);
      form.appendChild(loadingNode());
      IAML.api.get("/me/subscriptions").then(function (res) {
        if (shownId !== id) return;
        renderForm(res);
      }, function (err) {
        if (shownId !== id) return;
        clear(form);
        if (err && err.code === "unauthenticated") { IAML.api.session.me(true).then(null, function () {}); return; }
        form.appendChild(el("div", { "class": "live-error", role: "alert" },
          el("p", null, t("We couldn’t load your preferences. {reason}", { reason: IAML.errorText(err) })),
          el("button", { "class": "btn btn--o btn--sm", type: "button", on: { click: function () { load(u); } } }, t("Try again"))));
      });
    }

    function show(u) {
      var id = u ? u.id : null;
      gate.hidden = !!u;
      form.hidden = !u;
      if (!u) { shownId = null; return; }
      if (id === shownId) return;       // same account: keep what is on screen
      shownId = id;
      load(u);
    }

    form.addEventListener("submit", function (e) {
      if (!IAML.isLive) return;           // static mode: the gated-form notice (pages.js) handles it
      e.preventDefault();
      var msg = form.querySelector("[data-form-msg]");
      var save = form.querySelector('button[type="submit"]');
      if (!msg || !save) return;
      var topics = TOPICS.map(function (tp) {
        return { topic: tp.key, enabled: form.elements[tp.key].checked, frequency: form.elements[tp.key + "_freq"].value };
      });
      ui.setStatus(msg, "");
      ui.busy(save, true);
      IAML.api.put("/me/subscriptions", { topics: topics }).then(function (res) {
        var hint = $("subHint");
        if (hint && res.configured) hint.hidden = true;
        ui.setStatus(msg, t("Preferences saved."), "ok");
        IAML.toast(t("Your Mongolist preferences are saved."), "ok");
      }, function (err) {
        if (err && err.code === "unauthenticated") {
          IAML.api.session.me(true).then(null, function () {});
          return;
        }
        ui.applyErrors(form, err, { status: msg });
      }).then(function () { ui.busy(save, false); });
    });

    function reveal() { box.classList.remove("live-pending"); }
    IAML.live().then(function (ok) {
      if (!ok) return null;                    // static mode: gate + gated form stay
      form.removeAttribute("data-gated");
      return IAML.whenUser().then(function (u) {
        show(u);
        IAML.api.session.onChange(show);
      });
    }).then(reveal, reveal);
  }

  IAML.ready(function () {
    try { if (page === "account") initAccount(); } catch (e) { if (window.console) console.error(e); }
    try { if (page === "mongolist") initMongolist(); } catch (e) { if (window.console) console.error(e); }
  });
})();
