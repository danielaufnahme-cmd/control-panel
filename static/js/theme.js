/* ==========================================================================
   NIMBUS THEME  -  light/dark with a short, calm crossfade
   --------------------------------------------------------------------------
   * Light is the default. The choice persists in localStorage ("nimbus-theme").
   * templates/base.html applies the saved theme in an inline <head> script
     BEFORE first paint, so there is never a flash of the wrong theme.
   * Toggle: any element with [data-theme-toggle] (sidebar footer button).
   * Where supported, the whole page crossfades to the new theme via a View
     Transition (one snapshot, --dur-base). Otherwise a short colour
     transition is used (html.theme-fading in animations.css). No circular
     reveal or other flourish: this is B2B software.
     (`origin` is still accepted by set()/toggle() for compatibility, unused.)
   * Fires `nimbus:themechange` on document with detail { theme } -
     SYNCHRONOUSLY inside the transition, so charts can re-theme before the
     "new" snapshot is taken (see charts.js).

   API:
     Nimbus.theme.get()                  -> "light" | "dark"
     Nimbus.theme.set("dark", { origin: buttonEl })
     Nimbus.theme.toggle(originEl)
   ========================================================================== */
(function () {
  "use strict";
  const Nimbus = (window.Nimbus = window.Nimbus || {});
  const root = document.documentElement;
  const KEY = "nimbus-theme";

  const get = () => (root.dataset.theme === "dark" ? "dark" : "light");

  /** Toggle buttons expose state via aria-pressed (the switch reads it). */
  function syncButtons() {
    const dark = get() === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => btn.setAttribute("aria-pressed", dark ? "true" : "false"));
  }

  function apply(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode etc. */ }
    syncButtons();
    document.dispatchEvent(new CustomEvent("nimbus:themechange", { detail: { theme } }));
  }

  function set(theme, opts = {}) {
    if (theme === get()) return;
    const canVT = typeof document.startViewTransition === "function" && !Nimbus.reducedMotion;

    if (!canVT) {
      // Fallback: brief color crossfade.
      if (!Nimbus.reducedMotion) {
        root.classList.add("theme-fading");
        setTimeout(() => root.classList.remove("theme-fading"), (Nimbus.ms ? Nimbus.ms("--dur-base") : 250) + 60);
      }
      apply(theme);
      return;
    }

    // Whole-page crossfade (one snapshot; see html.vt-theme in animations.css).
    root.classList.add("vt-theme");
    const vt = document.startViewTransition(() => apply(theme));
    vt.finished.finally(() => root.classList.remove("vt-theme"));
  }

  Nimbus.theme = {
    get,
    set,
    toggle: (origin) => set(get() === "dark" ? "light" : "dark", { origin }),
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-toggle]");
    if (btn) Nimbus.theme.toggle(btn);
  });

  // Keep multiple open tabs in sync.
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && (e.newValue === "dark" || e.newValue === "light")) apply(e.newValue);
  });

  // Sync button state with whatever the head script applied.
  document.addEventListener("DOMContentLoaded", syncButtons);
})();
