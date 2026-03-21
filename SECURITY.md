# Security Review — UPF Scanner

> **Audience:** Developers, security reviewers, and privacy-conscious users wanting to inspect what this extension does.

---

## Permissions Audit

### Declared Permissions (`manifest.json`)

| Permission | Scope | Justification |
|-----------|-------|---------------|
| `storage` | `chrome.storage.local` and `chrome.storage.session` | Cache product classifications; store per-tab NOVA state |
| Host: `https://www.tesco.com/*` | Content script injection | Required to read product pages and inject NOVA badges |
| Host: `https://www.sainsburys.co.uk/*` | Content script injection | Required to read product pages and inject NOVA badges |
| Host: `https://www.asda.com/*` | Content script injection | Required to read product pages and inject NOVA badges |
| Host: `https://groceries.morrisons.com/*` | Content script injection | Required to read product pages and inject NOVA badges |
| Host: `https://www.waitrose.com/*` | Content script injection | Required to read product pages and inject NOVA badges |
| Host: `https://www.ocado.com/*` | Content script injection | Required to read product pages and inject NOVA badges |
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
- `externally_connectable` — web pages cannot message the extension

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
- OpenFoodFacts is contacted only from the background **service worker**, never from injected content scripts

---

## Local Storage

### `chrome.storage.local` (persists across browser restarts, never synced cross-device)

| Key pattern | Contents | TTL |
|-------------|---------|-----|
| `off_{barcode}` | `{ novaScore, productName, markers, offUrl, timestamp }` | 7 days |
| `ingredients_{ingredientHash}` | Same structure — key is a djb2 hex hash of the ingredient text, so reformulated products automatically bust the cache | 7 days |
| `debugMode` | `boolean` | Until cleared by user |

No PII is stored. The cache can be cleared at any time via the popup "Clear Cache" button.

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
- All user-visible text is set via `textContent`, never `innerHTML` with dynamic data, preventing XSS.

### Message Passing Security

- The background service worker validates that messages originate from a supported supermarket tab (tesco.com, sainsburys.co.uk, asda.com, morrisons.com, waitrose.com, ocado.com) before processing them.
- `externally_connectable` is not declared, so arbitrary web pages cannot message the extension.

---

## Threat Model

### What an Attacker Would Need to Exploit This Extension

| Attack Vector | Feasibility | Mitigation |
|--------------|-------------|------------|
| Malicious OpenFoodFacts response | Low | Responses are parsed with validation; no `eval()` on response data |
| XSS via ingredient text | Low | Ingredient text is set via `textContent` only |
| Content script → background message injection | Very Low | Sender origin validated against all 6 supported supermarkets (derived dynamically from manifest); no `externally_connectable` |
| Supply chain (npm) | Low | No runtime npm dependencies; all code is bespoke |
| Barcode injection via JSON-LD | Very Low | Barcodes URL-encoded before use in fetch URLs |

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
