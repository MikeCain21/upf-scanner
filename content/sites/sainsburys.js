/**
 * Sainsbury's Site Adapter
 *
 * Detects and extracts product information from Sainsbury's grocery pages.
 * Sainsbury's uses Next.js App Router (React Server Components) — there is no
 * __NEXT_DATA__ script tag. Barcodes are fetched from the Groceries Online (GOL)
 * API at runtime using the SKU extracted from the JSON-LD Product node.
 *
 * Key constraints:
 *   - `extractBarcodes` is async (requires a network fetch to the GOL API)
 *   - content/main.js awaits the result — `await nonPromise` is a no-op for
 *     sync adapters so Tesco and Waitrose are unaffected
 *   - CSS module class names and dynamic React IDs (`:r690:`) are explicitly
 *     avoided — ingredient accordion items are matched by label text instead
 *
 * Spike findings (2026-03-17 on Petit Filous Frubes 9x40g):
 *   PDP URL pattern: /gol-ui/product/{product-slug}
 *   H1 selector:     h1[data-testid="pd-product-title"] — stable data-testid
 *   gtin13 in JSON-LD: ❌ Not present — JSON-LD has `sku` (internal ID) only
 *   Barcode source:  GOL API: /groceries-api/gol-services/product/v1/product/{sku}
 *                    → { "eans": ["3176575128962", ...] }
 *   Multiple EANs:   ✅ Yes (5 found on Frubes) — same Promise.any pattern as Waitrose
 *   Ingredient DOM:  .ds-c-accordion-item — iterate by label text; content in
 *                    .ds-c-accordion-item__content
 *   __NEXT_DATA__:   ❌ Not present — App Router does not render this tag
 *   Accordion IDs:   Dynamic React IDs (:r690:) — cannot use as selectors
 *
 * Extends BaseAdapter — shared utilities (_extractJsonLd, _trySelectors)
 * are inherited. Registers itself with the adapter registry.
 *
 * @version 1.0.0
 */

'use strict';

/* global BaseAdapter, registry */

// ---------------------------------------------------------------------------
// Constants — update these when Sainsbury's redesigns their site
// ---------------------------------------------------------------------------

const SAINSBURYS_SITE_ID = 'sainsburys';
const SAINSBURYS_HOSTNAME = 'sainsburys.co.uk';

/** Valid product barcode patterns: EAN-8 (8 digits) or EAN-13 (13 digits) */
const SAINSBURYS_EAN_PATTERN = /^\d{8}$|^\d{13}$/;

/**
 * DOM selectors for Sainsbury's pages.
 * Uses stable data-testid attributes where available; no CSS module class names.
 * Accordion items are identified by label text, not by dynamic React IDs.
 */
const SAINSBURYS_SELECTORS = {
  // Product detail page — main product title (h1 with stable data-testid)
  MAIN_PRODUCT_TITLE: 'h1[data-testid="pd-product-title"]',

  // Accordion item container — each collapsible section on the PDP
  ACCORDION_ITEM: '.ds-c-accordion-item',

  // Label text element inside an accordion item — used to identify "Ingredients"
  ACCORDION_LABEL: '.ds-c-accordion-item__label--text',

  // Content element inside an accordion item — holds the ingredient list text
  ACCORDION_CONTENT: '.ds-c-accordion-item__content',
};

// ---------------------------------------------------------------------------
// SainsburysAdapter
// ---------------------------------------------------------------------------

class SainsburysAdapter extends BaseAdapter {
  get SITE_ID() { return SAINSBURYS_SITE_ID; }

  /**
   * Checks whether this adapter should handle the given URL.
   *
   * @param {string} url - The full page URL
   * @returns {boolean}
   */
  isSupported(url) {
    return typeof url === 'string' &&
      url.includes(SAINSBURYS_HOSTNAME) &&
      url.includes('/gol-ui/product/');
  }

  /**
   * Returns true when the element is the Sainsbury's main PDP product H1.
   * Uses the stable data-testid attribute set by Sainsbury's React renderer.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  isMainProduct(el) {
    return el.tagName === 'H1' && el.getAttribute('data-testid') === 'pd-product-title';
  }

  /**
   * Detects all product elements on the page.
   * Sainsbury's v1 supports PDPs only — tile elements do not expose barcode data
   * in the DOM and are not in scope for this version.
   *
   * @param {Document} doc - The document to inspect
   * @returns {Element[]} Array containing the main product H1 (if present)
   */
  detectProducts(doc) {
    const products = [];
    const mainTitle = doc.querySelector(SAINSBURYS_SELECTORS.MAIN_PRODUCT_TITLE);
    if (mainTitle) products.push(mainTitle);
    return products;
  }

