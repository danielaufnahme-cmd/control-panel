/* ==========================================================================
   PROJECTS PAGE
     * board + list rendered from the projects-data json_script
     * pointer-based drag & drop between status columns (mouse + long-press touch):
       lift (shadow only), cards part to open a gap (FLIP), settle into
       the gap on drop, glide back on cancel, edge auto-scroll
     * filter chips: leaving cards fade out, the rest FLIP to their new spots
     * detail drawer: budget ring, progress, status switch, milestone checklist
   Everything is client-side only (demo).
   ========================================================================== */
(function () {
  "use strict";
  const N = window.Nimbus;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const readJSON = (id) => JSON.parse(document.getElementById(id).textContent);

  const projects = readJSON("projects-data");
  const statusLabel = Object.fromEntries(readJSON("project-statuses"));
  const byId = new Map(projects.map((p) => [p.id, p]));
  const refs = new Map(); // id -> { card, row }

  /* ---- helpers ------------------------------------------------------- */
  const iconTpl = document.getElementById("pj-icons").content;
  const icon = (name) => { const i = iconTpl.querySelector(`[data-i="${name}"]`); return i ? i.innerHTML : ""; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmtDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const fmtLong = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
  const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
  const moneyCompact = (v) => "$" + compactFmt.format(v);
  const date = (iso) => new Date(iso + "T00:00:00");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** Subtle "value changed" cue: quick fade/slide, no overshoot. */
  function tick(el) {
    N.animate(el, [{ opacity: 0.35, transform: "translateY(-2px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: N.easing.outQuart });
  }

  /** Due state as plain text (no icons, no bold). Urgent states only change the grey tone. */
  function dueInfo(p) {
    if (p.status === "done") return { cls: "pj-meta--done", text: "Done" };
    if (p.days_left < 0) return { cls: "pj-meta--late", text: "Overdue" };
    if (p.days_left <= 14) return { cls: "pj-meta--warn", text: p.days_left === 0 ? "Due today" : p.days_left === 1 ? "1 day left" : p.days_left + " days left" };
    return { cls: "", text: "Due " + fmtDay.format(date(p.due)) };
  }
  function avatars(p, size = "xs", max = 4) {
    const shown = p.members.slice(0, max).map((m) =>
      `<span class="avatar avatar--${size}" title="${esc(m.name)}">${esc(m.initials)}</span>`).join("");
    const more = p.members.length > max ? `<span class="avatar avatar--${size} pj-more">+${p.members.length - max}</span>` : "";
    return `<span class="avatar-stack">${shown}${more}</span>`;
  }

  /* ---- rendering ------------------------------------------------------ */
  function cardHTML(p) {
    const due = dueInfo(p);
    return `<article class="pj-card" tabindex="0" role="button" data-id="${p.id}"
        aria-label="${esc(p.name)} for ${esc(p.client)}. Open details, or drag to another column.">
      <span class="pj-card__name">${esc(p.name)}</span>
      <span class="pj-card__client truncate">${esc(p.client)}</span>
      <div class="pj-card__progress">
        <div class="progress progress--sm" data-progress="${p.progress}"><div class="progress-bar"></div></div>
        <span class="num" data-pct data-countup="${p.progress}" data-suffix="%" data-decimals="1">${p.progress.toFixed(1)}%</span>
      </div>
      <div class="pj-card__foot">
        <span class="pj-meta ${due.cls}" data-due>${due.text}</span>
        <span class="pj-card__budget num" title="Budget">${moneyCompact(p.budget)}</span>
      </div>
    </article>`;
  }
  function rowHTML(p) {
    const due = dueInfo(p);
    return `<tr data-id="${p.id}" tabindex="0">
      <td><div class="list-item__title truncate">${esc(p.name)}</div><div class="list-item__meta truncate">${esc(p.client)}</div></td>
      <td><span class="pj-status pj-status--${p.status}" data-status-badge>${statusLabel[p.status]}</span></td>
      <td><div class="pj-row-progress">
        <div class="progress progress--sm" data-progress="${p.progress}"><div class="progress-bar"></div></div>
        <span class="num" data-pct data-countup="${p.progress}" data-suffix="%" data-decimals="1">${p.progress.toFixed(1)}%</span>
      </div></td>
      <td><span class="pj-meta ${due.cls}" data-due>${fmtDay.format(date(p.due))}</span></td>
      <td class="pj-budget-cell num"><span>${money(p.budget)}</span><small>${money(p.spent)} spent</small></td>
      <td>${avatars(p, "sm", 4)}</td>
    </tr>`;
  }
  const toEl = (html, tag = "div") => { const t = document.createElement(tag === "tr" ? "tbody" : "div"); t.innerHTML = html.trim(); return t.firstElementChild; };

  const board = $("[data-board]");
  const tbody = $("[data-project-rows]");
  const columns = new Map($$("[data-column]", board).map((c) => [c.dataset.column, c]));
  const listOf = (status) => $("[data-column-list]", columns.get(status));
  const allLists = () => [...Array.from(columns.values()).map((c) => $("[data-column-list]", c)), tbody];

  projects.forEach((p) => {
    const card = toEl(cardHTML(p));
    const row = toEl(rowHTML(p), "tr");
    listOf(p.status).appendChild(card);
    tbody.appendChild(row);
    refs.set(p.id, { card, row });
  });

  /** After a [data-stagger] group has played its entrance once, drop the attribute so
   *  children that are later hidden/re-shown or moved don't replay the reveal animation.
   *  (Generic: a candidate for motion.js, e.g. data-stagger-once.) */
  function settleStagger(group) {
    let t;
    group.addEventListener("animationend", (e) => {
      if (e.target.parentElement !== group || !e.animationName.startsWith("nimbus-")) return;
      clearTimeout(t);
      t = setTimeout(() => group.removeAttribute("data-stagger"), 120);
    });
  }
  allLists().forEach(settleStagger);

  /* ---- counts, stats --------------------------------------------------- */
  const statValues = $$("[data-project-stats] .pj-stat__value");
  function updateColumnCounts(animate) {
    columns.forEach((col) => {
      const n = $$(".pj-card", col).filter((c) => !c.hidden).length;
      const el = $("[data-column-count]", col);
      if (animate && el.textContent !== String(n)) { el.textContent = n; tick(el); }
      else el.textContent = n;
      col.classList.toggle("is-empty", n === 0);
    });
  }
  function updateStats() {
    const active = projects.filter((p) => p.status === "active").length;
    const open = projects.filter((p) => p.status !== "done");
    const avg = open.length ? Math.round((open.reduce((a, p) => a + p.progress, 0) / open.length) * 10) / 10 : 0;
    const budget = projects.reduce((a, p) => a + p.budget, 0);
    const spent = projects.reduce((a, p) => a + p.spent, 0);
    const targets = [active, Math.round(budget), budget ? Math.round((spent / budget) * 1000) / 10 : 0, avg];
    statValues.forEach((el, i) => {
      if (el._nimbusValue != null && el._nimbusValue !== targets[i] && targets[i] != null) N.countTo(el, targets[i], { duration: 500 });
    });
  }
  updateColumnCounts(false);

  /* Update every view of a project's progress (card, row, drawer). */
  function renderProgress(p) {
    const { card, row } = refs.get(p.id);
    [card, row].forEach((el) => {
      N.setProgress($(".progress", el), p.progress);
      N.countTo($("[data-pct]", el), p.progress, { duration: 450 });
    });
  }
  function renderDue(p) {
    const { card, row } = refs.get(p.id);
    const due = dueInfo(p);
    const c = $("[data-due]", card);
    c.className = "pj-meta " + due.cls;
    c.textContent = due.text;
    $("[data-due]", row).className = "pj-meta " + due.cls;
  }

  /* ---- filters (chips) --------------------------------------------------- */
  const filters = {
    all: () => true,
    mine: (p) => p.mine,
    soon: (p) => p.status !== "done" && p.days_left >= 0 && p.days_left <= 60,
    large: (p) => p.budget > 75000,
  };
  let currentFilter = "all";
  const chipWrap = $("[data-project-filters]");
  const setFilterCounts = () => Object.keys(filters).forEach((k) => {
    const el = $(`[data-filter-count="${k}"]`, chipWrap);
    if (el) el.textContent = projects.filter(filters[k]).length;
  });
  setFilterCounts();

  /** Run Nimbus.flip over several containers at once (measure all -> mutate once -> animate all). */
  const flipAll = (containers, mutate, opts) => containers.reduceRight((fn, c) => () => N.flip(c, fn, opts), mutate)();

  function applyFilter(key) {
    currentFilter = key;
    const match = filters[key];
    const leaving = [];
    projects.forEach((p) => {
      const { card, row } = refs.get(p.id);
      if (!match(p)) [card, row].forEach((el) => { if (!el.hidden) leaving.push(el); });
    });
    // 1) quick exit for items that are filtered out (exits are faster than enters)
    const exitMs = N.ms("--dur-fast");
    leaving.forEach((el) => N.animate(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96)" }], { duration: exitMs, easing: N.easing.in, fill: "forwards" }));
    // 2) then hide/show and let the survivors glide (FLIP)
    setTimeout(() => {
      flipAll(allLists(), () => {
        projects.forEach((p) => {
          const { card, row } = refs.get(p.id);
          const hide = !match(p);
          [card, row].forEach((el) => { el.hidden = hide; el.getAnimations().forEach((a) => a.cancel()); });
        });
        updateColumnCounts(true);
        $("[data-no-results]").hidden = projects.some(match);
      });
    }, leaving.length ? exitMs : 0);
  }
  chipWrap.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter]");
    if (!chip || chip.classList.contains("is-active")) return;
    $$("[data-filter]", chipWrap).forEach((c) => { const on = c === chip; c.classList.toggle("is-active", on); c.setAttribute("aria-pressed", on); });
    applyFilter(chip.dataset.filter);
  });

  /* ---- status changes (drag drop, drawer switch) ------------------------ */
  function setStatus(p, status, { toast = true } = {}) {
    if (p.status === status) return;
    const from = p.status;
    p.status = status;
    const { row } = refs.get(p.id);
    const badge = $("[data-status-badge]", row);
    badge.className = "pj-status pj-status--" + status;
    badge.textContent = statusLabel[status];
    if (status === "done" && p.progress < 100) {
      p.progress = 100;
      p.milestones.forEach((m) => (m.done = true));
      renderProgress(p);
    }
    renderDue(p);
    updateStats();
    if (toast) {
      N.toast(`Moved from ${statusLabel[from]} to ${statusLabel[status]}.`, status === "done" ? "success" : "info", { title: p.name });
    }
  }

  /* ---------------------------------------------------------------------
     DRAG & DROP  (pointer events; works with mouse, pen and touch)
     Mouse: drag after 4px of movement.  Touch: long-press (250ms) first,
     so normal swipes still scroll the board.

     How it moves (transform/opacity only, no layout animation):
       * lift:   the card is lifted into a fixed layer and follows the pointer
                 1:1 via `translate` (set straight from pointermove). Only a
                 soft shadow (::after opacity) fades in: no scale, no tilt.
       * gap:    an empty slot the card's height marks the drop position.
                 When it moves, the other cards glide out of the way (FLIP,
                 200ms ease-out). Interrupted glides restart from where the
                 card visually is, so fast drags never jump.
       * target: the column under the card gets a subtle highlight.
       * drop:   the card settles into the gap (200ms ease-out); Esc or a
                 pointercancel glides it back to where it came from.
       * edges:  near the board's left/right edge it auto-scrolls, faster the
                 closer you get; same for the window's top/bottom edge.
     ------------------------------------------------------------------- */
  const boardWrap = $("[data-board-wrap]");
  const MOVE_MS = 200;
  const ease = N.easing.outQuart;          // cubic-bezier(.25,1,.5,1): soft ease-out, no overshoot
  const layer = document.createElement("div");
  layer.className = "pj-drag-layer";
  document.body.appendChild(layer);

  let drag = null;
  let suppressClick = false;

  /** FLIP every child of `lists` across a DOM mutation. Visual positions are read
   *  BEFORE cancelling running glides, so a new glide starts exactly where the
   *  previous one was (no snapping when the gap moves several times quickly). */
  function flipLists(lists, mutate, ms = MOVE_MS) {
    const items = lists.flatMap((l) => Array.from(l.children)).filter((c) => !c.hidden);
    const before = new Map(items.map((c) => [c, c.getBoundingClientRect()]));
    items.forEach((c) => { if (c._pjGlide) { c._pjGlide.cancel(); c._pjGlide = null; } });
    mutate();
    items.forEach((c) => {
      if (!c.isConnected || c.hidden || c.classList.contains("pj-placeholder")) return;
      const a = before.get(c), b = c.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      c._pjGlide = N.animate(c, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: ms, easing: ease });
      c._pjGlide.onfinish = () => { c._pjGlide = null; };
    });
  }

  /** Move the gap to (list, before). The gap itself never travels: it simply
   *  appears at its new place (fading in) while the cards around it glide. */
  function placeGap(list, before) {
    const ph = drag.ph, from = ph.parentElement;
    flipLists(from === list ? [list] : [from, list], () => list.insertBefore(ph, before));
    if (from !== list) N.animate(ph, [{ opacity: 0 }, { opacity: 1 }], { duration: MOVE_MS, easing: ease });
    updateEmptyDuringDrag();
  }

  board.addEventListener("pointerdown", (e) => {
    const card = e.target.closest(".pj-card");
    if (!card || e.button !== 0 || drag) return;
    const touch = e.pointerType === "touch";
    const start = { x: e.clientX, y: e.clientY };
    let last = e, timer = null;

    const onMove = (ev) => {
      last = ev;
      if (drag && drag.card === card) return moveDrag(ev);
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (!touch && dist > 4) beginDrag(card, start, ev);
      else if (touch && dist > 10) cleanup(); // it's a scroll, not a drag
    };
    const onUp = (ev) => {
      cleanup();
      if (drag && drag.card === card && !drag.settling) endDrag(ev.type === "pointercancel");
    };
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    if (touch) {
      timer = setTimeout(() => {
        try { navigator.vibrate && navigator.vibrate(8); } catch (err) { /* ignore */ }
        beginDrag(card, start, last);
      }, 250);
    }
  });
  // While dragging on touch, stop the page from scrolling.
  document.addEventListener("touchmove", (e) => { if (drag && !drag.settling) e.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drag && !drag.settling) { e.preventDefault(); e.stopPropagation(); endDrag(true); }
  }, true);

  function beginDrag(card, start, ev) {
    if (card._pjGlide) { card._pjGlide.cancel(); card._pjGlide = null; }
    card.getAnimations().forEach((a) => a.cancel());
    const rect = card.getBoundingClientRect();
    const list = card.parentElement;
    const ph = document.createElement("div");
    ph.className = "pj-placeholder";
    ph.style.height = rect.height + "px";
    list.insertBefore(ph, card);   // same size, same spot: nothing around it moves
    drag = {
      card, ph, w: rect.width, h: rect.height,
      offX: start.x - rect.left, offY: start.y - rect.top,
      px: ev.clientX, py: ev.clientY,
      origin: { list, next: card.nextElementSibling },
      col: card.closest("[data-column]"),
      raf: 0,
    };
    card.style.width = rect.width + "px";
    card.style.translate = `${rect.left}px ${rect.top}px`;
    card.classList.add("is-placed", "is-dragging");
    layer.appendChild(card);
    document.documentElement.classList.add("pj-is-dragging");
    drag.col.classList.add("is-over");
    void card.offsetWidth;                 // commit the start state, then lift
    card.classList.add("is-lifted");
    moveDrag(ev);
    drag.raf = requestAnimationFrame(frame);
  }

  function moveDrag(ev) {
    const d = drag;
    d.px = ev.clientX; d.py = ev.clientY;
    d.card.style.translate = `${d.px - d.offX}px ${d.py - d.offY}px`;   // 1:1 with the pointer
  }

  /** Per-frame work: edge auto-scroll, drop-target hit test. */
  function frame() {
    const d = drag;
    if (!d || d.settling) return;
    // Edge auto-scroll: speed ramps up (quadratically) inside a 72px zone.
    const ZONE = 72, MAX = 16;
    const ramp = (dist) => Math.round(MAX * Math.pow(clamp(1 - dist / ZONE, 0, 1), 2));
    const br = board.getBoundingClientRect();
    if (board.scrollWidth > board.clientWidth) {
      const right = ramp(br.right - d.px), left = ramp(d.px - br.left);
      if (right) board.scrollLeft += right; else if (left) board.scrollLeft -= left;
    }
    const down = ramp(innerHeight - d.py), up = ramp(d.py - 80);
    if (down) window.scrollBy(0, down); else if (up && scrollY > 0) window.scrollBy(0, -up);

    hitTest();
    d.raf = requestAnimationFrame(frame);
  }

  function hitTest() {
    const d = drag;
    // Column: the one horizontally under the pointer (gaps count to the nearest one).
    let col = null, best = Infinity;
    columns.forEach((c) => {
      const r = c.getBoundingClientRect();
      const dist = d.px < r.left ? r.left - d.px : d.px > r.right ? d.px - r.right : 0;
      if (dist < best) { best = dist; col = c; }
    });
    if (!col || best > 40) return;
    if (col !== d.col) {
      d.col.classList.remove("is-over");
      col.classList.add("is-over");
      d.col = col;
    }
    // Slot: compare the dragged card's centre with each card's LAYOUT centre
    // (offsetTop ignores running glides, so the target never flickers).
    const list = $("[data-column-list]", col);
    const cy = d.py - d.offY + d.h / 2;
    const top = col.getBoundingClientRect().top + col.clientTop;
    const cards = Array.from(list.children).filter((c) => c.classList.contains("pj-card") && !c.hidden);
    const before = cards.find((c) => cy < top + c.offsetTop + c.offsetHeight / 2) || null;
    const ph = d.ph;
    if (ph.parentElement === list) {
      let next = ph.nextElementSibling;
      while (next && (next.hidden || !next.classList.contains("pj-card"))) next = next.nextElementSibling;
      if (next === before) return;
    }
    placeGap(list, before);
  }

  function updateEmptyDuringDrag() {
    columns.forEach((col) => {
      const n = $$(".pj-card, .pj-placeholder", col).filter((c) => !c.hidden).length;
      col.classList.toggle("is-empty", n === 0);
    });
  }

  function endDrag(cancel) {
    const d = drag;
    d.settling = true;
    cancelAnimationFrame(d.raf);
    if (cancel) {
      const o = d.origin;
      const next = o.next && o.next.parentElement === o.list ? o.next : null;
      if (d.ph.parentElement !== o.list || d.ph.nextElementSibling !== next) placeGap(o.list, next);
    }
    columns.forEach((c) => c.classList.remove("is-over"));
    const target = d.ph.getBoundingClientRect();
    const from = getComputedStyle(d.card);
    const ms = cancel ? 260 : MOVE_MS;
    // Settle: glide into the gap while the lift shadow fades out.
    d.card.classList.remove("is-lifted");
    d.card.classList.add("is-settling");
    d.card.style.setProperty("--settle", ms + "ms");
    const anim = N.animate(d.card, [
      { translate: from.translate },
      { translate: `${target.left}px ${target.top}px` },
    ], { duration: ms, easing: ease, fill: "forwards" });
    suppressClick = true;
    anim.finished.then(finish, finish);

    function finish() {
      if (d.done) return;
      d.done = true;
      d.ph.replaceWith(d.card);              // same size + position: no layout shift
      anim.cancel();
      d.card.classList.remove("is-dragging", "is-settling");
      d.card.style.width = d.card.style.translate = "";
      d.card.style.removeProperty("--settle");
      document.documentElement.classList.remove("pj-is-dragging");
      drag = null;
      setTimeout(() => { suppressClick = false; }, 0);
      const status = d.card.closest("[data-column]").dataset.column;
      updateColumnCounts(true);
      if (!cancel) setStatus(byId.get(+d.card.dataset.id), status);
    }
  }

  /* ---- board horizontal-scroll affordance (edge fades + thin scrollbar) ---- */
  function updateScrollHints() {
    const max = board.scrollWidth - board.clientWidth;
    boardWrap.classList.toggle("can-left", max > 1 && board.scrollLeft > 1);
    boardWrap.classList.toggle("can-right", max > 1 && board.scrollLeft < max - 1);
  }
  board.addEventListener("scroll", updateScrollHints, { passive: true });
  new ResizeObserver(updateScrollHints).observe(board);
  updateScrollHints();

  /* ---- open details: click / Enter on a card or row ------------------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".pj-card, [data-project-rows] tr");
    if (!el || suppressClick || drag) return;
    openDetail(byId.get(+el.dataset.id));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target.closest && e.target.closest(".pj-card, [data-project-rows] tr");
    if (!el) return;
    e.preventDefault();
    openDetail(byId.get(+el.dataset.id));
  });

  /* ---------------------------------------------------------------------
     DETAIL DRAWER
     ------------------------------------------------------------------- */
  const drawer = document.getElementById("pj-detail");
  const D = (k) => $(`[data-d="${k}"]`, drawer);
  const statusSwitch = $("[data-status-switch]", drawer);
  let current = null;

  function resetBar(progressEl, value) {
    const bar = $(".progress-bar", progressEl);
    bar.style.transition = "none";
    N.setProgress(progressEl, value);
    void bar.offsetWidth;
    bar.style.transition = "";
  }

  function fillMoney(p) {
    const pct = p.budget ? Math.round((p.spent / p.budget) * 1000) / 10 : 0;
    D("budget").textContent = money(p.budget);
    D("spent").textContent = money(p.spent);
    D("remaining").textContent = money(Math.max(0, p.budget - p.spent));
    D("ring").classList.toggle("is-warn", pct >= 85);
    return pct;
  }

  function openDetail(p) {
    if (!p) return;
    current = p;
    D("name").textContent = p.name;
    D("client").textContent = p.client;
    D("desc").textContent = p.description || "No description yet.";
    const dueDate = fmtLong.format(date(p.due));
    // Two short lines (pre-line) instead of one long string that wraps mid-phrase.
    D("due").textContent = p.status === "done" ? `Completed\nDue ${dueDate}`
      : p.days_left < 0 ? `Overdue by ${-p.days_left} ${-p.days_left === 1 ? "day" : "days"}\nDue ${dueDate}`
      : `${p.days_left === 1 ? "1 day" : p.days_left + " days"} left\nDue ${dueDate}`;
    statusSwitch._syncing = true;
    N.selectTab(statusSwitch, p.status);
    statusSwitch._syncing = false;

    // Ring + progress start from 0 and animate in once the drawer has slid in.
    const ring = D("ring");
    ring.classList.add("no-anim");
    ring.style.setProperty("--pct", 0);
    const pct = fillMoney(p);
    const pctEl = D("ring-pct"), progEl = D("progress"), bar = D("progressbar");
    pctEl._nimbusValue = 0; pctEl.textContent = "0.0%";
    progEl._nimbusValue = 0; progEl.textContent = "0.0%";
    resetBar(bar, 0);

    renderMilestones(p);
    renderTeam(p);
    N.modal.open(drawer);
    $(".modal-body", drawer).scrollTop = 0;

    const delay = N.reducedMotion ? 0 : 180;
    setTimeout(() => {
      void ring.offsetWidth;
      ring.classList.remove("no-anim");
      ring.style.setProperty("--pct", Math.min(pct, 100));
      N.countTo(pctEl, pct);
      N.setProgress(bar, p.progress);
      N.countTo(progEl, p.progress);
    }, delay);
  }

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" pathLength="1"/></svg>';

  function renderMilestones(p) {
    const ul = D("milestones");
    ul.innerHTML = p.milestones.map((m, i) => `
      <li><label class="pj-ms">
        <input type="checkbox" data-ms="${i}" ${m.done ? "checked" : ""}>
        <span class="pj-check">${CHECK_SVG}</span>
        <span class="pj-ms__name"><span>${esc(m.name)}</span></span>
        <span class="pj-ms__due">${fmtDay.format(date(m.due))}</span>
      </label></li>`).join("");
    updateMsCount(p);
    // Rows cascade in after the drawer starts sliding.
    Array.from(ul.children).forEach((li, i) =>
      N.animate(li, [{ opacity: 0, transform: "translateX(12px)" }, { opacity: 1, transform: "none" }],
        { duration: N.ms("--dur-base"), delay: 140 + i * 35, fill: "backwards" }));
  }
  function updateMsCount(p) {
    D("ms-count").textContent = `${p.milestones.filter((m) => m.done).length} / ${p.milestones.length} done`;
  }

  function renderTeam(p) {
    D("team").innerHTML = p.members.map((m) => `
      <div class="list-item">
        <span class="avatar avatar--sm">${esc(m.initials)}</span>
        <div class="grow"><div class="list-item__title truncate">${esc(m.name)}</div><div class="list-item__meta truncate">${esc(m.role)}</div></div>
        <span class="text-subtle">${m.online ? "Online" : "Away"}</span>
      </div>`).join("") || '<p class="text-subtle">No one assigned yet.</p>';
  }

  // Checking a milestone: checkbox fill + muted label (CSS) + progress bump everywhere.
  D("milestones").addEventListener("change", (e) => {
    const input = e.target.closest("[data-ms]");
    if (!input || !current) return;
    const p = current;
    const m = p.milestones[+input.dataset.ms];
    m.done = input.checked;
    const doneCount = p.milestones.filter((x) => x.done).length;
    const step = 100 / p.milestones.length;
    p.progress = doneCount === p.milestones.length ? 100 : doneCount === 0 ? 0
      : clamp(Math.round(p.progress + (m.done ? step : -step)), 1, 99);
    updateMsCount(p);
    N.setProgress(D("progressbar"), p.progress);
    N.countTo(D("progress"), p.progress, { duration: 450 });
    renderProgress(p);
    updateStats();
    if (doneCount === p.milestones.length) {
      N.toast("All milestones complete. Progress set to 100.0%.", "success", { title: p.name });
    }
  });

  statusSwitch.addEventListener("nimbus:tabchange", (e) => {
    if (statusSwitch._syncing || !current) return;
    const p = current;
    const status = e.detail.value;
    const { card } = refs.get(p.id);
    const from = card.parentElement, to = listOf(status);
    flipAll([from, to], () => { to.prepend(card); card.classList.add("is-placed"); });
    updateColumnCounts(true);
    setStatus(p, status);
    if (status === "done") { // drawer reflects the auto-complete
      renderMilestones(p);
      N.setProgress(D("progressbar"), 100);
      N.countTo(D("progress"), 100, { duration: 450 });
    }
  });

  // Full-screen toggle: the drawer widens to the whole viewport (content stays centred).
  const expandBtn = $("[data-expand]", drawer);
  expandBtn.addEventListener("click", () => {
    drawer.classList.add("is-toggling");
    clearTimeout(drawer._pjToggleT);
    drawer._pjToggleT = setTimeout(() => drawer.classList.remove("is-toggling"), N.ms("--dur-slow") + 50);
    const on = drawer.classList.toggle("is-wide");
    expandBtn.setAttribute("aria-pressed", on);
    expandBtn.dataset.tooltip = on ? "Exit full screen" : "Full screen";
  });
  drawer.addEventListener("nimbus:modal", (e) => {
    if (!e.detail.open) { drawer.classList.remove("is-wide"); expandBtn.setAttribute("aria-pressed", "false"); }
  });

  const shareBtn = $("[data-share-project]", drawer);
  shareBtn.addEventListener("click", () => {
    N.loading(shareBtn, true);
    setTimeout(() => {
      N.loading(shareBtn, false);
      N.toast(`Status update for ${current.name} sent to ${current.members.length} people.`, "success", { title: "Update shared" });
    }, 800);
  });

  /* ---------------------------------------------------------------------
     NEW PROJECT  (lands at the top of its column with a pop + ring pulse)
     ------------------------------------------------------------------- */
  const newModal = document.getElementById("pj-new-modal");
  const form = $("[data-pj-new-form]", newModal);
  board.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-to]");
    if (!add) return;
    form.elements.status.value = add.dataset.addTo;
    N.modal.open(newModal);
  });
  const me = projects.flatMap((p) => p.members).find((m) => m.name === "Alex Rowan");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.elements.name;
    if (!name.value.trim()) { N.shake(name); name.focus(); N.toast("Give your project a name first.", "error"); return; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dueVal = form.elements.due.value || new Date(today.getTime() + 45 * 864e5).toISOString().slice(0, 10);
    const days = Math.round((date(dueVal) - today) / 864e5);
    const p = {
      id: Math.max(...projects.map((x) => x.id)) + 1,
      name: name.value.trim(), client: form.elements.client.value.trim() || "Internal",
      description: "No description yet.", status: form.elements.status.value,
      progress: 0, color: "slate", due: dueVal, days_left: days,
      budget: parseFloat(form.elements.budget.value) || 25000, spent: 0,
      members: me ? [me] : [], mine: true,
      milestones: ["Kickoff & discovery", "Scope signed off", "Build", "QA pass", "Launch"].map((n, i) => ({
        name: n, done: false, due: new Date(today.getTime() + (i + 1) * 9 * 864e5).toISOString().slice(0, 10) })),
    };
    projects.push(p); byId.set(p.id, p);
    const card = toEl(cardHTML(p)), row = toEl(rowHTML(p), "tr");
    card.classList.add("is-placed");
    refs.set(p.id, { card, row });
    const hide = !filters[currentFilter](p);
    card.hidden = row.hidden = hide;
    N.modal.close(newModal);
    // Wait for the modal exit, then insert so the user sees the card arrive.
    setTimeout(() => {
      const list = listOf(p.status);
      flipAll([list, tbody], () => { list.prepend(card); tbody.prepend(row); });
      N.init(card); N.init(row);
      if (!hide) {
        card.classList.add("is-new");
        setTimeout(() => card.classList.remove("is-new"), 1200);
        card.scrollIntoView({ block: "nearest", inline: "nearest", behavior: N.reducedMotion ? "auto" : "smooth" });
      }
      updateColumnCounts(true);
      setFilterCounts();
      updateStats();
      N.toast(hide ? "Created, but hidden by the current filter." : `Added to ${statusLabel[p.status]}.`, "success", { title: p.name });
    }, N.ms("--dur-fast") + 40);
    form.reset();
  });
})();
