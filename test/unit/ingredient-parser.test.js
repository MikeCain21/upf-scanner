'use strict';

/**
 * Jest unit tests for lib/ingredient-parser.js
 *
 * Fixtures are the actual ingredient strings extracted from the 5 Tesco test
 * pages during Phase 3 verification — not synthetic data.
 *
 * Run with:  npm test
 *            npm run test:verbose   (shows individual test names)
 *            npm run test:watch     (re-runs on file save)
 */

const { parseIngredients } = require('../../lib/ingredient-parser');

// ---------------------------------------------------------------------------
// Edge cases — null / empty input
// ---------------------------------------------------------------------------

describe('Edge cases — empty / null input', () => {
  it('returns null for null input', () => {
    expect(parseIngredients(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseIngredients('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseIngredients('   ')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Real product fixtures — from the 5 Tesco test pages
// ---------------------------------------------------------------------------

describe('Apples — NOVA 1, single ingredient', () => {
  const result = parseIngredients('Apple');

  it('returns an array', () => {
    expect(Array.isArray(result)).toBe(true);
  });

  it('produces exactly 1 token', () => {
    expect(result).toHaveLength(1);
  });

  it('contains "Apple"', () => {
    expect(result).toContain('Apple');
  });
});

describe('Coke — round parentheses must not be split', () => {
  const input = 'Carbonated Water, Sugar, Colour (Caramel E150d), Acid (Phosphoric Acid), Natural Flavourings Including Caffeine';
  const result = parseIngredients(input);

  it('returns an array', () => {
    expect(Array.isArray(result)).toBe(true);
  });

  it('produces exactly 5 tokens', () => {
    expect(result).toHaveLength(5);
  });

  it('keeps "Colour (Caramel E150d)" as a single token', () => {
    expect(result).toContain('Colour (Caramel E150d)');
  });

  it('keeps "Acid (Phosphoric Acid)" as a single token', () => {
    expect(result).toContain('Acid (Phosphoric Acid)');
  });
});

describe('Yoghurt — percentages and nested parentheses', () => {
  const input = 'Yogurt (Milk), Sugar 6.1%, Modified Manioc and Maize Starch, Calcium Citrate, Natural Flavourings (Milk), Stabiliser: Guar Gum, Acidity Regulator: (Citric Acid), Vitamin D';
  const result = parseIngredients(input);

  it('returns an array', () => {
    expect(Array.isArray(result)).toBe(true);
  });

  it('produces exactly 8 tokens', () => {
    expect(result).toHaveLength(8);
  });

  it('keeps "Yogurt (Milk)" as a single token', () => {
    expect(result).toContain('Yogurt (Milk)');
  });

  it('preserves the percentage in "Sugar 6.1%"', () => {
    expect(result).toContain('Sugar 6.1%');
  });

  it('keeps "Natural Flavourings (Milk)" as a single token', () => {
    expect(result).toContain('Natural Flavourings (Milk)');
  });
});

describe('Bread — square brackets must not be split', () => {
  const input = 'Wheat Flour [with Calcium, Iron, Niacin (B3) and Thiamin (B1)], Wholemeal Wheat Flour, Water, Yeast, Vegetable Oils (Rapeseed and Sustainable Palm), Salt, Wheat Gluten, Malted Barley Flour, Emulsifiers: E471, E472e, Soya Flour, Preservative: Calcium Propionate, Flavouring (Vegan), Flour Treatment Agent: Ascorbic Acid (Vitamin C)';
  const result = parseIngredients(input);

  it('returns an array', () => {
    expect(Array.isArray(result)).toBe(true);
  });

  it('produces exactly 14 tokens', () => {
    expect(result).toHaveLength(14);
  });

  it('keeps the entire square-bracket group as one token', () => {
    expect(result).toContain('Wheat Flour [with Calcium, Iron, Niacin (B3) and Thiamin (B1)]');
  });
});

describe('HotDogs — colon sub-groups, percentages, and nested parentheses', () => {
  const input = 'Hotdogs: 65% Mechanically Separated Chicken, Water, Starch, Chicken Collagen, Salt, Beef Collagen, Spices, Stabilisers (Triphosphates, Polyphosphates), Herbs, Thickener (Guar Gum), Spice Extracts, Smoke Flavour, Preservative (Sodium Nitrite), Brine: Water, Salt, Smoke Flavour';
  const result = parseIngredients(input);

  it('returns an array', () => {
    expect(Array.isArray(result)).toBe(true);
  });

  it('produces exactly 16 tokens', () => {
    expect(result).toHaveLength(16);
  });

  it('keeps "Hotdogs: 65% Mechanically Separated Chicken" as one token (colon + percentage)', () => {
    expect(result).toContain('Hotdogs: 65% Mechanically Separated Chicken');
  });

  it('keeps "Stabilisers (Triphosphates, Polyphosphates)" as one token', () => {
    expect(result).toContain('Stabilisers (Triphosphates, Polyphosphates)');
  });
});
