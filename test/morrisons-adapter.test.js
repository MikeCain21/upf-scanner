'use strict';

/**
 * Jest unit tests for content/sites/morrisons.js
 *
 * Tests cover: isSupported, isMainProduct, detectProducts, extractProductInfo,
 * extractBarcode (always null), and extractIngredients (bop-view DOM strategy).
 *
 * MorrisonsAdapter uses only data-test attributes and semantic HTML — no
 * obfuscated CSS class names. Tests build fake documents that mirror the
 * relevant DOM structure without requiring real HTML.
 *
 * Run with: npm test
 *           npx jest test/morrisons
 */

// ---------------------------------------------------------------------------
// Bootstrap — make BaseAdapter available as a global so morrisons.js can extend it
// ---------------------------------------------------------------------------

const { BaseAdapter } = require('../content/sites/base-adapter');
global.BaseAdapter = BaseAdapter;

const { MorrisonsAdapter } = require('../content/sites/morrisons');

// ---------------------------------------------------------------------------
// Helpers — build minimal fake documents for testing
// ---------------------------------------------------------------------------

/**
 * Returns a minimal fake Document that supports querySelector / querySelectorAll.
 * Accepts a map of selector → element for querySelector.
 *
 * @param {{ [selector: string]: object|null }} map
 * @returns {{ querySelector: Function, querySelectorAll: Function }}
 */
function fakeDoc(map = {}) {
  return {
    querySelector: (sel) => map[sel] ?? null,
    querySelectorAll: (sel) => {
      const val = map[sel];
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    },
  };
}

/**
 * Builds a fake Document that simulates [data-test="bop-view"] containing
 * an <h2>Ingredients</h2> followed by a sibling with the given ingredient text.
 *
 * @param {string|null} ingredientText - Text for the sibling element, or null for
 *   "no sibling" (simulate products without ingredients section).
 * @returns {{ querySelector: Function, querySelectorAll: Function }}
 */
function fakeDocWithBopView(ingredientText) {
  const sibling = ingredientText != null
    ? { textContent: ingredientText }
    : null;

  const ingredientsH2 = {
    tagName: 'H2',
    textContent: 'Ingredients',
    nextElementSibling: sibling,
  };

  const bopView = {
    querySelectorAll: (sel) => sel === 'h2' ? [ingredientsH2] : [],
  };

  return {
    querySelector: (sel) => sel === '[data-test="bop-view"]' ? bopView : null,
    querySelectorAll: () => [],
  };
}

/**
 * Builds a fake Document that has a [data-test="bop-view"] but NO <h2>Ingredients</h2>.
 * Models products (bananas, oil) that have no ingredients section.
 *
 * @returns {{ querySelector: Function, querySelectorAll: Function }}
 */
function fakeDocWithBopViewNoIngredients() {
  const bopView = {
    querySelectorAll: () => [],
  };
  return {
    querySelector: (sel) => sel === '[data-test="bop-view"]' ? bopView : null,
    querySelectorAll: () => [],
  };
}

/**
 * Returns a fake H1 element.
 *
 * @param {string} [text]
 */
function fakeH1(text = 'Frubes Kids Strawberry Yoghurt Tubes') {
  return { tagName: 'H1', textContent: text };
}

/**
 * Returns a fake tile wrapper element with link + title.
 *
 * @param {string} [href]
 * @param {string} [title]
 */
