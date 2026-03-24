# Security Review — UPF Scanner

> **Audience:** Developers, security reviewers, and privacy-conscious users wanting to inspect what this extension does.

---

## Permissions Audit

### Declared Permissions (`manifest.json`)

| Permission | Scope | Justification |
|-----------|-------|---------------|
| `storage` | `chrome.storage.local` and `chrome.storage.session` | Cache product classifications; store per-tab NOVA state |
| Host: `https://www.tesco.com/*` | Content script injection | Content script scoped to product detail pages only; required to read product DOM and inject NOVA badges |
| Host: `https://www.sainsburys.co.uk/*` | Content script injection | Content script scoped to product detail pages only; required to read product DOM and inject NOVA badges |
| Host: `https://www.asda.com/*` | Content script injection | Content script scoped to product detail pages only; required to read product DOM and inject NOVA badges |
| Host: `https://groceries.morrisons.com/*` | Content script injection | Content script scoped to product detail pages only; required to read product DOM and inject NOVA badges |
| Host: `https://www.waitrose.com/*` | Content script injection | Content script scoped to product detail pages only; required to read product DOM and inject NOVA badges |
| Host: `https://www.ocado.com/*` | Content script injection | Content script scoped to product detail pages only; required to read product DOM and inject NOVA badges |
| Host: `https://world.openfoodfacts.org/*` | Fetch calls from service worker | Look up NOVA scores and ingredient classifications |

### Permissions NOT Requested

The extension deliberately does **not** request:

- `tabs` — cannot read your tab list or browsing history
- `history` — cannot access browser history
- `cookies` — cannot read or set cookies
- `webRequest` / `declarativeNetRequest` — cannot intercept network traffic
- `clipboardRead` / `clipboardWrite` — cannot access clipboard
- `geolocation` — cannot access location
- `identity` — no user account or sign-in
- `externally_connectable` (matches) — web pages cannot message the extension; declared with `ids: []` to explicitly block all other extensions too

### Incognito Mode Behaviour

The extension defaults to **off** in incognito windows — no content script activity, no API calls to OpenFoodFacts. If the user has enabled "Allow in Incognito" for the extension in Chrome settings, they can opt in for a specific session via the popup. Session state is stored in `chrome.storage.session`, which Chrome clears automatically when the incognito window closes.

This behaviour exceeds the Chrome guidance requirement (which mandates blocking only local storage writes in incognito). No barcodes are sent to OpenFoodFacts in private browsing without explicit user consent.

---

## Data Flows

### What Leaves Your Machine

| Data | Destination | Trigger | Purpose |
|------|-------------|---------|---------|
| EAN-13 barcode | `world.openfoodfacts.org/api/v2/product/{barcode}.json` | On each supported supermarket product page load | Look up cached NOVA score |
| Ingredient text (public label data) | `world.openfoodfacts.org/api/v3/product/test` | When barcode lookup returns no NOVA score | Classify by ingredients |

**Nothing else leaves your machine.** In particular, the following are never transmitted:

- Your IP address is not exposed beyond what a normal HTTPS request reveals to the server (standard for all internet traffic)
- No browsing URLs, page content, or navigation patterns
- No cookies, account credentials, or session tokens
- No personal information of any kind

### Network Security

