/**
 * NOVA Extension - Main Content Script
 *
 * Orchestrates product detection, ingredient extraction, classification,
 * and badge display on supported supermarket pages.
 *
 * Load order (manifest.json):
 *   content/sites/tesco.js        → window.__novaExt.adapters
 *   lib/ingredient-parser.js      → window.__novaExt.parseIngredients
 *   lib/nova-indicators.js        → window.__novaExt.detectIndicators
 *   lib/nova-classifier.js        → window.__novaExt.classifyByIngredients
 *   content/ui/badge.js           → window.__novaExt.createBadge / setBadgeLoading / setBadgeError / injectBadge
 *   content/main.js               (this file)
 *
 * Phase 7: Inject NOVA badges on product pages.
 *   - Main PDP product: classify by ingredients → inject scored badge
 *   - Product tiles: inject loading badge (Phase 8 resolves via API)
 *
 * @version 0.7.0
 * @phase 7 - Badge display
 */

(function () {
  'use strict';

  const CONFIG = {
    DEBUG: true,
    VERSION: '0.7.0',
    PHASE: 7,
  };

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  /**
   * Logs a message to the console when DEBUG is enabled.
   * @param {string} message
   * @param {*} [data]
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
   * @returns {object|null}
   */
  function findAdapter() {
    const adapters = window.__novaExt?.adapters || [];
    return adapters.find((adapter) => adapter.isSupported()) || null;
  }

  // ---------------------------------------------------------------------------
  // Product type helper
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the element is the main PDP product H1.
   * @param {Element} el
   * @returns {boolean}
   */
  function isMainProduct(el) {
    return (
      el.tagName === 'H1' &&
      el.getAttribute('data-auto') === 'pdp-product-title'
    );
  }

  // ---------------------------------------------------------------------------
  // Classification + badge helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts, parses, and classifies the main product's ingredients.
   * Returns a scored badge element, or an error badge if any step fails.
   *
   * @param {object} adapter
   * @returns {HTMLElement} Badge element
   */
  function classifyMainProduct(adapter) {
    const { createBadge, setBadgeError } = window.__novaExt;

    // 1. Extract raw ingredient text
    if (typeof adapter.extractIngredients !== 'function') {
      log('Adapter does not support ingredient extraction');
      const badge = document.createElement('span');
      setBadgeError(badge, 'Ingredient extraction not supported for this site.');
      return badge;
    }

    const rawText = adapter.extractIngredients(document);
    if (!rawText) {
      log('No ingredient section found — cannot classify');
      const badge = document.createElement('span');
      setBadgeError(badge, 'No ingredient list found for this product.');
      return badge;
    }

    // 2. Parse ingredients into tokens
    const parseIngredients = window.__novaExt?.parseIngredients;
    if (typeof parseIngredients !== 'function') {
      log('ingredient-parser not available');
      const badge = document.createElement('span');
      setBadgeError(badge, 'Ingredient parser unavailable.');
      return badge;
    }

    const ingredients = parseIngredients(rawText);
    if (!ingredients || ingredients.length === 0) {
      log('Ingredient list is empty after parsing');
      const badge = document.createElement('span');
      setBadgeError(badge, 'Ingredient list is empty.');
      return badge;
    }

    // 3. Classify
    const classifyByIngredients = window.__novaExt?.classifyByIngredients;
    if (typeof classifyByIngredients !== 'function') {
      log('nova-classifier not available');
      const badge = document.createElement('span');
      setBadgeError(badge, 'NOVA classifier unavailable.');
      return badge;
    }

    const result = classifyByIngredients(ingredients);
    if (!result) {
      log('Classifier returned null');
      const badge = document.createElement('span');
      setBadgeError(badge, 'Classification failed.');
      return badge;
    }

    log(`NOVA ${result.score} (confidence: ${result.confidence}) — ${result.reason}`);
    if (result.indicators && result.indicators.length > 0) {
      log('Indicators:', result.indicators);
    }

    return createBadge(result.score, result.reason, result.indicators || []);
  }

  // ---------------------------------------------------------------------------
  // Main detection + badge loop
  // ---------------------------------------------------------------------------

  /**
   * Detects all products, classifies the main PDP product, and injects badges.
   * Tile products get a loading badge (resolved in Phase 8 via API lookup).
   *
   * @param {object} adapter
   */
  function detectAndBadge(adapter) {
    const { setBadgeLoading, injectBadge } = window.__novaExt;

    const products = adapter.detectProducts(document);
    log(`Detected ${products.length} products on this page`);

    if (products.length === 0) {
      log('No products detected — check selectors or page structure');
      return;
    }

    products.forEach((el, index) => {
      const info = adapter.extractProductInfo(el);
      log(`Product ${index + 1}: ${info.name} (id: ${info.productId})`);

      let badge;

      if (isMainProduct(el)) {
        // Classify by ingredients immediately — we have the ingredient section
        badge = classifyMainProduct(adapter);
      } else {
        // Tile product — no ingredient data on this page.
        // Inject loading badge; Phase 8 will resolve via API.
        badge = document.createElement('span');
        setBadgeLoading(badge);
        log(`  → Tile product, loading badge injected (Phase 8 resolves)`);
      }

      injectBadge(el, badge);
    });
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  /**
   * Initialises the extension.
   */
  function init() {
    log(`Extension loaded — Version ${CONFIG.VERSION}, Phase ${CONFIG.PHASE}`);

    const adapter = findAdapter();
    if (!adapter) {
      log('No supported adapter for this page — extension will not run');
      return;
    }

    log(`Using adapter: ${adapter.SITE_ID}`);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => detectAndBadge(adapter));
    } else {
      detectAndBadge(adapter);
    }
  }

  init();
})();
