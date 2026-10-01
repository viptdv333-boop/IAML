/* ═══════════════════════════════════════════════════
   IAML admin — operations sections: Dashboard, Inbox, Discuss moderation,
   Users, Mongolist, Mail queue, Audit log.   (docs/API.md §5)
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = window.IAML;
  var A = IAML.admin;
  var h = A.h;
  var api = IAML.api;

  function badgesChanged() { if (A.refreshBadges) A.refreshBadges(); }

  function personCell(p) {
    if (!p) return h("span", { class: "muted", text: "Deleted account" });
    return h("div", { class: "cell-title" }, [h("strong", { text: p.name || p.email || "—" }), p.email ? h("div", { class: "cell-sub", text: p.email }) : null]);
  }

  var CONTENT_TONE = { visible: "ok", removed: "danger", deleted: "neutral" };
  function contentBadge(status) { return A.badge(status === "deleted" ? "Deleted by author" : status.charAt(0).toUpperCase() + status.slice(1), CONTENT_TONE[status] || "neutral"); }

  /* meta (jsonb) of an audit row → compact chips */
  function metaNodes(meta) {
    if (!meta || typeof meta !== "object") return null;
    var out = [];
    if (meta.label) out.push(h("strong", { class: "meta-label", text: A.fmt.clip(meta.label, 80) }));
    Object.keys(meta).forEach(function (k) {
      if (k === "label") return;
      var v = meta[k];
      if (v === null || v === undefined || v === "") return;
      var s = Array.isArray(v) ? v.join(", ") : (typeof v === "object" ? JSON.stringify(v) : String(v));
      out.push(h("span", { class: "meta-chip" }, [h("span", { class: "meta-chip__k", text: k }), " ", A.fmt.clip(s, 90)]));
    });
    return out;
  }

  /* ═════════════════════════ Dashboard ═════════════════════════ */
  function attnCard(label, n, href, tone, cta) {
    var on = n > 0;
    return h("a", { class: "attn attn--" + (on ? tone : "clear"), href: href }, [
      h("div", { class: "attn__n", text: A.fmt.n(n) }),
      h("div", { class: "attn__text" }, [h("div", { class: "attn__label", text: label }), h("div", { class: "attn__cta", text: on ? cta : "All clear" })]),
      A.icon("right", 20)
    ]);
  }

  function statCard(label, value, sub, href) {
    var inner = [h("div", { class: "stat__label", text: label }), h("div", { class: "stat__value", text: A.fmt.n(value) }), sub ? h("div", { class: "stat__sub", text: sub }) : null];
    return href ? h("a", { class: "stat stat--link", href: href }, inner) : h("div", { class: "stat" }, inner);
  }

  A.register("dashboard", {
    label: "Dashboard", icon: "dashboard", group: "Overview", order: 0, title: "Dashboard",
    mount: function (root) {
      var dead = false;
      root.appendChild(A.pageHead("Dashboard", "An overview of the site and what needs your attention."));
      var holder = h("div", { class: "dash" });
      root.appendChild(holder);
      holder.appendChild(A.loading());

      function paint(s) {
        A.clear(holder);
        holder.appendChild(h("h2", { class: "section-h", text: "Needs attention" }));
        holder.appendChild(h("div", { class: "attn-grid" }, [
          attnCard("Unread messages", s.messages_unread | 0, "#/inbox?unread=1", "blue", "Open the inbox"),
          attnCard("Open Discuss reports", s.reports_open | 0, "#/discuss", "red", "Review reports"),
          attnCard("Failed e-mails", s.mail_failed | 0, "#/mail?status=failed", "red", "See the mail queue")
        ]));
        holder.appendChild(h("h2", { class: "section-h", text: "At a glance" }));
        holder.appendChild(h("div", { class: "stat-grid" }, [
          statCard("Members", s.users | 0, A.fmt.n(s.users_verified | 0) + " verified", "#/users"),
          statCard("Administrators", s.admins | 0, null, "#/users"),
          statCard("Mongolist subscribers", s.subscribers | 0, null, "#/mongolist"),
          statCard("News items", s.news | 0, null, "#/news"),
          statCard("Events", s.events | 0, null, "#/events"),
          statCard("Publications", s.publications | 0, null, "#/publications"),
          statCard("Discuss threads", s.threads | 0, "visible", "#/discuss/threads"),
          statCard("Discuss comments", s.comments | 0, "visible", "#/discuss/threads"),
          statCard("E-mails queued", s.mail_queued | 0, "waiting to be sent", "#/mail?status=queued")
        ]));
        var recent = h("section", { class: "panel" });
        recent.appendChild(h("div", { class: "panel__head" }, h("div", { class: "panel__titlebar panel__titlebar--row" }, [
          h("h2", { class: "panel__title", text: "Recent activity" }),
          h("a", { class: "link-more", href: "#/audit" }, ["Audit log ", A.icon("right", 14)])
        ])));
        var rb = h("div", { class: "panel__body" }, A.loading());
        recent.appendChild(rb);
        holder.appendChild(recent);
        api.get("/admin/audit", { limit: 8 }).then(function (res) {
          if (dead) return;
          A.clear(rb);
          var items = (res && res.items) || [];
          if (!items.length) { rb.appendChild(A.empty("No activity yet")); return; }
          var ul = h("ul", { class: "activity" });
          items.forEach(function (it) {
            ul.appendChild(h("li", { class: "activity__item" }, [
              h("span", { class: "activity__time", text: A.fmt.dt(it.created_at) }),
              h("span", { class: "activity__who", text: it.actor ? it.actor.name : "System" }),
              h("code", { class: "code-chip", text: it.action }),
              h("span", { class: "activity__what" }, [it.entity + (it.entity_id ? " #" + it.entity_id : ""), " "].concat(metaNodes(it.meta) || []))
            ]));
          });
          rb.appendChild(ul);
        }, function () { if (!dead) { A.clear(rb); rb.appendChild(h("p", { class: "muted pad", text: "Recent activity could not be loaded." })); } });
      }

      function load() {
        api.get("/admin/stats").then(function (s) {
          if (dead) return;
          paint(s || {});
          if (A.updateBadges) A.updateBadges(s || {});
        }, function (err) {
          if (dead) return;
          A.clear(holder);
          holder.appendChild(A.errorState(err, load));
          if (err && err.status === 401) A.fail(err);
        });
      }
      load();
      return { destroy: function () { dead = true; } };
    }
  });

  /* ═════════════════════════ Inbox ═════════════════════════ */
  A.register("inbox", {
    label: "Inbox", icon: "inbox", group: "Community", order: 100, badge: "messages_unread", title: "Inbox",
    mount: function (root, route) {
      var st = { unread: route.query.unread === "1", offset: 0, limit: 25, items: [], total: 0, unreadCount: 0, loading: true, first: true, error: null, seq: 0 };
      var dead = false;
      root.appendChild(A.pageHead("Inbox", "Messages sent through the contact forms. “Reply” opens your own mail program."));
      var panel = h("section", { class: "panel" });
      var head = h("div", { class: "panel__head" });
      var body = h("div", { class: "panel__body" });
      var foot = h("div", { class: "panel__foot" });
      panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);
      root.appendChild(panel);

      function renderHead() {
        A.clear(head);
        head.appendChild(h("div", { class: "toolbar" }, [
          A.segmented([{ value: "all", label: "All" }, { value: "unread", label: "Unread", count: st.unreadCount }], st.unread ? "unread" : "all", function (v) {
            st.unread = v === "unread"; st.offset = 0; load();
          }, "Show messages"),
          h("div", { class: "toolbar__spacer" }),
          A.iconBtn("refresh", "Refresh the inbox", function () { load(); })
        ]));
      }

      function load() {
        var my = ++st.seq;
        st.loading = true;
        if (st.first) render(); else panel.classList.add("is-loading");
        return api.get("/admin/messages", { limit: st.limit, offset: st.offset, unread: st.unread ? 1 : null }).then(function (res) {
          if (dead || my !== st.seq) return;
          st.items = (res && res.items) || []; st.total = (res && res.total) | 0; st.unreadCount = (res && res.unread) | 0;
          st.loading = false; st.first = false; st.error = null;
          if (!st.items.length && st.total > 0 && st.offset > 0) { st.offset = Math.max(0, Math.floor((st.total - 1) / st.limit) * st.limit); return load(); }
          render();
          badgesChanged();
        }, function (err) {
          if (dead || my !== st.seq) return;
          st.loading = false; st.first = false; st.error = err; st.items = [];
          render();
          if (err && err.status === 401) A.fail(err);
        });
      }

      function setRead(item, isRead) {
        return api.patch("/admin/messages/" + item.id, { is_read: isRead }).then(function (res) {
          item.is_read = !!(res && res.item ? res.item.is_read : isRead);
          return load();
        }, function (err) { A.fail(err); });
      }

      function removeMessage(item, after) {
        A.confirm({
          title: "Delete message?",
          message: "The message from " + item.name + " (" + item.email + ") will be permanently deleted.",
          detail: "This cannot be undone. Consider marking it as read instead.",
          confirmLabel: "Delete", danger: true
        }).then(function (ok) {
          if (!ok) return;
          api.del("/admin/messages/" + item.id).then(function () {
            A.toast("Message deleted.");
            if (after) after();
            load();
          }, function (err) { A.fail(err); });
        });
      }

      function replyHref(item) {
        var q = String(item.message || "").replace(/\r\n?/g, "\n");
        if (q.length > 800) q = q.slice(0, 800) + "…";
        var quoted = q.split("\n").map(function (l) { return "> " + l; }).join("\n");
        return A.mailto(item.email, "Re: " + (item.subject || "your message to IAML"), "\n\n\nOn " + A.fmt.dt(item.created_at) + " (UTC+3) " + item.name + " wrote:\n" + quoted);
      }

      function open(item) {
        var toggle = A.btn(item.is_read ? "Mark as unread" : "Mark as read", { kind: "secondary", icon: item.is_read ? "mail" : "check", onClick: function () {
          setRead(item, !item.is_read).then(function () {
            A.setBusy(toggle, false);
            var lab = toggle.querySelector(".btn__label");
            if (lab) lab.textContent = item.is_read ? "Mark as unread" : "Mark as read";
          });
        } });
        var del = A.btn("Delete", { kind: "danger-o", icon: "trash", onClick: function () { removeMessage(item, function () { m.close(); }); } });
        var reply = A.btn("Reply by e-mail", { kind: "primary", icon: "reply", href: replyHref(item) });
        var m = A.modal({
          title: item.subject || "(no subject)",
          size: "md",
          body: [
            A.kv([
              ["From", item.name + " <" + item.email + ">"],
              ["Received", A.fmt.dt(item.created_at) + " (UTC+3)"],
              ["Via", item.source === "participants" ? "Participants page form" : "Contacts page form"]
            ]),
            h("div", { class: "msg-body", text: item.message })
          ],
          footer: [del, h("span", { class: "modal__spacer" }), toggle, reply],
          dismissOnBackdrop: true,
          focus: reply
        });
      }

      function render() {
        panel.classList.remove("is-loading");
        renderHead();
        A.clear(body); A.clear(foot);
        if (st.loading && st.first) { body.appendChild(A.loading()); return; }
        if (st.error) { body.appendChild(A.errorState(st.error, load)); return; }
        if (!st.items.length) {
          body.appendChild(st.unread
            ? A.empty("No unread messages", "You are all caught up.", A.btn("Show all messages", { onClick: function () { st.unread = false; st.offset = 0; load(); } }))
            : A.empty("The inbox is empty", "Messages sent through the contact forms will appear here."));
          return;
        }
        body.appendChild(A.table([
          { label: "From", render: function (it) {
            return h("div", { class: "msg-from" }, [h("span", { class: "dot" + (it.is_read ? " dot--read" : ""), title: it.is_read ? "Read" : "Unread" }), personCell({ name: it.name, email: it.email })]);
          } },
          { label: "Message", render: function (it) {
            return h("button", { type: "button", class: "linklike msg-open", onclick: function () { open(it); } }, [
              h("span", { class: "msg-open__subject", text: it.subject || "(no subject)" }),
              h("span", { class: "msg-open__snippet", text: A.fmt.clip(it.message, 120) })
            ]);
          } },
          { label: "Via", render: function (it) { return A.badge(it.source === "participants" ? "Participants" : "Contacts", "neutral"); } },
          { label: "Received (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.dt(it.created_at); } },
          { label: "Actions", srOnly: true, cls: "col-actions", render: function (it) {
            return h("div", { class: "row-actions" }, [
              A.iconBtn("reply", "Reply to " + it.name + " by e-mail", null, { href: replyHref(it) }),
              A.iconBtn(it.is_read ? "mail" : "check", (it.is_read ? "Mark as unread: " : "Mark as read: ") + (it.subject || it.name), function () { setRead(it, !it.is_read); }),
              A.iconBtn("trash", "Delete message from " + it.name, function () { removeMessage(it); }, { kind: "danger-o" })
            ]);
          } }
        ], st.items, { label: "Messages", rowClass: function (it) { return it.is_read ? null : "is-unread"; } }));
        foot.appendChild(A.pager({ offset: st.offset, limit: st.limit, total: st.total, onChange: function (o) { st.offset = o; load(); } }));
      }

      load();
      return { destroy: function () { dead = true; st.seq++; } };
    }
  });

  /* ═════════════════════════ Discuss moderation ═════════════════════════ */
  function discussTabs(active) {
    return A.tabs([
      { label: "Reports", href: "#/discuss", active: active === "reports" },
      { label: "Threads", href: "#/discuss/threads", active: active === "threads" }
    ], "Discuss moderation");
  }

  function setContentStatus(kind, id, status, reason) {
    var body = { status: status };
    if (reason) body.reason = reason;
    return api.post("/admin/discuss/" + kind + "s/" + id + "/status", body);
  }

  /* ask for an optional reason, then remove */
  function removeContent(kind, id, what) {
    return A.ask({
      title: "Remove " + what + "?",
      message: "It will be hidden from the Discuss page for everyone except admins. You can restore it later.",
      label: "Reason (optional, visible to admins only)",
      confirmLabel: "Remove " + what, danger: true
    }).then(function (reason) {
      if (reason === null) return false;
      return setContentStatus(kind, id, "removed", reason).then(function () { A.toast(what.charAt(0).toUpperCase() + what.slice(1) + " removed."); return true; }, function (err) { A.fail(err); return false; });
    });
  }

  function restoreContent(kind, id, what) {
    return setContentStatus(kind, id, "visible").then(function () { A.toast(what.charAt(0).toUpperCase() + what.slice(1) + " restored."); return true; }, function (err) { A.fail(err); return false; });
  }

  var REPORT_TONE = { open: "gold", resolved: "ok", dismissed: "neutral" };

  function reportsView(root, route) {
    var st = { status: ["open", "resolved", "dismissed", "all"].indexOf(route.query.status) >= 0 ? route.query.status : "open", offset: 0, limit: 20, items: [], total: 0, first: true, loading: true, error: null, seq: 0 };
    var dead = false;
    var panel = h("section", { class: "panel" });
    var head = h("div", { class: "panel__head" });
    var body = h("div", { class: "panel__body panel__body--pad" });
    var foot = h("div", { class: "panel__foot" });
    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);
    root.appendChild(panel);

    function renderHead() {
      A.clear(head);
      head.appendChild(h("div", { class: "toolbar" }, [
        A.segmented([{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "dismissed", label: "Dismissed" }, { value: "all", label: "All" }], st.status, function (v) {
          st.status = v; st.offset = 0; load();
        }, "Report status"),
        h("div", { class: "toolbar__spacer" }),
        A.iconBtn("refresh", "Refresh reports", function () { load(); })
      ]));
    }

    function load() {
      var my = ++st.seq;
      st.loading = true;
      if (st.first) render(); else panel.classList.add("is-loading");
      return api.get("/admin/reports", { status: st.status, limit: st.limit, offset: st.offset }).then(function (res) {
        if (dead || my !== st.seq) return;
        st.items = (res && res.items) || []; st.total = (res && res.total) | 0; st.loading = false; st.first = false; st.error = null;
        if (!st.items.length && st.total > 0 && st.offset > 0) { st.offset = Math.max(0, Math.floor((st.total - 1) / st.limit) * st.limit); return load(); }
        render();
      }, function (err) {
        if (dead || my !== st.seq) return;
        st.loading = false; st.first = false; st.error = err; st.items = []; render();
        if (err && err.status === 401) A.fail(err);
      });
    }

    function resolve(r, action) {
      var remove = action === "remove";
      var what = r.target_type === "thread" ? "thread" : "comment";
      A.confirm({
        title: remove ? "Remove reported " + what + "?" : "Dismiss this report?",
        message: remove
          ? "The " + what + " will be hidden from the Discuss page and every open report about it is marked as resolved."
          : "The report is closed and the " + what + " stays visible.",
        confirmLabel: remove ? "Remove " + what : "Dismiss report", danger: remove
      }).then(function (ok) {
        if (!ok) return;
        api.post("/admin/reports/" + r.id + "/resolve", { action: action }).then(function () {
          A.toast(remove ? "Content removed; reports resolved." : "Report dismissed.");
          badgesChanged();
          load();
        }, function (err) { A.fail(err); });
      });
    }

    function card(r) {
      var t = r.target;
      var what = r.target_type === "thread" ? "Thread" : "Comment";
      var el = h("article", { class: "report report--" + r.status });
      el.appendChild(h("header", { class: "report__head" }, [
        A.badge(what, "info"), A.badge(r.status.charAt(0).toUpperCase() + r.status.slice(1), REPORT_TONE[r.status] || "neutral"),
        h("span", { class: "report__meta", text: "Reported " + A.fmt.dt(r.created_at) + " (UTC+3) by " + (r.reporter ? (r.reporter.name || "member") + (r.reporter.email ? " <" + r.reporter.email + ">" : "") : "a deleted account") })
      ]));
      el.appendChild(r.reason ? h("blockquote", { class: "report__reason" }, r.reason) : h("p", { class: "report__reason report__reason--none", text: "No reason given." }));
      if (!t) {
        el.appendChild(h("p", { class: "report__gone", text: "The reported content no longer exists." }));
      } else {
        el.appendChild(h("div", { class: "report__target" }, [
          h("div", { class: "report__target-head" }, [
            h("span", { class: "report__in" }, [what === "Comment" ? "Comment in thread " : "Thread ", h("strong", { text: "“" + (t.title || "—") + "”" })]),
            h("span", { class: "report__by", text: "by " + (t.author ? (t.author.name || "member") + (t.author.email ? " <" + t.author.email + ">" : "") : "a deleted account") }),
            contentBadge(t.status || "visible")
          ]),
          h("div", { class: "report__body", text: t.body ? A.fmt.clip(t.body, 700) : "(no text stored)" })
        ]));
      }
      var acts = h("div", { class: "report__actions" });
      if (t && t.thread_id) acts.appendChild(A.btn("View thread", { size: "sm", icon: "eye", href: "#/discuss/thread/" + encodeURIComponent(t.thread_id) }));
      if (r.status === "open") {
        acts.appendChild(h("span", { class: "modal__spacer" }));
        acts.appendChild(A.btn("Dismiss", { size: "sm", kind: "secondary", icon: "x", onClick: function () { resolve(r, "dismiss"); } }));
        acts.appendChild(A.btn("Remove " + what.toLowerCase(), { size: "sm", kind: "danger", icon: "trash", onClick: function () { resolve(r, "remove"); } }));
      } else if (r.resolved_at) {
        acts.appendChild(h("span", { class: "modal__spacer" }));
        acts.appendChild(h("span", { class: "muted", text: "Closed " + A.fmt.dt(r.resolved_at) + " (UTC+3)" }));
      }
      el.appendChild(acts);
      return el;
    }

    function render() {
      panel.classList.remove("is-loading");
      renderHead();
      A.clear(body); A.clear(foot);
      if (st.loading && st.first) { body.appendChild(A.loading()); return; }
      if (st.error) { body.appendChild(A.errorState(st.error, load)); return; }
      if (!st.items.length) {
        body.appendChild(A.empty(st.status === "open" ? "No open reports" : "No reports here", st.status === "open" ? "Nothing needs moderating right now." : "Try a different status filter."));
        return;
      }
      var list = h("div", { class: "report-list" });
      st.items.forEach(function (r) { list.appendChild(card(r)); });
      body.appendChild(list);
      foot.appendChild(A.pager({ offset: st.offset, limit: st.limit, total: st.total, onChange: function (o) { st.offset = o; load(); } }));
    }

    load();
    return { destroy: function () { dead = true; st.seq++; } };
  }

  function threadsView(root) {
    var view = A.crud({
      endpoint: "/admin/discuss/threads", singular: "thread", plural: "threads",
      noCreate: true, noEdit: true, noDelete: true, pageSize: 25,
      searchPlaceholder: "Search title, text or author…",
      filters: [{ name: "status", label: "Status", all: "All statuses", options: [{ value: "visible", label: "Visible" }, { value: "removed", label: "Removed" }, { value: "deleted", label: "Deleted by author" }] }],
      label: function (it) { return it.title; },
      columns: [
        { label: "Thread", render: function (it) {
          return h("div", { class: "cell-title" }, [h("a", { class: "cell-link", href: "#/discuss/thread/" + it.id }, h("strong", { text: it.title })), h("div", { class: "cell-sub", text: A.fmt.clip(it.body, 110) })]);
        } },
        { label: "Author", render: function (it) { return personCell(it.author); } },
        { label: "Status", render: function (it) { return [contentBadge(it.status), it.status_reason ? h("div", { class: "cell-sub", text: A.fmt.clip(it.status_reason, 60), title: it.status_reason }) : null]; } },
        { label: "Replies", cls: "num", render: function (it) { return String(it.reply_count | 0); } },
        { label: "Open reports", cls: "num", render: function (it) { return it.reports_open ? A.badge(String(it.reports_open), "danger") : "—"; } },
        { label: "Created (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.dt(it.created_at); } }
      ],
      rowActions: function (it, v) {
        var out = [A.iconBtn("eye", "View thread and comments: " + it.title, null, { href: "#/discuss/thread/" + it.id })];
        if (it.status === "visible") {
          out.push(A.btn("Remove", { size: "sm", kind: "danger-o", icon: "trash", onClick: function () { removeContent("thread", it.id, "thread").then(function (ok) { if (ok) { badgesChanged(); v.reload(); } }); } }));
        } else if (it.status === "removed") {
          out.push(A.btn("Restore", { size: "sm", icon: "restore", onClick: function () { restoreContent("thread", it.id, "thread").then(function (ok) { if (ok) { badgesChanged(); v.reload(); } }); } }));
        }
        return out;
      }
    });
    root.appendChild(view.el);
    view.load();
    return { destroy: view.destroy };
  }

  function threadDetail(root, id) {
    var dead = false;
    var holder = h("div");
    root.appendChild(holder);

    function load() {
      A.clear(holder);
      holder.appendChild(A.loading());
      api.get("/admin/discuss/threads/" + encodeURIComponent(id)).then(function (res) {
        if (dead) return;
        paint(res || {});
      }, function (err) {
        if (dead) return;
        A.clear(holder);
        holder.appendChild(err && err.status === 404
          ? A.empty("Thread not found", "It may have been deleted.", A.btn("Back to threads", { href: "#/discuss/threads" }))
          : A.errorState(err, load));
        if (err && err.status === 401) A.fail(err);
      });
    }

    function authorLine(a) {
      if (!a || !a.id) return [h("strong", { text: "Deleted user" })];
      return [A.avatar(a, "sm"), h("strong", { text: a.name || "member" }), a.email ? h("span", { class: "muted", text: "<" + a.email + ">" }) : null, a.role === "admin" ? A.badge("Admin", "info") : null];
    }

    function commentNode(c, children, byParent) {
      var removed = c.status === "removed", deleted = c.status === "deleted";
      var wrap = h("div", { class: "comment-wrap" });
      var el = h("article", { class: "comment" + (removed ? " comment--removed" : "") + (deleted ? " comment--deleted" : ""), id: "comment-" + c.id });
      var acts = h("div", { class: "comment__actions" });
      if (c.status === "visible") {
        acts.appendChild(A.btn("Remove", { size: "sm", kind: "danger-o", icon: "trash", onClick: function () { removeContent("comment", c.id, "comment").then(function (ok) { if (ok) { badgesChanged(); load(); } }); } }));
      } else if (removed) {
        acts.appendChild(A.btn("Restore", { size: "sm", icon: "restore", onClick: function () { restoreContent("comment", c.id, "comment").then(function (ok) { if (ok) { badgesChanged(); load(); } }); } }));
      }
      el.appendChild(h("header", { class: "comment__head" }, [
        h("div", { class: "comment__who" }, authorLine(c.author).concat([h("span", { class: "muted", text: "· " + A.fmt.dt(c.created_at) + " (UTC+3)" })])),
        h("div", { class: "comment__state" }, [c.status !== "visible" ? contentBadge(c.status) : null, acts])
      ]));
      el.appendChild(h("div", { class: "comment__body", text: c.body ? c.body : (deleted ? "[deleted by the author]" : "[no text stored]") }));
      if (removed && c.status_reason) el.appendChild(h("p", { class: "comment__reason", text: "Reason: " + c.status_reason }));
      wrap.appendChild(el);
      var kids = byParent[c.id] || [];
      if (kids.length) {
        var box = h("div", { class: "comment-children" });
        kids.forEach(function (k) { box.appendChild(commentNode(k, null, byParent)); });
        wrap.appendChild(box);
      }
      return wrap;
    }

    function paint(res) {
      A.clear(holder);
      var t = res.thread || {}, comments = res.comments || [];
      holder.appendChild(h("p", { class: "backlink" }, A.btn("All threads", { size: "sm", kind: "ghost", icon: "left", href: "#/discuss/threads" })));
      var card = h("section", { class: "panel thread" });
      var acts = h("div", { class: "thread__actions" });
      if (t.status === "visible") acts.appendChild(A.btn("Remove thread", { kind: "danger-o", icon: "trash", onClick: function () { removeContent("thread", t.id, "thread").then(function (ok) { if (ok) { badgesChanged(); load(); } }); } }));
      else if (t.status === "removed") acts.appendChild(A.btn("Restore thread", { icon: "restore", onClick: function () { restoreContent("thread", t.id, "thread").then(function (ok) { if (ok) { badgesChanged(); load(); } }); } }));
      card.appendChild(h("div", { class: "thread__head" }, [
        h("div", null, [
          h("h2", { class: "thread__title", text: t.title || "(untitled)" }),
          h("div", { class: "thread__meta" }, authorLine(t.author).concat([h("span", { class: "muted", text: "· " + A.fmt.dt(t.created_at) + " (UTC+3)" }), contentBadge(t.status || "visible")])),
          t.status === "removed" && t.status_reason ? h("p", { class: "comment__reason", text: "Reason: " + t.status_reason }) : null
        ]),
        acts
      ]));
      card.appendChild(h("div", { class: "thread__body", text: t.body || "" }));
      holder.appendChild(card);

      var removedCount = comments.filter(function (c) { return c.status !== "visible"; }).length;
      holder.appendChild(h("h2", { class: "section-h", text: "Comments (" + comments.length + (removedCount ? ", " + removedCount + " removed or deleted" : "") + ")" }));
      if (!comments.length) { holder.appendChild(A.empty("No comments yet")); return; }
      var byParent = {}, roots = [], ids = {};
      comments.forEach(function (c) { ids[c.id] = true; });
      comments.forEach(function (c) {
        if (c.parent_id && ids[c.parent_id]) (byParent[c.parent_id] = byParent[c.parent_id] || []).push(c);
        else roots.push(c);
      });
      var list = h("div", { class: "comment-list" });
      roots.forEach(function (c) { list.appendChild(commentNode(c, null, byParent)); });
      holder.appendChild(list);
    }

    load();
    return { destroy: function () { dead = true; } };
  }

  A.register("discuss", {
    label: "Discuss", icon: "chat", group: "Community", order: 90, badge: "reports_open", badgeTone: "danger", title: "Discuss moderation",
    mount: function (root, route) {
      var sub = route.sub || [];
      if (sub[0] === "thread" && sub[1]) {
        root.appendChild(A.pageHead("Thread", "Every comment is shown here, including removed and deleted ones."));
        root.appendChild(discussTabs("threads"));
        return threadDetail(root, sub[1]);
      }
      var threads = sub[0] === "threads";
      root.appendChild(A.pageHead("Discuss moderation", threads
        ? "All discussion threads. Open a thread to see every comment and moderate it."
        : "Reports from members. Remove the reported content or dismiss the report."));
      root.appendChild(discussTabs(threads ? "threads" : "reports"));
      return threads ? threadsView(root) : reportsView(root, route);
    }
  });

  /* ═════════════════════════ Users ═════════════════════════ */
  A.register("users", {
    label: "Users", icon: "user", group: "Community", order: 110, title: "Users",
    mount: function (root) {
      var meId = IAML.api.session.user && IAML.api.session.user.id;
      var view = null;

      function patch(it, data, okMsg) {
        return api.patch("/admin/users/" + it.id, data).then(function () { A.toast(okMsg); view.reload(); }, function (err) { A.fail(err); view.reload(); });
      }

      view = A.crud({
        endpoint: "/admin/users", singular: "user", plural: "users", noCreate: true, noEdit: true, pageSize: 25,
        searchPlaceholder: "Search name, e-mail or workplace…",
        filters: [{ name: "role", label: "Role", all: "All roles", options: [{ value: "admin", label: "Admins" }, { value: "member", label: "Members" }] }],
        label: function (it) { return A.fullName(it) || it.email; },
        columns: [
          { label: "Member", render: function (it) {
            return h("div", { class: "user-cell" }, [A.avatar({ name: A.fullName(it), avatar_url: it.avatar_url }), h("div", { class: "cell-title" }, [
              h("strong", { text: A.fullName(it) || "(no name)" }), it.id === meId ? [" ", A.badge("You", "gold")] : null, h("div", { class: "cell-sub", text: it.email })
            ])]);
          } },
          { label: "Workplace", render: function (it) { return it.workplace ? h("span", { class: "cell-clip", title: it.workplace, text: A.fmt.clip(it.workplace, 60) }) : "—"; } },
          { label: "Role", render: function (it) { return it.role === "admin" ? A.badge("Admin", "info") : A.badge("Member", "neutral"); } },
          { label: "Status", render: function (it) {
            if (it.disabled) return A.badge("Disabled", "danger");
            if (!it.email_verified) return A.badge("Unverified", "gold");
            return A.badge("Active", "ok");
          } },
          { label: "Joined (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.date(it.created_at); } },
          { label: "Last login (UTC+3)", cls: "nowrap", render: function (it) { return it.last_login_at ? A.fmt.dt(it.last_login_at) : "never"; } }
        ],
        rowActions: function (it) {
          var nm = A.fullName(it) || it.email;
          var isAdmin = it.role === "admin";
          return [
            A.btn(isAdmin ? "Remove admin" : "Make admin", { size: "sm", icon: "shield", title: (isAdmin ? "Remove administrator rights from " : "Give administrator rights to ") + nm, onClick: function () {
              A.confirm({
                title: isAdmin ? "Remove administrator rights?" : "Make this member an administrator?",
                message: isAdmin ? nm + " will no longer be able to use the admin panel." : nm + " will get full access to this admin panel, including all content, members and messages.",
                confirmLabel: isAdmin ? "Remove admin" : "Make admin", danger: isAdmin
              }).then(function (ok) { if (ok) patch(it, { role: isAdmin ? "member" : "admin" }, nm + (isAdmin ? " is no longer an administrator." : " is now an administrator.")); });
            } }),
            A.btn(it.disabled ? "Enable" : "Disable", { size: "sm", icon: it.disabled ? "check" : "ban", title: (it.disabled ? "Enable the account of " : "Disable the account of ") + nm, onClick: function () {
              if (it.disabled) { patch(it, { disabled: false }, nm + " can log in again."); return; }
              A.confirm({ title: "Disable this account?", message: nm + " will be logged out and cannot log in until the account is enabled again. Their posts stay visible.", confirmLabel: "Disable account", danger: true })
                .then(function (ok) { if (ok) patch(it, { disabled: true }, nm + " has been disabled."); });
            } })
          ];
        },
        deleteMessage: function (it) { return "Delete the account of " + (A.fullName(it) || "this user") + " (" + it.email + ")?"; },
        deleteDetail: function () { return "The account is removed for good. Their Discuss posts stay and are shown as “Deleted user”."; }
      });
      root.appendChild(A.pageHead("Users", "Registered members. Promote administrators, disable accounts or delete them."));
      root.appendChild(view.el);
      view.load();
      return { destroy: view.destroy };
    }
  });

  /* ═════════════════════════ Mongolist ═════════════════════════ */
  var TOPICS = [
    ["news", "News"], ["events", "Events"], ["publications", "Publications"], ["participants", "Participants"], ["discuss", "Discuss"]
  ];

  A.register("mongolist", {
    label: "Mongolist", icon: "send", group: "Community", order: 120, title: "Mongolist",
    mount: function (root) {
      var dead = false;
      root.appendChild(A.pageHead("Mongolist", "Members who subscribed to e-mail updates, and the digest e-mails sent to them."));

      /* subscribers */
      var panel = h("section", { class: "panel" });
      var pbody = h("div", { class: "panel__body" });
      var phead = h("div", { class: "panel__head" });
      panel.appendChild(phead); panel.appendChild(pbody);
      root.appendChild(panel);

      function paint(res) {
        A.clear(phead); A.clear(pbody);
        var summary = (res && res.summary) || {};
        phead.appendChild(h("div", { class: "panel__titlebar panel__titlebar--row" }, [
          h("div", null, [
            h("h2", { class: "panel__title", text: "Subscribers" }),
            h("p", { class: "panel__hint", text: A.fmt.n(res && res.total_users) + ((res && res.total_users) === 1 ? " member receives" : " members receive") + " at least one topic by e-mail." })
          ]),
          A.btn("Download all (CSV)", { size: "sm", icon: "download", href: api.base + "/admin/subscribers.csv", download: true, title: "All topics: email, first_name, last_name, topic, frequency" })
        ]));
        var cols = [
          { label: "Topic", render: function (r) { return h("strong", { text: r[1] }); } },
          { label: "Instant", cls: "num", render: function (r) { return A.fmt.n((summary[r[0]] || {}).instant); } },
          { label: "Daily", cls: "num", render: function (r) { return A.fmt.n((summary[r[0]] || {}).daily); } },
          { label: "Weekly", cls: "num", render: function (r) { return A.fmt.n((summary[r[0]] || {}).weekly); } },
          { label: "Total", cls: "num", render: function (r) { var s = summary[r[0]] || {}; return h("strong", { text: A.fmt.n((s.instant | 0) + (s.daily | 0) + (s.weekly | 0)) }); } },
          { label: "Export", srOnly: true, cls: "col-actions", render: function (r) {
            return A.btn("CSV", { size: "sm", icon: "download", href: api.base + "/admin/subscribers.csv?topic=" + encodeURIComponent(r[0]), download: true, title: "Download the " + r[1] + " subscribers as CSV" });
          } }
        ];
        pbody.appendChild(A.table(cols, TOPICS.map(function (t) { return { id: t[0], 0: t[0], 1: t[1] }; }), { label: "Subscribers by topic and frequency" }));
      }
      function loadSubs() {
        A.clear(pbody); pbody.appendChild(A.loading());
        api.get("/admin/subscribers").then(function (res) { if (!dead) paint(res); }, function (err) {
          if (dead) return;
          A.clear(pbody); pbody.appendChild(A.errorState(err, loadSubs));
          if (err && err.status === 401) A.fail(err);
        });
      }
      loadSubs();

      /* digest */
      var dpanel = h("section", { class: "panel" });
      var dbody = h("div", { class: "panel__body panel__body--pad" });
      dpanel.appendChild(h("div", { class: "panel__head" }, h("div", { class: "panel__titlebar" }, [
        h("h2", { class: "panel__title", text: "Digest e-mails" }),
        h("p", { class: "panel__hint", text: "Digests are sent automatically on each member's schedule (instant, daily at 08:00, weekly on Monday — UTC+3)." })
      ])));
      dpanel.appendChild(dbody);
      var result = h("div", { class: "banner banner--ok", role: "status", hidden: true });
      var btn = A.btn("Send digest now", { kind: "primary", icon: "send", onClick: function () {
        A.confirm({
          title: "Send the Mongolist digest now?",
          message: "This immediately e-mails every subscriber who has new items since their last digest, ignoring their daily or weekly schedule. Items that were already sent are not repeated, and members with nothing new receive nothing.",
          detail: "The e-mails are added to the mail queue and cannot be recalled once they are sent.",
          confirmLabel: "Send digest now"
        }).then(function (ok) {
          if (!ok) return;
          A.setBusy(btn, true, "Sending…");
          api.post("/admin/jobs/digest", { mode: "all" }).then(function (res) {
            A.setBusy(btn, false);
            var n = (res && res.emails_queued) | 0;
            A.clear(result);
            result.appendChild(document.createTextNode(n ? n + (n === 1 ? " e-mail was" : " e-mails were") + " queued for sending. " : "Nothing to send: no subscriber has new items. "));
            result.appendChild(h("a", { href: "#/mail", text: "Open the mail queue" }));
            result.hidden = false;
            A.toast(n ? "Digest queued: " + n + (n === 1 ? " e-mail." : " e-mails.") : "No subscriber has new items — nothing was queued.", n ? "ok" : "info");
            badgesChanged();
          }, function (err) { A.setBusy(btn, false); A.fail(err); });
        });
      } });
      dbody.appendChild(h("p", { class: "pad-b", text: "Use this after publishing something important so members get it right away, or to test the digest." }));
      dbody.appendChild(h("div", { class: "form__actions form__actions--left" }, btn));
      dbody.appendChild(result);
      root.appendChild(dpanel);

      return { destroy: function () { dead = true; } };
    }
  });

  /* ═════════════════════════ Mail queue ═════════════════════════ */
  var MAIL_TONE = { queued: "gold", sending: "info", sent: "ok", failed: "danger" };

  A.register("mail", {
    label: "Mail queue", icon: "clock", group: "System", order: 200, badge: "mail_failed", badgeTone: "danger", title: "Mail queue",
    mount: function (root, route) {
      var status = ["queued", "sent", "failed"].indexOf(route.query.status) >= 0 ? route.query.status : "";
      var view = A.crud({
        endpoint: "/admin/mail", singular: "e-mail", plural: "e-mails", noCreate: true, noEdit: true, noDelete: true, search: false, pageSize: 25,
        initialFilters: { status: status },
        filters: [{ name: "status", label: "Status", all: "All statuses", options: [{ value: "queued", label: "Queued" }, { value: "sent", label: "Sent" }, { value: "failed", label: "Failed" }] }],
        columns: [
          { label: "#", cls: "num", render: function (it) { return String(it.id); } },
          { label: "To", render: function (it) { return h("strong", { text: it.to_email }); } },
          { label: "Subject", render: function (it) { return h("div", { class: "cell-title" }, [h("span", { class: "cell-clip", title: it.subject, text: A.fmt.clip(it.subject, 70) }), it.purpose ? h("div", { class: "cell-sub", text: it.purpose }) : null]); } },
          { label: "Status", render: function (it) { return A.badge(it.status.charAt(0).toUpperCase() + it.status.slice(1), MAIL_TONE[it.status] || "neutral"); } },
          { label: "Tries", cls: "num", render: function (it) { return String(it.attempts | 0); } },
          { label: "Last error", render: function (it) { return it.last_error ? h("span", { class: "cell-error", title: it.last_error, text: A.fmt.clip(it.last_error, 140) }) : "—"; } },
          { label: "Created (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.dt(it.created_at); } },
          { label: "Sent (UTC+3)", cls: "nowrap", render: function (it) { return it.sent_at ? A.fmt.dt(it.sent_at) : "—"; } }
        ],
        rowActions: function (it, v) {
          if (it.status === "sent") return null;
          var btn = A.btn("Retry", { size: "sm", icon: "refresh", title: "Queue e-mail #" + it.id + " for another attempt", onClick: function () {
            A.setBusy(btn, true);
            api.post("/admin/mail/" + it.id + "/retry").then(function () {
              A.toast("E-mail #" + it.id + " queued for another attempt.");
              badgesChanged();
              v.reload();
            }, function (err) { A.setBusy(btn, false); A.fail(err); });
          } });
          return btn;
        },
        label: function (it) { return "e-mail #" + it.id; }
      });
      root.appendChild(A.pageHead("Mail queue", "Every e-mail the site sends (codes, notifications, digests). Failed messages can be retried."));
      root.appendChild(view.el);
      view.load();
      return { destroy: view.destroy };
    }
  });

  /* ═════════════════════════ Audit log ═════════════════════════ */
  A.register("audit", {
    label: "Audit log", icon: "audit", group: "System", order: 210, title: "Audit log",
    mount: function (root) {
      var view = A.crud({
        endpoint: "/admin/audit", singular: "entry", plural: "entries", noCreate: true, noEdit: true, noDelete: true, search: false, pageSize: 50,
        columns: [
          { label: "When (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.dt(it.created_at); } },
          { label: "Who", render: function (it) { return it.actor ? it.actor.name : h("span", { class: "muted", text: "System" }); } },
          { label: "Action", render: function (it) { return h("code", { class: "code-chip", text: it.action }); } },
          { label: "Item", render: function (it) {
            var id = it.entity_id == null ? "" : String(it.entity_id);
            if (!id) return it.entity;
            /* member ids are UUIDs: show the first block, keep the full id in the tooltip */
            var short = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? id.slice(0, 8) + "…" : id;
            return [it.entity + " ", h("span", { class: "muted", title: id, text: "#" + short })];
          } },
          { label: "Details", render: function (it) { return h("div", { class: "meta" }, metaNodes(it.meta) || []); } }
        ]
      });
      root.appendChild(A.pageHead("Audit log", "Every change made in the admin panel, newest first."));
      root.appendChild(view.el);
      view.load();
      return { destroy: view.destroy };
    }
  });
})();
