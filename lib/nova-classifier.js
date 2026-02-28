/**
 * NOVA Classifier
 *
 * Rule-based classifier that assigns a NOVA score (1–4) to a product based
 * on its ingredient token array. Uses detectIndicators() from nova-indicators.js
 * to detect ultra-processed signals, then applies threshold rules.
 *
 * This is the rule-based fallback for products not found in OpenFoodFacts.
 * Phase 6 (API lookup) will override these results for ~90% of products.
 * No DOM or browser dependencies — pure logic, tested with Jest.
 *
 * @version 0.5.0
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Dependency resolution (dual-environment)
  //
  // In Node.js (Jest): require sibling module directly.
  // In browser (Chrome extension): read from window.__novaExt (loaded by
  // manifest in order: nova-indicators.js → nova-classifier.js → main.js).
  // ---------------------------------------------------------------------------

  const detectIndicators = (typeof module !== 'undefined' && module.exports)
    ? require('./nova-indicators').detectIndicators
    : window.__novaExt.detectIndicators;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  // Minimum number of NOVA 4 indicators for high-confidence classification.
  const NOVA4_MULTI_INDICATOR_THRESHOLD = 2;

  // Confidence levels per classification path.
  const CONFIDENCE = {
    NOVA4_MULTI:  0.9,  // ≥2 NOVA 4 indicators
    NOVA4_SINGLE: 0.7,  // exactly 1 NOVA 4 indicator
    NOVA3:        0.6,  // culinary additions, no ultra-processed indicators
    NOVA12:       0.5,  // minimal or few ingredients (low certainty)
  };

  // Regex for tokens that contain added culinary ingredients.
  // These transform a minimally processed food into NOVA 3.
  // Matches whole words only (\b) to avoid partial matches.
  // Covers singular and plural (oil/oils, salt/salts, sugar/sugars, syrup/syrups).
  const NOVA3_CULINARY_RE = /\b(salts?|sugars?|oils?|butter|honey|vinegar|syrups?)\b/i;

  // Minimum ingredient count required to classify as NOVA 3 rather than NOVA 1.
  // A single token that is itself a culinary ingredient (e.g. ['Sugar']) is
  // classified as NOVA 2 rather than NOVA 3 (see Rule 3b).
  const NOVA3_MIN_INGREDIENT_COUNT = 2;

  // Regex for explicit food-processing markers — signals NOVA 3 regardless of culinary additions.
  // These ingredients appear in cheeses, cured meats, smoked fish, fermented foods, pickles, etc.
  const NOVA3_PROCESSING_RE = /\b(cheese\s+cultures?|rennet|cured|curing|smoked|smoking|fermented|fermentation|brined?|pickled|lacto-fermented)\b/i;

  // Reason string for NOVA 2 single culinary ingredient classification.
  const NOVA2_CULINARY = 'Processed culinary ingredient (oil, fat, salt, or sugar)';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns true if any ingredient token contains an added culinary ingredient
   * (salt, sugar, oil, butter, honey, vinegar, or syrup).
   *
   * @param {string[]} ingredients - Token array
   * @returns {boolean}
   */
  function hasAddedCulinaryIngredient(ingredients) {
    return ingredients.some(token => NOVA3_CULINARY_RE.test(token));
  }

  /**
   * Returns true if any ingredient token contains an explicit food-processing marker
   * (cheese cultures, rennet, smoked, cured, fermented, brined, pickled, lacto-fermented).
   * Used to classify cheeses, cured meats, smoked fish, and fermented foods as NOVA 3.
   *
   * @param {string[]} ingredients - Token array
   * @returns {boolean}
   */
  function hasProcessingMarkers(ingredients) {
    return ingredients.some(token => NOVA3_PROCESSING_RE.test(token));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Classifies a product into NOVA groups 1–4 based on its ingredient tokens.
   *
   * Classification rules (applied in order):
   *   1.  NOVA 4: ≥2 ultra-processed indicators (high confidence)
   *   2.  NOVA 4: exactly 1 ultra-processed indicator (medium confidence)
   *   2a. NOVA 3: explicit processing markers (cheese cultures, rennet, smoked, cured,
   *               fermented, brined, pickled, lacto-fermented) — regardless of token count
   *   3.  NOVA 3: has added culinary ingredient (salt/sugar/oil/…) + ≥2 tokens
   *   3b. NOVA 2: single culinary ingredient product (≤3 tokens) — e.g. sunflower oil, sugar
   *   4.  NOVA 1: ≤3 ingredients, no indicators, no culinary additions
   *   5.  NOVA 2: default (few ingredients, minimal processing)
   *
   * @param {string[]|null} ingredients - Token array from parseIngredients()
   * @returns {{ score: number, reason: string, indicators: string[], confidence: number }|null}
   *   null if ingredients is null or empty
   */
  function classifyByIngredients(ingredients) {
    if (!ingredients || ingredients.length === 0) return null;

    const { indicators, count } = detectIndicators(ingredients);

    // Rule 1: Multiple ultra-processed indicators → NOVA 4, high confidence
    if (count >= NOVA4_MULTI_INDICATOR_THRESHOLD) {
      return {
        score: 4,
        reason: `Local analysis: ${count} ultra-processed indicator${count !== 1 ? 's' : ''} found`,
        indicators,
        confidence: CONFIDENCE.NOVA4_MULTI,
      };
    }

    // Rule 2: Single ultra-processed indicator → NOVA 4, medium confidence
    if (count === 1) {
      return {
        score: 4,
        reason: 'Local analysis: 1 ultra-processed indicator found',
        indicators,
        confidence: CONFIDENCE.NOVA4_SINGLE,
      };
    }

    // Rule 2a: Explicit processing markers (cheese cultures, rennet, smoked, cured,
    // fermented, etc.) → NOVA 3. Runs before culinary check so that a product like
    // Cheddar (milk, salt, cheese cultures, rennet) is never misclassified as NOVA 1.
    if (hasProcessingMarkers(ingredients)) {
      return {
        score: 3,
        reason: 'Processed food with explicit processing markers (fermented, cured, smoked, etc.)',
        indicators: [],
        confidence: CONFIDENCE.NOVA3,
      };
    }

    // Rule 3: Added culinary ingredient with a food base → NOVA 3
    if (hasAddedCulinaryIngredient(ingredients) && ingredients.length >= NOVA3_MIN_INGREDIENT_COUNT) {
      return {
        score: 3,
        reason: 'Processed food with added culinary ingredients (salt, sugar, or oil)',
        indicators: [],
        confidence: CONFIDENCE.NOVA3,
      };
    }

    // Rule 3b: Single culinary ingredient product → NOVA 2.
    // A product that IS a culinary ingredient (sunflower oil, sugar, salt) is NOVA 2,
    // not NOVA 1. Rule 3 requires ≥2 tokens so it doesn't catch single-ingredient cases.
    if (ingredients.length <= 3 && hasAddedCulinaryIngredient(ingredients)) {
      return {
        score: 2,
        reason: NOVA2_CULINARY,
        indicators: [],
        confidence: CONFIDENCE.NOVA12,
      };
    }

    // Rule 4: Few ingredients, no processing signals → NOVA 1
    if (ingredients.length <= 3) {
      return {
        score: 1,
        reason: 'Minimal ingredients, likely unprocessed or minimally processed',
        indicators: [],
        confidence: CONFIDENCE.NOVA12,
      };
    }

    // Rule 5: Default — more ingredients but no clear processing signals → NOVA 2
    return {
      score: 2,
      reason: 'Few ingredients with minimal processing',
      indicators: [],
      confidence: CONFIDENCE.NOVA12,
    };
  }

  // ---------------------------------------------------------------------------
  // Registration (dual-environment)
  // ---------------------------------------------------------------------------

  // Chrome extension environment (browser): attach to shared namespace.
  if (typeof window !== 'undefined') {
    window.__novaExt = window.__novaExt || {};
    window.__novaExt.classifyByIngredients = classifyByIngredients;
  }

  // Node.js / CommonJS environment (Jest, require()): export the public API.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { classifyByIngredients };
  }
})();
