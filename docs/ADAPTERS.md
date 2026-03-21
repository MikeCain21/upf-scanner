# UPF Scanner — Adding a New Supermarket Adapter

**Last Updated:** 2026-03-17

This document describes everything needed to add NOVA badge support to a new UK supermarket site. It covers the adapter contract, the research spike process, the implementation checklist, required tests, and the current status of all planned adapters.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Adapter Contract](#adapter-contract)
3. [Step 1: Research Spike](#step-1-research-spike)
4. [Step 2: Build the Adapter](#step-2-build-the-adapter)
5. [Step 3: Wire into manifest.json](#step-3-wire-into-manifestjson)
6. [Step 4: Write Unit Tests](#step-4-write-unit-tests)
7. [Step 5: Live Verification](#step-5-live-verification)
8. [Remaining Adapters](#remaining-adapters)
9. [Reference: TescoAdapter](#reference-tescoadapter)

---

## Architecture Overview

Every site adapter is a class that extends `BaseAdapter` and self-registers with the singleton `registry`. `content/main.js` calls `registry.getAdapter(url)` on every page load to find the right adapter — no changes to `main.js` are needed when adding a new site.

```
content/sites/
  base-adapter.js   ← abstract base class + shared utilities
  registry.js       ← singleton registry (register / getAdapter / getAll)
  tesco.js          ← TescoAdapter (reference implementation)
  waitrose.js       ← WaitroseAdapter (to build)
  ocado.js          ← OcadoAdapter (to build)
  sainsburys.js     ← SainsburysAdapter (to build)
  morrisons.js      ← MorrisonsAdapter (to build)
  asda.js           ← AsdaAdapter (to build)
```

**Load order in `manifest.json`** (must be respected):
1. `lib/browser-polyfill.js`
2. `content/sites/base-adapter.js`
3. `content/sites/registry.js`
4. `content/sites/{site}.js` ← your new adapter goes here
5. `lib/ingredient-parser.js`, `lib/nova-indicators.js`, `lib/nova-classifier.js`
6. `content/ui/badge.js`
7. `content/main.js`

---

## Adapter Contract

### Required: `SITE_ID` getter

```javascript
get SITE_ID() { return 'waitrose'; }
```

Unique lowercase string identifying the site. Used in debug logs. Must match the adapter filename (e.g., `'waitrose'` → `waitrose.js`).

---

### Required: `isSupported(url) → boolean`

```javascript
/**
 * Returns true when this adapter should handle the given URL.
 * @param {string} url - window.location.href
 * @returns {boolean}
 */
isSupported(url) { ... }
```

Called by `registry.getAdapter(url)` on every page. Keep it cheap — a simple `url.includes()` or hostname + path check is fine.

---

### Required: `detectProducts(doc) → Element[]`

```javascript
/**
 * Returns all product elements on the page.
 * On a PDP: [mainProductH1, ...relatedTiles] or just [mainProductH1].
 * On a listing page: all product tile elements.
 *
 * @param {Document} doc
 * @returns {Element[]}
 */
detectProducts(doc) { ... }
```

`content/main.js` iterates over the returned elements and calls `extractProductInfo()` on each. The main PDP product (the one that gets badged) must be the first element returned, or must be identifiable by `isMainProduct()` in `main.js`. Currently `main.js` identifies the "main" product as the element that passes `isMainProduct(el)`:

```javascript
// content/main.js — current isMainProduct check (Tesco-specific)
function isMainProduct(el) {
  return el.tagName === 'H1' && el.getAttribute('data-auto') === 'pdp-product-title';
}
```

> **Note:** `isMainProduct` is currently hardcoded for Tesco. When adding a second site, this check should be moved into the adapter as `adapter.isMainProduct(el)`. Document this as a known limitation until then.

---

### Required: `extractProductInfo(el) → ProductInfo`

```javascript
/**
 * Extracts structured metadata from a product element.
 *
 * @param {Element} el - An element returned by detectProducts()
 * @returns {{ name: string, url: string, productId: string|null }}
 */
extractProductInfo(el) { ... }
```

**Return schema:**

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Product display name (shown in debug logs) |
| `url` | `string` | Full product URL (used to construct OFF deep-link) |
| `productId` | `string\|null` | Site-internal product ID used as cache key; `null` if unavailable |

`productId` does **not** need to be an EAN barcode — it is only used as a cache key for the OFF ingredient analysis response. The barcode is extracted separately by `extractBarcode()`.

---

### Optional: `extractBarcode(doc) → string|null`

```javascript
/**
 * Returns the EAN-13 barcode for the main product, or null.
 *
 * DEFAULT IMPLEMENTATION: reads gtin13 from JSON-LD structured data.
 * Override only if the site uses a different mechanism.
 *
 * @param {Document} doc
 * @returns {string|null}
 */
extractBarcode(doc) { ... }
```

The default implementation in `BaseAdapter` parses all `<script type="application/ld+json">` blocks and looks for a `Product` node with a `gtin13` field. This works for Tesco, Waitrose, Ocado, Sainsbury's, and Morrisons.

**Only override if:**
- The site embeds the barcode outside JSON-LD (e.g., in a `data-*` attribute or a separate API call)
- The JSON-LD uses `gtin` instead of `gtin13` (update `_extractJsonLd` in that case)

---

### Optional: `extractIngredients(doc) → string|null`

```javascript
/**
 * Returns the raw ingredient text from the product detail page, or null.
 *
 * DEFAULT IMPLEMENTATION: returns null (falls through to local classifier).
 * Override to enable the OFF ingredient analysis fallback.
 *
 * @param {Document} doc
 * @returns {string|null}
 */
extractIngredients(doc) { ... }
```

The returned string is sent as-is to the OFF v3 stateless analysis endpoint. It does not need to be parsed — just the raw text from the DOM, trimmed.

Minimum length check: `content/main.js` uses the result directly; `extractIngredients` should return `null` (not an empty string or a short string like `"Vegan"`) when no real ingredient list is available. Add a length guard inside the method if needed:

```javascript
const text = el?.textContent?.trim();
return (text && text.length > 10) ? text : null;
```

---

### Inherited utilities (do not override without good reason)

| Method | Description |
|---|---|
| `_extractJsonLd(doc)` | Parses all JSON-LD blocks, returns `gtin13` from a `Product` node |
| `_trySelectors(doc, selectors)` | Tries CSS selectors in order, returns first matching element |

```javascript
// _trySelectors example
const ingredientEl = this._trySelectors(doc, [
  '#tab-ingredients .ingredients-text',
  '[data-testid="ingredients-content"]',
  '.pdp-ingredients p',
]);
```

---

## Step 1: Research Spike

**Before writing any code**, navigate to a real PDP for the target site using Chrome DevTools and answer the following questions.

### What to find

| Signal | Where to look |
|---|---|
| PDP URL pattern | What does a product URL look like? (e.g., `/ecom/products/`) |
| `gtin13` / barcode | Is there `<script type="application/ld+json">` with `gtin13`? |
| Product title selector | What element/attributes identify the main H1? |
| Ingredient text selector | What element contains the ingredient list text? |
| Product tile selector | What element wraps each product on category/listing pages? |

### How to run the spike

1. `chrome-nova` in terminal → Chrome opens with extension loaded
2. Navigate to a product detail page for the target site
3. Open DevTools (F12) → Elements tab
4. For JSON-LD: Console → `JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)`
5. For ingredient selector: right-click the ingredient text → Inspect, note the element and its stable attributes
6. For tile selector: right-click a product tile → Inspect, look for `data-product-id` or similar stable attribute

### Spike validation checklist

- [ ] JSON-LD `gtin13` found → `_extractJsonLd` will work (no `extractBarcode` override needed)
- [ ] Ingredient element identified with a stable selector (prefer `data-*` over class names)
- [ ] Product title H1 identified with a stable selector
- [ ] Tile selector identified (if category pages are in scope)
- [ ] Verified barcode against OFF: `https://world.openfoodfacts.org/api/v2/product/{barcode}.json` returns `status: 1`

---

## Step 2: Build the Adapter

**File:** `content/sites/{site}.js`

Use this template, filling in selectors discovered during the spike:

```javascript
/**
 * {SiteName} Site Adapter
 *
 * Detects and extracts product information from {SiteName} grocery pages.
 *
 * @version 1.0.0
 */

'use strict';

/* global BaseAdapter, registry */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const {SITE_ID_UPPER}_SITE_ID = '{site}';
const {SITE_ID_UPPER}_HOSTNAME = '{hostname}';

const {SITE_ID_UPPER}_SELECTORS = {
  MAIN_PRODUCT_TITLE: '{h1 selector}',
  PRODUCT_TILE:       '{tile selector}',
  INGREDIENT_SELECTORS: [
    '{primary selector}',
    '{fallback selector 1}',
    '{fallback selector 2}',
  ],
};

const {SITE_ID_UPPER}_PRODUCT_URL_PATTERN = /{url regex}/;
const {SITE_ID_UPPER}_BASE_URL = 'https://{hostname}';

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

class {SiteName}Adapter extends BaseAdapter {
  get SITE_ID() { return {SITE_ID_UPPER}_SITE_ID; }

  isSupported(url) {
    return url.includes({SITE_ID_UPPER}_HOSTNAME);
  }

  detectProducts(doc) {
    const products = [];
    const mainTitle = doc.querySelector({SITE_ID_UPPER}_SELECTORS.MAIN_PRODUCT_TITLE);
    if (mainTitle) products.push(mainTitle);
    doc.querySelectorAll({SITE_ID_UPPER}_SELECTORS.PRODUCT_TILE).forEach(t => products.push(t));
    return products;
  }

  extractProductInfo(el) {
    if (el.tagName === 'H1') {
      return this._extractMainProductInfo(el);
    }
    return this._extractTileInfo(el);
  }

  extractIngredients(doc) {
    const el = this._trySelectors(doc, {SITE_ID_UPPER}_SELECTORS.INGREDIENT_SELECTORS);
    const text = el?.textContent?.trim();
    return (text && text.length > 10) ? text : null;
  }

  // extractBarcode inherited from BaseAdapter._extractJsonLd — override if needed

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _extractMainProductId(doc) {
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical?.href) {
      const match = canonical.href.match({SITE_ID_UPPER}_PRODUCT_URL_PATTERN);
      if (match) return match[1];
    }
    const pathMatch = window.location.pathname.match({SITE_ID_UPPER}_PRODUCT_URL_PATTERN);
    return pathMatch ? pathMatch[1] : null;
  }

  _extractMainProductInfo(el) {
    const name = el.textContent.trim();
    const productId = this._extractMainProductId(el.ownerDocument);
    const url = productId
      ? `${SITE_ID_UPPER}_BASE_URL + '/path/to/product/' + productId`
      : window.location.href;
    return { name, url, productId };
  }

  _extractTileInfo(el) {
    const productId = el.getAttribute('data-product-id') || null;
    const titleLink = el.querySelector('a');
    const name = titleLink ? titleLink.textContent.trim() : 'Unknown';
    const url = titleLink?.href || (productId ? `${SITE_ID_UPPER}_BASE_URL + '...' + productId` : '');
    return { name, url, productId };
  }
}

// ---------------------------------------------------------------------------
// Self-register
// ---------------------------------------------------------------------------

registry.register(new {SiteName}Adapter());
```

---

## Step 3: Wire into manifest.json

Add a new entry to `content_scripts` in `manifest.json`. Copy the Tesco entry and change the `matches` URL and the site adapter filename:

```json
{
  "matches": ["https://www.waitrose.com/*"],
  "js": [
    "lib/browser-polyfill.js",
    "content/sites/base-adapter.js",
    "content/sites/registry.js",
    "content/sites/waitrose.js",
    "lib/ingredient-parser.js",
    "lib/nova-indicators.js",
    "lib/nova-classifier.js",
    "content/ui/badge.js",
    "content/main.js"
  ],
  "css": ["content/ui/styles.css"],
  "run_at": "document_idle"
}
```

The site's origin must also be present in `host_permissions` (already added for all 5 target sites).

---

## Step 4: Write Unit Tests

**File:** `test/{site}-adapter.test.js`

Minimum **15 tests** per adapter. Use `test/tesco.test.js` as the reference.

### Required test categories

#### 1. `isSupported` (3 tests minimum)
```javascript
test('returns true for a PDP URL', () => {
  expect(adapter.isSupported('https://www.waitrose.com/ecom/products/foo/123')).toBe(true);
});
test('returns false for a different site', () => {
  expect(adapter.isSupported('https://www.tesco.com/groceries/en-GB/products/123')).toBe(false);
});
test('returns true for a category listing URL', () => {
  expect(adapter.isSupported('https://www.waitrose.com/ecom/groceries/category')).toBe(true);
});
```

#### 2. `detectProducts` (3 tests minimum)
```javascript
test('detects main product H1 on a PDP', () => {
  // Build minimal DOM with the PDP H1 selector
  const doc = buildDoc(`<h1 data-testid="product-name">Bread</h1>`);
  expect(adapter.detectProducts(doc)).toHaveLength(1);
});
test('returns empty array when no products found', () => {
  const doc = buildDoc('<div>No products</div>');
  expect(adapter.detectProducts(doc)).toHaveLength(0);
});
test('returns tiles on listing pages', () => {
  const doc = buildDoc(`
    <div data-product-id="111">...</div>
    <div data-product-id="222">...</div>
  `);
  expect(adapter.detectProducts(doc).length).toBeGreaterThanOrEqual(2);
});
```

#### 3. `extractProductInfo` (3 tests minimum)
```javascript
test('returns name, url, productId from a tile element', () => {
  const doc = buildDoc(`<div data-product-id="456"><a href="/product/456">Butter</a></div>`);
  const tile = doc.querySelector('[data-product-id]');
  const info = adapter.extractProductInfo(tile);
  expect(info.name).toBe('Butter');
  expect(info.productId).toBe('456');
  expect(info.url).toContain('456');
});
```

#### 4. `extractBarcode` (2 tests minimum)
```javascript
test('extracts gtin13 from JSON-LD @graph', () => {
  const doc = buildDoc(`
    <script type="application/ld+json">
      {"@graph": [{"@type": "Product", "gtin13": "5000168001234"}]}
    </script>
  `);
  expect(adapter.extractBarcode(doc)).toBe('5000168001234');
});
test('returns null when no JSON-LD present', () => {
  const doc = buildDoc('<div>No JSON-LD</div>');
  expect(adapter.extractBarcode(doc)).toBeNull();
});
```

#### 5. `extractIngredients` (4 tests minimum)
```javascript
test('extracts ingredient text from primary selector', () => {
  // Build DOM matching the primary selector from the spike
  const doc = buildDoc(`<div id="ingredients-panel">Water, Sugar, Salt.</div>`);
  expect(adapter.extractIngredients(doc)).toBe('Water, Sugar, Salt.');
});
test('falls back to secondary selector when primary absent', () => { ... });
test('returns null when ingredient text is shorter than 10 chars', () => {
  const doc = buildDoc(`<div id="ingredients-panel">Vegan</div>`);
  expect(adapter.extractIngredients(doc)).toBeNull();
});
test('returns null when no ingredient panel found', () => {
  const doc = buildDoc('<div>No ingredients</div>');
  expect(adapter.extractIngredients(doc)).toBeNull();
});
```

### Test helper pattern

Use the same `buildDoc` helper as in `test/tesco.test.js`:

```javascript
const { JSDOM } = require('jsdom');

function buildDoc(bodyHtml) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, {
    url: 'https://www.waitrose.com/ecom/products/example/123',
  });
  return dom.window.document;
}
```

### Running tests

```bash
npm test                    # all tests
npx jest test/waitrose      # new adapter only
```

All tests must pass before the adapter is considered complete.

---

## Step 5: Live Verification

Using Chrome DevTools MCP (or the browser directly):

1. Navigate to a real PDP for the target site
2. Verify the NOVA badge appears next to the product title
3. Verify the badge shows the correct NOVA score (cross-check against OpenFoodFacts manually at `https://world.openfoodfacts.org/product/{barcode}`)
4. Click the badge — it should open the OFF product page in a new tab
5. Hover the badge — tooltip should show classification reason and markers
6. Check for JS errors in DevTools console (F12)
7. Navigate to a category/listing page — no errors or broken layout

---

## Reference: TescoAdapter

The complete TescoAdapter in `content/sites/tesco.js` is the canonical reference implementation. Key patterns to copy:

- **Selector constants block** at the top of the file with a comment explaining each one
- **Multi-selector fallback** in `extractIngredients` with comments explaining the two-panel strategy
- **`_extractMainProductId`** tries `<link rel="canonical">` first (works for saved test pages), then `window.location.pathname` (works on live pages)
- **Self-registration** at the bottom: `registry.register(new TescoAdapter())`

```javascript
// Pattern: _extractMainProductId
_extractMainProductId(doc) {
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical?.href) {
    const match = canonical.href.match(URL_PATTERN);
    if (match) return match[1];
  }
  const pathMatch = window.location.pathname.match(URL_PATTERN);
  return pathMatch ? pathMatch[1] : null;
}
```

### `isMainProduct` delegation (resolved in v1.1.0)

`content/main.js` delegates the main-product check to the adapter:

```javascript
function isMainProduct(el, adapter) {
  return typeof adapter.isMainProduct === 'function'
    ? adapter.isMainProduct(el)
    : el.tagName === 'H1'; // generic fallback
}
```

`BaseAdapter` provides a default `isMainProduct(el)` that returns `el.tagName === 'H1'`.
Site adapters override this with a stable-attribute check specific to their site:
- **Tesco:** `el.tagName === 'H1' && el.getAttribute('data-auto') === 'pdp-product-title'`
- **Waitrose:** `el.tagName === 'H1' && el.id === 'productName'`
