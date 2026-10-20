# Control Panel conventions

This is the only guide you need to build a page in this project. The goal of the
project is to show **fast, clear, reusable animation**. Before writing anything
new, check whether a primitive below already does it. If you need a new
primitive, add it to the shared files (with comments), not to a page.

Run it:

```bash
cd control-panel
.venv/bin/python manage.py migrate && .venv/bin/python manage.py seed   # once
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Useful URL flag: `?theme=dark` or `?theme=light` forces a theme (good for screenshots).

---

## 0. House style (read first)

Control Panel is professional B2B software (think Stripe, Linear, a bank console).
The shared files already enforce most of this; don't fight them in page CSS.

- **Colours:** logo colours only (mint `#76CCB1`, teal `#3C828D`, navy `#0D4671`, near-black `#1F1F1F`)
  plus greys/white, always via tokens. No green, gold, red-ish pills, purple, gradients, glows or blur.
- **Type:** one font, 14px almost everywhere (`--text-base`), 12px for axis/meta, at most one larger size
  (`--text-2xl`, 24px) for key numbers. Line-height 1.5 (body default).
- **Weights:** 400 for everything, 500 ONLY for card titles, headings and key numbers. Never bold a word
  inside a row ("Overdue", a name, a value) and never mix weights within one row. Nothing is 600/700.
- **Spacing:** card padding 20px (`--space-5`), 12–16px between list rows, at least 8px between a text row
  and its bar, real gaps/columns between label, value and percentage (use `.data-row`, section 5).
- **No decorative icons:** no icon tiles/circles/flags/globes/$ icons. Icons only in the sidebar nav and
  functional controls. No coloured pills for deltas or statuses: plain text, optionally a small dot.
- **Numbers:** every number has a unit or label; percentages always 1 decimal.
- **No filler captions** ("vs previous period", "Click a contact to…"). Copy is neutral: no jokes, no "!".
- **Motion:** functional and understated. Ease-out 150–300ms (data 500–700ms). No spring/overshoot,
  bounce, wobble, shake, tilt, drawn-check flourishes, rotating/morphing icons, bursts or idle loops
  (spinners/skeletons excepted). Respect reduced motion (the tokens do it for you).
- **Responsive:** every page must work at 390, 768, 960, 1100, 1280, 1440, 1920, 2560px wide, with the
  sidebar expanded, collapsed and dragged wide. No horizontal page scroll; see section 9.

---

## 1. File layout

```
nimbus/                     Django project (settings.py, urls.py)
dashboard/
  models.py                 Contact, Project, TeamMember, Message, Activity, DailyMetric, Notification
  views.py                  one view per page (overview, analytics, contacts, projects, messages_view, settings_view)
  urls.py                   URL names: overview, analytics, contacts, projects, messages, settings
  context_processors.py     sidebar nav, fake current_user, `brand` logo files (available in every template)
  icons.py                  inline SVG icon set used by {% icon %}
  templatetags/nimbus.py    {% icon %}, |money, |compact, |kind_icon, |kind_color, |abs_value
  management/commands/seed.py   python manage.py seed (deterministic invented data)
templates/
  base.html                 shell: before-paint head script, sidebar, mobile bar, <main class="page">, toast region, scripts
                            (there is NO top bar: no page title, search, bell or avatar menu)
  components/               sidebar, logo (your files or the placeholder), stat_card, card_header, empty_state, avatar, progress, status_badge, shortcuts_modal
  dashboard/<page>.html     one template per page
static/
  css/tokens.css            ALL colors, radii, shadows, spacing, layout sizes, MOTION tokens (light + dark)
  css/base.css              font, reset, app shell, grid and utility classes
  css/components.css        every component class
  css/animations.css        reveal primitives, page enter, view transitions, keyframe library
  js/motion.js              window.Nimbus core primitives (reveal, countup, toast, modal, ...)
  js/theme.js               light/dark toggle (short whole-page crossfade)
  js/charts.js              Chart.js helpers + SVG sparklines (Nimbus.charts)
  js/app.js                 shell behaviour (sidebar collapse/resize/auto-rail, content-width bucket, nav pill, nav progress bar, shortcuts)
  js/pages/<page>.js        page-specific code (see pages/overview.js as the reference)
  vendor/chart.umd.min.js   Chart.js 4.4.1 (global `Chart`)
  fonts/InterVariable.woff2 Inter variable font
  img/brand/                your logo files (git-ignored, see its README.md); none = neutral "CP" placeholder
  img/favicon.svg           generic favicon used when img/brand/mark.svg is missing
```

