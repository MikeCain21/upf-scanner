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
 * Phase 8: SPA navigation support + API wiring.
 *   - Wraps history.pushState/replaceState to detect SPA URL changes
 *   - MutationObserver catches products rendered after DOM settles
 *   - WeakSet prevents duplicate badges across re-runs
 *   - Tile products are skipped (Tesco IDs ≠ EAN barcodes; resolved in Phase 9)
 *
 * @version 0.9.0
 * @phase 10 - Production polish, stats tracking, debug-from-storage
 */

(function () {
  'use strict';

  const CONFIG = {
    DEBUG: false, // Default off; loaded from storage in init()
    VERSION: '0.9.0',
    PHASE: 10,
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
  // Debounce utility (IIFE-scoped, no shared state)
  // ---------------------------------------------------------------------------

  /**
   * Returns a debounced version of fn that delays invocation by `delay` ms.
   * @param {Function} fn
   * @param {number} delay - milliseconds
   * @returns {Function}
   */
  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ---------------------------------------------------------------------------
  // Already-badged element tracking
  // ---------------------------------------------------------------------------

  // WeakSet so badged DOM elements can be GC'd when removed from the page.
  const _badged = new WeakSet();

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
   * Tries OpenFoodFacts ingredient analysis first, falls back to local classifier.
   * Returns a Promise that resolves to a scored badge element (or error badge).
   *
   * @param {object} adapter
   * @param {string|null} productId - Tesco product ID used as cache key
   * @returns {Promise<HTMLElement>} Badge element
   */
  async function classifyMainProduct(adapter, productId) {
    const { createBadge, setBadgeError } = window.__novaExt;

    // 1. Barcode lookup (primary) — reads gtin13 from JSON-LD, queries OFF
    if (typeof adapter.extractBarcode === 'function') {
      const barcode = adapter.extractBarcode(document);
      if (barcode) {
        log(`Barcode found: ${barcode}`);
        try {
          const response = await browser.runtime.sendMessage({
            type: 'FETCH_PRODUCT',
            barcode,
          });
          if (response?.success && response.novaScore) {
            log(`NOVA ${response.novaScore} from barcode lookup (${response.source})`);
            return createBadge(response.novaScore, `OpenFoodFacts (barcode ${barcode})`, []);
          }
          log(`Barcode lookup returned no NOVA score (${response?.source}) — trying ingredients`);
        } catch (err) {
          log('Barcode lookup failed — trying ingredients', err.message);
        }
      } else {
        log('No barcode found in page — trying ingredients');
      }
    }

    // 2. Ingredient text → OFF ingredient analysis (secondary)
    if (typeof adapter.extractIngredients === 'function') {
      const rawText = adapter.extractIngredients(document);
      if (rawText) {
        log('Ingredient text found — sending to OFF analysis');
        try {
          const response = await browser.runtime.sendMessage({
            type: 'ANALYZE_INGREDIENTS',
            ingredientsText: rawText,
            productId,
          });
          if (response?.success && response.novaScore) {
            log(`NOVA ${response.novaScore} from OFF ingredient analysis`);
            return createBadge(response.novaScore, 'OpenFoodFacts ingredient analysis', response.markers || []);
          }
          log('OFF ingredient analysis returned no score — trying local classifier');
        } catch (err) {
          log('OFF ingredient analysis failed — trying local classifier', err.message);
        }

        // 3. Local rule-based classifier (tertiary)
        const parseIngredients = window.__novaExt?.parseIngredients;
        const classifyByIngredients = window.__novaExt?.classifyByIngredients;
        if (typeof parseIngredients === 'function' && typeof classifyByIngredients === 'function') {
          const ingredients = parseIngredients(rawText);
          if (ingredients && ingredients.length > 0) {
            const result = classifyByIngredients(ingredients);
            if (result) {
              log(`NOVA ${result.score} from local classifier (confidence: ${result.confidence})`);
              return createBadge(result.score, result.reason, result.indicators || []);
            }
          }
        }
      }
    }

    // 4. All sources exhausted — show "?" badge
    log('No classification data available — showing unknown badge');
    const badge = document.createElement('span');
    setBadgeError(badge, 'Ingredient data not available for this product');
    return badge;
  }

  // ---------------------------------------------------------------------------
  // Main detection + badge loop
  // ---------------------------------------------------------------------------

  /**
   * Detects all products and injects NOVA badges.
   *
   * Main PDP product (H1): classified by ingredients and badged immediately.
   * Tile products: skipped — Tesco tile IDs are not EAN barcodes so the OFF API
   * cannot resolve them. Phase 9 will add barcode resolution for tiles.
   *
   * Uses _badged WeakSet to skip elements that already have a badge, making it
   * safe to call on every SPA navigation and MutationObserver fire.
   *
   * @param {object} adapter
   */
  function detectAndBadge(adapter) {
    const { injectBadge } = window.__novaExt;

    const products = adapter.detectProducts(document);
    log(`Detected ${products.length} products on this page`);

    if (products.length === 0) {
      log('No products detected — check selectors or page structure');
      return;
    }

    let tilesSkipped = 0;

    products.forEach((el, index) => {
      // Skip elements that have already been badged on a previous run.
      if (_badged.has(el)) return;

      const info = adapter.extractProductInfo(el);
      log(`Product ${index + 1}: ${info.name} (id: ${info.productId})`);

      if (isMainProduct(el)) {
        // Claim early — prevents re-entry during async resolution.
        _badged.add(el);
        // Classify by ingredients — ingredient section is available on PDPs.
        classifyMainProduct(adapter, info.productId).then(badge => {
          injectBadge(el, badge);
        });
      } else {
        // Tile product: no ingredient data and no EAN barcode available.
        // Skip entirely — a missing badge is better than a permanent spinner.
        tilesSkipped++;
      }
    });

    if (tilesSkipped > 0) {
      log(`  → ${tilesSkipped} tile product(s) skipped (no EAN barcode)`);
    }
  }

  // ---------------------------------------------------------------------------
  // SPA navigation detection
  // ---------------------------------------------------------------------------

  /**
   * Wraps a history method to fire a nova:urlchange event after the original call.
   * @param {'pushState'|'replaceState'} method
   */
  function wrapHistoryMethod(method) {
    const original = history[method].bind(history);
    history[method] = function (...args) {
      original(...args);
      window.dispatchEvent(new Event('nova:urlchange'));
    };
  }

  /**
   * Sets up SPA URL-change detection by intercepting history API methods
   * and listening for popstate (browser back/forward).
   *
   * @param {object} adapter
   */
  function setupSpaNavigation(adapter) {
    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');

    window.addEventListener('popstate', () =>
      window.dispatchEvent(new Event('nova:urlchange'))
    );

    // Debounce re-run to let Tesco's React finish rendering after navigation.
    window.addEventListener(
      'nova:urlchange',
      debounce(() => {
        log('SPA navigation detected — re-running detection');
        detectAndBadge(adapter);
      }, 400)
    );
  }

  // ---------------------------------------------------------------------------
  // MutationObserver for async DOM updates
  // ---------------------------------------------------------------------------

  /**
   * Watches document.body for new DOM nodes and re-runs detection when
   * new content appears (e.g. Tesco React renders product tiles after navigation).
   *
   * The _badged WeakSet ensures already-badged elements are never duplicated.
   *
   * @param {object} adapter
   */
  function setupMutationObserver(adapter) {
    const observer = new MutationObserver(
      debounce(() => detectAndBadge(adapter), 500)
    );
    observer.observe(document.body, { childList: true, subtree: true });
    log('MutationObserver active');
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  /**
   * Initialises the extension.
   * Loads debug preference from storage before first MutationObserver fire.
   */
  function init() {
    // Load debug preference from storage (takes effect before first MutationObserver fire).
    browser.storage.local.get(['debugMode']).then((data) => {
      CONFIG.DEBUG = !!data.debugMode;
    });

    log(`Extension loaded — Version ${CONFIG.VERSION}, Phase ${CONFIG.PHASE}`);

    const adapter = findAdapter();
    if (!adapter) {
      log('No supported adapter for this page — extension will not run');
      return;
    }

    log(`Using adapter: ${adapter.SITE_ID}`);

    const run = () => {
      detectAndBadge(adapter);
      setupSpaNavigation(adapter);
      setupMutationObserver(adapter);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  init();
})();
