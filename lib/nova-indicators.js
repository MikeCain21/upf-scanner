/**
 * NOVA 4 Indicator Database
 *
 * Scans an array of ingredient tokens (output of parseIngredients) and returns
 * any NOVA 4 ultra-processed indicators found — as a list of codes/labels and
 * a count for downstream classification.
 *
 * This is the rule-based fallback layer. Phase 6 (OpenFoodFacts API) will
 * override this result for the ~90% of products that are in the database.
 * This file has no DOM or browser dependencies — it is pure logic and is
 * tested with Jest (npm test).
 *
 * Indicator sources:
 *   - E-numbers: Monteiro et al. 2019 functional categories (colours,
 *     preservatives, synthetic antioxidants, emulsifiers, flavour enhancers,
 *     artificial sweeteners). See ADR-010 for exclusion rationale.
 *   - Additive names: CLASSIFICATION_LOGIC.md curated list.
 *
 * @version 0.4.0
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // E-number Set
  //
  // Source: Monteiro et al. 2019 ("Ultra-processed foods: what they are and
  // how to identify them", Public Health Nutrition) — functional categories.
  // OpenFoodFacts has no published E-number list for NOVA 4; they use
  // ingredient taxonomy matching. This set is our approximation for the
  // rule-based fallback only.
  //
  // Notation: E + digits + optional lowercase suffix (standard EU format).
  // Exclusions are noted inline. When in doubt, we include (bias toward
  // detecting NOVA 4 — false positives preferable to false negatives for a
  // health warning tool).
  // ---------------------------------------------------------------------------

  const NOVA4_E_NUMBERS = new Set([
    // E1xx — synthetic colours
    // Excluded: E100 (curcumin, natural), E101 (riboflavin, natural),
    //           E160a (beta-carotene, natural), E161b (lutein, natural),
    //           E162 (beetroot red, natural), E163 (anthocyanins, natural),
    //           E170 (calcium carbonate, mineral additive)
    'E102', 'E104', 'E110', 'E120', 'E122', 'E124', 'E127', 'E128', 'E129',
    'E131', 'E132', 'E133', 'E142', 'E150c', 'E150d', 'E151', 'E155',
    'E160b', 'E171',

    // E2xx — preservatives (synthetic; benzoates, sulphites, nitrites, nitrates)
    // Excluded: E200 (sorbic acid, found in nature), E270 (lactic acid, natural
    //           fermentation product)
    'E202', 'E203',
    'E210', 'E211', 'E212', 'E213',
    'E220', 'E221', 'E222', 'E223', 'E224', 'E226', 'E228',
    'E249', 'E250', 'E251', 'E252',

    // E3xx — synthetic antioxidants
    // Excluded: E300 (ascorbic acid = vitamin C), E306-E309 (tocopherols,
    //           natural), E330 (citric acid, widely natural)
    'E320', 'E321',

    // E4xx — emulsifiers, stabilisers, thickeners (synthetic/industrially
    // processed)
    // Excluded: E400-E406 (alginates, natural seaweed), E410 (locust bean
    //           gum, natural), E440 (pectins, natural), E460 (cellulose,
    //           natural)
    'E407', 'E412', 'E415', 'E433', 'E435', 'E436',
    'E466',
    'E471', 'E472a', 'E472b', 'E472c', 'E472d', 'E472e',
    'E473', 'E474', 'E475', 'E476', 'E477', 'E481', 'E482', 'E491',

    // E6xx — flavour enhancers (all indicate ultra-processing)
    'E620', 'E621', 'E622', 'E623', 'E624', 'E625', 'E627', 'E631', 'E635',

    // E9xx — artificial sweeteners (all indicate ultra-processing)
    'E950', 'E951', 'E952', 'E954', 'E955', 'E957', 'E959', 'E961',
    'E962', 'E965', 'E966', 'E967',
  ]);

  // ---------------------------------------------------------------------------
  // Additive name patterns
  //
  // Regex patterns for ultra-processed ingredients that may not appear as
  // E-numbers on the label (e.g. modified starches are rarely labelled E1442).
  // ---------------------------------------------------------------------------

  const NOVA4_ADDITIVE_PATTERNS = [
    // "Modified X Starch" — must require the word "modified" to avoid flagging
    // plain starches (corn starch, tapioca starch) which are NOVA 2.
    { pattern: /modified\s+\w+\s+starch/i,         label: 'modified starch'            },
    // Hydrolyzed proteins — handles both US (hydrolyzed) and UK (hydrolysed)
    { pattern: /hydroly[sz]ed?\s+\w+\s+protein/i,  label: 'hydrolyzed protein'         },
    // Protein isolates — highly refined proteins
    { pattern: /\w+\s+protein\s+isolate/i,          label: 'protein isolate'            },
    // Maltodextrin — highly processed carbohydrate used as filler/thickener
    { pattern: /maltodextrin/i,                     label: 'maltodextrin'               },
    // Industrial sweeteners
    { pattern: /high[\s-]fructose\s+corn\s+syrup/i, label: 'high-fructose corn syrup'   },
    { pattern: /glucose[\s-]fructose\s+syrup/i,     label: 'glucose-fructose syrup'     },
    { pattern: /invert\s+sug|invert\s+syr/i,        label: 'invert sugar/syrup'         },
    // Industrial fats
    { pattern: /partially\s+hydrogenated/i,         label: 'partially hydrogenated fat' },
    { pattern: /interesterified/i,                  label: 'interesterified fat'        },
    // Processing terms that indicate industrial reformulation
    { pattern: /mechanically\s+separated/i,         label: 'mechanically separated'     },
    { pattern: /\breconstituted\b/i,                label: 'reconstituted'              },
  ];

  // ---------------------------------------------------------------------------
  // E-number helpers
  // ---------------------------------------------------------------------------

  // Extracts all E-number codes from a single token string.
  // e.g. "Colour (Caramel E150d)" → ['E150d']
  // e.g. "Emulsifiers: E471, E472e" → ['E471', 'E472e']
  // The \b word-boundary prevents matching E-codes inside words.
  const E_NUMBER_REGEX = /\bE\d{3}[a-z]?\b/gi;

  /**
   * Normalises an E-number code to standard EU notation:
   * uppercase E + digits + lowercase letter suffix (if present).
   *
   * Examples: 'e621' → 'E621', 'E150D' → 'E150d', 'E472E' → 'E472e'
   *
   * This is needed because extractENumbers uses a case-insensitive regex and
   * the NOVA4_E_NUMBERS Set stores entries in standard EU notation.
   *
   * @param {string} code - Raw E-number code from regex match
   * @returns {string} Normalised E-number
   */
  function normalizeENumber(code) {
    const upper = code.toUpperCase();
    const lastChar = upper[upper.length - 1];
    // If last character is a letter (A-Z), lowercase it (standard EU suffix)
    if (lastChar >= 'A' && lastChar <= 'Z') {
      return upper.slice(0, -1) + lastChar.toLowerCase();
    }
    return upper;
  }

  /**
   * Extracts all E-number codes from a token string, normalised.
   *
   * @param {string} token - Ingredient token
   * @returns {string[]} Array of normalised E-number codes
   */
  function extractENumbers(token) {
    const matches = token.match(E_NUMBER_REGEX) || [];
    return matches.map(normalizeENumber);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Scans an array of ingredient tokens for NOVA 4 ultra-processed indicators.
   *
   * Each token is checked for:
   *   1. Embedded E-number codes (e.g. "Colour (Caramel E150d)" → E150d)
   *   2. Additive name patterns (e.g. "Modified Maize Starch", "Maltodextrin")
   *
   * Duplicate indicators are deduplicated via a Set. The returned indicators
   * list is suitable for tooltip display (Phase 7).
   *
   * @param {string[]|null} ingredients - Token array from parseIngredients()
   * @returns {{ indicators: string[], count: number }}
   *   indicators: list of matched indicator labels/codes
   *   count: number of unique indicators found
   */
  function detectIndicators(ingredients) {
    if (!ingredients || ingredients.length === 0) {
      return { indicators: [], count: 0 };
    }

    const found = new Set();

    for (const token of ingredients) {
      // Check for E-number codes embedded anywhere in the token
      const eCodes = extractENumbers(token);
      for (const code of eCodes) {
        if (NOVA4_E_NUMBERS.has(code)) {
          found.add(code);
        }
      }

      // Check additive name patterns
      for (const { pattern, label } of NOVA4_ADDITIVE_PATTERNS) {
        if (pattern.test(token)) {
          found.add(label);
        }
      }
    }

    const indicators = [...found];
    return { indicators, count: indicators.length };
  }

  // ---------------------------------------------------------------------------
  // Registration (dual-environment: browser extension + Node.js/Jest)
  // ---------------------------------------------------------------------------

  // Chrome extension environment (browser): attach to shared namespace.
  if (typeof window !== 'undefined') {
    window.__novaExt = window.__novaExt || {};
    window.__novaExt.detectIndicators = detectIndicators;
  }

  // Node.js / CommonJS environment (Jest, require()): export the public API.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectIndicators };
  }
})();
