'use strict';

/**
 * Jest unit tests for content/sites/sainsburys.js
 *
 * Tests cover: isSupported, isMainProduct, detectProducts, extractProductInfo,
 * extractIngredients (accordion label matching + length guard), and
 * extractBarcodes (async GOL API fetch + EAN filtering + error paths).
 *
 * SainsburysAdapter.extractBarcodes is async — it fetches the Sainsbury's GOL
 * API at runtime. Tests mock global.fetch to avoid network calls.
 *
 * Run with: npm test
 *           npx jest test/sainsburys
 */

// ---------------------------------------------------------------------------
// Bootstrap — make BaseAdapter available as a global so sainsburys.js can extend it
// ---------------------------------------------------------------------------

const { BaseAdapter } = require('../content/sites/base-adapter');
global.BaseAdapter = BaseAdapter;

const { SainsburysAdapter } = require('../content/sites/sainsburys');

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
    querySelector:     (sel) => map[sel] ?? null,
    querySelectorAll:  (sel) => {
      const val = map[sel];
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    },
  };
}

/**
 * Builds a fake Document that contains a JSON-LD Product script with the given SKU.
 *
 * @param {string|null} sku - SKU to embed in JSON-LD, or null to omit
 * @param {{ [selector: string]: object }} [extra] - extra selector → element entries
 * @returns {{ querySelector: Function, querySelectorAll: Function }}
 */
function fakeDocWithSku(sku, extra = {}) {
  const scripts = sku
    ? [{ textContent: JSON.stringify({ '@type': 'Product', sku }) }]
    : [];
  const map = {
    'script[type="application/ld+json"]': scripts[0] ?? null,
    ...extra,
  };
  return {
    querySelector:    (sel) => map[sel] ?? null,
    querySelectorAll: (sel) => {
      if (sel === 'script[type="application/ld+json"]') return scripts;
      const val = map[sel];
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    },
  };
}

/**
 * Returns a fake H1 element with data-testid="pd-product-title".
 *
 * @param {string} [text]
 * @param {object} [ownerDoc] - fake ownerDocument (defaults to empty fakeDoc)
 */
