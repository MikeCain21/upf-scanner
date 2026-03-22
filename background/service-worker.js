/**
 * UPF Scanner - Background Service Worker
 *
 * Handles OpenFoodFacts API lookups, caching, and message passing with
 * content scripts. Runs as a Manifest V3 service worker.
 *
 * Message API:
 *   Request:  { type: 'FETCH_PRODUCT', barcode: string }
 *   Response: { success: true,  source: 'api'|'cache'|'not_found'|'no_nova',
 *               novaScore?: number, productName?: string }
 *           | { success: false, error: string }
 *
 * Content scripts fall back to local classification when source is
 * 'not_found' or 'no_nova'.
 *
 * @version 0.6.0
 */

'use strict';

// Load browser polyfill first — maps browser.* → chrome.* on Chrome/Edge;
// no-op on Firefox where browser.* is native.
importScripts('../lib/browser-polyfill.js');
importScripts('asda-api.js');
importScripts('sainsburys-api.js');
importScripts('ocado-api.js');
importScripts('message-validator.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Set to true to enable verbose logging in the browser console during development. */
const DEBUG = false;

const API_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';

/** OFF category tags that indicate unprocessed fresh produce (NOVA 1 by definition). */
const NOVA1_PRODUCE_CATEGORIES = new Set([
  'en:produce',
  'en:fresh-fruits',
  'en:fruits',
  'en:fresh-vegetables',
  'en:vegetables',
  'en:fresh-meat',
  'en:meats',
  'en:fresh-fish',
  'en:fish-and-seafood',
  'en:eggs',
  'en:fresh-herbs',
  'en:herbs',
]);

// User-Agent is required by OpenFoodFacts Terms of Service.
const USER_AGENT = 'UPF-Scanner/1.0.0 (open-source food classification tool)';

// Cache key prefix (short to save storage space).
const CACHE_PREFIX = 'off_';

// Cache TTL: 7 days in milliseconds.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Derived from manifest content_scripts.matches — no manual sync needed when adding adapters.
const ALLOWED_ORIGINS = chrome.runtime.getManifest()
  .content_scripts
  .flatMap(entry => entry.matches)
  .map(pattern => new URL(pattern.replace(/\/\*$/, '')).origin);

// ---------------------------------------------------------------------------
// Per-tab NOVA state + toolbar badge
// ---------------------------------------------------------------------------

/** In-memory store of the NOVA result for the currently-viewed product per tab. */
const tabNovaState = new Map();

/** Session storage key prefix for per-tab NOVA state. */
const SESSION_TAB_PREFIX = 'nova_tab_';

/**
 * Saves per-tab NOVA state to both the in-memory cache and chrome.storage.session
 * so the state survives service worker idle-termination.
 *
 * @param {number} tabId
 * @param {Object} state
 * @returns {Promise<void>}
 */
async function saveTabState(tabId, state) {
  tabNovaState.set(tabId, state);
  await chrome.storage.session.set({ [SESSION_TAB_PREFIX + tabId]: state });
}

/**
 * Loads per-tab NOVA state from the in-memory cache, falling back to
 * chrome.storage.session when the service worker was restarted and the
 * in-memory Map is empty.
 *
 * @param {number} tabId
 * @returns {Promise<Object|null>}
 */
async function loadTabState(tabId) {
  if (tabNovaState.has(tabId)) return tabNovaState.get(tabId);
  const result = await chrome.storage.session.get(SESSION_TAB_PREFIX + tabId);
  const state = result[SESSION_TAB_PREFIX + tabId] || null;
  if (state) tabNovaState.set(tabId, state); // warm the in-memory cache
  return state;
}

/**
 * Removes per-tab NOVA state from both the in-memory cache and
 * chrome.storage.session.
 *
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function clearTabState(tabId) {
  tabNovaState.delete(tabId);
  await chrome.storage.session.remove(SESSION_TAB_PREFIX + tabId);
}

/** NOVA score → badge background colour */
const BADGE_COLORS = {
  1: '#4CAF50',
  2: '#FFC107',
  3: '#FF9800',
  4: '#E53935',
};

/**
 * Updates the toolbar badge for a tab to reflect its current NOVA score.
 * Clears the badge when novaScore is null / out of range.
 *
 * @param {number} tabId
 * @param {number|null} novaScore
 */
function updateBadge(tabId, novaScore) {
  if (!novaScore || !BADGE_COLORS[novaScore]) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  chrome.action.setBadgeText({ tabId, text: String(novaScore) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[novaScore] });
  chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' });
}

// Clear per-tab state when a tab is closed.
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabState(tabId).catch(() => {});
});

