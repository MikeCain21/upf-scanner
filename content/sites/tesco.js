/**
 * Tesco Site Adapter
 *
 * Detects and extracts product information from Tesco grocery pages.
 * Handles both product detail pages (PDP) and category/listing pages.
 *
 * Selectors use stable data-* attributes where possible, since Tesco's
 * obfuscated class names (e.g. gyT8MW_*) change between site rebuilds.
 *
 * Extends BaseAdapter — shared utilities (_extractJsonLd, _trySelectors)
 * are inherited. Registers itself with the adapter registry.
 *
 * @version 1.0.0
 */

'use strict';

/* global BaseAdapter, registry */

// ---------------------------------------------------------------------------
// Constants — update these when Tesco redesigns their site
// ---------------------------------------------------------------------------

const TESCO_SITE_ID = 'tesco';
const TESCO_HOSTNAME = 'tesco.com';

/**
 * DOM selectors for Tesco pages.
 * Prefer data-* attributes (stable) over class names (obfuscated, volatile).
 */
const TESCO_SELECTORS = {
  // Product detail page — main product title (h1 with data-auto attribute)
  MAIN_PRODUCT_TITLE: 'h1[data-auto="pdp-product-title"]',

  // Product tiles — present on both PDPs (related products) and listing pages
  PRODUCT_TILE: '[data-product-id]',

  // Title link inside a product tile (obfuscated class, may need updating)
  // Fallback: first <a> inside the tile
  TILE_TITLE_LINK: 'a.gyT8MW_titleLink',

  // Canonical URL tag — used to extract main product ID from saved pages
  CANONICAL: 'link[rel="canonical"]',

  // Ingredient text on PDP — stable ID + structural selectors only.
  // CSS module class names (e.g. UKSL9q_content, OobGYfu9hvCUvH6) are explicitly
  // avoided — they are generated hashes that change with every Tesco build.
  //
  // Strategy: find the div immediately following the "Ingredients" h3 heading
  // inside the semantic accordion panel IDs. These IDs are content-driven
  // names (not generated hashes) and have been stable across Tesco redesigns.
  //
  //   Primary:   dedicated ingredients panel — present on complex products
  //   Fallback1: product-description panel — some products embed ingredients here
  //   Fallback2: any panel whose ID contains "ingredient" — survives panel renames
  INGREDIENT_SELECTORS: [
    '#accordion-panel-ingredients-panel h3 + div',
    '#accordion-panel-product-description h3 + div',
    '[id*="accordion-panel"][id*="ingredient"] h3 + div',
  ],
};

/** Pattern to extract a numeric product ID from a Tesco product URL */
const TESCO_PRODUCT_URL_PATTERN = /\/groceries\/en-GB\/products\/(\d+)/;

/** Base URL for constructing full product URLs */
const TESCO_BASE_URL = 'https://www.tesco.com';

// ---------------------------------------------------------------------------
// TescoAdapter
// ---------------------------------------------------------------------------

class TescoAdapter extends BaseAdapter {
  get SITE_ID() { return TESCO_SITE_ID; }

  /**
   * Checks whether this adapter should handle the given URL.
   *
   * @param {string} url - The full page URL
   * @returns {boolean}
   */
  isSupported(url) {
    return url.includes(TESCO_HOSTNAME);
  }

  /**
   * Returns true when the element is the main Tesco PDP product H1.
   * Uses the stable data-auto attribute set by Tesco's React renderer.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  isMainProduct(el) {
    return el.tagName === 'H1' && el.getAttribute('data-auto') === 'pdp-product-title';
  }

  /**
   * Detects all product elements on the page.
   *
   * On product detail pages, returns [mainProductH1, ...relatedTiles].
   * On listing/category pages, returns all product tiles.
   *
   * @param {Document} doc - The document to inspect
   * @returns {Element[]} Array of product elements
   */
  detectProducts(doc) {
    const products = [];

    // Main product (PDP only) — the H1 with the product title
    const mainTitle = doc.querySelector(TESCO_SELECTORS.MAIN_PRODUCT_TITLE);
    if (mainTitle) products.push(mainTitle);

    // Product tiles — related products on PDP, all products on listing pages
    doc.querySelectorAll(TESCO_SELECTORS.PRODUCT_TILE).forEach(tile => products.push(tile));

    return products;
  }

