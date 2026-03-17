/**
 * NOVA Extension - Background Service Worker
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
 * 'not_found' or 'no_nova' (handled in Phase 7–8 wiring).
 *
 * @version 0.6.0
 */

'use strict';

// Load browser polyfill first — maps browser.* → chrome.* on Chrome/Edge;
// no-op on Firefox where browser.* is native.
importScripts('../lib/browser-polyfill.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';

// User-Agent is required by OpenFoodFacts Terms of Service.
const USER_AGENT = 'NOVA-Extension/1.0 (open-source food classification tool)';

// Cache key prefix (short to save storage space).
const CACHE_PREFIX = 'off_';

// Cache TTL: 7 days in milliseconds.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

    console.log(`[NOVA Cache] Hit for ${barcode}`);
    return cached;
  } catch (err) {
    console.warn('[NOVA Cache] Read error:', err.message);
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
    console.log(`[NOVA Cache] Stored ${barcode}`);
  } catch (err) {
    console.warn('[NOVA Cache] Write error:', err.message);
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
  const url = `${API_BASE_URL}/${barcode}.json`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      // 404 is expected for unknown barcodes — not an error
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return parseApiResponse(data);
  } catch (err) {
    console.warn(`[NOVA API] Fetch error for ${barcode}:`, err.message);
    return null; // Network/parse error → trigger fallback in content script
  }
}

// ---------------------------------------------------------------------------
// Ingredient analysis (stateless OFF v3 endpoint)
// ---------------------------------------------------------------------------

/**
 * Sends ingredient text to the OpenFoodFacts v3 stateless analysis endpoint
 * and returns the NOVA group. Uses chrome.storage.local cache keyed by productId.
 *
 * @param {string} ingredientsText - Raw ingredient string scraped from the page
 * @param {string|null} productId  - Tesco product ID used as cache key
 * @returns {Promise<number|null>}  NOVA score 1–4, or null on failure
 */
async function analyzeIngredients(ingredientsText, productId) {
  // Cache check (skip if no productId)
  if (productId) {
    const cached = await getCached('ingredients_' + productId);
    if (cached) return { novaScore: cached.novaScore, markers: cached.markers || [] };
  }

  const url = 'https://world.openfoodfacts.org/api/v3/product/test';
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
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

    const data = await response.json();
    const novaScore = data.status === 'success' ? (data.product?.nova_group || null) : null;
    const markers = extractNovaMarkers(data.product?.nova_groups_markers, novaScore);

    // Cache successful result
    if (novaScore && productId) {
      await setCached('ingredients_' + productId, { novaScore, markers, productName: '' });
    }

    console.log(`[NOVA API] Ingredient analysis → NOVA ${novaScore}, markers: ${markers.join(', ') || 'none'}`);
    return { novaScore, markers };
  } catch (err) {
    console.warn('[NOVA API] Ingredient analysis error:', err.message);
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
 *   { source: 'cache'|'api', novaScore: number, productName: string }
 *   { source: 'not_found' }   — barcode not in OpenFoodFacts
 *   { source: 'no_nova' }     — product found but NOVA score unavailable
 *
 * @param {string} barcode
 * @returns {Promise<Object>}
 */
async function lookupProduct(barcode) {
  // 1. Cache hit
  const cached = await getCached(barcode);
  if (cached) {
    return { source: 'cache', novaScore: cached.novaScore, productName: cached.productName };
  }

  // 2. API lookup
  console.log(`[NOVA API] Querying OpenFoodFacts for barcode ${barcode}`);
  const product = await fetchProductByBarcode(barcode);

  if (!product) {
    console.log(`[NOVA API] Not found in OpenFoodFacts: ${barcode}`);
    return { source: 'not_found' };
  }

  const novaScore = extractNovaScore(product);
  if (!novaScore) {
    console.log(`[NOVA API] Product found but no NOVA data: ${barcode}`);
    return { source: 'no_nova' };
  }

  // 3. Cache successful result and return
  const productName = product.product_name || '';
  await setCached(barcode, { novaScore, productName });

  console.log(`[NOVA API] NOVA ${novaScore} (${productName}) from OpenFoodFacts for ${barcode}`);
  return { source: 'api', novaScore, productName };
}

// ---------------------------------------------------------------------------
// Extension lifecycle
// ---------------------------------------------------------------------------

browser.runtime.onInstalled.addListener((details) => {
  console.log('[NOVA Background] Extension installed/updated:', details.reason);
  if (details.reason === 'install') {
    console.log('[NOVA Background] First-time installation');
  }
});

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[NOVA Background] Message received:', message.type, 'from', sender.tab?.url);

  if (message.type === 'FETCH_PRODUCT') {
    const { barcode } = message;
    if (!barcode) {
      sendResponse({ success: false, error: 'No barcode provided' });
      return false;
    }

    lookupProduct(barcode)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => {
        console.error('[NOVA Background] Unexpected error:', err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keeps the message channel open for the async response
  }

  if (message.type === 'ANALYZE_INGREDIENTS') {
    const { ingredientsText, productId } = message;
    if (!ingredientsText) {
      sendResponse({ success: false, error: 'No ingredientsText provided' });
      return false;
    }

    analyzeIngredients(ingredientsText, productId || null)
      .then(result => sendResponse({
        success: true,
        novaScore: result?.novaScore ?? null,
        markers: result?.markers ?? [],
      }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true; // Keeps the message channel open for the async response
  }

  if (message.type === 'CLEAR_CACHE') {
    // browser.storage.local.get/remove return Promises — use async IIFE
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
});

console.log('[NOVA Background] Service worker ready (Phase 10)');
