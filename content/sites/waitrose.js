/**
 * Waitrose Site Adapter
 *
 * Detects and extracts product information from Waitrose grocery pages.
 * Waitrose is a Next.js app — barcode and ingredient data are serialised into
 * a <script id="__NEXT_DATA__" type="application/json"> tag in the HTML before
 * hydration. Content scripts run in an isolated world and cannot access
 * window.__NEXT_DATA__ (a JavaScript variable set by the page), but they CAN
 * read DOM elements — so all __NEXT_DATA__ access goes via _getNextData(doc)
 * which parses the script tag directly.
 *
 * Selectors that ARE used (DOM fallbacks and PDP detection) are keyed on
 * stable `id` attributes. CSS module class names (e.g. Ingredient_ingredients__)
 * are explicitly avoided — they are generated hashes that change with builds.
 *
 * Spike findings (2026-03-17 on Fanta Orange Zero 2L):
 *   PDP URL pattern: /ecom/products/{slug}/{lineNumber}-{id1}-{id2}
 *   gtin13 in JSON-LD: ❌ not present — JSON-LD Product has `mpn` only
 *   __NEXT_DATA__ script tag: <script id="__NEXT_DATA__" type="application/json">
 *   Barcode source: __NEXT_DATA__.props.pageProps.product.barCodes[0]
 *   Ingredient source: __NEXT_DATA__.props.pageProps.product.contents.ingredients
 *   DOM ingredient fallback: #ingredients-region (stable id; accordion may be collapsed)
 *   Main product H1 selector: h1#productName (stable id)
 *   Line number: __NEXT_DATA__.props.pageProps.product.lineNumber
 *
 * Extends BaseAdapter — shared utilities (_extractJsonLd, _trySelectors)
 * are inherited. Registers itself with the adapter registry.
 *
 * @version 1.1.0
 */

'use strict';

/* global BaseAdapter, registry */

// ---------------------------------------------------------------------------
// Constants — update these when Waitrose redesigns their site
// ---------------------------------------------------------------------------

const WAITROSE_SITE_ID = 'waitrose';
const WAITROSE_HOSTNAME = 'waitrose.com';

/**
 * DOM selectors for Waitrose pages.
 * Uses stable `id` attributes only — no CSS module class names.
 */
const WAITROSE_SELECTORS = {
  // Product detail page — main product title (h1 with stable id)
  MAIN_PRODUCT_TITLE: 'h1#productName',

  // Next.js server-rendered page props — parsed by _getNextData()
  NEXT_DATA_SCRIPT: 'script#__NEXT_DATA__',

  // Ingredient text fallback when __NEXT_DATA__ script tag is unavailable.
  // The accordion may be collapsed on page load but the region id is stable.
  INGREDIENT_FALLBACK: '#ingredients-region',
};

// ---------------------------------------------------------------------------
// WaitroseAdapter
// ---------------------------------------------------------------------------

class WaitroseAdapter extends BaseAdapter {
  get SITE_ID() { return WAITROSE_SITE_ID; }

  /**
   * Checks whether this adapter should handle the given URL.
   *
   * @param {string} url - The full page URL
   * @returns {boolean}
   */
  isSupported(url) {
    try {
      const { hostname, pathname } = new URL(url);
      return (hostname === WAITROSE_HOSTNAME || hostname.endsWith('.' + WAITROSE_HOSTNAME)) &&
        pathname.includes('/ecom/products/');
    } catch {
      return false;
    }
  }

  /**
   * Returns true when the element is the Waitrose main PDP product H1.
   * Uses the stable id="productName" attribute.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  isMainProduct(el) {
    return el.tagName === 'H1' && el.id === 'productName';
  }

  /**
   * Detects all product elements on the page.
   * Waitrose v1 supports PDPs only — tile-level classification is skipped
   * because tile elements do not expose barcode data.
   *
   * @param {Document} doc - The document to inspect
   * @returns {Element[]} Array of product elements (at most one on a PDP)
   */
  detectProducts(doc) {
    const products = [];
    const mainTitle = doc.querySelector(WAITROSE_SELECTORS.MAIN_PRODUCT_TITLE);
    if (mainTitle) products.push(mainTitle);
    return products;
  }

  /**
   * Extracts structured product data from a product element.
   * productId is the Waitrose line number from __NEXT_DATA__ — used only as
   * a cache key for the OFF ingredient analysis response, not as a barcode.
   *
   * @param {Element} el - Element returned by detectProducts()
   * @returns {{ name: string, url: string, productId: string|null }}
   */
  extractProductInfo(el) {
    const name = el.textContent.trim();
    const productId = this._lineNumber(el.ownerDocument);
    const url = typeof window !== 'undefined' ? window.location.href : '';
    return { name, url, productId };
  }