  /**
   * Extracts structured product data from a product element.
   *
   * @param {Element} el - Element returned by detectProducts()
   * @returns {{ name: string, url: string, productId: string|null }}
   */
  extractProductInfo(el) {
    if (el.tagName === 'H1' && el.getAttribute('data-auto') === 'pdp-product-title') {
      return this._extractMainProductInfo(el);
    }
    return this._extractTileInfo(el);
  }

  /**
   * Extracts the raw ingredient text from a Tesco product detail page.
   *
   * Primary strategy: find the H3 with text "Ingredients" inside the
   * ingredients accordion panel, then take its nextElementSibling. This is
   * stable — it relies on the panel ID and semantic heading text, not on
   * build-generated class names that change with Tesco deployments.
   *
   * Works for both single-component products (bread, yoghurt) and
   * multi-component products (ready meals) where the ingredients panel
   * is populated after the user expands it / page loads.
   *
   * Fallback: obfuscated CSS selectors kept for older saved test pages
   * and any layout variants where the H3 strategy doesn't match.
   *
   * @param {Document} doc - The document to inspect
   * @returns {string|null} Raw ingredient text, or null if unavailable
   */
  extractIngredients(doc) {
    // Primary: find <h3>Ingredients</h3> inside the ingredients accordion
    // panel and take its next sibling element. No class names involved.
    const panel = doc.querySelector('#accordion-panel-ingredients-panel');
    if (panel) {
      const headings = panel.querySelectorAll('h3');
      for (const h3 of headings) {
        if (/^ingredients$/i.test(h3.textContent.trim())) {
          const sibling = h3.nextElementSibling;
          if (sibling && sibling.textContent.trim().length > 10) {
            return sibling.textContent.trim();
          }
        }
      }
    }

    // Fallback: CSS selectors for older layouts and saved test pages
    for (const selector of TESCO_SELECTORS.INGREDIENT_SELECTORS) {
      const el = doc.querySelector(selector);
      if (el && el.textContent.trim().length > 10) {
        return el.textContent.trim();
      }
    }
    return null;
  }

  // extractBarcode is inherited from BaseAdapter and delegates to
  // _extractJsonLd, which handles both @graph and root-level Product formats.

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts the product ID for the main PDP product.
   * Tries the <link rel="canonical"> first (works for saved test pages),
   * then falls back to window.location.pathname (works on live Tesco pages).
   *
   * @param {Document} doc
   * @returns {string|null}
   */
  _extractMainProductId(doc) {
    const canonical = doc.querySelector(TESCO_SELECTORS.CANONICAL);
    if (canonical && canonical.href) {
      const match = canonical.href.match(TESCO_PRODUCT_URL_PATTERN);
      if (match) return match[1];
    }
    const pathMatch = window.location.pathname.match(TESCO_PRODUCT_URL_PATTERN);
    return pathMatch ? pathMatch[1] : null;
  }

  /**
   * Extracts product info from the main product H1 element (PDP pages).
   *
   * @param {Element} el - The h1[data-auto="pdp-product-title"] element
   * @returns {{ name: string, url: string, productId: string|null }}
   */
  _extractMainProductInfo(el) {
    const name = el.textContent.trim();
    const productId = this._extractMainProductId(el.ownerDocument);
    const url = productId
      ? `${TESCO_BASE_URL}/groceries/en-GB/products/${productId}`
      : window.location.href;
    return { name, url, productId };
  }

  /**
   * Extracts product info from a product tile element ([data-product-id]).
   *
   * @param {Element} el - Element with a data-product-id attribute
   * @returns {{ name: string, url: string, productId: string|null }}
   */
  _extractTileInfo(el) {
    const productId = el.getAttribute('data-product-id');
    const titleLink =
      el.querySelector(TESCO_SELECTORS.TILE_TITLE_LINK) || el.querySelector('a');
    const name = titleLink ? titleLink.textContent.trim() : 'Unknown';
    let url = titleLink?.href || '';
    if (!url && productId) {
      url = `${TESCO_BASE_URL}/groceries/en-GB/products/${productId}`;
    }
    return { name, url, productId };
  }
}

// ---------------------------------------------------------------------------
// Self-register with the adapter registry
// ---------------------------------------------------------------------------

registry.register(new TescoAdapter());