- All requests use **HTTPS only** — no HTTP fallbacks
- Fetch calls have explicit timeouts (8s barcode lookup, 10s ingredient analysis)
- All external API calls (OpenFoodFacts, and each retailer's own product API) are made exclusively from the background **service worker** — content scripts are fetch-free. This is enforced for all six supported adapters as of ADR-014/ADR-015.

---

## Local Storage

### `chrome.storage.local` (persists across browser restarts, never synced cross-device)

| Key pattern | Contents | TTL |
|-------------|---------|-----|
| `off_{barcode}` | `{ novaScore, productName, markers, offUrl, timestamp }` | 7 days |
| `ingredients_{ingredientHash}` | Same structure — key is a djb2 hex hash of the ingredient text, so reformulated products automatically bust the cache | 7 days |
| `debugMode` | `boolean` | Until cleared by user |

No PII is stored. The cache can be cleared at any time via the popup "Clear Cache" button.

Cache entries are encrypted at rest using **AES-256-GCM** (`lib/storage-crypto.js`) with a per-install random key. Raw classification data is never written to `chrome.storage.local` in plaintext.

**Incognito tabs:** Cache writes are skipped entirely when the request originates from an incognito tab, preventing product lookups from being persisted across private browsing sessions. Cache reads are still permitted (a cache hit reveals nothing about the current session).

### `chrome.storage.session` (cleared on browser restart)

| Key pattern | Contents | Lifetime |
|-------------|---------|---------|
| `nova_tab_{tabId}` | `{ novaScore, productName, barcode, markers }` — the NOVA result for the active product on that tab | Until the tab is closed or navigates to a new URL |

This is used to display the current product's NOVA score in the popup without requiring a fresh lookup. It is explicitly cleared via `chrome.tabs.onRemoved` and `chrome.tabs.onUpdated` listeners, and is wiped automatically when the browser closes.

---

## Code Execution Model

### Manifest V3 Guarantees

- **No remote code execution:** Chrome's MV3 policy blocks loading scripts from remote URLs. All JavaScript is bundled at install time and reviewed during Chrome Web Store publication.
- **No persistent background page:** The service worker is terminated when idle. No code runs continuously in the background.
- **No `eval()` or `new Function()`:** Zero dynamic code execution vectors anywhere in the codebase.
- **No CDN-loaded scripts:** All dependencies are local.

### Content Script Isolation

- The content script runs in an **isolated world** — it cannot access the page's JavaScript variables or `localStorage`.
- DOM modifications are limited to injecting badge elements alongside product listings.
- All user-visible text is set via `textContent`. `innerHTML` is not used anywhere in the extension; badge DOM updates use `replaceChildren()`, preventing XSS.

### Message Passing Security

- The background service worker validates that messages originate from a supported supermarket tab (tesco.com, sainsburys.co.uk, asda.com, morrisons.com, waitrose.com, ocado.com) before processing them.
- `externally_connectable` is declared with `ids: []` and no `matches`, explicitly blocking all other extensions and web pages from messaging the extension.
- Message payloads are validated by `background/message-validator.js` before processing:
  - `novaScore` must be an integer in range 1–4
  - `barcode` must be a 12- or 13-digit numeric string
  - `ingredientsText` is capped at 50,000 characters
  - `tabId` must be a positive integer; `productName` is clamped to 200 characters
- Popup-only handlers (`GET_PAGE_NOVA`, `CLEAR_CACHE`) are gated on `!sender.tab`, preventing content scripts from invoking them even from allowed origins.
- ASDA auth tokens are rejected if they contain `\r` or `\n` characters, preventing HTTP header injection.

---

## Threat Model

### What an Attacker Would Need to Exploit This Extension

| Attack Vector | Feasibility | Mitigation |
|--------------|-------------|------------|
| Malicious OpenFoodFacts response | Low | Responses are parsed with validation; no `eval()` on response data |
| XSS via ingredient text | Low | Ingredient text is set via `textContent` only |
| Content script → background message injection | Very Low | Sender origin validated with exact equality against all 6 supported supermarkets; payloads validated (score, barcode, text length) by `message-validator.js`; popup-only handlers gated on `!sender.tab`; `externally_connectable` blocks all other extensions and web pages |
| Supply chain (npm) | Low | No runtime npm dependencies; all code is bespoke |
| Injection via dynamic API parameters | Very Low | All dynamic values (barcodes, product IDs, SKUs) are URL-encoded before use in fetch URLs across all adapters |
| Local storage read (e.g. by another extension) | Very Low | Cache entries encrypted with AES-256-GCM; ciphertext is useless without the per-install key |

### What This Extension Cannot Do

Even if fully compromised, the extension **cannot**:

- Read your browsing history or tabs
- Access other websites' content
- Intercept or modify network requests
- Read or write cookies
- Access your clipboard
- Exfiltrate data to any destination other than `world.openfoodfacts.org`

---

## OpenFoodFacts

OpenFoodFacts is an open-source, nonprofit food data project. Their privacy policy is available at: https://world.openfoodfacts.org/privacy

Queries to their API may be logged server-side (as with any HTTP server). The only data sent is barcode numbers and ingredient text — both public information found on food packaging.

---

## Reporting Vulnerabilities

**Please do not report security vulnerabilities through public GitHub issues.**

Use GitHub's private security advisory feature:
1. Go to the [Security tab](https://github.com/MikeCain21/upf-scanner/security) of this repository
2. Click **Report a vulnerability**
3. Fill in the details

We'll acknowledge your report within 48 hours and aim to release a fix within 14 days for critical issues.