Script load order (all `defer`): `chart.umd.min.js -> motion.js -> theme.js -> charts.js -> app.js -> {% block extra_js %}`.
`Nimbus.init()` runs on `DOMContentLoaded`, i.e. **after** your page script, so
attributes you put in the HTML are wired up automatically.

---

## 2. How to add or flesh out a page

The six pages already exist. To build one (e.g. Contacts):

1. **View** (`dashboard/views.py`): add whatever the template needs to the context.
   Keep `page_title` (used for `<title>` and the `<main>` aria-label; there is no
   visible page heading, the active sidebar item says where you are). Pass chart
   data as plain lists/dicts.
2. **Template** (`templates/dashboard/contacts.html`): replace the stub's
   `{% block content %}`. Keep `{% extends "base.html" %}` and `{% load static nimbus %}`.
   Use these blocks:
   - `content`: the page body (rendered inside `<main class="page">`)
   - `modals`: `<dialog>` elements for this page
   - `extra_js`: `<script src="{% static 'js/pages/contacts.js' %}" defer></script>`
   - `extra_css`: only if you really need page CSS (prefer components.css)
3. **Data to JS**: `{{ my_data|json_script:"my-data" }}`, then
   `JSON.parse(document.getElementById("my-data").textContent)` in the page script.
4. **Page script** (`static/js/pages/contacts.js`): wrap it in an IIFE, use `window.Nimbus`,
   and don't touch global shell behaviour.
5. **New sidebar item**: add a tuple to `NAV_ITEMS` in `context_processors.py` plus a URL + view.

Layout skeleton every page should follow:

```html
<div class="page-toolbar" data-animate="fade-in"> filters / actions </div>

<section class="grid-auto" data-stagger> stat cards </section>

<div class="grid" data-stagger>
  <section class="card col-8"> ... </section>
  <section class="card col-4"> ... </section>
</div>
```

Stacked `.grid` / `.grid-auto` / `.section` blocks get vertical spacing automatically.

Rules:
- Use the tokens. Never hard-code a color, duration or easing. (`var(--dur-base)`, `var(--ease-out-expo)`)
- Animate `transform` and `opacity` only (exceptions: progress width and sidebar width).
- Durations: 150-300ms (data 500-700ms). Exits are faster than enters. Stagger 35ms, capped at 12 children.
- Position:fixed overlays (save bars, bulk bars) that must clear the sidebar: use
  `left: var(--sidebar-w)` AND `[data-sidebar="collapsed"] … { left: var(--sidebar-w-collapsed) }`, and `left: 0` at <= 900px.
- Every page must look right in **light and dark**. Use `var(--surface)`, `var(--text-muted)` etc., never `#fff`.
- All data is invented. No real people or brands.

---

## 3. CSS tokens (`static/css/tokens.css`)

**Surfaces & text:** `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--surface-glass`,
`--border`, `--border-strong`, `--text`, `--text-muted`, `--text-subtle`

**Brand & semantic:** `--primary`, `--primary-hover`, `--primary-soft`, `--primary-contrast`,
`--success`, `--success-soft`, `--warning`, `--warning-soft`, `--danger`, `--danger-soft`,
`--info`, `--info-soft`

**Accents** (keys = `COLOR_CHOICES` in models.py, names kept for the DB; every value is a logo colour or a grey):
`--accent-indigo` (navy), `--accent-violet`, `--accent-pink`, `--accent-rose` (ink), `--accent-orange`,
`--accent-amber`, `--accent-emerald`, `--accent-teal`, `--accent-sky`, `--accent-slate`.
Pattern: `style="--c: var(--accent-{{ obj.color }})"`. Components that read `--c`: avatar (faint tint only),
progress-bar, project-swatch, badge--accent (dot), swatch, legend-dot. Brand raw values: `--brand-mint|teal|navy|ink`.

