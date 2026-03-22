/**
 * ASDA product API integration — must only be called from service worker context.
 * Token is extracted by the content script (same-origin cookie access required)
 * and passed via message. See ADR-014.
 */

const ASDA_PRODUCT_API_BASE =
  'https://www.asda.com/mobify/proxy/ghs-api/product/shopper-products/v1/organizations/f_ecom_bjgs_prd/products/';

/**
 * Fetches product data from ASDA's authenticated product API.
 * @param {string} productId - ASDA product ID from page URL
 * @param {string|null} token - Raw SLAS.AUTH_TOKEN cookie value from content script
 * @returns {Promise<Object|null>} Product data object, or null on failure
 */
async function fetchAsdaProduct(productId, token) {
  if (!token) return null;
  try {
    const url = `${ASDA_PRODUCT_API_BASE}${encodeURIComponent(String(productId))}?siteId=ASDA_GROCERIES&allImages=true&c_isPDP=true`;
    const response = await fetch(url, {
      headers: {
        authorization: token,
        'content-type': 'application/json',
      },
      credentials: 'omit',
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchAsdaProduct, ASDA_PRODUCT_API_BASE };
}
