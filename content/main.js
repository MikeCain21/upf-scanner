/**
 * NOVA Extension - Main Content Script
 *
 * Orchestrates product detection, ingredient extraction, classification,
 * and badge display on supported supermarket pages.
 *
 * Load order (manifest.json):
 *   lib/browser-polyfill.js       → browser.* API
 *   content/sites/base-adapter.js → window.__novaExt.BaseAdapter
 *   content/sites/registry.js     → window.__novaExt.registry
 *   content/sites/{site}.js       → self-registers via registry.register()
 *   lib/ingredient-parser.js      → window.__novaExt.parseIngredients
 *   lib/nova-indicators.js        → window.__novaExt.detectIndicators
 *   lib/nova-classifier.js        → window.__novaExt.classifyByIngredients
 *   content/ui/badge.js           → window.__novaExt.createBadge / setBadgeLoading / setBadgeError / injectBadge
 *   content/main.js               (this file)
 *
 * SPA navigation support + API wiring.
 *   - Wraps history.pushState/replaceState to detect SPA URL changes
 *   - MutationObserver catches products rendered after DOM settles
 *   - WeakSet prevents duplicate badges across re-runs
 *   - Tile products are skipped (Tesco IDs ≠ EAN barcodes)
 *
 * @version 0.9.0
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
   * Finds the registered adapter for the current page URL via the registry.
   * @returns {object|null}
   */
  function findAdapter() {
    const registry = window.__novaExt?.registry;
    if (!registry) return null;
    return registry.getAdapter(window.location.href);
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
   * Fires barcode lookup and ingredient analysis simultaneously; barcode result
   * takes priority. Falls back to local classifier if both APIs yield no score.
   * Returns a Promise that resolves to a scored badge element (or error badge).
   *
   * Parallel strategy: worst case drops from ~18s (8s + 10s sequential) to ~10s
   * (max of the two timeouts) on a cold cache.
   *
   * @param {object} adapter
   * @param {string|null} productId - Tesco product ID (passed through to background)
   * @returns {Promise<HTMLElement>} Badge element
   */
  async function classifyMainProduct(adapter, productId) {
    const { createBadge, setBadgeError } = window.__novaExt;

    // Validates novaScore is an integer in [1, 4]
    const isValidScore = n => Number.isInteger(n) && n >= 1 && n <= 4;

    // Validates offUrl is a safe OpenFoodFacts product URL
    const isValidOffUrl = url =>
      typeof url === 'string' && url.startsWith('https://world.openfoodfacts.org/product/');

    // Extract barcode and ingredients from DOM upfront (both synchronous)
    const barcode = typeof adapter.extractBarcode === 'function'
      ? adapter.extractBarcode(document) : null;
    const rawText = typeof adapter.extractIngredients === 'function'
      ? adapter.extractIngredients(document) : null;

    log(`Barcode: ${barcode ?? 'none'} | Ingredients: ${rawText ? 'found' : 'none'}`);

    // Fire both API calls simultaneously so the ingredient call is already in-flight
    // while we wait for the higher-priority barcode result.
    const barcodePromise = barcode
      ? browser.runtime.sendMessage({ type: 'FETCH_PRODUCT', barcode }).catch(() => null)
      : Promise.resolve(null);

    const ingredientPromise = rawText
      ? browser.runtime.sendMessage({
          type: 'ANALYZE_INGREDIENTS',
          ingredientsText: rawText,
          productId,
        }).catch(() => null)
      : Promise.resolve(null);

    // 1. Barcode result (priority — OpenFoodFacts product data is most authoritative)
    const barcodeResult = await barcodePromise;
    if (barcodeResult?.success && isValidScore(barcodeResult.novaScore)) {
      log(`NOVA ${barcodeResult.novaScore} from barcode lookup (${barcodeResult.source})`);
      const offUrl = isValidOffUrl(barcodeResult.offUrl)
        ? barcodeResult.offUrl
        : (barcode ? `https://world.openfoodfacts.org/product/${barcode}` : null);
      return createBadge(barcodeResult.novaScore, `OpenFoodFacts (barcode ${barcode})`, barcodeResult.markers || [], offUrl);
    }
    log(`Barcode lookup returned no NOVA score (${barcodeResult?.source}) — checking ingredient analysis`);

    // 2. Ingredient analysis result (already in-flight, may already be resolved)
    const ingredientResult = await ingredientPromise;
    if (ingredientResult?.success && isValidScore(ingredientResult.novaScore)) {
      log(`NOVA ${ingredientResult.novaScore} from OFF ingredient analysis`);
      return createBadge(ingredientResult.novaScore, 'OpenFoodFacts ingredient analysis', ingredientResult.markers || []);
    }
    log('OFF ingredient analysis returned no score — trying local classifier');

    // 3. Local rule-based classifier (unchanged fallback)
    if (rawText) {
      const parseIngredients = window.__novaExt?.parseIngredients;
      const classifyByIngredients = window.__novaExt?.classifyByIngredients;
      if (typeof parseIngredients === 'function' && typeof classifyByIngredients === 'function') {
        const ingredients = parseIngredients(rawText);
        if (ingredients?.length > 0) {
          const result = classifyByIngredients(ingredients);
          if (result) {
            log(`NOVA ${result.score} from local classifier (confidence: ${result.confidence})`);
            return createBadge(result.score, result.reason, result.indicators || []);
          }
        }
      }
    }

    // All sources exhausted — show "?" badge
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
   * cannot resolve them.
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
        // Show "NOVA ?" immediately so the user has feedback while async
        // classification runs; replace with the scored badge on resolve.
        const { setBadgeLoading } = window.__novaExt;
        const loadingBadge = document.createElement('span');
        setBadgeLoading(loadingBadge);
        injectBadge(el, loadingBadge);
        log(`Loading badge injected for: ${info.name}`);
        classifyMainProduct(adapter, info.productId).then(badge => {
          log(`Classification resolved — replacing loading badge (result: "${badge.textContent}")`);
          loadingBadge.replaceWith(badge);
        });
      } else {
        // Tile products: no ingredient data and no EAN barcode available.
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
    // 150ms is sufficient for React to batch and commit a render.
    window.addEventListener(
      'nova:urlchange',
      debounce(() => {
        log('SPA navigation detected — re-running detection');
        detectAndBadge(adapter);
      }, 150)
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
      debounce(() => detectAndBadge(adapter), 150)
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
    const adapter = findAdapter();
    if (!adapter) {
      return;
    }

    // Load debug preference from storage before first detection run so that
    // CONFIG.DEBUG is guaranteed set when detectAndBadge() is first called.
    browser.storage.local.get(['debugMode']).then((data) => {
      // Only override the compiled default when debugMode is explicitly set in storage
      if (data.debugMode !== undefined) CONFIG.DEBUG = !!data.debugMode;

      log(`Extension loaded — Version ${CONFIG.VERSION}`);
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
    });
  }

  init();
})();
