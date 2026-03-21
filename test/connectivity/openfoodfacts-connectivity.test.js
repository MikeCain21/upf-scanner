'use strict';

/**
 * OpenFoodFacts API connectivity tests.
 *
 * Tests real HTTP calls to OpenFoodFacts with known, stable barcodes.
 * NOT included in the normal `npm test` run — use when debugging whether
 * the extension is broken or whether OFF itself is down.
 *
 * Run with: npm run test:connectivity
 *
 * All barcodes here must be pre-verified per CLAUDE.md barcode rule.
 */

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const TIMEOUT_MS = 15_000; // OFF can be slow

jest.setTimeout(TIMEOUT_MS);

/**
 * Fetches a product from OFF and returns { status, nova_group, product_name }.
 * Returns null on network error or HTTP failure.
 * @param {string} barcode - EAN/GTIN barcode
 * @returns {Promise<{status: number, nova_group: number|null, product_name: string}|null>}
 */
async function fetchOff(barcode) {
  const res = await fetch(`${OFF_BASE}/${barcode}.json`);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    status: data.status,
    nova_group: data.product?.nova_group ?? null,
    product_name: data.product?.product_name ?? '',
  };
}

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

describe('OpenFoodFacts connectivity', () => {
  it('API base URL returns a valid JSON response', async () => {
    // Use a known barcode — just check we get HTTP 200 and valid JSON
    const res = await fetch(`${OFF_BASE}/5000328028750.json`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toBeDefined();
    expect(typeof data.status).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Known NOVA 4 products
// ---------------------------------------------------------------------------

describe('Known NOVA 4 products', () => {
  it.each([
    ['5000328028750', 'Doritos Tangy Cheese'],
    ['5449000601971', 'Coca-Cola'],
    ['3329770062467', 'Danone Frubes'],
  ])('barcode %s (%s) → NOVA 4', async (barcode, name) => {
    const result = await fetchOff(barcode);
    expect(result).not.toBeNull();
    expect(result.status).toBe(1);
    expect(result.nova_group).toBe(4);
  });
});