// Clear per-tab state (and badge) when a tab navigates to a new URL.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    clearTabState(tabId).catch(() => {});
    updateBadge(tabId, null);
  }
});

// ---------------------------------------------------------------------------
// Pure helpers (mirrored in lib/openfoodfacts.js for Jest testing)
// ---------------------------------------------------------------------------

/**
 * Extracts the NOVA score (1–4) from an OpenFoodFacts product object.
 * Tries nova_group first, then falls back to nova_groups_tags.
 *
 * @param {Object|null} product
 * @returns {number|null}
 */
function extractNovaScore(product) {
  if (!product) return null;

  const direct = parseInt(product.nova_group, 10);
  if (!isNaN(direct) && direct >= 1 && direct <= 4) {
    return direct;
  }

  const tags = product.nova_groups_tags;
  if (Array.isArray(tags) && tags.length > 0) {
    const match = tags[0].match(/en:(\d)-/);
    if (match) {
      const score = parseInt(match[1], 10);
      if (score >= 1 && score <= 4) return score;
    }
  }

  return null;
}

/**
 * Validates and unwraps an OpenFoodFacts API JSON response.
 *
 * @param {Object|null} data
 * @returns {Object|null} product object or null
 */
function parseApiResponse(data) {
  if (!data || data.status !== 1) return null;
  return data.product || null;
}

/**
 * Extracts classification markers for a specific NOVA group from nova_groups_markers.
 * Cleans tags to human-readable form: "en:e471" → "E471", "glucose-syrup" → "Glucose syrup"
 *
 * @param {Object} novaMarkersObj - nova_groups_markers from OFF response
 * @param {number} novaScore     - The assigned NOVA score
 * @returns {string[]}           Array of cleaned marker strings
 */
function extractNovaMarkers(novaMarkersObj, novaScore) {
  if (!novaMarkersObj || typeof novaMarkersObj !== 'object') return [];
  const entries = novaMarkersObj[String(novaScore)] || [];
  return entries
    .map(([, tag]) => {
      const clean = tag.replace(/^en:/, '').replace(/-/g, ' ');
      // E-numbers: uppercase (e471 → E471)
      if (/^e\d/i.test(clean)) return clean.toUpperCase();
      // Everything else: capitalise first letter
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    })
    .filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate
}

// ---------------------------------------------------------------------------
// Ingredient text hashing
// ---------------------------------------------------------------------------

/**
 * djb2 hash of a string — produces a stable, compact cache key for ingredient text.
 * Using the hash instead of productId means cache misses are automatic when
 * ingredient text changes (reformulation), with no extra API call required.
 *
 * @param {string} str
 * @returns {string} Unsigned 32-bit integer as hex string
 */
function hashIngredients(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Keep to 32-bit signed integer
  }
  return (hash >>> 0).toString(16); // Unsigned hex
}

// ---------------------------------------------------------------------------
// Cache helpers (chrome.storage.local)
// ---------------------------------------------------------------------------

/**
 * Reads a cached product entry. Returns null if absent or expired.
 *
 * @param {string} barcode
 * @returns {Promise<Object|null>}
 */
async function getCached(barcode) {
  const key = CACHE_PREFIX + barcode;
  try {
    const result = await browser.storage.local.get(key);
    if (!result[key]) return null;

    const cached = result[key];
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      // Entry expired — remove and treat as miss
      await browser.storage.local.remove(key);
      return null;
    }

    if (DEBUG) console.log(`[NOVA Cache] Hit for ${barcode}`);
    return cached;
  } catch (err) {
    if (DEBUG) console.warn('[NOVA Cache] Read error:', err.message);
    return null;
  }
}

