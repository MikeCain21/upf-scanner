/**
 * ASDA Site Adapter
 *
 * Detects and extracts product information from ASDA grocery pages.
 * ASDA embeds full product data in an inline <script id="mobify-data"> tag
 * containing a plain JSON object with a __PRELOADED_STATE__ key. This includes
 * both the barcode (c_EAN_GTIN) and structured ingredient data
 * (c_BRANDBANK_JSON.ingredients). Content scripts run in an isolated world and
 * cannot access window variables, but CAN read DOM script elements directly.
 *
 * Selectors used:
 *   script#mobify-data  — stable id attribute confirmed across all four test pages
 *   h1[data-testid="txt-pdp-product-name"] — stable data-testid attribute
 *
 * Spike findings (2026-03-18 across 4 ASDA product pages):
 *   PDP URL pattern: /groceries/product/{category}/{slug}/{productId}
 *   JSON-LD gtin13: ❌ not present — JSON-LD Product has no gtin13 field
 *   Ingredient DOM: ✅ available via <p>Ingredients</p>.nextElementSibling when expanded; used as last-resort fallback
 *   Script selector: script#mobify-data (stable id attribute)
 *   Script format: plain JSON object — direct JSON.parse(script.textContent)
 *   Barcode path: .__PRELOADED_STATE__.pageProps.pageData.initialProduct.c_EAN_GTIN
 *   Ingredient path: ...initialProduct.c_BRANDBANK_JSON → second JSON.parse() → .ingredients (string[])
 *
 * Extends BaseAdapter — shared utilities (_extractJsonLd, _trySelectors)
 * are inherited. Registers itself with the adapter registry.
 *
 * @version 1.0.0
 */

'use strict';

/* global BaseAdapter, registry */

// ---------------------------------------------------------------------------
// Constants — update these when ASDA redesigns their site
// ---------------------------------------------------------------------------

const ASDA_SITE_ID = 'asda';
const ASDA_HOSTNAME = 'asda.com';

/**
 * DOM selectors for ASDA pages.
 * Uses stable id / data-testid attributes only — no fragile class names.
 */
const ASDA_SELECTORS = {
  // Product detail page — main product title (stable data-testid)
  MAIN_PRODUCT_TITLE: 'h1[data-testid="txt-pdp-product-name"]',

  // Inline preloaded state script — contains barcode + ingredient data
  PRELOADED_STATE_SCRIPT: 'script#mobify-data',
};

// ---------------------------------------------------------------------------
// AsdaAdapter
// ---------------------------------------------------------------------------

class AsdaAdapter extends BaseAdapter {
  get SITE_ID() { return ASDA_SITE_ID; }

  /**
   * Checks whether this adapter should handle the given URL.
   *
   * @param {string} url - The full page URL
   * @returns {boolean}
   */
  isSupported(url) {
    try {
      const { hostname, pathname } = new URL(url);
      return (hostname === ASDA_HOSTNAME || hostname.endsWith('.' + ASDA_HOSTNAME)) &&
        pathname.includes('/product/');
    } catch {
      return false;
    }
  }

  /**
   * Returns true when the element is the ASDA main PDP product H1.
   * Uses the stable data-testid="txt-pdp-product-name" attribute.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  isMainProduct(el) {
    return el.tagName === 'H1' &&
      el.getAttribute('data-testid') === 'txt-pdp-product-name';
  }

  /**
   * Detects all product elements on the page.
   * ASDA v1 supports PDPs only — tile-level classification is skipped
   * because tile elements do not expose barcode data.
   *
   * @param {Document} doc - The document to inspect
   * @returns {Element[]} Array of product elements (at most one on a PDP)
   */
  detectProducts(doc) {
    const products = [];
    const mainTitle = doc.querySelector(ASDA_SELECTORS.MAIN_PRODUCT_TITLE);
    if (mainTitle) products.push(mainTitle);
    return products;
  }

  /**
   * Extracts structured product data from a product element.
   * productId is derived from the initialProduct object in preloaded state —
   * used only as a cache key, not as a barcode.
   *
   * @param {Element} el - Element returned by detectProducts()
   * @returns {{ name: string, url: string, productId: string|null }}
   */
  extractProductInfo(el) {
    const name = el.textContent.trim();
    const productId = this._getInitialProduct(el.ownerDocument)?.id ?? null;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    return { name, url, productId };
  }

  /**
   * Extracts the EAN barcode for the main product on the page.
   *
   * Legacy sync method retained for backward compatibility. Prefer
   * extractBarcodes() which calls the ASDA API and is always fresh on SPA nav.
   *
   * @param {Document} doc
   * @returns {string|null}
   */
  extractBarcode(doc) {
    const product = this._getInitialProduct(doc);
    const ean = product?.c_EAN_GTIN;
    if (ean && typeof ean === 'string' && ean.trim().length > 0) return ean.trim();
    return null;
  }

  /**
   * Async barcode extraction — preferred over extractBarcode().
   *
   * Calls the ASDA product API (using the SLAS guest token from cookies) to
   * fetch fresh product data keyed by the URL product ID. This avoids the
   * stale-script bug where script#mobify-data retains the first page's product
   * after SPA navigation. Falls back to the static script tag when the API
   * is unavailable or the token is missing.
   *
   * Returns up to two barcodes: the raw 12-digit UPC and the computed EAN-13.
   * GS1 '2'-prefix filtering is handled upstream by content/main.js.
   *
   * @param {Document} doc
   * @returns {Promise<string[]>}
   */
  async extractBarcodes(doc) {
    const productId = typeof window !== 'undefined'
      ? window.location.pathname.split('/').pop()
      : null;

    if (productId) {
      const fresh = await this._fetchProductData(productId);
      if (fresh?.upc) {
        const ean13 = this._computeEan13(fresh.upc);
        return [fresh.upc, ean13].filter(Boolean);
      }
    }

    // Fallback: script#mobify-data (initial load, or API unavailable)
    const ean = this._getInitialProduct(doc)?.c_EAN_GTIN?.trim();
    return ean ? [ean] : [];
  }

