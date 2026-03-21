'use strict';

/**
 * Jest unit tests for content/sites/ocado.js
 *
 * Tests cover: isSupported, isMainProduct, detectProducts, extractProductInfo,
 * extractBarcode (always null), and extractIngredients (BOP API + DOM fallback).
 *
 * OcadoAdapter fetches the BOP API for ingredients — global.fetch is mocked
 * per test to avoid real HTTP calls. The DOM fallback path (h2 sibling) is
 * also tested for when the API is unavailable.
 *
 * Run with: npm test
 *           npx jest test/ocado
 */

// ---------------------------------------------------------------------------
// Bootstrap — make BaseAdapter available as a global so ocado.js can extend it
// ---------------------------------------------------------------------------

const { BaseAdapter } = require('../../content/sites/base-adapter');
global.BaseAdapter = BaseAdapter;

const { OcadoAdapter } = require('../../content/sites/ocado');

// ---------------------------------------------------------------------------
// Helpers — build minimal fake documents for testing
// ---------------------------------------------------------------------------

/**
 * Returns a minimal fake Document with a querySelector that returns a single H1.
 *
 * @param {string} [text]
 * @returns {{ querySelector: Function, querySelectorAll: Function }}
 */
function fakeDocWithH1(text = 'Organic Whole Milk') {
  const h1 = { tagName: 'H1', textContent: text };
  return {
    querySelector: (sel) => sel === 'h1' ? h1 : null,
    querySelectorAll: () => [],
  };
}

/**
 * Returns a minimal fake Document with no H1.
 *
 * @returns {{ querySelector: Function, querySelectorAll: Function }}
 */
function fakeDocEmpty() {
  return {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

/**
 * Builds a fake Document that has an <h2>Ingredients</h2> + sibling — used
 * to exercise the DOM fallback path when the BOP API is unavailable.
 *
 * @param {string|null} ingredientText - Sibling textContent, or null for missing sibling
 * @returns {{ querySelector: Function, querySelectorAll: Function }}
 */
function fakeDocWithIngredientsH2(ingredientText) {
  const sibling = ingredientText != null ? { textContent: ingredientText } : null;
  const h2 = { tagName: 'H2', textContent: 'Ingredients', nextElementSibling: sibling };
  const h1 = { tagName: 'H1', textContent: 'Some Product' };
  return {
    querySelector: (sel) => sel === 'h1' ? h1 : null,
    querySelectorAll: (sel) => sel === 'h2' ? [h2] : [],
  };
}

/**
 * Builds a mock fetch that returns a BOP API response with the given ingredient text.
 *
 * @param {string} ingredientText
 * @returns {Function}
 */
function mockFetchBop(ingredientText) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      bopData: {
        fields: [{ title: 'ingredients', content: ingredientText }],
      },
    }),
  });
}

/**
 * Builds a mock fetch that simulates a BOP API failure (network error).
 *
 * @returns {Function}
 */
function mockFetchBopFailure() {
  return jest.fn().mockRejectedValue(new Error('Network error'));
}

/**
 * Builds a mock fetch that returns a BOP API response with no ingredients field.
 *
 * @returns {Function}
 */
function mockFetchBopNoIngredients() {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ bopData: { fields: [{ title: 'nutritional_information', content: '...' }] } }),
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let adapter;

beforeEach(() => {
  adapter = new OcadoAdapter();
  global.window = {
    location: {
      href: 'https://www.ocado.com/products/organic-whole-milk/12345678',
      pathname: '/products/organic-whole-milk/12345678',
    },
  };
});

afterEach(() => {
  delete global.window;
  delete global.fetch;
});

// ---------------------------------------------------------------------------
// isSupported
// ---------------------------------------------------------------------------

