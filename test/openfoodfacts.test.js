'use strict';

/**
 * Jest unit tests for lib/openfoodfacts.js
 *
 * Tests pure functions that parse OpenFoodFacts API responses.
 * No fetch, no chrome.* APIs — all pure logic.
 *
 * Run with:  npm test
 *            npm run test:verbose
 */

const { extractNovaScore, parseApiResponse } = require('../lib/openfoodfacts');

// ---------------------------------------------------------------------------
// extractNovaScore
// ---------------------------------------------------------------------------

describe('extractNovaScore', () => {
  it('returns null for null product', () => {
    expect(extractNovaScore(null)).toBeNull();
  });

  it('returns null for undefined product', () => {
    expect(extractNovaScore(undefined)).toBeNull();
  });

  it('extracts nova_group: 4 directly', () => {
    expect(extractNovaScore({ nova_group: 4 })).toBe(4);
  });

  it('extracts nova_group: 1 directly', () => {
    expect(extractNovaScore({ nova_group: 1 })).toBe(1);
  });

  it('coerces string nova_group to number (API sometimes returns strings)', () => {
    expect(extractNovaScore({ nova_group: '4' })).toBe(4);
    expect(extractNovaScore({ nova_group: '2' })).toBe(2);
  });

  it('returns null for out-of-range nova_group (0)', () => {
    expect(extractNovaScore({ nova_group: 0 })).toBeNull();
  });

  it('returns null for out-of-range nova_group (5)', () => {
    expect(extractNovaScore({ nova_group: 5 })).toBeNull();
  });

  it('falls back to nova_groups_tags for NOVA 4', () => {
    const product = { nova_groups_tags: ['en:4-ultra-processed-food-and-drink-products'] };
    expect(extractNovaScore(product)).toBe(4);
  });

  it('falls back to nova_groups_tags for NOVA 1', () => {
    const product = { nova_groups_tags: ['en:1-unprocessed-or-minimally-processed-foods'] };
    expect(extractNovaScore(product)).toBe(1);
  });

  it('prefers nova_group over nova_groups_tags when both present', () => {
    const product = {
      nova_group: 2,
      nova_groups_tags: ['en:4-ultra-processed-food-and-drink-products'],
    };
    expect(extractNovaScore(product)).toBe(2);
  });

  it('returns null when neither field is present', () => {
    expect(extractNovaScore({ product_name: 'Apple' })).toBeNull();
  });

  it('returns null for empty nova_groups_tags array', () => {
    expect(extractNovaScore({ nova_groups_tags: [] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseApiResponse
// ---------------------------------------------------------------------------

describe('parseApiResponse', () => {
  it('returns null for null input', () => {
    expect(parseApiResponse(null)).toBeNull();
  });

  it('returns null when status is 0 (product not found)', () => {
    const response = { status: 0, status_verbose: 'product not found' };
    expect(parseApiResponse(response)).toBeNull();
  });

  it('returns null when status is missing (malformed response)', () => {
    expect(parseApiResponse({})).toBeNull();
    expect(parseApiResponse({ product: { nova_group: 4 } })).toBeNull();
  });

  it('returns the product object when status is 1 and product present', () => {
    const product = { product_name: 'Nutella', nova_group: 4 };
    const response = { status: 1, product };
    expect(parseApiResponse(response)).toBe(product);
  });

  it('returns null when status is 1 but product key is missing', () => {
    expect(parseApiResponse({ status: 1 })).toBeNull();
  });

  it('returns null when product is null', () => {
    expect(parseApiResponse({ status: 1, product: null })).toBeNull();
  });
});