  /**
   * Extracts the raw ingredient text from an ASDA product detail page.
   *
   * Priority order:
   *   1. API cache (c_BRANDBANK_JSON from _fetchProductData) — always fresh on SPA nav
   *   2. script#mobify-data c_BRANDBANK_JSON — correct on initial page load
   *   3. DOM text: <p>Ingredients</p>.nextElementSibling — last resort
   *
   * @param {Document} doc
   * @returns {string|null} Raw ingredient text, or null if unavailable
   */
  extractIngredients(doc) {
    // Prefer API data (populated by extractBarcodes; always fresh on SPA nav)
    const apiJson = this._productDataCache?.data?.c_BRANDBANK_JSON;
    const scriptJson = this._getInitialProduct(doc)?.c_BRANDBANK_JSON;
    const brandbankJson = apiJson || scriptJson;

    if (brandbankJson) {
      try {
        const brandbank = JSON.parse(brandbankJson);
        const ingredients = brandbank?.ingredients;
        if (Array.isArray(ingredients) && ingredients.length > 0) {
          return ingredients.join(', ');
        }
      } catch {
        // Malformed c_BRANDBANK_JSON — fall through to DOM
      }
    }

    // Last resort: extract from rendered DOM
    return this._extractIngredientsFromDom(doc);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Parses the inline mobify-data script tag and returns the __PRELOADED_STATE__
   * object. Includes a fallback that searches all inline scripts in case the
   * id attribute changes in a future ASDA redesign.
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  _getPreloadedState(doc) {
    try {
      const script = doc.querySelector(ASDA_SELECTORS.PRELOADED_STATE_SCRIPT);
      if (script) return JSON.parse(script.textContent).__PRELOADED_STATE__;
      // Fallback: search all inline scripts (resilient to id change)
      const scripts = doc.querySelectorAll('script:not([src])');
      for (const s of scripts) {
        if (!s.textContent.includes('__PRELOADED_STATE__')) continue;
        const parsed = JSON.parse(s.textContent);
        if (parsed?.__PRELOADED_STATE__) return parsed.__PRELOADED_STATE__;
      }
    } catch {
      // Malformed JSON — fail gracefully
    }
    return null;
  }

  /**
   * Returns the initialProduct object from the preloaded state.
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  _getInitialProduct(doc) {
    return this._getPreloadedState(doc)?.pageProps?.pageData?.initialProduct ?? null;
  }

  /**
   * Computes an EAN-13 barcode from a 12-digit UPC by appending the GS1
   * check digit. ASDA's API returns the 12-digit body in the `upc` field.
   *
   * @param {string} upc12 - 12-digit numeric string
   * @returns {string|null} 13-digit EAN, or null if input is invalid
   */
  _computeEan13(upc12) {
    if (!upc12 || upc12.length !== 12 || !/^\d+$/.test(upc12)) return null;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(upc12[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    return upc12 + ((10 - (sum % 10)) % 10);
  }

  /**
   * Fetches fresh product data from the ASDA same-origin product API using the
   * SLAS guest auth token stored in cookies. Caches the result per product ID
   * so that extractIngredients() can reuse it without a second request.
   *
   * Returns null when the token is missing or the API call fails — callers
   * fall back to the static script tag in that case.
   *
   * @param {string} productId - URL-segment product ID (last path component)
   * @returns {Promise<object|null>}
   */
  async _fetchProductData(productId) {
    if (this._productDataCache?.id === productId) return this._productDataCache.data;

    // Extract token from same-origin cookie — must happen here, not in service worker.
    // The actual API call is delegated to the service worker per Chrome security
    // guidelines (ADR-014).
    const tokenEntry = document.cookie.split(';')
      .find(c => c.trim().startsWith('SLAS.AUTH_TOKEN='));
    if (!tokenEntry) return null;
    const token = decodeURIComponent(tokenEntry.trim().slice('SLAS.AUTH_TOKEN='.length));

    try {
      const response = await browser.runtime.sendMessage({
        type: 'FETCH_ASDA_PRODUCT',
        productId,
        token,
      });
      if (!response?.success) return null;
      this._productDataCache = { id: productId, data: response.data };
      return response.data;
    } catch {
      return null;
    }
  }

  /**
   * Extracts ingredient text from the rendered DOM as a last-resort fallback.
   * Finds a <p> with the exact text "Ingredients" and reads the text content
   * of the immediately following sibling element (visible when accordion expanded).
   *
   * @param {Document} doc
   * @returns {string|null}
   */
  _extractIngredientsFromDom(doc) {
    const label = [...doc.querySelectorAll('p')].find(
      p => p.textContent.trim() === 'Ingredients'
    );
    return label?.nextElementSibling?.textContent?.trim() || null;
  }
}

// ---------------------------------------------------------------------------
// Self-register with the adapter registry
// ---------------------------------------------------------------------------

// Dual export: CommonJS for Jest tests; self-register in browser content scripts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AsdaAdapter };
} else {
  registry.register(new AsdaAdapter());
}
