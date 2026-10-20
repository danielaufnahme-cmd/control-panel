/* ==========================================================================
   NIMBUS MOTION  -  reusable animation primitives
   --------------------------------------------------------------------------
   Load order: motion.js -> theme.js -> charts.js -> app.js -> pages/*.js
   Everything hangs off one global:  window.Nimbus

   DECLARATIVE (just add attributes; Nimbus.init() wires them up):
     data-animate="fade-up|fade-in|scale-in|slide-left|slide-right|blur-in"
     data-animate-delay="120"            extra delay (ms)
     data-stagger[="fade-up|..."]        direct children reveal one by one
     data-stagger-delay="60"             ms between children (default 40)
     data-countup="12345"                number counts up when revealed
        data-prefix="$" data-suffix="%" data-decimals="2"
        data-duration="700" data-format="compact"
     data-progress="72"                  .progress bar fills when revealed
     data-tabs                           sliding-indicator tabs (see initTabs)
     data-tooltip="Text"                 floating tooltip
        data-tooltip-pos="top|bottom|left|right"
     data-dropdown / data-dropdown-trigger    animated dropdown menu
     data-open-modal="id" / data-close-modal  animated <dialog> modal/drawer
     .btn or data-ripple                 material-style ripple on press

   IMPERATIVE (JS API):
     Nimbus.init(root)                   scan a subtree (call after inserting HTML)
     Nimbus.reveal(el)                   force-reveal an element now
     Nimbus.countTo(el, value, opts)     animate a number to a new value
     Nimbus.setProgress(el, value)       animate a .progress to a value
     Nimbus.pop(el) / bump(el) / shake(el)   one-shot attention animations
     Nimbus.toast(msg, type, opts)       toast notification -> { dismiss() }
     Nimbus.modal.open(id) / .close(id)  modal + drawer (same API)
     Nimbus.dropdown.open(el) / .close(el) / .closeAll()
     Nimbus.loading(btn, bool)           spinner state on a .btn
     Nimbus.flip(container, mutate, opts)    FLIP-animate layout changes
     Nimbus.animate(el, keyframes, opts) WAAPI wrapper honouring reduced motion
     Nimbus.reducedMotion                true if the user prefers less motion
     Nimbus.ms("--dur-base")             read a duration token as a number
   ========================================================================== */
