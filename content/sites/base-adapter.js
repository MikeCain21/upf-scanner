/**
 * UPF Scanner - BaseAdapter
 *
 * Defines the contract every site adapter must implement and provides
 * shared utilities used across all adapters.
 *
 * Each adapter extends BaseAdapter, overrides the required methods, and
 * self-registers at the bottom of its file:
 *   registry.register(new SiteAdapter());
 *
 * Shared utilities (may be overridden but rarely need to be):
 *   _extractJsonLd(doc)         — extracts gtin13 from JSON-LD @graph
 *   _trySelectors(doc, selectors) — first-match selector fallback
 *
 * @version 1.0.0
 */

'use strict';

class BaseAdapter {
  /**
   * Unique identifier for this adapter.
   * @type {string}
   */
  get SITE_ID() {
    throw new Error(`${this.constructor.name} must define a SITE_ID getter`);
  }

  // ---------------------------------------------------------------------------
  // Required interface — subclasses MUST override these
  // ---------------------------------------------------------------------------

  /**
   * Returns true when this adapter should handle the given URL.
   *
   * @param {string} url - The full page URL (window.location.href)
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  isSupported(url) {
    throw new Error(`${this.constructor.name} must implement isSupported(url)`);
  }

  /**
   * Finds all product elements on the page (main PDP heading + tiles).
   *
   * @param {Document} doc
   * @returns {Element[]}
   */
  // eslint-disable-next-line no-unused-vars
  detectProducts(doc) {
    throw new Error(`${this.constructor.name} must implement detectProducts(doc)`);
  }

  /**
   * Extracts structured product metadata from a product element.
   *
   * @param {Element} el - Element returned by detectProducts()
   * @returns {{ name: string, url: string, productId: string|null }}
   */
  // eslint-disable-next-line no-unused-vars
  extractProductInfo(el) {
    throw new Error(`${this.constructor.name} must implement extractProductInfo(el)`);
  }

  // ---------------------------------------------------------------------------
  // Optional interface — subclasses SHOULD override these where the site
  // provides the data; default implementations return null.
  // ---------------------------------------------------------------------------

  /**
   * Extracts the EAN-13 barcode for the main product on the page.
   * Default implementation tries JSON-LD structured data (works for most
   * major UK supermarkets that follow W3C Product schema).
   *
   * @param {Document} doc
   * @returns {string|null}
   */
  extractBarcode(doc) {
    return this._extractJsonLd(doc);
  }

  /**
   * Returns all known EAN barcodes for the main product.
   * Default wraps extractBarcode() — subclasses override when multiple
   * barcodes are available (e.g. Waitrose barCodes array).
   *
   * @param {Document} doc
   * @returns {string[]}
   */
  extractBarcodes(doc) {
    const barcode = this.extractBarcode(doc);
    return barcode ? [barcode] : [];
  }

  /**
   * Extracts the raw ingredient text from the product detail page.
   * Default returns null — subclasses must override for ingredient lookup.
   *
   * @param {Document} doc
   * @returns {string|null}
   */
  // eslint-disable-next-line no-unused-vars
  extractIngredients(doc) {
    return null;
  }

  /**
   * Returns true when the element is the main PDP product H1.
   * Override in site adapters where the H1 can be identified by stable
   * attributes (e.g. `data-auto`, `id`). The generic fallback is any H1.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  isMainProduct(el) {
    return el.tagName === 'H1';
  }

  // ---------------------------------------------------------------------------
  // Shared utilities — available to all subclasses, rarely need overriding
  // ---------------------------------------------------------------------------

  /**
   * Extracts the GTIN-13 barcode from JSON-LD structured data.
   *
   * Parses all <script type="application/ld+json"> blocks on the page,
   * looks for a Product node in the @graph array, and returns gtin13.
   * This W3C standard is used by Tesco, Waitrose, Ocado, Sainsbury's, and
   * Morrisons, making it suitable as the default extractBarcode implementation.
   *
   * @param {Document} doc
   * @returns {string|null} EAN-13 barcode or null if unavailable
   */
  _extractJsonLd(doc) {
    try {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const parsed = JSON.parse(script.textContent);

        // Handle @graph array (Tesco, Waitrose format)
        const graph = parsed?.['@graph'];
        if (Array.isArray(graph)) {
          const product = graph.find(g => g['@type'] === 'Product');
          if (product?.gtin13) return product.gtin13;
        }

        // Handle root-level Product object (Ocado, some Sainsbury's pages)
        if (parsed?.['@type'] === 'Product' && parsed.gtin13) {
          return parsed.gtin13;
        }
      }
    } catch {
      // Malformed JSON-LD — fail gracefully
    }
    return null;
  }

  /**
   * Tries a list of CSS selectors in priority order and returns the first
   * matching element. Useful for building resilient extraction logic that
   * degrades gracefully when a site updates its DOM structure.
   *
   * @param {Document|Element} doc - The document or element to query within
   * @param {string[]} selectors   - CSS selectors to try, in priority order
   * @returns {Element|null} First matched element, or null if none match
   */
  _trySelectors(doc, selectors) {
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) return el;
    }
    return null;
  }
}

// Dual export: CommonJS for Jest tests; window assignment for browser content scripts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BaseAdapter };
} else {
  window.__novaExt = window.__novaExt || {};
  window.__novaExt.BaseAdapter = BaseAdapter;
}
