# Animations guide

This is the motion reference for **Control Panel**. It is written for two readers:

- **People** who want their site to stop feeling static without making it feel gimmicky.
- **AI coding agents** that were handed this repo and asked to "add animations like this" to another project.

Every pattern below lists **what it does**, **where it lives** in this repo, a **standalone snippet** that works in a plain HTML file (no Django, no build step), and **do / don't** notes. At the end, [Porting to your own site](#porting-to-your-own-site-any-framework) covers plain HTML, React and Vue, and includes a checklist for agents.

> Naming: the product is Control Panel. The code still uses the original `nimbus` identifiers (`window.Nimbus`, `nimbus-*` keyframes, the `nimbus/` Django package). When this guide says `Nimbus.x`, it means the JS API in `static/js/motion.js`.

---

## Contents

1. [Philosophy: calm, fast, never cute](#1-philosophy-calm-fast-never-cute)
2. [Motion tokens](#2-motion-tokens)
3. [Pattern catalogue](#3-pattern-catalogue)
4. [Porting to your own site (any framework)](#porting-to-your-own-site-any-framework)
5. [Testing and troubleshooting](#5-testing-and-troubleshooting)

---

## 1. Philosophy: calm, fast, never cute

Motion in a work tool exists to **explain**, not to entertain. Each animation has to answer one of these questions, or it doesn't belong:

- **Where did this come from?** A drawer slides from the edge, and a dropdown grows from its trigger.
- **What changed?** A number counts to its new value, and a list re-sorts by gliding rather than jumping.
- **Did my action register?** A button presses in, and a toast confirms the result.
- **Where am I?** The active nav pill slides to the page you picked.

### Rules

| Rule | Why |
|---|---|
| **150–400 ms.** Hover/press 150 ms, most enters 250 ms, larger travel 400 ms. Data motion (count-ups, bar fills, chart draw) may take 700 ms because it carries information. | Under ~100 ms, the motion can't be seen. Over ~400 ms, UI motion starts to feel like waiting. Users repeat the same actions hundreds of times a day. |
| **Exits are faster than enters** (150 ms vs 250 ms). | The user has already decided to dismiss something, so it should get out of the way. |
| **Ease-out for everything that enters or moves.** The default is `cubic-bezier(.16,1,.3,1)`. | A fast start feels responsive, and a soft landing feels precise. |
| **Ease-in for exits.** `cubic-bezier(.5,0,.75,0)` | The element accelerates away. Nobody needs to watch it leave. |
| **No overshoot, no bounce, no springs.** | Overshoot reads as playful. In a data tool it looks imprecise, and it gets tiring by the tenth repetition. |
| **No looping idle animation.** Nothing pulses, wiggles or floats while the user is reading. The only exceptions are loops that carry meaning: loading spinners, skeleton shimmer, and the dot on a "live" indicator. | Peripheral motion pulls attention away from the content. |
| **No bursts.** No confetti, particles or celebratory scale-ups. | Success is shown with a short toast, not a party. |
| **Animate `transform` and `opacity` only.** The two deliberate exceptions are progress-bar `width` and the sidebar `width`, where the size change is the point. | Transform and opacity run on the compositor and don't trigger layout. Animating `top`, `height` or `margin` causes jank. |
| **Small distances.** Elements travel 6, 12 or 24 px, not "from off-screen". | The eye should register a settle, not follow a journey. |
| **Stagger 40 ms, capped at 12 children.** | A 100-row list must not take 4 seconds to appear. Children after the 12th share the last delay. |
| **Respect `prefers-reduced-motion`.** All durations become 1 ms and all distances 0. | This is required for accessibility. Because everything reads tokens, it works with one media query. |
| **Never hide content without JS.** Pre-reveal hidden states apply only under `html.js`. | If a script fails, the page still shows everything. |
| **Reveal once.** Scroll reveals run the first time an element enters the viewport and never re-hide. | Re-animating content on every scroll is noise. |

### A quick test for any new animation

1. Would the UI be harder to understand without it? If not, cut it.
2. Repeat the interaction 20 times. Is it still pleasant? If not, make it shorter or remove it.
3. Turn on reduced motion. Does the UI still work and still communicate the state change?

---

## 2. Motion tokens

All motion values live in `static/css/tokens.css` as CSS custom properties. Components never hard-code a duration or easing.

| Token | Value | Use for |
|---|---|---|
| `--dur-instant` | 80ms | press feedback (`:active`) |
| `--dur-fast` | 150ms | hover, color changes, **exits** |
| `--dur-base` | 250ms | most enters: dropdowns, modals, page enter |
| `--dur-slow` | 400ms | larger travel: drawers, nav pill, reveal transforms |
| `--dur-data` | 700ms | count-ups, progress fills, sparkline draw |
| `--stagger` | 40ms | delay between staggered children |
| `--ease-out-expo` | `cubic-bezier(.16,1,.3,1)` | default for anything entering or moving |
| `--ease-out-quart` | `cubic-bezier(.25,1,.5,1)` | gentler, for opacity and color |
| `--ease-in` | `cubic-bezier(.5,0,.75,0)` | exits |
| `--ease-in-out` | `cubic-bezier(.65,0,.35,1)` | A-to-B movement that is fully visible (the theme reveal circle) |
| `--move-sm` / `--move-md` / `--move-lg` | 6 / 12 / 24px | reveal travel distances |

`--ease-spring` and `--ease-spring-soft` still exist in `tokens.css` under their legacy names, but they now map to ease-out curves with no overshoot. Don't reintroduce overshoot values.

JS mirrors, in `static/js/motion.js`:
- `Nimbus.easing.outExpo | outQuart | in | inOut`: CSS strings for `element.animate()`.
- `Nimbus.ease.outExpo | outQuart | outCubic | inOut`: functions `t => t'` for `requestAnimationFrame` loops.
- `Nimbus.ms("--dur-base")` returns `250`, reading the live token (so it returns 1 under reduced motion).
- `Nimbus.reducedMotion` is a live boolean.

### Starter block (copy this first)

**Every snippet in this guide assumes this block is on the page.** It's the portable core of `tokens.css`:

```html
<script>
  /* In <head>, before any CSS paints. Hidden pre-reveal states only apply
     with this class, so content is never invisible without JS. */
  document.documentElement.classList.add("js");
</script>
<style>
  :root {
    --dur-instant: 80ms;
    --dur-fast: 150ms;
    --dur-base: 250ms;
    --dur-slow: 400ms;
    --dur-data: 700ms;
    --stagger: 40ms;
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
    --ease-in: cubic-bezier(0.5, 0, 0.75, 0);
    --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
    --move-sm: 6px;
    --move-md: 12px;
    --move-lg: 24px;

    /* Colors used by the snippets. Replace with your own tokens. */
    --bg: #f5f6f7; --surface: #fff; --surface-2: #f7f8f9; --surface-3: #eceef0;
    --border: #e3e6e8; --text: #1f1f1f; --text-muted: #5b6168;
    --primary: #3c828d; --primary-soft: rgb(60 130 141 / 0.12);
    --success: #2f9e7a; --danger: #d64545;
  }
  @media (prefers-reduced-motion: reduce) {
    :root {
      --dur-instant: 1ms; --dur-fast: 1ms; --dur-base: 1ms;
      --dur-slow: 1ms; --dur-data: 1ms; --stagger: 0ms;
      --move-sm: 0px; --move-md: 0px; --move-lg: 0px;
    }
  }
</style>
<script>
  /* Tiny helpers used by several snippets. */
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
  const EASE_IN = "cubic-bezier(0.5, 0, 0.75, 0)";
</script>
```

Why 1 ms rather than 0? Some browsers skip `animationend` and `transitionend` for zero-length animations, and code that waits for those events would hang. 1 ms is effectively instant and the events still fire.

---

## 3. Pattern catalogue

| # | Pattern | Main file(s) |
|---|---|---|
| 3.1 | [Page enter](#31-page-enter) | `animations.css` `.page` |
| 3.2 | [Cross-document View Transitions](#32-cross-document-view-transitions) | `animations.css` §3a |
| 3.3 | [Sliding nav pill](#33-sliding-nav-pill) | `components.css` `.nav-indicator`, `app.js` `initNavPill()` |
| 3.4 | [Theme toggle: circular reveal](#34-theme-toggle-circular-reveal) | `theme.js` `set()` |
| 3.5 | [Sun / moon icon morph](#35-sun--moon-icon-morph) | `components.css` `.theme-icon` |
| 3.6 | [Sidebar collapse](#36-sidebar-collapse) | `components.css` `[data-sidebar="collapsed"]`, `app.js` `Nimbus.sidebar` |
| 3.7 | [Reveal on scroll + stagger](#37-reveal-on-scroll--stagger) | `animations.css` §1, `motion.js` `setupReveal()` |
| 3.8 | [Count-up numbers](#38-count-up-numbers) | `motion.js` `Nimbus.countTo()` |
| 3.9 | [Sparkline draw](#39-sparkline-draw) | `charts.js` `sparkline()`, `animations.css` `.sparkline-line` |
| 3.10 | [Chart draw-in and theming](#310-chart-draw-in-and-theming) | `charts.js` `drawIn()`, `create()`, `retheme()` |
| 3.11 | [Progress fill](#311-progress-fill) | `components.css` `.progress-bar`, `motion.js` `Nimbus.setProgress()` |
| 3.12 | [Tabs with sliding indicator](#312-tabs-with-sliding-indicator) | `motion.js` `setupTabs()`, `components.css` `.tabs-indicator` |
| 3.13 | [Dropdown menu](#313-dropdown-menu) | `components.css` `.dropdown-menu`, `motion.js` `Nimbus.dropdown` |
| 3.14 | [Modal and drawer](#314-modal-and-drawer) | `animations.css` `.modal`/`.drawer`, `motion.js` `Nimbus.modal` |
| 3.15 | [Toast](#315-toast) | `motion.js` `Nimbus.toast()`, `components.css` `.toast` |
| 3.16 | [Tooltip with warm mode](#316-tooltip-with-warm-mode) | `motion.js` `showTip()`, `components.css` `.tooltip` |
| 3.17 | [Ripple on press](#317-ripple-on-press) | `motion.js` pointerdown handler, `animations.css` `.ripple` |
| 3.18 | [Hover lift and press](#318-hover-lift-and-press) | `components.css` `.hover-lift`, `.btn:active` |
| 3.19 | [Button loading state](#319-button-loading-state) | `motion.js` `Nimbus.loading()`, `components.css` `.btn.is-loading` |
| 3.20 | [Shake on error, bump on change](#320-shake-on-error-bump-on-change) | `motion.js` `Nimbus.shake()`/`bump()`, `animations.css` |
| 3.21 | [FLIP filtering and sorting](#321-flip-filtering-and-sorting) | `motion.js` `Nimbus.flip()` |
| 3.22 | [Skeleton shimmer](#322-skeleton-shimmer) | `components.css` `.skeleton`, `analytics.js` `dropSkeleton()` |
| 3.23 | [Heatmap diagonal wave](#323-heatmap-diagonal-wave) | `pages/analytics.css` `.an-cell`, `analytics.js` `renderHeatmap()` |
| 3.24 | [Text swap](#324-text-swap) | `analytics.js` `swapText()` |
| 3.25 | [Navigation progress bar](#325-navigation-progress-bar) | `components.css` `.nav-progress`, `app.js` `initNavProgress()` |
| 3.26 | [Small details](#326-small-details) | various |
| 3.27 | [Page-level patterns](#327-page-level-patterns) | `pages/contacts.js`, `pages/projects.js` |

---

### 3.1 Page enter

**What:** On every load, the main content fades in and rises 6 px over 250 ms. Cards inside then cascade (see 3.7).

**Where:** `static/css/animations.css`, section 2: `.page { animation: nimbus-page-enter ... }`. `<main class="page">` is in `templates/base.html`.

```html
<style>
  .page { animation: page-enter var(--dur-base) var(--ease-out-expo) backwards; }
  @keyframes page-enter { from { opacity: 0; transform: translateY(var(--move-sm)); } }
</style>
<main class="page">…</main>
```

- **Do** use `backwards` fill mode, so the element shows its normal styles after the animation ends.
- **Do** keep it short. It runs on every navigation.
- **Don't** animate the whole `<body>`. Keep persistent chrome such as the sidebar still, so only the content changes.

---

### 3.2 Cross-document View Transitions

**What:** When a normal link navigates to another page, the browser morphs between the two documents. The sidebar stays perfectly still, the nav pill glides to the new item, and the old content fades out in 150 ms while the new page plays its own enter animation. Browsers without support just load the page normally, and 3.1 still plays.

**Where:** `static/css/animations.css`, section 3a: `@view-transition { navigation: auto; }`, `view-transition-name` on `.sidebar` and `.page`, and `nav-pill` on `.nav-indicator` (`components.css`).

```html
<style>
  @view-transition { navigation: auto; }           /* opt in, same-origin navigations only */

  .sidebar       { view-transition-name: sidebar; }  /* each name must be unique per page */
  .page          { view-transition-name: page; }
  .nav-indicator { view-transition-name: nav-pill; }

  ::view-transition-group(*)        { animation-duration: var(--dur-base); animation-timing-function: var(--ease-out-expo); }
  ::view-transition-group(nav-pill) { animation-duration: var(--dur-slow); }
  /* Old page: quick fade. New page: no VT animation, because its own .page enter plays. */
  ::view-transition-old(page)   { animation: vt-fade-out var(--dur-fast) var(--ease-in) both; }
  ::view-transition-new(page),
  ::view-transition-group(page) { animation: none; }
  @keyframes vt-fade-out { to { opacity: 0; } }

  @media (prefers-reduced-motion: reduce) { @view-transition { navigation: none; } }
</style>
```

Both pages need the CSS. Support: Chromium 126+, Safari 18.2+.

- **Do** give stable chrome (sidebar, header) a name so it doesn't crossfade with itself.
- **Do** make the old page leave fast. The new page is the one the user wants to see.
- **Don't** reuse a `view-transition-name` twice on one page. The transition is skipped if you do.
- **Don't** depend on it. Treat it as progressive enhancement.

---

### 3.3 Sliding nav pill

**What:** One highlight element sits behind the active sidebar item and slides to the clicked item over 400 ms, instead of the highlight jumping. It moves on click, before the next page arrives, so the UI responds in the same frame. Across page loads it is carried by the View Transition (3.2). In browsers without cross-document VT, its last position is saved in `sessionStorage` on `pagehide` and it slides from there.

**Where:** `static/css/components.css` `.nav-indicator` (transform `translateY(var(--y))`), `static/js/app.js` `initNavPill()`.

```html
<style>
  .nav { position: relative; }
  .nav-item { position: relative; z-index: 1; display: flex; align-items: center; height: 40px; padding: 0 14px; color: var(--text-muted); text-decoration: none; }
  .nav-item.is-active { color: var(--primary); }
  .nav-indicator {
    position: absolute; left: 0; right: 0; top: 0; height: 40px; border-radius: 10px;
    background: var(--primary-soft);
    transform: translateY(var(--y, 0px));
    transition: transform var(--dur-slow) var(--ease-out-expo);
  }
  .nav-indicator.no-anim { transition: none; }
</style>

<nav class="nav">
  <span class="nav-indicator" aria-hidden="true"></span>
  <a class="nav-item is-active" href="#a">Overview</a>
  <a class="nav-item" href="#b">Analytics</a>
  <a class="nav-item" href="#c">Contacts</a>
</nav>

<script>
  const nav = document.querySelector(".nav");
  const pill = nav.querySelector(".nav-indicator");
  function place(item, instant) {
    if (instant) pill.classList.add("no-anim");
    pill.style.setProperty("--y", item.offsetTop + "px");
    if (instant) { void pill.offsetWidth; pill.classList.remove("no-anim"); }   // reflow, then re-enable
  }
  place(nav.querySelector(".is-active"), true);                                // no slide on first paint
  nav.addEventListener("click", (e) => {
    const item = e.target.closest(".nav-item");
    if (!item) return;
    nav.querySelectorAll(".nav-item").forEach((i) => i.classList.toggle("is-active", i === item));
    place(item);
  });
</script>
```

- **Do** place it instantly on load (the `no-anim` class plus a forced reflow).
- **Do** move it with `transform` rather than `top`.
- **Don't** give each item its own background that fades in and out. One element that moves explains the change better.

---

### 3.4 Theme toggle: circular reveal

**What:** The new theme spreads out in a circle from the toggle button and covers the whole viewport in 480 ms. Where the View Transitions API isn't available (or under reduced motion), colors crossfade for 250 ms instead. The saved theme is applied by an inline `<head>` script before first paint, so the wrong theme never flashes.

**Where:** `static/js/theme.js` `set()`. The CSS is in `static/css/animations.css` §3b (`html.vt-theme`) and §3c (`html.theme-fading`). The head script is in `templates/base.html`. A `nimbus:themechange` event fires synchronously inside the transition, so charts re-color before the "new" snapshot is taken (see 3.10).

```html
<style>
  :root[data-theme="dark"] { --bg: #121417; --surface: #1a1d21; --text: #eceef0; --text-muted: #a3a9b0; }
  body { background: var(--bg); color: var(--text); }

  /* During the VT, the whole page is one snapshot, and the new one sits on top. */
  html.vt-theme * { view-transition-name: none !important; }
  html.vt-theme::view-transition-old(root),
  html.vt-theme::view-transition-new(root) { animation: none; mix-blend-mode: normal; }
  html.vt-theme::view-transition-new(root) { z-index: 2; }

  /* Fallback: short color crossfade. */
  html.theme-fading *, html.theme-fading *::before, html.theme-fading *::after {
    transition: background-color var(--dur-base) var(--ease-out-quart),
                border-color var(--dur-base) var(--ease-out-quart),
                color var(--dur-base) var(--ease-out-quart) !important;
  }
</style>
<script>
  /* In <head>: apply the saved theme before paint. */
  try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
</script>

<button id="theme-btn" type="button">Toggle theme</button>

<script>
  const root = document.documentElement;
  function apply(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch (e) {}
  }
  function setTheme(theme, origin) {
    if (!document.startViewTransition || reduced() || !origin) {
      if (!reduced()) {
        root.classList.add("theme-fading");
        setTimeout(() => root.classList.remove("theme-fading"), 310);
      }
      return apply(theme);
    }
    const r = origin.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add("vt-theme");
    const vt = document.startViewTransition(() => apply(theme));
    vt.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 480, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(() => {});
    vt.finished.finally(() => root.classList.remove("vt-theme"));
  }
  document.getElementById("theme-btn").addEventListener("click", (e) =>
    setTheme(root.dataset.theme === "dark" ? "light" : "dark", e.currentTarget));
</script>
```

- **Do** compute the radius to the **farthest** corner, so the circle always covers the screen.
- **Do** switch any canvas-based content (charts) synchronously inside the update callback.
- **Don't** let other `view-transition-name`s take part. They would be animated separately and look torn. That is what `html.vt-theme *` prevents.
- **Don't** forget the before-paint head script. A flash of the light theme on every load undoes all of this.

---

### 3.5 Sun / moon icon morph

**What:** The toggle icon changes shape instead of being swapped. In dark mode, the sun's core grows, a mask circle slides in to carve a crescent, and the rays shrink and rotate away. The change is driven purely by `[data-theme]`, so it also follows the theme when it is changed from another tab.

**Where:** The markup is in `templates/components/sidebar.html` (`svg.theme-icon`) and the CSS in `static/css/components.css` (`.theme-icon__core`, `__mask`, `__rays`).

```html
<style>
  .theme-icon { width: 20px; height: 20px; overflow: visible; color: var(--text-muted); }
  .theme-icon__core { transform-box: fill-box; transform-origin: center; transition: transform var(--dur-slow) var(--ease-out-expo); }
  .theme-icon__mask { transition: transform var(--dur-slow) var(--ease-out-expo); }
  .theme-icon__rays { transform-box: fill-box; transform-origin: center;
                      transition: transform var(--dur-slow) var(--ease-out-expo), opacity var(--dur-base); }
  [data-theme="dark"] .theme-icon__core { transform: scale(1.7); }
  [data-theme="dark"] .theme-icon__mask { transform: translate(-5px, 0); }
  [data-theme="dark"] .theme-icon__rays { transform: rotate(-60deg) scale(0.4); opacity: 0; }
</style>
<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
  <mask id="moon-mask">
    <rect x="-4" y="-4" width="32" height="32" fill="#fff"/>
    <circle class="theme-icon__mask" cx="25" cy="9" r="6.5" fill="#000"/>
  </mask>
  <circle class="theme-icon__core" cx="12" cy="12" r="4.6" fill="currentColor" mask="url(#moon-mask)"/>
  <g class="theme-icon__rays" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M12 1.8v2.2M12 20v2.2M4.8 4.8l1.5 1.5M17.7 17.7l1.5 1.5M1.8 12H4M20 12h2.2M4.8 19.2l1.5-1.5M17.7 6.3l1.5-1.5"/>
  </g>
</svg>
```

- **Do** use `transform-box: fill-box` so SVG parts scale around their own center.
- **Don't** crossfade two separate icons. A shape that morphs reads as a single control.

---

### 3.6 Sidebar collapse

**What:** The sidebar shrinks from 256 px to 76 px over 400 ms. At the same time, labels fade out in 150 ms, section titles turn into thin dividers, the collapse chevron rotates, badges shrink to dots, and tooltips start appearing on the icons. The state is saved and applied before paint. The `[` key toggles it.

**Where:** `static/css/components.css`: `.sidebar` (width transition) and the `@media (min-width: 901px) [data-sidebar="collapsed"] …` block. `static/js/app.js` holds `setCollapsed()` and `Nimbus.sidebar`. Tooltips use `data-tooltip-when="collapsed"` (motion.js).

```html
<style>
  .sidebar { width: 256px; overflow: hidden; border-right: 1px solid var(--border);
             transition: width var(--dur-slow) var(--ease-out-expo); }
  .sidebar .label { white-space: nowrap; transition: opacity var(--dur-fast) var(--ease-out-quart); }
  [data-sidebar="collapsed"] .sidebar { width: 76px; }
  [data-sidebar="collapsed"] .sidebar .label { opacity: 0; pointer-events: none; }
  .chevron { transition: transform var(--dur-slow) var(--ease-out-expo); }
  [data-sidebar="collapsed"] .chevron { transform: rotate(180deg); }
</style>
<script>
  /* head: restore before paint */
  try { if (localStorage.getItem("sidebar") === "collapsed") document.documentElement.dataset.sidebar = "collapsed"; } catch (e) {}
</script>
<aside class="sidebar">
  <button type="button" id="collapse"><span class="chevron">‹</span></button>
  <a href="#"><span class="icon">▢</span> <span class="label">Overview</span></a>
</aside>
<script>
  document.getElementById("collapse").addEventListener("click", () => {
    const root = document.documentElement;
    root.dataset.sidebar = root.dataset.sidebar === "collapsed" ? "expanded" : "collapsed";
    try { localStorage.setItem("sidebar", root.dataset.sidebar); } catch (e) {}
  });
</script>
```

This is one of the two places where `width` is animated on purpose: the content area really does need to reflow. Labels fade faster than the width changes, so they're gone before they would get clipped.

- **Do** use `white-space: nowrap` on labels so they don't wrap while the width shrinks.
- **Don't** animate the width of anything with expensive layout inside, such as a large table. Use transform-based off-canvas instead, the way the mobile drawer version does.

---

### 3.7 Reveal on scroll + stagger

**What:** Elements fade up 12 px as they enter the viewport, once. Wrapping a group with `data-stagger` makes each **direct child** start 40 ms after the previous one, capped at 12 steps. A stagger group nested inside an animated card waits for that card automatically. This is the main pattern that makes a dashboard feel put together rather than dumped on screen.

**Where:** The CSS is in `static/css/animations.css` §1 (`[data-animate]`, `[data-stagger]`, `nimbus-fade-up` and the other keyframes). The JS is `static/js/motion.js`: `setupReveal()`, a single shared `IntersectionObserver`, `MAX_STAGGER = 12`, and `revealDelay()`.

Variants: `data-animate="fade-up | fade-in | scale-in | slide-left | slide-right | blur-in"`, `data-animate-delay="120"`, `data-stagger="scale-in"`, `data-stagger-delay="60"`.

```html
<style>
  .js [data-animate]:not(.is-revealed),
  .js [data-stagger]:not(.is-revealed) > * { opacity: 0; }

  [data-animate].is-revealed,
  [data-stagger].is-revealed > * {
    animation: reveal-fade-up var(--dur-slow) var(--ease-out-expo) backwards;
  }
  [data-stagger].is-revealed > * { animation-delay: calc(var(--i, 0) * var(--stagger)); }
  [data-animate="fade-in"].is-revealed { animation-name: reveal-fade-in; animation-duration: var(--dur-base); }
  [data-animate="scale-in"].is-revealed { animation-name: reveal-scale-in; }

  @keyframes reveal-fade-up  { from { opacity: 0; transform: translateY(var(--move-md)); } }
  @keyframes reveal-fade-in  { from { opacity: 0; } }
  @keyframes reveal-scale-in { from { opacity: 0; transform: scale(0.95); } }
</style>

<h2 data-animate="fade-in">Dashboard</h2>
<section class="cards" data-stagger>
  <div class="card">A</div><div class="card">B</div><div class="card">C</div><div class="card">D</div>
</section>

<script>
  const MAX_STAGGER = 12;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);                       // reveal once
      e.target.classList.add("is-revealed");
    });
  }, { rootMargin: "0px 0px -6% 0px" });

  document.querySelectorAll("[data-animate], [data-stagger]").forEach((el) => {
    if (el.hasAttribute("data-stagger")) {
      [...el.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, MAX_STAGGER)));
    }
    io.observe(el);
  });
</script>
```

Two details matter:

- **`animation-fill-mode: backwards`, not `forwards`.** With `forwards`, the final keyframe's `transform` would stick and override hover transforms such as `.hover-lift`. With `backwards`, the element goes back to its own styles once the animation finishes.
- **Hidden states are scoped to `.js`.** If JavaScript never runs, nothing is invisible.

- **Do** observe the **group**, not every child. One observer entry per group is cheaper, and the cascade stays in sync.
- **Do** call your init again (`Nimbus.init(el)`) after inserting HTML.
- **Don't** stagger long lists past ~12 items, and don't re-reveal on scroll up.
- **Don't** move a stagger child in the DOM after it has revealed. Re-inserting a node restarts its CSS animation. To reorder, use CSS `order` (see 3.21).

---

### 3.8 Count-up numbers

**What:** A number rolls from 0 to its value over 700 ms with ease-out-expo when its card reveals, starting at the moment the card's stagger delay ends. When the value changes later (a range switch, a live counter), it tweens from the current value to the new one rather than restarting at 0.

**Where:** `static/js/motion.js`: `setupCountUp()`, `Nimbus.countTo(el, to, { duration, from, bump })` and `formatNumber()` (uses `Intl.NumberFormat`, and supports `data-prefix`, `data-suffix`, `data-decimals` and `data-format="compact"`). Used in `templates/components/stat_card.html`, `pages/overview.js` (revenue total, live visitors) and `pages/analytics.js` `setNumber()`.

```html
<strong class="kpi" data-countup="175782" data-prefix="$">$175,782</strong>

<script>
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  function countTo(el, to, duration = 700) {
    const from = el._value ?? 0;
    const fmt = (v) => (el.dataset.prefix || "") +
      new Intl.NumberFormat("en-US", { maximumFractionDigits: +(el.dataset.decimals || 0),
                                       minimumFractionDigits: +(el.dataset.decimals || 0) }).format(v) +
      (el.dataset.suffix || "");
    el._value = to;
    cancelAnimationFrame(el._raf);
    if (reduced()) { el.textContent = fmt(to); return; }
    let start = null;
    const tick = (now) => {
      start ??= now;                                   // first frame = t0 (avoids negative t)
      const t = Math.min(1, (now - start) / duration);
      el.textContent = fmt(from + (to - from) * easeOutExpo(t));
      if (t < 1) el._raf = requestAnimationFrame(tick);
    };
    el._raf = requestAnimationFrame(tick);
  }
  document.querySelectorAll("[data-countup]").forEach((el) => {
    const target = +el.dataset.countup;
    el._value = 0; el.textContent = (el.dataset.prefix || "") + "0";
    new IntersectionObserver(([e], obs) => {
      if (e.isIntersecting) { obs.disconnect(); countTo(el, target); }
    }).observe(el);
  });
</script>
```

- **Do** put the final value in the HTML as text, as a no-JS fallback that also helps SEO.
- **Do** use tabular figures (`font-variant-numeric: tabular-nums`, `.num` in the repo) so digits don't jitter while counting.
- **Do** cancel the previous rAF loop before starting a new one. Fast clicks would otherwise fight each other.
- **Don't** count up every small number on the page. Use it for headline figures.

---

### 3.9 Sparkline draw

**What:** A small SVG line draws itself from left to right, then its area gradient fades in and the end dot appears. All three are delayed to match the stagger slot of the card they sit in. The color comes from `currentColor`, so theme changes need no JS.

**Where:** `static/js/charts.js`: `sparkline(el, values)` (Catmull-Rom smoothing in `smoothPath()`) and `initSparklines()`. The CSS is in `static/css/animations.css` (`.sparkline-line`, `.sparkline-area`, `.sparkline-dot`, plus the paused-until-revealed rule). The markup is `<div class="sparkline" data-sparkline="3,5,4,8">`.

The trick is `pathLength="1"`: the path's length is normalized to 1, so `stroke-dasharray: 1; stroke-dashoffset: 1` hides it whatever its real length, and animating the offset to 0 draws it.

```html
<style>
  .spark { width: 120px; height: 36px; color: var(--primary); }
  .spark svg { width: 100%; height: 100%; overflow: visible; }
  .spark-line { stroke-dasharray: 1; stroke-dashoffset: 1;
                animation: draw var(--dur-data) var(--ease-out-quart) 120ms forwards; }
  .spark-area { animation: fade var(--dur-slow) var(--ease-out-quart) 380ms backwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes fade { from { opacity: 0; } }
</style>
<div class="spark" data-values="3,5,4,8,6,9,7,11"></div>
<script>
  document.querySelectorAll(".spark").forEach((el) => {
    const v = el.dataset.values.split(",").map(Number);
    const W = 100, H = 32, min = Math.min(...v), span = Math.max(...v) - min || 1;
    const pts = v.map((n, i) => [(i / (v.length - 1)) * W, 3 + (1 - (n - min) / span) * (H - 6)]);
    const d = "M" + pts.map((p) => p.join(",")).join(" L");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <path class="spark-area" d="${d} L${W},${H} L0,${H} Z" fill="currentColor" fill-opacity=".15"/>
      <path class="spark-line" d="${d}" pathLength="1" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  });
</script>
```

To replay the draw (on Analytics after a range change), the repo simply re-renders the SVG: `Nimbus.charts.sparkline(el, newValues)`. A fresh node starts a fresh animation.

- **Do** use `vector-effect="non-scaling-stroke"` with `preserveAspectRatio="none"`, so the stroke width stays constant when the SVG stretches.
- **Don't** draw lines in with a linear easing. Ease-out-quart reads as "pen lifts gently".

---

### 3.10 Chart draw-in and theming

**What:**
- **First render:** line points rise from the baseline in a quick left-to-right wave (320 ms spread across the whole series, whatever the number of points), bars grow with a small stagger, and doughnuts sweep around.
- **Later updates** (range tabs, toggled series) use Chart.js's normal ~450 ms transitions, so points glide to their new values.
- **Lazy:** a chart is built only when its canvas scrolls into view, timed with its card's reveal, so the draw-in is actually seen.
- **Theme switch:** colors are re-read from CSS tokens and applied with `update("none")`, which is instant and happens inside the theme View Transition, so the circle reveals an already re-colored chart.

**Where:** `static/js/charts.js`: `drawIn(type, count)`, `create(canvas, build, { lazy })`, `retheme()` (listens to `nimbus:themechange`), `tokens()`, `gradient()` and `applyDefaults()` (hover transitions of 150 ms, no points until hover). Usage is in `static/js/pages/overview.js` and `pages/analytics.js`. Chart.js 4.4.1 is vendored at `static/vendor/chart.umd.min.js`.

```html
<div style="position: relative; height: 260px"><canvas id="c"></canvas></div>
<script src="chart.umd.min.js"></script> <!-- vendor it; don't load it from a CDN at runtime -->
<script>
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const values = [12, 19, 14, 22, 18, 27, 24, 31, 29, 35];

  function drawIn(count) {
    if (reduced()) return false;
    const step = 320 / Math.max(1, count);              // whole wave takes ~320 ms
    const first = (ctx) => ctx.type === "data" && !ctx.chart.$drawn;
    return {
      duration: 450, easing: "easeOutQuart",
      onComplete: (a) => { a.chart.$drawn = true; },   // later updates use normal transitions
      y: {
        duration: 500, easing: "easeOutQuart",
        from: (ctx) => (first(ctx) ? ctx.chart.scales.y.getPixelForValue(ctx.chart.scales.y.min) : undefined),
        delay: (ctx) => (first(ctx) ? ctx.dataIndex * step : 0),
      },
    };
  }
  const build = () => ({
    type: "line",
    data: { labels: values.map((_, i) => "D" + (i + 1)),
            datasets: [{ data: values, borderColor: css("--primary"), tension: 0.38, pointRadius: 0, fill: false }] },
    options: { maintainAspectRatio: false, animation: drawIn(values.length), plugins: { legend: { display: false } },
               scales: { x: { grid: { display: false }, ticks: { color: css("--text-muted") } },
                         y: { grid: { color: css("--border") }, ticks: { color: css("--text-muted") } } } },
  });

  const canvas = document.getElementById("c");
  let chart;
  new IntersectionObserver(([e], obs) => {                // lazy: draw in when it's visible
    if (e.isIntersecting) { obs.disconnect(); chart = new Chart(canvas, build()); }
  }).observe(canvas);

  /* On theme change: copy fresh colors onto the live chart without animating. */
  function retheme() {
    if (!chart) return;
    const fresh = build();
    chart.options = fresh.options;
    Object.assign(chart.data.datasets[0], { borderColor: fresh.data.datasets[0].borderColor });
    chart.update("none");
  }
</script>
```

Call `retheme()` synchronously right after you flip `data-theme` (inside the `startViewTransition` callback, if you use 3.4).

- **Do** keep the total draw-in spread fixed (around 320 ms) instead of a fixed per-point delay. 365 points shouldn't take longer than 7.
- **Do** read every color from CSS tokens, never from JS constants, so dark mode works.
- **Don't** replay the first-render animation on data updates. Let points morph.

---

### 3.11 Progress fill

**What:** A bar fills from 0 to its value over 700 ms when revealed, starting after its card's stagger delay. On updates it animates from the current width. Several bars in a list use a per-row `--progress-delay` so they fill as a cascade.

**Where:** `static/css/components.css` `.progress` / `.progress-bar` (`width: calc(var(--value) * 1%)`, `transition: width var(--dur-data)`, `transition-delay: var(--progress-delay)`). `static/js/motion.js`: `setupProgress()` and `Nimbus.setProgress(el, value)`. Markup: `<div class="progress" data-progress="72"><div class="progress-bar"></div></div>`.

```html
<style>
  .progress { --value: 0; height: 8px; border-radius: 99px; background: var(--surface-3); overflow: hidden; }
  .progress-bar { height: 100%; border-radius: inherit; background: var(--primary);
                  width: calc(var(--value) * 1%);
                  transition: width var(--dur-data) var(--ease-out-expo) var(--progress-delay, 0ms); }
</style>
<div class="progress" data-progress="72" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar"></div></div>
<script>
  const setProgress = (el, v) => { el.style.setProperty("--value", v); el.setAttribute("aria-valuenow", Math.round(v)); };
  document.querySelectorAll("[data-progress]").forEach((el, i) => {
    new IntersectionObserver(([e], obs) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      el.style.setProperty("--progress-delay", i * 40 + "ms");
      requestAnimationFrame(() => setProgress(el, +el.dataset.progress)); // next frame, so the 0 state is painted
    }).observe(el);
  });
</script>
```

`width` is used on purpose here: the bar is clipped by its track, so the only layout it affects is its own.

- **Do** set the value one frame after the element is painted at 0, or the transition won't run.
- **Don't** animate progress with a linear easing. Ease-out reads as "settling on a value".

---

### 3.12 Tabs with sliding indicator

**What:** One underline (or pill, in the segmented variant) slides and resizes to the active tab over 400 ms. Content panels fade up 12 px when switched. Arrow keys move between tabs. The indicator re-measures without animating when fonts load or the container resizes.

**Where:** `static/js/motion.js` `setupTabs()` (inserts `.tabs-indicator`, sets `--x` and `--w`, fires `nimbus:tabchange`) and `Nimbus.selectTab()`. `static/css/components.css`: `.tabs`, `.tabs-indicator` and `.tabs--pill`. Panel animation: `[data-tab-panel].is-entering` in `animations.css`.

```html
<style>
  .tabs { position: relative; display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
  .tab { position: relative; z-index: 1; padding: 10px 12px; background: none; border: 0; color: var(--text-muted); cursor: pointer; transition: color var(--dur-fast); }
  .tab.is-active { color: var(--text); }
  .tabs-indicator { position: absolute; left: 0; bottom: -1px; height: 2px; background: var(--primary);
                    width: var(--w, 0px); transform: translateX(var(--x, 0px));
                    transition: transform var(--dur-slow) var(--ease-out-expo), width var(--dur-slow) var(--ease-out-expo); }
  .tabs-indicator.no-anim { transition: none; }
  .panel.is-entering { animation: panel-in var(--dur-base) var(--ease-out-expo); }
  @keyframes panel-in { from { opacity: 0; transform: translateY(var(--move-md)); } }
</style>

<div class="tabs" role="tablist">
  <button class="tab is-active" data-tab="a" role="tab">Week</button>
  <button class="tab" data-tab="b" role="tab">Month</button>
  <button class="tab" data-tab="c" role="tab">Year</button>
  <span class="tabs-indicator"></span>
</div>
<div class="panel" data-panel="a">Week…</div>
<div class="panel" data-panel="b" hidden>Month…</div>
<div class="panel" data-panel="c" hidden>Year…</div>

<script>
  const tabs = document.querySelector(".tabs"), ind = tabs.querySelector(".tabs-indicator");
  const place = (tab, instant) => {
    if (instant) ind.classList.add("no-anim");
    ind.style.setProperty("--x", tab.offsetLeft + "px");
    ind.style.setProperty("--w", tab.offsetWidth + "px");
    if (instant) { void ind.offsetWidth; ind.classList.remove("no-anim"); }
  };
  const active = () => tabs.querySelector(".is-active");
  place(active(), true);
  document.fonts?.ready.then(() => place(active(), true));
  new ResizeObserver(() => place(active(), true)).observe(tabs);

  tabs.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (!tab || tab === active()) return;
    tabs.querySelectorAll("[data-tab]").forEach((t) => t.classList.toggle("is-active", t === tab));
    place(tab);
    document.querySelectorAll("[data-panel]").forEach((p) => {
      p.hidden = p.dataset.panel !== tab.dataset.tab;
      if (!p.hidden) { p.classList.remove("is-entering"); void p.offsetWidth; p.classList.add("is-entering"); }
    });
  });
</script>
```

- **Do** animate `transform` for position. Width also changes here, but only on one 2 px element.
- **Do** re-measure after web fonts load. Tab widths change when the real font arrives.
- **Don't** fade between panels with an overlap (both visible at once). Hide the old one instantly and fade in the new one.

---

### 3.13 Dropdown menu

**What:** The menu opens in 250 ms, growing from its trigger's corner (scale 0.97 to 1, rising 6 px, fading in), and its items cascade in 25 ms apart. It closes in 150 ms with ease-in. It closes on outside click, `Esc`, or `[data-dropdown-close]`, and only one dropdown is open at a time.

**Where:** `static/css/components.css` `.dropdown-menu` and `.dropdown.is-open > .dropdown-menu` (including the `visibility` delay trick). `static/js/motion.js` `Nimbus.dropdown.open/close/toggle/closeAll` sets `--i` on items. The `menu-item-in` keyframes are in `animations.css`.

```html
<style>
  .dropdown { position: relative; display: inline-block; }
  .dropdown-menu {
    position: absolute; top: calc(100% + 8px); right: 0; min-width: 200px; padding: 6px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    box-shadow: 0 16px 40px -12px rgb(0 0 0 / .18);
    transform-origin: top right;
    /* closed: exit is faster and eases in; visibility flips AFTER the fade */
    opacity: 0; visibility: hidden; transform: translateY(-6px) scale(0.97);
    transition: opacity var(--dur-fast) var(--ease-in), transform var(--dur-fast) var(--ease-in),
                visibility 0s linear var(--dur-fast);
  }
  .dropdown.is-open > .dropdown-menu {
    opacity: 1; visibility: visible; transform: none;
    transition: opacity var(--dur-base) var(--ease-out-expo), transform var(--dur-base) var(--ease-out-expo), visibility 0s;
  }
  .dropdown-item { display: block; width: 100%; padding: 8px 10px; border: 0; background: none; text-align: left; border-radius: 6px; }
  .dropdown-item:hover { background: var(--surface-2); }
  .dropdown.is-open .dropdown-item {
    animation: item-in var(--dur-base) var(--ease-out-expo) backwards;
    animation-delay: calc(var(--i, 0) * 25ms + 40ms);
  }
  @keyframes item-in { from { opacity: 0; transform: translateY(-4px); } }
</style>

<div class="dropdown">
  <button type="button" data-trigger aria-haspopup="menu" aria-expanded="false">Options</button>
  <div class="dropdown-menu" role="menu">
    <button class="dropdown-item" role="menuitem">Edit</button>
    <button class="dropdown-item" role="menuitem">Duplicate</button>
    <button class="dropdown-item" role="menuitem">Archive</button>
  </div>
</div>

<script>
  const closeAll = (except) => document.querySelectorAll(".dropdown.is-open").forEach((d) => {
    if (d === except) return;
    d.classList.remove("is-open");
    d.querySelector("[data-trigger]").setAttribute("aria-expanded", "false");
  });
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-trigger]");
    const dd = e.target.closest(".dropdown");
    closeAll(trigger ? dd : null);
    if (!trigger) return;
    const open = dd.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", String(open));
    dd.querySelectorAll(".dropdown-item").forEach((it, i) => it.style.setProperty("--i", Math.min(i, 10)));
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeAll());
</script>
```

- **Do** set `transform-origin` to the corner nearest the trigger.
- **Do** delay `visibility: hidden` until the fade-out ends (`visibility 0s linear var(--dur-fast)`), so the menu stays clickable and visible while it fades, then drops out of the accessibility tree.
- **Don't** use `display: none` for the closed state. It can't be transitioned.

---

### 3.14 Modal and drawer

**What:** A native `<dialog>`. A modal panel enters in 250 ms (rising 10 px, scale 0.97 to 1) while the backdrop fades in. It exits in 150 ms with ease-in. A drawer slides in from the right over 400 ms and out over 250 ms. `Esc` and backdrop clicks also play the exit animation, because the native `cancel` event is intercepted.

**Where:** The CSS is in `static/css/animations.css` (`.modal[open] .modal-panel`, `.modal.is-closing`, `.drawer[open] .modal-panel`, and keyframes `modal-in`, `modal-out`, `drawer-in`, `drawer-out`) and `components.css` (`.modal`, `.drawer`, `.modal-panel`). The JS is `static/js/motion.js`: `Nimbus.modal.open/close` and `Nimbus.drawer`, which is the same API.

```html
<style>
  .modal { padding: 0; border: 0; background: transparent; width: min(480px, calc(100vw - 32px)); }
  .modal::backdrop { background: rgb(10 14 20 / .5); }
  .modal-panel { background: var(--surface); border-radius: 16px; padding: 24px; box-shadow: 0 28px 64px -16px rgb(0 0 0 / .3); }

  .modal[open] .modal-panel  { animation: modal-in var(--dur-base) var(--ease-out-expo); }
  .modal[open]::backdrop     { animation: fade-in var(--dur-base) var(--ease-out-quart); }
  .modal.is-closing .modal-panel { animation: modal-out var(--dur-fast) var(--ease-in) forwards; }
  .modal.is-closing::backdrop    { animation: fade-out var(--dur-fast) var(--ease-in) forwards; }
  @keyframes modal-in  { from { opacity: 0; transform: translateY(10px) scale(0.97); } }
  @keyframes modal-out { to   { opacity: 0; transform: translateY(6px) scale(0.98); } }
  @keyframes fade-in   { from { opacity: 0; } }
  @keyframes fade-out  { to   { opacity: 0; } }

  /* Drawer variant: <dialog class="modal drawer"> */
  .drawer { margin: 0 0 0 auto; height: 100vh; max-height: 100vh; width: min(420px, 100vw); }
  .drawer .modal-panel { height: 100%; border-radius: 16px 0 0 16px; }
  .drawer[open] .modal-panel      { animation: drawer-in var(--dur-slow) var(--ease-out-expo); }
  .drawer.is-closing .modal-panel { animation: drawer-out var(--dur-base) var(--ease-in) forwards; }
  @keyframes drawer-in  { from { transform: translateX(100%); } }
  @keyframes drawer-out { to   { transform: translateX(100%); } }
</style>

<button type="button" onclick="openModal('m')">Open</button>
<dialog class="modal" id="m">
  <div class="modal-panel">
    <h2>Hello</h2>
    <button type="button" data-close>Close</button>
  </div>
</dialog>

<script>
  function openModal(id) { const d = document.getElementById(id); d.classList.remove("is-closing"); d.showModal(); }
  function closeModal(d) {
    if (!d.open || d.classList.contains("is-closing")) return;
    const done = () => { d.classList.remove("is-closing"); d.close(); };
    if (reduced()) return done();
    d.classList.add("is-closing");
    d.querySelector(".modal-panel").addEventListener("animationend", done, { once: true });
    setTimeout(() => d.classList.contains("is-closing") && done(), 500);   // safety net
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal(e.target.closest("dialog"));
    else if (e.target.matches("dialog.modal[open]")) closeModal(e.target);   // backdrop click
  });
  document.addEventListener("cancel", (e) => {                              // Esc
    if (e.target.matches("dialog.modal")) { e.preventDefault(); closeModal(e.target); }
  }, true);
</script>
```

For forms inside a dialog, handle `submit` with `e.preventDefault()` and close through your animated close. Otherwise `method="dialog"` closes it instantly.

- **Do** use native `<dialog>`. It gives you focus trapping, `Esc` handling and the top layer for free.
- **Do** keep a timeout fallback for the close. If `animationend` never fires, the dialog must still close.
- **Don't** slide a centered modal in from off-screen. Small, local motion is enough.

---

### 3.15 Toast

**What:** A notification card rises 14 px from the bottom right, its icon appearing 120 ms later. A 2 px timer bar shrinks over the toast's lifetime and pauses on hover. On dismiss, the toast slides 40% to the right and fades, then its slot collapses so the remaining toasts glide down instead of jumping. At most 4 are stacked.

**Where:** `static/js/motion.js` `Nimbus.toast(message, type, { title, duration })`, which returns `{ el, dismiss }`. The CSS is `.toast`, `.toast-timer` and `.toast-region` in `components.css`, with keyframes `toast-in` and `toast-timer` in `animations.css`.

```html
<style>
  .toast-region { position: fixed; right: 20px; bottom: 20px; display: flex; flex-direction: column; gap: 10px; width: min(360px, calc(100vw - 32px)); z-index: 100; }
  .toast { position: relative; overflow: hidden; padding: 14px; background: var(--surface); border: 1px solid var(--border);
           border-radius: 12px; box-shadow: 0 16px 40px -12px rgb(0 0 0 / .2);
           animation: toast-in var(--dur-slow) var(--ease-out-expo) backwards; }
  .toast-timer { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: var(--primary);
                 transform-origin: left; animation: toast-timer var(--life, 4000ms) linear forwards; }
  .toast:hover .toast-timer { animation-play-state: paused; }
  @keyframes toast-in    { from { opacity: 0; transform: translateY(14px) scale(0.96); } }
  @keyframes toast-timer { to { transform: scaleX(0); } }
</style>
<div class="toast-region" aria-live="polite"></div>
<button type="button" onclick="toast('Saved')">Toast</button>
<script>
  function toast(text, life = 4000) {
    const region = document.querySelector(".toast-region");
    const el = document.createElement("div");
    el.className = "toast"; el.setAttribute("role", "status");
    el.style.setProperty("--life", life + "ms");
    el.textContent = text;
    el.insertAdjacentHTML("beforeend", '<span class="toast-timer"></span>');
    let gone = false;
    const dismiss = () => {
      if (gone) return; gone = true;
      const h = el.offsetHeight, gap = 10;
      el.animate([
        { transform: "none", opacity: 1, height: h + "px", marginTop: "0px" },
        { transform: "translateX(40%)", opacity: 0, height: h + "px", marginTop: "0px", offset: 0.55 },
        { transform: "translateX(40%)", opacity: 0, height: "0px", marginTop: -gap + "px", paddingTop: 0, paddingBottom: 0, borderWidth: 0 },
      ], { duration: reduced() ? 1 : 320, easing: EASE_IN }).finished.then(() => el.remove());
    };
    el.querySelector(".toast-timer").addEventListener("animationend", dismiss);
    el.addEventListener("click", dismiss);
    region.appendChild(el);
    const all = region.querySelectorAll(".toast");
    if (all.length > 4) all[0].click();
  }
</script>
```

The height collapse animates `height` and `margin`, which breaks the transform-only rule. It's acceptable here because it happens only after the toast is already invisible, and it is what lets the other toasts glide instead of jump.

- **Do** let the timer be driven by a CSS animation, so hover pausing is a single CSS line.
- **Do** use `role="alert"` for errors and `role="status"` for everything else.
- **Don't** stack unlimited toasts, and don't use a toast for something the user has to act on.

---

### 3.16 Tooltip with warm mode

**What:** One shared floating element. The first tooltip appears after 280 ms (shifting 4 px toward its target and fading). While a tooltip is visible, and for 350 ms after it hides, moving to another target shows the next one **instantly**. This is the "warm" behavior native OS tooltips use, so scanning a row of icons doesn't feel sluggish.

**Where:** `static/js/motion.js`: `showTip()`, `hideTip()`, `placeTip()` and `warmUntil`. `static/css/components.css`: `.tooltip`, `.tooltip.is-visible`, `.tooltip.is-instant`. Markup: `data-tooltip="Text" data-tooltip-pos="top|bottom|left|right"`.

```html
<style>
  .tooltip { position: fixed; left: 0; top: 0; z-index: 200; padding: 6px 9px; border-radius: 6px; font-size: 12px;
             background: var(--text); color: var(--surface); pointer-events: none; white-space: nowrap; opacity: 0;
             transform: translate(var(--tx), var(--ty)) translateY(4px) scale(0.96);
             transition: opacity var(--dur-fast) var(--ease-out-quart), transform var(--dur-fast) var(--ease-out-expo); }
  .tooltip.is-visible { opacity: 1; transform: translate(var(--tx), var(--ty)); }
  .tooltip.is-instant { transition: none; }
</style>
<button data-tooltip="Edit">✎</button> <button data-tooltip="Delete">🗑</button>
<script>
  const tip = Object.assign(document.createElement("div"), { className: "tooltip", role: "tooltip" });
  document.body.appendChild(tip);
  let timer, current = null, warmUntil = 0;
  function show(t) {
    current = t; tip.textContent = t.dataset.tooltip;
    const r = t.getBoundingClientRect(), w = tip.getBoundingClientRect();
    tip.style.setProperty("--tx", r.left + r.width / 2 - w.width / 2 + "px");
    tip.style.setProperty("--ty", r.top - 8 - w.height + "px");
    const warm = performance.now() < warmUntil;
    tip.classList.toggle("is-instant", warm && tip.classList.contains("is-visible"));
    clearTimeout(timer);
    timer = setTimeout(() => tip.classList.add("is-visible"), warm ? 0 : 280);
  }
  function hide() {
    clearTimeout(timer);
    if (tip.classList.contains("is-visible")) warmUntil = performance.now() + 350;
    tip.classList.remove("is-visible", "is-instant"); current = null;
  }
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-tooltip]");
    if (t && t !== current) show(t); else if (!t && current) hide();
  });
  document.addEventListener("focusin", (e) => { const t = e.target.closest("[data-tooltip]"); if (t) show(t); });
  document.addEventListener("focusout", hide);
</script>
```

- **Do** show tooltips on keyboard focus too.
- **Don't** give every tooltip its own DOM node, and don't animate the tooltip's position while it follows the cursor.

---

### 3.17 Ripple on press

**What:** A soft circle spreads from the pointer position inside a button and fades out in 520 ms. It is decoration on the press itself, so it never delays the action. It's off under reduced motion.

**Where:** `static/js/motion.js` (the document-level `pointerdown` listener for `.btn, [data-ripple]`, with `data-no-ripple` to opt out) and `static/css/animations.css` `.ripple`. `.btn` has `overflow: hidden; isolation: isolate` so the ripple stays clipped and sits behind the label.

```html
<style>
  .btn { position: relative; overflow: hidden; isolation: isolate; }
  .ripple { position: absolute; z-index: -1; border-radius: 50%; background: currentColor; opacity: .16;
            pointer-events: none; transform: scale(0); animation: ripple 520ms var(--ease-out-quart) forwards; }
  @keyframes ripple { to { transform: scale(1); opacity: 0; } }
</style>
<button class="btn">Press me</button>
<script>
  document.addEventListener("pointerdown", (e) => {
    const host = e.target.closest(".btn");
    if (!host || reduced() || e.button !== 0) return;
    const r = host.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement("span");
    s.className = "ripple";
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    host.appendChild(s);
    s.addEventListener("animationend", () => s.remove(), { once: true });
  });
</script>
```

- **Do** use one delegated listener for the whole document.
- **Don't** make it opaque or colorful. At 16% of `currentColor` it works on every button variant and in both themes.

---

### 3.18 Hover lift and press

**What:** Clickable cards rise 3 px and gain a stronger shadow on hover over 250 ms. On press they settle to 1 px. Buttons shrink to 96.5% on `:active` in 80 ms. Icon buttons shrink to 90%. Small nudges add direction: a card's "View all" arrow moves 3 px right, and a list row's arrow fades and slides in.

**Where:** `static/css/components.css`: `.hover-lift`, `.btn:active`, `.icon-btn:active`, `.chip:active`, `.card-link:hover .icon`, `.list-item:hover .list-item__arrow` and `.avatar-stack:hover` (avatars fan out).

```html
<style>
  .hover-lift { transition: transform var(--dur-base) var(--ease-out-expo), box-shadow var(--dur-base) var(--ease-out-expo); }
  .hover-lift:hover  { transform: translateY(-3px); box-shadow: 0 6px 16px -4px rgb(0 0 0 / .1); }
  .hover-lift:active { transform: translateY(-1px); transition-duration: var(--dur-fast); }

  .btn { transition: background-color var(--dur-fast), transform var(--dur-fast) var(--ease-out-expo); }
  .btn:active { transform: scale(0.965); transition-duration: var(--dur-instant); }

  .card-link .arrow { display: inline-block; transition: transform var(--dur-base) var(--ease-out-expo); }
  .card-link:hover .arrow { transform: translateX(3px); }
</style>
<a class="card hover-lift" href="#">Card</a>
<button class="btn">Save</button>
<a class="card-link" href="#">View all <span class="arrow">→</span></a>
```

- **Do** make the press transition faster than the hover (`--dur-instant`). Press feedback should feel physical.
- **Do** only lift elements that are actually clickable. A lift promises interaction.
- **Don't** scale whole cards on hover. Scaling blurs text and moves neighbouring content visually, while a translate doesn't.

---

### 3.19 Button loading state

**What:** The label fades out in 150 ms and a spinner appears in its place. The button keeps its width, so nothing around it shifts, and it ignores clicks until done.

**Where:** `static/js/motion.js` `Nimbus.loading(btn, true|false)` (toggles `.is-loading` and `aria-busy`). `static/css/components.css`: `.btn.is-loading` and `.btn.is-loading::after`. The `spin` keyframes are in `animations.css`. Used by the Export buttons in `pages/overview.js` and `pages/analytics.js`.

```html
<style>
  .btn > * { transition: opacity var(--dur-fast); }
  .btn.is-loading { pointer-events: none; }
  .btn.is-loading > * { opacity: 0; }
  .btn.is-loading::after {
    content: ""; position: absolute; left: 50%; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px;
    border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent;
    animation: spin 600ms linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
<button class="btn" id="export"><span>Export</span></button>
<script>
  const btn = document.getElementById("export");
  const loading = (b, on) => { b.classList.toggle("is-loading", on); b.setAttribute("aria-busy", String(on)); };
  btn.addEventListener("click", () => { loading(btn, true); setTimeout(() => loading(btn, false), 900); });
</script>
```

The label must be wrapped in an element (`<span>`), because a bare text node can't be faded. The spinner is a loop with meaning, so it's allowed.

- **Do** keep the button's size stable.
- **Don't** swap the label text for "Loading…". The width changes, and the layout jumps.

---

### 3.20 Shake on error, bump on change

**What:**
- **Shake:** a 360 ms horizontal shake with decreasing amplitude (−5, +5, −5, +5, −2 px), used for an invalid field, or for a toggle that would leave a chart empty.
- **Bump:** a 250 ms scale to 1.18 and back, which signals "this value just changed" (trend pills after a range switch, legend dots, counters).
- **Pop:** an entrance for a single new element (a new badge or row).

**Where:** `static/js/motion.js`: `Nimbus.shake()`, `Nimbus.bump()`, `Nimbus.pop()` and the helper `replayClass()`. The CSS is `.is-shaking`, `.is-bumping` and `.is-popping` with their keyframes in `static/css/animations.css`. Usage: the new-project form in `pages/overview.js`, and the series chips and `setTrend()` in `pages/analytics.js`.

```html
<style>
  .is-shaking { animation: shake 360ms var(--ease-out-quart); }
  @keyframes shake { 15%, 55% { transform: translateX(-5px); } 35%, 75% { transform: translateX(5px); } 90% { transform: translateX(-2px); } }
  .is-bumping { animation: bump var(--dur-base) var(--ease-out-expo); }
  @keyframes bump { 40% { transform: scale(1.12); } }
  @media (prefers-reduced-motion: reduce) { .is-shaking, .is-bumping { animation: none; } }
</style>
<input id="name" placeholder="Project name"> <button id="go">Create</button>
<script>
  /* Remove, force reflow, re-add: restarts a CSS animation even mid-flight. */
  function replayClass(el, cls) {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }
  document.getElementById("go").addEventListener("click", () => {
    const input = document.getElementById("name");
    if (!input.value.trim()) { replayClass(input, "is-shaking"); input.focus(); }
  });
</script>
```

- **Do** pair a shake with a text explanation (an inline message or a toast). Motion alone is not an error message.
- **Do** keep bumps subtle and for one element at a time.
- **Don't** shake on every keystroke, and don't bump a whole page of numbers at once. Count-ups already show the change there.

---

### 3.21 FLIP filtering and sorting

**What:** When a list is filtered, sorted or added to, items that stay **glide** to their new positions (400 ms, ease-out-expo), and newly shown items fade and scale in from 0.96 with a 15 ms stagger. The technique is FLIP: **F**irst (measure), **L**ast (mutate the DOM, measure again), **I**nvert (translate each element back to where it was), **P**lay (animate the translate to zero).

**Where:** `static/js/motion.js` `Nimbus.flip(container, mutate, { duration })`. Used in `pages/analytics.js` `renderCountries()` (re-sort on range change) and `sortPages()` (sortable table), and in the Contacts and Projects page scripts for filtering.

```html
<style>
  .list { display: flex; flex-direction: column; gap: 8px; }
  .row { padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
</style>
<button id="sort">Sort</button> <button id="filter">Only even</button>
<div class="list" id="list"><div class="row">3</div><div class="row">1</div><div class="row">4</div><div class="row">2</div><div class="row">5</div></div>
<script>
  function flip(container, mutate, duration = 400) {
    const kids = () => [...container.children];
    const before = new Map(kids().filter((c) => !c.hidden).map((c) => [c, c.getBoundingClientRect()]));
    mutate();                                                     // any DOM change
    kids().forEach((c, i) => {
      if (c.hidden) return;
      const prev = before.get(c), now = c.getBoundingClientRect();
      const d = reduced() ? 1 : duration;
      if (!prev) {                                                // newly visible
        c.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }],
                  { duration: reduced() ? 1 : 250, delay: Math.min(i, 12) * 15, easing: EASE_OUT, fill: "backwards" });
        return;
      }
      const dx = prev.left - now.left, dy = prev.top - now.top;
      if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: d, easing: EASE_OUT });
    });
  }
  const list = document.getElementById("list");
  document.getElementById("sort").onclick = () =>
    flip(list, () => [...list.children].sort((a, b) => a.textContent - b.textContent).forEach((r) => list.appendChild(r)));
  document.getElementById("filter").onclick = () =>
    flip(list, () => [...list.children].forEach((r) => (r.hidden = r.textContent % 2 !== 0)));
</script>
```

**Reordering children that have reveal animations:** use CSS `order` instead of moving DOM nodes. Re-inserting a node (`appendChild`) restarts its CSS animations, so a row that already revealed would flash and fade up again. Setting `row.style.order = i` on a flex or grid container changes the visual order only. FLIP measures `getBoundingClientRect()`, so it animates either way. See `renderCountries()` in `pages/analytics.js`. (`appendChild` is fine for rows that have no entrance animation, like the table in `sortPages()`.)

**Exits:** `Nimbus.flip` hides leaving items instantly. For a softer filter, fade the leaving items out first (150 ms, ease-in), then run the FLIP. The Contacts and Projects pages do this.

- **Do** batch all DOM changes inside `mutate`. Measure once before and once after.
- **Do** cap the stagger for entering items.
- **Don't** FLIP hundreds of elements. Beyond ~100 visible items, skip the animation or virtualize the list.
- **Don't** forget that `display: contents` and inline elements can't be transformed. FLIP block, flex or grid items.

---

### 3.22 Skeleton shimmer

**What:** Placeholder blocks in the shape of the coming content, with a soft highlight sweeping across every 1.3 s. When the real content is ready, the skeleton fades out over 250 ms and the content uses the normal reveal. On Analytics, chart cards show bar-shaped skeletons that fade as the chart draws in.

**Where:** `static/css/components.css`: `.skeleton`, `.skeleton::after`, `.skeleton-text`, `.skeleton-title`, `.skeleton-circle` (with a dimmer highlight in dark mode). `static/css/pages/analytics.css` `.an-chart-skeleton` / `.is-done`, and `static/js/pages/analytics.js` `dropSkeleton()`. Contacts uses it for "load more".

```html
<style>
  .skeleton { position: relative; overflow: hidden; border-radius: 6px; background: var(--surface-3); }
  .skeleton::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%);
                     background: linear-gradient(90deg, transparent, rgb(255 255 255 / .6), transparent);
                     animation: shimmer 1.3s ease-in-out infinite; }
  [data-theme="dark"] .skeleton::after { background: linear-gradient(90deg, transparent, rgb(255 255 255 / .06), transparent); }
  @keyframes shimmer { to { transform: translateX(100%); } }
  @media (prefers-reduced-motion: reduce) { .skeleton::after { animation: none; } }
  .skeleton-wrap { transition: opacity var(--dur-base) var(--ease-out-quart); }
  .skeleton-wrap.is-done { opacity: 0; }
</style>
<div class="skeleton-wrap" id="sk">
  <div class="skeleton" style="height: 18px; width: 50%; margin-bottom: 10px"></div>
  <div class="skeleton" style="height: 12px; margin: 6px 0"></div>
  <div class="skeleton" style="height: 12px; width: 80%"></div>
</div>
<script>
  setTimeout(() => {                                    // when data arrives:
    const sk = document.getElementById("sk");
    sk.classList.add("is-done");
    setTimeout(() => sk.remove(), 300);                 // then insert real content and reveal it
  }, 1200);
</script>
```

- **Do** match the skeleton's shape to the real layout, so nothing jumps when the content arrives.
- **Do** use it only for waits longer than ~300 ms. For shorter waits, just render.
- **Don't** shimmer with a high-contrast highlight. It should be barely noticeable.

---

### 3.23 Heatmap diagonal wave

**What:** A 7×24 grid of cells enters as a wave from the top-left to the bottom-right (scale 0.4 to 1, fading in). When the data changes, the cells **re-color** in the same diagonal wave instead of all at once, while hover stays instant. The peak cell gets an outline that settles in after the wave.

**Where:** `static/css/pages/analytics.css` (`.an-cell`, `.an-heat__grid.is-in .an-cell`, `.an-cell.is-peak::after`) and `static/js/pages/analytics.js` `renderHeatmap()`. The trick is a single custom property `--d = row + column` (the diagonal index), which drives both the entrance `animation-delay` and the `background-color` `transition-delay`. The cell color is `color-mix(in srgb, var(--primary) calc(8% + var(--v) * 92%), var(--surface-3))`, so it follows the theme automatically.

```html
<style>
  .heat { display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px; max-width: 480px; }
  .cell {
    --v: 0; height: 28px; border-radius: 5px;
    background-color: color-mix(in srgb, var(--primary) calc(8% + var(--v) * 92%), var(--surface-3));
    /* value changes ripple diagonally; hover stays instant */
    transition: background-color var(--dur-slow) var(--ease-out-quart) calc(var(--d) * var(--stagger) * 0.2),
                transform var(--dur-fast) var(--ease-out-expo);
  }
  .js .heat:not(.is-in) .cell { opacity: 0; }
  .heat.is-in .cell { animation: cell-in var(--dur-slow) var(--ease-out-expo) backwards;
                      animation-delay: calc(var(--d) * var(--stagger) * 0.3); }
  @keyframes cell-in { from { opacity: 0; transform: scale(0.4); } }
  .cell:hover { transform: scale(1.3); }
</style>
<button id="shuffle">New data</button>
<div class="heat" id="heat"></div>
<script>
  const heat = document.getElementById("heat"), ROWS = 4, COLS = 12;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = document.createElement("span");
    cell.className = "cell";
    cell.style.setProperty("--d", r + c);                 // diagonal index
    heat.appendChild(cell);
  }
  const fill = () => [...heat.children].forEach((c) => c.style.setProperty("--v", Math.random().toFixed(3)));
  fill();
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); heat.classList.add("is-in"); } }).observe(heat);
  document.getElementById("shuffle").onclick = fill;
</script>
```

The multipliers keep the total short: with 30 diagonals, the entrance spreads over `30 × 40 ms × 0.3 ≈ 360 ms` and the re-color over about 240 ms.

- **Do** reuse one index for both the entrance and the update, so the two motions feel like one system.
- **Don't** give 168 cells a full 40 ms stagger each. Scale the step down.

---

### 3.24 Text swap

**What:** A label that changes and can't count up (a date range, "Mon 2pm", a subtitle) slides up and fades out in 120 ms, then the new text slides up into place in 250 ms. This makes clear that something changed without the label jumping.

**Where:** `static/js/pages/analytics.js` `swapText(el, text, first)`. Its sibling `tweenText()` tweens numbers that use a custom formatter (such as "1m 34s").

```html
<span id="range" style="display: inline-block">Sep 21 – Oct 20</span>
<button onclick="swapText(document.getElementById('range'), 'Jul 23 – Oct 20')">Change</button>
<script>
  function swapText(el, text) {
    if (el.textContent === text) return;
    const d = (ms) => (reduced() ? 1 : ms);
    const out = el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-4px)" }],
                           { duration: d(120), easing: EASE_IN, fill: "forwards" });
    out.finished.then(() => {
      el.textContent = text;
      out.cancel();
      el.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }],
                 { duration: d(250), easing: EASE_OUT });
    });
  }
</script>
```

The element must be `inline-block` or block, because inline elements ignore transforms.

- **Do** keep the travel tiny (4 px). It's a hint, not a slot machine.
- **Don't** use it for numbers. Count them instead (3.8).

---

### 3.25 Navigation progress bar

**What:** A thin bar at the top of the viewport grows toward 85% on an ease-out curve when a same-site link is clicked. On the next page it finishes to 100% and fades out. This gives instant feedback on slow navigations without needing a single-page app.

**Where:** `static/css/components.css` `.nav-progress`, `.is-loading` and `.is-finishing`, with keyframes `progress-load` and `progress-finish` in `animations.css`. `static/js/app.js` `initNavProgress()` passes the "navigating" state across the page load in `sessionStorage`.

```html
<style>
  .nav-progress { position: fixed; inset: 0 0 auto 0; height: 2.5px; z-index: 300; background: var(--primary);
                  transform-origin: left; transform: scaleX(0); opacity: 0; pointer-events: none; }
  .nav-progress.is-loading   { opacity: 1; animation: load 3s cubic-bezier(0.1, 0.7, 0.2, 1) forwards; }
  .nav-progress.is-finishing { animation: finish var(--dur-slow) var(--ease-out-quart) forwards; }
  @keyframes load   { from { transform: scaleX(0); } to { transform: scaleX(0.85); } }
  @keyframes finish { from { opacity: 1; transform: scaleX(0.7); } 60% { opacity: 1; transform: scaleX(1); } to { opacity: 0; transform: scaleX(1); } }
</style>
<div class="nav-progress" aria-hidden="true"></div>
<script>
  const bar = document.querySelector(".nav-progress");
  if (sessionStorage.getItem("navigating")) {
    sessionStorage.removeItem("navigating");
    bar.classList.add("is-finishing");
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey ||
        a.target === "_blank" || a.origin !== location.origin || a.getAttribute("href").startsWith("#")) return;
    sessionStorage.setItem("navigating", "1");
    bar.classList.add("is-loading");
  });
  addEventListener("pageshow", (e) => e.persisted && bar.classList.remove("is-loading", "is-finishing")); // bfcache
</script>
```

- **Do** use `scaleX` rather than `width`.
- **Don't** fake progress to 100% before the page has actually arrived.

---

### 3.26 Small details

These are cheap and contribute a lot to how polished the app feels. Each is a CSS transition on an existing element:

| Detail | Where | How |
|---|---|---|
| Focus ring | `components.css` `.input:focus`, `--ring` token | `box-shadow` transition, 150 ms |
| Switch thumb (stretches on press) | `components.css` `.switch-track::after`, `.switch:active` | `transform` plus a `width` squish while pressed |
| Color swatch selection | `components.css` `.swatch span` | ring appears via `box-shadow`, small scale on hover |
| Live dot (meaningful loop) | `components.css` `.live-dot::after` | `ping` keyframes: a ring expands and fades |
| Avatar stack fans out | `components.css` `.avatar-stack:hover` | margin and transform transition |
| Collapse chevron rotates | `components.css` `.sidebar-collapse .icon` | `rotate(180deg)` when collapsed |
| Channel share bar grows | `pages/analytics.css` `.an-share.is-in` | `scaleX(0 → 1)`, then segments resize via `flex-grow` |
| Sort arrow appears and flips | `pages/analytics.css` `.an-sort .icon` | opacity, translate, and `rotate(180deg)` for ascending |

---

### 3.27 Page-level patterns

These patterns live in page scripts because they are specific to one page. If you need them twice, promote them into `motion.js`.

- **Avatar morph between table and card view.** `morphAvatars()` in `static/js/pages/contacts.js`. Avatars FLIP from their table position to their card position when the view switches, so the eye can follow each person.
- **Stagger-in for inserted rows.** `staggerIn()` in `static/js/pages/contacts.js`. Rows appended by "load more" fade up with a capped 40 ms stagger, using WAAPI.
- **Drag and drop on a board.** `beginDrag()` / `endDrag()` in `static/js/pages/projects.js`. The card lifts (scale, slight tilt, shadow), a dashed placeholder moves through the column with FLIP, and on drop the card glides into the placeholder's position. Escape cancels and glides it back.
- **Range-driven page.** The `renderAll(first)` pattern in `static/js/pages/analytics.js`. On first render it writes `data-countup`, `data-progress` and `data-sparkline` attributes so the standard reveal-synced animations run. On later renders it calls the imperative API (`countTo`, `setProgress`, `chart.update`, `flip`) so values morph from what's on screen.

---

## Porting to your own site (any framework)

### What to copy

| File | Required? | What it gives you |
|---|---|---|
| `static/css/tokens.css` (the **motion block** plus the reduced-motion `@media`) | **Yes** | Durations, easings, distances and the accessibility switch. Take the colors too if you want, or map them onto your own. |
| `static/css/animations.css` | **Yes** | Reveal and stagger, page enter, View Transitions, the keyframe library, and modal/drawer/toast keyframes. Remove section 3a (cross-document VT) if your site is an SPA. |
| `static/js/motion.js` | **Yes** | `window.Nimbus`: reveal, count-up, progress, tabs, dropdown, modal, toast, tooltip, ripple, FLIP, shake/bump, loading. It's self-contained, with no dependencies, and boots itself on `DOMContentLoaded`. |
| `static/css/components.css` | Optional | Only the parts you need: `.dropdown-menu`, `.modal`, `.toast`, `.tooltip`, `.tabs-indicator`, `.progress`, `.skeleton`, `.btn.is-loading`, `.hover-lift`. Rename the classes to fit your design system if you like. |
| `static/js/theme.js` | Optional | Light/dark toggle with the circular reveal. Needs the head script from `templates/base.html`. |
| `static/js/charts.js` + `static/vendor/chart.umd.min.js` | Optional | Only if you use Chart.js. |
| `static/js/app.js` | Usually no | Specific to this app's shell (sidebar, nav pill, nav progress). Copy individual functions instead. |

Snippets in section 3 are the minimal versions if you only want one pattern.

### Plain HTML / server-rendered (Django, Rails, Laravel, PHP, Hugo, …)

```html
<!doctype html>
<html lang="en" data-theme="light">
<head>
  <script>document.documentElement.classList.add("js");</script>   <!-- before CSS -->
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/animations.css">
  <link rel="stylesheet" href="/css/components.css">               <!-- or just the parts you need -->
</head>
<body>
  <main class="page">
    <section class="cards" data-stagger>
      <article class="card hover-lift">
        <p>Revenue</p>
        <strong data-countup="175782" data-prefix="$">$175,782</strong>
        <div class="progress" data-progress="72"><div class="progress-bar"></div></div>
      </article>
      <!-- more cards -->
    </section>
  </main>
  <script src="/js/motion.js" defer></script>
</body>
</html>
```

That's all you need: `motion.js` scans the page on `DOMContentLoaded`. After you inject HTML (with fetch, htmx, Turbo, etc.), call `Nimbus.init(insertedElement)`. It's idempotent.

With htmx: `document.body.addEventListener("htmx:afterSwap", (e) => Nimbus.init(e.detail.target));`

### React

Load `motion.js` once (as a `<script>` in `index.html`, or `import "./motion.js"` since it is a self-executing IIFE that sets `window.Nimbus`), and import the two CSS files globally. Then let React render the attributes and ask Nimbus to wire the new subtree after each mount:

```jsx
import { useEffect, useRef } from "react";

/** Wire data-animate / data-stagger / data-countup / data-progress / data-tabs inside this subtree. */
export function useNimbus(deps = []) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) window.Nimbus?.init(ref.current); }, deps);
  return ref;
}

export function KpiGrid({ kpis }) {
  const ref = useNimbus([kpis.length]);
  return (
    <section ref={ref} className="cards" data-stagger="">
      {kpis.map((k) => (
        <article key={k.id} className="card hover-lift">
          <p>{k.label}</p>
          <strong data-countup={k.value} data-prefix="$">{k.value.toLocaleString()}</strong>
        </article>
      ))}
    </section>
  );
}

/** Value that changes after mount: tween instead of re-rendering text. */
export function LiveNumber({ value }) {
  const ref = useRef(null);
  useEffect(() => { window.Nimbus?.countTo(ref.current, value, { duration: 450 }); }, [value]);
  return <span ref={ref} className="num" />;
}

/** FLIP a list when `items` changes. */
export function useFlip(containerRef, items) {
  const rects = useRef(new Map());
  // Before React commits, measure. useLayoutEffect also works if you snapshot in the event handler.
  const snapshot = () => {
    rects.current = new Map([...containerRef.current.children].map((c) => [c.dataset.key, c.getBoundingClientRect()]));
  };
  useEffect(() => {
    [...containerRef.current.children].forEach((c) => {
      const prev = rects.current.get(c.dataset.key);
      if (!prev) return;
      const now = c.getBoundingClientRect();
      const dx = prev.left - now.left, dy = prev.top - now.top;
      if (dx || dy) window.Nimbus.animate(c, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }],
                                          { duration: window.Nimbus.ms("--dur-slow"), easing: window.Nimbus.easing.outExpo });
    });
  }, [items]);
  return snapshot;   // call snapshot() right before you setItems(...)
}
```

React notes:
- `data-stagger=""` (an empty string) is needed because React drops boolean `true` for `data-*`.
- Use `Nimbus.modal.open(id)` / `close(id)` on a `<dialog>` rendered by React, rather than mounting and unmounting the dialog. Unmounting skips the exit animation. If you must unmount, wait for `nimbus:modal` with `detail.open === false`.
- Toasts are created outside React's tree, so you can call `Nimbus.toast()` from any handler.
- For route changes in an SPA, use same-document View Transitions: `document.startViewTransition(() => flushSync(() => navigate(to)))`. Many routers have an option for this (for example `viewTransition` in React Router).
- If you'd rather use a library, the same tokens map directly onto Motion (Framer Motion): `transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}`. Keep the same durations and no-overshoot rule. Don't use `type: "spring"` with bounce.

### Vue 3

```js
// main.js
import "./css/tokens.css";
import "./css/animations.css";
import "./js/motion.js";            // sets window.Nimbus

const app = createApp(App);
// v-nimbus: wire attributes in this element's subtree after mount and updates.
app.directive("nimbus", {
  mounted: (el) => window.Nimbus.init(el),
  updated: (el) => window.Nimbus.init(el),
});
app.mount("#app");
```

```vue
<template>
  <section v-nimbus class="cards" data-stagger>
    <article v-for="k in kpis" :key="k.id" class="card hover-lift">
      <p>{{ k.label }}</p>
      <strong :data-countup="k.value" data-prefix="$">{{ k.value }}</strong>
    </article>
  </section>
</template>
```

Vue's `<TransitionGroup>` already implements FLIP for moves (`.list-move { transition: transform var(--dur-slow) var(--ease-out-expo); }`). Use it with the token values instead of `Nimbus.flip` when Vue owns the list. For enter and leave, map the classes onto the same tokens:

```css
.list-enter-active { transition: opacity var(--dur-base) var(--ease-out-expo), transform var(--dur-base) var(--ease-out-expo); }
.list-leave-active { transition: opacity var(--dur-fast) var(--ease-in); position: absolute; }
.list-enter-from   { opacity: 0; transform: scale(0.96); }
.list-leave-to     { opacity: 0; }
```

### Svelte, Astro, Angular, others

Use the same approach everywhere: global CSS for the tokens and keyframes, `motion.js` loaded once, and `Nimbus.init(node)` after a component mounts (`onMount` in Svelte, `ngAfterViewInit` in Angular, a `<script>` in Astro, which needs nothing more because it renders on the server).

### Porting checklist (for AI agents)

Work through these in order and report back what you did for each.

1. **Inventory.** List the target site's pages, its interactive components (menus, modals, tabs, lists, forms, charts, toasts) and its framework. Note any animation library already present, and reuse it if there is one.
2. **Tokens first.** Add the motion tokens and the `prefers-reduced-motion` override to the global stylesheet. Don't add hard-coded durations or easings anywhere else.
3. **No-JS safety.** Add `document.documentElement.classList.add("js")` to `<head>` before any reveal CSS is used.
4. **Page enter + reveal.** Add the page-enter animation to the main content wrapper. Add `data-stagger` to card grids and lists with fewer than ~12 items, and `data-animate` to standalone sections. Don't animate the header, nav or footer.
5. **Micro-interactions.** Add hover and press states to buttons, links and clickable cards (3.18), and focus rings.
6. **Overlays.** Retrofit dropdowns, modals, drawers and toasts with enter and exit animations (3.13–3.15). Exits must be faster than enters, and closing must still work if `animationend` never fires.
7. **Data.** Count up headline numbers, fill progress bars on reveal, and draw charts in only on first render.
8. **Layout changes.** Use FLIP (3.21) wherever lists filter or sort. Use CSS `order` instead of moving nodes that have entrance animations.
9. **Theme.** If the site has dark mode, add the before-paint theme script and, optionally, the circular reveal (3.4).
10. **Rules check.** Make sure that:
    - only `transform` and `opacity` are animated (or a documented exception);
    - durations are 150–400 ms, and data motion is 700 ms at most;
    - there's no overshoot, bounce, spring or looping idle animation;
    - staggers are capped;
    - nothing is hidden without JS;
    - no runtime CDN has been added (vendor any library);
    - the existing layout, colors and copy are unchanged.
11. **Verify.** Load each page with reduced motion on and off. Check that keyboard navigation (`Tab`, `Esc`, arrow keys in tabs) still works, and that there is no layout shift once the animations finish.

---

## 5. Testing and troubleshooting

**Reduced motion:** In Chrome DevTools, open the Command Menu and choose "Emulate CSS prefers-reduced-motion: reduce". In Firefox, set `ui.prefersReducedMotion = 1` in `about:config`. Or switch the setting on in your OS.

**Slow motion:** Use DevTools, then More tools, then Animations, and set the speed to 10% to inspect easing and stagger timing.

**Common problems**

| Symptom | Cause | Fix |
|---|---|---|
| Hover lift stops working after a reveal | Reveal used `animation-fill-mode: forwards` | Use `backwards` (3.7) |
| Element animates again when reordered | The DOM node was moved, which restarts its CSS animation | Reorder with CSS `order` (3.21) |
| Transition doesn't run on first set | The value was set in the same frame as insertion | Set it in `requestAnimationFrame`, or force a reflow (`void el.offsetWidth`) first |
| Indicator slides in from 0 on page load | It was placed with the transition active | Add `no-anim`, place it, reflow, then remove `no-anim` (3.3, 3.12) |
| Modal closes without animation on `Esc` | The native `cancel` closes it immediately | Intercept `cancel`, `preventDefault()`, then run the animated close (3.14) |
| Content invisible when JS fails | Hidden pre-reveal state isn't scoped | Scope it to `.js` (3.7) |
| Theme flashes light on load | Theme applied after paint | Use an inline `<head>` script before the stylesheets (3.4) |
| View transition skipped | Duplicate `view-transition-name` on the page | Give each name to one element only |
| Chart colors are stale after a theme switch | Colors were cached in JS | Re-read the tokens and `chart.update("none")` on theme change (3.10) |
