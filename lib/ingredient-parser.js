/**
 * Ingredient Parser
 *
 * Converts a raw ingredient string (scraped from a product page) into a clean
 * array of individual ingredient tokens for downstream NOVA classification.
 *
 * Key challenge: ingredient lists use commas as both top-level delimiters AND
 * within nested groups, e.g.:
 *   "Wheat Flour [with Calcium, Iron]"  ← comma inside brackets — do NOT split
 *   "Stabilisers (Triphosphates, Polyphosphates)"  ← comma inside parens — do NOT split
 *
 * The parser tracks bracket/parenthesis depth and only splits on commas or
 * semicolons that appear at depth 0.
 *
 * Registers itself on window.__novaExt.parseIngredients so content/main.js
 * can call it after the adapter extracts the raw text.
 *
 * @version 0.3.0
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Core parsing algorithm
  // ---------------------------------------------------------------------------

  /**
   * Splits a raw ingredient string at top-level commas and semicolons only.
   * Commas/semicolons inside parentheses () or square brackets [] are ignored,
   * preserving nested ingredient groups as single tokens.
   *
   * @param {string} text - Non-empty ingredient string to split
   * @returns {string[]} Array of trimmed ingredient tokens (never empty)
   */
  function splitAtTopLevelDelimiters(text) {
    const tokens = [];
    let depth = 0;
    let current = '';

    for (const char of text) {
      if (char === '(' || char === '[') {
        depth++;
        current += char;
      } else if (char === ')' || char === ']') {
        // Guard against malformed strings with unmatched closing brackets
        depth = Math.max(0, depth - 1);
        current += char;
      } else if ((char === ',' || char === ';') && depth === 0) {
        // Top-level delimiter — flush current token
        const token = current.trim();
        if (token) tokens.push(token);
        current = '';
      } else {
        current += char;
      }
    }

    // Flush the final token (no trailing delimiter)
    const last = current.trim();
    if (last) tokens.push(last);

    return tokens;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Parses a raw ingredient string into a cleaned array of ingredient tokens.
   *
   * Only splits at commas and semicolons that appear outside parentheses and
   * square brackets. Preserves:
   *   - Nested groups:  "Stabilisers (Triphosphates, Polyphosphates)" → 1 token
   *   - Square brackets: "Wheat Flour [with Calcium, Iron]" → 1 token
   *   - Percentages:   "Sugar 6.1%", "65% Mechanically Separated Chicken"
   *   - Sub-group labels: "Hotdogs:", "Emulsifiers:", "Brine:"
   *   - E-numbers:     "E471", "E472e", "E150d"
   *
   * Allergen bold markers (<strong> tags) are already stripped by the browser's
   * textContent property before this function is called.
   *
   * @param {string|null} rawText - Raw ingredient string from the page
   * @returns {string[]|null} Array of ingredient tokens, or null if input is
   *   empty or null (allows callers to distinguish "no data" from empty list)
   */
  function parseIngredients(rawText) {
    if (!rawText || rawText.trim().length === 0) return null;

    const tokens = splitAtTopLevelDelimiters(rawText);
    return tokens.length > 0 ? tokens : null;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  // Chrome extension environment (browser): attach to shared namespace.
  // content/main.js relies on this being available synchronously
  // (manifest load order: tesco.js → ingredient-parser.js → main.js).
  if (typeof window !== 'undefined') {
    window.__novaExt = window.__novaExt || {};
    window.__novaExt.parseIngredients = parseIngredients;
  }

  // Node.js / CommonJS environment (Jest, require()): export the public API.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseIngredients };
  }
})();
