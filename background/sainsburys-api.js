/**
 * Sainsbury's GOL API integration — must only be called from service worker context.
 * The SKU is extracted by the content script from JSON-LD and passed via message.
 * See ADR-015.
 */

const SAINSBURYS_GOL_API_BASE =
  'https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product/';

/**
 * Fetches EAN barcodes from the Sainsbury's Groceries Online (GOL) API.
 * Returns the parsed JSON response body ({ eans: [...] }), or null on failure.
 *
 * cookieHeader is accepted as an optional parameter to support session-authenticated
 * requests if the endpoint requires it. Pass undefined/null to make an unauthenticated
 * request (the default — sufficient for public product data endpoints).
 *
 * @param {string} sku - Sainsbury's internal product SKU from JSON-LD
 * @param {string|null} [cookieHeader] - Optional Cookie header value from content script
 * @returns {Promise<Object|null>} Parsed response body, or null on failure
 */
async function fetchSainsburysBarcodes(sku, cookieHeader) {
  try {
    const headers = cookieHeader ? { cookie: cookieHeader } : {};
    const response = await fetch(`${SAINSBURYS_GOL_API_BASE}${sku}`, {
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
  module.exports = { fetchSainsburysBarcodes, SAINSBURYS_GOL_API_BASE };
}
