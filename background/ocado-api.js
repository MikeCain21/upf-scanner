/**
 * Ocado BOP API integration — must only be called from service worker context.
 * The retailerProductId is extracted by the content script from the page URL
 * and passed via message. See ADR-015.
 */

const OCADO_BOP_API_BASE =
  'https://www.ocado.com/api/webproductpagews/v5/products/bop';

/**
 * Fetches product data from the Ocado BOP API for the given retailerProductId.
 * Returns the parsed JSON response body ({ bopData: { fields: [...] } }), or null on failure.
 *
 * @param {string} productId - Ocado retailerProductId from the PDP URL
 * @returns {Promise<Object|null>} Parsed response body, or null on failure
 */
async function fetchOcadoIngredients(productId) {
  try {
    const params = new URLSearchParams({ retailerProductId: String(productId) });
    const response = await fetch(`${OCADO_BOP_API_BASE}?${params}`, {
      credentials: 'omit',
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchOcadoIngredients, OCADO_BOP_API_BASE };
}
