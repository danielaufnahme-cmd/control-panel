/* ==========================================================================
   SETTINGS PAGE
     * vertical section nav: sliding indicator, panel cross-fade, #hash deep links
     * dirty tracking over every named form field -> save bar slides up;
       Save = spinner -> "Saved" (simple fade); Discard restores
     * live appearance (not part of Save): theme, accent colour (eases via a
       registered --primary), density, sidebar; persisted in localStorage
     * team invite/remove, billing cycle price count, API key reveal/copy/revoke,
       danger-zone confirm modal
   Nothing is persisted server-side.
   ========================================================================== */
(function () {
  "use strict";
  const N = window.Nimbus;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const root = document.documentElement;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } },
  };
  const form = $("[data-settings-form]");

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

  $$("select", form).forEach(xsBuild);

  /* ---------------------------------------------------------------------
     SECTION NAV
     ------------------------------------------------------------------- */
  const nav = $("[data-settings-nav]");
  const indicator = $(".st-nav__indicator", nav);
  const items = $$("[data-section]", nav);
  const panels = new Map($$("[data-panel]", form).map((p) => [p.dataset.panel, p]));

  function placeIndicator(instant) {
    const item = $(".is-active", nav);
    if (!item) return;
    if (instant) indicator.classList.add("no-anim");
    indicator.style.setProperty("--x", item.offsetLeft + "px");
    indicator.style.setProperty("--y", item.offsetTop + "px");
    indicator.style.setProperty("--w", item.offsetWidth + "px");
    indicator.style.setProperty("--h", item.offsetHeight + "px");
    if (instant) { void indicator.offsetWidth; indicator.classList.remove("no-anim"); }
  }

  /** Show a section: indicator slides, cards fade up in sequence (direction-aware). */
  function showSection(key, { instant = false, focus = false } = {}) {
    const item = items.find((i) => i.dataset.section === key);
    if (!item) return;
    const prevIdx = items.findIndex((i) => i.classList.contains("is-active"));
    const idx = items.indexOf(item);
    items.forEach((i) => {
      const on = i === item;
      i.classList.toggle("is-active", on);
      i.setAttribute("aria-selected", on);
      i.tabIndex = on ? 0 : -1;
    });
    if (focus) item.focus();
    placeIndicator(instant);
    item.scrollIntoView({ block: "nearest", inline: "nearest", behavior: instant || N.reducedMotion ? "auto" : "smooth" });
    panels.forEach((p, k) => (p.hidden = k !== key));
    const dir = idx >= prevIdx ? 1 : -1;
    $$(":scope > .card", panels.get(key)).forEach((card, i) =>
      N.animate(card, [{ opacity: 0, transform: `translateY(${10 * dir}px)` }, { opacity: 1, transform: "none" }],
        { duration: N.ms("--dur-base"), delay: i * 40, easing: N.easing.outQuart, fill: "backwards" }));
    try { history.replaceState(null, "", "#" + key); } catch (e) { /* ignore */ }
    if (navSelect && navSelect.value !== key) { navSelect.value = key; xsRender(navPicker); }
  }
  nav.addEventListener("click", (e) => {
    const item = e.target.closest("[data-section]");
    if (item && !item.classList.contains("is-active")) showSection(item.dataset.section);
  });
  nav.addEventListener("keydown", (e) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const i = items.findIndex((x) => x.classList.contains("is-active"));
    showSection(items[(i + keys[e.key] + items.length) % items.length].dataset.section, { focus: true });
  });
  if ("ResizeObserver" in window) new ResizeObserver(() => placeIndicator(true)).observe(nav);
  if (document.fonts) document.fonts.ready.then(() => placeIndicator(true));
  // Narrow layouts show the sections as a dropdown instead of the vertical list.
  const navSelect = $("[data-nav-select]");
  const navPicker = xsBuild(navSelect);
  navSelect.addEventListener("change", () => showSection(navSelect.value));
  const initial = location.hash.slice(1);
  showSection(panels.has(initial) ? initial : "profile", { instant: true });

  /* ---------------------------------------------------------------------
     SEGMENTED CONTROLS mirrored into hidden inputs (so they are form values)
     ------------------------------------------------------------------- */
  $$("[data-mirror]", form).forEach((tabs) => {
    const input = form.elements[tabs.dataset.mirror];
    tabs.addEventListener("nimbus:tabchange", (e) => {
      input.value = e.detail.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  /* ---------------------------------------------------------------------
     DIRTY TRACKING + SAVE BAR
     Every named field that isn't [data-live] counts.
     ------------------------------------------------------------------- */
  const savebar = $("[data-savebar]");
  const countEl = $("[data-dirty-count]");
  const saveBtn = $("[data-save]");
  const teamEl = $("[data-team]");
  let snapshot = null, teamSnapshot = "";

  function readValues() {
    const out = {};
    $$("[name]", form).forEach((el) => {
      if (el.hasAttribute("data-live") || !el.name) return;
      if (el.type === "radio") { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ""; }
      else out[el.name] = el.type === "checkbox" ? el.checked : el.value;
    });
    return out;
  }
  function takeSnapshot() { snapshot = readValues(); teamSnapshot = teamEl.innerHTML; }
  function changedKeys() {
    const now = readValues();
    const keys = new Set([...Object.keys(now), ...Object.keys(snapshot)]);
    return [...keys].filter((k) => now[k] !== snapshot[k]);
  }
  function updateDirty() {
    if (saveBtn.classList.contains("is-done")) return;
    const n = changedKeys().length;
    savebar.classList.toggle("is-visible", n > 0);
    savebar.setAttribute("aria-hidden", n ? "false" : "true");
    if (n) countEl.textContent = `· ${n} ${n === 1 ? "change" : "changes"}`;
  }
  form.addEventListener("input", updateDirty);
  form.addEventListener("change", updateDirty);
  form.addEventListener("submit", (e) => e.preventDefault());

  function save() {
    if (!savebar.classList.contains("is-visible") || saveBtn.classList.contains("is-loading") || saveBtn.classList.contains("is-done")) return;
    N.loading(saveBtn, true);
    setTimeout(() => {
      N.loading(saveBtn, false);
      saveBtn.classList.add("is-done");
      takeSnapshot();
      setTimeout(() => {
        savebar.classList.remove("is-visible");
        savebar.setAttribute("aria-hidden", "true");
        setTimeout(() => saveBtn.classList.remove("is-done"), N.ms("--dur-base"));
      }, 900);
    }, 750);
  }
  saveBtn.addEventListener("click", save);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  });

  $("[data-discard]").addEventListener("click", () => {
    teamEl.innerHTML = teamSnapshot;
    $$(".xs", teamEl).forEach(xsRender);
    Object.entries(snapshot).forEach(([name, v]) => {
      const el = form.elements[name];
      if (!el) return;
      if (el instanceof RadioNodeList) el.value = v;
      else if (el.type === "checkbox") el.checked = v;
      else el.value = v;
    });
    $$(".xs", form).forEach(xsRender);
    $$("[data-mirror]", form).forEach((tabs) => N.selectTab(tabs, form.elements[tabs.dataset.mirror].value));
    syncDependents();
    updateSeats();
    updateDirty();
    N.toast("Your changes were discarded.", "info");
  });

  /* Things that mirror other fields. */
  const bio = form.elements.bio;
  const bioCount = $("[data-bio-count]");
  function syncDependents() {
    bioCount.textContent = `${bio.value.length} / 200`;
    $$("[data-toggles]", form).forEach((cb) => $(cb.dataset.toggles).classList.toggle("is-open", cb.checked));
    $("[data-preview-name]").textContent = form.elements.name.value || "Your name";
    $("[data-preview-email]").textContent = form.elements.email.value;
    $("[data-avatar]").textContent = (form.elements.name.value.match(/\b\w/g) || ["?"]).slice(0, 2).join("").toUpperCase();
    updatePrice(false);
  }
  form.addEventListener("input", (e) => { if (["bio", "name", "email"].includes(e.target.name)) syncDependents(); });
  form.addEventListener("change", (e) => { if (e.target.matches("[data-toggles]")) syncDependents(); });

  /* ---------------------------------------------------------------------
     APPEARANCE (live; saved to this device immediately)
     ------------------------------------------------------------------- */
  const autosave = $("[data-autosave]");
  let autosaveTimer;
  function flashSaved() {
    autosave.classList.add("is-visible");
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => autosave.classList.remove("is-visible"), 1600);
  }

  // Accent colour: html[data-accent] + a short class that lets the registered --primary transition.
  let accentTimer;
  const accentName = $("[data-accent-name]");
  function applyAccent(value, animate) {
    if (animate && !N.reducedMotion) {
      root.classList.add("st-accent-anim");
      clearTimeout(accentTimer);
      accentTimer = setTimeout(() => root.classList.remove("st-accent-anim"), N.ms("--dur-slow") + 80);
    }
    root.dataset.accent = value;
    const input = $(`input[name="accent"][value="${value}"]`, form);
    if (input) { input.checked = true; accentName.textContent = input.dataset.label; }
  }
  const savedAccent = store.get("nimbus-accent");
  applyAccent($(`input[name="accent"][value="${savedAccent}"]`, form) ? savedAccent : "teal", false);
  $$('input[name="accent"]', form).forEach((r) => r.addEventListener("change", () => {
    applyAccent(r.value, true);
    store.set("nimbus-accent", r.value);
    flashSaved();
  }));

  // Theme: light / dark / system (system follows the OS and keeps following it).
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  let themeMode = store.get("nimbus-theme-mode") || N.theme.get();
  const syncThemeRadios = () => { const r = $(`input[name="theme"][value="${themeMode}"]`, form); if (r) r.checked = true; };
  syncThemeRadios();
  $$('input[name="theme"]', form).forEach((r) => r.addEventListener("change", () => {
    themeMode = r.value;
    store.set("nimbus-theme-mode", themeMode);
    const target = themeMode === "system" ? (systemDark.matches ? "dark" : "light") : themeMode;
    if (target !== N.theme.get()) N.theme.set(target, { origin: r.nextElementSibling });
    flashSaved();
  }));
  systemDark.addEventListener("change", () => { if (themeMode === "system") N.theme.set(systemDark.matches ? "dark" : "light"); });
  document.addEventListener("nimbus:themechange", (e) => {
    // Toggled elsewhere (e.g. the sidebar switch) -> that becomes an explicit choice.
    const systemTheme = systemDark.matches ? "dark" : "light";
    if (themeMode === "system" && e.detail.theme === systemTheme) return;
    themeMode = e.detail.theme;
    store.set("nimbus-theme-mode", themeMode);
    syncThemeRadios();
  });

  // Density
  const densityTabs = $("[data-density-tabs]");
  function applyDensity(v, animate) {
    if (animate) {
      // Spacing snaps; a quick fade on the panel makes the change read as intentional.
      N.animate(form, [{ opacity: 0.55 }, { opacity: 1 }], { duration: N.ms("--dur-base"), easing: N.easing.outQuart });
    }
    if (v === "compact") root.dataset.density = "compact"; else delete root.dataset.density;
  }
  const savedDensity = store.get("nimbus-density") === "compact" ? "compact" : "comfortable";
  applyDensity(savedDensity, false);
  if (savedDensity === "compact") {
    $$(".tab", densityTabs).forEach((t) => t.classList.toggle("is-active", t.dataset.tab === "compact"));
  }
  densityTabs.addEventListener("nimbus:tabchange", (e) => {
    applyDensity(e.detail.value, true);
    store.set("nimbus-density", e.detail.value);
    flashSaved();
  });

  // Sidebar
  const sidebarSwitch = $("[data-sidebar-switch]");
  sidebarSwitch.checked = root.dataset.sidebar === "collapsed";
  sidebarSwitch.addEventListener("change", () => {
    sidebarSwitch.checked ? N.sidebar.collapse() : N.sidebar.expand();
    flashSaved();
  });
  new MutationObserver(() => { sidebarSwitch.checked = root.dataset.sidebar === "collapsed"; })
    .observe(root, { attributes: true, attributeFilter: ["data-sidebar"] });

  /* ---------------------------------------------------------------------
     PROFILE, NOTIFICATIONS, DANGER ZONE
     ------------------------------------------------------------------- */
  $("[data-fake-upload]").addEventListener("click", () => N.toast("Photo uploads are disabled in the demo.", "info", { title: "Upload photo" }));
  $("[data-test-notif]").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    N.loading(btn, true);
    setTimeout(() => { N.loading(btn, false); N.toast("A sample notification was sent to your email address.", "success", { title: "Test sent" }); }, 700);
  });
  $("[data-transfer]").addEventListener("click", () => N.toast("Assign an admin in Team before transferring ownership.", "info", { title: "Transfer ownership" }));

  const delForm = $("[data-delete-form]");
  const delBtn = $("[data-confirm-delete]");
  delForm.elements.confirm.addEventListener("input", () => { delBtn.disabled = delForm.elements.confirm.value.trim() !== "control-panel-demo"; });
  delForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (delBtn.disabled) { delForm.elements.confirm.focus(); return; }
    N.loading(delBtn, true);
    setTimeout(() => {
      N.loading(delBtn, false);
      N.modal.close("st-delete-modal");
      N.toast("No data was deleted. This is a demo workspace.", "warning", { title: "Workspace kept" });
      delForm.reset(); delBtn.disabled = true;
    }, 900);
  });
  document.getElementById("st-delete-modal").addEventListener("nimbus:modal", (e) => {
    if (!e.detail.open) { delForm.reset(); delBtn.disabled = true; }
  });

  /* ---------------------------------------------------------------------
     TEAM
     ------------------------------------------------------------------- */
  const seatsBar = $("[data-seats]");
  const seatCount = $("[data-seat-count]");
  function updateSeats() {
    const n = $$(".st-member", teamEl).length;
    if (seatCount.textContent !== String(n)) {
      seatCount.textContent = n;
      N.animate(seatCount, [{ opacity: 0.3 }, { opacity: 1 }], { duration: 220 });
    }
    N.setProgress(seatsBar, n * 10);
  }
  /** Collapse an element's height to 0 so siblings glide up, then remove it. */
  function collapseOut(el) {
    const h = el.offsetHeight;
    return N.animate(el, [
      { height: h + "px", opacity: 1 },
      { height: h + "px", opacity: 0, offset: 0.4 },
      { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px" },
    ], { duration: N.ms("--dur-base") + 60, easing: N.easing.inOut, fill: "forwards" }).finished.then(() => el.remove());
  }
  teamEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-member]");
    if (!btn) return;
    const row = btn.closest(".st-member");
    const name = $(".list-item__title", row).textContent;
    collapseOut(row).then(() => { updateSeats(); updateDirty(); });
    N.toast(`${name} will be removed when you save.`, "info");
  });

  const inviteEmail = $("[data-invite-email]");
  const inviteRole = $("[data-invite-role]");
  let inviteId = 1000;
  function invite() {
    const email = inviteEmail.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { inviteEmail.focus(); N.toast("Enter a valid email address.", "error"); return; }
    if ($$(".st-member", teamEl).length >= 10) { N.toast("All 10 seats are in use.", "warning", { title: "No seats left" }); return; }
    const id = ++inviteId;
    const parts = email.split("@")[0].split(/[._-]/).filter(Boolean);
    const initials = parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("");
    const row = document.createElement("div");
    row.className = "st-member";
    row.dataset.member = id;
    row.innerHTML = `<span class="avatar avatar--sm">${initials}</span>
      <div class="grow" style="min-width:0"><div class="list-item__title truncate"></div><div class="list-item__meta">Invitation pending</div></div>
      <select class="select st-role" name="role_${id}" aria-label="Role">
        <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
      </select>
      <button class="icon-btn icon-btn--sm" type="button" data-remove-member aria-label="Remove" data-tooltip="Remove">${$("[data-remove-member]", teamEl) ? $("[data-remove-member]", teamEl).innerHTML : "×"}</button>`;
    $(".list-item__title", row).textContent = email;
    $("select", row).value = inviteRole.value;
    $$("option", row).forEach((o) => o.toggleAttribute("selected", o.value === inviteRole.value));
    xsBuild($("select", row));
    N.flip(teamEl, () => teamEl.appendChild(row));
    inviteEmail.value = "";
    updateSeats();
    updateDirty();
  }
  $("[data-invite]").addEventListener("click", invite);
  inviteEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); invite(); } });

  /* ---------------------------------------------------------------------
     BILLING
     ------------------------------------------------------------------- */
  const priceEl = $("[data-price]");
  const saveBadge = $("[data-save-badge]");
  priceEl._nimbusValue = 49;
  function updatePrice(animate = true) {
    const yearly = form.elements.billing_cycle.value === "yearly";
    const v = yearly ? 39 : 49;
    if (priceEl._nimbusValue !== v) N.countTo(priceEl, v, { duration: animate ? 400 : 1 });
    saveBadge.classList.toggle("is-visible", yearly);
  }
  $("[data-cycle-tabs]").addEventListener("nimbus:tabchange", () => updatePrice(true));
  $("[data-update-card]").addEventListener("click", () => N.toast("Card updates are disabled in the demo.", "info", { title: "Payment method" }));
  $$("[data-invoice]").forEach((btn) => btn.addEventListener("click", () => {
    N.loading(btn, true);
    setTimeout(() => { N.loading(btn, false); N.toast(`${btn.dataset.invoice}.pdf is ready.`, "success", { title: "Invoice downloaded" }); }, 700);
  }));

  /* ---------------------------------------------------------------------
     API KEYS: reveal (short fade), copy (icon swaps to a check + "Copied"), revoke
     ------------------------------------------------------------------- */
  const keysEl = $("[data-keys]");
  const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const mask = (k) => k.slice(0, 9) + "•".repeat(16) + k.slice(-4);

  /** Swap the key text with a short opacity fade (no character effects). */
  function fadeText(el, target) {
    el.textContent = target;
    N.animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: N.ms("--dur-fast"), easing: N.easing.outQuart });
  }
  function setRevealed(row, on) {
    const btn = $("[data-reveal]", row);
    const val = $("[data-key-value]", row);
    row.classList.toggle("is-revealed", on);
    btn.setAttribute("aria-pressed", on);
    btn.dataset.tooltip = on ? "Hide" : "Reveal";
    fadeText(val, on ? row.dataset.key : mask(row.dataset.key));
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch (err) { return false; }
    }
  }
  keysEl.addEventListener("click", async (e) => {
    const row = e.target.closest(".st-key");
    if (!row) return;
    if (e.target.closest("[data-reveal]")) setRevealed(row, !row.classList.contains("is-revealed"));
    else if (e.target.closest("[data-copy]")) {
      const btn = e.target.closest("[data-copy]");
      await copyText(row.dataset.key); // the feedback shows either way: it's a demo key
      btn.classList.add("is-copied");
      clearTimeout(btn._t);
      btn._t = setTimeout(() => btn.classList.remove("is-copied"), 1500);
    } else if (e.target.closest("[data-revoke]")) {
      const name = $(".st-key__name", row).textContent;
      collapseOut(row);
      N.toast(`"${name}" can no longer be used.`, "warning", { title: "Key revoked" });
    }
  });
  let keyCount = 0;
  $("[data-create-key]").addEventListener("click", (e) => {
    const tpl = $(".st-key", keysEl);
    const rand = (n) => Array.from({ length: n }, () => CHARS[(Math.random() * CHARS.length) | 0]).join("");
    const key = "nmb_live_" + rand(22);
    const row = document.createElement("div");
    row.className = "st-key is-new";
    row.dataset.key = key;
    if (tpl) row.innerHTML = tpl.innerHTML;
    else { N.toast("Reload the page to restore the demo keys.", "info"); return; }
    $(".st-key__name", row).textContent = "New key " + ++keyCount;
    $(".st-env", row).textContent = "Live";
    $(".st-key__meta", row).textContent = "Created just now · never used";
    $(".is-copied", row)?.classList.remove("is-copied");
    N.flip(keysEl, () => keysEl.prepend(row));
    setRevealed(row, true);
    setTimeout(() => row.classList.remove("is-new"), 2400);
    N.toast("Store the key securely. It is shown in full only once.", "success", { title: "API key created" });
  });

  /* ---- start -------------------------------------------------------------- */
  syncDependents();
  takeSnapshot();
  updateDirty();
})();