describe('isSupported', () => {
  it('returns true for an Ocado PDP URL', () => {
    expect(adapter.isSupported('https://www.ocado.com/products/organic-whole-milk/12345678')).toBe(true);
  });

  it('returns false for an Ocado homepage URL', () => {
    expect(adapter.isSupported('https://www.ocado.com/')).toBe(false);
  });

  it('returns false for an Ocado category URL', () => {
    expect(adapter.isSupported('https://www.ocado.com/browse/dairy-eggs-and-chilled/milk')).toBe(false);
  });

  it('returns false for a Tesco URL', () => {
    expect(adapter.isSupported('https://www.tesco.com/groceries/en-GB/products/123456')).toBe(false);
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
    expect(adapter.isMainProduct({ tagName: 'H1' })).toBe(true);
  });

  it('returns false for a DIV element', () => {
    expect(adapter.isMainProduct({ tagName: 'DIV' })).toBe(false);
  });

  it('returns false for a SPAN element', () => {
    expect(adapter.isMainProduct({ tagName: 'SPAN' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectProducts
// ---------------------------------------------------------------------------

describe('detectProducts', () => {
  it('returns the H1 element on a PDP', () => {
    const doc = fakeDocWithH1('Organic Whole Milk');
    const results = adapter.detectProducts(doc);
    expect(results).toHaveLength(1);
    expect(results[0].tagName).toBe('H1');
  });

  it('returns empty array when no H1 is present', () => {
    expect(adapter.detectProducts(fakeDocEmpty())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractProductInfo
// ---------------------------------------------------------------------------

describe('extractProductInfo', () => {
  it('extracts name from H1 textContent', () => {
    const info = adapter.extractProductInfo({ tagName: 'H1', textContent: 'Organic Whole Milk' });
    expect(info.name).toBe('Organic Whole Milk');
  });

  it('extracts productId from window.location.pathname', () => {
    const info = adapter.extractProductInfo({ tagName: 'H1', textContent: 'Organic Whole Milk' });
    expect(info.productId).toBe('12345678');
  });

  it('extracts url from window.location.href', () => {
    const info = adapter.extractProductInfo({ tagName: 'H1', textContent: 'Organic Whole Milk' });
    expect(info.url).toBe('https://www.ocado.com/products/organic-whole-milk/12345678');
  });

  it('returns null productId for non-PDP pathname', () => {
    global.window.location.pathname = '/browse/dairy';
    const info = adapter.extractProductInfo({ tagName: 'H1', textContent: 'Dairy' });
    expect(info.productId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractBarcode
// ---------------------------------------------------------------------------

describe('extractBarcode', () => {
  it('always returns null — no EAN-13 available on Ocado', () => {
    expect(adapter.extractBarcode(fakeDocWithH1())).toBeNull();
  });

  it('returns null even when called with a rich fake doc', () => {
    expect(adapter.extractBarcode(fakeDocWithIngredientsH2('Milk, Salt'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractIngredients
// ---------------------------------------------------------------------------

describe('extractIngredients', () => {
  describe('BOP API (primary path)', () => {
    it('returns ingredient text from BOP API when available', async () => {
      global.fetch = mockFetchBop('Skimmed Milk, Sugar, Strawberry Flavouring');
      const result = await adapter.extractIngredients(fakeDocEmpty());
      expect(result).toBe('Skimmed Milk, Sugar, Strawberry Flavouring');
    });

    it('calls the BOP API with the correct retailerProductId', async () => {
      global.fetch = mockFetchBop('Milk');
      await adapter.extractIngredients(fakeDocEmpty());
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('retailerProductId=12345678')
      );
    });
  });

  describe('DOM fallback (when BOP API fails)', () => {
    it('falls back to DOM h2+sibling when BOP API throws', async () => {
      global.fetch = mockFetchBopFailure();
      const doc = fakeDocWithIngredientsH2('Whole Milk, Cream');
      const result = await adapter.extractIngredients(doc);
      expect(result).toBe('Whole Milk, Cream');
    });

    it('falls back to DOM when BOP API has no ingredients field', async () => {
      global.fetch = mockFetchBopNoIngredients();
      const doc = fakeDocWithIngredientsH2('Sunflower Oil');
      const result = await adapter.extractIngredients(doc);
      expect(result).toBe('Sunflower Oil');
    });

    it('returns null when DOM has no Ingredients h2', async () => {
      global.fetch = mockFetchBopFailure();
      const result = await adapter.extractIngredients(fakeDocEmpty());
      expect(result).toBeNull();
    });

    it('returns null when Ingredients h2 has no nextElementSibling', async () => {
      global.fetch = mockFetchBopFailure();
      const doc = fakeDocWithIngredientsH2(null);
      const result = await adapter.extractIngredients(doc);
      expect(result).toBeNull();
    });
  });

  describe('No productId (BOP skipped entirely)', () => {
    it('skips BOP API and uses DOM when pathname has no numeric ID', async () => {
      global.window.location.pathname = '/browse/dairy';
      global.fetch = jest.fn();
      const doc = fakeDocWithIngredientsH2('Oat Milk');
      const result = await adapter.extractIngredients(doc);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toBe('Oat Milk');
    });

    it('returns null when pathname has no ID and DOM has no Ingredients h2', async () => {
      global.window.location.pathname = '/browse/dairy';
      global.fetch = jest.fn();
      const result = await adapter.extractIngredients(fakeDocEmpty());
      expect(result).toBeNull();
    });
  });
});