(function () {
  "use strict";

  const Nimbus = (window.Nimbus = window.Nimbus || {});
  const root = document.documentElement;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  Object.defineProperty(Nimbus, "reducedMotion", { get: () => motionQuery.matches });

  /** Children past this index all share the same delay, so long lists
   *  never take more than MAX_STAGGER * --stagger to finish appearing. */
  const MAX_STAGGER = 12;

  /* ------------------------------------------------------------------------
     Tokens & easing helpers
     ---------------------------------------------------------------------- */

  /** Read a CSS custom property from :root, e.g. Nimbus.token("--primary"). */
  Nimbus.token = (name, el = root) => getComputedStyle(el).getPropertyValue(name).trim();

  /** Read a duration token as milliseconds: Nimbus.ms("--dur-base") -> 250 */
  Nimbus.ms = (name, el) => {
    const v = Nimbus.token(name, el);
    if (!v) return 0;
    return v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000;
  };

  /** JS twins of the CSS easing tokens, for rAF-driven animations. */
  Nimbus.ease = {
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };

  /** CSS-string twins for WAAPI (element.animate). Keep in sync with tokens.css. */
  Nimbus.easing = {
    outExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
    outQuart: "cubic-bezier(0.25, 1, 0.5, 1)",
    in: "cubic-bezier(0.5, 0, 0.75, 0)",
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    // Legacy names: no longer overshoot (the product never bounces).
    spring: "cubic-bezier(0.2, 0.9, 0.3, 1)",
    springSoft: "cubic-bezier(0.22, 1, 0.36, 1)",
  };

  /**
   * Thin wrapper around element.animate() that becomes instant under
   * prefers-reduced-motion. Returns the Animation (or a resolved stub).
   */
  Nimbus.animate = function (el, keyframes, opts = {}) {
    const o = Object.assign({ duration: 250, easing: Nimbus.easing.outExpo, fill: "none" }, opts);
    if (Nimbus.reducedMotion) o.duration = 1;
    if (!el.animate) return { finished: Promise.resolve(), cancel() {} };
    return el.animate(keyframes, o);
  };

  /** Restart a CSS animation class on an element (used by pop/bump/shake). */
  function replayClass(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // force reflow so the animation restarts
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }
  /** Small fade/scale-in for something new (no overshoot). */
  Nimbus.pop = (el) => replayClass(el, "is-popping");
  /** Quick "I changed" cue (brief dim, no scaling). For counters/badges. */
  Nimbus.bump = (el) => replayClass(el, "is-bumping");
  /** Invalid-input cue: a muted danger ring flashes once (legacy name, no wiggle). */
  Nimbus.shake = (el) => replayClass(el, "is-shaking");

  /* ------------------------------------------------------------------------
     REVEAL  (data-animate / data-stagger)
     One IntersectionObserver for the whole page. When an element enters the
     viewport it gets .is-revealed; CSS (animations.css) does the rest.
     ---------------------------------------------------------------------- */

  const staggerMs = () => Nimbus.ms("--stagger") || 0;
  const revealCallbacks = new WeakMap(); // el -> [fn] run when el reveals

  /**
   * How long (ms) until `el`'s nearest animated ancestor starts animating.
   * Used so count-ups, progress bars and nested staggers wait for the card
   * they live in instead of running before it is visible.
   */
  function revealDelay(el) {
    const anim = el.closest("[data-animate], [data-stagger] > *");
    if (!anim) return 0;
    const cs = getComputedStyle(anim);
    const delay = parseFloat(cs.getPropertyValue("--delay")) || 0;
    const isChild = anim.parentElement && anim.parentElement.hasAttribute("data-stagger");
    const i = isChild ? parseFloat(cs.getPropertyValue("--i")) || 0 : 0;
    const step = isChild ? parseFloat(getComputedStyle(anim.parentElement).getPropertyValue("--stagger")) || staggerMs() : 0;
    return delay + i * step;
  }
  Nimbus.revealDelay = revealDelay;

  function runRevealCallbacks(el) {
    const fns = revealCallbacks.get(el);
    if (!fns) return;
    revealCallbacks.delete(el);
    fns.forEach((fn) => fn());
  }

  /** Reveal immediately (e.g. content inserted after a fetch). */
  Nimbus.reveal = function (el) {
    el.classList.add("is-revealed");
    runRevealCallbacks(el);
  };

  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              io.unobserve(entry.target);
              Nimbus.reveal(entry.target);
            });
          },
          { rootMargin: "0px 0px -6% 0px", threshold: 0 }
        )
      : null;

  /** Call fn once `el` is on screen (immediately if no IO support). */
  function onVisible(el, fn) {
    if (!io) return fn();
    const list = revealCallbacks.get(el) || [];
    list.push(fn);
    revealCallbacks.set(el, list);
    io.observe(el);
  }
  Nimbus.onVisible = onVisible;

  function setupReveal(el) {
    if (el.hasAttribute("data-animate-delay")) {
      el.style.setProperty("--delay", parseFloat(el.dataset.animateDelay) + "ms");
    }
    if (el.hasAttribute("data-stagger")) {
      if (el.hasAttribute("data-stagger-delay")) {
        el.style.setProperty("--stagger", parseFloat(el.dataset.staggerDelay) + "ms");
      }
      Array.from(el.children).forEach((child, i) => child.style.setProperty("--i", Math.min(i, MAX_STAGGER)));
      // A stagger group nested inside an animated card starts after the card.
      const parentAnim = el.parentElement && el.parentElement.closest("[data-animate], [data-stagger] > *");
      if (parentAnim && !el.hasAttribute("data-animate-delay")) {
        el.style.setProperty("--delay", revealDelay(el.parentElement) + 90 + "ms");
      }
    }
    if (io) io.observe(el);
    else Nimbus.reveal(el);
  }

  /* ------------------------------------------------------------------------
     COUNT-UP  (data-countup)
     ---------------------------------------------------------------------- */

  function formatNumber(value, el) {
    // House rule: every percentage shows exactly 1 decimal ("12.0%").
    const isPct = (el.dataset.suffix || "").trim().startsWith("%");
    const decimals = isPct ? 1 : parseInt(el.dataset.decimals || "0", 10);
    const opts = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    if (el.dataset.format === "compact") {
      Object.assign(opts, { notation: "compact", maximumFractionDigits: Math.max(decimals, 1), minimumFractionDigits: 0 });
    }
    const text = new Intl.NumberFormat("en-US", opts).format(value);
    return (el.dataset.prefix || "") + text + (el.dataset.suffix || "");
  }

  /**
   * Animate el's number from its current value to `to`.
   *   Nimbus.countTo(el, 1520)                      // uses el's data-prefix etc.
   *   Nimbus.countTo(el, 99.5, { duration: 400, bump: true })
   */
  Nimbus.countTo = function (el, to, opts = {}) {
    const from = opts.from != null ? opts.from : el._nimbusValue != null ? el._nimbusValue : 0;
    const duration = Nimbus.reducedMotion ? 0 : opts.duration || parseFloat(el.dataset.duration) || Nimbus.ms("--dur-data") || 700;
    const ease = opts.easing || Nimbus.ease.outExpo;
    cancelAnimationFrame(el._nimbusRaf);
    el._nimbusValue = to;
    if (opts.bump) Nimbus.bump(el);
    if (!duration) { el.textContent = formatNumber(to, el); return; }
    let start = null;
    const tick = (now) => {
      // Use the first frame's timestamp as t=0 (rAF time can be slightly
      // earlier than performance.now(), which would make t negative).
      if (start === null) start = now;
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      el.textContent = formatNumber(from + (to - from) * ease(t), el);
      if (t < 1) el._nimbusRaf = requestAnimationFrame(tick);
    };
    el._nimbusRaf = requestAnimationFrame(tick);
  };

  function setupCountUp(el) {
    const target = parseFloat(el.dataset.countup);
    if (isNaN(target)) return;
    el._nimbusValue = 0;
    el.textContent = formatNumber(0, el);
    onVisible(el, () => {
      setTimeout(() => Nimbus.countTo(el, target), revealDelay(el) + 60);
    });
  }

  /* ------------------------------------------------------------------------
     PROGRESS  (data-progress on .progress)
     ---------------------------------------------------------------------- */

  /** Nimbus.setProgress(el, 64) - animates the bar's width (CSS transition). */
  Nimbus.setProgress = function (el, value) {
    el.style.setProperty("--value", Math.max(0, Math.min(100, value)));
    el.setAttribute("aria-valuenow", Math.round(value));
  };

  function setupProgress(el) {
    const value = parseFloat(el.dataset.progress) || 0;
    el.setAttribute("role", "progressbar");
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", "100");
    onVisible(el, () => {
      el.style.setProperty("--progress-delay", revealDelay(el) + 80 + "ms");
      requestAnimationFrame(() => Nimbus.setProgress(el, value));
    });
  }

  /* ------------------------------------------------------------------------
     RIPPLE  (.btn, [data-ripple]; opt out with data-no-ripple)
     ---------------------------------------------------------------------- */
  document.addEventListener("pointerdown", (e) => {
    const host = e.target.closest(".btn, [data-ripple]");
    if (!host || host.hasAttribute("data-no-ripple") || Nimbus.reducedMotion || e.button !== 0) return;
    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
    host.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });

  /** Nimbus.loading(btn, true) shows a spinner and blocks clicks; false restores. */
  Nimbus.loading = function (btn, on) {
    btn.classList.toggle("is-loading", !!on);
    btn.setAttribute("aria-busy", on ? "true" : "false");
  };

  /* ------------------------------------------------------------------------
     TABS
     <div class="tabs" data-tabs [data-tabs-target="#panels"]>
       <button class="tab is-active" data-tab="a">A</button>
       <button class="tab" data-tab="b">B</button>
     </div>
     <div id="panels"><div data-tab-panel="a">..</div><div data-tab-panel="b" hidden>..</div></div>
     Fires `nimbus:tabchange` (bubbles) with detail { value, tab }.
     ---------------------------------------------------------------------- */
  function setupTabs(tabs) {
    tabs.setAttribute("role", "tablist");
    let indicator = tabs.querySelector(".tabs-indicator");
    if (!indicator) {
      indicator = document.createElement("span");
      indicator.className = "tabs-indicator";
      tabs.appendChild(indicator);
    }
    const items = () => Array.from(tabs.querySelectorAll("[data-tab]"));
    const place = (tab, instant) => {
      if (!tab) return;
      if (instant) indicator.classList.add("no-anim");
      indicator.style.setProperty("--x", tab.offsetLeft + "px");
      indicator.style.setProperty("--w", tab.offsetWidth + "px");
      if (instant) { void indicator.offsetWidth; indicator.classList.remove("no-anim"); }
    };
    const active = () => tabs.querySelector("[data-tab].is-active") || items()[0];

    function select(tab, focus) {
      if (!tab || tab.classList.contains("is-active")) return;
      items().forEach((t) => {
        const on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
      if (focus) tab.focus();
      place(tab);
      const value = tab.dataset.tab;
      const target = tabs.dataset.tabsTarget && document.querySelector(tabs.dataset.tabsTarget);
      if (target) {
        target.querySelectorAll(":scope > [data-tab-panel]").forEach((panel) => {
          const show = panel.dataset.tabPanel === value;
          panel.hidden = !show;
          if (show) { panel.classList.remove("is-entering"); void panel.offsetWidth; panel.classList.add("is-entering"); }
        });
      }
      tabs.dispatchEvent(new CustomEvent("nimbus:tabchange", { bubbles: true, detail: { value, tab } }));
    }

    items().forEach((t) => {
      t.setAttribute("role", "tab");
      t.setAttribute("aria-selected", t.classList.contains("is-active") ? "true" : "false");
      t.tabIndex = t.classList.contains("is-active") ? 0 : -1;
    });
    tabs.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-tab]");
      if (tab && tabs.contains(tab)) select(tab);
    });
    tabs.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const list = items();
      const idx = list.indexOf(active());
      const next = list[(idx + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
      select(next, true);
      e.preventDefault();
    });

    place(active(), true);
    // Re-measure when fonts load or the container resizes (no animation).
    if (document.fonts) document.fonts.ready.then(() => place(active(), true));
    if ("ResizeObserver" in window) new ResizeObserver(() => place(active(), true)).observe(tabs);
    tabs._nimbusSelect = (value) => select(tabs.querySelector(`[data-tab="${value}"]`));
  }
  /** Programmatically select a tab: Nimbus.selectTab(tabsEl, "30d") */
  Nimbus.selectTab = (tabs, value) => tabs._nimbusSelect && tabs._nimbusSelect(value);

  /* ------------------------------------------------------------------------
     DROPDOWN
     <div class="dropdown" data-dropdown>
       <button data-dropdown-trigger aria-haspopup="menu">..</button>
       <div class="dropdown-menu" role="menu">
         <a class="dropdown-item" href="#">..</a>
       </div>
     </div>
     Fires `nimbus:dropdown` on the wrapper with detail { open }.
     ---------------------------------------------------------------------- */
  const dropdown = (Nimbus.dropdown = {
    open(dd) {
      if (!dd || dd.classList.contains("is-open")) return;
      dropdown.closeAll(dd);
      dd.querySelectorAll(".dropdown-item, .notif-item").forEach((item, i) => item.style.setProperty("--i", Math.min(i, 10)));
      dd.classList.add("is-open");
      const trigger = dd.querySelector("[data-dropdown-trigger]");
      if (trigger) trigger.setAttribute("aria-expanded", "true");
      dd.dispatchEvent(new CustomEvent("nimbus:dropdown", { bubbles: true, detail: { open: true } }));
    },
    close(dd, returnFocus) {
      if (!dd || !dd.classList.contains("is-open")) return;
      dd.classList.remove("is-open");
      const trigger = dd.querySelector("[data-dropdown-trigger]");
      if (trigger) {
        trigger.setAttribute("aria-expanded", "false");
        if (returnFocus) trigger.focus();
      }
      dd.dispatchEvent(new CustomEvent("nimbus:dropdown", { bubbles: true, detail: { open: false } }));
    },
    toggle(dd) { dd.classList.contains("is-open") ? dropdown.close(dd) : dropdown.open(dd); },
    closeAll(except) {
      document.querySelectorAll("[data-dropdown].is-open").forEach((dd) => dd !== except && dropdown.close(dd));
    },
  });

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-dropdown-trigger]");
    if (trigger) {
      dropdown.toggle(trigger.closest("[data-dropdown]"));
      return;
    }
    if (e.target.closest("[data-dropdown-close]")) {
      dropdown.close(e.target.closest("[data-dropdown]"));
      return;
    }
    const inside = e.target.closest("[data-dropdown]");
    dropdown.closeAll(inside);
  });

  /* ------------------------------------------------------------------------
     MODAL & DRAWER  (native <dialog class="modal"> / <dialog class="modal drawer">)
     Open:  <button data-open-modal="my-id">   or  Nimbus.modal.open("my-id")
     Close: <button data-close-modal>          or  Nimbus.modal.close("my-id")
            Esc and backdrop click also close (with the exit animation).
     ---------------------------------------------------------------------- */
  const getDialog = (ref) => (typeof ref === "string" ? document.getElementById(ref) : ref);
  const modal = (Nimbus.modal = {
    open(ref) {
      const dlg = getDialog(ref);
      if (!dlg || dlg.open) return;
      dlg.classList.remove("is-closing");
      if (dlg.showModal) dlg.showModal();
      else dlg.setAttribute("open", "");
      const focusEl = dlg.querySelector("[autofocus]");
      if (focusEl) focusEl.focus();
      dlg.dispatchEvent(new CustomEvent("nimbus:modal", { bubbles: true, detail: { open: true } }));
    },
    close(ref) {
      const dlg = getDialog(ref);
      if (!dlg || !dlg.open || dlg.classList.contains("is-closing")) return;
      const finish = () => {
        dlg.classList.remove("is-closing");
        if (dlg.close) dlg.close();
        else dlg.removeAttribute("open");
        dlg.dispatchEvent(new CustomEvent("nimbus:modal", { bubbles: true, detail: { open: false } }));
      };
      if (Nimbus.reducedMotion) return finish();
      dlg.classList.add("is-closing");
      const panel = dlg.querySelector(".modal-panel") || dlg;
      panel.addEventListener("animationend", finish, { once: true });
      setTimeout(() => dlg.classList.contains("is-closing") && finish(), 500); // safety net
    },
  });
  Nimbus.drawer = modal; // same API, different CSS class

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open-modal]");
    if (opener) { e.preventDefault(); modal.open(opener.dataset.openModal); return; }
    const closer = e.target.closest("[data-close-modal]");
    if (closer) { e.preventDefault(); modal.close(closer.closest("dialog")); return; }
    // Click on the backdrop: the event target is the <dialog> itself.
    if (e.target.matches && e.target.matches("dialog.modal[open]")) modal.close(e.target);
  });
  document.addEventListener("cancel", (e) => {
    if (e.target.matches && e.target.matches("dialog.modal")) { e.preventDefault(); modal.close(e.target); }
  }, true);

  /* ------------------------------------------------------------------------
     TOASTS
       Nimbus.toast("Saved!")                          // info
       Nimbus.toast("Project created", "success")
       Nimbus.toast("Could not sync", "error", { title: "Sync failed", duration: 6000 })
       Nimbus.toast("Message archived.", "info", { action: { label: "Undo", onClick: restore } })
     Types: info | success | warning | error. Hovering the stack pauses the timers.
     Stack of at most 4 (oldest leaves). Dismiss = slide right + fade while the
     rest glide into the freed space (FLIP). "Clear all" shows with 2+ toasts.
     ---------------------------------------------------------------------- */
  const TOAST_ICONS = {
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    success: '<path d="M20 6 9 17l-5-5"/>',
    warning: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>',
    error: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  const svg = (paths) =>
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const MAX_TOASTS = 4;
  const TOAST_MS = 220;      // leave + glide duration (enter uses --dur-base)

  function toastRegion() {
    let region = document.querySelector(".toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    if (!region.querySelector(".toast-clear")) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "toast-clear";
      clear.textContent = "Clear all";
      clear.addEventListener("click", () => Nimbus.toast.clearAll());
      region.prepend(clear);
    }
    return region;
  }
  const liveToasts = (region) => Array.from(region.querySelectorAll(".toast:not(.is-leaving)"));
  const syncClear = (region) =>
    region.querySelector(".toast-clear").classList.toggle("is-visible", liveToasts(region).length >= 2);

  /**
   * FLIP glide for the stack: measure where every toast IS (mid-animation
   * included), run `mutate`, then animate each one from there to its new
   * slot. Interrupting a running glide continues smoothly from the current spot.
   */
  function glideToasts(region, mutate) {
    const items = liveToasts(region);
    const before = new Map(items.map((t) => [t, t.getBoundingClientRect()]));
    items.forEach((t) => { if (t._glide) { t._glide.cancel(); t._glide = null; } });
    mutate(before);
    items.forEach((t) => {
      if (t.classList.contains("is-leaving") || !t.isConnected) return;
      const dy = before.get(t).top - t.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) return;
      t._glide = Nimbus.animate(t, [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
        { duration: TOAST_MS, easing: Nimbus.easing.outQuart });
    });
  }

  /** Take toasts out of the flow, pinned where they visually are (rects
   *  measured BEFORE any change), relative to the region's fixed bottom. */
  function pinToasts(region, els, rects) {
    const rb = region.getBoundingClientRect().bottom;
    els.forEach((el) => {
      const r = rects.get(el);
      el.style.bottom = rb - r.bottom + "px";
      el.style.left = "0px"; el.style.right = "0px";
      el.classList.add("is-leaving");
    });
  }
  function slideOut(el, delay = 0) {
    const out = Nimbus.animate(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(24px)" }],
      { duration: TOAST_MS, delay, easing: Nimbus.easing.outQuart, fill: "forwards" });
    el._gone = out.finished.catch(() => {}).then(() => el.remove());
    return el._gone;
  }

  /** Slide one toast out to the right while the others glide into its space. */
  function leaveToast(el) {
    if (el._gone || !el.isConnected) return el._gone;
    const region = el.parentElement;
    glideToasts(region, (before) => pinToasts(region, [el], before));
    syncClear(region);
    return slideOut(el);
  }

  /**
   * Nimbus.toast(message, type?, { title, duration = 4000, action: { label, onClick } })
   * Returns { el, dismiss() }.
   */
  Nimbus.toast = function (message, type = "info", opts = {}) {
    const region = toastRegion();
    const duration = opts.duration || 4000;
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.style.setProperty("--toast-duration", duration + "ms");
    el.innerHTML = `
      <span class="toast-icon">${svg(TOAST_ICONS[type] || TOAST_ICONS.info)}</span>
      <div class="toast-content">
        ${opts.title ? `<div class="toast-title"></div>` : ""}
        <div class="toast-msg"></div>
      </div>
      <button class="icon-btn icon-btn--sm toast-close" type="button" aria-label="Dismiss">${svg(TOAST_ICONS.error)}</button>
      <span class="toast-timer"></span>`;
    if (opts.title) el.querySelector(".toast-title").textContent = opts.title;
    el.querySelector(".toast-msg").textContent = message;
    if (!opts.title) el.querySelector(".toast-msg").classList.add("toast-title");

    const dismiss = () => leaveToast(el);
    el.querySelector(".toast-close").addEventListener("click", dismiss);
    // Optional action button, e.g. { action: { label: "Undo", onClick() {} } }
    if (opts.action && opts.action.label) {
      const act = document.createElement("button");
      act.type = "button";
      act.className = "btn btn--ghost btn--sm toast-action";
      act.textContent = opts.action.label;
      act.addEventListener("click", () => { try { opts.action.onClick && opts.action.onClick(); } finally { dismiss(); } });
      el.insertBefore(act, el.querySelector(".toast-close"));
    }
    el.querySelector(".toast-timer").addEventListener("animationend", dismiss);

    // Enter: the stack glides up to make room, the new toast rises + fades in.
    glideToasts(region, () => region.appendChild(el));
    Nimbus.animate(el, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
      { duration: Nimbus.ms("--dur-base") || 220, easing: Nimbus.easing.outQuart });
    // Cap: the oldest leaves gracefully.
    const live = liveToasts(region);
    if (live.length > MAX_TOASTS) live.slice(0, live.length - MAX_TOASTS).forEach((t) => leaveToast(t));
    syncClear(region);
    return { el, dismiss };
  };

  /** Dismiss every toast (newest first, 30ms apart). Also behind the "Clear all" button. */
  Nimbus.toast.clearAll = function () {
    const region = document.querySelector(".toast-region");
    if (!region) return;
    const items = liveToasts(region);
    const rects = new Map(items.map((t) => [t, t.getBoundingClientRect()]));
    items.forEach((t) => { if (t._glide) { t._glide.cancel(); t._glide = null; } });
    pinToasts(region, items, rects);
    syncClear(region);
    items.reverse().forEach((t, i) => slideOut(t, Nimbus.reducedMotion ? 0 : i * 30));
  };

  /* ------------------------------------------------------------------------
     TOOLTIP  (data-tooltip="Text", data-tooltip-pos="top|bottom|left|right")
     One shared element. Shows after a short delay; once a tooltip is
     visible, moving to another target shows the next one INSTANTLY
     ("warm" mode) - the same trick native OS tooltips use.
     data-tooltip-when="collapsed" -> only when the sidebar is collapsed.
     ---------------------------------------------------------------------- */
  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.setAttribute("role", "tooltip");
  let tipTimer, tipTarget, warmUntil = 0;

  function placeTip(target) {
    const pos = target.dataset.tooltipPos || "top";
    const r = target.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 8;
    let x, y, fx = 0, fy = 0;
    if (pos === "right") { x = r.right + gap; y = r.top + r.height / 2 - t.height / 2; fx = -4; }
    else if (pos === "left") { x = r.left - gap - t.width; y = r.top + r.height / 2 - t.height / 2; fx = 4; }
    else if (pos === "bottom") { x = r.left + r.width / 2 - t.width / 2; y = r.bottom + gap; fy = -4; }
    else { x = r.left + r.width / 2 - t.width / 2; y = r.top - gap - t.height; fy = 4; }
    x = Math.max(8, Math.min(x, innerWidth - t.width - 8));
    y = Math.max(8, Math.min(y, innerHeight - t.height - 8));
    tip.style.setProperty("--tx", x + "px");
    tip.style.setProperty("--ty", y + "px");
    tip.style.setProperty("--from-x", fx + "px");
    tip.style.setProperty("--from-y", fy + "px");
  }
  function showTip(target) {
    if (target.dataset.tooltipWhen === "collapsed" && !(root.dataset.sidebar === "collapsed" && innerWidth > 900)) return;
    if (!tip.isConnected) document.body.appendChild(tip);
    tipTarget = target;
    tip.textContent = target.dataset.tooltip;
    const warm = performance.now() < warmUntil;
    tip.classList.toggle("is-instant", warm && tip.classList.contains("is-visible"));
    placeTip(target);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => tip.classList.add("is-visible"), warm ? 0 : 280);
  }
  function hideTip() {
    clearTimeout(tipTimer);
    if (tip.classList.contains("is-visible")) warmUntil = performance.now() + 350;
    tip.classList.remove("is-visible", "is-instant");
    tipTarget = null;
  }
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-tooltip]");
    if (t && t !== tipTarget) showTip(t);
    else if (!t && tipTarget) hideTip();
  });
  document.addEventListener("focusin", (e) => {
    const t = e.target.closest("[data-tooltip]");
    if (t) showTip(t);
  });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("pointerdown", hideTip);
  window.addEventListener("scroll", hideTip, { passive: true, capture: true });

  /* ------------------------------------------------------------------------
     FLIP  -  animate layout changes (filtering, sorting, adding items)
       Nimbus.flip(listEl, () => {
         items.forEach(i => i.hidden = !matches(i));   // any DOM mutation
       });
     Items that move glide to their new spot; items that appear fade/scale in.
     ---------------------------------------------------------------------- */
  Nimbus.flip = function (container, mutate, opts = {}) {
    const duration = opts.duration || Nimbus.ms("--dur-slow") || 400;
    const children = () => Array.from(container.children);
    const before = new Map();
    children().forEach((c) => { if (!c.hidden) before.set(c, c.getBoundingClientRect()); });
    mutate();
    children().forEach((c, i) => {
      if (c.hidden) return;
      const prev = before.get(c);
      const now = c.getBoundingClientRect();
      if (!prev) {
        Nimbus.animate(c, [{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], {
          duration: Nimbus.ms("--dur-base") || 250, delay: Math.min(i, MAX_STAGGER) * 15, easing: Nimbus.easing.outExpo, fill: "backwards",
        });
        return;
      }
      const dx = prev.left - now.left, dy = prev.top - now.top;
      if (!dx && !dy) return;
      Nimbus.animate(c, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration, easing: Nimbus.easing.outExpo });
    });
  };

  /* ------------------------------------------------------------------------
     INIT  -  idempotent; call Nimbus.init(newNode) after inserting HTML.
     ---------------------------------------------------------------------- */
  const done = new WeakSet();
  const once = (el, fn) => { if (!done.has(el)) { done.add(el); fn(el); } };

  Nimbus.init = function (scope = document) {
    const q = (sel) => {
      const list = Array.from(scope.querySelectorAll(sel));
      if (scope !== document && scope.matches && scope.matches(sel)) list.unshift(scope);
      return list;
    };
    // Order matters: stagger indexes (--i) must exist before delays are computed.
    q("[data-animate], [data-stagger]").forEach((el) => once(el, setupReveal));
    q("[data-countup]").forEach((el) => once(el, setupCountUp));
    q("[data-progress]").forEach((el) => once(el, setupProgress));
    q("[data-tabs]").forEach((el) => once(el, setupTabs));
    if (Nimbus.charts && Nimbus.charts.initSparklines) Nimbus.charts.initSparklines(scope);
  };

  // Escape closes the top-most open dropdown.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector("[data-dropdown].is-open");
    if (open) dropdown.close(open, true);
  });

  // Boot after ALL deferred scripts (charts.js, page scripts) have run.
  // Deferred scripts execute while readyState is "interactive", so we wait for
  // DOMContentLoaded; `load` is a fallback if this file is injected later.
  // Nimbus.init is idempotent, so a double call is harmless.
  const boot = () => Nimbus.init();
  if (document.readyState === "complete") boot();
  else {
    document.addEventListener("DOMContentLoaded", boot);
    window.addEventListener("load", boot);
  }
})();