**Charts:** `--chart-1..5` (teal, navy, mint, grey, light grey) and `--chart-bar` / `--chart-bar-2`
(lighter teal/navy fills for bar series so bars don't read heavy).

**Radii:** `--radius-xs` 4, `--radius-sm` 6, `--radius-md` 8, `--radius-lg` 10, `--radius-xl` 14, `--radius-full`

**Shadows:** flat UI, borders do the work. `--shadow-xs|sm` for buttons; `--shadow-md|lg|xl` only for floating
layers (menus, modals, toasts). `--ring` (focus).

**Spacing:** `--space-1` 4px, `-2` 8, `-3` 12, `-4` 16, `-5` 20, `-6` 24, `-8` 32, `-10` 40, `-12` 48, `-16` 64
(compact density shrinks 3/4/5/6 to 10/12/14/18, see section 9).

**Type:** `--font-sans` (Inter), `--font-mono`. Deliberately few sizes: `--text-xs` 12, `--text-sm|base|md` 14,
`--text-lg|xl` 16, `--text-2xl|3xl` 24 (key numbers only).

**Layout:** `--sidebar-w` 248px (user-resizable 200–360, set inline on `<html>`), `--sidebar-w-collapsed` 68px,
`--header-h` 64px (sidebar brand row), `--page-max` 1600px (content cap, centred). `--topbar-h` is legacy (no top bar).

**Motion:**

| Token | Value | Use for |
|---|---|---|
| `--dur-instant` | 80ms | press feedback (`:active`) |
| `--dur-fast` | 150ms | hover, color changes, exits |
| `--dur-base` | 220ms | most enters: dropdowns, modals, page enter, toasts |
| `--dur-slow` | 300ms | bigger travel: drawers, nav pill, reveal transforms, sidebar width |
| `--dur-data` | 600ms | count-ups, progress fills, chart first draw |
| `--stagger` | 35ms | delay between staggered children |
| `--ease-out-expo` | `cubic-bezier(.16,1,.3,1)` | default for anything entering |
| `--ease-out-quart` | `cubic-bezier(.25,1,.5,1)` | gentler enter, opacity |
| `--ease-in` | `cubic-bezier(.5,0,.75,0)` | exits |
| `--ease-in-out` | `cubic-bezier(.65,0,.35,1)` | A-to-B movement on screen |
| `--move-sm` / `--move-md` / `--move-lg` | 4 / 8 / 16px | reveal travel distances |

**Deprecated:** `--ease-spring`, `--ease-spring-soft` (and `Nimbus.easing.spring|springSoft`). They exist only so
old code doesn't break and are now plain ease-outs. Don't use them in new code; use `--ease-out-expo` / `--ease-out-quart`.

Under `prefers-reduced-motion: reduce` every duration becomes 1ms, stagger 0 and
moves 0, so anything built on tokens is automatically accessible. JS checks
`Nimbus.reducedMotion`.

JS mirrors: `Nimbus.easing.outExpo | outQuart | in | inOut` (CSS strings for WAAPI; `spring`/`springSoft` deprecated),
`Nimbus.ease.*` (functions for rAF), `Nimbus.ms("--dur-base")` → `250`.

---

## 4. Animation primitives

### Declarative (HTML attributes), wired by `Nimbus.init()`

| Attribute | What it does |
|---|---|
| `data-animate="fade-up"` | Element reveals when scrolled into view. Values: `fade-up`, `fade-in`, `scale-in`, `slide-left` (comes in from the right), `slide-right`, `blur-in`. |
| `data-animate-delay="120"` | Extra delay in ms before the reveal. |
| `data-stagger` | Each **direct child** reveals in sequence (default `fade-up`). Use a value to choose the animation: `data-stagger="scale-in"`. Max 12 steps, then children share the last delay. |
| `data-stagger-delay="60"` | Override the ms between children for this group. |
| nested `data-stagger` | A stagger group inside an animated card automatically waits for that card. |
| `data-countup="12345"` | Number counts up from 0 when revealed, waiting for its card's stagger delay. Options: `data-prefix="$"`, `data-suffix="%"`, `data-decimals="2"`, `data-duration="700"`, `data-format="compact"` (→ 12.4K). Put the final value as text content too (no-JS fallback). |
| `data-progress="72"` on `.progress` | Bar fills to 72% when revealed (CSS width transition, `--dur-data`). |
| `data-sparkline="3,5,4,8"` on `.sparkline` | SVG sparkline (straight segments, faint flat area, no end dot) that fades in with its card. Color = `--c`. |
| `data-tabs` on `.tabs` | Sliding indicator tabs. Children: `<button class="tab [is-active]" data-tab="key">`. Optional `data-tabs-target="#panels"`: shows the `[data-tab-panel="key"]` direct children of that element (with a fade-up). Arrow keys work. Fires `nimbus:tabchange` (bubbles), `detail: { value, tab }`. |
| `data-tooltip="Text"` | Floating tooltip. `data-tooltip-pos="top|bottom|left|right"`. Shows after 280ms; then other tooltips show instantly ("warm" mode). `data-tooltip-when="collapsed"` = only while the sidebar is collapsed. |
| `data-dropdown` + `data-dropdown-trigger` | Animated dropdown (see markup below). Closes on outside click, Esc, or `[data-dropdown-close]` inside. Items cascade in. Fires `nimbus:dropdown` with `{ open }`. |
| `data-open-modal="id"` | Opens `<dialog id="id" class="modal">` (or `class="modal drawer"`). |
| `data-close-modal` | Closes the enclosing dialog with its exit animation. Esc and backdrop click also close. |
| `.btn` or `data-ripple` | Ripple from the pointer on press. Opt out: `data-no-ripple`. |
| `data-theme-toggle` | Theme toggle button (short whole-page crossfade). |
| `data-sidebar-collapse` / `data-sidebar-open` / `data-sidebar-close` | Shell controls. |

Hidden pre-reveal states only apply when `<html>` has the `js` class (set in
the head), so content is never lost without JS. Reveal animations use
`animation-fill-mode: backwards`, so after they finish, hover transforms such as
`.hover-lift` work normally.

### JavaScript API (`window.Nimbus`)

```js
Nimbus.init(rootEl)                      // wire up attributes inside newly inserted HTML (idempotent)
Nimbus.reveal(el)                        // reveal now
Nimbus.onVisible(el, fn)                 // run fn once el scrolls into view
Nimbus.revealDelay(el)                   // ms until el's animated ancestor starts (to sync custom effects)

Nimbus.countTo(el, value, { duration, from, bump })   // animate a number to a new value (uses el's data-prefix/suffix/decimals)
Nimbus.setProgress(progressEl, 64)       // animate a .progress bar
Nimbus.pop(el)                           // small fade/scale-in, no overshoot (new item)
Nimbus.bump(el)                          // brief dim, no scaling ("this value changed")
// DEPRECATED name: Nimbus.shake(el) no longer shakes. It flashes a muted danger ring once on an
// invalid field; kept for existing calls. For new code just focus the field and show the error text/toast.
Nimbus.loading(btn, true|false)          // spinner state on a .btn

Nimbus.toast(message, type = "info", { title, duration = 4000, action: { label: "Undo", onClick } })  // -> { el, dismiss() }
//   types: "info" | "success" | "warning" | "error". Stacks bottom-right, newest at the bottom, max 4
//   (the oldest leaves). Dismiss (X, timeout, action) = slide right + fade 220ms while the others glide
//   into the freed space (FLIP); new toasts push the stack with the same glide. Hovering the stack pauses
//   all timers. A "Clear all" button fades in with 2+ toasts. `action` adds an inline button (e.g. Undo)
//   that runs onClick and dismisses. Don't hand-insert buttons into t.el any more.
Nimbus.toast.clearAll()                  // dismiss every toast (newest first, 30ms apart)

Nimbus.modal.open("id") / Nimbus.modal.close("id")   // also accepts the element; Nimbus.drawer is the same API
Nimbus.dropdown.open(el) / .close(el) / .toggle(el) / .closeAll()
Nimbus.selectTab(tabsEl, "30")           // programmatic tab change

Nimbus.flip(container, () => { /* mutate DOM: hide/show/reorder children */ }, { duration })
//   FLIP: moved children glide to their new spot, newly shown ones scale/fade in.
//   Use it for filtering, sorting, adding to lists and card grids.

Nimbus.animate(el, keyframes, options)   // element.animate() that goes instant under reduced motion
Nimbus.reducedMotion                     // boolean
Nimbus.token("--primary"), Nimbus.ms("--dur-base")

Nimbus.theme.get() / .set("dark") / .toggle()      // origin arg still accepted, unused
Nimbus.sidebar.collapse() / .expand() / .toggle() / .open() / .close()   // open/close = mobile drawer
```

Events: `nimbus:themechange` (document, `detail.theme`, fired synchronously inside
the theme transition), `nimbus:tabchange`, `nimbus:dropdown`, `nimbus:modal`.

### Shell motion (already built, don't re-implement)

- Page enter: `<main class="page">` fades/slides up 4px in 220ms on every load.
- Cross-document View Transitions (`@view-transition { navigation: auto }`): the sidebar stays still, the nav
  pill morphs to the new item, the old page fades out in 150ms. Other browsers get the page-enter animation.
- Nav pill slides between items on click (ease-out, no overshoot).
- Thin progress bar at the top while navigating.
- Theme toggle: short whole-page crossfade. The sun/moon icon just swaps (no rotation/morph).
- Sidebar collapse: width animation, labels fade, section titles disappear, tooltips appear. Shortcut `[`.
- `?` opens the shortcuts modal.

---

## 5. Component classes (`static/css/components.css`)

**Layout (base.css):** `.grid` (12 cols) with `.col-3/4/5/6/7/8/12` (reflow on the CONTENT width, see section 9),
`.grid-auto` (auto-fit cards, set `--min: 260px` to change the minimum width), `.stack` (column, `--gap`), `.row`,
`.row-between`, `.wrap`, `.grow`, `.truncate`, `.text-muted`, `.text-subtle`, `.text-sm`, `.text-xs`,
`.text-success`, `.text-danger`, `.fw-500` (`.fw-600` is a legacy alias, also 500), `.mt-1/2/4/6`, `.num`
(tabular numbers), `.sr-only`, `.cq` (container), `.hide-sm` / `.show-sm` / `.hide-md`.
`ul`/`ol` with a class have no bullets or indent.

**Data rows (base.css): label left, values right in their own columns.** Use these for any
"name … value … share" list so text is never glued together ("47,729 visits40.4%"):
```html
<div class="data-list" style="--cols: 2">        <!-- subgrid: value columns line up across rows -->
  <div class="data-row">
    <span class="data-row__label">Organic search</span>
    <span>47,729 visits</span>
    <span class="data-row__muted">40.4%</span>
    {% include "components/progress.html" with value=40.4 size="sm" %}   <!-- optional: spans the row, 8px below -->
  </div>
</div>
```
`--cols` = number of value columns (default 1); value cells are right-aligned, tabular, nowrap, 24px apart;
rows are 12px apart (`.data-list--airy` 16px, `.data-list--divided` adds hairlines with 12px padding).
For a single "label … value" pair: `<div class="kv-row"><span>Plan</span><span>Team</span></div>`.

**Card:** `.card` (20px padding, hairline border, no shadow), `.card--flush` (no padding), `.card--chart` (chart grows to fill),
`.card-header`, `.card-title`, `.card-subtitle`, `.card-footer`, `.card-link` (arrow nudges on hover),
`.hover-lift` (lift + shadow on hover; add to clickable cards).
Partial: `{% include "components/card_header.html" with title="..." subtitle="..." link_url=url link_label="View all" %}`

**Stat card:** `{% include "components/stat_card.html" with stat=dict %}` where dict has
`label, value, prefix, suffix, decimals, change, change_suffix, spark (list)` (`icon`, `color`, `period` are
ignored: no icon tiles, per-KPI colours or "vs previous period" captions). Layout: label / number + plain-text
delta / sparkline row. Percent deltas always render with 1 decimal.
Classes: `.stat-card`, `.stat-label`, `.stat-value` (24px, 500), `.trend .trend--up/.trend--down` (plain text, 400).

**Buttons:** `.btn` + `.btn--primary | --soft | --ghost | --danger`, sizes `.btn--sm | --lg`,
`.btn--icon`, `.btn--block`, state `.is-loading` (use `Nimbus.loading`). Icon-only: `.icon-btn`, `.icon-btn--sm`.

**Status (badges) & chips:** a status is **plain text with a small dot**, never a coloured pill.
`.badge` is plain muted text; `.badge--dot` adds the 6px dot; `.badge--primary | success | warning | danger | info | accent`
(+ `--c`) only tint the dot. Model statuses map directly: `.badge--{{ obj.status }}` (lead, active, inactive, vip,
planning, review, paused, done; dot always shown). Partial: `components/status_badge.html` (`status`, `label`).
`.chip` / `.chip.is-active` (filter buttons, optional `.count` span), `.tag`, `.kbd`, `.live-pill` + `.live-dot` (static dot, no ping).

**Avatar:** `.avatar` (+ `--c`, faint tint), sizes `.avatar--xs | sm | lg | xl`, `.avatar--solid`,
`.avatar-status` (navy "online" dot, never green), `.avatar-stack` (static overlap).
Partial: `{% include "components/avatar.html" with initials=c.initials color=c.avatar_color size="sm" %}`.
Models with people have an `.initials` property.

**Progress:** flat bar (2px radius, no glow): `<div class="progress [progress--sm|--lg]" data-progress="72" style="--c: ..."><div class="progress-bar"></div></div>`,
or partial `components/progress.html` (`value`, `color`, `size`). Keep 8px between a text row and its bar.

**Tabs:** `.tabs` (underline) or `.tabs.tabs--pill` (segmented), `.tab`, `.tab.is-active`; the indicator is auto-inserted.

**Lists & feeds:** `.list` > `.list-item` (12px vertical padding; `.list-item__title`, `.list-item__meta`, `.list-item__arrow`),
`.feed` > `.feed-item` (`.feed-text`, `.feed-time`; `.feed-icon` is hidden by house style), `.activity` > `.activity-row`.

**Table:** `.table-wrap` > `table.table` (hover rows, uppercase headers; bleeds to the card edges).

**Forms:** `.field`, `.label`, `.hint`, `.input`, `.select`, `.textarea`, `.form-grid` (2 cols, `.span-2`),
`.switch` (`<label class="switch"><input type="checkbox"><span class="switch-track"></span> Label</label>`),
`.swatches` > `label.swatch` (`--c`) > `input[type=radio]` + `span`.

**Dropdown markup:**
```html
<div class="dropdown" data-dropdown>
  <button class="btn" data-dropdown-trigger aria-haspopup="menu" aria-expanded="false">Menu</button>
  <div class="dropdown-menu [dropdown-menu--left|--wide]" role="menu">
    <div class="dropdown-label">Section</div>
    <button class="dropdown-item">{% icon "edit" %} Edit <span class="kbd">E</span></button>
    <div class="dropdown-divider"></div>
    <button class="dropdown-item dropdown-item--danger" data-dropdown-close>{% icon "trash" %} Delete</button>
  </div>
</div>
```

**Modal / drawer markup** (put in `{% block modals %}`):
```html
<dialog class="modal" id="edit-contact" aria-labelledby="edit-contact-title">   <!-- add "drawer" for a side panel -->
  <form class="modal-panel" method="dialog">
    <div class="modal-header"><div><h2 id="edit-contact-title">Title</h2><p>Subtitle</p></div>
      <button class="icon-btn icon-btn--sm" type="button" data-close-modal aria-label="Close">{% icon "x" %}</button></div>
    <div class="modal-body">...</div>
    <div class="modal-footer"><button class="btn btn--ghost" type="button" data-close-modal>Cancel</button>
      <button class="btn btn--primary" type="submit">Save</button></div>
  </form>
</dialog>
```
For forms, handle `submit` in JS with `e.preventDefault()` and then `Nimbus.modal.close(id)`, so the exit animation plays.

**Feedback:** toasts (JS only), `.tooltip` (JS only), `.skeleton` + `.skeleton-text | .skeleton-title | .skeleton-circle`
(shimmer placeholders; replace with content, then call `Nimbus.init(el)`),
empty state via `{% include "components/empty_state.html" with icon="inbox" title="..." text="..." action_label="..." action_modal="id" %}`.

**Misc:** `.page-toolbar`, `.chart-box` (`--h: 300px`), `.chart-legend`, `.legend-dot`, `.legend-dash`,
`.big-number`, `.doughnut-wrap` + `.doughnut-center`, `.project-swatch`.

**Icons:** `{% icon "name" %}` or `{% icon "name" "icon--sm" %}`. Sizes `.icon` 18px, `.icon--sm` 15, `.icon--lg` 22.
Available: home chart users folder mail settings search bell chevron-left/right/down/up menu x plus minus
download upload dollar eye user user-plus target trending-up trending-down arrow-up arrow-down arrow-right
arrow-up-right clock alert check check-circle info star more more-vertical log-out keyboard filter calendar
briefcase message credit-card zap file inbox phone map-pin tag activity sidebar refresh trash edit sparkles
globe lock send archive grid list paperclip reply shield palette monitor layers box.
Add more in `dashboard/icons.py` (Lucide-style, 24×24, stroke 2).

**Template filters:** `{{ v|money }}` → `$12,400`, `{{ v|money:2 }}`, `{{ v|compact }}` → `12.4k`,
`{{ a.kind|kind_icon }}`, `{{ a.kind|kind_color }}`, `{{ n|abs_value }}`. `humanize` is installed (`naturaltime`, `intcomma`).

---

## 6. Charts (`Nimbus.charts`, Chart.js 4.4.1)

```js
const chart = await Nimbus.charts.create("#my-canvas", (t) => ({
  type: "line",
  data: {
    labels,
    datasets: [{
      label: "Visitors",
      data: values,
      borderColor: t.accent.sky,
      backgroundColor: (ctx) => Nimbus.charts.gradient(ctx, t.accent.sky),   // area fade
      fill: "origin",
    }],
  },
  options: Nimbus.charts.options(t, {                 // themed axes, grid, tooltip; deep-merged overrides
    animation: Nimbus.charts.drawIn("line", values.length),
    scales: { y: { ticks: { callback: (v) => v + "%" } } },
  }),
  plugins: [Nimbus.charts.crosshair],                  // optional dashed hover guide
}));
```

- The canvas must sit in a sized box: `<div class="chart-box" style="--h: 280px"><canvas id="my-canvas"></canvas></div>`.
- `build(t)` gets the theme tokens: `t.text, t.muted, t.subtle, t.border, t.surface, t.surface2, t.primary,
  t.success, t.warning, t.danger, t.info, t.font, t.dark (bool), t.accent.<name>, t.brand.<mint|teal|navy|ink>,
  t.series[0..4], t.bar, t.bar2, t.barHover`.
  **Only read colors from `t`.** On theme change, the helper calls `build(t)` again, copies the
  options and dataset styling (not `data`) onto the live chart, and redraws instantly.
- `create()` is lazy: the chart is built (and draws in) when the canvas scrolls into view, synced
  with its card's stagger. It returns a Promise for the Chart. `{ lazy: false }` builds immediately.
- `drawIn("line" | "bar" | "doughnut", count)` is the first-render animation, deliberately understated:
  the line rises from the baseline as one piece, bars grow together (no wave/stagger), the doughnut sweeps.
  Later updates use normal ~450ms transitions: change `chart.data...` then call `chart.update()`.
- Bar series: use `t.bar` (lighter teal) as `backgroundColor` and `t.barHover` as `hoverBackgroundColor`;
  `t.bar2` for a second bar series. Line series: `t.series[0..4]`.
- Helpers: `Nimbus.charts.alpha(color, 0.3)`, `.gradient(ctx, color, fromAlpha, toAlpha)`,
  `.tooltip(t)` (themed tooltip options for non-axis charts), `.tokens()`, `.sparkline(el, values)`.
- Global defaults (Inter 12px, no legend, 2px bar radius, tension 0 = straight segments, no points until
  hover, fast hover transitions) are set in charts.js. Area fills are capped at a 6% flat tint
  (`gradient()` is a legacy name). Under reduced motion, animations are off.
- See `static/js/pages/overview.js` for a straight-line chart driven by range tabs, KPI tiles with count-up and
  sparklines, tables, and a modal form. `analytics.js` shows the range-driven update pattern across several charts.

---

## 7. Data available (models)

- `Contact`: name, company, email, phone, role, status (lead/active/inactive/vip), avatar_color, city,
  created, last_contacted, notes, tags (comma string → `.tag_list`), `.initials`. 150 rows.
- `Project`: name, client, description, status (planning/active/review/paused/done), progress 0-100,
  due_date, budget, spent, color, members (M2M TeamMember). 12 rows.
- `TeamMember`: name, role, email, avatar_color, online, `.initials`. 8 rows.
- `Message`: sender, sender_email, avatar_color, subject, preview, body, received, unread, starred,
  label (inbox/work/billing/support/social), `.initials`. 40 rows. Context name is `messages_list`
  (`messages` is reserved by Django).
- `Activity`: actor (TeamMember), kind (deal/contact/project/message/payment/system), verb, target,
  amount, timestamp. 60 rows.
- `DailyMetric`: date, visitors, signups, orders, revenue, bounce_rate, avg_session (s). 365 days.
- `Notification`: title, body, icon, color, created, read (no UI since the top bar was removed).

`python manage.py seed` wipes and regenerates everything deterministically (seed 1337, dates relative to today).

---

## 8. Gotchas

- **Reorder stagger children with CSS `order`, not by moving DOM nodes.** Re-inserting a node
  (`appendChild`, `insertBefore`) restarts its CSS reveal animation, so already-visible rows flash and
  fade up again. Set `el.style.order = i` on children of a flex/grid container instead; `Nimbus.flip()`
  measures visual positions, so it animates either way (see `renderCountries()` in `static/js/pages/analytics.js`).
- **Restart the dev server after template edits when using `--noreload`.** Without the autoreloader,
  Django keeps cached templates and you will keep seeing the old markup.

---

## 9. Sidebar, responsive layout and user preferences

**Sidebar states** (`html[data-sidebar]`, applied before paint by the head script in base.html):
- *Expanded*: width `--sidebar-w`, default 248px. The logo (`static/img/brand/logo.svg`, or the "CP" + "Control Panel" placeholder) scales with the width.
- *Resizable*: drag the right edge (`.sidebar-resizer`, `role="separator"`). 200–360px, saved in localStorage
  `nimbus-sidebar-w`; no transition while dragging (`html.sidebar-resizing`); dragging below ~150px snaps to the
  rail, dragging the rail outwards expands it; double-click or Enter resets; Arrow keys ±16px (Shift ±48),
  Home/End = min/max.
- *Collapsed rail* (68px, `nimbus-sidebar` = "collapsed", shortcut `[`): centred logo mark (`mark.svg` or the "CP" placeholder), evenly spaced 40px icon
  buttons, active item = soft pill + 2px accent bar, no labels/counts.
- *Automatic rail* between 901 and 1100px viewport (not persisted; toggling there is temporary).
- *Drawer* at <= 900px: off-canvas with backdrop; a slim `.mobile-bar` (menu + logo) appears.

**Content width.** The space a page gets depends on the sidebar, so the shared grid does NOT use viewport
breakpoints. `html[data-content]` is `lg` (>= 900px of content), `md` (560–899) or `sm` (< 560); the head script
estimates it before paint and app.js keeps it live with a ResizeObserver on `main.page`.
- `.col-*` in `.grid`: at `md`, `.col-3` -> 6 columns and `.col-4/5/7/8` -> full width; at `sm` everything is full width.
- 4-up KPI rows (`.grid-auto` with exactly 4 `.stat-card`s) go 4 -> 2 -> 1.
- Use the same hook in page CSS: `html[data-content="md"] .my-widget { … }`.
- For a widget that must react to its own card width, use a container: add `.cq` to the card and write
  `@container (max-width: 520px) { … }`. Never wrap position:fixed overlays in a container (it becomes their
  containing block); that's also why `main.page` itself is not a container.
- Content is capped at `--page-max` (1600px) and centred on very wide screens.
- Test at 390, 768, 960, 1100, 1280, 1440, 1920, 2560 with the sidebar expanded, collapsed and at 360px.
  No horizontal page scroll: wide tables scroll inside `.table-wrap`, or drop columns with `.hide-md` / `.hide-sm`.

**User preferences (Settings > Appearance), global on every page.** base.html's head script reads
localStorage and sets, before first paint:
- `nimbus-accent` -> `html[data-accent="navy|mint|graphite"]` (teal is the default and needs no attribute).
  tokens.css swaps `--primary`, `--primary-hover`, `--primary-soft`, `--ring` (and `--primary-contrast` in dark).
  Use `var(--primary)` for anything that should follow the accent; charts keep the brand palette.
- `nimbus-density` = "compact" -> `html[data-density="compact"]`: tighter `--space-3..6`. Build spacing on the
  space tokens and compact density works for free.
- Other keys: `nimbus-theme`, `nimbus-sidebar`, `nimbus-sidebar-w`.
