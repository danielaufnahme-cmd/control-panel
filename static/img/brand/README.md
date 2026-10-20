# Put your own logo here

This folder is for **your** logo. Its contents are git-ignored (only this README and
`.gitkeep` are tracked), so logo files you put here stay on your machine and are never
committed or published.

The app picks the files up automatically on the next page load. No settings, template
edits or restart needed. Without them, the sidebar shows a neutral placeholder: an
outlined "CP" square next to the text "Control Panel".

## Filenames

| File | Used for | Recommended |
|---|---|---|
| `logo.svg` | Full horizontal logo in the expanded sidebar and the mobile top bar | Wide, transparent background, cropped tight. Shown at the sidebar width (about 200 to 300 px) and at most 40 px tall. A 6:1 to 9:1 ratio fits best. |
| `mark.svg` | Square mark in the collapsed sidebar rail, and the browser favicon | 1:1, transparent background, little padding. Shown at 32 px. |
| `logo-dark.svg` | Optional. Replaces `logo.svg` in dark mode | Same size as `logo.svg`, light text for dark backgrounds. |
| `mark-dark.svg` | Optional. Replaces `mark.svg` in dark mode | Same size as `mark.svg`. |

SVG is preferred. `.png` and `.webp` work too (e.g. `logo.png`), at least 2x the display
size (for example 600 x 80 px for the logo and 64 x 64 px for the mark). If both an SVG and
a PNG exist, the SVG wins.

If you only add `mark.svg`, the sidebar shows your mark next to the text "Control Panel".

## Screenshots without your logo

Start the server with `CONTROL_PANEL_PLACEHOLDER_LOGO=1` to force the placeholder even
when your files are here:

```bash
CONTROL_PANEL_PLACEHOLDER_LOGO=1 python manage.py runserver 127.0.0.1:8001
```
