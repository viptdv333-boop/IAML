/* ═══════════════════════════════════════════════════
   IAML admin — content sections: News, Events, Publications,
   Participants (+ Positions), Pages, Menu, Useful Links (+ Categories),
   Contacts (settings + people + recipients).
   Field names, required flags and limits follow docs/API.md §5.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = window.IAML;
  var A = IAML.admin;
  var h = A.h;
  var api = IAML.api;
  var GROUP = "Content";
  var HOURS3 = 3 * 3600 * 1000;

  /* ───────── shared bits ───────── */
  function titleCell(item, sub) {
    return h("div", { class: "cell-title" }, [h("strong", { text: item.title || item.name || "" }), sub ? h("div", { class: "cell-sub", text: sub }) : null]);
  }

  /* Draft / Scheduled / Published for news, events, publications */
  function statusBadge(item) {
    if (!item.is_published) return A.badge("Draft", "neutral");
    if (item.published_at && A.isFuture(item.published_at)) return A.badge("Scheduled", "gold");
    return A.badge("Published", "ok");
  }

  function statusNote(values) {
    if (!values.is_published) return { tone: "neutral", text: "Draft — not shown on the site." };
    if (!values.published_at) return null;
    if (A.isFuture(values.published_at)) return { tone: "gold", text: "Scheduled — appears on the site on " + A.fmt.dt(values.published_at) + " (UTC+3)." };
    return { tone: "ok", text: "Published — visible on the site." };
  }

  /* blocks > 500 words (and the server's extra 8,000-character cap) before any request is sent */
  function limitValidator(list) {
    return function (values) {
      var errs = {};
      list.forEach(function (s) {
        var v = String(values[s.name] || "");
        var w = A.fmt.words(v), len = v.trim().length;
        if (w > s.words) errs[s.name] = "must be at most " + s.words + " words (now " + w + ")";
        else if (len > s.chars) errs[s.name] = "must be at most " + A.fmt.n(s.chars) + " characters (now " + A.fmt.n(len) + ")";
      });
      return errs;
    };
  }

  var PUBLISH_FIELDS = [
    { name: "published_at", label: "Publish date and time (UTC+3)", short: "Publish date", type: "datetime", w: "half" },
    { name: "is_published", label: "Published", type: "switch", w: "half", hint: "Switch off to keep it as a draft." },
    { name: "_status", type: "note", render: statusNote }
  ];

  function mount(root, title, desc, view, extraHead) {
    root.appendChild(A.pageHead(title, desc));
    if (extraHead) root.appendChild(extraHead);
    root.appendChild(view.el);
    view.load();
    return { destroy: view.destroy };
  }

  function visibleSwitch(item, view, what) {
    return A.switchEl({
      checked: !!item.is_visible,
      label: (item.is_visible ? "Hide " : "Show ") + (item.name || item.title || "item"),
      text: item.is_visible ? "Visible" : "Hidden",
      onChange: function (checked) { view.update(item, { is_visible: checked }, checked ? "Now visible" + (what ? " " + what : "") + "." : "Now hidden" + (what ? " " + what : "") + "."); }
    });
  }

  /* ═════════════════════════ News ═════════════════════════ */
  A.register("news", {
    label: "News", icon: "news", group: GROUP, order: 10,
    title: "News",
    mount: function (root) {
      var limits = limitValidator([{ name: "body", words: 500, chars: 8000 }]);
      var view = A.crud({
        endpoint: "/admin/news", singular: "news item", plural: "news items",
        searchPlaceholder: "Search title or text…",
        columns: [
          { label: "Title", render: function (it) { return titleCell(it, A.fmt.clip(it.body, 120)); } },
          { label: "Status", render: statusBadge },
          { label: "Published (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.dt(it.published_at); } },
          { label: "Words", cls: "num", render: function (it) { return A.fmt.n(A.fmt.words(it.body)); } }
        ],
        fields: [{ name: "title", label: "Title", required: true, max: 200 }]
          .concat(PUBLISH_FIELDS)
          .concat([{ name: "body", label: "Text", type: "textarea", rows: 12, required: true, counter: { words: 500, chars: 8000 }, hint: "Plain text, up to 500 words. Line breaks are kept." }]),
        defaults: function () { return { title: "", body: "", published_at: "now", is_published: true }; },
        validate: limits,
        toPayload: function (v) { return { title: v.title, body: v.body, published_at: v.published_at, is_published: v.is_published }; }
      });
      return mount(root, "News", "Announcements shown on the News page and in the Mongolist digest. A publish time in the future schedules the item.", view);
    }
  });

  /* ═════════════════════════ Events ═════════════════════════ */
  function eventPast(it) {
    var end = it.ends_at ? new Date(it.ends_at).getTime() : new Date(it.starts_at).getTime() + HOURS3;
    return end < Date.now();
  }

  A.register("events", {
    label: "Events", icon: "calendar", group: GROUP, order: 20,
    title: "Events",
    mount: function (root) {
      var limits = limitValidator([{ name: "body", words: 500, chars: 8000 }]);
      var view = A.crud({
        endpoint: "/admin/events", singular: "event", plural: "events",
        searchPlaceholder: "Search title, location or summary…",
        columns: [
          { label: "Event", render: function (it) { return titleCell(it, it.location || ""); } },
          { label: "Status", render: function (it) {
            var out = [statusBadge(it)];
            if (it.is_published && !A.isFuture(it.published_at || it.starts_at) && eventPast(it)) out.push(" ", A.badge("Past", "info"));
            return out;
          } },
          { label: "Starts (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.dt(it.starts_at); } },
          { label: "Ends (UTC+3)", cls: "nowrap", render: function (it) { return it.ends_at ? A.fmt.dt(it.ends_at) : "—"; } }
        ],
        fields: [
          { name: "title", label: "Title", required: true, max: 200 },
          { name: "location", label: "Location", max: 200, placeholder: "e.g. Ulaanbaatar, Mongolia" },
          { name: "starts_at", label: "Starts (UTC+3)", short: "Start", type: "datetime", required: true, w: "half" },
          { name: "ends_at", label: "Ends (UTC+3)", short: "End", type: "datetime", w: "half", hint: "Optional. Without an end, the event counts as past 3 hours after it starts." }
        ].concat(PUBLISH_FIELDS).concat([
          { name: "summary", label: "Summary", type: "textarea", rows: 3, max: 400, hint: "Short teaser shown on the Events page (up to 400 characters)." },
          { name: "body", label: "Details", type: "textarea", rows: 8, counter: { words: 500, chars: 8000 }, hint: "Optional full description, up to 500 words." }
        ]),
        defaults: function () { return { title: "", location: "", starts_at: "now", ends_at: null, summary: "", body: "", published_at: "now", is_published: true }; },
        validate: limits,
        toPayload: function (v) {
          return { title: v.title, location: v.location, starts_at: v.starts_at, ends_at: v.ends_at, summary: v.summary, body: v.body, published_at: v.published_at, is_published: v.is_published };
        }
      });
      return mount(root, "Events", "Conferences, workshops and meetings. Times are entered in UTC+3 (the site's time zone).", view);
    }
  });

  /* ═════════════════════════ Publications ═════════════════════════ */
  A.register("publications", {
    label: "Publications", icon: "book", group: GROUP, order: 30,
    title: "Publications",
    mount: function (root) {
      var limits = limitValidator([{ name: "summary", words: 500, chars: 8000 }]);
      var view = A.crud({
        endpoint: "/admin/publications", singular: "publication", plural: "publications",
        searchPlaceholder: "Search title, authors, topic or summary…",
        columns: [
          { label: "Publication", render: function (it) { return titleCell(it, it.authors); } },
          { label: "Topic", render: function (it) { return it.topic ? A.badge(it.topic, "info") : "—"; } },
          { label: "Status", render: statusBadge },
          { label: "Published (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.dt(it.published_at); } }
        ],
        fields: [
          { name: "title", label: "Title", required: true, max: 300 },
          { name: "authors", label: "Authors", required: true, max: 300, placeholder: "e.g. A. Author, B. Author" },
          { name: "topic", label: "Topic", max: 80, placeholder: "e.g. Phonology" }
        ].concat(PUBLISH_FIELDS).concat([
          { name: "summary", label: "Summary", type: "textarea", rows: 10, required: true, counter: { words: 500, chars: 8000 }, hint: "Plain text, up to 500 words." }
        ]),
        defaults: function () { return { title: "", authors: "", topic: "", summary: "", published_at: "now", is_published: true }; },
        validate: limits,
        toPayload: function (v) { return { title: v.title, authors: v.authors, topic: v.topic, summary: v.summary, published_at: v.published_at, is_published: v.is_published }; }
      });
      return mount(root, "Publications", "Books, articles and other output by members.", view);
    }
  });

  /* ═════════════════════════ Participants + Positions ═════════════════════════ */
  function participantsTabs(active) {
    return A.tabs([
      { label: "Participants", href: "#/participants", active: active === "people" },
      { label: "Positions", href: "#/participants/positions", active: active === "positions" }
    ], "Participants sections");
  }

  function peopleView(root) {
    var holder = h("div");
    root.appendChild(holder);
    holder.appendChild(A.loading());
    var ctl = { destroy: function () {} };
    api.get("/admin/positions", { limit: 200 }).then(function (res) {
      A.clear(holder);
      var positions = (res && res.items) || [];
      var options = positions.map(function (p) { return { value: p.id, label: p.name }; });
      var view = A.crud({
        endpoint: "/admin/participants", singular: "participant", plural: "participants",
        sortable: true, search: true, searchPlaceholder: "Search name, organisation or position…",
        group: function (it) { return it.position_id; },
        filters: [{ name: "position_id", label: "Position", all: "All positions", options: options }],
        columns: [
          { label: "Name", render: function (it) { return h("strong", { text: it.name }); } },
          { label: "Position", render: function (it) { return A.badge(it.position || "—", "info"); } },
          { label: "Organisation", render: function (it) { return it.org ? h("span", { class: "cell-clip", title: it.org, text: A.fmt.clip(it.org, 90) }) : "—"; } },
          { label: "Visibility", render: function (it, v) { return visibleSwitch(it, v, "on the site"); } }
        ],
        fields: [
          { name: "name", label: "Name", required: true, max: 120, hint: "As it should appear, e.g. “Khabtagaeva Bayarma”." },
          { name: "position_id", label: "Position", type: "select", numeric: true, required: true, placeholder: "Select a position…", options: options },
          { name: "org", label: "Organisation", type: "textarea", rows: 2, max: 300 },
          { name: "is_visible", label: "Visible on the Participants page", type: "switch" }
        ],
        defaults: function () {
          var pid = view.state.filters.position_id;
          return { name: "", position_id: pid ? Number(pid) : null, org: "", is_visible: true };
        },
        toPayload: function (v) { return { name: v.name, position_id: v.position_id, org: v.org, is_visible: v.is_visible }; }
      });
      holder.appendChild(view.el);
      ctl.destroy = view.destroy;
      view.load();
    }, function (err) {
      A.clear(holder);
      holder.appendChild(A.errorState(err, function () { A.clear(root); peopleView(root); }));
    });
    return { destroy: function () { ctl.destroy(); } };
  }

  function positionsView(root) {
    var holder = h("div");
    root.appendChild(holder);
    holder.appendChild(A.loading());
    var ctl = { destroy: function () {} };
    api.get("/admin/participants", { limit: 200 }).then(function (res) {
      A.clear(holder);
      var counts = {}, complete = res && res.total <= 200;
      ((res && res.items) || []).forEach(function (p) { counts[p.position_id] = (counts[p.position_id] || 0) + 1; });
      var columns = [
        { label: "Position", render: function (it) { return h("strong", { text: it.name }); } },
        { label: "Singular form", render: function (it) { return it.singular || "—"; } }
      ];
      if (complete) columns.push({ label: "Participants", cls: "num", render: function (it) { return String(counts[it.id] || 0); } });
      var view = A.crud({
        endpoint: "/admin/positions", singular: "position", plural: "positions",
        sortable: true, title: "Positions", hint: "Participants are grouped by position on the public page, in this order. A position cannot be deleted while it still has participants.",
        columns: columns,
        fields: [
          { name: "name", label: "Name", required: true, max: 80, hint: "Group heading, e.g. “Vice Presidents”. Must be unique." },
          { name: "singular", label: "Singular form", max: 80, hint: "Used for a single person, e.g. “Vice President”." }
        ],
        modalSize: "sm",
        defaults: function () { return { name: "", singular: "" }; },
        toPayload: function (v) { return { name: v.name, singular: v.singular }; }
      });
      holder.appendChild(view.el);
      ctl.destroy = view.destroy;
      view.load();
    }, function (err) {
      A.clear(holder);
      holder.appendChild(A.errorState(err, function () { A.clear(root); positionsView(root); }));
    });
    return { destroy: function () { ctl.destroy(); } };
  }

  A.register("participants", {
    label: "Participants", icon: "users", group: GROUP, order: 40,
    title: "Participants",
    mount: function (root, route) {
      var which = route.sub[0] === "positions" ? "positions" : "people";
      root.appendChild(A.pageHead("Participants", which === "positions"
        ? "Group headings on the Participants page. Rename and reorder them here."
        : "The roster shown on the Participants page. Reorder people within their position."));
      root.appendChild(participantsTabs(which));
      return which === "positions" ? positionsView(root) : peopleView(root);
    }
  });

  /* ═════════════════════════ Pages ═════════════════════════ */
  function syntaxHelp() {
    var rows = [
      ["# Heading", "Headings: #, ## and ### (one blank line between blocks)"],
      ["- item", "Bullet list"],
      ["1. item", "Numbered list"],
      ["> text", "Quote"],
      ["**bold**", "Bold"],
      ["*italic*", "Italic"],
      ["`code`", "Inline code"],
      ["[text](https://example.org)", "Link — only http, https and mailto"]
    ];
    var dl = h("dl", { class: "md-help__list" });
    rows.forEach(function (r) { dl.appendChild(h("dt", null, h("code", { text: r[0] }))); dl.appendChild(h("dd", { text: r[1] })); });
    return h("details", { class: "md-help", open: true }, [
      h("summary", { text: "Supported formatting" }),
      dl,
      h("p", { class: "md-help__note", text: "A single line break inside a paragraph is kept as a line break. Raw HTML is not supported and is shown as plain text." })
    ]);
  }

  A.register("pages", {
    label: "Pages", icon: "file", group: GROUP, order: 50,
    title: "Pages",
    mount: function (root) {
      var view = A.crud({
        endpoint: "/admin/pages", singular: "page", plural: "pages",
        searchPlaceholder: "Search title or slug…", modalSize: "xl",
        columns: [
          { label: "Page", render: function (it) { return titleCell(it, "page.html?slug=" + it.slug); } },
          { label: "Status", render: function (it) { return it.is_published ? A.badge("Published", "ok") : A.badge("Draft", "neutral"); } },
          { label: "Menu", render: function (it) { return it.show_in_menu ? A.badge("In menu", "info") : A.badge("Not in menu", "neutral"); } },
          { label: "Updated (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.dt(it.updated_at); } }
        ],
        rowActions: function (it) {
          return A.iconBtn("external", "View on the site: " + it.title, null, { href: "page.html?slug=" + encodeURIComponent(it.slug), target: "_blank" });
        },
        fields: [
          { name: "title", label: "Title", required: true, max: 120, w: "half" },
          { name: "slug", label: "URL slug", required: true, max: 60, w: "half", mono: true, hint: "Lowercase letters, digits and single hyphens. The page is served at page.html?slug=<slug>." },
          { name: "is_published", label: "Published", type: "switch", w: "half", hint: "Unpublished pages are not found on the site." },
          { name: "show_in_menu", label: "Show in menu", type: "switch", w: "half", hint: "Adds or removes this page's entry in the site menu (label and position: see Menu)." },
          { name: "body", label: "Content (Markdown subset)", short: "Content", type: "markdown", rows: 14, counter: { chars: 50000 }, help: syntaxHelp() }
        ],
        defaults: function () { return { title: "", slug: "", body: "", is_published: true, show_in_menu: true }; },
        toPayload: function (v) { return { slug: v.slug, title: v.title, body: v.body, is_published: v.is_published, show_in_menu: v.show_in_menu }; },
        deleteMessage: function (it) { return "“" + it.title + "” and its menu entry will be removed from the site."; }
      });
      return mount(root, "Pages", "Custom pages written in a safe Markdown subset. Each page can have its own entry in the site menu.", view);
    }
  });

  /* ═════════════════════════ Menu ═════════════════════════ */
  A.register("menu", {
    label: "Menu", icon: "list", group: GROUP, order: 60,
    title: "Menu",
    mount: function (root) {
      var view = A.crud({
        endpoint: "/admin/menu", singular: "menu entry", plural: "menu entries",
        sortable: true, noCreate: true, noDelete: true, modalSize: "sm",
        title: "Site menu", hint: "Order and visibility of the top menu. Core sections cannot be deleted; page entries are created and removed in Pages.",
        columns: [
          { label: "Label", render: function (it) { return h("strong", { text: it.title }); } },
          { label: "Link", render: function (it) { return h("code", { class: "code-chip", text: it.href }); } },
          { label: "Type", render: function (it) { return it.is_core ? A.badge("Core", "info") : A.badge("Page", "gold"); } },
          { label: "Visibility", render: function (it, v) {
            return A.switchEl({
              checked: !!it.is_visible, label: (it.is_visible ? "Hide " : "Show ") + it.title, text: it.is_visible ? "Visible" : "Hidden",
              onChange: function (c) { v.update(it, { is_visible: c }, "“" + it.title + "” is now " + (c ? "visible in" : "hidden from") + " the menu."); }
            });
          } }
        ],
        rowActions: function (it) {
          return it.is_core ? null : A.iconBtn("file", "Manage this page in Pages: " + it.title, null, { href: "#/pages" });
        },
        fields: [{ name: "title", label: "Menu label", required: true, max: 40, hint: "Shown in the site's top menu (up to 40 characters)." }],
        toPayload: function (v) { return { title: v.title }; }
      });
      return mount(root, "Menu", "Choose what appears in the site's top menu, in which order, and under which name.", view);
    }
  });

  /* ═════════════════════════ Useful Links + Categories ═════════════════════════ */
  function linksTabs(active) {
    return A.tabs([
      { label: "Links", href: "#/links", active: active === "links" },
      { label: "Categories", href: "#/links/categories", active: active === "cats" }
    ], "Useful Links sections");
  }

  function linksView(root) {
    var holder = h("div");
    root.appendChild(holder);
    holder.appendChild(A.loading());
    var ctl = { destroy: function () {} };
    api.get("/admin/link-categories", { limit: 200 }).then(function (res) {
      A.clear(holder);
      var cats = (res && res.items) || [];
      var options = cats.map(function (c) { return { value: c.id, label: c.title }; });
      var view = A.crud({
        endpoint: "/admin/links", singular: "link", plural: "links",
        sortable: true, search: true, searchPlaceholder: "Search title, description, URL or category…",
        group: function (it) { return it.category_id; },
        filters: [{ name: "category_id", label: "Category", all: "All categories", options: options }],
        columns: [
          { label: "Link", render: function (it) { return titleCell(it, A.fmt.clip(it.description, 110)); } },
          { label: "Category", render: function (it) { return A.badge(it.category || "—", "info"); } },
          { label: "URL", render: function (it) {
            if (!it.url) return A.badge("Coming soon", "gold");
            var safe = A.safeHttp(it.url);
            var text = A.fmt.clip(it.url.replace(/^https?:\/\//i, ""), 46);
            return safe ? h("a", { class: "ext-link", href: safe, target: "_blank", rel: "noopener noreferrer", title: it.url, text: text }) : h("span", { text: text });
          } },
          { label: "Visibility", render: function (it, v) { return visibleSwitch(it, v, "on the site"); } }
        ],
        fields: [
          { name: "category_id", label: "Category", type: "select", numeric: true, required: true, placeholder: "Select a category…", options: options },
          { name: "title", label: "Title", required: true, max: 200 },
          { name: "description", label: "Description", type: "textarea", rows: 3, max: 400 },
          { name: "url", label: "URL", type: "url", placeholder: "https://…", hint: "Leave empty to show the link as “coming soon”." },
          { name: "is_visible", label: "Visible on the Useful Links page", type: "switch" }
        ],
        defaults: function () {
          var cid = view.state.filters.category_id;
          return { category_id: cid ? Number(cid) : null, title: "", description: "", url: "", is_visible: true };
        },
        toPayload: function (v) { return { category_id: v.category_id, title: v.title, description: v.description, url: v.url, is_visible: v.is_visible }; }
      });
      holder.appendChild(view.el);
      ctl.destroy = view.destroy;
      view.load();
    }, function (err) {
      A.clear(holder);
      holder.appendChild(A.errorState(err, function () { A.clear(root); linksView(root); }));
    });
    return { destroy: function () { ctl.destroy(); } };
  }

  function categoriesView(root) {
    var view = A.crud({
      endpoint: "/admin/link-categories", singular: "category", plural: "categories",
      sortable: true, title: "Link categories", hint: "Group headings on the Useful Links page, in this order.", modalSize: "sm",
      columns: [
        { label: "Category", render: function (it) { return titleCell(it, A.fmt.clip(it.blurb, 110)); } },
        { label: "Slug", render: function (it) { return h("code", { class: "code-chip", text: it.slug }); } }
      ],
      fields: [
        { name: "title", label: "Title", required: true, max: 80 },
        { name: "slug", label: "Slug", required: true, max: 60, mono: true, hint: "Unique; lowercase letters, digits and single hyphens." },
        { name: "blurb", label: "Short description", type: "textarea", rows: 2, max: 200 }
      ],
      defaults: function () { return { title: "", slug: "", blurb: "" }; },
      toPayload: function (v) { return { slug: v.slug, title: v.title, blurb: v.blurb }; },
      deleteMessage: function (it) { return "“" + it.title + "” and all links inside it will be deleted."; }
    });
    root.appendChild(view.el);
    view.load();
    return { destroy: view.destroy };
  }

  A.register("links", {
    label: "Useful Links", icon: "link", group: GROUP, order: 70,
    title: "Useful Links",
    mount: function (root, route) {
      var which = route.sub[0] === "categories" ? "cats" : "links";
      root.appendChild(A.pageHead("Useful Links", which === "cats"
        ? "Categories group the links. Deleting a category deletes its links."
        : "Resources shown on the Useful Links page. A link without a URL is shown as “coming soon”."));
      root.appendChild(linksTabs(which));
      return which === "cats" ? categoriesView(root) : linksView(root);
    }
  });

  /* ═════════════════════════ Contacts ═════════════════════════ */
  function settingsPanel() {
    var panel = h("section", { class: "panel" });
    var body = h("div", { class: "panel__body panel__body--pad" });
    panel.appendChild(h("div", { class: "panel__head" }, h("div", { class: "panel__titlebar" }, [
      h("h2", { class: "panel__title", text: "Contact details" }),
      h("p", { class: "panel__hint", text: "The general e-mail address and postal address shown on the Contacts page." })
    ])));
    panel.appendChild(body);
    body.appendChild(A.loading());

    function build(settings) {
      A.clear(body);
      var form = A.form([
        { name: "contact.email", label: "Contact e-mail", short: "Contact e-mail", type: "email", placeholder: "info@example.org", autocomplete: "off", hint: "Shown publicly. Leave empty to hide it." },
        { name: "contact.address", label: "Address", type: "textarea", rows: 3, max: 300, hint: "Shown publicly. Line breaks are kept." }
      ]);
      form.set({ "contact.email": settings["contact.email"], "contact.address": settings["contact.address"] });
      var banner = h("div", { class: "banner banner--error", role: "alert", hidden: true });
      var save = A.btn("Save contact details", { kind: "primary", type: "submit", form: form.id });
      var saving = false;
      form.el.addEventListener("submit", function (e) {
        e.preventDefault();
        if (saving) return;
        saving = true; A.setBusy(save, true, "Saving…");
        form.clearErrors(); banner.hidden = true;
        var v = form.get();
        api.put("/admin/settings", { settings: { "contact.email": v["contact.email"], "contact.address": v["contact.address"] } }).then(function (res) {
          saving = false; A.setBusy(save, false);
          form.set((res && res.settings) || {});
          A.toast("Contact details saved.");
        }, function (err) {
          saving = false; A.setBusy(save, false);
          if (err && err.status === 401) return A.fail(err);
          if (err && err.fields) {
            var r = form.setErrors(err.fields);
            var msgs = r.unmatched.slice();
            if (r.first) { if (!msgs.length) msgs.push("Please check the highlighted fields."); r.first.focus(); }
            else if (!msgs.length) msgs.push(err.message);
            banner.textContent = msgs.join(" "); banner.hidden = false;
          } else { banner.textContent = A.errText(err); banner.hidden = false; }
        });
      });
      body.appendChild(banner);
      body.appendChild(form.el);
      body.appendChild(h("div", { class: "form__actions" }, save));
    }

    function load() {
      A.clear(body); body.appendChild(A.loading());
      api.get("/admin/settings").then(function (res) { build((res && res.settings) || {}); }, function (err) {
        A.clear(body); body.appendChild(A.errorState(err, load));
      });
    }
    load();
    return panel;
  }

  A.register("contacts", {
    label: "Contacts", icon: "contact", group: GROUP, order: 80,
    title: "Contacts",
    mount: function (root) {
      root.appendChild(A.pageHead("Contacts", "What visitors see on the Contacts page, and who receives the messages sent through the contact forms."));
      root.appendChild(settingsPanel());

      var people = A.crud({
        endpoint: "/admin/contact-people", singular: "contact person", plural: "contact people",
        sortable: true, title: "People", hint: "Officers shown on the Contacts page, in this order.", modalSize: "sm",
        columns: [
          { label: "Position", render: function (it) { return A.badge(it.position, "info"); } },
          { label: "Name", render: function (it) { return h("strong", { text: it.name }); } },
          { label: "E-mail", render: function (it) { return it.email || "—"; } },
          { label: "Visibility", render: function (it, v) { return visibleSwitch(it, v, "on the site"); } }
        ],
        fields: [
          { name: "position", label: "Position", required: true, max: 80, placeholder: "e.g. President" },
          { name: "name", label: "Name", required: true, max: 120 },
          { name: "email", label: "E-mail", type: "email", hint: "Optional. Leave empty if it should not be shown." },
          { name: "is_visible", label: "Visible on the Contacts page", type: "switch" }
        ],
        defaults: function () { return { position: "", name: "", email: "", is_visible: true }; },
        toPayload: function (v) { return { position: v.position, name: v.name, email: v.email, is_visible: v.is_visible }; }
      });

      var recipients = A.crud({
        endpoint: "/admin/contact-recipients", singular: "recipient", plural: "recipients",
        search: false, title: "Form recipients", modalSize: "sm", createButton: "Add recipient",
        hint: "E-mail addresses that receive messages sent through the contact forms. If empty, all admins are e-mailed.",
        emptyTitle: "No recipients configured", emptyText: "Messages are currently e-mailed to all admins.",
        columns: [
          { label: "E-mail", render: function (it) { return h("strong", { text: it.email }); } },
          { label: "Label", render: function (it) { return it.label || "—"; } },
          { label: "Added (UTC+3)", cls: "nowrap", render: function (it) { return A.fmt.dt(it.created_at); } }
        ],
        fields: [
          { name: "email", label: "E-mail", type: "email", required: true },
          { name: "label", label: "Label", max: 80, hint: "Optional note, e.g. “Secretary”." }
        ],
        defaults: function () { return { email: "", label: "" }; },
        toPayload: function (v) { return { email: v.email, label: v.label }; },
        label: function (it) { return it.email; }
      });

      root.appendChild(people.el);
      root.appendChild(recipients.el);
      people.load();
      recipients.load();
      return { destroy: function () { people.destroy(); recipients.destroy(); } };
    }
  });
})();
