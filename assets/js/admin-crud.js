/* ═══════════════════════════════════════════════════
   IAML admin — generic CRUD panel (docs/API.md §5 "generic CRUD resources").

   A.crud(cfg) → { el, load, reload, destroy, edit(item), remove(item), update(item, data, msg) }

   cfg:
     endpoint     "/admin/news"                       (required)
     singular     "news item"                         (labels: "New news item", "Delete news item?")
     plural       "news items"                        (default singular + "s")
     title, hint  optional panel heading (for pages that stack several panels)
     search       true | false   (default: on for plain lists, off for reorderable ones)
     searchPlaceholder, pageSize (25)
     sortable     true → ▲▼ buttons that POST <endpoint>/reorder {ids}; loads up to 200 rows, no paging
     group(item)  reorder only inside a group (participants by position, links by category)
     filters      [{ name, label, all, options:[{value,label}] }]  → server-side query filters
     query        extra fixed query params
     columns      [{ label, cls, render(item, view, index) → node|string|array }]
     rowActions   fn(item, view) → nodes shown before Edit / Delete
     fields       [field specs] | fn(item) → [field specs]       (see admin-ui.js A.field)
     prepare      fn() → Promise run before the editor opens (e.g. load select options)
     defaults     fn() → initial values for "New";  fromItem(item) → initial values for "Edit"
     validate     fn(values, item) → { field: message } | null   (client-side, before the request)
     toPayload    fn(values, item) → request body
     modalSize    sm | md | lg | xl
     noCreate / noEdit / noDelete / canDelete(item)
     label(item), deleteMessage(item), deleteDetail(item), emptyTitle, emptyText, createButton, saveCreateLabel
     initialFilters  { filterName: value } applied before the first load (e.g. from the URL)
     onChange()   after any successful write
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = window.IAML;
  var A = IAML.admin;
  var h = A.h;
  var api = IAML.api;

  function defaultLabel(item) { return item.title || item.name || item.email || item.slug || ("#" + item.id); }

  A.crud = function (cfg) {
    var sortable = !!cfg.sortable;
    var searchable = cfg.search === true || (cfg.search !== false && !sortable);
    var singular = cfg.singular || "item";
    var plural = cfg.plural || singular + "s";
    var st = {
      q: "", filters: {}, offset: 0, limit: sortable ? 200 : (cfg.pageSize || 25),
      items: [], total: 0, loading: true, first: true, error: null,
      seq: 0, busy: false, destroyed: false, focusAfter: null, movedId: null
    };

    var root = h("section", { class: "panel" + (cfg.className ? " " + cfg.className : "") });
    var head = h("div", { class: "panel__head" });
    var body = h("div", { class: "panel__body" });
    var foot = h("div", { class: "panel__foot" });
    root.appendChild(head);
    root.appendChild(body);
    root.appendChild(foot);

    var view = { el: root, load: load, reload: load, destroy: destroy, edit: openEditor, remove: confirmDelete, update: update, state: st };
    var newBtn = null;
    var searchInput = null;

    function label(item) { return (cfg.label || defaultLabel)(item); }
    function gkey(item) { return cfg.group ? cfg.group(item) : "_"; }
    function canReorder() { return sortable && !st.q && st.offset === 0 && st.items.length >= st.total; }

    /* ───────── toolbar ───────── */
    function buildHead() {
      if (cfg.title) {
        head.appendChild(h("div", { class: "panel__titlebar" }, [
          h("h2", { class: "panel__title", text: cfg.title }),
          cfg.hint ? h("p", { class: "panel__hint", text: cfg.hint }) : null
        ]));
      }
      var tools = h("div", { class: "toolbar" });
      if (searchable) {
        searchInput = h("input", { type: "search", class: "input search__input", placeholder: cfg.searchPlaceholder || "Search…", "aria-label": "Search " + plural, autocomplete: "off", spellcheck: "false" });
        var doSearch = A.debounce(function () {
          var q = searchInput.value.trim();
          if (q === st.q) return;
          st.q = q; st.offset = 0; load();
        }, 300);
        searchInput.addEventListener("input", doSearch);
        tools.appendChild(h("div", { class: "search" }, [A.icon("search", 16), searchInput]));
      }
      (cfg.filters || []).forEach(function (fl) {
        var sel = h("select", { class: "input select toolbar__select", "aria-label": fl.label });
        sel.appendChild(h("option", { value: "", text: fl.all || ("All " + fl.label.toLowerCase()) }));
        fl.options.forEach(function (o) { sel.appendChild(h("option", { value: String(o.value), text: o.label })); });
        var init = cfg.initialFilters && cfg.initialFilters[fl.name];
        if (init !== undefined && init !== null && init !== "") { st.filters[fl.name] = String(init); sel.value = String(init); }
        sel.addEventListener("change", function () { st.filters[fl.name] = sel.value; st.offset = 0; load(); });
        tools.appendChild(sel);
      });
      tools.appendChild(h("div", { class: "toolbar__spacer" }));
      tools.appendChild(A.iconBtn("refresh", "Refresh the list", function () { load(); }));
      if (!cfg.noCreate) {
        newBtn = A.btn(cfg.createButton || ("New " + singular), { kind: "primary", icon: "plus", onClick: function () { openEditor(null); } });
        tools.appendChild(newBtn);
      }
      head.appendChild(tools);
    }

    /* ───────── data ───────── */
    function load() {
      var mySeq = ++st.seq;
      st.loading = true;
      if (st.first) render(); else root.classList.add("is-loading");
      var params = { limit: st.limit, offset: st.offset };
      if (st.q) params.q = st.q;
      Object.keys(st.filters).forEach(function (k) { if (st.filters[k] !== "" && st.filters[k] != null) params[k] = st.filters[k]; });
      if (cfg.query) Object.keys(cfg.query).forEach(function (k) { params[k] = cfg.query[k]; });
      return api.get(cfg.endpoint, params).then(function (res) {
        if (st.destroyed || mySeq !== st.seq) return;
        st.items = (res && res.items) || [];
        st.total = (res && res.total) | 0;
        st.loading = false; st.first = false; st.error = null;
        if (!st.items.length && st.total > 0 && st.offset > 0) { // last row of the last page was removed
          st.offset = Math.max(0, Math.floor((st.total - 1) / st.limit) * st.limit);
          return load();
        }
        render();
        st.focusAfter = null;
      }, function (err) {
        if (st.destroyed || mySeq !== st.seq) return;
        st.loading = false; st.first = false; st.error = err; st.items = []; st.total = 0;
        render();
        st.focusAfter = null;
        if (err && err.status === 401) A.fail(err);
      });
    }

    function afterWrite(focus) {
      st.focusAfter = focus || null;
      if (cfg.onChange) cfg.onChange();
      return load();
    }

    /* ───────── rendering ───────── */
    function render() {
      root.classList.remove("is-loading");
      A.clear(body);
      A.clear(foot);
      if (st.loading && st.first) { body.appendChild(A.loading()); return; }
      if (st.error) { body.appendChild(A.errorState(st.error, load)); return; }
      if (!st.items.length) { body.appendChild(emptyState()); return; }
      if (sortable && !canReorder()) {
        body.appendChild(h("p", { class: "panel__note" }, [A.icon("info", 16), st.total > st.items.length ? " This list is too long to reorder here." : " Reordering is available when no search is active."]));
      }
      body.appendChild(renderTable());
      if (!sortable) {
        foot.appendChild(A.pager({ offset: st.offset, limit: st.limit, total: st.total, onChange: function (o) { st.offset = o; load(); } }));
      } else {
        foot.appendChild(h("div", { class: "pager" }, h("span", { class: "pager__info", text: A.fmt.n(st.total) + (st.total === 1 ? " item" : " items") })));
      }
      restoreFocus();
    }

    function emptyState() {
      var filtered = st.q || Object.keys(st.filters).some(function (k) { return st.filters[k]; });
      if (filtered) {
        return A.empty("Nothing matches", "No " + plural + " match the current search or filter.", A.btn("Clear search and filters", { kind: "secondary", onClick: clearFilters }));
      }
      return A.empty(cfg.emptyTitle || ("No " + plural + " yet"), cfg.emptyText || (cfg.noCreate ? "" : "Create the first one to get started."),
        cfg.noCreate ? null : A.btn(cfg.createButton || ("New " + singular), { kind: "primary", icon: "plus", onClick: function () { openEditor(null); } }));
    }

    function clearFilters() {
      st.q = ""; st.filters = {}; st.offset = 0;
      if (searchInput) searchInput.value = "";
      head.querySelectorAll("select").forEach(function (s) { s.value = ""; });
      load();
    }

    function renderTable() {
      var movable = canReorder();
      var counts = {}, rank = [];
      st.items.forEach(function (it, i) { var k = gkey(it); counts[k] = (counts[k] || 0) + 1; rank[i] = counts[k]; });
      var cols = [];
      if (sortable && movable) cols.push({ label: "#", cls: "col-num", render: function (it, i) { return String(rank[i]); } });
      cfg.columns.forEach(function (c) {
        cols.push({ label: c.label, cls: c.cls, render: function (it, i) { return c.render(it, view, i); } });
      });
      cols.push({ label: "Actions", srOnly: true, cls: "col-actions", render: function (it, i) { return rowActions(it, i, movable); } });
      return A.table(cols, st.items, {
        label: cfg.title || (plural.charAt(0).toUpperCase() + plural.slice(1)),
        rowClass: function (it) { return st.movedId === it.id ? "just-moved" : null; }
      });
    }

    function rowActions(it, i, movable) {
      var box = h("div", { class: "row-actions" });
      var nm = label(it);
      if (sortable && movable) {
        var firstIn = i === 0 || gkey(st.items[i - 1]) !== gkey(it);
        var lastIn = i === st.items.length - 1 || gkey(st.items[i + 1]) !== gkey(it);
        box.appendChild(h("span", { class: "row-actions__move" }, [
          A.iconBtn("up", "Move up: " + nm, function () { move(it, -1); }, { disabled: firstIn || st.busy, className: "js-up" }),
          A.iconBtn("down", "Move down: " + nm, function () { move(it, 1); }, { disabled: lastIn || st.busy, className: "js-down" })
        ]));
      }
      if (cfg.rowActions) A.append(box, cfg.rowActions(it, view));
      if (!cfg.noEdit) box.appendChild(A.iconBtn("edit", "Edit: " + nm, function () { openEditor(it); }, { className: "js-edit" }));
      if (!cfg.noDelete && (!cfg.canDelete || cfg.canDelete(it))) {
        box.appendChild(A.iconBtn("trash", "Delete: " + nm, function () { confirmDelete(it); }, { kind: "danger-o", className: "js-del" }));
      }
      return box;
    }

    function restoreFocus() {
      var fa = st.focusAfter;
      if (!fa) return;
      var el = null;
      if (fa.id != null) {
        var tr = body.querySelector('tr[data-id="' + fa.id + '"]');
        if (tr) el = (fa.sel && tr.querySelector(fa.sel + ":not(:disabled)")) || (fa.alt && tr.querySelector(fa.alt + ":not(:disabled)")) || tr.querySelector(".js-edit");
      }
      if (!el && fa.fallback) el = newBtn || searchInput || head.querySelector("button");
      if (el) { try { el.focus(); } catch (e) { /* ignore */ } }
    }

    /* ───────── reorder ───────── */
    function move(item, dir) {
      if (st.busy) return;
      var i = st.items.indexOf(item), j = i + dir;
      if (i < 0 || j < 0 || j >= st.items.length) return;
      if (gkey(st.items[j]) !== gkey(item)) return;
      var arr = st.items.slice();
      arr[i] = st.items[j]; arr[j] = item;
      var g = gkey(item);
      var ids = arr.filter(function (x) { return gkey(x) === g; }).map(function (x) { return x.id; });
      st.items = arr;
      st.busy = true;
      st.movedId = item.id;
      st.focusAfter = { id: item.id, sel: dir < 0 ? ".js-up" : ".js-down", alt: dir < 0 ? ".js-down" : ".js-up" };
      render();
      A.say("Moved " + label(item) + (dir < 0 ? " up" : " down") + " to position " + (ids.indexOf(item.id) + 1) + " of " + ids.length + ".");
      api.post(cfg.endpoint + "/reorder", { ids: ids }).then(function () {
        st.busy = false;
        if (cfg.onChange) cfg.onChange();
        return load();
      }, function (err) {
        st.busy = false;
        A.fail(err, "Could not save the new order.");
        return load();
      }).then(function () { st.movedId = null; });
    }

    /* ───────── quick update (visibility switches etc.) ───────── */
    function update(item, data, msg) {
      return api.put(cfg.endpoint + "/" + item.id, data).then(function () {
        if (msg) A.toast(msg);
        return afterWrite(null);
      }, function (err) {
        A.fail(err);
        return load(); // snap switches back to the real state
      });
    }

    /* ───────── delete ───────── */
    function confirmDelete(item) {
      var nm = label(item);
      A.confirm({
        title: "Delete " + singular + "?",
        message: cfg.deleteMessage ? cfg.deleteMessage(item) : "“" + nm + "” will be permanently deleted.",
        detail: cfg.deleteDetail ? cfg.deleteDetail(item) : "This cannot be undone.",
        confirmLabel: "Delete",
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        api.del(cfg.endpoint + "/" + item.id).then(function () {
          A.toast("Deleted “" + nm + "”.");
          afterWrite({ fallback: true });
        }, function (err) { A.fail(err); });
      });
    }

    /* ───────── editor dialog ───────── */
    function openEditor(item) {
      var prep = cfg.prepare ? Promise.resolve().then(cfg.prepare) : Promise.resolve();
      prep.then(function () { buildEditor(item); }, function (err) { A.fail(err, "Could not open the form."); });
    }

    function buildEditor(item) {
      var isNew = !item;
      var specs = typeof cfg.fields === "function" ? cfg.fields(item) : cfg.fields;
      var form = A.form(specs);
      form.set(isNew ? (cfg.defaults ? cfg.defaults() : {}) : (cfg.fromItem ? cfg.fromItem(item) : item));
      var banner = h("div", { class: "banner banner--error", role: "alert", hidden: true });
      var saving = false;
      var saveBtn = A.btn(isNew ? (cfg.saveCreateLabel || "Create") : "Save changes", { kind: "primary", type: "submit", form: form.id });
      var cancelBtn = A.btn("Cancel", { kind: "secondary", onClick: function () { dlg.close("cancel"); } });
      var meta = !isNew && item.updated_at ? h("span", { class: "modal__meta", text: "Last updated " + A.fmt.dt(item.updated_at) + " (UTC+3)" }) : null;
      var dlg = A.modal({
        title: (isNew ? "New " : "Edit ") + singular,
        size: cfg.modalSize || "md",
        body: [banner, form.el],
        footer: [meta, h("span", { class: "modal__spacer" }), cancelBtn, saveBtn],
        persistent: function () { return saving; }
      });

      function showBanner(msg) { banner.textContent = msg || ""; banner.hidden = !msg; }
      function reportErrors(map, message) {
        var r = form.setErrors(map);
        var msgs = r.unmatched.slice();
        if (r.first) { if (!msgs.length) msgs.push("Please check the highlighted fields."); r.first.focus(); }
        else if (!msgs.length) msgs.push(message || "Please check the form.");
        showBanner(msgs.join(" "));
      }

      form.el.addEventListener("submit", function (e) {
        e.preventDefault();
        if (saving) return;
        form.clearErrors();
        showBanner("");
        var values = form.get();
        var cerr = cfg.validate ? cfg.validate(values, item) : null;
        if (cerr && Object.keys(cerr).length) { reportErrors(cerr); return; }
        var payload = cfg.toPayload ? cfg.toPayload(values, item) : values;
        saving = true;
        A.setBusy(saveBtn, true, "Saving…");
        var req = isNew ? api.post(cfg.endpoint, payload) : api.put(cfg.endpoint + "/" + item.id, payload);
        req.then(function (res) {
          saving = false;
          dlg.close("saved");
          var saved = (res && res.item) || {};
          A.toast((isNew ? "Created “" : "Saved “") + label(saved.id != null ? saved : (item || payload)) + "”.");
          afterWrite(isNew ? null : { id: item.id, sel: ".js-edit" });
          if (cfg.onSaved) cfg.onSaved(saved, isNew);
        }, function (err) {
          saving = false;
          A.setBusy(saveBtn, false);
          if (err && err.status === 401) { dlg.close("auth"); A.fail(err); return; }
          if (err && err.fields) reportErrors(err.fields, err.message);
          else showBanner(A.errText(err));
        });
      });
    }

    function destroy() { st.destroyed = true; st.seq++; }

    buildHead();
    return view;
  };
})();
