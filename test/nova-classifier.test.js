'use strict';

/**
 * Jest unit tests for lib/nova-classifier.js
 *
 * classifyByIngredients(ingredients) takes a string[] (token array from
 * parseIngredients) and returns:
 *   { score: 1-4, reason: string, indicators: string[], confidence: number }
 * or null for null/empty input.
 *
 * Run with:  npm test
 *            npm run test:verbose
 */

const { classifyByIngredients } = require('../lib/nova-classifier');

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases — null / empty input', () => {
  it('returns null for null', () => {
    expect(classifyByIngredients(null)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(classifyByIngredients([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

describe('Return shape', () => {
  it('always returns { score, reason, indicators, confidence }', () => {
    const result = classifyByIngredients(['Apple']);
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('indicators');
    expect(result).toHaveProperty('confidence');
  });

  it('indicators is always an array', () => {
    const result = classifyByIngredients(['Apple']);
    expect(Array.isArray(result.indicators)).toBe(true);
  });

  it('score is a number 1–4', () => {
    const result = classifyByIngredients(['Apple']);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// NOVA 4 classification
// ---------------------------------------------------------------------------

describe('NOVA 4 — multiple indicators (≥2)', () => {
  it('returns score 4 when ≥2 NOVA 4 indicators present', () => {
    const result = classifyByIngredients(['E621', 'Maltodextrin', 'Water']);
    expect(result.score).toBe(4);
  });

  it('returns confidence ≥ 0.9 for ≥2 indicators', () => {
    const result = classifyByIngredients(['E621', 'Maltodextrin', 'Water']);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('indicators list is non-empty and contains the found codes', () => {
    const result = classifyByIngredients(['E621', 'Maltodextrin', 'Water']);
    expect(result.indicators.length).toBeGreaterThanOrEqual(2);
  });
});

describe('NOVA 4 — single indicator', () => {
  it('returns score 4 when exactly 1 NOVA 4 indicator present', () => {
    const result = classifyByIngredients(['E621', 'Water', 'Salt']);
    expect(result.score).toBe(4);
  });

  it('returns confidence ≥ 0.7 and < 0.9 for 1 indicator', () => {
    const result = classifyByIngredients(['E621', 'Water', 'Salt']);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.confidence).toBeLessThan(0.9);
  });
});

// ---------------------------------------------------------------------------
// NOVA 3 classification
// ---------------------------------------------------------------------------

describe('NOVA 3 — processed food with culinary additions', () => {
  it('returns score 3 when salt present with ≥2 ingredients and no NOVA 4 indicators', () => {
    const result = classifyByIngredients(['Tomatoes', 'Salt', 'Citric Acid']);
    expect(result.score).toBe(3);
  });

  it('returns score 3 when sugar present with ≥2 ingredients', () => {
    const result = classifyByIngredients(['Fruit', 'Sugar', 'Water', 'Pectin']);
    expect(result.score).toBe(3);
  });

  it('returns score 3 for canned tomatoes (tomatoes + salt)', () => {
    const result = classifyByIngredients(['Tomatoes', 'Salt']);
    expect(result.score).toBe(3);
  });

  it('returns confidence 0.6 for NOVA 3', () => {
    const result = classifyByIngredients(['Tomatoes', 'Salt']);
    expect(result.confidence).toBe(0.6);
  });

  it('returns empty indicators array for NOVA 3', () => {
    const result = classifyByIngredients(['Tomatoes', 'Salt']);
    expect(result.indicators).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NOVA 1 classification
// ---------------------------------------------------------------------------

describe('NOVA 1 — unprocessed / minimally processed', () => {
  it('returns score 1 for single ingredient (apple)', () => {
    const result = classifyByIngredients(['Apple']);
    expect(result.score).toBe(1);
  });

  it('returns score 1 for two whole-food ingredients with no culinary additions', () => {
    const result = classifyByIngredients(['Milk', 'Live Yogurt Cultures']);
    expect(result.score).toBe(1);
  });

  it('returns score 1 for simple pasta (durum wheat, water)', () => {
    const result = classifyByIngredients(['Durum Wheat Semolina', 'Water']);
    expect(result.score).toBe(1);
  });

  it('returns confidence 0.5 for NOVA 1', () => {
    const result = classifyByIngredients(['Apple']);
    expect(result.confidence).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Real product fixtures
// ---------------------------------------------------------------------------

describe('Real product fixtures', () => {
  it('Coke (E150d) → NOVA 4', () => {
    const tokens = [
      'Carbonated Water',
      'Sugar',
      'Colour (Caramel E150d)',
      'Acid (Phosphoric Acid)',
      'Natural Flavourings Including Caffeine',
    ];
    expect(classifyByIngredients(tokens).score).toBe(4);
  });

  it('Bread (E471, E472e) → NOVA 4, high confidence', () => {
    const tokens = [
      'Wheat Flour [with Calcium, Iron, Niacin (B3) and Thiamin (B1)]',
      'Wholemeal Wheat Flour',
      'Water',
      'Yeast',
      'Vegetable Oils (Rapeseed and Sustainable Palm)',
      'Salt',
      'Wheat Gluten',
      'Malted Barley Flour',
      'Emulsifiers: E471',
      'E472e',
      'Soya Flour',
      'Preservative: Calcium Propionate',
      'Flavouring (Vegan)',
      'Flour Treatment Agent: Ascorbic Acid (Vitamin C)',
    ];
    const result = classifyByIngredients(tokens);
    expect(result.score).toBe(4);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('HotDogs (E471, E472e, E250, mechanically separated) → NOVA 4, high confidence', () => {
    const tokens = [
      'Hotdogs: 65% Mechanically Separated Chicken',
      'Water',
      'Starch',
      'Chicken Collagen',
      'Salt',
      'Beef Collagen',
      'Spices',
      'Stabilisers (E471, E472e)',
      'Herbs',
      'Thickener (Guar Gum)',
      'Spice Extracts',
      'Smoke Flavour',
      'Preservative (E250)',
      'Brine: Water',
      'Salt',
      'Smoke Flavour',
    ];
    const result = classifyByIngredients(tokens);
    expect(result.score).toBe(4);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('Apple → NOVA 1', () => {
    expect(classifyByIngredients(['Apple']).score).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 5 verification checklist
// ---------------------------------------------------------------------------

describe('Phase 5 verification checklist', () => {
  it('ready meal (modified starch + E621 + maltodextrin) → NOVA 4', () => {
    const result = classifyByIngredients(['Water', 'Modified Maize Starch', 'E621', 'Maltodextrin']);
    expect(result.score).toBe(4);
  });

  it('canned beans with salt → NOVA 3', () => {
    const result = classifyByIngredients(['Beans', 'Water', 'Salt']);
    expect(result.score).toBe(3);
  });

  it('plain yogurt (milk + cultures) → NOVA 1', () => {
    const result = classifyByIngredients(['Milk', 'Live Yogurt Cultures']);
    expect(result.score).toBe(1);
  });

  it('empty ingredient list → null', () => {
    expect(classifyByIngredients([])).toBeNull();
  });

  it('reason is a non-empty string', () => {
    const result = classifyByIngredients(['E621', 'Water']);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('confidence is between 0 and 1 (inclusive)', () => {
    const result = classifyByIngredients(['E621', 'Water']);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
