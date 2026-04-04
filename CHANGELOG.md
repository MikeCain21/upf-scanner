# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.3.0] — 2026-04-04

### Added
- ESLint (`eslint:recommended` + `no-var`) with CI enforcement — `npm run lint`
- Unit tests for Ocado adapter (`test/unit/ocado-adapter.test.js`) — 395 tests total
- `DEBUG` flag in service worker — verbose logging is now opt-in (set `DEBUG = true` to re-enable)
- Prettier code formatter — `npm run format` (`.prettierrc` config: single quotes, 2-space, trailing commas)
- `.editorconfig` — consistent indentation and line endings across editors
- `.nvmrc` — pins Node.js 18 for `nvm use` / `fnm use`
- `npm run test:coverage` — generates per-file coverage report (configured in `jest.config.js`)
- Three additional ESLint rules: `prefer-const`, `eqeqeq`, `no-unused-vars`
- Privacy policy updated to disclose Google Forms feedback link
- Store listing updated with privacy dashboard section
- README updated with store marquee banner and popup toggle screenshots

### Changed
- Test directory reorganised into `unit/`, `connectivity/`, and `manual/` subdirectories
- Icon generation script moved from `icons/` to `scripts/`
- LICENSE updated to reflect current project name (UPF Scanner)
- Fixed stale JSDoc on feedback form constants in `content/ui/badge.js`
- Fixed `test:connectivity` script path to match reorganised test directory

### Fixed
- Duplicate JSDoc block removed from `popup/popup.js`
- ESLint global declarations added to unblock CI

---

## [1.2.1] — 2026-03-18

### Changed
- Extension renamed to **UPF Scanner – Spot Ultra-Processed Food**
- Updated extension icons and README banner to match new branding
- Updated CLAUDE.md: user profile, version references, test count (320)

### Added
- `LICENSE` file (MIT)
- `CONTRIBUTING.md` — how to add adapters, run tests, submit PRs
- `SECURITY.md` — permissions audit, data flows, vulnerability reporting
- `CHANGELOG.md` (this file)
- GitHub CI workflow (`test.yml`): runs `npm test` on push/PR to main
- GitHub Dependabot config: weekly npm security checks
- GitHub PR template and issue templates (bug report, feature request)

### Fixed
- `scripts/create-icons.js` removed (superseded by `icons/generate-icons.js`)

---

## [1.2.0] — 2026-03-17

### Added
- **Sainsbury's adapter** — PDP + category page badge support
- Badge position fix for flex column containers (Sainsbury's layout)

### Changed
- NOVA 4 indicator set aligned with OpenFoodFacts taxonomy (v0.5.0)

---

## [1.1.0] — 2026-03-17

### Added
- **Asda adapter** — barcode via ASDA preloaded-state script + API fallback
- **Morrisons adapter** — ingredient-only classification (no barcode available)
- **Ocado adapter** — ingredient-only via BOP API
- **Waitrose adapter** — PDP + category page support
- Multi-site adapter registry (`content/sites/registry.js`)
- `BaseAdapter` class with shared utilities (`content/sites/base-adapter.js`)
- Jest tests for all adapters (320 tests total)

---

## [1.0.0] — 2026-03-08

### Added
- Initial public release
- **Tesco adapter** — PDP + groceries listing pages
- Barcode-first classification: JSON-LD `gtin13` → OpenFoodFacts v3 lookup
- Fallback: OpenFoodFacts v3 stateless ingredient analysis
- Final fallback: local NOVA rule-based classifier
- NOVA 1–4 inline colour-coded badges with tooltip
- Flag-as-incorrect button in badge tooltip
- Extension popup: product count, clear cache, debug toggle
- `chrome.storage.local` caching (7-day TTL)
- NOVA 1 fast-path for fresh produce (GS1 category inference)
- GS1 '2'-prefix EAN filtering (store-weighted items)

---

## [0.5.0] — 2026-03-06

### Changed
- NOVA 4 indicator set aligned with OpenFoodFacts taxonomy

---

## [0.1.0] — 2026-02-22

### Added
- Project skeleton: Manifest V3 structure, service worker, content script
- NOVA classifier proof-of-concept (ingredient keyword matching)
- OpenFoodFacts API integration
- Basic badge rendering
