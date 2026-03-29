/* global module */

/**
 * Pure validation helpers for message handler input sanitization.
 * Used by the background service worker to validate content script messages.
 */

'use strict';

/** Maximum number of characters accepted for ingredients text analysis. */
const MAX_INGREDIENTS_TEXT_LENGTH = 50_000;

/**
 * Returns true if n is a valid NOVA score (integer 1–4).
 * @param {*} n
 * @returns {boolean}
 */
function isValidNovaScore(n) {
  return Number.isInteger(n) && n >= 1 && n <= 4;
}

/**
 * Returns true if s is a valid 12- or 13-digit barcode string.
 * @param {*} s
 * @returns {boolean}
 */
function isValidBarcode(s) {
  return typeof s === 'string' && /^\d{12,13}$/.test(s);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isValidNovaScore, isValidBarcode, MAX_INGREDIENTS_TEXT_LENGTH };
}
