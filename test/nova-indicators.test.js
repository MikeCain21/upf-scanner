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
// Meat-substitute / plant-based indicators
// ---------------------------------------------------------------------------

describe('Meat-substitute / plant-based indicators', () => {
  it('flags Mycoprotein', () => {
    const { count } = detectIndicators(['Mycoprotein (41%)']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Natural Flavouring (UK spelling)', () => {
    const { count } = detectIndicators(['Natural Flavouring']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Natural Flavoring (US spelling)', () => {
    const { count } = detectIndicators(['Natural Flavoring']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Flavourings (plural)', () => {
    const { count } = detectIndicators(['Natural Flavourings Including Caffeine']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag plain Flavour (word only, no -ing suffix)', () => {
    // "Smoke Flavour" is ambiguous — we only flag explicit additive labelling
    const { count } = detectIndicators(['Smoke Flavour']);
    expect(count).toBe(0);
  });

  it('flags Textured Wheat Protein', () => {
    const { count } = detectIndicators(['Textured Wheat Protein (Wheat Flour, Stabiliser: Sodium Alginate)']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('flags Textured Soy Protein', () => {
    const { count } = detectIndicators(['Textured Soy Protein']);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // Regression: the Quorn sausage ingredient list that triggered the bug
  // Dairy-derived industrial ingredients — Monteiro NOVA 4 spec
  it('casein is a NOVA 4 indicator', () => {
    const { indicators } = detectIndicators(['casein']);
    expect(indicators.length).toBeGreaterThan(0);
  });

  it('lactose is a NOVA 4 indicator', () => {
    const { indicators } = detectIndicators(['lactose']);
    expect(indicators.length).toBeGreaterThan(0);
  });

  it('whey protein is a NOVA 4 indicator', () => {
    const { indicators } = detectIndicators(['whey protein concentrate']);
    expect(indicators.length).toBeGreaterThan(0);
  });

  it('Quorn mycoprotein sausages → count ≥ 3 (mycoprotein + flavouring + textured protein)', () => {
    const tokens = [
      'Mycoprotein (41%)',
      'Rehydrated Free Range Egg White',
      'Vegetable Oils (Rapeseed, Palm)',
      'Rusk [Wheat Flour (Wheat Flour, Calcium Carbonate, Iron, Niacin, Thiamine), Water, Yeast, Salt]',
      'Onion',
      'Natural Flavouring',
      'Casing (Calcium Alginate)',
      'Textured Wheat Protein (Wheat Flour, Stabiliser: Sodium Alginate)',
      'Firming Agents: Calcium Chloride',
      'Calcium Acetate',
      'Seasoning [Herbs (Sage, Parsley), Rapeseed Oil]',
      'Pea Fibre',
      'Roasted Barley Malt Extract',
      'Natural Caramelised Sugar',
    ];
    const { count, indicators } = detectIndicators(tokens);
    expect(count).toBeGreaterThanOrEqual(3);
    expect(indicators).toContain('mycoprotein');
    expect(indicators).toContain('flavouring');
    expect(indicators).toContain('textured protein');
  });
});

// ---------------------------------------------------------------------------
// detectIndicators — verification suite
// ---------------------------------------------------------------------------

describe('detectIndicators — E-number boundaries, modified starch, and safe ingredients', () => {
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

// ---------------------------------------------------------------------------
// OFF alignment additions — new indicators (ADR-012)
// ---------------------------------------------------------------------------

describe('OFF alignment — lecithin (E322)', () => {
  it('Soy Lecithin → count 1, indicator lecithin', () => {
    const { count, indicators } = detectIndicators(['Soy Lecithin']);
    expect(count).toBeGreaterThanOrEqual(1);
    expect(indicators).toContain('lecithin');
  });

  it('Sunflower Lecithin → flagged as lecithin', () => {
    const { indicators } = detectIndicators(['Sunflower Lecithin']);
    expect(indicators).toContain('lecithin');
  });

  it('E322 standalone → count 1, indicator E322', () => {
    const { count, indicators } = detectIndicators(['E322']);
    expect(count).toBe(1);
    expect(indicators).toContain('E322');
  });

  it('Emulsifier (E322) embedded → flagged', () => {
    const { indicators } = detectIndicators(['Emulsifier (E322)']);
    expect(indicators).toContain('E322');
  });

  it('plain Lecithin → flagged as lecithin', () => {
    const { indicators } = detectIndicators(['Lecithin']);
    expect(indicators).toContain('lecithin');
  });
});

describe('OFF alignment — phosphates (E450, E451, E452)', () => {
  it('E450 standalone → flagged', () => {
    const { indicators } = detectIndicators(['E450', 'Water']);
    expect(indicators).toContain('E450');
  });

  it('E451 standalone → flagged', () => {
    const { indicators } = detectIndicators(['E451']);
    expect(indicators).toContain('E451');
  });

  it('E452 standalone → flagged', () => {
    const { indicators } = detectIndicators(['E452']);
    expect(indicators).toContain('E452');
  });

  it('E442 (ammonium phosphatides) → flagged', () => {
    const { indicators } = detectIndicators(['E442']);
    expect(indicators).toContain('E442');
  });
});

describe('OFF alignment — modified starch E-number codes', () => {
  it('E1442 (hydroxypropyl distarch phosphate) → flagged', () => {
    const { indicators } = detectIndicators(['E1442']);
    expect(indicators).toContain('E1442');
  });

  it('Modified Starch (E1442) embedded → flagged', () => {
    const { indicators } = detectIndicators(['Modified Starch (E1442)']);
    expect(indicators).toContain('E1442');
  });

  it('E1404 → flagged', () => {
    const { indicators } = detectIndicators(['E1404']);
    expect(indicators).toContain('E1404');
  });
});

describe('OFF alignment — sweeteners and syrups', () => {
  it('Glucose Syrup → count 1, indicator glucose syrup', () => {
    const { count, indicators } = detectIndicators(['Glucose Syrup', 'Sugar']);
    expect(count).toBeGreaterThanOrEqual(1);
    expect(indicators).toContain('glucose syrup');
  });

  it('Corn Syrup Solids → flagged as corn syrup', () => {
    const { indicators } = detectIndicators(['Corn Syrup Solids']);
    expect(indicators).toContain('corn syrup');
  });

  it('Corn Syrup (without Solids) → flagged as corn syrup', () => {
    const { indicators } = detectIndicators(['Corn Syrup']);
    expect(indicators).toContain('corn syrup');
  });

  it('Dextrose → flagged', () => {
    const { indicators } = detectIndicators(['Dextrose', 'Maltodextrin']);
    expect(indicators).toContain('dextrose');
    expect(indicators).toContain('maltodextrin');
  });
});

describe('OFF alignment — hydrogenated fats', () => {
  it('Fully Hydrogenated Palm Oil → flagged as hydrogenated fat', () => {
    const { indicators } = detectIndicators(['Fully Hydrogenated Palm Oil']);
    expect(indicators).toContain('hydrogenated fat');
  });

  it('Full Hydrogenated Vegetable Fat → flagged', () => {
    const { indicators } = detectIndicators(['Full Hydrogenated Vegetable Fat']);
    expect(indicators).toContain('hydrogenated fat');
  });

  it('Partially Hydrogenated Soybean Oil → still flagged (regression)', () => {
    const { indicators } = detectIndicators(['Partially Hydrogenated Soybean Oil']);
    expect(indicators).toContain('partially hydrogenated fat');
  });
});

describe('OFF alignment — protein concentrate', () => {
  it('Pea Protein Concentrate → flagged as protein concentrate', () => {
    const { indicators } = detectIndicators(['Pea Protein Concentrate']);
    expect(indicators).toContain('protein concentrate');
  });

  it('Wheat Protein Concentrate → flagged', () => {
    const { indicators } = detectIndicators(['Wheat Protein Concentrate']);
    expect(indicators).toContain('protein concentrate');
  });
});

describe('OFF alignment — regression: safe ingredients must NOT trigger', () => {
  it('Corn Starch (plain) → count === 0', () => {
    const { count } = detectIndicators(['Corn Starch']);
    expect(count).toBe(0);
  });

  it('Sunflower Oil (plain) → count === 0', () => {
    const { count } = detectIndicators(['Sunflower Oil']);
    expect(count).toBe(0);
  });

  it('Rapeseed Oil (plain) → count === 0', () => {
    const { count } = detectIndicators(['Rapeseed Oil']);
    expect(count).toBe(0);
  });

  it('Egg White (plain) → count === 0', () => {
    const { count } = detectIndicators(['Egg White']);
    expect(count).toBe(0);
  });

  it('Corn Flour (plain) → count === 0', () => {
    const { count } = detectIndicators(['Corn Flour']);
    expect(count).toBe(0);
  });
});
