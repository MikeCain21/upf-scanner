'use strict';

/**
 * Jest unit tests for content/sites/asda.js
 *
 * Tests cover: isSupported, isMainProduct, detectProducts, extractProductInfo,
 * extractBarcode (__PRELOADED_STATE__ script tag), and extractIngredients
 * (c_BRANDBANK_JSON parsing).
 *
 * AsdaAdapter reads from <script id="mobify-data"> — an inline script tag
 * containing a plain JSON object with __PRELOADED_STATE__. Content scripts
 * run in an isolated world and cannot access window variables, but CAN
 * read DOM elements. Tests build fake docs with this script element.
 *
 * Run with: npm test
 *           npx jest test/asda
 */

// ---------------------------------------------------------------------------
// Bootstrap — make BaseAdapter available as a global so asda.js can extend it
// ---------------------------------------------------------------------------

const { BaseAdapter } = require('../../content/sites/base-adapter');
global.BaseAdapter = BaseAdapter;

const { AsdaAdapter } = require('../../content/sites/asda');

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
      const el = map[sel];
      return el ? [el] : [];
    },
  };
}

/**
 * Returns a fake Document with a <script id="mobify-data"> element containing
 * the given initialProduct data under __PRELOADED_STATE__, plus optional extra
 * selector entries.
 *
 * @param {object} [initialProduct] - initialProduct object to embed in preloaded state
 * @param {{ [selector: string]: object }} [extra] - extra selector → element entries
 */
function fakeDocWithPreloadedState(initialProduct = {}, extra = {}) {
  const state = {
    __PRELOADED_STATE__: {
      pageProps: {
        pageData: {
          initialProduct,
        },
      },
    },
  };
  const scriptEl = {
    id: 'mobify-data',
    textContent: JSON.stringify(state),
  };
  return {
    querySelector: (sel) => {
      if (sel === 'script#mobify-data') return scriptEl;
      return extra[sel] ?? null;
    },
    querySelectorAll: (sel) => {
      if (sel === 'script:not([src])') return [scriptEl];
      const val = extra[sel];
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    },
  };
}

/**
 * Returns a fake H1 element with data-testid="txt-pdp-product-name" and ownerDocument.
 *
 * @param {string} [text]
 * @param {object} [ownerDoc] - fake ownerDocument (defaults to empty fakeDoc)
 */
function fakePdpH1(text = 'Coca-Cola Original Taste 1.75L', ownerDoc = null) {
  const el = {
    tagName: 'H1',
    textContent: text,
    getAttribute: (attr) => attr === 'data-testid' ? 'txt-pdp-product-name' : null,
    ownerDocument: ownerDoc ?? fakeDoc(),
  };
  return el;
}

// ---------------------------------------------------------------------------
// Setup / teardown — provide window.location for extractProductInfo
// ---------------------------------------------------------------------------

let adapter;

