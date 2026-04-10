/**
 * UPF Scanner - Main Content Script
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
      console.log(`[UPF Scanner] ${message}`, data);
    } else {
      console.log(`[UPF Scanner] ${message}`);
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

  // Map tracking badged DOM elements: Element → productName at time of badging.
  // Using Map (not WeakSet/Set) so we can (a) call _badged.clear() on SPA
  // navigation and (b) detect when React re-renders a new product into the same
  // H1 element (characterData in-place update) by comparing the stored name.
  const _badged = new Map();

  /**
   * Removes all NOVA badge elements from the DOM and resets the badged-element
   * tracker. Called before re-running detection on SPA navigation so that a
   * reused H1 element (React SPA pattern) gets a fresh badge for the new product.
   * _badged.clear() works on Map the same as Set.
   */
  function clearBadgesOnNavigation() {
    document.querySelectorAll('.nova-badge').forEach(b => b.remove());
    _badged.clear();
  }

  // ---------------------------------------------------------------------------
  // Extension enable/disable state
  // ---------------------------------------------------------------------------

  /**
   * Whether the extension is currently active on this page.
   * Starts true; updated by storage.onChanged when the user toggles the popup.
   * @type {boolean}
   */
  let _enabled = true;

  /**
   * Whether detection observers and SPA listeners have been set up for this page.
   * Guards against duplicate observer/listener registration on re-enable.
   * @type {boolean}
   */
  let _detectionStarted = false;

  /**
   * Set synchronously at the start of _initWithAdapter() to prevent a second
   * call racing in before the async storage reads complete and _detectionStarted
   * is set. Without this guard, rapid SPA navigations (product→product) could
   * trigger duplicate startup work and multiple chrome.storage.onChanged registrations.
   * @type {boolean}
   */
  let _initInProgress = false;

  /**
   * Removes all NOVA badges and clears the badged-element tracker.
   * Called both on SPA navigation and when the extension is disabled.
   */
  function disableOnPage() {
    document.querySelectorAll('.nova-badge').forEach(b => b.remove());
    _badged.clear();
  }

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
   * Delegates to adapter.isMainProduct() when available; falls back to a
   * generic H1 check so new adapters work without explicit overrides.
   * @param {Element} el
   * @param {object} adapter
   * @returns {boolean}
   */
  function isMainProduct(el, adapter) {
    return typeof adapter.isMainProduct === 'function'
      ? adapter.isMainProduct(el)
      : el.tagName === 'H1'; // generic fallback
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
   * Sends a SET_PAGE_NOVA message to the background on classification so the
   * toolbar badge and popup reflect the current product's NOVA score.
   *
   * Parallel strategy: worst case drops from ~18s (8s + 10s sequential) to ~10s
   * (max of the two timeouts) on a cold cache.
   *
   * @param {object} adapter
   * @param {string|null} productId - Tesco product ID (passed through to background)
   * @param {string} productName    - Display name for the popup
   * @returns {Promise<HTMLElement>} Badge element
   */
  async function classifyMainProduct(adapter, productId, productName) {
    const { createBadge, setBadgeError } = window.__novaExt;

    // Validates novaScore is an integer in [1, 4]
    const isValidScore = n => Number.isInteger(n) && n >= 1 && n <= 4;

    /**
     * Notifies the background of the resolved NOVA score so the toolbar badge
     * and popup can reflect the current product. Fire-and-forget.
     * @param {number} novaScore
     * @param {string|null} [barcode]
     * @param {string[]} [markers]
     */
    const notifyBackground = (novaScore, barcode = null, markers = []) => {
      browser.runtime.sendMessage({
        type: 'SET_PAGE_NOVA',
        novaScore,
        productName: productName || null,
        barcode: barcode || null,
        markers,
      }).catch(() => { }); // ignore — background may be inactive
    };

    // Validates offUrl is a safe OpenFoodFacts product URL
    const isValidOffUrl = url =>
      typeof url === 'string' && url.startsWith('https://world.openfoodfacts.org/product/');

    // Extract all barcodes and ingredients from DOM upfront (both synchronous)
    const rawBarcodes = typeof adapter.extractBarcodes === 'function'
      ? await adapter.extractBarcodes(document)
      : (typeof adapter.extractBarcode === 'function' ? [adapter.extractBarcode(document)].filter(Boolean) : []);

    // GS1 rule: EAN-13s starting with '2' are retailer-assigned variable-weight
    // barcodes (e.g. Sainsbury's internal EANs). They are never indexed by
    // OpenFoodFacts, so filtering globally here avoids wasted API calls from
    // any adapter.
    const barcodes = rawBarcodes.filter(bc => !/^2/.test(String(bc)));
    const rawText = typeof adapter.extractIngredients === 'function'
      ? await adapter.extractIngredients(document) : null;

    log(`Barcodes: ${barcodes.length > 0 ? barcodes.join(', ') : 'none'} | Ingredients: ${rawText ? 'found' : 'none'}`);

    // Fast path: NOVA 1 inferred only when there are no ingredients at all.
    // Products with ingredient text must be classified by OFF — the local classifier
    // lacks the ingredient-taxonomy knowledge to correctly score food-type names
    // like "Cheddar" (NOVA 3 per OFF cheese category rule).
    if (barcodes.length === 0 && !rawText) {
      log('NOVA 1 inferred — no barcode, no ingredient text (fresh produce)');
      notifyBackground(1, null, []);
      return createBadge(1, 'No ingredients detected — likely unprocessed produce', []);
    }

    // Fire all barcode lookups in parallel — ingredient analysis also fires simultaneously.
    // Promise.any resolves with the first result that carries a valid NOVA score.
    const barcodePromise = barcodes.length > 0
      ? Promise.any(
        barcodes.map(bc =>
          browser.runtime.sendMessage({ type: 'FETCH_PRODUCT', barcode: bc })
            .then(result => {
              if (result?.success && isValidScore(result.novaScore)) return { result, barcode: bc };
              return Promise.reject(new Error('no score'));
            })
            .catch(err => Promise.reject(err))
        )
      ).catch(() => null)
      : Promise.resolve(null);

    const ingredientPromise = rawText
      ? browser.runtime.sendMessage({
        type: 'ANALYZE_INGREDIENTS',
        ingredientsText: rawText,
        productId,
      }).catch(() => null)
      : Promise.resolve(null);

    // 1. Barcode result (priority — OpenFoodFacts product data is most authoritative)
    const barcodeWinner = await barcodePromise;  // { result, barcode } or null
    const barcodeResult = barcodeWinner?.result ?? null;
    const winningBarcode = barcodeWinner?.barcode ?? null;

    if (barcodeResult && isValidScore(barcodeResult.novaScore)) {
      log(`NOVA ${barcodeResult.novaScore} from barcode lookup (${barcodeResult.source}, barcode ${winningBarcode})`);
      const offUrl = isValidOffUrl(barcodeResult.offUrl)
        ? barcodeResult.offUrl
        : (winningBarcode ? `https://world.openfoodfacts.org/product/${winningBarcode}` : null);
      notifyBackground(barcodeResult.novaScore, winningBarcode, barcodeResult.markers || []);
      return createBadge(barcodeResult.novaScore, `OpenFoodFacts (barcode ${winningBarcode})`, barcodeResult.markers || [], offUrl);
    }
    log(`Barcode lookup returned no NOVA score — checking ingredient analysis`);

    // 2. Ingredient analysis result (already in-flight, may already be resolved)
    const ingredientResult = await ingredientPromise;
    if (ingredientResult?.success && isValidScore(ingredientResult.novaScore)) {
      log(`NOVA ${ingredientResult.novaScore} from OFF ingredient analysis`);
      notifyBackground(ingredientResult.novaScore, null, ingredientResult.markers || []);
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
            notifyBackground(result.score, null, result.indicators || []);
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
   * Detects the main PDP product and injects a NOVA badge.
   *
   * Uses _badged Map to skip elements that already have a badge, making it
   * safe to call on every SPA navigation and MutationObserver fire.
   *
   * @param {object} adapter
   */
  function detectAndBadge(adapter) {
    if (!_enabled) return;
    const { injectBadge } = window.__novaExt;

    const products = adapter.detectProducts(document);
    log(`Detected ${products.length} products on this page`);

    if (products.length === 0) {
      log('No products detected — check selectors or page structure');
      return;
    }

    products.forEach((el, index) => {
      // Skip elements that have already been badged on a previous run.
      // For Map entries, also check whether React re-rendered a new product
      // into the same H1 element (characterData in-place update). el.textContent
      // is uncontaminated by the badge because injectBadge() inserts it as a
      // sibling (afterend), not a child.
      if (_badged.has(el)) {
        if (el.textContent.trim() === _badged.get(el)) return; // same product — skip
        // Different text — new product rendered in this element. Remove stale
        // sibling badge and fall through to re-classify.
        const staleName = _badged.get(el);
        log(`[SPA re-render] H1 changed: "${staleName}" → "${el.textContent.trim()}" — removing stale badge, re-classifying`);
        if (el.nextElementSibling?.classList?.contains('nova-badge')) {
          el.nextElementSibling.remove();
        }
        _badged.delete(el);
      }

      const info = adapter.extractProductInfo(el);
      log(`Product ${index + 1}: ${info.name} (id: ${info.productId})`);

      if (isMainProduct(el, adapter)) {
        // Claim early — prevents re-entry during async resolution.
        // Store the product name so stale-detection can compare on SPA re-render.
        _badged.set(el, info.name);
        // Show "NOVA ?" immediately so the user has feedback while async
        // classification runs; replace with the scored badge on resolve.
        const { setBadgeLoading } = window.__novaExt;
        const loadingBadge = document.createElement('span');
        setBadgeLoading(loadingBadge);
        injectBadge(el, loadingBadge);
        log(`Loading badge injected for: ${info.name}`);
        classifyMainProduct(adapter, info.productId, info.name).then(badge => {
          log(`Classification resolved — replacing loading badge (result: "${badge.textContent}")`);
          // Guard against SPA navigation that occurred while classification was
          // in-flight: clearBadgesOnNavigation() removes loadingBadge from the DOM,
          // so replaceWith() would throw a HierarchyRequestError without this check.
          if (loadingBadge.isConnected) loadingBadge.replaceWith(badge);
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // SPA navigation detection
  // ---------------------------------------------------------------------------

  /**
   * Wraps a history method to fire a nova:urlchange event after the original call.
   * Guard against double-wrapping: called from both watchForProductNavigation()
   * (non-product page startup) and setupSpaNavigation() (post-detection setup),
   * so the second call must be a no-op to avoid double-dispatching nova:urlchange.
   * @param {'pushState'|'replaceState'} method
   */
  function wrapHistoryMethod(method) {
    if (history[method]._novaWrapped) return;
    const original = history[method].bind(history);
    history[method] = function (...args) {
      const result = original(...args);
      window.dispatchEvent(new Event('nova:urlchange'));
      return result;
    };
    history[method]._novaWrapped = true;
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

    // Track pathname so we only clear badges on real product-to-product
    // navigation (pushState / popstate). Same-pathname replaceState calls
    // (analytics, canonical URL normalisation) must NOT clear, otherwise the
    // async classification resolves against a detached loadingBadge and the
    // final badge is silently discarded.
    let _lastPathname = location.pathname;

    // Debounce re-run to let Tesco's React finish rendering after navigation.
    // 150ms is sufficient for React to batch and commit a render.
    window.addEventListener(
      'nova:urlchange',
      debounce(() => {
        const currentPathname = location.pathname;
        if (currentPathname !== _lastPathname) {
          log(`SPA product navigation detected (${_lastPathname} → ${currentPathname}) — clearing stale badges`);
          clearBadgesOnNavigation();
          _lastPathname = currentPathname;
        }
        log('SPA URL event — re-running detection');
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
   * characterData: true catches React's in-place H1 text updates on SPA nav
   * (e.g. Ocado/Morrisons "You May Also Like") which don't add/remove nodes.
   * The _badged Map stale-detection then removes the old badge and re-classifies.
   *
   * @param {object} adapter
   */
  function setupMutationObserver(adapter) {
    const observer = new MutationObserver(
      debounce(() => detectAndBadge(adapter), 150)
    );
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    log('MutationObserver active');
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  /**
   * Reads storage settings and starts detection for the resolved adapter.
   * Shared by two entry paths:
   *   1. Direct product-page load — adapter resolved immediately in init()
   *   2. SPA navigation — adapter resolved after URL change in watchForProductNavigation()
   * @param {object} adapter
   */
  function _initWithAdapter(adapter) {
    if (_initInProgress || _detectionStarted) return;
    _initInProgress = true;
    const isIncognito = chrome.extension.inIncognitoContext;

    if (isIncognito) {
      // Default off in incognito — check for explicit session opt-in.
      // chrome.storage.session is auto-cleared when the incognito window closes.
      browser.storage.session.get({ incognitoSessionEnabled: false }).then((data) => {
        _enabled = !!data.incognitoSessionEnabled;

        // Register session storage listener after _enabled is set (avoids race).
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'session' && 'incognitoSessionEnabled' in changes) {
            _enabled = !!changes.incognitoSessionEnabled.newValue;
            if (!_enabled) {
              disableOnPage();
            } else {
              startDetection(adapter);
            }
          }
        });

        if (!_enabled) return; // paused by default in incognito

        browser.storage.local.get({ debugMode: false }).then((localData) => {
          if (localData.debugMode !== undefined) CONFIG.DEBUG = !!localData.debugMode;
          log(`Extension loaded (incognito session) — Version ${CONFIG.VERSION}`);
          log(`Using adapter: ${adapter.SITE_ID}`);
          startDetection(adapter);
        });
      });
    } else {
      // Normal window — read extensionEnabled and debugMode in one call.
      browser.storage.local.get({ debugMode: false, extensionEnabled: true }).then((data) => {
        if (data.debugMode !== undefined) CONFIG.DEBUG = !!data.debugMode;
        _enabled = data.extensionEnabled !== false;

        // Register listener after _enabled is set (avoids race).
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && 'extensionEnabled' in changes) {
            _enabled = !!changes.extensionEnabled.newValue;
            if (!_enabled) disableOnPage();
          }
        });

        if (!_enabled) return;

        log(`Extension loaded — Version ${CONFIG.VERSION}`);
        log(`Using adapter: ${adapter.SITE_ID}`);
        startDetection(adapter);
      });
    }
  }

  /**
   * Sets up minimal navigation monitoring when the content script loads on a
   * non-product supermarket page (e.g. homepage, search results, category).
   *
   * IMPORTANT: wrapHistoryMethod() cannot intercept pushState calls made by the
   * page's own JavaScript (React Router) because content scripts run in an isolated
   * world with a separate JavaScript heap — each world has its own view of the
   * History wrapper object. Wrapping history.pushState in the content script world
   * only intercepts calls made from that same world, never from the page world.
   *
   * The reliable approach is MutationObserver: React always commits DOM mutations
   * when rendering a new route, so we watch for DOM changes and compare location.href
   * before and after each batch to detect SPA navigation to a product page.
   *
   * popstate (browser back/forward) is a native browser event that fires in all
   * worlds and is handled separately.
   */
  function watchForProductNavigation() {
    // popstate fires natively across all worlds (browser back/forward navigation)
    window.addEventListener('popstate', () => {
      if (_detectionStarted) return;
      const adapter = findAdapter();
      if (adapter) _initWithAdapter(adapter);
    });

    // MutationObserver detects React DOM commits after pushState navigation.
    // URL is compared after each debounced batch: if location.href changed AND
    // the new URL matches a product page, kick off full detection.
    let _lastUrl = location.href;
    const observer = new MutationObserver(
      debounce(() => {
        if (_detectionStarted) return;
        const currentUrl = location.href;
        if (currentUrl === _lastUrl) return; // URL unchanged — skip
        _lastUrl = currentUrl;
        const adapter = findAdapter();
        if (!adapter) return; // still not on a product page
        _initWithAdapter(adapter);
      }, 150)
    );
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Initialises the extension.
   * With the manifest now matching the full supermarket domain (not just product
   * URLs), two paths are possible:
   *   - Product page (direct load / full-page navigation): adapter resolves
   *     immediately → _initWithAdapter() starts detection.
   *   - Non-product page (homepage, search, category): adapter is null →
   *     watchForProductNavigation() monitors for SPA navigation to a product URL.
   */
  function init() {
    const adapter = findAdapter();

    if (!adapter) {
      // Not on a product page yet — watch for SPA navigation to one.
      watchForProductNavigation();
      return;
    }

    _initWithAdapter(adapter);
  }

  /**
   * Injects the badge stylesheet as a <link> element so it is only loaded on
   * product pages, never on non-product supermarket pages where CSS class names
   * could collide with the host page's own styles.
   *
   * CSS was previously declared in manifest content_scripts.css which caused it
   * to load on every matched page (now the full domain). Programmatic injection
   * here restricts it to pages where detection actually runs. The file is declared
   * in manifest web_accessible_resources so chrome.runtime.getURL resolves it.
   */
  function injectBadgeStyles() {
    if (document.querySelector('link[data-nova-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-nova-styles', '');
    link.href = chrome.runtime.getURL('content/ui/styles.css');
    document.head.appendChild(link);
  }

  /**
   * Starts badge detection and sets up SPA and mutation observers.
   * Extracted so both normal and incognito paths share the same startup sequence.
   * Guards against duplicate setup: on re-enable after disable, only reruns
   * detectAndBadge() without registering additional observers or listeners.
   * @param {object} adapter
   */
  function startDetection(adapter) {
    injectBadgeStyles();

    if (_detectionStarted) {
      // Observers and listeners are already wired — just re-run detection.
      detectAndBadge(adapter);
      return;
    }
    _detectionStarted = true;

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
