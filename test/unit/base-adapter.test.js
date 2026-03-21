'use strict';

/**
 * Jest unit tests for content/sites/base-adapter.js
 *
 * Tests the shared utilities (_extractJsonLd, _trySelectors) and verifies
 * that the abstract interface throws when not implemented.
 *
 * Run with: npm test
 */

const { BaseAdapter } = require('../../content/sites/base-adapter');

// ---------------------------------------------------------------------------
// Test double — a concrete subclass for testing the base utility methods
// ---------------------------------------------------------------------------

class ConcreteAdapter extends BaseAdapter {
  get SITE_ID() { return 'test'; }
  isSupported(url) { return url.includes('example.com'); }
  detectProducts(doc) { return []; }
  extractProductInfo(el) { return { name: '', url: '', productId: null }; }
}

// ---------------------------------------------------------------------------
// Helpers — build minimal DOM structures for testing
// ---------------------------------------------------------------------------

/**
 * Returns an object that mimics a browser Document for querySelector.
 * Only supports <script type="application/ld+json"> lookups.
 *
 * @param {string[]} jsonLdContents - textContent for each ld+json script
 * @returns {{ querySelector: Function, querySelectorAll: Function }}
 */
function fakeDocWithJsonLd(...jsonLdContents) {
  const scripts = jsonLdContents.map(content => ({
    textContent: content,
  }));
  return {
    querySelectorAll: (selector) => {
      if (selector === 'script[type="application/ld+json"]') return scripts;
      return [];
    },
    querySelector: (selector) => {
      if (selector === 'script[type="application/ld+json"]') return scripts[0] ?? null;
      return null;
    },
  };
}

/**
 * Returns an object that mimics a Document for querySelector with real elements.
 *
 * @param {{ [selector: string]: object|null }} map - selector → element map
 */
function fakeDocWithSelectors(map) {
  return {
    querySelector: (selector) => map[selector] ?? null,
    querySelectorAll: (selector) => {
      const el = map[selector];
      return el ? [el] : [];
    },
  };
}

// ---------------------------------------------------------------------------
// BaseAdapter — abstract interface
// ---------------------------------------------------------------------------

describe('BaseAdapter — abstract interface', () => {
  it('SITE_ID throws when not overridden', () => {
    const raw = new BaseAdapter();
    expect(() => raw.SITE_ID).toThrow('must define a SITE_ID getter');
  });

  it('isSupported throws when not overridden', () => {
    const raw = new BaseAdapter();
    expect(() => raw.isSupported('https://example.com')).toThrow('must implement isSupported');
  });

  it('detectProducts throws when not overridden', () => {
    const raw = new BaseAdapter();
    expect(() => raw.detectProducts({})).toThrow('must implement detectProducts');
  });

  it('extractProductInfo throws when not overridden', () => {
    const raw = new BaseAdapter();
    expect(() => raw.extractProductInfo({})).toThrow('must implement extractProductInfo');
  });

  it('extractIngredients returns null by default', () => {
    const adapter = new ConcreteAdapter();
    expect(adapter.extractIngredients({})).toBeNull();
  });

  it('extractBarcode delegates to _extractJsonLd by default', () => {
    const adapter = new ConcreteAdapter();
    const doc = fakeDocWithJsonLd(
      JSON.stringify({ '@graph': [{ '@type': 'Product', gtin13: '1234567890123' }] })
    );
    expect(adapter.extractBarcode(doc)).toBe('1234567890123');
  });
});

// ---------------------------------------------------------------------------
// _extractJsonLd — @graph format (Tesco / Waitrose style)
// ---------------------------------------------------------------------------

describe('_extractJsonLd — @graph format', () => {
  let adapter;
  beforeEach(() => { adapter = new ConcreteAdapter(); });

  it('returns gtin13 from @graph Product node', () => {
    const doc = fakeDocWithJsonLd(
      JSON.stringify({
        '@graph': [
          { '@type': 'WebPage' },
          { '@type': 'Product', gtin13: '5000168202734' },
        ],
      })
    );
    expect(adapter._extractJsonLd(doc)).toBe('5000168202734');
  });

  it('returns null when Product node has no gtin13', () => {
    const doc = fakeDocWithJsonLd(
      JSON.stringify({ '@graph': [{ '@type': 'Product' }] })
    );
    expect(adapter._extractJsonLd(doc)).toBeNull();
  });

  it('returns null when @graph has no Product node', () => {
    const doc = fakeDocWithJsonLd(
      JSON.stringify({ '@graph': [{ '@type': 'WebPage' }] })
    );
    expect(adapter._extractJsonLd(doc)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// _extractJsonLd — root-level Product format (Ocado / some Sainsbury's)
// ---------------------------------------------------------------------------

describe('_extractJsonLd — root-level Product format', () => {
  let adapter;
  beforeEach(() => { adapter = new ConcreteAdapter(); });

  it('returns gtin13 from root-level Product object', () => {
    const doc = fakeDocWithJsonLd(
      JSON.stringify({ '@type': 'Product', gtin13: '0012000161155' })
    );
    expect(adapter._extractJsonLd(doc)).toBe('0012000161155');
  });

  it('returns null for root-level Product with no gtin13', () => {
    const doc = fakeDocWithJsonLd(
      JSON.stringify({ '@type': 'Product', name: 'Bread' })
    );
    expect(adapter._extractJsonLd(doc)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// _extractJsonLd — multiple script blocks
// ---------------------------------------------------------------------------

describe('_extractJsonLd — multiple script blocks', () => {
  let adapter;
  beforeEach(() => { adapter = new ConcreteAdapter(); });

  it('scans multiple script blocks and returns first match', () => {
    const doc = fakeDocWithJsonLd(
      JSON.stringify({ '@type': 'WebSite', name: 'Tesco' }),
      JSON.stringify({ '@graph': [{ '@type': 'Product', gtin13: '5052910306588' }] })
    );
    expect(adapter._extractJsonLd(doc)).toBe('5052910306588');
  });

  it('returns null when no script blocks present', () => {
    const doc = { querySelectorAll: () => [], querySelector: () => null };
    expect(adapter._extractJsonLd(doc)).toBeNull();
  });

  it('handles malformed JSON gracefully and returns null', () => {
    const doc = fakeDocWithJsonLd('{ not valid json }');
    expect(adapter._extractJsonLd(doc)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// _trySelectors
// ---------------------------------------------------------------------------

describe('_trySelectors', () => {
  let adapter;
  beforeEach(() => { adapter = new ConcreteAdapter(); });

  it('returns the first matching element', () => {
    const el = { tagName: 'DIV' };
    const doc = fakeDocWithSelectors({ '.primary': el });
    expect(adapter._trySelectors(doc, ['.primary', '.fallback'])).toBe(el);
  });

  it('falls through to next selector when first does not match', () => {
    const fallbackEl = { tagName: 'P' };
    const doc = fakeDocWithSelectors({ '.fallback': fallbackEl });
    expect(adapter._trySelectors(doc, ['.primary', '.fallback'])).toBe(fallbackEl);
  });

  it('returns null when no selectors match', () => {
    const doc = fakeDocWithSelectors({});
    expect(adapter._trySelectors(doc, ['.a', '.b', '.c'])).toBeNull();
  });

  it('returns null for empty selector list', () => {
    const doc = fakeDocWithSelectors({ '.any': {} });
    expect(adapter._trySelectors(doc, [])).toBeNull();
  });
});
