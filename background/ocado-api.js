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
 * cookieHeader is accepted as an optional parameter to support session-authenticated
 * requests if the endpoint requires it. Pass undefined/null to make an unauthenticated
 * request (the default — sufficient for public product data endpoints).
 *
 * @param {string} productId - Ocado retailerProductId from the PDP URL
 * @param {string|null} [cookieHeader] - Optional Cookie header value from content script
 * @returns {Promise<Object|null>} Parsed response body, or null on failure
 */
async function fetchOcadoIngredients(productId, cookieHeader) {
  try {
    const headers = cookieHeader ? { cookie: cookieHeader } : {};
    const response = await fetch(`${OCADO_BOP_API_BASE}?retailerProductId=${productId}`, {
      headers,
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