  /**
   * Extracts the EAN-13 barcode for the main product on the page.
   *
   * Primary: reads barCodes[0] from the __NEXT_DATA__ script tag (server-rendered
   * Next.js page props). Accessible to content scripts via DOM, unlike
   * window.__NEXT_DATA__ which is in the page's JavaScript scope.
   * Fallback: _extractJsonLd(doc) for any JSON-LD that may be present.
   *
   * @param {Document} doc
   * @returns {string|null}
   */
  extractBarcode(doc) {
    const nextData = this._getNextData(doc);
    const barCodes = nextData?.props?.pageProps?.product?.barCodes;
    if (Array.isArray(barCodes) && barCodes.length > 0) return barCodes[0];
    return this._extractJsonLd(doc);
  }

  /**
   * Returns all EAN barcodes from the __NEXT_DATA__ barCodes array.
   * Waitrose lists multiple EANs per product; the canonical barcode for
   * OpenFoodFacts may be at any index — all are tried in parallel.
   * Falls back to JSON-LD (via extractBarcode) if __NEXT_DATA__ absent.
   *
   * @param {Document} doc
   * @returns {string[]}
   */
  extractBarcodes(doc) {
    const nextData = this._getNextData(doc);
    const barCodes = nextData?.props?.pageProps?.product?.barCodes;
    if (Array.isArray(barCodes) && barCodes.length > 0) {
      // Only EAN-8 (8 digits) and EAN-13 (13 digits) are valid product database codes.
      // Waitrose also stores short internal codes (e.g. 4-digit line refs) that coincidentally
      // match unrelated OFF products — filtering them out prevents false classifications.
      const valid = barCodes.filter(bc => /^\d{8}$|^\d{13}$/.test(bc));
      if (valid.length > 0) return valid;
    }
    const single = this._extractJsonLd(doc);
    return single ? [single] : [];
  }

  /**
   * Extracts the raw ingredient text from a Waitrose product detail page.
   *
   * Primary: reads ingredients string from the __NEXT_DATA__ script tag — clean
   * text, no DOM parsing needed. Available before any accordion interaction.
   * Fallback 1: #ingredients-region element text (may be empty if accordion
   * is collapsed and the content has not been loaded).
   * Fallback 2: bopStatutoryDescription — the statutory product description
   * for single-ingredient fresh produce (e.g. "Banana") that has no ingredient
   * list because the product itself is the only ingredient.
   *
   * @param {Document} doc
   * @returns {string|null} Raw ingredient text, or null if unavailable
   */
  extractIngredients(doc) {
    const nextData = this._getNextData(doc);
    const product = nextData?.props?.pageProps?.product;

    // Primary: structured ingredients text from __NEXT_DATA__
    const text = product?.contents?.ingredients;
    if (text && text.trim().length > 10) return text.trim();

    // DOM fallback — accordion #ingredients-region
    const el = doc.querySelector(WAITROSE_SELECTORS.INGREDIENT_FALLBACK);
    const domText = el?.textContent?.trim();
    if (domText && domText.length > 10) return domText;

    // Final fallback: statutory description for single-ingredient products (e.g. "Banana").
    // Fresh produce has no ingredient list — the product itself is the ingredient.
    // Lower threshold (≥ 2) because structured field values are reliably short.
    const statutory = product?.contents?.bopStatutoryDescription?.trim();
    if (statutory && statutory.length >= 2) return statutory;

    return null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Parses the Next.js __NEXT_DATA__ script tag and returns the data object.
   * Content scripts run in an isolated world and cannot access the page's
   * window.__NEXT_DATA__ variable, but CAN read the DOM script tag directly.
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  _getNextData(doc) {
    try {
      const script = doc.querySelector(WAITROSE_SELECTORS.NEXT_DATA_SCRIPT);
      if (script) return JSON.parse(script.textContent);
    } catch {
      // Malformed JSON — fail gracefully
    }
    return null;
  }

  /**
   * Reads the Waitrose product line number from the __NEXT_DATA__ script tag.
   * Used as the productId cache key for ingredient analysis results.
   *
   * @param {Document} doc
   * @returns {string|null}
   */
  _lineNumber(doc) {
    const nextData = this._getNextData(doc);
    return nextData?.props?.pageProps?.product?.lineNumber ?? null;
  }
}

// ---------------------------------------------------------------------------
// Self-register with the adapter registry
// ---------------------------------------------------------------------------

// Dual export: CommonJS for Jest tests; self-register in browser content scripts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WaitroseAdapter };
} else {
  registry.register(new WaitroseAdapter());
}