/**
 * Writes a product entry to the cache with the current timestamp.
 *
 * @param {string} barcode
 * @param {{ novaScore: number, productName: string }} entry
 * @returns {Promise<void>}
 */
async function setCached(barcode, entry) {
  const key = CACHE_PREFIX + barcode;
  try {
    await browser.storage.local.set({ [key]: { ...entry, timestamp: Date.now() } });
    if (DEBUG) console.log(`[NOVA Cache] Stored ${barcode}`);
  } catch (err) {
    if (DEBUG) console.warn('[NOVA Cache] Write error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------

/**
 * Fetches a product from OpenFoodFacts by barcode.
 * Returns the product object, or null if not found or on error.
 *
 * @param {string} barcode - EAN-13 or UPC barcode string
 * @returns {Promise<Object|null>}
 */
async function fetchProductByBarcode(barcode) {
  const url = `${API_BASE_URL}/${encodeURIComponent(barcode)}.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      // 404 is expected for unknown barcodes — not an error
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return parseApiResponse(data);
  } catch (err) {
    if (DEBUG) console.warn(`[NOVA API] Fetch error for ${barcode}:`, err.message);
    return null; // Network/parse error → trigger fallback in content script
  }
}

// ---------------------------------------------------------------------------
// Ingredient analysis (stateless OFF v3 endpoint)
// ---------------------------------------------------------------------------

/**
 * Sends ingredient text to the OpenFoodFacts v3 stateless analysis endpoint
 * and returns the NOVA group. Uses chrome.storage.local cache keyed by a
 * djb2 hash of the ingredient text — so reformulated products automatically
 * bust the cache without requiring a productId.
 *
 * @param {string} ingredientsText - Raw ingredient string scraped from the page
 * @param {string|null} productId  - Unused; kept for backward-compatible call signature
 * @returns {Promise<{novaScore: number|null, markers: string[]}|null>}
 */
async function analyzeIngredients(ingredientsText, productId, isIncognito = false) { // eslint-disable-line no-unused-vars
  // Cache keyed by ingredient text hash — reformulations get a fresh cache entry automatically
  const ingredientHash = hashIngredients(ingredientsText);
  const cacheKey = 'ingredients_' + ingredientHash;
  const cached = await getCached(cacheKey);
  if (cached) return { novaScore: cached.novaScore, markers: cached.markers || [] };

  // 'test' is a known OFF product barcode used to validate the v3 ingredient analysis endpoint
  const url = 'https://world.openfoodfacts.org/api/v3/product/test';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
      body: JSON.stringify({
        lc: 'en',
        cc: 'gb',
        fields: 'nova_group,nova_groups_tags,nova_groups_markers',
        product: {
          lang: 'en',
          ingredients_text_en: ingredientsText,
        },
      }),
    });

    clearTimeout(timeout);
    const data = await response.json();
    const novaScore = data.status === 'success' ? (data.product?.nova_group || null) : null;
    const markers = extractNovaMarkers(data.product?.nova_groups_markers, novaScore);

    // Cache successful result — keyed by ingredient hash (see cacheKey above)
    // Skip cache write in incognito to avoid persisting private browsing data.
    if (novaScore) {
      if (isIncognito) {
        if (DEBUG) console.log('[NOVA Cache] Skipping ingredient cache write — incognito tab');
      } else {
        await setCached(cacheKey, { novaScore, markers, productName: '' });
      }
    }

    if (DEBUG) console.log(`[NOVA API] Ingredient analysis → NOVA ${novaScore}, markers: ${markers.join(', ') || 'none'}`);
    return { novaScore, markers };
  } catch (err) {
    if (DEBUG) console.warn('[NOVA API] Ingredient analysis error:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main lookup pipeline: cache → API
// ---------------------------------------------------------------------------

/**
 * Looks up a product by barcode: checks cache first, then queries API.
 *
 * Returns one of:
 *   { source: 'cache'|'api', novaScore: number, productName: string, markers: string[], offUrl: string|null }
 *   { source: 'not_found' }   — barcode not in OpenFoodFacts
 *   { source: 'no_nova' }     — product found but NOVA score unavailable
 *
 * @param {string} barcode
 * @returns {Promise<Object>}
 */
async function lookupProduct(barcode, isIncognito = false) {
  // 1. Cache hit
  const cached = await getCached(barcode);
  if (cached) {
    return {
      source: 'cache',
      novaScore: cached.novaScore,
      productName: cached.productName,
      markers: cached.markers || [],
      offUrl: cached.offUrl || null,
    };
  }

  // 2. API lookup
  if (DEBUG) console.log(`[NOVA API] Querying OpenFoodFacts for barcode ${barcode}`);
  const product = await fetchProductByBarcode(barcode);

  if (!product) {
    if (DEBUG) console.log(`[NOVA API] Not found in OpenFoodFacts: ${barcode}`);
    return { source: 'not_found' };
  }

  const novaScore = extractNovaScore(product);
  if (!novaScore) {
    const categories = product.categories_tags || product.categories || [];
    const isFreshProduce = Array.isArray(categories) &&
      categories.some(cat => NOVA1_PRODUCE_CATEGORIES.has(cat));
    if (isFreshProduce) {
      const productName = product.product_name || '';
      const offUrl = `https://world.openfoodfacts.org/product/${barcode}`;
      if (isIncognito) {
        if (DEBUG) console.log(`[NOVA Cache] Skipping cache write — incognito tab (${barcode})`);
      } else {
        await setCached(barcode, { novaScore: 1, productName, markers: [], offUrl });
      }
      if (DEBUG) console.log(`[NOVA API] NOVA 1 inferred from fresh produce category for ${barcode} (${productName})`);
      return { source: 'api', novaScore: 1, productName, markers: [], offUrl };
    }
    if (DEBUG) console.log(`[NOVA API] Product found but no NOVA data: ${barcode}`);
    return { source: 'no_nova' };
  }

  // 3. Cache successful result and return
  // Skip cache write in incognito to avoid persisting private browsing data.
  const productName = product.product_name || '';
  const markers = extractNovaMarkers(product.nova_groups_markers, novaScore);
  const offUrl = `https://world.openfoodfacts.org/product/${barcode}`;
  if (isIncognito) {
    if (DEBUG) console.log(`[NOVA Cache] Skipping cache write — incognito tab (${barcode})`);
  } else {
    await setCached(barcode, { novaScore, productName, markers, offUrl });
  }

  if (DEBUG) console.log(`[NOVA API] NOVA ${novaScore} (${productName}) from OpenFoodFacts for ${barcode}`);
  return { source: 'api', novaScore, productName, markers, offUrl };
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (DEBUG) console.log('[NOVA Background] Message received:', message.type, 'from', sender.tab?.url || 'popup');

  // ---------------------------------------------------------------------------
  // Popup-only messages — sender.tab is undefined when the caller is the popup
  // or another extension page. Content scripts always have sender.tab set, so
  // gating on !sender.tab prevents content scripts (including compromised ones
  // on allowed origins) from reaching these handlers.
  // ---------------------------------------------------------------------------

  if (!sender.tab) {
    if (message.type === 'GET_PAGE_NOVA') {
      if (Number.isInteger(message.tabId) && message.tabId > 0) {
        loadTabState(message.tabId)
          .then(state => sendResponse(state || { novaScore: null, productName: null, barcode: null }))
          .catch(() => sendResponse({ novaScore: null, productName: null, barcode: null }));
      } else {
        sendResponse({ novaScore: null, productName: null, barcode: null });
      }
      return true; // keep channel open for async response
    }

    if (message.type === 'CLEAR_CACHE') {
      (async () => {
        const allData = await browser.storage.local.get(null);
        const cacheKeys = Object.keys(allData).filter(k =>
          k.startsWith('product_') || k.startsWith('ingredients_') || k.startsWith(CACHE_PREFIX)
        );
        await browser.storage.local.remove(cacheKeys);
        sendResponse({ cleared: cacheKeys.length });
      })();
      return true; // async
    }

    sendResponse({ success: false, error: 'Unknown message type' });
    return false;
  }

  // ---------------------------------------------------------------------------
  // Content script messages — validate sender origin before processing
  // ---------------------------------------------------------------------------

  const senderOrigin = sender.origin || new URL(sender.tab?.url || 'about:blank').origin;
  if (!ALLOWED_ORIGINS.includes(senderOrigin)) {
    console.warn('[NOVA Background] Rejected message from unexpected sender:', senderOrigin); // Always log: security-relevant rejection, not debug noise
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return false;
  }

  if (message.type === 'SET_PAGE_NOVA') {
    const tabId = sender.tab.id;
    const { productName, markers } = message;
    const novaScore = isValidNovaScore(message.novaScore) ? message.novaScore : null;
    const barcode = isValidBarcode(message.barcode) ? message.barcode : null;
    if (DEBUG && typeof productName === 'string' && productName.length > 200) {
      console.warn('[NOVA Background] SET_PAGE_NOVA: productName truncated to 200 chars');
    }
    const state = {
      novaScore,
      productName: (typeof productName === 'string' ? productName.slice(0, 200) : null) || null,
      barcode,
      markers: Array.isArray(markers) ? markers : [],
    };
    saveTabState(tabId, state).catch(() => {});
    updateBadge(tabId, novaScore);
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'FETCH_PRODUCT') {
    const { barcode } = message;
    if (!barcode) {
      sendResponse({ success: false, error: 'No barcode provided' });
      return false;
    }

    const isIncognito = sender.tab?.incognito ?? false;
    lookupProduct(barcode, isIncognito)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => {
        console.error('[NOVA Background] Unexpected error:', err); // Always log: unexpected errors should surface in production
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keeps the message channel open for the async response
  }

  if (message.type === 'ANALYZE_INGREDIENTS') {
    const rawText = typeof message.ingredientsText === 'string'
      ? message.ingredientsText.slice(0, MAX_INGREDIENTS_TEXT_LENGTH)
      : null;
    if (!rawText) {
      sendResponse({ success: false, error: 'No ingredientsText provided' });
      return false;
    }

    const isIncognito = sender.tab?.incognito ?? false;
    analyzeIngredients(rawText, message.productId || null, isIncognito)
      .then(result => sendResponse({
        success: true,
        novaScore: result?.novaScore ?? null,
        markers: result?.markers ?? [],
      }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true; // Keeps the message channel open for the async response
  }

  if (message.type === 'FETCH_ASDA_PRODUCT') {
    const { productId, token } = message;
    if (!productId || !token) {
      sendResponse({ success: false, error: 'Missing productId or token' });
      return false;
    }
    const isIncognito = sender.tab?.incognito ?? false;
    fetchAsdaProduct(productId, token)
      .then(data => {
        if (DEBUG && isIncognito) {
          console.log('[NOVA Background] ASDA API call in incognito — result not cached');
        }
        sendResponse({ success: true, data, isIncognito });
      })
      .catch(() => {
        sendResponse({ success: false, error: 'ASDA API error' });
      });
    return true; // async response
  }

  if (message.type === 'FETCH_SAINSBURYS_BARCODES') {
    const { sku } = message;
    if (!sku) {
      sendResponse({ success: false, error: 'Missing sku' });
      return false;
    }
    fetchSainsburysBarcodes(sku)
      .then(data => sendResponse({ success: true, data }))
      .catch(() => sendResponse({ success: false, error: 'Sainsburys API error' }));
    return true; // async response
  }

  if (message.type === 'FETCH_OCADO_INGREDIENTS') {
    const { productId } = message;
    if (!productId) {
      sendResponse({ success: false, error: 'Missing productId' });
      return false;
    }
    fetchOcadoIngredients(productId)
      .then(data => sendResponse({ success: true, data }))
      .catch(() => sendResponse({ success: false, error: 'Ocado API error' }));
    return true; // async response
  }

  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

if (DEBUG) console.log('[NOVA Background] Service worker ready');
