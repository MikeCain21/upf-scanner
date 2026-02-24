/**
 * OpenFoodFacts API Response Parser
 *
 * Pure functions for extracting NOVA data from OpenFoodFacts API responses.
 * No fetch, no chrome.* APIs — jest-testable with no mocking required.
 *
 * These functions are also inlined in background/service-worker.js because
 * service workers cannot require() CommonJS modules from lib/.
 *
 * @version 0.6.0
 */

(function () {
  'use strict';

  /**
   * Extracts the NOVA score (1–4) from an OpenFoodFacts product object.
   *
   * Tries `nova_group` first (direct integer field), then falls back to
   * `nova_groups_tags` (array of strings like "en:4-ultra-processed-...").
   * Returns null if neither field yields a valid 1–4 score.
   *
   * @param {Object|null} product - product object from API response
   * @returns {number|null} NOVA score 1–4, or null if not available
   */
  function extractNovaScore(product) {
    if (!product) return null;

    // Primary field: nova_group (sometimes returned as a string by the API)
    const direct = parseInt(product.nova_group, 10);
    if (!isNaN(direct) && direct >= 1 && direct <= 4) {
      return direct;
    }

    // Fallback: parse score from tags, e.g. "en:4-ultra-processed-food-and-drink-products"
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
   * Returns null if the response indicates "product not found" (status: 0),
   * is malformed (missing status field), or has no product object.
   *
   * @param {Object|null} data - parsed JSON from the API endpoint
   * @returns {Object|null} product object, or null
   */
  function parseApiResponse(data) {
    if (!data || data.status !== 1) return null;
    return data.product || null;
  }

  // ---------------------------------------------------------------------------
  // Registration (dual-environment)
  // ---------------------------------------------------------------------------

  if (typeof window !== 'undefined') {
    window.__novaExt = window.__novaExt || {};
    window.__novaExt.extractNovaScore = extractNovaScore;
    window.__novaExt.parseApiResponse = parseApiResponse;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractNovaScore, parseApiResponse };
  }
})();
