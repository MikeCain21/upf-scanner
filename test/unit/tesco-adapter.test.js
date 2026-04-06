'use strict';

/**
 * Jest unit tests for content/sites/tesco.js
 *
 * Tests cover: isSupported (including security regression for hostname-based
 * URL validation introduced to fix CodeQL alert — substring-based checks
 * can be bypassed by crafted URLs where tesco.com appears in the path).
 *
 * Run with: npm test
 *           npx jest test/tesco
 */

// ---------------------------------------------------------------------------
// Bootstrap — make BaseAdapter and registry available as globals
// ---------------------------------------------------------------------------

const { BaseAdapter } = require('../../content/sites/base-adapter');
global.BaseAdapter = BaseAdapter;
global.registry = { register: jest.fn() };

const { TescoAdapter } = require('../../content/sites/tesco');

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let adapter;

beforeEach(() => {
  adapter = new TescoAdapter();
});

// ---------------------------------------------------------------------------
// isSupported
// ---------------------------------------------------------------------------

describe('isSupported', () => {
  it('returns true for a Tesco PDP URL', () => {
    expect(adapter.isSupported('https://www.tesco.com/groceries/en-GB/products/254682406')).toBe(true);
  });

  it('returns true for a valid tesco.com subdomain PDP URL', () => {
    expect(adapter.isSupported('https://www.tesco.com/groceries/en-GB/products/123456')).toBe(true);
  });

  it('returns false for a Tesco homepage URL', () => {
    expect(adapter.isSupported('https://www.tesco.com/')).toBe(false);
  });

  it('returns false for a Tesco category URL', () => {
    expect(adapter.isSupported('https://www.tesco.com/groceries/en-GB/promotions/all')).toBe(false);
  });

  it('returns false for a non-Tesco URL', () => {
    expect(adapter.isSupported('https://www.asda.com/groceries/product/cola/coca-cola/123')).toBe(false);
  });

  it('returns false for a crafted URL with tesco.com in the path but a different hostname', () => {
    expect(adapter.isSupported('https://evil.com/tesco.com/groceries/en-GB/products/123')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(adapter.isSupported('')).toBe(false);
  });

  it('returns false for a non-URL string', () => {
    expect(adapter.isSupported('not-a-url')).toBe(false);
  });
});
