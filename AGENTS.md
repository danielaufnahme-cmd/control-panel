# AGENTS.md

Instructions for AI coding agents working in this repository, or using it as a reference.

## What this repo is

**Control Panel** is a local-only Django 5 dashboard with invented placeholder data. Its purpose is to be a **reference for fast, calm UI motion** that people (and their agents) copy into other websites. The motion system is the product. The Django app is the demo around it.

Internal code identifiers keep the original name `nimbus`: the JS global `window.Nimbus`, the Django project package `nimbus/`, keyframes `nimbus-*`, and the storage keys `nimbus-theme` and `nimbus-sidebar`. The visible product name is "Control Panel". Don't rename the identifiers.

## Where things are

| Path | What |
|---|---|
| `docs/ANIMATIONS.md` | **Start here.** Motion philosophy, tokens, every pattern with standalone snippets, and the porting guide plus checklist. |
| `docs/CONVENTIONS.md` | How to build or extend a page: file layout, data attributes, JS API, component classes, charts, models. |
| `static/css/tokens.css` | All design and motion tokens (light, dark, and the reduced-motion override). |
| `static/css/animations.css` | Reveal/stagger, page enter, View Transitions, keyframe library. |
| `static/css/components.css` | Component styles. State transitions live here. |
| `static/js/motion.js` | `window.Nimbus` core primitives (reveal, countTo, setProgress, tabs, dropdown, modal, toast, tooltip, ripple, flip, shake/bump, loading). |
| `static/js/theme.js` | Light/dark toggle with a circular View Transition. |
| `static/js/charts.js` | `Nimbus.charts`: Chart.js theming, `drawIn()`, lazy `create()`, `retheme()`, SVG sparklines. |
| `static/js/app.js` | Shell behaviour: sidebar collapse, nav pill, nav progress bar. |
| `static/js/pages/*.js` | Page scripts. `overview.js` is the reference, and `analytics.js` shows the range-driven update pattern. |
| `templates/base.html` | Shell, before-paint head script (theme, sidebar, `.js` class), script order. |
| `dashboard/` | Models, views (one per page), URLs, `seed` command, template tags, icons. |

## Logo

No logo files are committed. `static/img/brand/` is git-ignored except its README.md and `.gitkeep`. `dashboard.context_processors.brand_files()` looks there on each request for `logo.svg` (expanded sidebar, mobile bar), `mark.svg` (collapsed rail, favicon) and optional `logo-dark.svg` / `mark-dark.svg` (`.png`/`.webp` also work), and `templates/components/logo.html` renders them. Without them it renders the neutral placeholder (outlined "CP" square + "Control Panel"), and the favicon falls back to `static/img/favicon.svg`. `CONTROL_PANEL_PLACEHOLDER_LOGO=1` forces the placeholder; use it for every screenshot in `docs/screenshots/`. Never inline logo artwork in templates or CSS, and never add logo files outside that folder.

## Run

```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate && python manage.py seed
python manage.py runserver 127.0.0.1:8000
python manage.py check && python manage.py test       # before you finish
```

`?theme=dark|light` on any URL forces a theme. With `--noreload`, restart the server after editing templates.

## Rules

1. **Calm, fast, never cute.** Use ease-out for enters and ease-in for exits. No overshoot, bounce or spring curves. No looping idle animations (spinners, skeletons and "live" dots are the only loops). No bursts or confetti.
2. **Use the tokens.** Never hard-code a color, duration or easing. Use `var(--dur-base)`, `var(--ease-out-expo)`, `var(--primary)` and so on, and `Nimbus.ms()` / `Nimbus.easing.*` in JS.
3. **Durations 150–400 ms**, with data motion at 700 ms at most. Exits are faster than enters. Stagger by 40 ms, capped at 12 children.
4. **Animate `transform` and `opacity` only.** The documented exceptions are progress-bar width and sidebar width.
5. **Reduced motion must work.** Build on tokens (they collapse automatically). In JS, check `Nimbus.reducedMotion` or use `Nimbus.animate()`.
6. **Never hide content without JS.** Pre-reveal states are scoped to `html.js`.
7. **Reuse primitives** in `motion.js` and `components.css` before writing new ones. Add new shared primitives there, with comments, not in a page file.
8. **No runtime CDNs.** Vendor any third-party asset into `static/`.
9. **Light and dark** must both look right. Use surface and text tokens, never `#fff`.
10. **Invented data only.** No real people, companies, emails or secrets.
11. Plain CSS and vanilla JS. No build step and no npm.

## Extracting the motion system into another project

Read `docs/ANIMATIONS.md`, section "Porting to your own site", and follow its checklist. In short:

1. Copy the motion tokens and the `prefers-reduced-motion` block from `static/css/tokens.css`.
2. Copy `static/css/animations.css` and `static/js/motion.js`. Optionally take `theme.js`, `charts.js` and the needed parts of `components.css`.
3. Add `document.documentElement.classList.add("js")` in `<head>`.
4. Mark up with `data-animate`, `data-stagger`, `data-countup`, `data-progress` and `data-tabs`. Call `Nimbus.init(el)` after inserting HTML (from React `useEffect`, a Vue directive, etc.).
5. Don't change the target site's layout, colors or copy. Only add motion. Report what you animated and where.
