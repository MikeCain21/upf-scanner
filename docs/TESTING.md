# TESTING.md - Testing Guide

**Project:** UPF Scanner
**Last Updated:** 2026-02-24

> This document provides testing procedures, verification checklists, and guidance for testing the NOVA extension throughout development.

---

## Quick Start: Running Tests

```
npm test
```

Expected output:
```
PASS test/unit/ingredient-parser.test.js
PASS test/unit/nova-classifier.test.js
PASS test/unit/nova-indicators.test.js
...

Tests: 395 passed
Time: ~1s
```

All tests should be green. If any fail, see [If a test fails](#if-a-test-fails) in `docs/DEVELOPMENT.md`.

**Other test commands:**
```
npm run test:watch     # Re-runs on file save (use while editing)
npm run test:verbose   # Shows every individual test name
npm run test:coverage  # Runs tests and shows per-file coverage report
```

---

## Three types of testing

| Type | Command / Tool | What it covers | Requires browser? |
|------|---------------|----------------|-------------------|
| **Unit tests** | `npm test` | Logic in `lib/` (parser, classifier) | No — runs in Node.js |
| **Browser integration** | `test/manual/test-integration.html` (open directly in Chrome) | Full pipeline: detect → parse → classify → badge | Yes |
| **Manual extension test** | Load unpacked in Chrome | Full end-to-end, live Tesco page | Yes |

Use unit tests as the primary check for any code in `lib/`. They run instantly and require no browser.
Use browser integration tests (`test/manual/test-integration.html`) when you change `content/sites/tesco.js` or any lib file.
Use manual extension testing for final verification before marking a phase complete.

---

## Table of Contents
1. [Testing Philosophy](#testing-philosophy)
2. [Test Environment Setup](#test-environment-setup)
3. [Testing Tools](#testing-tools)
4. [Phase-by-Phase Testing](#phase-by-phase-testing)
5. [Test Data Requirements](#test-data-requirements)
6. [Manual Testing Procedures](#manual-testing-procedures)
7. [Debugging Tips](#debugging-tips)

---

## Testing Philosophy

### Core Principles

**Test Before Progress:**
- NEVER ship a change without running `npm test` first
- If a test fails, fix it before moving on

**Real-World Testing:**
- Use actual Tesco HTML pages (saved from live site)
- Use real product barcodes
- Test with variety of product types (fresh, packaged, ready meals, etc.)

**Document Everything:**
- Note any edge cases discovered
- Document architectural decisions in `docs/DECISIONS.md`
- Document workarounds or fixes

---

## Test Environment Setup

### Prerequisites

**Software:**
- Google Chrome (latest stable version)
- Chrome DevTools (built-in)
- Text editor (VS Code recommended)

**Extension Setup:**
1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `upf-scanner` project folder
6. Extension should appear in list (no errors)

**Verify Setup:**
- Extension icon appears in Chrome toolbar
- No errors in extension details (`chrome://extensions/`)
- Click extension icon → popup opens (if implemented)

---

## Testing Tools

### 1. Jest Unit Tests (`npm test`)

**Purpose:** Test logic code in `lib/` without a browser. Instant feedback (~0.5s).

**Test files:**
- `test/unit/ingredient-parser.test.js` — unit tests for `lib/ingredient-parser.js`
- `test/unit/nova-classifier.test.js` — unit tests for `lib/nova-classifier.js`
- `test/unit/nova-indicators.test.js` — unit tests for `lib/nova-indicators.js`
- `test/unit/openfoodfacts.test.js` — unit tests for `lib/openfoodfacts.js`
- `test/unit/base-adapter.test.js` — unit tests for `content/sites/base-adapter.js`
- `test/unit/registry.test.js` — unit tests for `content/sites/registry.js`
- `test/unit/sainsburys-adapter.test.js` — unit tests for Sainsbury's adapter
- `test/unit/asda-adapter.test.js` — unit tests for ASDA adapter
- `test/unit/morrisons-adapter.test.js` — unit tests for Morrisons adapter
- `test/unit/waitrose-adapter.test.js` — unit tests for Waitrose adapter
- `test/unit/ocado-adapter.test.js` — unit tests for Ocado adapter
- `test/connectivity/openfoodfacts-connectivity.test.js` — live connectivity tests (requires network)

**Commands:**
```bash
npm test                   # Run once
npm run test:watch         # Re-run on every file save
npm run test:verbose       # Show every individual test name
npm run test:coverage      # Run with per-file coverage report
```

**When to use:**
For any code in `lib/` that has no DOM or browser dependencies, write a Jest test in `test/unit/*.test.js` and run `npm test` as the primary verification step. Jest is the authoritative test for parser logic — if it passes here, the logic is correct.

---

### 2. Chrome DevTools Console

**Purpose:** View logs, debug JavaScript, inspect DOM

**How to Open:**
- Right-click on page → "Inspect"
- Or press `F12` (Windows/Linux) or `Cmd+Opt+I` (Mac)
- Switch to "Console" tab

**What to Look For:**
- `[Extension]` prefixed logs from our code
- Errors (red text) - must fix before proceeding
- Warnings (yellow text) - investigate
- Our debug logs (product detection, classification, etc.)

**Example Logs:**
```
[Extension] Loaded on tesco.com
[Detection] Found 24 products on page
[API] Checking cache for barcode 5000168123456
[API] Cache miss, querying OpenFoodFacts
[Classification] NOVA 4 - Ultra-processed (E621, modified starch)
[Badge] Displayed NOVA 4 badge
```

---

### 3. Chrome Network Tab

**Purpose:** Monitor API calls, check rate limiting, verify caching

**How to Open:**
- DevTools → "Network" tab
- Reload page to see all requests

**What to Look For:**
- API requests to `openfoodfacts.org`
- Status codes (200 OK, 404 Not Found, etc.)
- Number of requests (should be minimal if caching works)
- Response payloads (check NOVA data)

**Example Check:**
- Load Tesco page with 20 products
- First load: Should see ~20 API requests (or fewer if some cached)
- Reload page: Should see 0 API requests (all cached)

---

### 4. Chrome Storage Viewer

**Purpose:** Inspect cached data

**How to Open:**
- DevTools → "Application" tab
- Left sidebar → "Storage" → "Local Storage" → "chrome-extension://[ID]"
- Or use Console: `chrome.storage.local.get(null, console.log)`

**What to Look For:**
- Cached products (keys like `openfoodfacts_5000168123456`)
- TTL timestamps (verify expiry logic)
- Cache size (shouldn't exceed limits)

---

### 5. Browser Integration Harnesses (`test/manual/`)

**Purpose:** Test DOM extraction code (Tesco adapter) against saved HTML pages in a real browser. Required because Jest has no DOM.

**How to Use:**
1. Open `test/manual/test-integration.html` directly in Chrome (no server needed)
2. A pass/fail table appears — all rows should be green
3. Check console for details if a row is red

**Files:**
- `test/manual/test-integration.html` — Full pipeline harness (detect → parse → classify → badge)
- `test/manual/test-runner.html` — General test runner harness

**Benefits:**
- Repeatable tests (same HTML every time)
- Faster than loading the live Tesco site
- Tests DOM extraction in isolation from extension infrastructure
   

## Manual Testing Procedures

### How to Find Product Barcodes on Tesco

1. Open product detail page
2. Right-click → "Inspect"
3. Search HTML for "GTIN" or "EAN" or "barcode"
4. Often in `<meta>` tags or data attributes
5. Example: `<meta property="product:ean" content="5000168123456">`

### How to Check Console Logs

1. Open DevTools (F12)
2. Go to "Console" tab
3. Filter by "[Extension]" or other prefixes
4. Look for errors (red), warnings (yellow), info (blue)

### How to Check Network Requests

1. Open DevTools → "Network" tab
2. Reload page
3. Filter by "openfoodfacts" to see API requests
4. Click on request to see details (headers, response)

---

## Debugging Tips

### Common Issues & Solutions

**Issue:** Extension not loading
- **Check:** Errors in `chrome://extensions`
- **Fix:** Look at error message, fix syntax errors

**Issue:** Content script not injecting
- **Check:** Manifest has correct `matches` pattern
- **Fix:** Ensure `"matches": ["https://www.tesco.com/*"]`

**Issue:** Product detection not working
- **Check:** Console for "[Detection]" logs
- **Fix:** Verify CSS selectors match Tesco's HTML structure

**Issue:** Ingredients not extracting
- **Check:** Inspect Tesco page, find ingredients section
- **Fix:** Update selectors in `content/sites/tesco.js`

**Issue:** API requests failing
- **Check:** Network tab for 404, 500 errors
- **Fix:** Verify barcode format, check User-Agent header

**Issue:** Badges not appearing
- **Check:** Console for errors during badge injection
- **Fix:** Verify badge creation logic, check CSS

### Debug Logging Template

```javascript
// Add generous logging during development
console.log('[Detection] Found products:', productElements.length);
console.log('[Product]', product.name, product.barcode);
console.log('[Ingredients]', ingredients);
console.log('[Classification]', result.score, result.reason);
console.log('[Badge] Injected for', product.name);
```

---

*End of TESTING.md*
