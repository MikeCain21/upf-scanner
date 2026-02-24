/**
 * NOVA Extension - Main Content Script
 *
 * Orchestrates product detection and classification on supported supermarket pages.
 * Loads after site-specific adapters (e.g. content/sites/tesco.js) and shared
 * libraries (e.g. lib/ingredient-parser.js), which register themselves via
 * window.__novaExt.
 *
 * Phase 3: Detect products, extract ingredients from PDP, parse ingredient list.
 * Future phases will add NOVA classification and badge display.
 *
 * @version 0.3.0
 * @phase 3 - Ingredient extraction and parsing
 */

(function () {
  'use strict';

  // Configuration
  const CONFIG = {
    DEBUG: true,
    VERSION: '0.3.0',
    PHASE: 3,
  };

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  /**
   * Logs a message to the console with the extension prefix.
   * Only outputs when DEBUG is enabled.
   *
   * @param {string} message - Message to log
   * @param {*} [data] - Optional data to log alongside the message
   */
  function log(message, data) {
    if (!CONFIG.DEBUG) return;
    if (data !== undefined) {
      console.log(`[NOVA Extension] ${message}`, data);
    } else {
      console.log(`[NOVA Extension] ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Adapter resolution
  // ---------------------------------------------------------------------------

  /**
   * Finds the first registered adapter that supports the current page.
   * Adapters register themselves in window.__novaExt.adapters at load time.
   *
   * @returns {object|null} A site adapter, or null if none matches
   */
  function findAdapter() {
    const adapters = window.__novaExt?.adapters || [];
    return adapters.find((adapter) => adapter.isSupported()) || null;
  }

  // ---------------------------------------------------------------------------
  // Product detection and ingredient extraction
  // ---------------------------------------------------------------------------

  /**
   * Returns true if the element is the main PDP product (H1 with data-auto).
   * Used to restrict ingredient extraction to the primary product only —
   * related product tiles link to separate PDPs, so ingredients aren't
   * available for them on this page.
   *
   * @param {Element} el - Product element returned by detectProducts()
   * @returns {boolean}
   */
  function isMainProduct(el) {
    return (
      el.tagName === 'H1' &&
      el.getAttribute('data-auto') === 'pdp-product-title'
    );
  }

  /**
   * Detects all products on the current page using the given adapter,
   * logs each product, and extracts ingredients for the main PDP product.
   *
   * @param {object} adapter - A site adapter (implements site-adapter interface)
   */
  function detectAndExtract(adapter) {
    const products = adapter.detectProducts(document);

    log(`Detected ${products.length} products on this page`);

    products.forEach((el, index) => {
      const info = adapter.extractProductInfo(el);
      log(`Product ${index + 1}:`, {
        name: info.name,
        productId: info.productId,
        url: info.url,
      });

      // Extract and parse ingredients for the main product only.
      // Tile products link to their own PDPs — no ingredient data here.
      if (isMainProduct(el)) {
        extractAndLogIngredients(adapter);
      }
    });

    if (products.length === 0) {
      log('No products detected — check selectors or page structure');
    }
  }

  /**
   * Extracts the raw ingredient text from the page using the adapter,
   * parses it into a token array via the ingredient-parser library,
   * and logs the result.
   *
   * @param {object} adapter - Site adapter with extractIngredients(doc) method
   */
  function extractAndLogIngredients(adapter) {
    // extractIngredients is a Phase 3 addition — check defensively in case
    // an older adapter is somehow loaded.
    if (typeof adapter.extractIngredients !== 'function') {
      log('Adapter does not support ingredient extraction');
      return;
    }

    const rawText = adapter.extractIngredients(document);

    if (!rawText) {
      log('No ingredient section found on this page');
      return;
    }

    log('Raw ingredient text:', rawText);

    const parseIngredients = window.__novaExt?.parseIngredients;
    if (typeof parseIngredients !== 'function') {
      log('ingredient-parser not loaded — cannot parse ingredients');
      return;
    }

    const ingredients = parseIngredients(rawText);

    if (!ingredients) {
      log('Ingredients parsed — no tokens found (empty ingredient list)');
      return;
    }

    log(`Ingredients (${ingredients.length}):`, ingredients);
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  /**
   * Initialises the extension: finds the right adapter and runs detection.
   */
  function init() {
    log(`Extension loaded — Version ${CONFIG.VERSION}, Phase ${CONFIG.PHASE}`);
    log(`Current URL: ${window.location.href}`);

    const adapter = findAdapter();
    if (!adapter) {
      log('No supported adapter for this page — extension will not run');
      return;
    }

    log(`Using adapter: ${adapter.SITE_ID}`);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () =>
        detectAndExtract(adapter)
      );
    } else {
      detectAndExtract(adapter);
    }
  }

  // Start the extension
  init();
})();
