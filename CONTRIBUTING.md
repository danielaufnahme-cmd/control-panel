# Contributing to Control Panel

Thanks for helping out. Control Panel is a reference for fast, polished web motion, so
every change should keep the UI feeling quick and calm.

## Getting started

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed
python manage.py runserver
```

Run `python manage.py check` and `python manage.py test` before opening a pull request.

## Motion guidelines

- **Use the motion tokens.** Durations and easings come from the CSS custom
  properties in the stylesheet. Don't hard-code `ms` values or cubic-beziers in
  components.
- **Keep it fast.** Most transitions sit between 150 and 400 ms. Micro-interactions
  (hover, press, toggle) belong at the short end; larger panels and page-level
  reveals at the long end. Nothing should make the user wait.
- **Respect `prefers-reduced-motion`.** Every new animation must have a reduced
  variant: no movement, an instant change, or at most a short opacity fade.
- **Reuse existing primitives.** Extend the existing animation helpers and CSS
  classes rather than adding new one-off keyframes or JS animation loops.
- **Animate cheap properties.** Prefer `transform` and `opacity`. Avoid animating
  layout properties (`width`, `height`, `top`, `left`).

## Other conventions

- Plain CSS and vanilla JS only, with no build step and no Node tooling.
- No new runtime CDNs. Vendor third-party assets into `static/`.
- Test new UI in both light and dark themes.
- All data is invented placeholder data. Never commit real names, emails or secrets.
- Never commit logo files. `static/img/brand/` is git-ignored; see its README.md.
