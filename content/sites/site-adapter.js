/**
 * Site Adapter Interface Definition
 *
 * All site adapters must implement the following interface.
 * This file documents the contract — it contains no runtime code.
 *
 * To add a new supermarket:
 * 1. Create a new file in content/sites/ (e.g. sainsburys.js)
 * 2. Implement all properties and methods below
 * 3. Add the file to manifest.json content_scripts before content/main.js
 *
 * @interface SiteAdapter
 */

/**
 * @property {string} SITE_ID
 * Unique identifier for this site (e.g. 'tesco', 'sainsburys').
 * Used for logging and cache key prefixes.
 *
 * @property {string} HOSTNAME
 * Hostname substring to match against window.location.hostname.
 * Example: 'tesco.com' matches 'www.tesco.com'.
 */

/**
 * Detects all product elements on the current page.
 *
 * Implementations must handle:
 * - Product detail pages (single main product + optional related tiles)
 * - Category/listing pages (multiple product tiles)
 *
 * @function detectProducts
 * @param {Document} doc - The document to search (usually `document`)
 * @returns {Element[]} Array of DOM elements, one per detected product.
 *   Each element is passed to extractProductInfo() to get product data.
 *   Returns empty array if no products found.
 */

/**
 * Extracts structured product information from a product element.
 *
 * @function extractProductInfo
 * @param {Element} el - A DOM element returned by detectProducts()
 * @returns {{ name: string, url: string, productId: string|null }} Product data:
 *   - name: Human-readable product name (trimmed)
 *   - url: Full absolute URL to the product page
 *   - productId: Site-specific product identifier, or null if not found
 */

/**
 * Checks whether this adapter should handle the current page.
 *
 * Called before detectProducts() to avoid running on unsupported sites.
 * Should check window.location.hostname against HOSTNAME.
 *
 * @function isSupported
 * @returns {boolean} True if this adapter should run on the current page.
 */
