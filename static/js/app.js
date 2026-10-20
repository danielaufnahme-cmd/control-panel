/* ==========================================================================
   APP SHELL  -  sidebar, nav pill, navigation progress bar, shortcuts.
   There is no top bar (removed): no search box, bell or avatar menu. The
   old search/notification code was deleted; nothing binds [data-search].
   Page-specific code does NOT go here: use static/js/pages/<page>.js.
   ========================================================================== */
(function () {
  "use strict";
  const Nimbus = (window.Nimbus = window.Nimbus || {});
  const root = document.documentElement;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) {} },
  };
  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

  /* ------------------------------------------------------------------------
     SIDEBAR: collapse (desktop) / off-canvas drawer (mobile)
     State is applied before paint by the head script via data-sidebar.
     ---------------------------------------------------------------------- */
  // 901-1100px: the sidebar becomes the icon rail automatically (the head
  // script does the same before paint). Toggling there is temporary; the
  // saved preference only changes on wide screens.
  const midMQ = window.matchMedia("(min-width: 901px) and (max-width: 1100px)");
  function setCollapsed(collapsed) {
    root.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    if (!midMQ.matches) store.set("nimbus-sidebar", root.dataset.sidebar);
    document.querySelectorAll("[data-sidebar-collapse]").forEach((b) => {
      b.setAttribute("aria-expanded", collapsed ? "false" : "true");
      b.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    });
    // Item offsets change with the rail layout: move the pill along.
    if (Nimbus.placeNavPill) Nimbus.placeNavPill();
  }
  Nimbus.sidebar = {
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
    toggle: () => setCollapsed(root.dataset.sidebar !== "collapsed"),
    open: () => root.classList.add("sidebar-open"),
    close: () => root.classList.remove("sidebar-open"),
  };

  function syncCollapseButtons() {
    const collapsed = root.dataset.sidebar === "collapsed";
    document.querySelectorAll("[data-sidebar-collapse]").forEach((b) => {
      b.setAttribute("aria-expanded", collapsed ? "false" : "true");
      b.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    });
  }
  midMQ.addEventListener("change", () => {
    root.dataset.sidebar = midMQ.matches || store.get("nimbus-sidebar") === "collapsed" ? "collapsed" : "expanded";
    syncCollapseButtons();
    if (Nimbus.placeNavPill) Nimbus.placeNavPill();
  });
  document.addEventListener("DOMContentLoaded", syncCollapseButtons);

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-sidebar-collapse]")) Nimbus.sidebar.toggle();
    if (e.target.closest("[data-sidebar-open]")) Nimbus.sidebar.open();
    if (e.target.closest("[data-sidebar-close]")) Nimbus.sidebar.close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") Nimbus.sidebar.close();
    // "[" toggles the sidebar, like many pro tools.
    const typing = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
    if (e.key === "[" && !typing) Nimbus.sidebar.toggle();
    // "?" opens the shortcuts dialog (components/shortcuts_modal.html).
    if (e.key === "?" && !typing && Nimbus.modal) Nimbus.modal.open("shortcuts-modal");
  });

  /* ------------------------------------------------------------------------
     NAV PILL - slides between items.
     * Click: pill slides to the clicked item instantly (before the new page
       arrives), so the UI responds in the same frame.
     * New page:
         - browsers with cross-document View Transitions morph the pill via
           its view-transition-name (CSS), so we place it instantly;
         - other browsers: we saved the pill's position on pagehide, start
           there and slide to the active item.
     ---------------------------------------------------------------------- */
  const PILL_KEY = "nimbus-pill-y";
  const supportsCrossDocVT = "onpagereveal" in window && window.CSS && CSS.supports("view-transition-name: a");

  function initNavPill() {
    const nav = document.querySelector(".nav");
    const pill = nav && nav.querySelector(".nav-indicator");
    if (!pill) return;
    const place = (item, instant) => {
      if (instant) pill.classList.add("no-anim");
      pill.style.setProperty("--y", item.offsetTop + "px");
      pill.style.opacity = "1";
      if (instant) { void pill.offsetWidth; pill.classList.remove("no-anim"); }
    };
    const active = nav.querySelector(".nav-item.is-active");
    if (!active) { pill.style.opacity = "0"; return; }
    Nimbus.placeNavPill = () => {
      const cur = nav.querySelector(".nav-item.is-active");
      if (cur) place(cur);
    };

    const prev = session.get(PILL_KEY);
    session.del(PILL_KEY);
    if (!supportsCrossDocVT && prev !== null && !Nimbus.reducedMotion) {
      pill.classList.add("no-anim");
      pill.style.setProperty("--y", prev + "px");
      void pill.offsetWidth;
      pill.classList.remove("no-anim");
      requestAnimationFrame(() => place(active));
    } else {
      place(active, true);
    }

    nav.addEventListener("click", (e) => {
      const item = e.target.closest(".nav-item");
      if (!item || e.metaKey || e.ctrlKey || e.shiftKey) return;
      nav.querySelectorAll(".nav-item").forEach((i) => i.classList.toggle("is-active", i === item));
      place(item);
      if (isMobile()) setTimeout(Nimbus.sidebar.close, 120);
    });

    // Remember where the pill visually is when we leave the page.
    window.addEventListener("pagehide", () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(pill).transform);
      session.set(PILL_KEY, String(m.m42));
    });
  }

  /* ------------------------------------------------------------------------
     SIDEBAR RESIZE - drag the right edge (.sidebar-resizer).
       * width lives in --sidebar-w on <html> (inline style), persisted in
         localStorage "nimbus-sidebar-w"; the head script applies it pre-paint
       * min 200 / max 360; dragging below SNAP collapses to the icon rail,
         dragging a collapsed rail outwards expands it again
       * double-click (or Enter) resets to the default width
       * arrow keys nudge by 16px (Shift: 48px), Home/End = min/max
       * no transition while dragging (html.sidebar-resizing); snap and reset
         use the normal width transition
     ---------------------------------------------------------------------- */
  const SB_MIN = 200, SB_MAX = 360, SB_SNAP = 150, SB_KEY = "nimbus-sidebar-w";
  function initSidebarResize() {
    const handle = document.querySelector(".sidebar-resizer");
    if (!handle) return;
    const clamp = (w) => Math.max(SB_MIN, Math.min(SB_MAX, Math.round(w)));
    const current = () => parseFloat(getComputedStyle(root).getPropertyValue("--sidebar-w")) || 248;
    const sync = () => handle.setAttribute("aria-valuenow", root.dataset.sidebar === "collapsed" ? 0 : Math.round(current()));
    function setWidth(w, persist = true) {
      root.style.setProperty("--sidebar-w", clamp(w) + "px");
      if (persist) store.set(SB_KEY, String(clamp(w)));
      if (Nimbus.placeNavPill) Nimbus.placeNavPill();
      sync();
    }
    function reset() {
      root.style.removeProperty("--sidebar-w");
      try { localStorage.removeItem(SB_KEY); } catch (e) {}
      if (root.dataset.sidebar === "collapsed") setCollapsed(false);
      sync();
    }
    sync();

    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || isMobile()) return;
      e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      root.classList.add("sidebar-resizing");
      const onMove = (ev) => {
        const x = ev.clientX;
        const collapsed = root.dataset.sidebar === "collapsed";
        if (x < SB_SNAP) { if (!collapsed) setCollapsed(true); return; }
        if (collapsed) setCollapsed(false);
        setWidth(x, false);
      };
      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        root.classList.remove("sidebar-resizing");
        if (Nimbus.updateContentWidth) setTimeout(Nimbus.updateContentWidth, 120);
        if (root.dataset.sidebar !== "collapsed") store.set(SB_KEY, String(clamp(current())));
        sync();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp, { once: true });
      handle.addEventListener("pointercancel", onUp, { once: true });
    });
    handle.addEventListener("dblclick", reset);
    handle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 48 : 16;
      const collapsed = root.dataset.sidebar === "collapsed";
      if (e.key === "ArrowLeft") {
        if (!collapsed && current() - step < SB_MIN) setCollapsed(true); else if (!collapsed) setWidth(current() - step);
      } else if (e.key === "ArrowRight") {
        if (collapsed) setCollapsed(false); else setWidth(current() + step);
      } else if (e.key === "Home") { if (collapsed) setCollapsed(false); setWidth(SB_MIN); }
      else if (e.key === "End") { if (collapsed) setCollapsed(false); setWidth(SB_MAX); }
      else if (e.key === "Enter") reset();
      else return;
      e.preventDefault();
      sync();
    });
  }

  /* ------------------------------------------------------------------------
     NAV PROGRESS BAR - thin bar at the top while the next page loads.
     ---------------------------------------------------------------------- */
  function initNavProgress() {
    const bar = document.querySelector(".nav-progress");
    if (!bar) return;
    if (session.get("nimbus-navigating")) {
      session.del("nimbus-navigating");
      bar.classList.add("is-finishing");
      bar.addEventListener("animationend", () => bar.classList.remove("is-finishing"), { once: true });
    }
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === "_blank" || a.hasAttribute("download") || a.origin !== location.origin) return;
      if (a.getAttribute("href").startsWith("#") || (a.pathname === location.pathname && a.search === location.search)) return;
      session.set("nimbus-navigating", "1");
      bar.classList.remove("is-finishing");
      bar.classList.add("is-loading");
    });
    // Back/forward cache restore: clear any leftover state.
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) { bar.classList.remove("is-loading", "is-finishing"); session.del("nimbus-navigating"); }
    });
  }

  /* ------------------------------------------------------------------------
     CONTENT WIDTH - html[data-content] = lg (>= 900) | md (560-899) | sm.
     The shared .grid columns (base.css) reflow on it, so layouts react to
     the sidebar (expanded / rail / dragged width), not only the viewport.
     The head script sets a first estimate before paint.
     ---------------------------------------------------------------------- */
  function initContentWidth() {
    const page = document.querySelector("main.page");
    if (!page || !("ResizeObserver" in window)) return;
    const update = () => {
      const cs = getComputedStyle(page);
      const w = page.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const bucket = w >= 900 ? "lg" : w >= 560 ? "md" : "sm";
      if (root.dataset.content !== bucket) root.dataset.content = bucket;
    };
    // Apply only once the width has settled (sidebar drag / collapse
    // transition / window resize), so grids never flip back and forth mid-move.
    let timer;
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!root.classList.contains("sidebar-resizing")) update(); }, 120);
    };
    new ResizeObserver(settle).observe(page);
    Nimbus.updateContentWidth = update;
    update();
  }

  function init() {
    initContentWidth();
    initNavPill();
    initSidebarResize();
    initNavProgress();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