function fakeTile(
  href = 'https://groceries.morrisons.com/products/morrisons-cheddar/110212590',
  title = 'Morrisons Cheddar'
) {
  const link = { href };
  const titleEl = { textContent: title };
  return {
    tagName: 'DIV',
    querySelector: (sel) => {
      if (sel === '[data-test="fop-product-link"]') return link;
      if (sel === '[data-test="fop-title"]') return titleEl;
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let adapter;

beforeEach(() => {
  adapter = new MorrisonsAdapter();
  global.window = {
    location: {
      href: 'https://groceries.morrisons.com/products/frubes-kids-yoghurt-tubes/110212590',
      pathname: '/products/frubes-kids-yoghurt-tubes/110212590',
    },
  };
});

afterEach(() => {
  delete global.window;
});

// ---------------------------------------------------------------------------
// isSupported
// ---------------------------------------------------------------------------

describe('isSupported', () => {
  it('returns true for a Morrisons PDP URL', () => {
    expect(adapter.isSupported(
      'https://groceries.morrisons.com/products/frubes-kids-yoghurt-tubes/110212590'
    )).toBe(true);
  });

  it('returns false for a Morrisons homepage URL', () => {
    expect(adapter.isSupported('https://groceries.morrisons.com/')).toBe(false);
  });

  it('returns false for a Morrisons category URL', () => {
    expect(adapter.isSupported(
      'https://groceries.morrisons.com/browse/fresh-food-and-chilled/yoghurts'
    )).toBe(false);
  });

  it('returns false for a Tesco URL', () => {
    expect(adapter.isSupported(
      'https://www.tesco.com/groceries/en-GB/products/123456'
    )).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(adapter.isSupported('')).toBe(false);
  });

  it('returns false for a non-string value', () => {
    expect(adapter.isSupported(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMainProduct
// ---------------------------------------------------------------------------

describe('isMainProduct', () => {
  it('returns true for H1 element', () => {
    expect(adapter.isMainProduct(fakeH1())).toBe(true);
  });

  it('returns false for a DIV element', () => {
    expect(adapter.isMainProduct({ tagName: 'DIV' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectProducts
// ---------------------------------------------------------------------------

describe('detectProducts', () => {
  it('returns the H1 on a PDP with no tiles', () => {
    const h1 = fakeH1();
    const doc = fakeDoc({ h1 });
    const results = adapter.detectProducts(doc);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(h1);
  });

  it('returns H1 plus tiles when both are present', () => {
    const h1 = fakeH1();
    const tile1 = fakeTile();
    const tile2 = fakeTile(
      'https://groceries.morrisons.com/products/morrisons-cornflakes/113997003',
      'Morrisons Cornflakes'
    );
    const doc = {
      querySelector: (sel) => sel === 'h1' ? h1 : null,
      querySelectorAll: (sel) =>
        sel === '[data-test^="fop-wrapper:"]' ? [tile1, tile2] : [],
    };
    const results = adapter.detectProducts(doc);
    expect(results).toHaveLength(3);
    expect(results[0]).toBe(h1);
    expect(results[1]).toBe(tile1);
    expect(results[2]).toBe(tile2);
  });

  it('returns empty array when neither H1 nor tiles are present', () => {
    const doc = { querySelector: () => null, querySelectorAll: () => [] };
    expect(adapter.detectProducts(doc)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractProductInfo
// ---------------------------------------------------------------------------

describe('extractProductInfo', () => {
  it('extracts name from H1 textContent', () => {
    const info = adapter.extractProductInfo(fakeH1('Frubes Kids Strawberry Yoghurt Tubes'));
    expect(info.name).toBe('Frubes Kids Strawberry Yoghurt Tubes');
  });

  it('extracts productId from window.location.pathname for H1', () => {
    const info = adapter.extractProductInfo(fakeH1());
    expect(info.productId).toBe('110212590');
  });

  it('extracts url from window.location.href for H1', () => {
    const info = adapter.extractProductInfo(fakeH1());
    expect(info.url).toBe(
      'https://groceries.morrisons.com/products/frubes-kids-yoghurt-tubes/110212590'
    );
  });

  it('extracts name, url, and productId from a tile element', () => {
    const tile = fakeTile(
      'https://groceries.morrisons.com/products/morrisons-cheddar/103261043',
      'Cathedral City Mature Cheddar'
    );
    const info = adapter.extractProductInfo(tile);
    expect(info.name).toBe('Cathedral City Mature Cheddar');
    expect(info.url).toBe('https://groceries.morrisons.com/products/morrisons-cheddar/103261043');
    expect(info.productId).toBe('103261043');
  });

  it('returns empty productId for tile href with non-standard URL', () => {
    const tile = fakeTile('https://groceries.morrisons.com/browse/deals', 'Weekly Offers');
    const info = adapter.extractProductInfo(tile);
    expect(info.productId).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractBarcode
// ---------------------------------------------------------------------------

describe('extractBarcode', () => {
  it('always returns null — no EAN-13 available on Morrisons', () => {
    expect(adapter.extractBarcode(fakeDoc())).toBeNull();
  });

  it('returns null even when called with a rich fake doc', () => {
    expect(adapter.extractBarcode(fakeDocWithBopView('Skimmed Milk, Sugar'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractIngredients
// ---------------------------------------------------------------------------

describe('extractIngredients', () => {
  it('returns ingredient text when h2+sibling found inside bop-view', () => {
    const doc = fakeDocWithBopView('Skimmed Milk, Sugar, Strawberry Puree (6%), Thickener (Starch)');
    expect(adapter.extractIngredients(doc)).toBe(
      'Skimmed Milk, Sugar, Strawberry Puree (6%), Thickener (Starch)'
    );
  });

  it('returns null when bop-view is absent', () => {
    const doc = fakeDoc();
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('returns null when bop-view has no Ingredients h2', () => {
    const doc = fakeDocWithBopViewNoIngredients();
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('returns null when Ingredients h2 has no nextElementSibling (no ingredients section)', () => {
    const doc = fakeDocWithBopView(null);
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('returns null when sibling element contains only whitespace', () => {
    const doc = fakeDocWithBopView('   ');
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('is case-insensitive: matches "INGREDIENTS" heading', () => {
    const sibling = { textContent: 'Milk, Salt' };
    const h2 = { tagName: 'H2', textContent: 'INGREDIENTS', nextElementSibling: sibling };
    const bopView = { querySelectorAll: (sel) => sel === 'h2' ? [h2] : [] };
    const doc = {
      querySelector: (sel) => sel === '[data-test="bop-view"]' ? bopView : null,
      querySelectorAll: () => [],
    };
    expect(adapter.extractIngredients(doc)).toBe('Milk, Salt');
  });

  it('trims leading and trailing whitespace from extracted text', () => {
    const doc = fakeDocWithBopView('  Milk, Salt  ');
    expect(adapter.extractIngredients(doc)).toBe('Milk, Salt');
  });
});