beforeEach(() => {
  adapter = new AsdaAdapter();
  global.window = {
    location: {
      href: 'https://www.asda.com/groceries/product/regular-cola/coca-cola-original-taste-1-75l/7387625',
      pathname: '/groceries/product/regular-cola/coca-cola-original-taste-1-75l/7387625',
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
  it('returns true for an ASDA PDP URL', () => {
    expect(adapter.isSupported('https://www.asda.com/groceries/product/regular-cola/coca-cola-original-taste-1-75l/7387625')).toBe(true);
  });

  it('returns false for an ASDA homepage URL', () => {
    expect(adapter.isSupported('https://www.asda.com/')).toBe(false);
  });

  it('returns false for an ASDA groceries category URL', () => {
    expect(adapter.isSupported('https://www.asda.com/groceries/fruit-veg')).toBe(false);
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
  it('returns true for H1 with data-testid="txt-pdp-product-name"', () => {
    expect(adapter.isMainProduct(fakePdpH1())).toBe(true);
  });

  it('returns false for H1 without the data-testid attribute', () => {
    const el = {
      tagName: 'H1',
      textContent: 'Some heading',
      getAttribute: () => null,
    };
    expect(adapter.isMainProduct(el)).toBe(false);
  });

  it('returns false for a non-H1 with the correct data-testid', () => {
    const el = {
      tagName: 'H2',
      textContent: 'Coca-Cola',
      getAttribute: (attr) => attr === 'data-testid' ? 'txt-pdp-product-name' : null,
    };
    expect(adapter.isMainProduct(el)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectProducts
// ---------------------------------------------------------------------------

describe('detectProducts', () => {
  it('returns the main product H1 on a PDP', () => {
    const h1 = fakePdpH1();
    const doc = fakeDoc({ 'h1[data-testid="txt-pdp-product-name"]': h1 });
    const products = adapter.detectProducts(doc);
    expect(products).toHaveLength(1);
    expect(products[0]).toBe(h1);
  });

  it('returns empty array when no PDP H1 is present', () => {
    expect(adapter.detectProducts(fakeDoc())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractProductInfo
// ---------------------------------------------------------------------------

describe('extractProductInfo', () => {
  it('returns name from element textContent', () => {
    const info = adapter.extractProductInfo(fakePdpH1('Coca-Cola Original Taste 1.75L'));
    expect(info.name).toBe('Coca-Cola Original Taste 1.75L');
  });

  it('returns url from window.location.href', () => {
    const info = adapter.extractProductInfo(fakePdpH1());
    expect(info.url).toBe('https://www.asda.com/groceries/product/regular-cola/coca-cola-original-taste-1-75l/7387625');
  });
});

// ---------------------------------------------------------------------------
// extractBarcode
// ---------------------------------------------------------------------------

describe('extractBarcode', () => {
  it('returns the EAN from c_EAN_GTIN in __PRELOADED_STATE__', () => {
    const doc = fakeDocWithPreloadedState({ c_EAN_GTIN: '5449000601971' });
    expect(adapter.extractBarcode(doc)).toBe('5449000601971');
  });

  it('trims whitespace from c_EAN_GTIN', () => {
    const doc = fakeDocWithPreloadedState({ c_EAN_GTIN: '  5449000601971  ' });
    expect(adapter.extractBarcode(doc)).toBe('5449000601971');
  });

  it('returns null when c_EAN_GTIN is absent', () => {
    const doc = fakeDocWithPreloadedState({ name: 'Organic Bananas' });
    expect(adapter.extractBarcode(doc)).toBeNull();
  });

  it('returns null when initialProduct is absent', () => {
    const doc = fakeDoc({ 'script#mobify-data': { textContent: JSON.stringify({ __PRELOADED_STATE__: {} }) } });
    expect(adapter.extractBarcode(doc)).toBeNull();
  });

  it('returns null gracefully when script JSON is malformed', () => {
    const doc = fakeDoc({ 'script#mobify-data': { textContent: '{ not valid json' } });
    expect(adapter.extractBarcode(doc)).toBeNull();
  });

  it('returns null when no preloaded state script is present', () => {
    expect(adapter.extractBarcode(fakeDoc())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractIngredients
// ---------------------------------------------------------------------------

describe('extractIngredients', () => {
  it('returns comma-joined ingredients from c_BRANDBANK_JSON', () => {
    const brandbank = { ingredients: ['Carbonated Water', 'Sugar', 'Colour (Caramel E150d)'] };
    const doc = fakeDocWithPreloadedState({
      c_BRANDBANK_JSON: JSON.stringify(brandbank),
    });
    expect(adapter.extractIngredients(doc)).toBe(
      'Carbonated Water, Sugar, Colour (Caramel E150d)'
    );
  });

  it('returns null when ingredients array is empty (fresh produce)', () => {
    const doc = fakeDocWithPreloadedState({
      c_BRANDBANK_JSON: JSON.stringify({ ingredients: [] }),
    });
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('returns null when c_BRANDBANK_JSON is absent (no ingredients data)', () => {
    const doc = fakeDocWithPreloadedState({ name: 'Organic Bananas' });
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('returns null gracefully when c_BRANDBANK_JSON is malformed', () => {
    const doc = fakeDocWithPreloadedState({ c_BRANDBANK_JSON: '{ not valid json' });
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('returns null when ingredients key is missing from brandbank object', () => {
    const doc = fakeDocWithPreloadedState({
      c_BRANDBANK_JSON: JSON.stringify({ nutritional_info: 'Energy 180kJ' }),
    });
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('returns null when c_BRANDBANK_JSON has ingredients as a non-array', () => {
    const doc = fakeDocWithPreloadedState({
      c_BRANDBANK_JSON: JSON.stringify({ ingredients: 'Water, Sugar' }),
    });
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('integration: returns both barcode and ingredients from same doc', () => {
    const brandbank = { ingredients: ['Skimmed Milk', 'Sugar', 'Modified Starch'] };
    const doc = fakeDocWithPreloadedState({
      c_EAN_GTIN: '3329770062467',
      c_BRANDBANK_JSON: JSON.stringify(brandbank),
    });
    expect(adapter.extractBarcode(doc)).toBe('3329770062467');
    expect(adapter.extractIngredients(doc)).toBe('Skimmed Milk, Sugar, Modified Starch');
  });

  it('prefers API cache c_BRANDBANK_JSON over script data', () => {
    adapter._productDataCache = {
      id: '9167536',
      data: { c_BRANDBANK_JSON: JSON.stringify({ ingredients: ['API Ingredient 1', 'API Ingredient 2'] }) },
    };
    const doc = fakeDocWithPreloadedState({
      c_BRANDBANK_JSON: JSON.stringify({ ingredients: ['Script Ingredient'] }),
    });
    expect(adapter.extractIngredients(doc)).toBe('API Ingredient 1, API Ingredient 2');
  });

  it('falls back to script c_BRANDBANK_JSON when cache has no c_BRANDBANK_JSON', () => {
    adapter._productDataCache = { id: '9167536', data: {} };
    const doc = fakeDocWithPreloadedState({
      c_BRANDBANK_JSON: JSON.stringify({ ingredients: ['Script Ingredient'] }),
    });
    expect(adapter.extractIngredients(doc)).toBe('Script Ingredient');
  });

  it('falls back to DOM when neither cache nor script has ingredient data', () => {
    const nextEl = { textContent: 'Water, Sugar, Flavouring' };
    const pEl = { textContent: 'Ingredients', nextElementSibling: nextEl };
    const doc = {
      querySelector: () => null,
      querySelectorAll: (sel) => sel === 'p' ? [pEl] : [],
    };
    expect(adapter.extractIngredients(doc)).toBe('Water, Sugar, Flavouring');
  });
});

// ---------------------------------------------------------------------------
// _computeEan13
// ---------------------------------------------------------------------------

describe('_computeEan13', () => {
  it('computes check digit for a valid 12-digit UPC', () => {
    // 500032802875 → check digit 0 → 5000328028750
    expect(adapter._computeEan13('500032802875')).toBe('5000328028750');
  });

  it('returns null for null input', () => {
    expect(adapter._computeEan13(null)).toBeNull();
  });

  it('returns null for input shorter than 12 digits', () => {
    expect(adapter._computeEan13('12345678901')).toBeNull();
  });

  it('returns null for input longer than 12 digits', () => {
    expect(adapter._computeEan13('1234567890123')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(adapter._computeEan13('50003280287x')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(adapter._computeEan13('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// _fetchProductData
// ---------------------------------------------------------------------------

describe('_fetchProductData', () => {
  beforeEach(() => {
    global.document = { cookie: 'SLAS.AUTH_TOKEN=tok123' };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.document;
    delete global.fetch;
  });

  it('returns parsed product JSON when API call succeeds', async () => {
    const productData = { id: '9167536', upc: '028400090018' };
    global.fetch.mockResolvedValue({ ok: true, json: async () => productData });
    const result = await adapter._fetchProductData('9167536');
    expect(result).toEqual(productData);
  });

  it('caches the result and avoids a second fetch for the same product ID', async () => {
    const productData = { id: '9167536', upc: '028400090018' };
    global.fetch.mockResolvedValue({ ok: true, json: async () => productData });
    await adapter._fetchProductData('9167536');
    await adapter._fetchProductData('9167536');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when SLAS.AUTH_TOKEN cookie is absent', async () => {
    global.document.cookie = 'other_cookie=value';
    const result = await adapter._fetchProductData('9167536');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null when API returns a non-ok response', async () => {
    global.fetch.mockResolvedValue({ ok: false });
    const result = await adapter._fetchProductData('9167536');
    expect(result).toBeNull();
  });

  it('returns null when fetch throws a network error', async () => {
    global.fetch.mockRejectedValue(new Error('network error'));
    const result = await adapter._fetchProductData('9167536');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractBarcodes (async, API-first)
// ---------------------------------------------------------------------------

describe('extractBarcodes', () => {
  beforeEach(() => {
    global.document = { cookie: 'SLAS.AUTH_TOKEN=tok123' };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.document;
    delete global.fetch;
  });

  it('returns [upc, ean13] from the ASDA API when available', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ upc: '500032802875' }) });
    const result = await adapter.extractBarcodes(fakeDoc());
    expect(result).toEqual(['500032802875', '5000328028750']);
  });

  it('falls back to script#mobify-data EAN when API returns no upc field', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ name: 'Some product' }) });
    const doc = fakeDocWithPreloadedState({ c_EAN_GTIN: '5449000601971' });
    const result = await adapter.extractBarcodes(doc);
    expect(result).toEqual(['5449000601971']);
  });

  it('falls back to script#mobify-data EAN when no auth token is present', async () => {
    global.document.cookie = '';
    const doc = fakeDocWithPreloadedState({ c_EAN_GTIN: '5449000601971' });
    const result = await adapter.extractBarcodes(doc);
    expect(result).toEqual(['5449000601971']);
  });

  it('returns empty array when API fails and script has no EAN', async () => {
    global.document.cookie = '';
    const result = await adapter.extractBarcodes(fakeDoc());
    expect(result).toEqual([]);
  });

  it('returns empty array when window is undefined', async () => {
    delete global.window;
    global.document.cookie = '';
    const result = await adapter.extractBarcodes(fakeDoc());
    expect(result).toEqual([]);
    // restore
    global.window = {
      location: {
        href: 'https://www.asda.com/groceries/product/regular-cola/coca-cola-original-taste-1-75l/7387625',
        pathname: '/groceries/product/regular-cola/coca-cola-original-taste-1-75l/7387625',
      },
    };
  });
});

// ---------------------------------------------------------------------------
// _extractIngredientsFromDom
// ---------------------------------------------------------------------------

describe('_extractIngredientsFromDom', () => {
  it('returns text from sibling element after <p>Ingredients</p>', () => {
    const nextEl = { textContent: 'Water, Sugar, Flavouring' };
    const pEl = { textContent: 'Ingredients', nextElementSibling: nextEl };
    const doc = { querySelectorAll: (sel) => sel === 'p' ? [pEl] : [] };
    expect(adapter._extractIngredientsFromDom(doc)).toBe('Water, Sugar, Flavouring');
  });

  it('returns null when no <p>Ingredients</p> is found', () => {
    const doc = {
      querySelectorAll: (sel) => sel === 'p'
        ? [{ textContent: 'Description', nextElementSibling: { textContent: 'text' } }]
        : [],
    };
    expect(adapter._extractIngredientsFromDom(doc)).toBeNull();
  });

  it('returns null when <p>Ingredients</p> has no nextElementSibling', () => {
    const pEl = { textContent: 'Ingredients', nextElementSibling: null };
    const doc = { querySelectorAll: (sel) => sel === 'p' ? [pEl] : [] };
    expect(adapter._extractIngredientsFromDom(doc)).toBeNull();
  });

  it('returns null when nextElementSibling has only whitespace', () => {
    const nextEl = { textContent: '   ' };
    const pEl = { textContent: 'Ingredients', nextElementSibling: nextEl };
    const doc = { querySelectorAll: (sel) => sel === 'p' ? [pEl] : [] };
    expect(adapter._extractIngredientsFromDom(doc)).toBeNull();
  });
});
