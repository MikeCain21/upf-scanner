'use strict';

/**
 * Jest unit tests for lib/nova-indicators.js
 *
 * Tests detectIndicators(ingredients) which takes a string[] (token array from
 * parseIngredients) and returns { indicators: string[], count: number }.
 *
 * Run with:  npm test
 *            npm run test:verbose   (shows individual test names)
 *            npm run test:watch     (re-runs on file save)
 */

const { detectIndicators } = require('../lib/nova-indicators');

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('returns empty result for empty array', () => {
    expect(detectIndicators([])).toEqual({ indicators: [], count: 0 });
  });

  it('returns empty result for null', () => {
    expect(detectIndicators(null)).toEqual({ indicators: [], count: 0 });
  });
});

// ---------------------------------------------------------------------------
// E-number detection
// ---------------------------------------------------------------------------

describe('E-number detection', () => {
  it('detects E621 (MSG) as a standalone token', () => {
    const { indicators } = detectIndicators(['E621']);
    expect(indicators).toContain('E621');
  });

  it('detects E150d embedded inside a token', () => {
    const { indicators } = detectIndicators(['Colour (Caramel E150d)']);
    expect(indicators).toContain('E150d');
  });

  it('detects E471 after a colon label', () => {
    const { indicators } = detectIndicators(['Emulsifiers: E471']);
    expect(indicators).toContain('E471');
  });

  it('detects E320 (BHA, synthetic antioxidant)', () => {
    const { indicators } = detectIndicators(['E320']);
    expect(indicators).toContain('E320');
  });

  it('detects E951 (Aspartame, artificial sweetener)', () => {
    const { indicators } = detectIndicators(['E951']);
    expect(indicators).toContain('E951');
  });

  it('does NOT flag plain salt (no E-number)', () => {
    const { count } = detectIndicators(['Salt']);
    expect(count).toBe(0);
  });

  it('does NOT flag E100 (curcumin — natural colour, not in set)', () => {
    const { count } = detectIndicators(['E100']);
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Modified starch — must distinguish from plain starch
// ---------------------------------------------------------------------------

describe('Modified starch — must distinguish from plain starch', () => {
  it('flags Modified Maize Starch', () => {
    const { count } = detectIndicators(['Modified Maize Starch']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Modified Corn Starch', () => {
    const { count } = detectIndicators(['Modified Corn Starch']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Modified Tapioca Starch', () => {
    const { count } = detectIndicators(['Modified Tapioca Starch']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag plain Maize Starch', () => {
    const { count } = detectIndicators(['Maize Starch']);
    expect(count).toBe(0);
  });

  it('does NOT flag plain Corn Starch', () => {
    const { count } = detectIndicators(['Corn Starch']);
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Additive name detection
// ---------------------------------------------------------------------------

describe('Additive name detection', () => {
  it('flags Maltodextrin', () => {
    const { count } = detectIndicators(['Maltodextrin']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Hydrolyzed Soy Protein (US spelling)', () => {
    const { count } = detectIndicators(['Hydrolyzed Soy Protein']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Hydrolysed Vegetable Protein (UK spelling)', () => {
    const { count } = detectIndicators(['Hydrolysed Vegetable Protein']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Soy Protein Isolate', () => {
    const { count } = detectIndicators(['Soy Protein Isolate']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Invert Sugar Syrup', () => {
    const { count } = detectIndicators(['Invert Sugar Syrup']);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Real product fixtures — from Tesco test pages
// ---------------------------------------------------------------------------

describe('Real product fixtures', () => {
  // Apple — NOVA 1, single ingredient
  it('Apple (NOVA 1) → count === 0', () => {
    const { count } = detectIndicators(['Apple']);
    expect(count).toBe(0);
  });

  // Coke — 5 tokens from parseIngredients test fixture
  it('Coke → count ≥ 1 (has E150d)', () => {
    const cokeTokens = [
      'Carbonated Water',
      'Sugar',
      'Colour (Caramel E150d)',
      'Acid (Phosphoric Acid)',
      'Natural Flavourings Including Caffeine',
    ];
    const { count } = detectIndicators(cokeTokens);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // Bread — 14 tokens from parseIngredients test fixture
  it('Bread → count ≥ 2 (has E471, E472e)', () => {
    const breadTokens = [
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
    const { count } = detectIndicators(breadTokens);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // HotDogs — 16-token realistic UK product fixture
  // Uses E471, E472e (stabilisers), E250 (preservative), and mechanically separated
  it('HotDogs → count ≥ 3 (E471, E472e, E250, mechanically separated)', () => {
    const hotdogsTokens = [
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
    const { count } = detectIndicators(hotdogsTokens);
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Verification tests (Phase 4 checklist)
// ---------------------------------------------------------------------------

describe('Phase 4 verification checklist', () => {
  it('multiple ultra-processed ingredients → count ≥ 3', () => {
    const { count } = detectIndicators(['Water', 'Modified Maize Starch', 'E621', 'Maltodextrin']);
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it('tomatoes and salt → count === 0', () => {
    const { count } = detectIndicators(['Tomatoes', 'Salt']);
    expect(count).toBe(0);
  });

  it('simple home baking ingredients → count === 0', () => {
    const { count } = detectIndicators(['Flour', 'Sugar', 'Butter', 'Salt']);
    expect(count).toBe(0);
  });

  it('plain Maize Starch → count === 0 (not modified)', () => {
    const { count } = detectIndicators(['Maize Starch']);
    expect(count).toBe(0);
  });

  it('Modified Maize Starch → count ≥ 1', () => {
    const { count } = detectIndicators(['Modified Maize Starch']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('E100 → count === 0 (natural colour, not in NOVA 4 set)', () => {
    const { count } = detectIndicators(['E100']);
    expect(count).toBe(0);
  });
});
