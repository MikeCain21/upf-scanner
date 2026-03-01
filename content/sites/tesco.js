/**
 * Tesco Site Adapter
 *
 * Detects and extracts product information from Tesco grocery pages.
 * Handles both product detail pages (PDP) and category/listing pages.
 *
 * Selectors use stable data-* attributes where possible, since Tesco's
 * obfuscated class names (e.g. gyT8MW_*) change between site rebuilds.
 *
 * Registers itself via window.__novaExt so content/main.js can find it.
 *
 * @version 0.3.0
 * @see content/sites/site-adapter.js for the full interface contract
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants — update these when Tesco redesigns their site
  // ---------------------------------------------------------------------------

  const SITE_ID = 'tesco';
  const HOSTNAME = 'tesco.com';

  /**
   * DOM selectors for Tesco pages.
   * Prefer data-* attributes (stable) over class names (obfuscated, volatile).
   */
  const SELECTORS = {
    // Product detail page — main product title (h1 with data-auto attribute)
    MAIN_PRODUCT_TITLE: 'h1[data-auto="pdp-product-title"]',

    // Product tiles — present on both PDPs (related products) and listing pages
    PRODUCT_TILE: '[data-product-id]',

    // Title link inside a product tile (obfuscated class, may need updating)
    // Fallback: first <a> inside the tile
    TILE_TITLE_LINK: 'a.gyT8MW_titleLink',

    // Canonical URL tag — used to extract main product ID from saved pages
    CANONICAL: 'link[rel="canonical"]',

    // Ingredient text on PDP — multiple selectors tried in priority order so that
    // future Tesco layout changes degrade gracefully rather than silently failing.
    // See extractIngredients() for the fallback logic.
    //
    // Two-panel strategy (as of 2026-03-01 Tesco redesign):
    //   Tesco moved ingredient text from #accordion-panel-ingredients-panel to
    //   #accordion-panel-product-description. The old panel now holds Nutrition
    //   and Dietary info only.
    //
    //   For complex products (bread, yoghurt, crisps): PRIMARY finds the full
    //   ingredient list (100s chars) in the ingredients panel and passes.
    //   For simple products (sunflower oil, plain cheddar): PRIMARY returns only
    //   "Vegan" or similar (~5 chars) which fails the >10 char length filter,
    //   so F1 (product-description panel) returns the actual ingredient.
    //   F2/F3 are data-testid variants that survive panel ID prefix renames.
    //   F4 is the old h3+div pattern for saved test pages and Tesco rollbacks.
    INGREDIENT_TEXT:    '#accordion-panel-ingredients-panel .UKSL9q_content > div',
    INGREDIENT_TEXT_F1: '#accordion-panel-product-description .UKSL9q_content > div',
    INGREDIENT_TEXT_F2: '[data-testid="accordion-panel"][id*="ingredients"] .UKSL9q_content > div',
    INGREDIENT_TEXT_F3: '[data-testid="accordion-panel"][id*="product-description"] .UKSL9q_content > div',
    INGREDIENT_TEXT_F4: '#accordion-panel-ingredients-panel h3 + div',
  };

  /** Pattern to extract a numeric product ID from a Tesco product URL */
  const PRODUCT_URL_PATTERN = /\/groceries\/en-GB\/products\/(\d+)/;

  /** Base URL for constructing full product URLs */
  const TESCO_BASE_URL = 'https://www.tesco.com';

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts the product ID for the main PDP product.
   * Tries the <link rel="canonical"> first (works for saved test pages),
   * then falls back to window.location.pathname (works on live Tesco pages).
   *
   * @param {Document} doc - The document containing the page
   * @returns {string|null} Numeric product ID string, or null if not found
   */
  function extractMainProductId(doc) {
    const canonical = doc.querySelector(SELECTORS.CANONICAL);
    if (canonical && canonical.href) {
      const match = canonical.href.match(PRODUCT_URL_PATTERN);
      if (match) return match[1];
    }

    // Live page fallback
    const pathMatch = window.location.pathname.match(PRODUCT_URL_PATTERN);
    return pathMatch ? pathMatch[1] : null;
  }

  /**
   * Extracts product info from the main product H1 element (PDP pages).
   *
   * @param {Element} el - The h1[data-auto="pdp-product-title"] element
   * @returns {{ name: string, url: string, productId: string|null }}
   */
  function extractMainProductInfo(el) {
    const name = el.textContent.trim();
    const productId = extractMainProductId(el.ownerDocument);
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
  function extractTileInfo(el) {
    const productId = el.getAttribute('data-product-id');

    // Prefer the stable title link; fall back to first anchor in the tile
    const titleLink =
      el.querySelector(SELECTORS.TILE_TITLE_LINK) || el.querySelector('a');

    const name = titleLink ? titleLink.textContent.trim() : 'Unknown';

    // Use the link's href if available; otherwise construct from productId
    let url = titleLink?.href || '';
    if (!url && productId) {
      url = `${TESCO_BASE_URL}/groceries/en-GB/products/${productId}`;
    }

    return { name, url, productId };
  }

  // ---------------------------------------------------------------------------
  // Adapter implementation
  // ---------------------------------------------------------------------------

  const tescoAdapter = {
    SITE_ID,
    HOSTNAME,

    /**
     * Checks whether this adapter should handle the current page.
     * @returns {boolean}
     */
    isSupported() {
      return window.location.hostname.includes(HOSTNAME);
    },

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
      const mainTitle = doc.querySelector(SELECTORS.MAIN_PRODUCT_TITLE);
      if (mainTitle) {
        products.push(mainTitle);
      }

      // Product tiles — related products on PDP, all products on listing pages
      const tiles = doc.querySelectorAll(SELECTORS.PRODUCT_TILE);
      tiles.forEach((tile) => products.push(tile));

      return products;
    },

    /**
     * Extracts structured product data from a product element.
     *
     * @param {Element} el - Element returned by detectProducts()
     * @returns {{ name: string, url: string, productId: string|null }}
     */
    extractProductInfo(el) {
      // Main product: identified by the data-auto attribute on the H1
      if (
        el.tagName === 'H1' &&
        el.getAttribute('data-auto') === 'pdp-product-title'
      ) {
        return extractMainProductInfo(el);
      }

      // Product tile: identified by data-product-id attribute
      return extractTileInfo(el);
    },

    /**
     * Extracts the raw ingredient text from a Tesco product detail page.
     * Tries five selectors in priority order so that future Tesco layout
     * changes degrade gracefully rather than silently returning null.
     *
     * Strategy: PRIMARY targets the ingredients panel (complex products).
     * Simple products (sunflower oil, eggs) return short text there (~5 chars)
     * which fails the >10 char length filter, so F1 (product-description panel)
     * catches them instead. F2/F3 are data-testid fallbacks for prefix renames.
     * F4 is the pre-2026 h3+div pattern for saved test pages and rollbacks.
     *
     * Returns null when no ingredient section is found (e.g. listing pages,
     * products without ingredient information).
     *
     * @param {Document} doc - The document to inspect
     * @returns {string|null} Raw ingredient text, or null if unavailable
     */
    extractIngredients(doc) {
      const candidates = [
        doc.querySelector(SELECTORS.INGREDIENT_TEXT),    // primary: ingredients panel
        doc.querySelector(SELECTORS.INGREDIENT_TEXT_F1), // fallback 1: product-description
        doc.querySelector(SELECTORS.INGREDIENT_TEXT_F2), // fallback 2: data-testid ingredients
        doc.querySelector(SELECTORS.INGREDIENT_TEXT_F3), // fallback 3: data-testid product-desc
        doc.querySelector(SELECTORS.INGREDIENT_TEXT_F4), // fallback 4: old h3+div (saved pages)
      ];
      // Temporary diagnostic logging — remove after confirming selectors work
      candidates.forEach((c, i) => {
        const text = c?.textContent?.trim() ?? '';
        console.log(`[NOVA] selector[${i}]: found=${!!c} len=${text.length} preview="${text.slice(0, 60)}"`);
      });
      // Accept the first element that has meaningful text (>10 chars avoids
      // accidentally matching an empty div or the heading element itself)
      const el = candidates.find(
        (candidate) => candidate && candidate.textContent.trim().length > 10
      );
      if (!el) return null;
      // textContent automatically strips <strong> allergen markers — no extra
      // processing needed. Trim to remove leading/trailing whitespace.
      const raw = el.textContent.trim();
      return raw.length > 0 ? raw : null;
    },
  };

  // ---------------------------------------------------------------------------
  // Register adapter in the extension namespace
  // ---------------------------------------------------------------------------

  // __novaExt is a shared namespace used by all extension content scripts.
  // Using a single global keeps namespace pollution minimal.
  window.__novaExt = window.__novaExt || {};
  window.__novaExt.adapters = window.__novaExt.adapters || [];
  window.__novaExt.adapters.push(tescoAdapter);
})();
