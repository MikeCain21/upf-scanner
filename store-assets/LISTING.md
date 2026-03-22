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

Install and browse. Badges appear automatically.

---

## Privacy Dashboard (CWS Developer Dashboard)

### Single Purpose

Display NOVA 1–4 ultra-processed food classification badges on product pages of UK supermarket websites.

### Permissions Justification

| Permission | Why it's needed |
|---|---|
| `storage` | Caches NOVA classifications locally so repeated visits to the same product don't trigger a new API call |
| Host permissions: 6 supermarket domains | Required for content scripts to read product page DOM and inject badges |
| Host permission: `world.openfoodfacts.org` | Required for the service worker to call the OpenFoodFacts API for barcode/ingredient lookup |

### Remote Code

**No.** The extension does not load or execute any remotely hosted code. All logic runs from the locally installed extension package (Manifest V3).

### Data Collection

**No user data is collected.** Specifically:

- No personally identifiable information
- No browsing history
- No health or financial information
- No location data
- No authentication information

The only external communication is outbound requests to `world.openfoodfacts.org` to look up product NOVA scores by barcode or ingredient list. These requests contain product data (barcode/ingredients) from the page being viewed — no user identity is attached.

NOVA classification results are cached in `chrome.storage.local` on the user's device only. Nothing is sent to any server operated by this extension.

### Privacy Policy

https://github.com/MikeCain21/upf-scanner/blob/main/PRIVACY.md
