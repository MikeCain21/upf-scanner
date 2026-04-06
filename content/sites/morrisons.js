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
    try {
      const { hostname, pathname } = new URL(url);
      return (hostname === MORRISONS_HOSTNAME || hostname.endsWith('.' + MORRISONS_HOSTNAME)) &&
        pathname.includes('/products/');
    } catch {
      return false;
    }
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
   * Detects the main product element on a Morrisons PDP.
   *
   * @param {Document} doc
   * @returns {Element[]}
   */
  detectProducts(doc) {
    const h1 = doc.querySelector('h1');
    return h1 ? [h1] : [];
  }

  /**
   * Extracts structured product data from the main PDP H1 element.
   *
   * @param {Element} el - Element returned by detectProducts()
   * @returns {{ name: string, url: string, productId: string }}
   */
  extractProductInfo(el) {
    const href = typeof window !== 'undefined' ? window.location.href : '';
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const productId = pathname.match(/\/products\/[^/]+\/(\d+)/)?.[1] ?? '';
    return { name: el.textContent.trim(), url: href, productId };
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
