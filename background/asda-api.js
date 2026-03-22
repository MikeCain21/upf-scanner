/**
 * ASDA product API integration — must only be called from service worker context.
 * Token is extracted by the content script (same-origin cookie access required)
 * and passed via message. See ADR-014.
 */

const ASDA_PRODUCT_API_URL =
  'https://www.asda.com/mobify/proxy/ghs-api/product/shopper-products/v1/products?ids=';

/**
 * Fetches product data from ASDA's authenticated product API.
 * @param {string} productId - ASDA product ID from page URL
 * @param {string|null} token - Raw SLAS.AUTH_TOKEN cookie value from content script
 * @returns {Promise<Object|null>} First product data object, or null on failure
 */
async function fetchAsdaProduct(productId, token) {
  if (!token) return null;
  try {
    const response = await fetch(`${ASDA_PRODUCT_API_URL}${productId}`, {
      headers: {
        authorization: token,
        'content-type': 'application/json',
      },
      credentials: 'omit',
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json?.data?.[0] ?? null;
  } catch {
    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchAsdaProduct, ASDA_PRODUCT_API_URL };
}
