/* ═══════════════════════════════════════════════════
   IAML — Discuss (Reddit-style forum)            docs/API.md §4
   · thread list (newest first, "Load more")
   · "Ask a question" form (login required)
   · in-page thread view, deep-linkable: discuss.html#thread-<id>
   · nested comments built from the flat list via parent_id (max depth 6)
   · reply · delete (own post or admin) · report
   Static mode (no backend): the placeholder threads in discuss.html stay.
   Load after api.js + app.js + pages.js.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = window.IAML;
  if (!IAML || !IAML.el || document.body.getAttribute("data-page") !== "discuss") return;
  var el = IAML.el, ui = IAML.ui, fmt = IAML.fmt, clear = IAML.clear, t = IAML.t;

  var PAGE = 20;        // threads per request
  var MAX_DEPTH = 6;    // replies can be nested at most 6 levels deep (server rule)

  var staticBox = document.getElementById("discuss-static");
  var S = {
    user: null,
    threads: [], total: 0, listLoaded: false, loadingList: false, listScroll: 0, lastThreadId: 0,
    view: "", thread: null, comments: [], req: 0, wantAsk: false
  };
  var app, listView, threadView, askBtn, askPanel, askForm, listBox, listStatus, moreBox, moreBtn, moreInfo, commentsBox, repliesHeading;

  /* ── small helpers ── */
  function repliesLabel(n) { return n ? (n === 1 ? t("{n} reply", { n: n }) : t("{n} replies", { n: n })) : t("No replies yet"); }
  function roleBadge(a) { return a && a.role === "admin" ? el("span", { "class": "badge" }, t("Admin")) : null; }
  /* accounts that were deleted arrive as { id: null, name: "Deleted user" } (docs/API.md) */
  function authorName(a) { return a && a.id === null ? t("Deleted user") : (a && a.name) || ""; }
  function isOwn(author) { return !!(S.user && author && author.id && author.id === S.user.id); }
  function isAdmin() { return !!(S.user && S.user.role === "admin"); }
  function actionBtn(label, fn) { return el("button", { "class": "linkbtn", type: "button", on: { click: fn } }, label); }
  function loadingNode() { return el("p", { "class": "live-loading" }, t("Loading…")); }
  function emptyNode(title, sub) { return el("div", { "class": "empty" }, el("p", { "class": "empty__t" }, title), sub ? el("p", { "class": "empty__s" }, sub) : null); }
  function errorNode(err, retry) {
    return el("div", { "class": "live-error", role: "alert" },
      el("p", null, t("We couldn’t load this. {reason}", { reason: IAML.errorText(err) })),
      retry ? el("button", { "class": "btn btn--o btn--sm", type: "button", on: { click: retry } }, t("Try again")) : null);
  }
  function scrollToApp() {
    if (app && app.scrollIntoView) app.scrollIntoView({ block: "start" });
  }

  /* a failed write: session lost → log in again; everything else inline (validation fields, 429 message, …) */
  function handleError(form, err, msgEl) {
    if (err && err.code === "unauthenticated") {
      IAML.api.session.me(true).then(null, function () {});
      ui.setStatus(msgEl, t("Your session has expired — please log in again."), "error");
      IAML.openAuth("login");
      return;
    }
    ui.applyErrors(form, err, { status: msgEl });
  }

  /* ═══ Shell ═══ */
  function buildAskPanel() {
    var title = el("input", { type: "text", name: "title", maxlength: "200", required: "", autocomplete: "off" });
    var body = el("textarea", { name: "body", rows: "6", maxlength: "5000", required: "" });
    var send = el("button", { "class": "btn btn--p", type: "submit" }, t("Post question"));
    var cancel = el("button", { "class": "linkbtn", type: "button", on: { click: function () { closeAsk(true); } } }, t("Cancel"));
    var msg = el("p", { "class": "cform__msg", "aria-live": "polite" });
    askForm = el("form", { "class": "cform cform--card", id: "dsAskForm", novalidate: "" },
      el("h3", null, t("Ask a question")),
      el("label", null, t("Title"), title),
      el("label", null, t("Your question"), body),
      el("div", { "class": "reply-form__row" }, send, cancel),
      msg);
    askForm.addEventListener("submit", function (e) {
      e.preventDefault();
      ui.clearErrors(askForm);
      ui.setStatus(msg, "");
      var data = { title: title.value.trim(), body: body.value.trim() };
      var bad = null;
      if (data.title.length < 3) { ui.fieldError(askForm, title, t("Title must be at least 3 characters")); bad = title; }
      if (!data.body) { ui.fieldError(askForm, body, t("Your question is required")); bad = bad || body; }
      if (bad) { ui.setStatus(msg, t("Please check the highlighted fields."), "error"); ui.focus(bad); return; }
      ui.busy(send, true);
      IAML.api.post("/discuss/threads", data).then(function (res) {
        askForm.reset();
        closeAsk(false);
        S.listLoaded = false;                       // the list is refreshed when we come back to it
        IAML.toast(t("Your question has been posted."), "ok");
        window.location.hash = "thread-" + res.thread.id;
      }, function (err) {
        handleError(askForm, err, msg);
      }).then(function () { ui.busy(send, false); });
    });
    return el("section", { "class": "discuss__ask", id: "dsAsk", hidden: "", "aria-label": t("Ask a question") }, askForm);
  }

  function openAsk() {
    askPanel.hidden = false;
    askBtn.setAttribute("aria-expanded", "true");
    ui.focus(askForm.querySelector('[name="title"]'));
  }
  function closeAsk(refocus) {
    askPanel.hidden = true;
    askBtn.setAttribute("aria-expanded", "false");
    ui.clearErrors(askForm);
    if (refocus) ui.focus(askBtn);
  }

  function buildShell() {
    askBtn = el("button", { "class": "btn btn--p", type: "button", "aria-expanded": "false", "aria-controls": "dsAsk" }, t("Ask a question"));
    askBtn.addEventListener("click", function () {
      if (!S.user) { S.wantAsk = true; IAML.openAuth("login"); return; }
      if (askPanel.hidden) openAsk(); else closeAsk(true);
    });
    askPanel = buildAskPanel();
    listBox = el("div", { "class": "thread-list", id: "dsThreads" });
    listStatus = el("div", { "class": "live-status", "aria-live": "polite" });
    moreBtn = el("button", { "class": "btn btn--o", type: "button", on: { click: function () { loadThreads(false); } } }, t("Load more"));
    moreInfo = el("span", { "class": "discuss__count" });
    moreBox = el("div", { "class": "discuss__more", hidden: "" }, moreBtn, moreInfo);
    listView = el("div", { "class": "discuss__list" },
      el("div", { "class": "discuss__bar" }, askBtn, el("span", { "class": "discuss__hint" }, t("Newest first"))),
      askPanel, listBox, listStatus, moreBox);
    threadView = el("div", { "class": "discuss__thread", hidden: "" });
    app = el("div", { "class": "discuss", id: "discussApp" }, listView, threadView);
    staticBox.parentNode.insertBefore(app, staticBox.nextSibling);
  }

  /* ═══ List ═══ */
  function threadCard(th) {
    var card = el("article", { "class": "thread thread--live" },
      el("div", { "class": "thread__author" }, ui.avatar(th.author, "sm"), el("span", { "class": "thread__name" }, authorName(th.author)), roleBadge(th.author)),
      el("h3", { "class": "thread__title" }, el("a", { href: "#thread-" + th.id, "class": "thread__link" }, th.title)),
      el("p", { "class": "thread__snippet" }, th.snippet),
      el("div", { "class": "thread__meta" },
        el("span", null, repliesLabel(th.reply_count)), el("span", { "aria-hidden": "true" }, "·"),
        el("time", { datetime: th.created_at }, fmt.date(th.created_at))));
    // the whole card is clickable (the title is the real, focusable link)
    card.addEventListener("click", function (e) {
      if (e.target.closest("a")) return;
      window.location.hash = "thread-" + th.id;
    });
    return card;
  }

  function updateMore() {
    moreBox.hidden = S.threads.length >= S.total;
    moreInfo.textContent = t("Showing {n} of {total} questions", { n: S.threads.length, total: S.total });
  }

  function loadThreads(reset) {
    if (S.loadingList) return Promise.resolve();
    S.loadingList = true;
    ui.busy(moreBtn, true);
    clear(listStatus);
    if (reset) { clear(listBox); S.threads = []; listStatus.appendChild(loadingNode()); moreBox.hidden = true; }
    var offset = reset ? 0 : S.threads.length;
    return IAML.api.get("/discuss/threads", { limit: PAGE, offset: offset }).then(function (res) {
      clear(listStatus);
      var seen = {};
      S.threads.forEach(function (th) { seen[th.id] = true; });
      (res.items || []).forEach(function (th) {
        if (seen[th.id]) return;
        S.threads.push(th);
        listBox.appendChild(threadCard(th));
      });
      S.total = res.total || 0;
      S.listLoaded = true;
      updateMore();
      if (!S.threads.length) {
        listStatus.appendChild(emptyNode(t("No questions yet."), t("Be the first to ask one — use the button above.")));
        moreBox.hidden = true;
      }
    }, function (err) {
      clear(listStatus);
      listStatus.appendChild(errorNode(err, function () { loadThreads(reset); }));
    }).then(function () { S.loadingList = false; ui.busy(moreBtn, false); });
  }

  function showList(initial) {
    threadView.hidden = true;
    listView.hidden = false;
    document.title = t("Discuss — IAML");
    var back = S.lastThreadId;
    function after() {
      if (initial) return;
      window.scrollTo(0, S.listScroll || 0);
      var link = back && listBox.querySelector('a[href="#thread-' + back + '"]');
      if (link) ui.focus(link); else ui.focus(askBtn);
    }
    if (!S.listLoaded) loadThreads(true).then(after); else after();
  }

  /* ═══ Thread view ═══ */
  function backLink() {
    return el("a", { href: "discuss.html", "class": "discuss__back", on: { click: function (e) { e.preventDefault(); goList(false); } } }, t("← All questions"));
  }

  function goList(refresh) {
    if (refresh) S.listLoaded = false;
    try { window.history.pushState(null, "", window.location.pathname + window.location.search); }
    catch (e) { window.location.hash = ""; return; }
    route(false);
  }

  function showThread(id, initial) {
    listView.hidden = true;
    threadView.hidden = false;
    S.lastThreadId = id;
    S.thread = null; S.comments = [];
    var token = ++S.req;
    clear(threadView);
    threadView.appendChild(loadingNode());
    threadView.setAttribute("aria-busy", "true");
    if (!initial) scrollToApp();
    IAML.api.get("/discuss/threads/" + id).then(function (res) {
      if (token !== S.req) return;
      S.thread = res.thread;
      S.comments = res.comments || [];
      document.title = t("{title} — Discuss — IAML", { title: S.thread.title });
      renderThread();
      if (!initial) ui.focus(document.getElementById("dsTitle"));
    }, function (err) {
      if (token !== S.req) return;
      clear(threadView);
      threadView.appendChild(backLink());
      threadView.appendChild(err && err.status === 404
        ? emptyNode(t("This question doesn’t exist or has been removed."), t("It may have been deleted by its author or by a moderator."))
        : errorNode(err, function () { showThread(id, true); }));
    }).then(function () { if (token === S.req) threadView.removeAttribute("aria-busy"); });
  }

  function reloadThread() {
    var id = S.thread ? S.thread.id : 0;
    if (!id) return Promise.resolve();
    return IAML.api.get("/discuss/threads/" + id).then(function (res) {
      if (!S.thread || S.thread.id !== id) return;
      S.thread = res.thread;
      S.comments = res.comments || [];
      renderThread();
    });
  }

  function renderThread() {
    var th = S.thread;
    if (!th) return;
    clear(threadView);

    var actions = el("div", { "class": "dthread__actions" });
    if (S.user) actions.appendChild(actionBtn(t("Report"), function () { reportDialog("thread", th.id, t("Report this question")); }));
    if (isOwn(th.author) || isAdmin()) actions.appendChild(actionBtn(t("Delete"), deleteThread));

    var post = el("article", { "class": "dthread" },
      el("div", { "class": "thread__author" },
        ui.avatar(th.author, "sm"), el("span", { "class": "thread__name" }, authorName(th.author)), roleBadge(th.author),
        el("time", { "class": "thread__when", datetime: th.created_at }, fmt.dateTime(th.created_at))),
      el("h2", { "class": "dthread__title", id: "dsTitle", tabindex: "-1" }, th.title),
      el("div", { "class": "dthread__body" }, IAML.paragraphs(th.body)),
      actions.firstChild ? actions : null);

    repliesHeading = el("h3", { id: "dsRepliesH" }, repliesLabel(th.reply_count));
    var compose = S.user
      ? buildReplyForm({
          label: t("Your reply"), placeholder: t("Write a reply…"), submit: t("Post reply"),
          onSubmit: function (text) { return postComment(text, null); }
        })
      : el("div", { "class": "gate gate--inline" },
          el("p", null, t("Log in or create an account to join the discussion.")),
          el("div", { "class": "gate__btns" },
            el("button", { "class": "btn btn--p btn--sm", type: "button", "data-auth": "login" }, t("Log in")),
            el("button", { "class": "btn btn--o btn--sm", type: "button", "data-auth": "register" }, t("Sign up"))));
    commentsBox = el("div", { "class": "comments", id: "dsComments" });

    threadView.appendChild(backLink());
    threadView.appendChild(post);
    threadView.appendChild(el("section", { "class": "dthread__replies", "aria-labelledby": "dsRepliesH" }, repliesHeading, compose, commentsBox));
    renderComments();
  }

  /* ── comments ── */
  function buildTree(flat) {
    var byId = {}, roots = [];
    flat.forEach(function (c) { c.children = []; byId[c.id] = c; });
    flat.forEach(function (c) {
      var p = c.parent_id ? byId[c.parent_id] : null;
      (p ? p.children : roots).push(c);
    });
    return roots;
  }

  function renderComments(focusId) {
    clear(commentsBox);
    var roots = buildTree(S.comments);
    if (!roots.length) commentsBox.appendChild(el("p", { "class": "discuss__none" }, t("No replies yet. Be the first to answer.")));
    roots.forEach(function (c) { commentsBox.appendChild(commentNode(c)); });
    if (repliesHeading && S.thread) repliesHeading.textContent = repliesLabel(S.thread.reply_count);
    if (focusId) {
      var n = document.getElementById("comment-" + focusId);
      if (n) { ui.focus(n); if (n.scrollIntoView) n.scrollIntoView({ block: "nearest" }); }
    }
  }

  function commentNode(c) {
    var gone = c.status !== "visible";
    var node = el("div", { "class": "comment comment--live" + (gone ? " comment--gone" : ""), id: "comment-" + c.id, tabindex: "-1", "data-depth": c.depth });
    var when = el("time", { "class": "comment__when", datetime: c.created_at }, fmt.dateTime(c.created_at));
    if (gone) {
      node.appendChild(el("div", { "class": "comment__head" }, ui.avatar({ id: null }, "xs"), when));
      node.appendChild(el("p", { "class": "comment__text comment__text--gone" }, c.status === "removed" ? t("[removed by a moderator]") : t("[deleted]")));
    } else {
      node.appendChild(el("div", { "class": "comment__head" },
        ui.avatar(c.author, "xs"), el("span", { "class": "comment__name" }, authorName(c.author)), roleBadge(c.author), when));
      node.appendChild(el("div", { "class": "comment__text" }, IAML.paragraphs(c.body)));
      var slot = el("div", { "class": "comment__reply", hidden: "" });
      var actions = el("div", { "class": "comment__actions" });
      if (c.depth < MAX_DEPTH) {
        var replyBtn = actionBtn(t("Reply"), function () { openReply(c, slot, replyBtn); });
        replyBtn.setAttribute("aria-label", t("Reply to {name}", { name: authorName(c.author) }));
        actions.appendChild(replyBtn);
      }
      if (S.user) actions.appendChild(actionBtn(t("Report"), function () { reportDialog("comment", c.id, t("Report this reply")); }));
      if (isOwn(c.author) || isAdmin()) actions.appendChild(actionBtn(t("Delete"), function () { deleteComment(c); }));
      if (actions.firstChild) node.appendChild(actions);
      node.appendChild(slot);
    }
    if (c.children && c.children.length) {
      node.appendChild(el("div", { "class": "comment__replies" }, c.children.map(commentNode)));
    }
    return node;
  }

  /* ── reply forms ── */
  function buildReplyForm(opts) {
    var ta = el("textarea", { name: "body", rows: opts.rows || "3", maxlength: "3000", placeholder: opts.placeholder || t("Write a reply…"), "aria-label": opts.label || t("Your reply") });
    var send = el("button", { "class": "btn btn--p btn--sm", type: "submit" }, opts.submit || t("Reply"));
    var cancel = opts.onCancel ? el("button", { "class": "linkbtn", type: "button", on: { click: opts.onCancel } }, t("Cancel")) : null;
    var msg = el("p", { "class": "cform__msg", "aria-live": "polite" });
    var form = el("form", { "class": "reply-form", novalidate: "" }, ta, el("div", { "class": "reply-form__row" }, send, cancel), msg);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      ui.clearErrors(form);
      ui.setStatus(msg, "");
      var text = ta.value.trim();
      if (!text) { ui.fieldError(form, ta, t("Please write something first.")); ui.focus(ta); return; }
      ui.busy(send, true);
      opts.onSubmit(text).then(function () { ta.value = ""; }, function (err) { handleError(form, err, msg); })
        .then(function () { ui.busy(send, false); });
    });
    return form;
  }

  function closeReplyForms() {
    IAML.qsa(commentsBox, ".comment__reply").forEach(function (s) { clear(s); s.hidden = true; });
  }

  function openReply(c, slot, btn) {
    if (!S.user) { IAML.openAuth("login"); return; }
    closeReplyForms();
    var form = buildReplyForm({
      label: t("Reply to {name}", { name: authorName(c.author) }), placeholder: t("Write a reply…"), submit: t("Reply"),
      onCancel: function () { clear(slot); slot.hidden = true; ui.focus(btn); },
      onSubmit: function (text) { return postComment(text, c.id); }
    });
    slot.hidden = false;
    slot.appendChild(form);
    ui.focus(form.elements.body);
  }

  function postComment(text, parentId) {
    var thread = S.thread;
    var body = { body: text };
    if (parentId) body.parent_id = parentId;
    return IAML.api.post("/discuss/threads/" + thread.id + "/comments", body).then(function (res) {
      if (S.thread !== thread) return;
      S.comments.push(res.comment);
      thread.reply_count = (thread.reply_count || 0) + 1;
      renderComments(res.comment.id);
      IAML.toast(t("Reply posted."), "ok");
    });
  }

  /* ── delete / report ── */
  function deleteComment(c) {
    var own = isOwn(c.author);
    IAML.dialog.confirm({
      title: t("Delete this reply?"),
      intro: own ? t("It will be replaced by “[deleted]”. Replies to it stay.") : t("It will be replaced by “[removed by a moderator]”. Replies to it stay."),
      submitLabel: t("Delete"), danger: true,
      onSubmit: function () { return IAML.api.del("/discuss/comments/" + c.id); }
    }).then(function (yes) {
      if (!yes) return;
      IAML.toast(own ? t("Reply deleted.") : t("Reply removed."), "ok");
      return reloadThread();
    }).then(null, function (err) { IAML.toast(IAML.errorText(err), "error"); });
  }

  function deleteThread() {
    var th = S.thread;
    IAML.dialog.confirm({
      title: t("Delete this question?"),
      intro: t("The question and its replies will no longer be shown. This can’t be undone."),
      submitLabel: t("Delete"), danger: true,
      onSubmit: function () { return IAML.api.del("/discuss/threads/" + th.id); }
    }).then(function (yes) {
      if (!yes) return;
      IAML.toast(isOwn(th.author) ? t("Question deleted.") : t("Question removed."), "ok");
      goList(true);
    }).then(null, function (err) { IAML.toast(IAML.errorText(err), "error"); });
  }

  /* title: "Report this question" / "Report this reply" (already translated) */
  function reportDialog(type, id, title) {
    IAML.dialog.form({
      title: title,
      intro: t("Tell the moderators what is wrong. An administrator will review it."),
      fields: [{ name: "reason", type: "textarea", label: t("Reason (optional)"), maxlength: 500, rows: 4 }],
      submitLabel: t("Send report"),
      onSubmit: function (v) {
        var body = { target_type: type, target_id: id };
        if (v.reason) body.reason = v.reason;
        return IAML.api.post("/discuss/reports", body);
      }
    }).then(function (done) {
      if (done) IAML.toast(t("Thanks — a moderator will review it."), "ok");
    });
  }

  /* ═══ Routing: discuss.html (list) · discuss.html#thread-<id> (thread) ═══ */
  function route(initial) {
    var m = /^#thread-(\d{1,9})$/.exec(window.location.hash);
    var id = m ? parseInt(m[1], 10) : 0;
    var key = id ? "t" + id : "l";
    if (key === S.view) return;
    if (S.view === "l") S.listScroll = window.pageYOffset;
    S.view = key;
    if (id) showThread(id, initial); else showList(initial);
  }

  function onUserChange(u) {
    S.user = u;
    if (!app) return;
    if (S.view.charAt(0) === "t" && S.thread) renderThread();
    if (u && S.wantAsk) {
      S.wantAsk = false;
      if (S.view === "l") openAsk();
    }
  }

  function init() {
    if (!staticBox) return;
    staticBox.classList.add("live-pending");   // hide the placeholder threads until we know if a backend answers
    IAML.live().then(function (ok) {
      if (!ok) { staticBox.classList.remove("live-pending"); return null; }   // static mode: placeholder threads stay
      return IAML.whenUser().then(function (u) {
        S.user = u;
        buildShell();
        staticBox.hidden = true;
        IAML.api.session.onChange(onUserChange);
        window.addEventListener("hashchange", function () { route(false); });
        window.addEventListener("popstate", function () { route(false); });
        route(true);
      });
    });
  }

  IAML.ready(init);
})();
