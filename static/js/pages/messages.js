/* ==========================================================================
   MESSAGES PAGE
     * folders with a sliding pill + live counters (sidebar badge too)
     * list renders from messages-data, staggers in, filters with FLIP
     * reading pane slides/crossfades in the direction you move
     * opening marks read: dot scales away, weight eases down, counters tick
     * star: quick subtle scale;  archive/delete: swipe-out + collapse,
       "Undo" toast brings the message back
     * swipe a row (touch or mouse drag) right = archive, left = delete
     * compose modal; refresh "receives" a new message
   Keys: J/K or arrows = next/prev, E = archive, # = delete, S = star, U = unread
   ========================================================================== */
(function () {
  "use strict";
  const N = window.Nimbus;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const readJSON = (id) => JSON.parse(document.getElementById(id).textContent);

  /* ---------------------------------------------------------------------
     CUSTOM SELECT ("xs") on top of the shared dropdown primitive.
     The native <select> stays in the DOM (hidden) as the source of truth:
     it keeps the form name/value and receives real "change" events, so
     existing code keeps working. Everything is event-delegated, so markup
     restored from HTML (e.g. Discard) works without re-wiring.
       open: fade + 4px slide / scale .98, ~160ms ease-out; close ~120ms
       ARIA: trigger aria-haspopup="listbox"; menu role="listbox";
             items role="option" + aria-selected
       keys: ArrowDown/Up/Enter/Space on the trigger opens; in the list
             arrows/Home/End move, Enter/Space picks, Esc/Tab close.
     Option counts: <option data-count="7"> shows a right-aligned muted count.
     NOTE: the same helper lives in messages.js and settings.js; it is a
     candidate for a shared Nimbus.select primitive in motion.js.
     ------------------------------------------------------------------- */
  const XS_CHEVRON = '<svg class="icon xs-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const XS_CHECK = '<svg class="icon xs-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  let xsSeq = 0;
  const xsEsc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  /** Wrap a native <select> in the custom control (idempotent). */
  function xsBuild(sel) {
    if (sel.closest(".xs")) { xsRender(sel.closest(".xs")); return sel.closest(".xs"); }
    const wrap = document.createElement("div");
    wrap.className = "dropdown xs " + (sel.dataset.xsClass || "");
    wrap.setAttribute("data-dropdown", "");
    sel.parentNode.insertBefore(wrap, sel);
    const id = "xs-" + ++xsSeq;
    const label = sel.getAttribute("aria-label") || (sel.id && document.querySelector(`label[for="${sel.id}"]`)?.textContent.trim()) || "";
    wrap.innerHTML = `<button class="xs-trigger" type="button" data-dropdown-trigger aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}"${sel.id ? ` id="${sel.id}-xs"` : ""} aria-label="${xsEsc(label)}"><span class="xs-value truncate"></span>${XS_CHEVRON}</button>
      <div class="dropdown-menu xs-menu" role="listbox" id="${id}" aria-label="${xsEsc(label)}"></div>`;
    wrap.appendChild(sel);
    sel.hidden = true; sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
    // A <label for> pointing at the select now focuses the visible trigger.
    if (sel.id) document.querySelectorAll(`label[for="${sel.id}"]`).forEach((l) => l.setAttribute("for", sel.id + "-xs"));
    xsRender(wrap);
    return wrap;
  }
  /** Rebuild trigger text + options from the native select. */
  function xsRender(wrap) {
    const sel = wrap.querySelector("select");
    const menu = wrap.querySelector(".xs-menu");
    const opts = Array.from(sel.options);
    menu.innerHTML = opts.map((o) => {
      const on = o.value === sel.value;
      const count = o.dataset.count && o.dataset.count !== "0" ? `<span class="xs-count num">${xsEsc(o.dataset.count)}</span>` : "";
      return `<button class="dropdown-item xs-opt${on ? " is-current" : ""}" type="button" role="option" aria-selected="${on}" tabindex="-1" data-value="${xsEsc(o.value)}" data-dropdown-close><span class="xs-opt__label truncate">${xsEsc(o.dataset.label || o.textContent)}</span>${count}${XS_CHECK}</button>`;
    }).join("");
    const cur = sel.selectedOptions[0];
    wrap.querySelector(".xs-value").textContent = cur ? (cur.dataset.label || cur.textContent) : "";
  }
  function xsPick(wrap, value) {
    const sel = wrap.querySelector("select");
    if (sel.value !== value) {
      sel.value = value;
      // Keep the selected *attribute* in step so innerHTML snapshots stay truthful.
      Array.from(sel.options).forEach((o) => o.toggleAttribute("selected", o.value === value));
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    xsRender(wrap);
  }
  const xsOpts = (wrap) => Array.from(wrap.querySelectorAll(".xs-opt"));
  function xsFocusCurrent(wrap) {
    const o = wrap.querySelector(".xs-opt.is-current") || xsOpts(wrap)[0];
    if (o) o.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const opt = e.target.closest(".xs-opt");
    if (!opt) return;
    const wrap = opt.closest(".xs");
    xsPick(wrap, opt.dataset.value);
    wrap.querySelector(".xs-trigger").focus({ preventScroll: true });
  });
  document.addEventListener("nimbus:dropdown", (e) => {
    const wrap = e.target.closest && e.target.closest(".xs");
    if (wrap && e.detail.open) requestAnimationFrame(() => xsFocusCurrent(wrap));
  });
  document.addEventListener("keydown", (e) => {
    const wrap = e.target.closest && e.target.closest(".xs");
    if (!wrap) return;
    if (e.target.classList.contains("xs-trigger")) {
      if (["ArrowDown", "ArrowUp"].includes(e.key) || ((e.key === "Enter" || e.key === " ") && !wrap.classList.contains("is-open"))) {
        e.preventDefault();
        if (!wrap.classList.contains("is-open")) N.dropdown.open(wrap); else xsFocusCurrent(wrap);
      }
      return;
    }
    if (!e.target.classList.contains("xs-opt")) return;
    const all = xsOpts(wrap), i = all.indexOf(e.target);
    const go = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (go !== undefined) { e.preventDefault(); all[Math.max(0, Math.min(all.length - 1, go))].focus(); }
    else if (e.key === "Tab") N.dropdown.close(wrap);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      xsPick(wrap, e.target.dataset.value);
      N.dropdown.close(wrap, true);
    }
  });


  const messages = readJSON("messages-data").map((m) => Object.assign(m, { box: "inbox", date: new Date(m.received) }));
  const labelName = Object.fromEntries(readJSON("message-labels"));
  const byId = new Map(messages.map((m) => [m.id, m]));
  const els = new Map(); // id -> wrapper element

  const inbox = $("[data-inbox]");
  const list = $("[data-items]");
  const reader = $("[data-reader]");
  const content = $("[data-read-content]");
  const scrollBox = $("[data-read-scroll]");
  const emptyEl = $("[data-empty]");
  const tabsEl = $("[data-inbox-tabs]");
  const folderNav = $("[data-folders]");
  const searchInput = $("[data-search]");
  const folderSelect = $("[data-folder-select]");
  const folderPicker = xsBuild(folderSelect);   // custom dropdown over the native select
  const navBadge = $('.nav-item[href*="messages"] .nav-badge'); // sidebar counter (shell markup, read-only use)

  /* ---- helpers ----------------------------------------------------------- */
  /** List <-> reading pane (one-pane layout). The slide transition is enabled only
      for this user action (.pane-anim), so crossing the container-query breakpoint
      while resizing snaps instead of animating. */
  let paneAnimTimer;
  function setReading(on) {
    if (inbox.classList.contains("is-reading") === on) return;
    inbox.classList.add("pane-anim");
    void inbox.offsetWidth;
    inbox.classList.toggle("is-reading", on);
    clearTimeout(paneAnimTimer);
    paneAnimTimer = setTimeout(() => inbox.classList.remove("pane-anim"), (N.ms("--dur-base") || 250) + 80);
  }
  const iconTpl = document.getElementById("msg-icons").content;
  const icon = (n) => { const i = iconTpl.querySelector(`[data-i="${n}"]`); return i ? i.innerHTML : ""; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmtTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
  const fmtWeekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const fmtDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const fmtFull = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  function shortTime(d) {
    const now = new Date();
    const mins = (now - d) / 60000;
    if (mins < 1) return "now";
    if (mins < 60) return Math.round(mins) + "m";
    if (d.toDateString() === now.toDateString()) return fmtTime.format(d);
    if (mins < 60 * 24 * 6) return fmtWeekday.format(d);
    return fmtDay.format(d);
  }

  /** Subtle "value changed" cue: quick fade/slide, no overshoot. */
  function tick(el) {
    N.animate(el, [{ opacity: 0.35, transform: "translateY(-2px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: N.easing.outQuart });
  }
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

  /* ---- rendering ---------------------------------------------------------- */
  function itemHTML(m) {
    return `<div class="msg-wrap" data-id="${m.id}" role="listitem">
      <div class="msg-swipe" aria-hidden="true"><span data-swipe-left>${icon("archive")} Archive</span><span data-swipe-right>Delete ${icon("trash")}</span></div>
      <article class="msg${m.unread ? " is-unread" : ""}" tabindex="0" aria-label="${esc(m.sender)}: ${esc(m.subject)}">
        <span class="msg__dot" aria-hidden="true"></span>
        <span class="avatar avatar--sm">${esc(m.initials)}</span>
        <div style="min-width:0">
          <div class="msg__top">
            <span class="msg__sender truncate">${esc(m.sender)}</span>
            <time class="msg__time" datetime="${m.received}">${shortTime(m.date)}</time>
          </div>
          <div class="msg__subject truncate">${esc(m.subject)}</div>
          <div class="msg__bottom">
            <span class="msg__preview truncate">${esc(m.preview)}</span>
            <span class="msg__label">${labelName[m.label] || m.label}</span>
            <button class="icon-btn msg-star${m.starred ? " is-on" : ""}" type="button" data-act="star" aria-pressed="${m.starred}" aria-label="Star">${icon("star")}</button>
          </div>
        </div>
        <div class="msg__actions">
          <button class="icon-btn icon-btn--sm" type="button" data-act="archive" aria-label="Archive" data-tooltip="Archive">${icon("archive")}</button>
          <button class="icon-btn icon-btn--sm" type="button" data-act="delete" aria-label="Delete" data-tooltip="Delete">${icon("trash")}</button>
        </div>
      </article>
    </div>`;
  }
  function makeItem(m) {
    const t = document.createElement("div");
    t.innerHTML = itemHTML(m).trim();
    const el = t.firstElementChild;
    els.set(m.id, el);
    return el;
  }

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
  messages.forEach((m) => list.appendChild(makeItem(m)));
  settleStagger(list);

  /** Three panes side by side? Below 1100px of inbox width it's one pane at a time. */
  const isWide = () => inbox.parentElement.clientWidth >= 1100;

  /* ---- view state: folder + tab + search ------------------------------------ */
  const state = { folder: "inbox", tab: "all", q: "", selected: null };

  function inFolder(m, folder = state.folder) {
    if (folder === "inbox") return m.box === "inbox";
    if (folder === "starred") return m.starred && m.box !== "trash" && m.box !== "gone";
    if (folder === "archive") return m.box === "archive";
    if (folder === "trash") return m.box === "trash";
    if (folder.startsWith("label:")) return m.box === "inbox" && m.label === folder.slice(6);
    return false;
  }
  function visible(m) {
    if (!inFolder(m)) return false;
    if (state.tab === "unread" && !m.unread) return false;
    if (state.tab === "starred" && !m.starred) return false;
    if (state.q) {
      const hay = (m.sender + " " + m.subject + " " + m.preview).toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    return true;
  }
  const shown = () => messages.filter((m) => !els.get(m.id).hidden);

  /** Re-filter the list. Leaving rows fade out quickly, the rest FLIP. */
  function applyView(animate = true) {
    const leaving = messages.filter((m) => !els.get(m.id).hidden && !visible(m)).map((m) => els.get(m.id));
    const run = () => {
      const mutate = () => {
        messages.forEach((m) => {
          const el = els.get(m.id);
          el.getAnimations().forEach((a) => a.cancel());
          el.hidden = !visible(m);
        });
        const any = messages.some(visible);
        emptyEl.hidden = any;
        list.hidden = !any;
      };
      animate ? N.flip(list, mutate, { duration: N.ms("--dur-base") }) : mutate();
      updatePosition();
    };
    if (animate && leaving.length && leaving.length < 25) {
      leaving.forEach((el) => N.animate(el, [{ opacity: 1 }, { opacity: 0, transform: "translateX(-8px)" }], { duration: N.ms("--dur-fast"), easing: N.easing.in, fill: "forwards" }));
      setTimeout(run, N.ms("--dur-fast"));
    } else run();
  }

  /* ---- counters (folders, tab, sidebar badge) ------------------------------ */
  const countEls = new Map($$("[data-count]", inbox).map((el) => [el.dataset.count, el]));
  function computeCounts() {
    const c = { inbox: 0, starred: 0, archive: 0, trash: 0, "tab-unread": 0 };
    Object.keys(labelName).forEach((l) => (c["label:" + l] = 0));
    messages.forEach((m) => {
      if (m.box === "inbox" && m.unread) { c.inbox++; c["label:" + m.label]++; }
      if (inFolder(m, "starred")) c.starred++;
      if (m.box === "archive") c.archive++;
      if (m.box === "trash") c.trash++;
      if (inFolder(m) && m.unread) c["tab-unread"]++;
    });
    return c;
  }
  function renderCounts(animate = true) {
    const c = computeCounts();
    countEls.forEach((el, key) => {
      const v = c[key] || 0;
      const changed = el.textContent !== String(v);
      el.textContent = v;
      el.classList.toggle("is-zero", v === 0);
      if (animate && changed && v) tick(el);
    });
    $$("option", folderSelect).forEach((o) => {
      const v = ["inbox", "starred"].includes(o.value) || o.value.startsWith("label:") ? c[o.value] : 0;
      o.dataset.count = v || 0;
    });
    xsRender(folderPicker);
    if (navBadge) {
      const v = c.inbox;
      if (navBadge.textContent.trim() !== String(v)) {
        navBadge.textContent = v;
        if (animate && v) tick(navBadge);
      }
      navBadge.style.transform = v ? "" : "scale(0)";
      navBadge.style.opacity = v ? "" : "0";
    }
  }
  renderCounts(false);

  /* ---- folder pill -------------------------------------------------------------- */
  const pill = $(".inbox-nav__indicator", folderNav);
  function placePill(instant) {
    const item = $(".inbox-nav__item.is-active", folderNav);
    if (!item) return;
    if (instant) pill.classList.add("no-anim");
    pill.style.setProperty("--x", item.offsetLeft + "px");
    pill.style.setProperty("--y", item.offsetTop + "px");
    pill.style.setProperty("--w", item.offsetWidth + "px");
    pill.style.setProperty("--h", item.offsetHeight + "px");
    if (instant) { void pill.offsetWidth; pill.classList.remove("no-anim"); }
  }
  placePill(true);
  if (document.fonts) document.fonts.ready.then(() => placePill(true));
  if ("ResizeObserver" in window) new ResizeObserver(() => placePill(true)).observe(folderNav);

  folderNav.addEventListener("click", (e) => {
    const item = e.target.closest("[data-folder]");
    if (!item || item.classList.contains("is-active")) return;
    $$("[data-folder]", folderNav).forEach((f) => { const on = f === item; f.classList.toggle("is-active", on); on ? f.setAttribute("aria-current", "true") : f.removeAttribute("aria-current"); });
    placePill(false);
    item.scrollIntoView({ block: "nearest", inline: "nearest", behavior: N.reducedMotion ? "auto" : "smooth" });
    state.folder = item.dataset.folder;
    applyView();
    renderCounts();
    list.scrollTop = 0;
  });

  // Compact folder picker (shown instead of the folder column when the inbox is narrow).
  folderSelect.addEventListener("change", () => {
    const item = $(`[data-folder="${folderSelect.value}"]`, folderNav);
    if (item) item.click();
  });
  folderNav.addEventListener("click", () => { folderSelect.value = state.folder; xsRender(folderPicker); });

  tabsEl.addEventListener("nimbus:tabchange", (e) => { state.tab = e.detail.value; applyView(); });

  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = searchInput.value.trim().toLowerCase(); applyView(); }, 120);
  });

  /* ---------------------------------------------------------------------
     READING PANE
     ------------------------------------------------------------------- */
  const posEl = $("[data-position]", reader);
  const readStar = $('[data-read-act="star"]', reader);
  function updatePosition() {
    const s = shown();
    const i = s.findIndex((m) => m.id === state.selected);
    posEl.textContent = i >= 0 ? `${i + 1} of ${s.length}` : "";
  }

  function paragraphs(text) {
    return text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  }
  function readHTML(m) {
    const attach = m.id % 3 === 0;
    return `<h2 class="read-subject">${esc(m.subject)}</h2>
      <div class="read-head">
        <span class="avatar">${esc(m.initials)}</span>
        <div class="read-meta">
          <div class="read-line">
            <span class="read-from"><strong>${esc(m.sender)}</strong><span class="read-email">&lt;${esc(m.email)}&gt;</span></span>
            <time class="read-when" datetime="${m.received}">${fmtFull.format(m.date)}</time>
          </div>
          <div class="read-to">To you and the team · ${labelName[m.label] || m.label}<span class="read-to-date"> · ${shortTime(m.date)}</span></div>
        </div>
      </div>
      <div class="read-body">${paragraphs(m.body)}</div>
      ${attach ? `<a class="read-attach" href="#" data-attachment>
          <span><span class="list-item__title" style="display:block">${esc(m.subject.split(" ")[0].replace(/\W/g, "").toLowerCase() || "notes")}-details.pdf</span><span class="text-subtle">${120 + (m.id * 37) % 800} KB</span></span>
          <span class="read-attach__dl">Download</span></a>` : ""}
      <form class="read-reply" data-reply>
        <textarea name="reply" rows="2" placeholder="Reply to ${esc(m.sender.split(" ")[0])}..." aria-label="Reply"></textarea>
        <div class="read-reply__foot">
          <span class="text-subtle">Reply all</span>
          <button class="btn btn--primary btn--sm" type="submit"><span>Send</span></button>
        </div>
      </form>`;
  }

  let swapToken = 0;
  function open(id, { dir = 1, focusList = false } = {}) {
    const m = byId.get(id);
    if (!m) return;
    const prev = state.selected;
    state.selected = id;
    $$(".msg.is-selected", list).forEach((el) => el.classList.remove("is-selected"));
    const el = els.get(id);
    $(".msg", el).classList.add("is-selected");
    if (focusList) $(".msg", el).focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", behavior: N.reducedMotion ? "auto" : "smooth" });
    reader.classList.remove("is-empty");
    syncReaderButtons(m);
    updatePosition();
    setReading(true); // one-pane layout: slide the pane in

    // Crossfade/slide: old content leaves quickly, new content enters from the travel direction.
    const token = ++swapToken;
    const out = prev == null ? null
      : N.animate(content, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(${-8 * dir}px)` }],
        { duration: 110, easing: N.easing.in, fill: "forwards" });
    const swap = () => {
      if (token !== swapToken) return;
      content.innerHTML = readHTML(m);
      scrollBox.scrollTop = 0;
      if (out) out.cancel();
      N.animate(content, [{ opacity: 0, transform: `translateY(${14 * dir}px)` }, { opacity: 1, transform: "none" }], { duration: N.ms("--dur-base") });
      // Stagger the head/body/reply slightly for depth.
      Array.from(content.children).forEach((child, i) => i && N.animate(child,
        [{ opacity: 0, transform: `translateY(${8 * dir}px)` }, { opacity: 1, transform: "none" }],
        { duration: N.ms("--dur-base"), delay: i * 30, fill: "backwards" }));
    };
    out ? out.finished.then(swap, swap) : swap();

    if (m.unread) setTimeout(() => state.selected === id && setUnread(m, false), 350);
  }

  function syncReaderButtons(m) {
    readStar.classList.toggle("is-on", m.starred);
    readStar.setAttribute("aria-pressed", m.starred);
    const del = $('[data-read-act="delete"]', reader);
    del.setAttribute("aria-label", m.box === "trash" ? "Delete forever" : "Delete");
    del.dataset.tooltip = m.box === "trash" ? "Delete forever" : "Delete  #";
  }

  function clearReader() {
    state.selected = null;
    reader.classList.add("is-empty");
    setReading(false);
    content.innerHTML = `<div class="plain-empty"><strong>No message selected</strong>Select a message from the list.</div>`;
    N.animate(content, [{ opacity: 0 }, { opacity: 1 }], { duration: N.ms("--dur-base") });
    updatePosition();
  }
  reader.classList.add("is-empty");

  function step(delta) {
    const s = shown();
    if (!s.length) return;
    const i = s.findIndex((m) => m.id === state.selected);
    const next = s[i < 0 ? 0 : Math.max(0, Math.min(s.length - 1, i + delta))];
    if (next && next.id !== state.selected) open(next.id, { dir: delta > 0 ? 1 : -1, focusList: true });
  }

  /* ---- read / unread ------------------------------------------------------- */
  function setUnread(m, unread) {
    if (m.unread === unread) return;
    m.unread = unread;
    $(".msg", els.get(m.id)).classList.toggle("is-unread", unread);
    renderCounts();
    if (state.tab === "unread" && !unread) { /* keep it visible until the user moves on */ }
  }

  /* ---- star ------------------------------------------------------------------ */
  function toggleStar(m) {
    m.starred = !m.starred;
    const btns = [$(".msg-star", els.get(m.id))];
    if (state.selected === m.id) btns.push(readStar);
    btns.forEach((b) => {
      b.classList.toggle("is-on", m.starred);
      b.setAttribute("aria-pressed", m.starred);
    });
    renderCounts();
    if (state.folder === "starred" || state.tab === "starred") applyView();
  }

  /* ---------------------------------------------------------------------
     ARCHIVE / DELETE with swipe-out, collapse and Undo
     ------------------------------------------------------------------- */
  /** Collapse an element's height to 0 (the rows below glide up). */
  function collapse(el) {
    const h = el.offsetHeight;
    return N.animate(el, [{ height: h + "px", marginTop: getComputedStyle(el).marginTop }, { height: "0px", marginTop: "0px" }],
      { duration: N.ms("--dur-base"), easing: N.easing.inOut }).finished;
  }
  function expand(el) {
    const h = el.offsetHeight;
    return N.animate(el, [{ height: "0px", marginTop: "0px", opacity: 0 }, { height: h + "px", opacity: 1, offset: 0.6 }, { height: h + "px", opacity: 1 }],
      { duration: N.ms("--dur-slow"), easing: N.easing.outExpo }).finished;
  }

  /**
   * Toast with an inline action button (e.g. "Undo").
   * NOTE: generic enough to live in motion.js as an `action` option of Nimbus.toast.
   */
  /** Toast with an action button (shared API: Nimbus.toast(..., { action })). */
  function actionToast(message, type, opts, actionLabel, onAction) {
    return N.toast(message, type, Object.assign({}, opts, { action: { label: actionLabel, onClick: onAction } }));
  }

  let undoToast = null;
  function removeMessage(m, action, { swiped = false, dir } = {}) {
    const el = els.get(m.id);
    if (el.hidden || el._removing) return;
    el._removing = true;
    const prevBox = m.box;
    const forever = action === "delete" && m.box === "trash";
    m.box = action === "archive" ? "archive" : forever ? "gone" : "trash";
    const wasSelected = state.selected === m.id;

    // Pick the neighbour to select next before this one disappears.
    let nextId = null;
    if (wasSelected) {
      const s = shown();
      const i = s.findIndex((x) => x.id === m.id);
      const n = s[i + 1] || s[i - 1];
      nextId = n ? n.id : null;
    }

    const x = dir || (action === "archive" ? 1 : -1);
    const msgEl = $(".msg", el);
    const outMs = N.ms("--dur-base");
    const slide = swiped ? Promise.resolve()
      : N.animate(msgEl, [{ transform: msgEl.style.transform || "none", opacity: 1 }, { transform: `translateX(${x * 105}%)`, opacity: 0 }],
        { duration: outMs, easing: N.easing.in, fill: "forwards" }).finished;
    slide.then(() => collapse(el)).then(() => {
      el.hidden = true;
      el._removing = false;
      el.classList.remove("is-swiping");
      msgEl.getAnimations().forEach((a) => a.cancel());
      msgEl.style.transform = "";
      emptyEl.hidden = messages.some(visible);
      list.hidden = !emptyEl.hidden;
      updatePosition();
    });
    renderCounts();
    if (wasSelected) nextId != null ? open(nextId, { dir: 1 }) : clearReader();

    if (undoToast) undoToast.dismiss();
    const verb = action === "archive" ? "archived" : forever ? "deleted forever" : "moved to Trash";
    undoToast = actionToast(`"${m.subject}" ${verb}.`, "info", { duration: 6000 }, "Undo", () => {
      m.box = prevBox;
      renderCounts();
      if (!visible(m)) return;
      el.hidden = false;
      msgEl.getAnimations().forEach((a) => a.cancel());
      msgEl.style.transform = "";
      emptyEl.hidden = true; list.hidden = false;
      expand(el);
      N.animate(msgEl, [{ transform: `translateX(${x * 40}%)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: N.ms("--dur-slow"), easing: N.easing.outExpo });
      el.scrollIntoView({ block: "nearest", behavior: N.reducedMotion ? "auto" : "smooth" });
      open(m.id, { dir: -1 });
    });
  }

  /* ---- list interactions ----------------------------------------------------- */
  let suppressClick = false;
  list.addEventListener("click", (e) => {
    if (suppressClick) return;
    const wrap = e.target.closest(".msg-wrap");
    if (!wrap) return;
    const m = byId.get(+wrap.dataset.id);
    const act = e.target.closest("[data-act]");
    if (act) {
      e.stopPropagation();
      if (act.dataset.act === "star") toggleStar(m);
      else removeMessage(m, act.dataset.act);
      return;
    }
    const s = shown();
    const dir = s.findIndex((x) => x.id === m.id) >= s.findIndex((x) => x.id === state.selected) ? 1 : -1;
    open(m.id, { dir });
  });
  list.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("msg")) {
      e.preventDefault();
      open(+e.target.parentElement.dataset.id);
    }
  });

  /* ---- swipe gesture (pointer events) ------------------------------------------- */
  list.addEventListener("pointerdown", (e) => {
    const msgEl = e.target.closest(".msg");
    if (!msgEl || e.button !== 0 || e.target.closest("button")) return;
    const wrap = msgEl.parentElement;
    const sx = e.clientX, sy = e.clientY;
    let dx = 0, active = false;
    const width = wrap.offsetWidth;
    const bg = $(".msg-swipe", wrap);
    const move = (ev) => {
      dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!active) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) { if (Math.abs(dy) > 10) end(); return; }
        active = true;
        wrap.classList.add("is-swiping", "is-dragging");
        try { msgEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      const armed = Math.abs(dx) > width * 0.33;
      msgEl.style.transform = `translateX(${dx}px)`;
      bg.style.setProperty("--swipe-c", dx > 0 ? "var(--primary)" : "var(--text)");
      bg.style.justifyContent = dx > 0 ? "flex-start" : "flex-end";
      $("[data-swipe-left]", bg).style.display = dx > 0 ? "" : "none";
      $("[data-swipe-right]", bg).style.display = dx > 0 ? "none" : "";
      bg.firstElementChild.classList.toggle("is-armed", armed && dx > 0);
      bg.lastElementChild.classList.toggle("is-armed", armed && dx < 0);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!active) return;
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      wrap.classList.remove("is-dragging");
      const m = byId.get(+wrap.dataset.id);
      if (Math.abs(dx) > width * 0.33) {
        // Finish the throw from where the finger left it.
        N.animate(msgEl, [{ transform: `translateX(${dx}px)` }, { transform: `translateX(${Math.sign(dx) * width * 1.05}px)` }],
          { duration: N.ms("--dur-fast"), easing: N.easing.in, fill: "forwards" }).finished.then(() => {
          msgEl.style.transform = "";
          removeMessage(m, dx > 0 ? "archive" : "delete", { swiped: true, dir: Math.sign(dx) });
        });
      } else {
        N.animate(msgEl, [{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: N.ms("--dur-base"), easing: N.easing.outQuart })
          .finished.then(() => wrap.classList.remove("is-swiping"));
        msgEl.style.transform = "";
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  });

  /* ---- reader toolbar ---------------------------------------------------------- */
  reader.addEventListener("click", (e) => {
    if (e.target.closest("[data-back]")) { setReading(false); return; }
    if (e.target.closest("[data-expand]")) { setExpanded(!inbox.classList.contains("is-expanded")); return; }
    const stepBtn = e.target.closest("[data-step]");
    if (stepBtn) { step(+stepBtn.dataset.step); return; }
    if (e.target.closest("[data-attachment]")) {
      e.preventDefault();
      N.toast("Attachments are placeholders in this demo.", "info", { title: "Download started" });
      return;
    }
    const act = e.target.closest("[data-read-act]");
    const m = byId.get(state.selected);
    if (!act || !m) return;
    const a = act.dataset.readAct;
    if (a === "star") toggleStar(m);
    else if (a === "unread") { setUnread(m, true); N.toast("Marked as unread.", "info"); }
    else removeMessage(m, a);
  });
  reader.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-reply]");
    if (!form) return;
    e.preventDefault();
    const ta = form.elements.reply;
    if (!ta.value.trim()) { N.shake(form); ta.focus(); return; }
    const btn = form.querySelector("button[type=submit]");
    N.loading(btn, true);
    setTimeout(() => {
      N.loading(btn, false);
      ta.value = "";
      ta.blur();
      N.toast("Demo workspace: replies are not delivered.", "success", { title: "Reply sent" });
    }, 700);
  });

  /* ---- full-screen reading --------------------------------------------------- */
  const expandBtn = $("[data-expand]", reader);
  function setExpanded(on) {
    if (on === inbox.classList.contains("is-expanded")) return;
    inbox.classList.toggle("is-expanded", on);
    expandBtn.setAttribute("aria-pressed", on);
    expandBtn.dataset.tooltip = on ? "Exit full screen  F" : "Full screen  F";
    document.documentElement.style.overflow = on ? "hidden" : "";
    N.animate(on ? inbox : reader, [{ opacity: 0.6, transform: "scale(0.99)" }, { opacity: 1, transform: "none" }],
      { duration: N.ms("--dur-base"), easing: N.easing.outQuart });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
    if (inbox.classList.contains("is-expanded")) setExpanded(false);
    else if (!isWide() && inbox.classList.contains("is-reading")) setReading(false);
  });

  /* ---- keyboard shortcuts --------------------------------------------------- */
  document.addEventListener("keydown", (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
    const m = byId.get(state.selected);
    if (e.key === "j" || (e.key === "ArrowDown" && e.target.closest && e.target.closest(".inbox"))) { e.preventDefault(); step(1); }
    else if (e.key === "k" || (e.key === "ArrowUp" && e.target.closest && e.target.closest(".inbox"))) { e.preventDefault(); step(-1); }
    else if (!m) return;
    else if (e.key === "e") removeMessage(m, "archive");
    else if (e.key === "#") removeMessage(m, "delete");
    else if (e.key === "s") toggleStar(m);
    else if (e.key === "u") setUnread(m, true);
    else if (e.key === "f") setExpanded(!inbox.classList.contains("is-expanded"));
  });

  /* ---- toolbar: mark all read, refresh ----------------------------------------- */
  $("[data-mark-all]").addEventListener("click", () => {
    const unread = messages.filter((m) => m.unread && m.box === "inbox");
    if (!unread.length) { N.toast("There are no unread messages.", "info"); return; }
    // Ripple through the visible ones top to bottom.
    unread.forEach((m, i) => setTimeout(() => setUnread(m, false), Math.min(i, 12) * 35));
    setTimeout(() => {
      N.toast(`${unread.length} conversation${unread.length > 1 ? "s" : ""} marked as read.`, "success");
      if (state.tab === "unread") applyView();
    }, Math.min(unread.length, 12) * 35 + 150);
  });

  const INCOMING = [
    { sender: "Wren Castellan", email: "wren@harborlight.example", initials: "WC", color: "teal", label: "work",
      subject: "Open items before Friday sign-off", preview: "Two items from the implementation review need a decision from your side before Friday.",
      body: "Hello,\n\nTwo items from the implementation review need a decision from your side before Friday: the data retention period for archived projects, and whether SSO is enforced for contractor accounts.\n\nPlease confirm by Thursday so we can keep the go-live date.\n\nRegards,\nWren Castellan\nHarborlight Logistics" },
    { sender: "Accounts Receivable", email: "billing@controlpanel.example", initials: "AR", color: "amber", label: "billing",
      subject: "Payment received for invoice INV-4821", preview: "Payment of $1,240.00 was received on net-30 terms. Invoice INV-4821 is now closed.",
      body: "Hello,\n\nPayment of $1,240.00 was received for invoice INV-4821 (net 30). The invoice is now closed and a receipt is attached for your records.\n\nAccounts Receivable" },
    { sender: "Odile Marchetti", email: "odile@kestrelworks.example", initials: "OM", color: "violet", label: "support",
      subject: "Re: SSO login loop", preview: "Confirmed resolved after removing the old redirect URL. You can close the ticket.",
      body: "Hello,\n\nConfirmed resolved on our side after removing the old redirect URL from the identity provider. You can close ticket #2207.\n\nRegards,\nOdile Marchetti\nKestrel Works" },
  ];
  let incomingIdx = 0;
  const refreshBtn = $("[data-refresh]");
  const syncedEl = $("[data-synced]");
  let syncedAt = Date.now();
  setInterval(() => {
    const s = Math.round((Date.now() - syncedAt) / 1000);
    syncedEl.textContent = s < 20 ? "just now" : s < 60 ? s + "s ago" : Math.round(s / 60) + "m ago";
  }, 5000);

  refreshBtn.addEventListener("click", () => {
    if (refreshBtn.classList.contains("is-busy")) return;
    refreshBtn.classList.add("is-busy");
    refreshBtn.setAttribute("aria-busy", "true");
    setTimeout(() => {
      refreshBtn.classList.remove("is-busy");
      refreshBtn.removeAttribute("aria-busy");
      syncedAt = Date.now(); syncedEl.textContent = "just now"; tick(syncedEl);
      if (incomingIdx >= INCOMING.length) { N.toast("No new mail.", "info", { title: "Inbox up to date" }); return; }
      const m = Object.assign({}, INCOMING[incomingIdx++], {
        id: Math.max(...messages.map((x) => x.id)) + 1, received: new Date().toISOString(), date: new Date(),
        unread: true, starred: false, box: "inbox",
      });
      messages.unshift(m); byId.set(m.id, m);
      const el = makeItem(m);
      el.hidden = !visible(m);
      N.flip(list, () => list.prepend(el), { duration: N.ms("--dur-base") });
      if (!el.hidden) {
        list.scrollTo({ top: 0, behavior: N.reducedMotion ? "auto" : "smooth" });
        N.animate($(".msg", el), [{ backgroundColor: "var(--primary-soft)" }, { backgroundColor: "var(--surface)" }], { duration: 1400, easing: "ease-out" });
      }
      renderCounts();
      updatePosition();
      N.toast(`${m.sender}: ${m.subject}`, "info", { title: "New message" });
    }, 750);
  });

  /* ---- compose ---------------------------------------------------------------- */
  const compose = $("[data-compose-form]");
  const counter = $("[data-compose-count]");
  compose.elements.body.addEventListener("input", () => { counter.textContent = `${compose.elements.body.value.length} / 1000`; });
  $("[data-attach]").addEventListener("click", () => N.toast("File picker is disabled in the demo.", "info", { title: "Attach file" }));
  compose.addEventListener("submit", (e) => {
    e.preventDefault();
    const to = compose.elements.to;
    if (!to.value.trim() || !to.checkValidity()) { to.focus(); N.toast("Enter a valid recipient address.", "error"); return; }
    if (!compose.elements.subject.value.trim()) { N.shake(compose.elements.subject); compose.elements.subject.focus(); return; }
    const btn = compose.querySelector("button[type=submit]");
    N.loading(btn, true);
    setTimeout(() => {
      N.loading(btn, false);
      N.modal.close("compose-modal");
      N.toast(`Sent to ${to.value.trim()}.`, "success", { title: "Message sent" });
      compose.reset();
      counter.textContent = "0 / 1000";
    }, 700);
  });

  /* ---- first paint: select the newest message on wide screens ----------------- */
  updatePosition();
  if (isWide() && messages.length) {
    const first = messages.find(visible);
    if (first) {
      state.selected = first.id;
      $(".msg", els.get(first.id)).classList.add("is-selected");
      reader.classList.remove("is-empty");
      content.innerHTML = readHTML(first);
      syncReaderButtons(first);
      updatePosition();
      // Mark it read once the list has staggered in.
      if (first.unread) setTimeout(() => state.selected === first.id && setUnread(first, false), 1400);
    }
  }
})();
