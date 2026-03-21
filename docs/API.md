# API.md - OpenFoodFacts API Integration

**Project:** UPF Scanner
**Last Updated:** 2026-02-22
**API Version:** v2
**Base URL:** `https://world.openfoodfacts.org/api/v2/`

> This document details the integration with OpenFoodFacts API, including endpoints, request/response formats, error handling, rate limiting, and caching strategy.

---

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Endpoints](#endpoints)
4. [Request Examples](#request-examples)
5. [Response Format](#response-format)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)
8. [Caching Strategy](#caching-strategy)
9. [Fallback Behavior](#fallback-behavior)

---

## Overview

### What is OpenFoodFacts?
OpenFoodFacts is a free, open, collaborative database of food products from around the world. It contains:
- Product names and barcodes
- Ingredient lists
- Nutritional information
- **NOVA classification** (ultra-processed food scoring)
- Allergen information
- Images

### Why Use OpenFoodFacts?
- ✅ **Good Coverage:** 200k+ UK products, 3.5M+ products worldwide
- ✅ **NOVA Data:** Many products already have community-contributed NOVA classifications
- ✅ **Community-Driven:** Regularly updated by users
- ✅ **REST API:** Simple JSON responses

### Our Usage
We use OpenFoodFacts as the **primary data source** for NOVA classifications:
1. Detect product on Tesco page
2. Extract barcode (EAN/UPC)
3. Query OpenFoodFacts API by barcode
4. If found and has NOVA score → use it
5. If not found OR missing NOVA score → fallback to local classification (Phase 5)

---

## Authentication

**Good news: No authentication required!**

However, you **MUST** set a custom User-Agent header to identify your app:

```javascript
const headers = {
  'User-Agent': 'UPF-Scanner/1.0 (https://github.com/MikeCain21/upf-scanner)'
};
```

**Format:** `AppName/Version (URL; contact-email)`

**Why?**
- OpenFoodFacts tracks usage and can contact you if issues arise
- Required by their Terms of Service
- Polite and professional

---

## Endpoints

### 1. Get Product by Barcode (Primary Endpoint)

**Endpoint:** `/api/v2/product/{barcode}.json`

**Method:** GET

**Parameters:**
- `{barcode}` - EAN-13, UPC-A, or other barcode format (e.g., `5000168123456`)

**URL:**
```
https://world.openfoodfacts.org/api/v2/product/{barcode}.json
```

**Example:**
```
https://world.openfoodfacts.org/api/v2/product/3017620422003.json
```

**Use Case:** Lookup product by barcode extracted from Tesco page.

---

### 2. Search Products by Name (Fallback)

**Endpoint:** `/cgi/search.pl`

**Method:** GET

**Parameters:**
- `search_terms` - Product name (e.g., "heinz tomato soup")
- `search_simple=1` - Simple search mode
- `action=process` - Execute search
- `json=1` - Return JSON format
- `page_size=5` - Limit results (we only need top match)

**URL:**
```
https://world.openfoodfacts.org/cgi/search.pl?search_terms=heinz+tomato+soup&search_simple=1&action=process&json=1&page_size=5
```

**Use Case:** If barcode not available on Tesco page, search by product name.

**Note:** Name-based search is less reliable (multiple matches, ambiguity). Prefer barcode lookup.

---

## Request Examples

### JavaScript Fetch (Product by Barcode)

```javascript
/**
 * Fetch product data from OpenFoodFacts by barcode
 * @param {string} barcode - EAN-13 or UPC barcode
 * @returns {Promise<Object>} Product data or null if not found
 */
async function fetchProductByBarcode(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;

  const headers = {
    'User-Agent': 'UPF-Scanner/1.0 (https://github.com/MikeCain21/upf-scanner)'
  };

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Product ${barcode} not found in OpenFoodFacts`);
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status === 0) {
      // Product not found (API returns 200 but status: 0)
      console.log(`Product ${barcode} not in database`);
      return null;
    }

    return data.product;
  } catch (error) {
    console.error('OpenFoodFacts API error:', error);
    throw error;
  }
}
```

### Usage Example

```javascript
const barcode = '5000168123456';
const product = await fetchProductByBarcode(barcode);

if (product) {
  console.log('Product name:', product.product_name);
  console.log('NOVA score:', product.nova_group);
  console.log('Ingredients:', product.ingredients_text);
} else {
  console.log('Product not found, using fallback classification');
}
```

---

## Response Format

### Successful Response (Product Found)

**HTTP Status:** 200 OK

**Structure:**
```json
{
  "code": "3017620422003",
  "product": {
    "product_name": "Nutella",
    "brands": "Ferrero",
    "quantity": "400g",
    "ingredients_text": "Sugar, Palm Oil, Hazelnuts (13%), Skimmed Milk Powder (8.7%), Fat-Reduced Cocoa (7.4%), Emulsifier: Lecithins (Soya), Vanillin",
    "allergens": "en:milk,en:nuts,en:soybeans",
    "nova_group": 4,
    "nova_groups_tags": ["en:4-ultra-processed-food-and-drink-products"],
    "nutriments": {
      "energy-kcal_100g": 539,
      "fat_100g": 30.9,
      "sugars_100g": 56.3,
      ...
    },
    "images": { ... },
    ...
  },
  "status": 1,
  "status_verbose": "product found"
}
```

### Key Fields We Care About

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `product.product_name` | string | Product name | `"Nutella"` |
| `product.brands` | string | Brand names | `"Ferrero"` |
| `product.nova_group` | number | NOVA score (1-4) | `4` |
| `product.nova_groups_tags` | array | NOVA tags | `["en:4-ultra-processed-food-and-drink-products"]` |
| `product.ingredients_text` | string | Full ingredient list | `"Sugar, Palm Oil, ..."` |
| `product.ingredients` | array | Parsed ingredients | `[{id: "en:sugar", ...}, ...]` |

### Product Not Found Response

**HTTP Status:** 200 OK (but status: 0)

```json
{
  "code": "0000000000000",
  "status": 0,
  "status_verbose": "product not found"
}
```

**How to Detect:**
```javascript
if (data.status === 0) {
  // Product not found
}
```

### NOVA Score Extraction

**Primary Field:** `product.nova_group`
- Type: number (1, 2, 3, or 4)
- Can be missing (null/undefined) if not calculated

**Fallback Field:** `product.nova_groups_tags[0]`
- Type: array of strings
- Format: `"en:4-ultra-processed-food-and-drink-products"`
- Extract number from tag

**Robust Extraction:**
```javascript
function getNOVAScore(product) {
  // Try direct field first
  if (product.nova_group) {
    return product.nova_group;
  }

  // Try tags as fallback
  if (product.nova_groups_tags && product.nova_groups_tags.length > 0) {
    const tag = product.nova_groups_tags[0];
    const match = tag.match(/en:(\d)-/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // No NOVA data available
  return null;
}
```

---

## Error Handling

### Error Types

| Error Type | Status Code | Cause | Action |
|------------|-------------|-------|--------|
| **Product Not Found** | 200 (status: 0) | Barcode not in database | Fall back to local classification |
| **Invalid Barcode** | 200 (status: 0) | Malformed barcode | Fall back to local classification |
| **Network Error** | - | No internet connection | Use cached data or fallback |
| **Server Error** | 500-503 | OpenFoodFacts server issue | Retry once, then fallback |
| **Rate Limit** | 429 | Too many requests | Wait and retry, or use cache |

### Error Handling Template

```javascript
async function fetchWithErrorHandling(barcode) {
  try {
    const product = await fetchProductByBarcode(barcode);

    if (!product) {
      // Not found, use fallback
      console.log('[API] Product not found, using local classification');
      return { source: 'local', product: null };
    }

    const novaScore = getNOVAScore(product);

    if (!novaScore) {
      // Found but no NOVA data, use fallback
      console.log('[API] Product found but no NOVA data, using local classification');
      return { source: 'local', product: product, novaScore: null };
    }

    // Success: found product with NOVA score
    console.log(`[API] NOVA ${novaScore} from OpenFoodFacts`);
    return { source: 'api', product: product, novaScore: novaScore };

  } catch (error) {
    if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
      console.warn('[API] Network error, using fallback');
      return { source: 'local', error: 'network' };
    }

    if (error.message.includes('429')) {
      console.warn('[API] Rate limited, using cache or fallback');
      return { source: 'local', error: 'rate_limit' };
    }

    console.error('[API] Unexpected error:', error);
    return { source: 'local', error: 'unknown' };
  }
}
```

---

## Rate Limiting

### OpenFoodFacts Limits

**Official Limit:** Not publicly documented, but generally:
- ~100 requests per minute per IP (estimated)
- Burst tolerance for occasional spikes
- Respectful use expected (don't hammer API)

**Best Practices:**
- **Cache aggressively** (we use 7-day TTL)
- **Batch requests** (don't query 100 products simultaneously)
- **Debounce** (wait for user to stop scrolling before classifying new products)
- **User-Agent** (identify your app)

### Our Rate Limiting Strategy

```javascript
class RateLimiter {
  constructor(maxRequestsPerMinute = 60) {
    this.maxRequests = maxRequestsPerMinute;
    this.requests = []; // Timestamps of recent requests
  }

  async throttle() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove requests older than 1 minute
    this.requests = this.requests.filter(time => time > oneMinuteAgo);

    if (this.requests.length >= this.maxRequests) {
      // Wait until oldest request is >1 minute old
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + 60000 - now;
      console.log(`[RateLimit] Waiting ${waitTime}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requests.push(now);
  }
}

// Usage
const limiter = new RateLimiter(60); // 60 requests/minute

async function fetchWithRateLimit(barcode) {
  await limiter.throttle();
  return await fetchProductByBarcode(barcode);
}
```

**Alternative (Simpler):** Add a small delay between requests:
```javascript
// Wait 100ms between requests (max 600/minute, well under limit)
await new Promise(resolve => setTimeout(resolve, 100));
```

---

## Caching Strategy

### Why Cache?
- **Performance:** Instant results for previously seen products
- **Respect API:** Minimize load on OpenFoodFacts servers
- **Offline Support:** Works when internet unavailable
- **User Experience:** No delays on repeat visits

### Cache Implementation (chrome.storage.local)

**Cache Key Format:** `openfoodfacts_${barcode}`

**Cache Value:**
```javascript
{
  barcode: "5000168123456",
  timestamp: 1708617600000, // Unix timestamp (ms)
  ttl: 604800000, // 7 days in ms
  novaScore: 4,
  productName: "Product Name",
  source: "api",
  ingredients: "..."
}
```

**Cache Operations:**

```javascript
// lib/cache.js

const CACHE_PREFIX = 'openfoodfacts_';
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get cached product data
 * @param {string} barcode
 * @returns {Promise<Object|null>} Cached data or null if expired/not found
 */
async function getCached(barcode) {
  const key = CACHE_PREFIX + barcode;
  const result = await chrome.storage.local.get(key);

  if (!result[key]) {
    return null; // Not in cache
  }

  const cached = result[key];
  const now = Date.now();

  if (now - cached.timestamp > cached.ttl) {
    // Expired, remove from cache
    await chrome.storage.local.remove(key);
    return null;
  }

  console.log(`[Cache] Hit for ${barcode}`);
  return cached;
}

/**
 * Store product data in cache
 * @param {string} barcode
 * @param {Object} data
 */
async function setCached(barcode, data) {
  const key = CACHE_PREFIX + barcode;
  const cacheEntry = {
    ...data,
    timestamp: Date.now(),
    ttl: TTL
  };

  await chrome.storage.local.set({ [key]: cacheEntry });
  console.log(`[Cache] Stored ${barcode}`);
}

/**
 * Clear all cached OpenFoodFacts data
 */
async function clearCache() {
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter(key => key.startsWith(CACHE_PREFIX));
  await chrome.storage.local.remove(keysToRemove);
  console.log(`[Cache] Cleared ${keysToRemove.length} entries`);
}
```

**Full Flow with Cache:**

```javascript
async function getProductNOVA(barcode) {
  // 1. Check cache first
  const cached = await getCached(barcode);
  if (cached) {
    return { source: 'cache', novaScore: cached.novaScore };
  }

  // 2. Cache miss, query API
  console.log(`[Cache] Miss for ${barcode}, querying API`);
  const apiResult = await fetchWithErrorHandling(barcode);

  // 3. If API success, cache the result
  if (apiResult.source === 'api' && apiResult.novaScore) {
    await setCached(barcode, {
      barcode: barcode,
      novaScore: apiResult.novaScore,
      productName: apiResult.product.product_name,
      source: 'api'
    });
  }

  return apiResult;
}
```

---

## Fallback Behavior

### When to Fallback to Local Classification

1. **Product Not Found:** Barcode not in OpenFoodFacts database
2. **No NOVA Data:** Product found but `nova_group` is null/missing
3. **Network Error:** Can't reach API (offline, server down)
4. **Rate Limited:** Hit API limits (shouldn't happen with caching, but possible)
5. **Invalid Response:** Malformed JSON or unexpected data

### Fallback Flow

```
┌──────────────────────────────┐
│ Extract barcode from Tesco   │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Check cache                  │
└──────────┬───────────────────┘
           │ Cache miss
           ▼
┌──────────────────────────────┐
│ Query OpenFoodFacts API      │
└──────────┬───────────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌────────┐  ┌────────────────┐
│ Found  │  │ Not Found /    │
│ + NOVA │  │ Error          │
└────┬───┘  └────┬───────────┘
     │           │
     │           ▼
     │      ┌──────────────────────────┐
     │      │ Extract ingredients      │
     │      │ from Tesco page          │
     │      └──────────┬───────────────┘
     │                 │
     │                 ▼
     │      ┌──────────────────────────┐
     │      │ Local Classification     │
     │      └──────────┬───────────────┘
     │                 │
     └─────────┬───────┘
               │
               ▼
     ┌──────────────────────────┐
     │ Display Badge            │
     │ (with source indicator)  │
     └──────────────────────────┘
```

### Indicating Source in UI

**Tooltip should show:**
- "NOVA 4 (OpenFoodFacts)" - API source, high confidence
- "NOVA 4 (Estimated)" - Local classification, medium confidence

**Example:**
```javascript
function createBadgeTooltip(novaScore, source) {
  const sourceLabel = source === 'api' ? 'OpenFoodFacts' : 'Estimated';
  const confidence = source === 'api' ? 'High' : 'Medium';

  return `
    NOVA ${novaScore} - ${sourceLabel}
    Confidence: ${confidence}
    ${novaScore === 4 ? 'Ultra-processed food' : ''}
  `;
}
```

---

## Testing the API

### Manual Test (Browser Console)

```javascript
// Test product lookup
fetch('https://world.openfoodfacts.org/api/v2/product/3017620422003.json', {
  headers: {
    'User-Agent': 'UPF-Scanner/1.0 (test)'
  }
})
  .then(r => r.json())
  .then(data => {
    console.log('Product:', data.product.product_name);
    console.log('NOVA:', data.product.nova_group);
  });
```

### Example UK Products for Testing

| Product | Barcode | Expected NOVA |
|---------|---------|---------------|
| Heinz Tomato Soup | 5000157008725 | 4 (ultra-processed) |
| Coca-Cola | 5449000000996 | 4 (ultra-processed) |
| Tesco Baked Beans | 5000119015754 | 3-4 (processed) |
| Cheddar Cheese | Various | 2-3 (processed) |

*Note: User will provide specific barcodes for testing in Phase 6*

---

## API Changelog

**v2 (Current):**
- Product endpoint: `/api/v2/product/{barcode}.json`
- Improved response structure
- Better NOVA data coverage

**v1 (Deprecated):**
- Product endpoint: `/api/v0/product/{barcode}.json`
- Still functional but not recommended

---

## Useful Links

- **OpenFoodFacts API Docs:** https://wiki.openfoodfacts.org/API
- **Product Search:** https://world.openfoodfacts.org/
- **API Status:** https://status.openfoodfacts.org/
- **Terms of Use:** https://world.openfoodfacts.org/terms-of-use

---

*End of API.md*
