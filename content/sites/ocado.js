/**
 * Ocado Site Adapter
 *
 * Detects and extracts product information from ocado.com product detail pages.
 * Ocado uses React Router (SPA) — navigation between products fires pushState,
 * which main.js setupSpaNavigation() already intercepts for automatic re-runs.
 *
 * Barcode strategy: Ocado does NOT expose EAN-13 barcodes anywhere. JSON-LD has
 * only `sku` (internal retailerProductId); the BOP API has no EAN field either.
 * Classification relies entirely on ingredient analysis — barcode lookup is skipped.
 *
 * Ingredient strategy (primary): BOP API at
 *   /api/webproductpagews/v5/products/bop?retailerProductId={id}
 * returns a structured `bopData.fields[]` array. The field with title "ingredients"
 * contains the ingredient text. This API is the most stable source — preferred over
 * DOM scraping because CSS classes are obfuscated hashes (e.g. `_box_1gkco_1`,
 * `sc-gEvEer`) and data-testid attributes are sparse on PDPs.
 *
 * Ingredient strategy (fallback): find <h2>Ingredients</h2> in the DOM, read the
 * textContent of its nextElementSibling. Used only if the BOP API is unavailable.
 *
 * CSS classes are obfuscated — NEVER use class selectors. Only semantic HTML
 * (h1, h2) and the stable BOP API are used.
 *
 * Spike findings (2026-03-18 across bananas, sunflower oil, Frubes):
 *   PDP URL pattern: /products/{slug}/{retailerProductId}
 *   Barcode (gtin13): ❌ not available anywhere on page
 *   Ingredient DOM: ❌ no stable data-testid on ingredient section
 *   BOP API:        ✅ /api/webproductpagews/v5/products/bop?retailerProductId={id}
 *                      → bopData.fields[].title === "ingredients" → .content
 *
 * Extends BaseAdapter — shared utilities (_extractJsonLd, _trySelectors)
 * are inherited. Registers itself with the adapter registry.
 *
 * @version 1.0.0
 */

'use strict';

/* global BaseAdapter, registry */

// ---------------------------------------------------------------------------
// Constants — update these when Ocado redesigns their site
// ---------------------------------------------------------------------------

const OCADO_SITE_ID = 'ocado';
const OCADO_HOSTNAME = 'ocado.com';

/** Field title for ingredients in BOP API response */
const OCADO_INGREDIENTS_FIELD = 'ingredients';

// ---------------------------------------------------------------------------
// OcadoAdapter
// ---------------------------------------------------------------------------

class OcadoAdapter extends BaseAdapter {
  get SITE_ID() { return OCADO_SITE_ID; }

  /**
   * Checks whether this adapter should handle the given URL.
   * Only matches PDPs (not search, category, or other pages).
   *
   * @param {string} url - The full page URL
   * @returns {boolean}
   */
  isSupported(url) {
    return typeof url === 'string' &&
      url.includes(OCADO_HOSTNAME) &&
      url.includes('/products/');
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
   * On Ocado PDPs, the single product is the page itself.
   * Returns the H1 element as the product anchor.
   *
   * @param {Document} doc
   * @returns {Element[]}
   */
  detectProducts(doc) {
    const h1 = doc.querySelector('h1');
    return h1 ? [h1] : [];
  }

  /**
   * Extracts structured product data from a product element.
   * productId is parsed from the last numeric segment of the PDP URL path.
   *
   * @param {Element} el - Element returned by detectProducts()
   * @returns {{ name: string, url: string, productId: string }}
   */
  extractProductInfo(el) {
    const href = typeof window !== 'undefined' ? window.location.href : '';
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const productId = this._getRetailerProductId(pathname);
    return { name: el.textContent.trim(), url: href, productId };
  }

  /**
   * Barcode extraction — always returns null.
   *
   * No EAN-13 barcode is available anywhere on Ocado pages. The `sku` in
   * JSON-LD is an Ocado-internal retailerProductId, not indexed by OpenFoodFacts.
   * Classification falls back to ingredient analysis.
   *
   * @returns {null}
   */
  // eslint-disable-next-line no-unused-vars
  extractBarcode(_doc) {
    return null;
  }

  /**
   * Extracts ingredient text from the Ocado product detail page.
   *
   * Primary: delegates to the service worker via browser.runtime.sendMessage
   * (FETCH_OCADO_INGREDIENTS → background/ocado-api.js) per Chrome security
   * guidelines (ADR-015). Reads bopData.fields[].content where title === "ingredients".
   *
   * Fallback: searches for an <h2> with text "Ingredients" and returns the
   * textContent of its nextElementSibling.
   *
   * Returns null for products with no ingredient list (fresh produce, plain oils).
   *
   * @param {Document} doc
   * @returns {Promise<string|null>}
   */
  async extractIngredients(doc) {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const id = this._getRetailerProductId(pathname);

    // Primary: BOP API via service worker
    if (id) {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'FETCH_OCADO_INGREDIENTS',
          productId: id,
        });
        if (response?.success && response.data) {
          const fields = response.data?.bopData?.fields ?? [];
          const field = fields.find(f => f.title === OCADO_INGREDIENTS_FIELD);
          if (field?.content) return field.content;
        }
      } catch (_) {
        // Fall through to DOM fallback
      }
    }

    // Fallback: find <h2>Ingredients</h2> and read next sibling
    const h2 = [...doc.querySelectorAll('h2')]
      .find(h => /^ingredients$/i.test(h.textContent.trim()));
    return h2?.nextElementSibling?.textContent?.trim() ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts the Ocado retailerProductId from the PDP URL pathname.
   * Ocado PDPs follow the pattern: /products/{slug}/{retailerProductId}
   * where retailerProductId is the last path segment and is numeric.
   *
   * @param {string} pathname - window.location.pathname
   * @returns {string|null} retailerProductId or null if not a PDP
   */
  _getRetailerProductId(pathname) {
    const id = pathname.split('/').pop();
    return /^\d+$/.test(id) ? id : null;
  }
}

// ---------------------------------------------------------------------------
// Self-register with the adapter registry
// ---------------------------------------------------------------------------

// Dual export: CommonJS for Jest tests; self-register in browser content scripts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OcadoAdapter };
} else {
  registry.register(new OcadoAdapter());
}
