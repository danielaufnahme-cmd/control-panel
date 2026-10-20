/* ==========================================================================
   CONTACTS PAGE
   Everything is client-side over the embedded `contacts-data` JSON:
     * status tabs (sliding indicator) + instant search  -> exit, then FLIP
     * sort (menu or table headers)                       -> FLIP reorder
     * table <-> card view                                -> new layout fades in
     * row selection                                      -> bulk bar slides up, count bumps
     * contact detail (full screen)                       -> expands from the row, staggered sections, count-ups, chart
     * add-contact modal                                  -> inline errors, new row fades in at the top
     * "load more"                                        -> skeleton shimmer, then stagger-in
   Page-local primitives worth lifting into motion.js later:
     exitThenFlip(), staggerIn()  (see below)
   ========================================================================== */
(function () {
  "use strict";
  const N = window.Nimbus;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const readJSON = (id) => JSON.parse(document.getElementById(id).textContent);
  const sleep = (ms) => new Promise((r) => setTimeout(r, N.reducedMotion ? 0 : ms));

  const PAGE = 24;
  const STATUS_LABEL = { lead: "Lead", active: "Active", vip: "VIP", inactive: "Inactive" };

  const contacts = readJSON("contacts-data");
  const team = readJSON("team-data");
  const openOnLoad = readJSON("open-contact");
  const byId = new Map(contacts.map((c) => [c.id, c]));

  /* ---------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const icons = {};
  $$("[data-icons] template").forEach((t) => (icons[t.dataset.icon] = t.innerHTML.trim()));
  const icon = (name, cls) => (cls ? (icons[name] || "").replace('class="icon"', `class="icon ${cls}"`) : icons[name] || "");
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg>';

  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  const fmtDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
  function ago(iso) {
    if (!iso) return "Never";
    const diff = (new Date(iso) - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
    if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
    return rtf.format(Math.round(diff / (86400 * 365)), "year");
  }
  /** Deterministic PRNG so each contact always gets the same invented stats. */
  function rng(seed) {
    let a = seed * 2654435761 >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hay = (c) => (c._hay ||= [c.name, c.company, c.email, c.role, c.city, c.tags.join(" ")].join(" ").toLowerCase());
  function highlight(text, q) {
    if (!q) return esc(text);
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark class="ct-hl">' + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }

  /* ---------------------------------------------------------------------
     State + derived list
     ------------------------------------------------------------------- */
  const state = { status: "all", q: "", sort: "name", dir: 1, view: "table", limit: PAGE, selected: new Set(), pinned: new Set() };

  const compare = {
    name: (a, b) => a.name.localeCompare(b.name),
    company: (a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name),
    last: (a, b) => (b.last || "").localeCompare(a.last || ""), // newest first; "Never" last
  };
  function compute() {
    const q = state.q;
    const matched = q ? contacts.filter((c) => hay(c).includes(q)) : contacts.slice();
    const list = matched.filter((c) => state.status === "all" || c.status === state.status);
    const cmp = compare[state.sort];
    list.sort((a, b) => {
      const pa = state.pinned.has(a.id), pb = state.pinned.has(b.id);
      if (pa !== pb) return pa ? -1 : 1; // freshly added contacts stay on top
      if (state.sort === "last" && !a.last !== !b.last) return a.last ? -1 : 1; // never-contacted always last
      return cmp(a, b) * state.dir;
    });
    return { matched, list };
  }

  /* ---------------------------------------------------------------------
     DOM: one cached row + one cached card per contact
     ------------------------------------------------------------------- */
  const card = $("[data-contacts-card]");
  const tableWrap = $("[data-table-view]");
  const rowsEl = $("[data-rows]");
  const cardsEl = $("[data-cards]");
  const emptyEl = $("[data-empty]");
  const footer = $("[data-footer]");
  const shownEl = $("[data-shown]");
  const matchedEl = $("[data-matched]");
  const loadBtn = $("[data-load-more]");
  const rowCache = new Map();
  const cardCache = new Map();

  /** Status as plain text with a small brand-colored dot. */
  const badge = (c) => `<span class="ct-status ct-status--${c.status}" data-badge><i class="ct-dot ct-dot--${c.status}"></i>${STATUS_LABEL[c.status]}</span>`;
  /** Tags as plain comma-separated text. */
  const tagsHTML = (c) => (c.tags.length ? esc(c.tags.join(", ")) : '<span class="ct-none">-</span>');
  const checkbox = (c) => `<label class="ct-check"><input type="checkbox" data-select aria-label="Select ${esc(c.name)}"><span>${CHECK_SVG}</span></label>`;
  const actions = (c, withMore = true) => `
    <div class="ct-actions">
      <button class="icon-btn icon-btn--sm" type="button" data-action="email" aria-label="Email ${esc(c.name)}" data-tooltip="Email">${icon("mail")}</button>
      <button class="icon-btn icon-btn--sm" type="button" data-action="call" aria-label="Call ${esc(c.name)}" data-tooltip="Call">${icon("phone")}</button>
      ${withMore ? `<button class="icon-btn icon-btn--sm" type="button" data-action="more" aria-label="More actions" aria-haspopup="menu">${icon("more")}</button>` : ""}
    </div>`;

  function rowEl(c) {
    let el = rowCache.get(c.id);
    if (!el) {
      el = document.createElement("tr");
      el.className = "ct-row";
      el.dataset.id = c.id;
      el.tabIndex = 0;
      el.innerHTML = `
        <td class="ct-col-check">${checkbox(c)}</td>
        <td>
          <div class="ct-person">
            <span class="avatar ct-avatar" data-avatar>${esc(c.initials)}</span>
            <div class="grow">
              <div class="ct-name truncate" data-name></div>
              <div class="ct-sub truncate">${esc(c.email)}</div>
            </div>
          </div>
        </td>
        <td class="ct-col-company"><div class="ct-name-sm truncate">${esc(c.company)}</div><div class="ct-sub truncate">${esc(c.role)}</div></td>
        <td data-badge-slot>${badge(c)}</td>
        <td class="ct-col-tags"><div class="ct-tags truncate">${tagsHTML(c)}</div></td>
        <td class="ct-col-last"><span class="ct-sub" title="${c.last ? fmtDate.format(new Date(c.last)) : ""}" data-last>${ago(c.last)}</span></td>
        <td class="ct-col-actions">${actions(c)}</td>`;
      rowCache.set(c.id, el);
    }
    return el;
  }

  function cardEl(c) {
    let el = cardCache.get(c.id);
    if (!el) {
      el = document.createElement("article");
      el.className = "ct-tile";
      el.dataset.id = c.id;
      el.tabIndex = 0;
      el.innerHTML = `
        <div class="ct-tile__check">${checkbox(c)}</div>
        <button class="icon-btn icon-btn--sm ct-tile__more" type="button" data-action="more" aria-label="More actions" aria-haspopup="menu">${icon("more")}</button>
        <span class="avatar avatar--lg ct-avatar" data-avatar>${esc(c.initials)}</span>
        <h4 class="ct-name truncate" data-name></h4>
        <p class="ct-sub truncate">${esc(c.role)} · ${esc(c.company)}</p>
        <div data-badge-slot>${badge(c)}</div>
        <div class="ct-tags">${tagsHTML(c)}</div>
        <div class="ct-tile__foot">
          <span class="ct-sub ct-tile__last"><span data-last>${ago(c.last)}</span></span>
          ${actions(c, false)}
        </div>`;
      cardCache.set(c.id, el);
    }
    return el;
  }

  /** Re-render the bits of a cached element that depend on state. */
  function refresh(el, c) {
    const name = el.querySelector("[data-name]");
    const html = highlight(c.name, state.q);
    if (name.innerHTML !== html) name.innerHTML = html;
    const sel = state.selected.has(c.id);
    el.classList.toggle("is-selected", sel);
    el.querySelector("[data-select]").checked = sel;
  }

  /* ---------------------------------------------------------------------
     RENDER: exit leaving items, then FLIP the rest into place.
     Exits first (fast, ease-in) keeps table rows simple: no absolute
     positioning needed, and remaining rows glide up into the gap.
     ------------------------------------------------------------------- */
  let renderToken = 0;
  let lastCounts = null;

  async function render(opts = {}) {
    const token = ++renderToken;
    const { matched, list } = compute();
    updateCounts(matched);

    const container = state.view === "table" ? rowsEl : cardsEl;
    const make = state.view === "table" ? rowEl : cardEl;
    const visible = list.slice(0, state.limit);
    const nextEls = visible.map((c) => { const el = make(c); refresh(el, c); return el; });
    const nextSet = new Set(nextEls);
    const leaving = Array.from(container.children).filter((el) => !nextSet.has(el));

    // Items that were fading out but match again: bring them straight back.
    nextEls.forEach((el) => { if (el._exit) { el._exit.cancel(); el._exit = null; } });

    if (leaving.length && !opts.instant && !N.reducedMotion) {
      const exits = leaving.map((el) => {
        if (!el._exit) {
          el._exit = N.animate(el, [{ opacity: 1 }, { opacity: 0 }],
            { duration: N.ms("--dur-fast") || 150, easing: N.easing.in, fill: "forwards" });
        }
        return el._exit.finished.catch(() => {});
      });
      await Promise.all(exits);
      if (token !== renderToken) return; // a newer render took over
    }

    const mutate = () => {
      leaving.forEach((el) => { if (el._exit) { el._exit.cancel(); el._exit = null; } el.remove(); });
      nextEls.forEach((el) => container.appendChild(el));
    };
    if (opts.instant) mutate();
    else N.flip(container, mutate, { duration: 280 });

    setEmpty(list.length === 0, opts.instant);
    updateFooter(visible.length, list.length, opts.instant);
    syncSelectAll();
  }

  function setEmpty(empty, instant) {
    const was = !emptyEl.hidden;
    emptyEl.hidden = !empty;
    (state.view === "table" ? tableWrap : cardsEl).hidden = empty;
    if (empty && !was && !instant) {
      N.animate(emptyEl, [{ opacity: 0 }, { opacity: 1 }], { duration: N.ms("--dur-base"), easing: N.easing.outQuart });
    }
  }

  function updateFooter(shown, total, instant) {
    footer.hidden = total === 0;
    if (instant) { shownEl.textContent = shown; matchedEl.textContent = total; shownEl._nimbusValue = shown; matchedEl._nimbusValue = total; }
    else { N.countTo(shownEl, shown, { duration: 400 }); N.countTo(matchedEl, total, { duration: 400 }); }
    const more = shown < total;
    if (loadBtn.hidden === more) {
      loadBtn.hidden = !more;
      if (more && !instant) N.animate(loadBtn, [{ opacity: 0 }, { opacity: 1 }], { duration: N.ms("--dur-fast") || 150 });
    }
  }

  /** Status tab counts reflect the search query (so you can see where matches are). */
  function updateCounts(matched) {
    const counts = { all: matched.length, lead: 0, active: 0, vip: 0, inactive: 0 };
    matched.forEach((c) => counts[c.status]++);
    $$("[data-status-count]").forEach((el) => {
      const k = el.dataset.statusCount;
      if (lastCounts && lastCounts[k] === counts[k]) return;
      if (!lastCounts) { el.textContent = counts[k]; el._nimbusValue = counts[k]; return; }
      N.countTo(el, counts[k], { duration: 350 });
      el.classList.toggle("is-zero", counts[k] === 0);
    });
    lastCounts = counts;
  }

  /** Totals shown in the stat cards + toolbar pill (after add/delete/status change). */
  function updateTotals() {
    $$("[data-kpi]").forEach((kpi) => {
      const status = kpi.dataset.kpi;
      const n = status === "all" ? contacts.length : contacts.filter((c) => c.status === status).length;
      const v = kpi.querySelector(".ct-kpi__value");
      if (v && v._nimbusValue !== n) N.countTo(v, n, { duration: 450 });
    });
    $("[data-bulk-all-n]").textContent = compute().list.length;
  }

  /* ---------------------------------------------------------------------
     Filters: status tabs, stat cards, search, sort
     ------------------------------------------------------------------- */
  const statusTabs = $("[data-status-tabs]");
  statusTabs.addEventListener("nimbus:tabchange", (e) => {
    state.status = e.detail.value;
    state.limit = PAGE;
    render();
  });
  // KPI columns: clicking one filters the list by its status.
  const kpis = $$("[data-kpi]");
  const markKpi = (status) => kpis.forEach((k) => k.classList.toggle("is-current", k.dataset.kpi === status));
  statusTabs.addEventListener("nimbus:tabchange", (e) => markKpi(e.detail.value));
  markKpi("all");
  kpis.forEach((el) => el.addEventListener("click", () => {
    N.selectTab(statusTabs, el.dataset.kpi);
    const top = card.getBoundingClientRect().top;
    if (top > innerHeight * 0.6) card.scrollIntoView({ behavior: N.reducedMotion ? "auto" : "smooth", block: "start" });
  }));

  /** KPI sparklines: straight segments, thin single-color stroke, no fill or end dot.
   *  The line draws in once (stroke-dashoffset), synced with the card reveal. */
  kpis.forEach((k) => {
    const host = k.querySelector(".ct-kpi__spark");
    const v = host.dataset.points.split(",").map(Number);
    if (v.length < 2) return;
    const min = Math.min(...v), span = Math.max(...v) - min || 1;
    const pts = v.map((y, i) => `${((i / (v.length - 1)) * 100).toFixed(2)},${(2 + (1 - (y - min) / span) * 26).toFixed(2)}`).join(" ");
    host.innerHTML = `<svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="${pts}" pathLength="1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
    const line = host.querySelector("polyline");
    N.onVisible(k, () => N.animate(line, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
      { duration: 600, delay: N.revealDelay(k) + 120, easing: N.easing.outQuart, fill: "backwards" }));
  });

  const search = $("[data-ct-search]");
  const searchWrap = $("[data-search-wrap]");
  let searchTimer;
  search.addEventListener("input", () => {
    searchWrap.classList.toggle("has-value", !!search.value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = search.value.trim().toLowerCase();
      state.limit = PAGE;
      render();
    }, 90); // tiny debounce: still feels instant, avoids a re-layout per keystroke
  });
  search.addEventListener("keydown", (e) => { if (e.key === "Escape" && search.value) { e.stopPropagation(); clearSearch(); } });
  function clearSearch() {
    search.value = "";
    searchWrap.classList.remove("has-value");
    state.q = "";
    state.limit = PAGE;
    render();
  }
  $("[data-search-clear]").addEventListener("click", () => { clearSearch(); search.focus(); });
  $("[data-clear-filters]").addEventListener("click", () => {
    search.value = "";
    searchWrap.classList.remove("has-value");
    state.q = "";
    if (state.status !== "all") N.selectTab(statusTabs, "all"); // its tabchange renders
    else render();
  });

  const SORT_LABEL = { name: "Name", company: "Company", last: "Last contacted" };
  function setSort(key, dir, silent) {
    state.sort = key;
    state.dir = dir;
    state.pinned.clear();
    $("[data-sort-label]").textContent = SORT_LABEL[key];
    $("[data-sort-dir-icon]").classList.toggle("is-flipped", dir < 0);
    $$("[data-sort]").forEach((b) => { b.classList.toggle("is-current", b.dataset.sort === key); b.setAttribute("aria-checked", b.dataset.sort === key); });
    $$("[data-sort-key]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.sortKey === key);
      b.classList.toggle("is-desc", b.dataset.sortKey === key && dir < 0);
    });
    if (!silent) render();
  }
  $$("[data-sort]").forEach((b) => b.addEventListener("click", () => setSort(b.dataset.sort, b.dataset.sort === state.sort ? state.dir : 1)));
  $("[data-sort-toggle]").addEventListener("click", () => setSort(state.sort, -state.dir));
  $$("[data-sort-key]").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.sortKey;
    setSort(key, key === state.sort ? -state.dir : 1);
  }));

  /* ---------------------------------------------------------------------
     View toggle: table <-> cards. The new layout fades in.
     ------------------------------------------------------------------- */
  const viewTabs = $("[data-view-tabs]");
  viewTabs.addEventListener("nimbus:tabchange", (e) => setView(e.detail.value));

  function setView(view) {
    if (view === state.view) return;
    state.view = view;
    card.classList.toggle("is-grid", view === "grid");
    tableWrap.hidden = view !== "table";
    cardsEl.hidden = view !== "grid";
    render({ instant: true });

    // The new layout simply fades in.
    N.animate(view === "table" ? tableWrap : cardsEl, [{ opacity: 0 }, { opacity: 1 }],
      { duration: N.ms("--dur-base") || 250, easing: N.easing.outQuart });
  }

  /** Fade-up a list of elements one after another (capped at 12 steps). */
  function staggerIn(items, { y = 8, step = 40, delay = 0 } = {}) {
    items.forEach((el, i) => {
      N.animate(el, [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: "none" }], {
        duration: N.ms("--dur-base") || 250, delay: delay + Math.min(i, 12) * step, easing: N.easing.outExpo, fill: "backwards",
      });
    });
  }

  /* ---------------------------------------------------------------------
     Load more: skeleton shimmer -> real rows stagger in
     ------------------------------------------------------------------- */
  function skeleton() {
    if (state.view === "table") {
      const tr = document.createElement("tr");
      tr.className = "ct-skel";
      tr.innerHTML = `
        <td class="ct-col-check"><span class="skeleton" style="display:block;width:18px;height:18px"></span></td>
        <td><div class="ct-person"><span class="skeleton skeleton-circle" style="width:36px;height:36px;flex:none"></span>
          <div class="grow"><div class="skeleton skeleton-text" style="width:60%"></div><div class="skeleton skeleton-text" style="width:80%;height:10px"></div></div></div></td>
        <td class="ct-col-company"><div class="skeleton skeleton-text" style="width:70%"></div><div class="skeleton skeleton-text" style="width:50%;height:10px"></div></td>
        <td><span class="skeleton" style="display:block;width:64px;height:22px;border-radius:999px"></span></td>
        <td class="ct-col-tags"><span class="skeleton" style="display:block;width:90px;height:18px"></span></td>
        <td class="ct-col-last"><div class="skeleton skeleton-text" style="width:70px"></div></td>
        <td class="ct-col-actions"></td>`;
      return tr;
    }
    const div = document.createElement("div");
    div.className = "ct-tile ct-skel";
    div.innerHTML = `<span class="skeleton skeleton-circle" style="width:44px;height:44px"></span>
      <div class="skeleton skeleton-text" style="width:60%;margin-top:10px"></div>
      <div class="skeleton skeleton-text" style="width:80%;height:10px"></div>
      <span class="skeleton" style="display:block;width:64px;height:22px;border-radius:999px;margin-top:6px"></span>`;
    return div;
  }

  let loading = false;
  loadBtn.addEventListener("click", async () => {
    if (loading) return;
    loading = true;
    N.loading(loadBtn, true);
    const container = state.view === "table" ? rowsEl : cardsEl;
    const { list } = compute();
    const count = Math.min(PAGE, list.length - state.limit);
    const skels = Array.from({ length: Math.min(count, state.view === "table" ? 6 : 8) }, skeleton);
    skels.forEach((s) => container.appendChild(s));
    staggerIn(skels, { y: 6, step: 30 });
    await sleep(700); // pretend network
    skels.forEach((s) => s.remove());
    const before = new Set(container.children);
    state.limit += PAGE;
    await render({ instant: true });
    staggerIn(Array.from(container.children).filter((el) => !before.has(el)), { y: 10, step: 35 });
    N.loading(loadBtn, false);
    loading = false;
  });

  /* ---------------------------------------------------------------------
     Selection + bulk bar
     ------------------------------------------------------------------- */
  const bulk = $("[data-bulk]");
  const bulkCount = $("[data-bulk-count]");
  const selectAll = $("[data-select-all]");
  selectAll.nextElementSibling.innerHTML = CHECK_SVG;

  function setSelected(id, on) {
    if (on) state.selected.add(id); else state.selected.delete(id);
    [rowCache.get(id), cardCache.get(id)].forEach((el) => {
      if (!el) return;
      el.classList.toggle("is-selected", on);
      el.querySelector("[data-select]").checked = on;
    });
  }
  function updateBulk() {
    const n = state.selected.size;
    const open = n > 0;
    card.classList.toggle("has-selection", open);
    if (open !== bulk.classList.contains("is-open")) {
      bulk.classList.toggle("is-open", open);
      bulk.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (open) {
      if (bulkCount._nimbusValue !== n) {
        bulkCount.textContent = n;
        bulkCount._nimbusValue = n;
        // Count changes with a short vertical tick (crisp, no overshoot).
        N.animate(bulkCount, [{ opacity: 0.4, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: N.ms("--dur-fast") || 150, easing: N.easing.outQuart });
      }
      const total = compute().list.length;
      $("[data-bulk-all-n]").textContent = total;
      $("[data-bulk-all]").hidden = n >= total;
    }
    syncSelectAll();
  }
  function syncSelectAll() {
    const ids = Array.from((state.view === "table" ? rowsEl : cardsEl).children).map((el) => +el.dataset.id).filter(Boolean);
    const on = ids.filter((id) => state.selected.has(id)).length;
    selectAll.checked = ids.length > 0 && on === ids.length;
    selectAll.indeterminate = on > 0 && on < ids.length;
  }
  function clearSelection() {
    Array.from(state.selected).forEach((id) => setSelected(id, false));
    updateBulk();
  }

  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-select]")) {
      const host = e.target.closest("[data-id]");
      setSelected(+host.dataset.id, e.target.checked);
      updateBulk();
    }
  });
  selectAll.addEventListener("change", () => {
    const ids = Array.from(rowsEl.children).map((el) => +el.dataset.id).filter(Boolean);
    ids.forEach((id) => setSelected(id, selectAll.checked));
    updateBulk();
  });
  $("[data-bulk-all]").addEventListener("click", () => {
    compute().list.forEach((c) => setSelected(c.id, true));
    updateBulk();
  });
  $("[data-bulk-clear]").addEventListener("click", clearSelection);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.selected.size && !document.querySelector("dialog[open]") && !e.target.closest("input, textarea")) clearSelection();
  });

  $$("[data-bulk]").forEach((b) => b.addEventListener("click", () => {
    const n = state.selected.size;
    const who = n === 1 ? byId.get([...state.selected][0]).name : `${n} contacts`;
    const kind = b.dataset.bulk;
    if (kind === "email") N.toast(`Drafted an email to ${who} (demo only).`, "success", { title: "Email drafted" });
    if (kind === "tag") N.toast(`Tagged ${who} with "follow-up" (demo only).`, "info", { title: "Tag added" });
    if (kind === "export") {
      N.loading(b, true);
      setTimeout(() => { N.loading(b, false); N.toast(`contacts-${n}.csv is ready to download.`, "success", { title: "Export ready" }); }, 800);
    }
    if (kind === "delete") deleteContacts([...state.selected]);
  }));

  function deleteContacts(ids) {
    ids.forEach((id) => {
      const i = contacts.findIndex((c) => c.id === id);
      if (i >= 0) contacts.splice(i, 1);
      byId.delete(id);
      state.selected.delete(id);
      state.pinned.delete(id);
      cardCache.delete(id);
      // Keep the row element until render() animates it out, then drop it.
      const row = rowCache.get(id);
      rowCache.delete(id);
      if (row && state.view !== "table") row.remove();
    });
    updateBulk();
    render();
    updateTotals();
    N.toast(`${ids.length === 1 ? "1 contact was" : ids.length + " contacts were"} removed (demo only, reload to restore).`, "warning", { title: "Deleted" });
  }

  /* ---------------------------------------------------------------------
     Row / card interaction: open drawer, quick actions, "more" menu
     ------------------------------------------------------------------- */
  const menu = $("[data-row-menu]");
  let menuFor = null;

  function openMenu(btn, id) {
    if (menu.classList.contains("is-open") && menuFor === id) { N.dropdown.close(menu); return; }
    menuFor = id;
    const r = btn.getBoundingClientRect();
    Object.assign(menu.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    menu.classList.toggle("is-up", r.bottom + 220 > innerHeight);
    menu.querySelector("[data-menu-vip-label]").textContent = byId.get(id).status === "vip" ? "Remove VIP" : "Mark as VIP";
    $$(".is-menu-open").forEach((el) => el.classList.remove("is-menu-open"));
    btn.closest("[data-id]").classList.add("is-menu-open");
    N.dropdown.open(menu);
  }
  menu.addEventListener("nimbus:dropdown", (e) => { if (!e.detail.open) $$(".is-menu-open").forEach((el) => el.classList.remove("is-menu-open")); });
  window.addEventListener("scroll", () => N.dropdown.close(menu), { passive: true, capture: true });

  menu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-menu]");
    if (!item || menuFor == null) return;
    const c = byId.get(menuFor);
    if (!c) return;
    const kind = item.dataset.menu;
    if (kind === "view") openDrawer(c.id, (state.view === "table" ? rowCache : cardCache).get(c.id));
    if (kind === "copy") {
      (navigator.clipboard ? navigator.clipboard.writeText(c.email) : Promise.reject()).catch(() => {});
      N.toast(c.email, "success", { title: "Email copied" });
    }
    if (kind === "vip") setStatus(c, c.status === "vip" ? "active" : "vip");
    if (kind === "delete") deleteContacts([c.id]);
  });

  function setStatus(c, status) {
    c.status = status;
    [rowCache.get(c.id), cardCache.get(c.id)].forEach((el) => {
      if (!el) return;
      const slot = el.querySelector("[data-badge-slot]");
      slot.innerHTML = badge(c);
      N.animate(slot.firstElementChild, [{ opacity: 0 }, { opacity: 1 }], { duration: N.ms("--dur-base") || 250 });
    });
    N.toast(`${c.name} is now ${STATUS_LABEL[status]}.`, "success", { title: "Status updated" });
    updateTotals();
    setTimeout(render, 350); // let the badge fade in before the row (maybe) leaves the filter
  }

  function quickAction(kind, c) {
    if (kind === "email") N.toast(`Composer opened for ${c.email} (demo only).`, "info", { title: `Email ${c.name.split(" ")[0]}` });
    if (kind === "call") N.toast(`Dialing ${c.phone} (demo only).`, "info", { title: `Calling ${c.name.split(" ")[0]}` });
  }

  function onItemClick(e) {
    const host = e.target.closest("[data-id]");
    if (!host || host.classList.contains("ct-skel")) return;
    const id = +host.dataset.id;
    const c = byId.get(id);
    if (!c) return;
    const act = e.target.closest("[data-action]");
    if (act) {
      // stopPropagation: the global outside-click handler would close the menu we just opened.
      if (act.dataset.action === "more") { e.stopPropagation(); openMenu(act, id); }
      else quickAction(act.dataset.action, c);
      return;
    }
    if (e.target.closest(".ct-check")) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) { setSelected(id, !state.selected.has(id)); updateBulk(); return; }
    openDrawer(id, host);
  }
  rowsEl.addEventListener("click", onItemClick);
  cardsEl.addEventListener("click", onItemClick);
  [rowsEl, cardsEl].forEach((el) => el.addEventListener("keydown", (e) => {
    const host = e.target.closest("[data-id]");
    if (!host || e.target !== host) return;
    if (e.key === "Enter") { e.preventDefault(); openDrawer(+host.dataset.id, host); }
    if (e.key === " ") { e.preventDefault(); const id = +host.dataset.id; setSelected(id, !state.selected.has(id)); updateBulk(); }
  }));

  /* ---------------------------------------------------------------------
     DETAIL VIEW: full-screen contact page (a <dialog>, so focus is trapped
     and Esc closes). It expands out of the clicked row/card with a
     short fade-in, then its sections fade up in sequence.
     ------------------------------------------------------------------- */
  const drawer = $("#contact-drawer");
  const drawerPanel = drawer.querySelector(".modal-panel");
  const drawerBody = $("[data-drawer-body]");
  let drawerId = null;
  let drawerChart = null;
  const basePath = location.pathname.replace(/\d+\/?$/, "");


  /** Invented, deterministic per-contact details for the detail view. */
  function detailsFor(c) {
    const r = rng(c.id);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const boost = { vip: 3.2, active: 1.6, lead: 0.6, inactive: 0.35 }[c.status];
    const weeks = Array.from({ length: 12 }, (_, i) => Math.max(0, Math.round((r() * 6 + (i / 11) * 4 * (c.status === "inactive" ? -0.6 : 1)) * boost)));
    const lastHalf = weeks.slice(6).reduce((a, b) => a + b, 0), firstHalf = weeks.slice(0, 6).reduce((a, b) => a + b, 0) || 1;
    const member = () => pick(team);
    const first = c.name.split(" ")[0];
    const events = [];
    let t = new Date(c.last || c.created).getTime();
    const created = new Date(c.created).getTime();
    const templates = [
      () => ({ kind: "email", html: `<strong>${esc(member().name)}</strong> emailed ${esc(first)} the <strong>${pick(["Q4 proposal", "renewal options", "onboarding guide", "pricing sheet"])}</strong>` }),
      () => ({ kind: "call", html: `Call with <strong>${esc(member().name)}</strong> · ${8 + Math.floor(r() * 40)} min` }),
      () => ({ kind: "meeting", html: `<strong>${pick(["Product demo", "Quarterly review", "Kickoff workshop", "Discovery call"])}</strong> scheduled` }),
      () => ({ kind: "deal", html: `Deal moved to <strong>${pick(["Proposal", "Negotiation", "Closed won", "Qualified"])}</strong> · <strong>${money(2000 + Math.round(r() * 40) * 500)}</strong>` }),
      () => ({ kind: "note", html: `<strong>${esc(member().name)}</strong> added a note` }),
    ];
    for (let i = 0; i < 5 && t > created; i++) {
      events.push(Object.assign(pick(templates)(), { time: new Date(t).toISOString() }));
      t -= (1 + r() * 9) * 86400000;
    }
    events.push({ kind: "created", html: `Contact created by <strong>${esc(member().name)}</strong>`, time: c.created });
    return {
      value: Math.round((800 + r() * 9000) * boost) * 5,
      emails: Math.round((4 + r() * 30) * Math.sqrt(boost)),
      meetings: Math.round((1 + r() * 8) * Math.sqrt(boost)),
      weeks,
      total: weeks.reduce((a, b) => a + b, 0),
      trend: ((lastHalf - firstHalf) / firstHalf) * 100,
      events,
      owner: team[c.id % team.length],
    };
  }

  function drawerHTML(c, d) {
    const panel = (title, body, extra = "") => `<section class="ct-dw-sec ct-dt-panel ${extra}"><h4 class="ct-dw-h">${title}</h4>${body}</section>`;
    return `
      <header class="ct-dw-sec ct-dt-head">
        <span class="avatar avatar--xl ct-avatar">${esc(c.initials)}</span>
        <div class="grow">
          <h2 id="ct-dw-name">${esc(c.name)}</h2>
          <p class="ct-dt-role">${esc(c.role)} at <strong>${esc(c.company)}</strong></p>
          <div class="ct-dt-meta">${badge(c)}<span>${esc(c.city)}</span><span>Last touch ${ago(c.last).toLowerCase()}</span></div>
        </div>
      </header>

      <div class="ct-dt-grid">
        <div class="ct-dt-main">
          <section class="ct-dw-sec ct-dt-stats">
            <div class="ct-dt-stat"><span>Contract value</span><strong class="num" data-dw-count="${d.value}" data-prefix="$">$0</strong></div>
            <div class="ct-dt-stat"><span>Emails</span><strong class="num" data-dw-count="${d.emails}">0</strong></div>
            <div class="ct-dt-stat"><span>Meetings</span><strong class="num" data-dw-count="${d.meetings}">0</strong></div>
            <div class="ct-dt-stat"><span>Touchpoints, 12 wk</span><strong class="num" data-dw-count="${d.total}">0</strong></div>
          </section>

          <section class="ct-dw-sec ct-dt-panel">
            <div class="row-between">
              <div><h4 class="ct-dw-h">Engagement</h4><p class="ct-none">Touchpoints per week, last 12 weeks</p></div>
            </div>
            <div class="chart-box ct-dw-chart" style="--h: 200px"><canvas aria-label="Weekly engagement chart" role="img"></canvas></div>
          </section>

          ${panel("Recent activity", `<ol class="ct-timeline">${d.events.map((ev) => `
              <li><time datetime="${ev.time}" title="${fmtDate.format(new Date(ev.time))}">${ago(ev.time)}</time><span>${ev.html}</span></li>`).join("")}</ol>`)}
        </div>

        <aside class="ct-dt-side">
          ${panel("Details", `<dl class="ct-dw-dl">
              <dt>Email</dt><dd><a href="mailto:${esc(c.email)}" class="truncate">${esc(c.email)}</a></dd>
              <dt>Phone</dt><dd class="num">${esc(c.phone)}</dd>
              <dt>City</dt><dd>${esc(c.city)}</dd>
              <dt>Customer since</dt><dd>${fmtDate.format(new Date(c.created))}</dd>
              <dt>Owner</dt><dd class="row" style="--gap: 8px"><span class="avatar avatar--xs ct-avatar">${esc(d.owner.initials)}</span>${esc(d.owner.name)}</dd>
            </dl>`)}
          ${panel("Tags", c.tags.length ? `<p class="ct-dt-note">${esc(c.tags.join(", "))}</p>` : '<p class="ct-none">No tags yet</p>')}
          ${panel("Notes", c.notes ? `<p class="ct-dt-note">${esc(c.notes)}</p>` : '<p class="ct-none">No notes yet.</p>')}
        </aside>
      </div>`;
  }

  function fillDrawer(c, delay) {
    drawerId = c.id;
    if (drawerChart) { drawerChart.destroy(); drawerChart = null; }
    const d = detailsFor(c);
    drawerBody.innerHTML = drawerHTML(c, d);
    drawerBody.scrollTop = 0;

    // Sections cascade in (fast, short travel) once the view has opened.
    staggerIn($$(".ct-dw-sec", drawerBody), { y: 8, step: 35, delay });
    $$("[data-dw-count]", drawerBody).forEach((el, i) => {
      el._nimbusValue = 0;
      setTimeout(() => N.countTo(el, +el.dataset.dwCount), delay + 80 + i * 50);
    });
    // Engagement bars: single accent, this week emphasised.
    const canvas = $(".ct-dw-chart canvas", drawerBody);
    setTimeout(() => {
      if (!canvas.isConnected) return;
      N.charts.create(canvas, (t) => ({
        type: "bar",
        data: {
          labels: d.weeks.map((_, i) => (i === 11 ? "This week" : `${11 - i} weeks ago`)),
          datasets: [{
            data: d.weeks,
            backgroundColor: d.weeks.map((_, i) => (i === 11 ? t.primary : N.charts.alpha(t.subtle, 0.35))),
            hoverBackgroundColor: t.primary,
            borderRadius: 2, borderSkipped: false, barPercentage: 0.6, categoryPercentage: 0.9,
          }],
        },
        options: N.charts.options(t, {
          animation: N.charts.drawIn("bar", d.weeks.length),
          scales: { x: { grid: { display: false }, ticks: { callback: (v, i) => (i === 11 ? "Now" : i % 3 === 0 ? `-${11 - i}w` : "") } }, y: { beginAtZero: true, ticks: { maxTicksLimit: 4 } } },
          plugins: { tooltip: { callbacks: { label: (item) => ` ${item.parsed.y} touchpoints` } } },
        }),
      }), { lazy: false }).then((chart) => {
        if (canvas.isConnected) drawerChart = chart; else chart.destroy();
      });
    }, delay + 120);

    const list = compute().list;
    const idx = list.findIndex((x) => x.id === c.id);
    $("[data-drawer-pos]").textContent = idx >= 0 ? `${idx + 1} of ${list.length}` : "";
    $$("[data-drawer-step]").forEach((b) => {
      const step = +b.dataset.drawerStep;
      b.disabled = idx < 0 || !list[idx + step];
    });
    history.replaceState(null, "", `${basePath}${c.id}/${location.search}`);
    $$(".is-open-in-drawer").forEach((el) => el.classList.remove("is-open-in-drawer"));
    [rowCache.get(c.id), cardCache.get(c.id)].forEach((el) => el && el.classList.add("is-open-in-drawer"));
  }

  /** Open the full-screen detail panel (origin kept for API compatibility). */
  function animateOpen(origin) {
    // Short fade + 8px rise; no clip-path expansion (calm, businesslike).
    N.animate(drawerPanel, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
      { duration: N.ms("--dur-base") || 250, easing: N.easing.outQuart });
  }

  function openDrawer(id, origin) {
    const c = byId.get(id);
    if (!c) return;
    const wasOpen = drawer.open;
    fillDrawer(c, wasOpen ? 0 : 120);
    if (!wasOpen) {
      N.drawer.open(drawer);
      animateOpen(origin);
    }
  }

  async function stepDrawer(step) {
    const list = compute().list;
    const idx = list.findIndex((x) => x.id === drawerId);
    const next = list[idx + step];
    if (!next) return;
    // Old content fades out in the direction of travel, new content cascades in.
    await N.animate(drawerBody, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(${-8 * step}px)` }],
      { duration: N.ms("--dur-fast") || 150, easing: N.easing.in }).finished.catch(() => {});
    fillDrawer(next, 0);
    const row = (state.view === "table" ? rowCache : cardCache).get(next.id);
    if (row && row.isConnected) row.scrollIntoView({ block: "nearest" });
  }
  $$("[data-drawer-step]").forEach((b) => b.addEventListener("click", () => stepDrawer(+b.dataset.drawerStep)));
  drawer.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); stepDrawer(1); }
    if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); stepDrawer(-1); }
  });
  drawer.addEventListener("nimbus:modal", (e) => {
    if (e.target !== drawer || e.detail.open) return;
    history.replaceState(null, "", `${basePath}${location.search}`);
    $$(".is-open-in-drawer").forEach((el) => el.classList.remove("is-open-in-drawer"));
    if (drawerChart) { drawerChart.destroy(); drawerChart = null; }
    drawerId = null;
  });
  $$("[data-drawer-action]").forEach((b) => b.addEventListener("click", () => {
    const c = byId.get(drawerId);
    if (!c) return;
    const kind = b.dataset.drawerAction;
    if (kind === "delete") { N.drawer.close(drawer); deleteContacts([c.id]); return; }
    quickAction(kind, c);
  }));

  /* ---------------------------------------------------------------------
     Add contact modal: inline validation (red border + message slides
     in), then the new contact fades into the top of the list.
     ------------------------------------------------------------------- */
  const form = $("[data-add-form]");
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function fieldError(name, on) {
    const input = form.elements[name];
    const msg = form.querySelector(`[data-error-for="${name}"]`);
    input.classList.toggle("is-invalid", on);
    input.setAttribute("aria-invalid", on ? "true" : "false");
    msg.classList.toggle("is-visible", on);
  }
  ["name", "email"].forEach((n) => form.elements[n].addEventListener("input", () => {
    if (form.elements[n].classList.contains("is-invalid")) fieldError(n, false);
  }));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    const name = f.name.value.trim().replace(/\s+/g, " ");
    const email = f.email.value.trim();
    const badName = !name;
    const badEmail = !EMAIL_RE.test(email);
    fieldError("name", badName);
    fieldError("email", badEmail);
    if (badName || badEmail) { (badName ? f.name : f.email).focus(); return; }

    const submit = form.querySelector('[type="submit"]');
    N.loading(submit, true);
    setTimeout(() => {
      N.loading(submit, false);
      N.modal.close("add-contact-modal");
      addContact({
        id: Math.max(0, ...contacts.map((c) => c.id), ...[...rowCache.keys()]) + 1,
        name, email,
        initials: name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase(),
        company: f.company.value.trim() || "Independent",
        role: f.role.value.trim() || "Contact",
        status: f.status.value, color: "slate",
        city: "Remote", notes: "", phone: "+1 555 000 0000",
        tags: f.tags.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6),
        created: new Date().toISOString(), last: null,
      });
      form.reset();
    }, 450);
  });
  $("#add-contact-modal").addEventListener("nimbus:modal", (e) => {
    if (e.detail.open) return;
    fieldError("name", false);
    fieldError("email", false);
  });

  function addContact(c) {
    contacts.unshift(c);
    byId.set(c.id, c);
    state.pinned.add(c.id);
    // Make sure the new contact is actually visible.
    if (state.q) { search.value = ""; searchWrap.classList.remove("has-value"); state.q = ""; }
    state.limit = Math.max(state.limit, PAGE);
    if (state.status !== "all" && state.status !== c.status) N.selectTab(statusTabs, "all");
    else render();
    updateTotals();

    const el = (state.view === "table" ? rowEl : cardEl)(c);
    setTimeout(() => {
      el.classList.add("is-new");
      el.addEventListener("animationend", () => el.classList.remove("is-new"), { once: true });
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > innerHeight) el.scrollIntoView({ block: "center", behavior: N.reducedMotion ? "auto" : "smooth" });
    }, 60);
    N.toast(`${c.name} was added to your contacts.`, "success", { title: "Contact added" });
  }

  /* ---------------------------------------------------------------------
     Export (toolbar)
     ------------------------------------------------------------------- */
  const exportBtn = $("[data-export]");
  exportBtn.addEventListener("click", () => {
    N.loading(exportBtn, true);
    setTimeout(() => {
      N.loading(exportBtn, false);
      N.toast(`contacts.csv (${contacts.length} rows) is ready to download.`, "success", { title: "Contacts exported" });
    }, 900);
  });

  /* ---------------------------------------------------------------------
     First paint: render instantly, then cascade rows in with the card.
     ------------------------------------------------------------------- */
  setSort("name", 1, true);
  render({ instant: true });
  N.onVisible(card, () => staggerIn(Array.from(rowsEl.children), { y: 8, step: 30, delay: N.revealDelay(card) + 140 }));

  if (openOnLoad && byId.has(openOnLoad)) setTimeout(() => openDrawer(openOnLoad), 350);
})();
