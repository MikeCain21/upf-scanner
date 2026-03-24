# Chrome Web Store Listing Copy

## Summary (124 chars / 132 char limit)

Spot UPF while you shop. Automatic NOVA 1–4 badges across major UK supermarkets including Tesco, Sainsbury's, ASDA and more.

## Description

You already read labels and avoid ultra-processed food — but online supermarkets make it hard. Ingredients are buried, NOVA scores are never shown, and checking every product mid-shop breaks your flow.

UPF Scanner fixes that. It automatically displays colour-coded NOVA 1–4 badges on product pages, so you can spot ultra-processed food before it goes in your basket.

What you get:
- NOVA 1–4 badges on product pages
- Hover over any badge to see which ingredients triggered the score
- Covers Tesco, Sainsbury's, ASDA, Morrisons, Waitrose & Ocado
- Powered by OpenFoodFacts barcode lookup with ingredient analysis as fallback
- No account, no tracking, no data collection — runs entirely in your browser
- Pause the extension anytime from the popup; automatically off in incognito mode

Install and browse. Badges appear automatically.

---

## Privacy Dashboard (CWS Developer Dashboard)

### Single Purpose

Display NOVA 1–4 ultra-processed food classification badges on product pages of UK supermarket websites.

### Permissions Justification

| Permission | Why it's needed |
|---|---|
| `storage` | Caches NOVA classifications locally so repeated visits to the same product don't trigger a new API call |
| Host permissions: 6 supermarket domains | Content scripts activate on **product detail pages only** (not search, checkout, or account pages); required to read product DOM and inject NOVA badges |
| Host permission: `world.openfoodfacts.org` | Required for the service worker to call the OpenFoodFacts API for barcode/ingredient lookup |

### Remote Code

**No.** The extension does not load or execute any remotely hosted code. All logic runs from the locally installed extension package (Manifest V3).

### Data Collection

**No user data is collected.** Specifically:

- No personally identifiable information
- No browsing history
- No health or financial information
- No location data
- No authentication information is collected or stored. On ASDA pages, a guest session token (not linked to any user account or login) is temporarily read to call ASDA's own product API; it works even when you are not signed in, is never stored, and is never sent to third parties.

The only external communication is outbound requests to `world.openfoodfacts.org` to look up product NOVA scores by barcode or ingredient list. These requests contain product data (barcode/ingredients) from the page being viewed — no user identity is attached.

NOVA classification results are cached locally in `chrome.storage.local`, encrypted with AES-256-GCM. The encrypted cache never leaves the user's device and is not sent to any server operated by this extension.

In incognito windows, the extension defaults to **off** — no badges are shown and no requests are made to OpenFoodFacts until the user explicitly enables it for the current session via the extension popup. Session state is stored in `chrome.storage.session`, which Chrome automatically clears when the incognito window closes.

### Privacy Policy

https://github.com/MikeCain21/upf-scanner/blob/main/PRIVACY.md