  /**
   * Extracts structured product data from a product element.
   * productId is the Sainsbury's SKU from JSON-LD — used only as a cache key
   * for the OFF ingredient analysis response, not as a barcode.
   *
   * @param {Element} el - Element returned by detectProducts()
   * @returns {{ name: string, url: string, productId: string|null }}
   */
  extractProductInfo(el) {
    const name = el.textContent.trim();
    const productId = this._extractSku(el.ownerDocument);
    const url = typeof window !== 'undefined' ? window.location.href : '';
    return { name, url, productId };
  }

  /**
   * Extracts the raw ingredient text from a Sainsbury's product detail page.
   *
   * Iterates all accordion items and finds the one whose label text matches
   * /^ingredients/i. Returns the content element's text, or null if the panel
   * is absent or its text is ≤10 characters (e.g. "Vegan", empty).
   *
   * @param {Document} doc - The document to inspect
   * @returns {string|null} Raw ingredient text, or null if unavailable
   */
  extractIngredients(doc) {
    const panel = this._findIngredientAccordion(doc);
    if (!panel) return null;
    const text = panel.textContent.trim();
    return text.length > 10 ? text : null;
  }

  /**
   * Fetches EAN barcodes for the main product via the service worker.
   *
   * Delegates to background/sainsburys-api.js via browser.runtime.sendMessage
   * (FETCH_SAINSBURYS_BARCODES) per Chrome security guidelines (ADR-015).
   * The service worker calls the GOL API and returns { eans: [...] }.
   * Filters the response to valid EAN-8 and EAN-13 codes only.
   *
   * Returns an empty array on any error so the extension degrades gracefully
   * to ingredient analysis or the local classifier.
   *
   * @param {Document} doc - The document to inspect
   * @returns {Promise<string[]>} Resolved array of valid EAN barcodes
   */
  async extractBarcodes(doc) {
    const sku = this._extractSku(doc);
    if (!sku) return [];
    try {
      const response = await browser.runtime.sendMessage({
        type: 'FETCH_SAINSBURYS_BARCODES',
        sku,
      });
      if (!response?.success || !response.data) return [];
      const eans = response.data.eans;
      if (!Array.isArray(eans) || eans.length === 0) return [];
      return eans.filter(ean => SAINSBURYS_EAN_PATTERN.test(String(ean)));
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts the Sainsbury's internal SKU from the JSON-LD Product node.
   * Sainsbury's JSON-LD uses `sku` (the internal product ID) — `gtin13` is not
   * present. The SKU is used to construct the GOL API barcode lookup URL.
   *
   * @param {Document} doc
   * @returns {string|null}
   */
  _extractSku(doc) {
    try {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const parsed = JSON.parse(script.textContent);

        // Handle @graph array (multiple nodes in one block)
        const nodes = Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [parsed];
        for (const node of nodes) {
          if (node?.['@type'] === 'Product' && node.sku) {
            return String(node.sku);
          }
        }
      }
    } catch {
      // Malformed JSON — fail gracefully
    }
    return null;
  }

  /**
   * Finds the ingredient accordion content element on a Sainsbury's PDP.
   * Iterates all .ds-c-accordion-item elements and returns the
   * .ds-c-accordion-item__content child of the first item whose label text
   * matches /^ingredients/i.
   *
   * Accordion item IDs are dynamic React IDs (:r690:) and cannot be used as
   * selectors — label text matching is the only stable identification strategy.
   *
   * @param {Document} doc
   * @returns {Element|null}
   */
  _findIngredientAccordion(doc) {
    const items = doc.querySelectorAll(SAINSBURYS_SELECTORS.ACCORDION_ITEM);
    for (const item of items) {
      const labelEl = item.querySelector(SAINSBURYS_SELECTORS.ACCORDION_LABEL);
      if (labelEl && /^ingredients/i.test(labelEl.textContent.trim())) {
        return item.querySelector(SAINSBURYS_SELECTORS.ACCORDION_CONTENT);
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Self-register with the adapter registry
// ---------------------------------------------------------------------------

// Dual export: CommonJS for Jest tests; self-register in browser content scripts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SainsburysAdapter };
} else {
  registry.register(new SainsburysAdapter());
}
