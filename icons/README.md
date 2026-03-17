# Icons Folder

This folder contains the extension icons in PNG format, generated from SVG sources.

## Files

- `icon.svg` — Source SVG for all toolbar/management icons (128×128 canvas)
- `readme-banner.svg` — Source SVG for the README banner (600×160)
- `generate-icons.js` — Node script that converts SVGs → PNGs using `sharp`
- `icon16.png` — 16×16 toolbar icon
- `icon32.png` — 32×32 toolbar retina icon
- `icon48.png` — 48×48 extension management icon
- `icon128.png` — 128×128 Chrome Web Store / extension management icon
- `readme-banner.png` — Banner image embedded in README.md

## Design

- **Icon**: White bold "N" on green (#28a745) rounded square
- **Banner**: "NOVA" wordmark + tagline + four-segment NOVA 1–4 colour bar
- **Colour palette**: `#28a745` green · `#ffc107` yellow · `#fd7e14` orange · `#dc3545` red

## Regenerating icons

If you need to update the icons, edit the SVG source files and then run:

```
npm install   # ensures sharp is available
node icons/generate-icons.js
```

## Status

✅ Proper icons in place — green "N" design matching NOVA brand colours
