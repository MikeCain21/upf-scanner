/**
 * Morrisons Site Adapter
 *
 * Detects and extracts product information from groceries.morrisons.com.
 *
 * Barcode strategy: Morrisons JSON-LD exposes only `sku` (internal retailerProductId),
 * not `gtin13`. Exhaustive spike confirmed: the EAN-13 is absent from JSON-LD,
 * the 384 KB SSR `initial-state-script` blob, the BOP product API
 * (/api/webproductpagews/v5/products/bop?retailerProductId=…), `urql-ssr-data`,
 * and the v6/products catalog. Classification falls back to DOM ingredient text
 * analysis and the local NOVA classifier.
 *
 * Ingredient strategy: Find <h2> starting with "Ingredients" inside
 * [data-test="bop-view"], then read the textContent of its nextElementSibling.
 * The `data-test="bop-view"` attribute is Synthetics-monitored — very stable as
 * Morrisons' own QA suite depends on it.
 *
 * CSS classes are obfuscated hashes (e.g. `_display_xy0eg_1`). Only `data-test`
 * attributes and semantic HTML (h1, h2) are used — no class-name selectors.
 *
 * SPA: Morrisons uses history.pushState navigation — main.js setupSpaNavigation()
 * handles automatic re-runs on URL change.
 *
 * Spike findings (2026-03-18 across Frubes, Cathedral City, Cheestrings, bananas,
 * sunflower oil):
 *   PDP URL pattern: /products/{slug}/{retailerProductId}
 *   Barcode (gtin13): ❌ not available anywhere on page
 *   Ingredient DOM: ✅ h2 + nextElementSibling inside [data-test="bop-view"]
 *   Tile selector: [data-test^="fop-wrapper:"] — grid/carousel product cards
 *
 * Extends BaseAdapter — shared utilities (_extractJsonLd, _trySelectors)
 * are inherited. Registers itself with the adapter registry.
 *
 * @version 1.0.0
 */

'use strict';

/* global BaseAdapter, registry */

// ---------------------------------------------------------------------------
// Constants — update these when Morrisons redesigns their site
// ---------------------------------------------------------------------------

const MORRISONS_SITE_ID = 'morrisons';
const MORRISONS_HOSTNAME = 'groceries.morrisons.com';

/**
 * DOM selectors for Morrisons pages.
 * Uses `data-test` attributes only — no obfuscated CSS class names.
 */
const MORRISONS_SELECTORS = {
  // Synthetics-monitored product detail panel — very stable
  BOP_VIEW: '[data-test="bop-view"]',

  // Product tile wrappers on category/search pages (carousel, grid)
  // data-test value includes product slug, e.g. "fop-wrapper:morrisons-cornflakes-500g"
  TILE_WRAPPER: '[data-test^="fop-wrapper:"]',

  // Product link inside a tile — href contains the PDP URL
  TILE_PRODUCT_LINK: '[data-test="fop-product-link"]',

  // Product title text inside a tile
  TILE_TITLE: '[data-test="fop-title"]',
};

// ---------------------------------------------------------------------------
// MorrisonsAdapter
// ---------------------------------------------------------------------------

class MorrisonsAdapter extends BaseAdapter {
  get SITE_ID() { return MORRISONS_SITE_ID; }

  /**
   * Checks whether this adapter should handle the given URL.
   *
   * @param {string} url - The full page URL
   * @returns {boolean}
   */
  isSupported(url) {
    return typeof url === 'string' && url.includes(MORRISONS_HOSTNAME);
  }

  /**
   * Returns true when the element is the main PDP product H1.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  isMainProduct(el) {
    return el.tagName === 'H1';
  }

  /**
   * Detects all product elements on the page.
   * Returns the main H1 (if on a PDP) plus any carousel/grid tile wrappers.
   *
   * @param {Document} doc
   * @returns {Element[]}
   */
  detectProducts(doc) {
    const products = [];
    const h1 = doc.querySelector('h1');
    if (h1) products.push(h1);
    const tiles = [...doc.querySelectorAll(MORRISONS_SELECTORS.TILE_WRAPPER)];
    return [...products, ...tiles];
  }

  /**
   * Extracts structured product data from a product element.
   *
   * For the main H1, productId is parsed from the PDP URL path.
   * For tile wrappers, productId and URL are read from the tile's product link href.
   *
   * @param {Element} el - Element returned by detectProducts()
   * @returns {{ name: string, url: string, productId: string }}
   */
  extractProductInfo(el) {
    if (el.tagName === 'H1') {
      const href = typeof window !== 'undefined' ? window.location.href : '';
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const productId = pathname.match(/\/products\/[^/]+\/(\d+)/)?.[1] ?? '';
      return { name: el.textContent.trim(), url: href, productId };
    }

    // Carousel / grid tile
    const link = el.querySelector(MORRISONS_SELECTORS.TILE_PRODUCT_LINK);
    const title = el.querySelector(MORRISONS_SELECTORS.TILE_TITLE);
    const href = link?.href ?? '';
    const productId = href.match(/\/products\/[^/]+\/(\d+)/)?.[1] ?? '';
    return { name: title?.textContent?.trim() ?? '', url: href, productId };
  }

  /**
   * Barcode extraction — always returns null.
   *
   * No EAN-13 barcode is available anywhere on Morrisons pages. The `sku` in
   * JSON-LD is a Morrisons-internal retailerProductId, not indexed by OpenFoodFacts.
   * Classification falls back to ingredient analysis.
   *
   * @returns {null}
   */
  // eslint-disable-next-line no-unused-vars
  extractBarcode(_doc) {
    return null;
  }

  /**
   * Extracts ingredient text from the product detail panel.
   *
   * Finds the first <h2> starting with "Ingredients" inside [data-test="bop-view"],
   * then returns the trimmed textContent of its nextElementSibling.
   *
   * Returns null for products with no ingredient list (fresh produce, plain oils, etc.)
   *
   * @param {Document} doc
   * @returns {string|null}
   */
  extractIngredients(doc) {
    const bopView = doc.querySelector(MORRISONS_SELECTORS.BOP_VIEW);
    if (!bopView) return null;

    const h2 = [...bopView.querySelectorAll('h2')].find(h =>
      /^ingredients/i.test(h.textContent.trim())
    );
    const sibling = h2?.nextElementSibling;
    return sibling?.textContent?.trim() || null;
  }
}

// ---------------------------------------------------------------------------
// Self-register with the adapter registry
// ---------------------------------------------------------------------------

// Dual export: CommonJS for Jest tests; self-register in browser content scripts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MorrisonsAdapter };
} else {
  registry.register(new MorrisonsAdapter());
}