function fakePdpH1(text = 'Petit Filous Frubes 9x40g', ownerDoc = null) {
  const el = {
    tagName: 'H1',
    getAttribute: (attr) => attr === 'data-testid' ? 'pd-product-title' : null,
    textContent: text,
  };
  el.ownerDocument = ownerDoc ?? fakeDoc();
  return el;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let adapter;

beforeEach(() => {
  adapter = new SainsburysAdapter();
  global.window = {
    location: { href: 'https://www.sainsburys.co.uk/gol-ui/product/petit-filous-frubes-9x40g' },
  };
  // Reset fetch mock before each test
  global.fetch = undefined;
});

afterEach(() => {
  delete global.window;
  delete global.fetch;
});

// ---------------------------------------------------------------------------
// isSupported
// ---------------------------------------------------------------------------

describe('isSupported', () => {
  it('returns true for a Sainsbury\'s PDP URL', () => {
    expect(adapter.isSupported('https://www.sainsburys.co.uk/gol-ui/product/petit-filous-frubes-9x40g')).toBe(true);
  });

  it('returns true for a Sainsbury\'s category URL', () => {
    expect(adapter.isSupported('https://www.sainsburys.co.uk/gol-ui/groceries/dairy-eggs-chilled/yogurt')).toBe(true);
  });

  it('returns false for a Tesco URL', () => {
    expect(adapter.isSupported('https://www.tesco.com/groceries/en-GB/products/302328940')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMainProduct
// ---------------------------------------------------------------------------

describe('isMainProduct', () => {
  it('returns true for H1 with data-testid="pd-product-title"', () => {
    expect(adapter.isMainProduct(fakePdpH1())).toBe(true);
  });

  it('returns false for H1 without data-testid attribute', () => {
    const el = { tagName: 'H1', getAttribute: () => null, textContent: 'Other' };
    expect(adapter.isMainProduct(el)).toBe(false);
  });

  it('returns false for non-H1 element with correct data-testid', () => {
    const el = { tagName: 'H2', getAttribute: (a) => a === 'data-testid' ? 'pd-product-title' : null, textContent: 'Sub' };
    expect(adapter.isMainProduct(el)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectProducts
// ---------------------------------------------------------------------------

describe('detectProducts', () => {
  it('returns the main product H1 on a PDP', () => {
    const h1 = fakePdpH1();
    const doc = fakeDoc({ 'h1[data-testid="pd-product-title"]': h1 });
    const products = adapter.detectProducts(doc);
    expect(products).toHaveLength(1);
    expect(products[0]).toBe(h1);
  });

  it('returns empty array when no matching H1 is present', () => {
    expect(adapter.detectProducts(fakeDoc())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractIngredients
// ---------------------------------------------------------------------------

describe('extractIngredients', () => {
  /**
   * Builds a fake document containing accordion items for Sainsbury's PDP.
   * @param {Array<{label: string, content: string}>} items
   */
  function fakeDocWithAccordions(items) {
    const accordionEls = items.map(({ label, content }) => ({
      querySelector: (sel) => {
        if (sel === '.ds-c-accordion-item__label--text') {
          return { textContent: label };
        }
        if (sel === '.ds-c-accordion-item__content') {
          return { textContent: content };
        }
        return null;
      },
    }));
    return {
      querySelector:    () => null,
      querySelectorAll: (sel) => sel === '.ds-c-accordion-item' ? accordionEls : [],
    };
  }

  it('returns ingredient text from the matching accordion panel', () => {
    const doc = fakeDocWithAccordions([
      { label: 'Nutritional Information', content: 'Calories: 100 kcal per 100g' },
      { label: 'Ingredients', content: 'Skimmed Milk, Sugar, Strawberry Purée, Starch.' },
    ]);
    expect(adapter.extractIngredients(doc)).toBe('Skimmed Milk, Sugar, Strawberry Purée, Starch.');
  });

  it('returns null when no accordion item has an Ingredients label', () => {
    const doc = fakeDocWithAccordions([
      { label: 'Nutritional Information', content: 'Calories: 100 kcal per 100g' },
    ]);
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('returns null when ingredient text is 10 characters or fewer', () => {
    const doc = fakeDocWithAccordions([
      { label: 'Ingredients', content: 'Vegan' },
    ]);
    expect(adapter.extractIngredients(doc)).toBeNull();
  });

  it('matches ingredient label case-insensitively (e.g. "INGREDIENTS")', () => {
    const doc = fakeDocWithAccordions([
      { label: 'INGREDIENTS', content: 'Carbonated Water, Natural Flavourings, Citric Acid.' },
    ]);
    expect(adapter.extractIngredients(doc)).toBe('Carbonated Water, Natural Flavourings, Citric Acid.');
  });
});

// ---------------------------------------------------------------------------
// extractBarcodes (async)
// ---------------------------------------------------------------------------

describe('extractBarcodes', () => {
  it('fetches the GOL API with the correct URL and returns EAN-13 codes', async () => {
    const doc = fakeDocWithSku('2852652');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ eans: ['3176575128962', '3176575493930'] }),
    });

    const result = await adapter.extractBarcodes(doc);

    expect(global.fetch).toHaveBeenCalledWith(
      '/groceries-api/gol-services/product/v1/product/2852652'
    );
    expect(result).toEqual(['3176575128962', '3176575493930']);
  });

  it('filters out non-EAN values and keeps valid EAN-8 and EAN-13 codes', async () => {
    const doc = fakeDocWithSku('1234567');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        eans: ['12345678', '1234567890123', '999', 'NOTANEAN', '123456789'],
      }),
    });

    const result = await adapter.extractBarcodes(doc);

    // EAN-8 (8 digits) and EAN-13 (13 digits) only
    expect(result).toEqual(['12345678', '1234567890123']);
  });

  it('returns empty array when fetch throws a network error', async () => {
    const doc = fakeDocWithSku('9999999');
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await adapter.extractBarcodes(doc);

    expect(result).toEqual([]);
  });

  it('returns empty array when the GOL API returns a non-OK HTTP status', async () => {
    const doc = fakeDocWithSku('9999999');
    global.fetch = jest.fn().mockResolvedValue({ ok: false });

    const result = await adapter.extractBarcodes(doc);

    expect(result).toEqual([]);
  });

  it('returns empty array when the GOL API response has no eans field', async () => {
    const doc = fakeDocWithSku('9999999');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ product: { name: 'Frubes' } }),
    });

    const result = await adapter.extractBarcodes(doc);

    expect(result).toEqual([]);
  });

  it('returns empty array without calling fetch when no SKU is available', async () => {
    const doc = fakeDoc(); // no JSON-LD at all
    global.fetch = jest.fn();

    const result = await adapter.extractBarcodes(doc);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// _extractSku (private, tested via extractBarcodes and extractProductInfo)
// ---------------------------------------------------------------------------

describe('_extractSku', () => {
  it('extracts sku from a root-level JSON-LD Product node', () => {
    const doc = fakeDocWithSku('2852652');
    expect(adapter._extractSku(doc)).toBe('2852652');
  });

  it('extracts sku from a @graph array JSON-LD block', () => {
    const script = {
      textContent: JSON.stringify({
        '@graph': [
          { '@type': 'BreadcrumbList', items: [] },
          { '@type': 'Product', sku: '9876543' },
        ],
      }),
    };
    const doc = {
      querySelector:    (sel) => sel === 'script[type="application/ld+json"]' ? script : null,
      querySelectorAll: (sel) => sel === 'script[type="application/ld+json"]' ? [script] : [],
    };
    expect(adapter._extractSku(doc)).toBe('9876543');
  });

  it('returns null when no JSON-LD is present', () => {
    expect(adapter._extractSku(fakeDoc())).toBeNull();
  });

  it('returns null when JSON-LD is malformed', () => {
    const script = { textContent: '{ not valid json' };
    const doc = {
      querySelector:    (sel) => sel === 'script[type="application/ld+json"]' ? script : null,
      querySelectorAll: (sel) => sel === 'script[type="application/ld+json"]' ? [script] : [],
    };
    expect(adapter._extractSku(doc)).toBeNull();
  });
});
