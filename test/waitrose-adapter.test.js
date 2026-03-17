'use strict';

/**
 * Jest unit tests for content/sites/waitrose.js
 *
 * Tests cover: isSupported, isMainProduct, detectProducts, extractProductInfo,
 * extractBarcode (__NEXT_DATA__ script tag + JSON-LD fallback), and
 * extractIngredients (__NEXT_DATA__ + DOM fallback).
 *
 * WaitroseAdapter reads from <script id="__NEXT_DATA__"> — the DOM script tag
 * that Next.js renders server-side. Content scripts run in an isolated world
 * and cannot access window.__NEXT_DATA__ (a page JS variable), but CAN read
 * DOM elements. Tests build fake docs with this script element.
 *
 * Run with: npm test
 *           npx jest test/waitrose
 */

// ---------------------------------------------------------------------------
// Bootstrap — make BaseAdapter available as a global so waitrose.js can extend it
// ---------------------------------------------------------------------------

const { BaseAdapter } = require('../content/sites/base-adapter');
global.BaseAdapter = BaseAdapter;

const { WaitroseAdapter } = require('../content/sites/waitrose');

// ---------------------------------------------------------------------------
// Helpers — build minimal fake documents for testing
// ---------------------------------------------------------------------------

/**
 * Returns a minimal fake Document that supports querySelector / querySelectorAll.
 * Accepts a map of selector → element for querySelector, plus an optional
 * array of JSON-LD script elements for the barcode fallback path.
 *
 * @param {{ [selector: string]: object|null }} map
 * @returns {{ querySelector: Function, querySelectorAll: Function }}
 */
function fakeDoc(map = {}) {
  return {
    querySelector: (sel) => map[sel] ?? null,
    querySelectorAll: (sel) => {
      const el = map[sel];
      return el ? [el] : [];
    },
  };
}

/**
 * Returns a fake Document with a <script id="__NEXT_DATA__"> element containing
 * the given product data, plus optional additional selector entries.
 *
 * @param {object} [product] - product object to serialise into __NEXT_DATA__
 * @param {{ [selector: string]: object }} [extra] - extra selector → element entries
 */
function fakeDocWithNextData(product = {}, extra = {}) {
  const scriptEl = {
    textContent: JSON.stringify({ props: { pageProps: { product } } }),
  };
  return fakeDoc({ 'script#__NEXT_DATA__': scriptEl, ...extra });
}

/**
 * Returns a fake Document with a JSON-LD script block (for barcode fallback).
 *
 * @param {string} jsonLdContent - raw JSON string for the ld+json script
 */
function fakeDocWithJsonLd(jsonLdContent) {
  const script = { textContent: jsonLdContent };
  return {
    querySelector: (sel) => {
      if (sel === 'script[type="application/ld+json"]') return script;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === 'script[type="application/ld+json"]') return [script];
      return [];
    },
  };
}

/**
 * Returns a fake H1 element with id="productName" and ownerDocument.
 * @param {string} [text]
 * @param {object} [ownerDoc] - fake ownerDocument (defaults to empty fakeDoc)
 */
function fakeProductH1(text = 'Fanta Orange Zero 2L', ownerDoc = null) {
  const el = { tagName: 'H1', id: 'productName', textContent: text };
  el.ownerDocument = ownerDoc ?? fakeDoc();
  return el;
}

// ---------------------------------------------------------------------------
// Setup / teardown — provide window.location for extractProductInfo
// ---------------------------------------------------------------------------

let adapter;

beforeEach(() => {
  adapter = new WaitroseAdapter();
  global.window = {
    location: { href: 'https://www.waitrose.com/ecom/products/fanta-orange/006393-2859-2860' },
  };
});

afterEach(() => {
  delete global.window;
});

// ---------------------------------------------------------------------------
// isSupported
// ---------------------------------------------------------------------------

