# Architecture Decision Records

**Project:** UPF Scanner
**Last Updated:** 2026-03-24

> This document records non-obvious architectural and technical decisions. Straightforward choices (platform, framework, caching mechanism) are omitted — the code itself is sufficient documentation for those.

---

## Table of Contents

- [ADR-001: E-Number Detection Strategy](#adr-001-e-number-detection-strategy)
- [ADR-002: OFF v3 Stateless Ingredient Analysis as Primary Classification Path](#adr-002-off-v3-stateless-ingredient-analysis-as-primary-classification-path)
- [ADR-003: NOVA 3 Processing Markers in Local Classifier](#adr-003-nova-3-processing-markers-in-local-classifier)
- [ADR-004: Parallel API Calls in classifyMainProduct()](#adr-004-parallel-api-calls-in-classifymainproduct)
- [ADR-005: Hash-Based Ingredient Cache Key](#adr-005-hash-based-ingredient-cache-key)
- [ADR-006: Waitrose — script#__NEXT_DATA__ for Barcode and Ingredients](#adr-006-waitrose--scriptnext_data-for-barcode-and-ingredients)
- [ADR-007: Guard NOVA 1 Fast-Path on barcodes.length === 0](#adr-007-guard-nova-1-fast-path-on-barcodeslength--0)
- [ADR-008: ASDA — script#mobify-data for Barcode and Ingredients](#adr-008-asda--scriptmobify-data-for-barcode-and-ingredients)
- [ADR-009: Morrisons — No EAN-13 Available; Ingredient-Only Classification](#adr-009-morrisons--no-ean-13-available-ingredient-only-classification)
- [ADR-010: Extend NOVA3_PROCESSING_RE with Food Additive Category Names](#adr-010-extend-nova3_processing_re-with-food-additive-category-names)
- [ADR-011: Ocado — BOP API for Ingredient Extraction](#adr-011-ocado--bop-api-for-ingredient-extraction)
- [ADR-012: Align Local Indicator Set with OpenFoodFacts Taxonomy](#adr-012-align-local-indicator-set-with-openfoodfacts-taxonomy)
- [ADR-013: Incognito Mode — Skip Persistent Cache Writes](#adr-013-incognito-mode--skip-persistent-cache-writes)
- [ADR-014: Move ASDA Authenticated API Call to Service Worker](#adr-014-move-asda-authenticated-api-call-to-service-worker)
- [ADR-015: Delegate Sainsbury's and Ocado API Calls to Service Worker](#adr-015-delegate-sainsburys-and-ocado-api-calls-to-service-worker)
- [ADR-016: AES-256-GCM Encryption for Local Cache](#adr-016-aes-256-gcm-encryption-for-local-cache)

---

## ADR-001: E-Number Detection Strategy

**Status:** Accepted | **Date:** 2026-02-24

**Context:** The local NOVA 4 classifier must detect food additives (E-numbers) within ingredient token strings. E-numbers appear in multiple formats: standalone (`E621`), embedded in bracket groups (`Colour (Caramel E150d)`), and with case variations (`e621`).

**Decision:** Use regex extraction (`\bE\d{3}[a-z]?\b`) to pull all E-numbers from each token, normalise to canonical EU notation (uppercase E, lowercase letter suffix), then perform a Set lookup. The indicator set is sourced from Monteiro et al. 2019 functional categories, with natural and fermentation-derived additives excluded.

**Rationale:** Substring matching cannot handle embedded codes or case variation. A Set lookup is O(1) per code after the single regex pass. Natural additives (E100-family colours, E200 sorbic acid, E300-family ascorbates) are excluded because they do not indicate ultra-processing.

**Consequences:**
- Handles codes embedded in bracket groups correctly
- Natural additives correctly excluded from NOVA 4 signalling
- The indicator set is an approximation — OpenFoodFacts does not publish an official NOVA 4 E-number list; the OFF API result takes precedence for any product it covers

---

## ADR-002: OFF v3 Stateless Ingredient Analysis as Primary Classification Path

**Status:** Accepted | **Date:** 2026-02-27

**Context:** OpenFoodFacts barcode lookup (v2 API) returns a `nova_group` field that is frequently null, stale, or missing for many products. Products without a barcode cannot be classified via barcode lookup at all.

**Decision:** Use the OFF v3 stateless `/analyze` endpoint as the primary classification path. It accepts raw ingredient text and returns a NOVA score plus per-ingredient markers, without requiring a barcode. Barcode lookup is retained as a supplementary source when no ingredient text is available.

**Rationale:** The ingredient analysis endpoint is more reliable than the `nova_group` field (which depends on community contributions and may lag product updates). It also works without a barcode and returns per-ingredient data that improves tooltip quality.

**Consequences:**
- More products classified, since ingredient text is available more often than a matched barcode
- Tooltip can show which specific ingredients triggered classification
- Requires ingredient extraction to succeed before the API call is made
- OFF v3 stateless endpoint is newer than v2; changes to it need monitoring

---

## ADR-003: NOVA 3 Processing Markers in Local Classifier

**Status:** Accepted | **Date:** 2026-02-28

**Context:** The local classifier's NOVA 3 rule required both a culinary ingredient token and a minimum ingredient count. Fermented and cultured products (e.g. cheese with milk, salt, cheese cultures, rennet) were misclassified as NOVA 1–2 when token count fell below the threshold. Plain culinary ingredients (sunflower oil, sugar) were classified as NOVA 1 rather than NOVA 2.

**Decision:** Two rules were added to the local classifier:
1. An explicit processing-marker regex (`NOVA3_PROCESSING_RE`) covering food-science terms (cheese cultures, rennet, smoked, cured, fermented, brined, lacto-fermented, acidity regulators, stabilisers, humectants) that promotes a product to NOVA 3 regardless of token count.
2. A single culinary ingredient rule that promotes products with ≤3 tokens and a culinary signal to NOVA 2.

**Rationale:** Processing markers are unambiguous signals of physical or biological transformation that define NOVA 3 independently of ingredient count. The single-ingredient NOVA 2 rule aligns with the NOVA framework's definition of Group 2 (processed culinary ingredients). `antioxidant` and `preservative` are excluded from the regex — the NOVA framework explicitly states that NOVA 2 products (vinegar, oil) may contain these additives.

**Consequences:**
- Fermented, cured, and cultured dairy/meat products classified correctly as NOVA 3
- Plain culinary ingredients classified as NOVA 2
- Sunflower oil with antioxidants and preserved vinegar remain NOVA 2 (antioxidant/preservative excluded from regex)

---

## ADR-004: Parallel API Calls in classifyMainProduct()

**Status:** Accepted | **Date:** 2026-03-17

**Context:** On a cold cache, `classifyMainProduct()` called the barcode lookup API sequentially, waiting for it to fail before starting the ingredient analysis API. Sequential worst-case latency was approximately 18 seconds.

**Decision:** Both API calls (`FETCH_PRODUCT` and `ANALYZE_INGREDIENTS`) are started simultaneously using two `Promise` variables. The barcode result is awaited first (authoritative when available); if it yields no valid score, the ingredient analysis result is used (already in-flight, may already be resolved).

**Rationale:** Both calls are needed in the worst case regardless; starting them in parallel reduces the worst-case latency to the slower of the two timeouts (~10s) rather than their sum.

**Consequences:**
- Cold-cache worst case drops from ~18s to ~10s
- Hot-cache path unchanged (~5ms per call, barcode-first)
- No additional API calls — same two endpoints, started concurrently

---

## ADR-005: Hash-Based Ingredient Cache Key

**Status:** Accepted | **Date:** 2026-03-17

**Context:** The ingredient analysis cache was keyed on `productId`. If a product's ingredient list changes (reformulation), the cached NOVA score would be served until the 7-day TTL expired.

**Decision:** Replace the `productId` cache key with a djb2 hash of the ingredient text (`ingredients_{hash}`). A reformulation changes the text and therefore the hash, producing a new cache entry automatically. `productId` is retained in the message-passing signature for compatibility but is no longer used as the cache key.

**Rationale:** The cache should be invalidated by a change in the data being cached. Keying on the content hash achieves this without requiring explicit invalidation logic.

**Consequences:**
- Reformulated products automatically receive a fresh cache entry
- Existing `productId`-keyed entries expire via standard 7-day TTL (no active harm)
- djb2 has a low collision probability; acceptable for this use case (a collision would serve a slightly stale NOVA score, not corrupt data)

---

## ADR-006: Waitrose — script#\_\_NEXT\_DATA\_\_ for Barcode and Ingredients

**Status:** Accepted | **Date:** 2026-03-17

**Context:** Waitrose JSON-LD does not include `gtin13`. Waitrose uses CSS module class names (obfuscated hashes such as `Ingredient_ingredients__ab8gl`) that change on every deployment, making DOM selector approaches fragile. The ingredient accordion may be collapsed on page load.

**Decision:** Parse `<script id="__NEXT_DATA__" type="application/json">` as the primary source for both barcode (`barCodes[0]`) and ingredients (`contents.ingredients`). Fall back to JSON-LD for barcode and `#ingredients-region` (a stable `id` attribute) for ingredient text.

> **Important — Chrome MV3 isolated world:** Content scripts run in an isolated JavaScript context. They share the DOM with the page but have a separate JS scope, so `window.__NEXT_DATA__` (a variable set by the page) is invisible to content scripts. The data must be read by parsing the `<script id="__NEXT_DATA__">` DOM element directly via `JSON.parse(element.textContent)`.

**Rationale:** `__NEXT_DATA__` is server-rendered before hydration, so it is available immediately on page load. The data is fully structured — no CSS selector fragility.

**Consequences:**
- Barcode and ingredients available immediately without waiting for React to mount
- No CSS module class names used — zero drift risk from Waitrose redeployments
- If Waitrose migrates away from Next.js, fallback paths activate automatically

---

## ADR-007: Guard NOVA 1 Fast-Path on barcodes.length === 0

**Status:** Accepted | **Date:** 2026-03-17

**Context:** A NOVA 1 fast-path was introduced to skip API calls for fresh produce (no barcode, short ingredient text signals unprocessed food). A barcoded product triggered the fast-path incorrectly because `extractIngredients()` returned marketing copy rather than a structured ingredient list; the copy parsed to a NOVA 1 signal, short-circuiting the API lookup that would have returned the correct result.

**Decision:** Changed the fast-path condition from `if (rawText)` to `if (barcodes.length === 0 && rawText)`. When a barcode is present, the OFF result is authoritative and the fast-path must not bypass it.

**Rationale:** The fast-path is safe only when there is genuinely no more reliable source to consult. A barcode always means the OFF API should be queried first.

**Consequences:**
- Barcoded products always consult OFF first, regardless of local ingredient parse result
- No-barcode fresh produce continues to use the fast-path (correct behaviour)
- Negligible performance cost for barcoded NOVA 1 products (~5ms warm-cache)

---

## ADR-008: ASDA — script#mobify-data for Barcode and Ingredients

**Status:** Accepted | **Date:** 2026-03-18

**Context:** ASDA JSON-LD does not include `gtin13`. Ingredient text is not rendered server-side into accessible DOM elements at page load time — the DOM ingredient panel is populated client-side.

**Decision:** Use `<script id="mobify-data">` as the sole data source. Extract barcode from `__PRELOADED_STATE__.pageProps.pageData.initialProduct.c_EAN_GTIN` and ingredients from `initialProduct.c_BRANDBANK_JSON` (a nested JSON string requiring a secondary `JSON.parse`). A resilient fallback searches all inline scripts for the `__PRELOADED_STATE__` pattern if the `id="mobify-data"` attribute changes.

**Rationale:** `script#mobify-data` is present on all product pages and contains both EAN barcode and structured ingredient data in a single DOM read, with no client-side rendering dependency.

**Consequences:**
- No additional API calls needed for data extraction
- `c_BRANDBANK_JSON` requires two `JSON.parse` calls; malformed JSON at either step fails gracefully and returns null
- Fresh produce (no `c_BRANDBANK_JSON`) falls through to NOVA 1 fast-path correctly
- GS1 weight-embedded barcodes (prefix `2`) are filtered upstream in `content/main.js`

---

## ADR-009: Morrisons — No EAN-13 Available; Ingredient-Only Classification

**Status:** Accepted | **Date:** 2026-03-18

**Context:** Morrisons does not expose an EAN-13 barcode anywhere in the browser — not in JSON-LD, SSR data blobs, the BOP product API, or GraphQL SSR cache. The `retailerProductId` is a Morrisons-internal identifier not indexed by OpenFoodFacts.

**Decision:** `extractBarcode()` always returns null. Ingredient text is extracted from `[data-test="bop-view"]` using h2/`nextElementSibling`. Classification proceeds via OFF stateless ingredient analysis → local classifier.

**Rationale:** `[data-test="bop-view"]` is part of Morrisons' own automated test suite, making it the most stable available selector. Ingredient-only classification is the only viable path given no barcode is exposed.

**Consequences:**
- Ingredient analysis works for all labelled products
- Fresh produce (no ingredient h2 present) correctly returns null → NOVA 1 fast-path
- No barcode lookup means classification relies entirely on ingredient text analysis; accuracy is lower than for sites with barcode access

---

## ADR-010: Extend NOVA3\_PROCESSING\_RE with Food Additive Category Names

**Status:** Accepted | **Date:** 2026-03-18

**Context:** Some processed products list additive classes by name (e.g. "Added Ingredients: Acidity Regulators (Citric Acid, Lactic Acid)") rather than by individual additive. This pattern was not matched by the existing `NOVA3_PROCESSING_RE`, causing misclassification as NOVA 2.

**Decision:** Added `acidity regulators?|stabilisers?|humectants?` to `NOVA3_PROCESSING_RE`. `antioxidant` and `preservative` are explicitly excluded — the NOVA 2 specification states that preserved vinegars and antioxidant-stabilised oils are Group 2 products.

**Consequences:**
- Products listing additive categories by name classified correctly as NOVA 3
- Sunflower oil with antioxidants and vinegar with preservatives remain NOVA 2

---

## ADR-011: Ocado — BOP API for Ingredient Extraction

**Status:** Accepted | **Date:** 2026-03-18

**Context:** Ocado does not expose EAN-13 barcodes on product pages. CSS class names are obfuscated hashes; almost no `data-testid` attributes exist on PDPs, making DOM selectors fragile.

**Decision:** Use the BOP product API (`/api/webproductpagews/v5/products/bop?retailerProductId={id}`) as the primary ingredient source, reading the field with `title === "ingredients"`. The `retailerProductId` is extracted from the last numeric path segment of the PDP URL. DOM h2 text search is retained as a fallback. `extractBarcode()` always returns null.

**Rationale:** The BOP API returns structured product data and is independent of obfuscated CSS class names. The same BOP API family is used by Morrisons, establishing it as a stable pattern across sites.

**Consequences:**
- Stable ingredient extraction that does not depend on page CSS
- No barcode lookup (same limitation as Morrisons)
- `isSupported()` is scoped to `/products/` URLs — category and search pages are excluded

---

## ADR-012: Align Local Indicator Set with OpenFoodFacts Taxonomy

**Status:** Accepted | **Date:** 2026-03-18

**Context:** The local NOVA 4 indicator set in `lib/nova-indicators.js` was originally sourced from Monteiro et al. 2019 functional categories. Testing against common UK products revealed missing additives, particularly in chocolate, processed meats, and packaged bread.

**Decision:** Extended the indicator set by cross-referencing Monteiro 2019 categories against empirical testing using the OFF `/analyze` endpoint. Key additions:
- `E322` — lecithin (soy/sunflower emulsifier; prevalent in chocolate)
- `E442` — ammonium phosphatides (cocoa emulsifier)
- `E471` — mono- and diglycerides of fatty acids (very common in bread and margarines)
- `E250` / `E252` — nitrites/nitrates (processed meats)
- Plain-language patterns: lecithin, dextrose, maltodextrin, natural flavour(ing)

**Rationale:** The local classifier is the fallback for products not covered by the OFF API. Aligning it with additives prevalent in UK products reduces false negatives. OpenFoodFacts does not publish an authoritative NOVA 4 E-number list; the additions were derived empirically.

**Consequences:**
- Improved coverage for chocolate, bread, and processed meat products in the fallback path
- The indicator set remains an approximation; the OFF API result takes precedence whenever available


---

## ADR-013: Incognito Mode — Skip Persistent Cache Writes

**Status:** Accepted | **Date:** 2026-03-22

**Context:** Chrome's extension privacy best practices require that extensions "not save browsing history from private windows." When a user browses a supermarket product page in incognito, the extension was writing barcode lookups and ingredient hashes to `chrome.storage.local` with a 7-day TTL. This created a persistent record of which products the user viewed in a private session.

**Decision:** Detect `sender.tab.incognito` in the service worker message handler and pass `isIncognito` into `lookupProduct()` and `analyzeIngredients()`. Both functions skip all `setCached()` writes when `isIncognito` is true.

Reading from the existing cache in incognito is still permitted — a cache hit reveals nothing about the current incognito session (only that the same product was looked up at some prior point in regular browsing).

**Why not skip caching entirely (reads too)?** Blocking cache reads in incognito would add unnecessary API calls and latency. The cached data (barcode → NOVA score) is not personally identifiable; only the *act of writing* from an incognito session would reveal private browsing behaviour.

**Why not use `activeTab` instead of `host_permissions`?** `activeTab` only grants access when the user explicitly invokes the extension (toolbar click). Our extension injects content scripts passively on page load, so `host_permissions` are required and correct.

**Consequences:**
- Compliant with Chrome's user privacy guidance on incognito mode
- Classification still works in incognito (API calls proceed; per-tab session state still saves as it is cleared on tab close)
- No performance impact for regular browsing; incognito sessions pay a small cost for repeated lookups of the same product across sessions

**Update (2026-03-24):** Extended incognito handling to default the extension off entirely in incognito windows. Content scripts detect `chrome.extension.inIncognitoContext` and bail out before any badge injection or API calls. The user can opt in for a specific incognito session via the popup — state stored in `chrome.storage.session` (auto-cleared when the incognito window closes). This exceeds the Chrome guidance requirement (which only mandates blocking local storage writes in incognito) and ensures no barcodes are sent to OpenFoodFacts in private browsing without explicit user consent.

---

## ADR-014: Move ASDA Authenticated API Call to Service Worker

**Date:** 2026-03-22
**Status:** Accepted

**Context:**
Chrome's extension security guidelines recommend performing network requests in the service
worker rather than content scripts. `content/sites/asda.js:_fetchProductData()` was making
an authenticated request to ASDA's product API directly from the content script context.
This was the only site adapter making API calls outside the service worker.

**Options Considered:**
1. Keep API call in content script — simple, but violates Chrome security guidelines
2. Move cookie extraction + API call both to service worker — requires `cookies` API
   permission, which is overly broad; HttpOnly cookies not accessible this way anyway
3. Extract token in content script (same-origin access, no new permissions needed),
   pass to service worker for the actual API call — minimal change, complies with guidelines

**Decision:** Option 3. Content script extracts `SLAS.AUTH_TOKEN` from `document.cookie`
(its legitimate same-origin access), passes it with the product ID via a `FETCH_ASDA_PRODUCT`
message. Service worker makes the authenticated fetch via `background/asda-api.js`.

**Consequences:**
- ASDA product API now runs in service worker, consistent with OpenFoodFacts API pattern
- No new permissions required
- `background/asda-api.js` is independently testable via Jest (dual `typeof module` export pattern)
- Incognito flag available in service worker handler for future cache-skip logic

---

## ADR-015: Delegate Sainsbury's and Ocado API Calls to Service Worker

**Date:** 2026-03-22
**Status:** Accepted

**Context:**
Chrome's extension security guidelines state that `fetch()` calls must not be made from
content scripts, because content scripts run in the same renderer process as the web page
and are vulnerable to side-channel attacks (e.g. Spectre). ADR-014 established the
reference pattern for ASDA. A subsequent audit of all six adapters found that two still
made direct `fetch()` calls from content scripts:
- `content/sites/sainsburys.js`: GOL API call in `extractBarcodes()`
- `content/sites/ocado.js`: BOP API call in `extractIngredients()`

Both calls were same-origin relative URLs relying on automatic cookie propagation. The
other four adapters (Tesco, Morrisons, Waitrose, and ASDA) required no changes.

**Options Considered:**
1. Leave as-is — same-origin cookies work, risk is theoretical
2. Delegate both calls to service worker following ADR-014 pattern — consistent,
   compliant, content scripts become fetch-free

**Decision:** Option 2. Both adapters now send `browser.runtime.sendMessage` to the
service worker:
- Sainsbury's: `FETCH_SAINSBURYS_BARCODES` → `background/sainsburys-api.js`
- Ocado: `FETCH_OCADO_INGREDIENTS` → `background/ocado-api.js`

The content scripts no longer contain `fetch()` calls. An optional `cookieHeader`
parameter is accepted by both service worker API functions to support session-authenticated
requests if the endpoints require it in future; omitted by default.

**Consequences:**
- All six site adapters are now fetch-free in the content script context
- Consistent with ADR-014 and Chrome security guidelines
- `background/sainsburys-api.js` and `background/ocado-api.js` are independently
  testable via Jest (dual `typeof module` export pattern)
- If either endpoint requires session cookies, the content script can extract the
  relevant cookie value and pass it in the message without needing the `cookies` permission

---

## ADR-016: AES-256-GCM encryption for local cache
**Date:** 2026-03-22
**Status:** Accepted

**Context:**
The Chrome Web Store User Data FAQ requires that stored user data be protected using "a strong encryption method such as RSA or AES." The extension caches NOVA scores and product names in `chrome.storage.local`. While this storage is sandboxed to the extension, adding application-level encryption satisfies the policy requirement explicitly.

**Options Considered:**
1. No encryption — argue cached NOVA scores are not personal data (risky, policy language is broad)
2. AES-256-GCM with a generated per-install key stored in `chrome.storage.local` (chosen)
3. AES-256-GCM with a key derived from a fixed constant (weaker — same key for all installs)

**Decision:**
Generate a random 256-bit AES-GCM key on first install, persist as raw base64 in `chrome.storage.local._enc_key`, and encrypt all `off_*` and `ingredients_*` cache values. Key is cached in memory for the service worker session. Legacy unencrypted entries are treated as cache misses and removed on next read.

`debugMode` (a boolean UI preference) is not encrypted — it contains no personal or sensitive data.

**Consequences:**
- All new cache entries are AES-256-GCM encrypted ✅
- Existing unencrypted entries are flushed transparently on first read ✅
- No user-visible change — cache still works, Clear Cache button still works ✅
- Slight latency increase on first cache operation (key generation ~1ms) — negligible ✅
- Key loss (e.g. storage wipe) causes a full cache miss, not data loss ✅
