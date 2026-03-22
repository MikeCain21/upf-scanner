# Privacy Notice — UPF Scanner

The UPF Scanner helps you identify ultra-processed foods on UK supermarket websites (Tesco, Sainsbury's, ASDA, Morrisons, Waitrose, and Ocado) by showing a NOVA rating badge on product pages. This notice explains what information the extension uses and where it goes.

---

## What the extension does NOT collect

The extension does **not** collect, store, or transmit:

- Your name, email address, or any account information
- Your browsing history or the URLs of pages you visit
- Cookies, passwords, or login sessions
- Your location
- Any personal information whatsoever

---

## What leaves your device

When you visit a supported supermarket product page, the extension does two things:

**1. Barcode lookup**
The product's barcode (an EAN-13 number printed on the packaging) is sent to [OpenFoodFacts](https://world.openfoodfacts.org/) to retrieve its NOVA score. Example: `3017620422003`. Note: Ocado and Morrisons pages do not expose a barcode, so these sites always use ingredient analysis instead — no barcode is ever sent for those sites.

**2. Ingredient analysis (fallback)**
If OpenFoodFacts doesn't have a NOVA score for that barcode, the ingredient list text — the same text printed on the physical product label — is sent to OpenFoodFacts for analysis.

Both of these are **public food label data**, not personal information. OpenFoodFacts may log these requests as part of normal server operation, the same way any website logs traffic. Their privacy policy is at: https://world.openfoodfacts.org/privacy

**Nothing else is sent anywhere.**

---

## What is stored on your device

The extension stores a small cache in your browser to avoid repeating the same lookups:

- The NOVA score and product name for each barcode you've looked up
- This cache expires automatically after 7 days
- It is stored in your browser's local extension storage — it never leaves your device and is not synced to other devices
- All cached entries are encrypted using AES-256-GCM before being stored

You can clear this cache at any time by opening the UPF Scanner popup and clicking **Clear Cache**.

---

## Authentication tokens (ASDA only)

On ASDA product pages, the extension temporarily reads a **guest session token** from the page to call ASDA's own product API. This token is used by ASDA to serve anonymous browsing sessions — it is not tied to any user account and works even when you are not signed in to ASDA. The token:

- Is not linked to your identity or ASDA account in any way
- Is never stored, logged, or transmitted to any third party
- Is used only to retrieve ingredient and barcode data from ASDA's own servers (the same site you are already browsing)
- Is discarded after the request completes

---

## Permissions

The extension requests only the minimum permissions needed:

- **Storage** — to save the local cache described above
- **Supported supermarket sites** (Tesco, Sainsbury's, ASDA, Morrisons, Waitrose, Ocado) — to read product pages and show NOVA badges
- **OpenFoodFacts.org** — to look up NOVA scores

It cannot access any other websites, read your browsing history, or run in the background when you're not on one of the supported supermarket sites listed above.

---

## Contact

If you have questions about privacy, please open an issue on the project's GitHub repository.