describe('isSupported', () => {
  it('returns true for a Waitrose PDP URL', () => {
    expect(adapter.isSupported('https://www.waitrose.com/ecom/products/fanta/006393-2859-2860')).toBe(true);
  });

  it('returns true for a Waitrose category listing URL', () => {
    expect(adapter.isSupported('https://www.waitrose.com/ecom/groceries/fruit-veg')).toBe(true);
  });

  it('returns false for a Tesco URL', () => {
    expect(adapter.isSupported('https://www.tesco.com/groceries/en-GB/products/123456')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(adapter.isSupported('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMainProduct
// ---------------------------------------------------------------------------

describe('isMainProduct', () => {
  it('returns true for H1 with id="productName"', () => {
    expect(adapter.isMainProduct(fakeProductH1())).toBe(true);
  });

  it('returns false for H1 without id="productName"', () => {
    expect(adapter.isMainProduct({ tagName: 'H1', id: '', textContent: 'Other' })).toBe(false);
  });

  it('returns false for a non-H1 element with id="productName"', () => {
    expect(adapter.isMainProduct({ tagName: 'H2', id: 'productName', textContent: 'Bread' })).toBe(false);
  });

  it('returns false for a generic div', () => {
    expect(adapter.isMainProduct({ tagName: 'DIV', id: '', textContent: 'Product' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectProducts
// ---------------------------------------------------------------------------

describe('detectProducts', () => {
  it('returns the main product H1 on a PDP', () => {
    const h1 = fakeProductH1();
    const doc = fakeDoc({ 'h1#productName': h1 });
    const products = adapter.detectProducts(doc);
    expect(products).toHaveLength(1);
    expect(products[0]).toBe(h1);
  });

  it('returns empty array when no H1#productName present', () => {
    expect(adapter.detectProducts(fakeDoc())).toHaveLength(0);
  });

  it('returns empty array on a non-product page', () => {
    const doc = fakeDoc({ 'h1': { tagName: 'H1', id: '', textContent: 'Search Results' } });
    expect(adapter.detectProducts(doc)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractProductInfo
// ---------------------------------------------------------------------------

describe('extractProductInfo', () => {
  it('returns name from element textContent', () => {
    const info = adapter.extractProductInfo(fakeProductH1('Fanta Orange Zero 2L'));
    expect(info.name).toBe('Fanta Orange Zero 2L');
  });

  it('returns url from window.location.href', () => {
    const info = adapter.extractProductInfo(fakeProductH1());
    expect(info.url).toBe('https://www.waitrose.com/ecom/products/fanta-orange/006393-2859-2860');
  });

  it('returns productId from __NEXT_DATA__ lineNumber', () => {
    const doc = fakeDocWithNextData({ lineNumber: '006393' });
    const info = adapter.extractProductInfo(fakeProductH1('Fanta', doc));
    expect(info.productId).toBe('006393');
  });

  it('returns null productId when __NEXT_DATA__ script tag is absent', () => {
    const info = adapter.extractProductInfo(fakeProductH1('Fanta', fakeDoc()));
    expect(info.productId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractBarcode — __NEXT_DATA__ script tag path
// ---------------------------------------------------------------------------

describe('extractBarcode — __NEXT_DATA__ script tag', () => {
  it('extracts barcode from barCodes[0] in __NEXT_DATA__', () => {
    const doc = fakeDocWithNextData({ barCodes: ['5000168002931'] });
    expect(adapter.extractBarcode(doc)).toBe('5000168002931');
  });

  it('returns first barcode when multiple are present', () => {
    const doc = fakeDocWithNextData({ barCodes: ['5000168002931', '5000000000000'] });
    expect(adapter.extractBarcode(doc)).toBe('5000168002931');
  });

  it('falls back to JSON-LD when barCodes array is empty', () => {
    // Combine __NEXT_DATA__ (empty barCodes) with JSON-LD script
    const nextDataScript = {
      textContent: JSON.stringify({ props: { pageProps: { product: { barCodes: [] } } } }),
    };
    const jsonLdScript = {
      textContent: JSON.stringify({ '@graph': [{ '@type': 'Product', gtin13: '5000168002931' }] }),
    };
    const doc = {
      querySelector: (sel) => {
        if (sel === 'script#__NEXT_DATA__') return nextDataScript;
        if (sel === 'script[type="application/ld+json"]') return jsonLdScript;
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel === 'script[type="application/ld+json"]') return [jsonLdScript];
        return [];
      },
    };
    expect(adapter.extractBarcode(doc)).toBe('5000168002931');
  });

  it('falls back to JSON-LD when __NEXT_DATA__ product has no barCodes key', () => {
    const jsonLdScript = {
      textContent: JSON.stringify({ '@graph': [{ '@type': 'Product', gtin13: '5000168002931' }] }),
    };
    const doc = {
      querySelector: (sel) => {
        if (sel === 'script#__NEXT_DATA__') return {
          textContent: JSON.stringify({ props: { pageProps: { product: { name: 'Fanta' } } } }),
        };
        if (sel === 'script[type="application/ld+json"]') return jsonLdScript;
        return null;
      },
      querySelectorAll: (sel) => sel === 'script[type="application/ld+json"]' ? [jsonLdScript] : [],
    };
    expect(adapter.extractBarcode(doc)).toBe('5000168002931');
  });

  it('returns null when __NEXT_DATA__ absent and no JSON-LD', () => {
    expect(adapter.extractBarcode(fakeDoc())).toBeNull();
  });

  it('returns null gracefully when __NEXT_DATA__ JSON is malformed', () => {
    const doc = fakeDoc({ 'script#__NEXT_DATA__': { textContent: '{ not valid json' } });
    expect(adapter.extractBarcode(doc)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractBarcodes
// ---------------------------------------------------------------------------

describe('extractBarcodes', () => {
  it('returns full barCodes array from __NEXT_DATA__', () => {
    const doc = fakeDocWithNextData({ barCodes: ['3176575493930', '3329770062467'] });
    expect(adapter.extractBarcodes(doc)).toEqual(['3176575493930', '3329770062467']);
  });

  it('returns all 5 barcodes when product has 5 entries', () => {
    const barcodes = ['aaa', 'bbb', 'ccc', 'ddd', 'eee'];
    const doc = fakeDocWithNextData({ barCodes: barcodes });
    expect(adapter.extractBarcodes(doc)).toHaveLength(5);
  });

  it('falls back to JSON-LD when __NEXT_DATA__ barCodes absent', () => {
    const jsonLdScript = {
      textContent: JSON.stringify({ '@graph': [{ '@type': 'Product', gtin13: '5000168002931' }] }),
    };
    const doc = {
      querySelector: (sel) => sel === 'script[type="application/ld+json"]' ? jsonLdScript : null,
      querySelectorAll: (sel) => sel === 'script[type="application/ld+json"]' ? [jsonLdScript] : [],
    };
    expect(adapter.extractBarcodes(doc)).toEqual(['5000168002931']);
  });

  it('returns empty array when no barcode data available', () => {
    expect(adapter.extractBarcodes(fakeDoc())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractIngredients — __NEXT_DATA__ path
// ---------------------------------------------------------------------------

describe('extractIngredients — __NEXT_DATA__ script tag', () => {
  it('extracts ingredient text from __NEXT_DATA__ contents.ingredients', () => {
    const doc = fakeDocWithNextData({
      contents: { ingredients: 'Carbonated Water, Sugar, Citric Acid, Flavourings.' },
    });
    expect(adapter.extractIngredients(doc)).toBe(
      'Carbonated Water, Sugar, Citric Acid, Flavourings.'
    );
  });

  it('trims whitespace from __NEXT_DATA__ ingredient text', () => {
    const doc = fakeDocWithNextData({ contents: { ingredients: '  Water, Salt.  ' } });
    expect(adapter.extractIngredients(doc)).toBe('Water, Salt.');
  });

  it('returns null when __NEXT_DATA__ ingredient text is shorter than 10 chars', () => {
    const doc = fakeDocWithNextData({ contents: { ingredients: 'Vegan' } });
    expect(adapter.extractIngredients(doc)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractIngredients — DOM fallback path
// ---------------------------------------------------------------------------

describe('extractIngredients — DOM fallback', () => {
  it('extracts from #ingredients-region when __NEXT_DATA__ absent', () => {
    const el = { textContent: 'Water, Sugar, Citric Acid, Flavourings.' };
    const doc = fakeDoc({ '#ingredients-region': el });
    expect(adapter.extractIngredients(doc)).toBe('Water, Sugar, Citric Acid, Flavourings.');
  });

  it('returns null when #ingredients-region text is shorter than 10 chars', () => {
    const doc = fakeDoc({ '#ingredients-region': { textContent: 'Vegan' } });
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('returns null when neither __NEXT_DATA__ nor DOM element present', () => {
    expect(adapter.extractIngredients(fakeDoc())).toBeNull();
  });

  it('prefers __NEXT_DATA__ over DOM fallback when both present', () => {
    const doc = fakeDocWithNextData(
      { contents: { ingredients: 'Carbonated Water, Citric Acid, Natural Flavourings.' } },
      { '#ingredients-region': { textContent: 'Water, Sugar.' } }
    );
    expect(adapter.extractIngredients(doc)).toBe(
      'Carbonated Water, Citric Acid, Natural Flavourings.'
    );
  });
});
