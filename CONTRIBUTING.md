# Contributing to UPF Scanner

Thank you for your interest in contributing! This document explains how to get started.

---

## Development Setup

```bash
git clone https://github.com/MikeCain21/upf-scanner.git
cd upf-scanner
npm install
npm test        # Run all 346 unit tests
```

Load the extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder

---

## Running Tests

```bash
npm test                    # All unit tests (fast, no network)
npm run test:watch          # Watch mode during development
npm run test:coverage       # Tests + per-file coverage report
npm run test:connectivity   # Live OpenFoodFacts API tests (requires network)
npm run lint                # ESLint — must pass before submitting a PR
npm run format              # Prettier — auto-format source files
```

All unit tests and lint must pass before submitting a PR. Connectivity tests are informational only.

---

## Adding a Supermarket Adapter

Each supermarket has its own adapter in `content/sites/`. Here's how to add one:

### 1. Spike first (required)

Before writing any code, spend 30 minutes on the target site:
- Find the barcode (look for `gtin13` in JSON-LD, or script tags with product data)
- Find the ingredient text (inspect the DOM on a PDP)
- Document findings in a comment at the top of the new adapter file

### 2. Create the adapter

Copy the structure from an existing adapter (e.g. `content/sites/tesco.js`). Your adapter must:

- `extend BaseAdapter` (from `content/sites/base-adapter.js`)
- Implement `get SITE_ID()`, `isSupported(url)`, `isMainProduct(el)`, `detectProducts(doc)`, `extractProductInfo(el)`, `extractBarcode(doc)`, `extractIngredients(doc)`
- Use `data-*` attributes or stable IDs — never obfuscated CSS class names
- Handle errors gracefully (try/catch on all JSON parsing and DOM queries)
- Self-register: `registry.register(new YourAdapter())`
- Export for Jest: `module.exports = { YourAdapter }`

### 3. Add to manifest.json

Add a new `content_scripts` entry in `manifest.json` following the existing pattern.

### 4. Write tests

Add `test/your-site-adapter.test.js`. See `test/tesco-adapter.test.js` as a reference. Test:
- `isSupported()` with valid and invalid URLs
- `detectProducts()` with mock DOM
- `extractBarcode()` and `extractIngredients()` with realistic HTML fixtures

### 5. Submit

- `npm test` must pass
- Manual verification on a live product page
- PR description includes a screenshot of the badge appearing

---

## Code Style

- ES6+: `const`/`let`, arrow functions, async/await, destructuring
- JSDoc on all public methods
- Early returns for guard clauses
- Constants for magic strings (`const SITE_ID = 'mysite'`)
- No `var`, no global namespace pollution

See `CLAUDE.md` for the full style guide.

---

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes with atomic commits (one logical change per commit)
3. Ensure `npm test` passes
4. Open a PR — the PR template will guide you through what to include
5. A maintainer will review and merge

---

## Reporting Bugs

Use the [bug report template](https://github.com/MikeCain21/upf-scanner/issues/new?template=bug_report.md).

---

## Licence

By contributing, you agree that your contributions will be licensed under the MIT Licence.
