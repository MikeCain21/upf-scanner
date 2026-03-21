# DEVELOPMENT.md - Developer Guide

**Project:** UPF Scanner
**Last Updated:** 2026-03-21

> Complete setup and workflow guide. If you have never used a terminal before, start at the beginning — every step is explained.

---

## Table of Contents
1. [What is this guide?](#what-is-this-guide)
2. [Prerequisites](#prerequisites)
3. [Opening a terminal](#opening-a-terminal)
4. [First-time setup](#first-time-setup)
5. [Running tests](#running-tests)
6. [What the tests check](#what-the-tests-check)
7. [If a test fails](#if-a-test-fails)
8. [Loading the extension in Chrome](#loading-the-extension-in-chrome)
9. [Development workflow](#development-workflow)
10. [Project structure](#project-structure)
11. [Browser integration tests](#browser-integration-tests)
12. [Building for distribution](#building-for-distribution)

---

## What is this guide?

This is the complete guide for setting up and working on the UPF Scanner. It covers:

- Installing the tools you need
- Getting the project running on your machine
- Running the automated tests
- Loading the extension in Chrome to try it manually
- The day-to-day development loop

**If you have never used a terminal before:** read from top to bottom. Every step is spelled out. You do not need to understand everything — just follow the steps in order.

---

## Prerequisites

You need three things installed before you can work on this project. Check whether you already have them, then install anything missing.

### 1. Node.js (version 18 or higher)

Node.js lets you run JavaScript outside a browser — it is what runs the automated tests.

**Check if you have it:**
```
node --version
```
You should see something like `v20.11.0`. Any number starting with `v18` or higher is fine.

**Install it (if missing):**
- Go to https://nodejs.org
- Download the **LTS** version (the left button — "Recommended For Most Users")
- Run the installer and follow the steps
- Re-open your terminal and run `node --version` again to confirm

### 2. Google Chrome

The extension only runs in Chrome.

**Install it (if missing):**
- Go to https://www.google.com/chrome
- Download and install

### 3. Git

Git is used for version control (tracking changes).

**Check if you have it:**
```
git --version
```
You should see something like `git version 2.43.0`.

**Install it (if missing):**
- **macOS:** Run `xcode-select --install` in the terminal, or download from https://git-scm.com
- **Windows:** Download from https://git-scm.com/download/win and run the installer
- **Linux:** Run `sudo apt install git` (Ubuntu/Debian) or `sudo dnf install git` (Fedora)

### 4. A code editor (recommended)

You need a text editor to read and change the code. We recommend VS Code.

- Go to https://code.visualstudio.com
- Download and install

---

## Opening a terminal

A terminal is a text window where you type commands.

**macOS:** Open Spotlight (Cmd+Space), type `Terminal`, press Enter.

**Windows:** Press the Windows key, type `Terminal` or `Command Prompt`, press Enter.
(If you installed Git, you can also use "Git Bash" from the Start menu.)

**Linux:** Press Ctrl+Alt+T, or search for "Terminal" in your applications.

You will see a prompt — a line ending in `$` (macOS/Linux) or `>` (Windows). This is where you type commands.

---

## First-time setup

Do this once when you first get the project onto your machine.

**Step 1 — Get the code:**
```
git clone https://github.com/MikeCain21/upf-scanner.git
```
This creates a folder called `upf-scanner` containing all the project files.

**Step 2 — Move into the folder:**
```
cd upf-scanner
```
All commands from here on must be run from inside this folder.

**Step 3 — Install dependencies:**
```
npm install
```
This downloads Jest (the test runner) into a `node_modules` folder. It takes about 30 seconds. You will see some text scroll by — that is normal.

**Step 4 — Verify everything works:**
```
npm test
```
You should see output like this:
```
PASS test/unit/nova-classifier.test.js
PASS test/unit/nova-indicators.test.js
...

Tests:   X passed, X total
```

If you see all tests passing in green, setup is complete.

---

## Running tests

There are three test commands. Use whichever suits what you are doing.

### Run once

```
npm test
```

Runs all tests and prints the result. Use this to check everything is working before committing a change.

**Example output (all passing):**
```
PASS test/unit/nova-classifier.test.js
PASS test/unit/nova-indicators.test.js
PASS test/unit/openfoodfacts.test.js
PASS test/unit/ingredient-parser.test.js
PASS test/unit/base-adapter.test.js
PASS test/unit/registry.test.js
PASS test/unit/sainsburys-adapter.test.js
PASS test/unit/asda-adapter.test.js
PASS test/unit/waitrose-adapter.test.js
PASS test/unit/morrisons-adapter.test.js

Tests:   X passed, X total
Time: ~0.4s
```

### Watch mode (re-runs on save)

```
npm run test:watch
```

Keeps running in the background. Every time you save a file, it re-runs the affected tests automatically. This is the most useful mode when you are actively editing code.

Press `q` to quit watch mode.

### Verbose output (shows every test name)

```
npm run test:verbose
```

Same as `npm test` but prints every individual test name, not just the group names. Use this when a failure message is unclear and you want to see exactly which tests are passing and which are not.

---

## What the tests check

There are 10 test files. Run `npm test` to execute all of them.

| Test file | What it covers |
|-----------|---------------|
| `nova-classifier.test.js` | NOVA 1–4 classification logic — score derivation, confidence, edge cases |
| `nova-indicators.test.js` | Ultra-processed ingredient detection — E-numbers, modified starches, flavourings, protein isolates |
| `openfoodfacts.test.js` | OpenFoodFacts API v3 integration — barcode lookup, response parsing, error handling |
| `ingredient-parser.test.js` | Ingredient string tokenisation — parentheses, brackets, percentages, sub-groups |
| `base-adapter.test.js` | Shared site adapter base class — URL matching, product extraction interface |
| `registry.test.js` | Site adapter registry — adapter lookup by hostname |
| `sainsburys-adapter.test.js` | Sainsbury's-specific extraction — URL detection, ingredient parsing |
| `asda-adapter.test.js` | Asda-specific extraction — URL detection, ingredient parsing |
| `waitrose-adapter.test.js` | Waitrose-specific extraction — URL detection, ingredient parsing |
| `morrisons-adapter.test.js` | Morrisons-specific extraction — URL detection, ingredient parsing |

**`ingredient-parser.test.js` in detail** (22 tests):

*Edge cases (3 tests):*
- `null` input → returns `null`
- Empty string `""` → returns `null`
- Whitespace-only `"   "` → returns `null`

*Real product fixtures (19 tests across 5 products):*

| Product | What is tested |
|---------|---------------|
| Apples | Single-ingredient string → 1 token |
| Coke | Round parentheses not split — `Colour (Caramel E150d)` stays as one token |
| Yoghurt | Percentages preserved — `Sugar 6.1%` stays intact |
| Bread | Square brackets not split — `Wheat Flour [with Calcium, Iron...]` stays as one token |
| HotDogs | Colon sub-groups and nested parentheses — `Hotdogs: 65% Mechanically Separated Chicken` and `Stabilisers (Triphosphates, Polyphosphates)` each stay as one token |

These fixtures use actual ingredient strings from real Tesco product pages.

---

## If a test fails

A failing test looks like this:

```
FAIL test/ingredient-parser.test.js

  ● Bread — square brackets must not be split › produces exactly 14 tokens

    expect(received).toHaveLength(expected)

    Expected length: 14
    Received length: 15

      108 |   it('produces exactly 14 tokens', () => {
    > 109 |     expect(result).toHaveLength(14);
          |                    ^
```

**How to read it:**
- The line starting with `●` tells you which test failed and what it is inside
- `Expected` is what the test wanted; `Received` is what the code actually produced
- The `>` arrow shows you the exact line in the test file that failed

**Where to look first:**
- The test name (e.g. "Bread — square brackets must not be split") tells you which product fixture failed
- Compare `Expected` vs `Received` to understand what changed
- Open `lib/ingredient-parser.js` — that is the only file the tests exercise

**If you did not intentionally change anything:**
- Run `git status` to see which files were modified
- Run `git diff` to see exactly what changed

---

## Loading the extension in Chrome

This is how you install the extension in Chrome so you can test it on a real Tesco page.

**Step 1 — Open the Extensions page:**
Open Chrome and navigate to:
```
chrome://extensions
```

**Step 2 — Enable Developer mode:**
In the top-right corner of the Extensions page, find the "Developer mode" toggle and turn it on. A row of buttons will appear.

**Step 3 — Load the extension:**
Click **"Load unpacked"**. A file browser opens. Navigate to and select the `upf-scanner` folder (the root of this project — the folder that contains `manifest.json`). Click "Select".

The extension should now appear in the list with the name "UPF Scanner".

**Step 4 — Pin it to the toolbar (optional):**
Click the puzzle-piece icon (🧩) in the Chrome toolbar → find "UPF Scanner" → click the pin icon to keep it visible.

**Reloading after making changes:**
After editing any extension file, you must reload the extension for the changes to take effect. On the Extensions page, find the UPF Scanner card and click the circular reload button (↺). You do not need to "Load unpacked" again.

**Opening the DevTools console on a Tesco page:**
1. Navigate to any Tesco product page (e.g. search for "bread" on tesco.com)
2. Right-click anywhere on the page → click "Inspect"
3. Click the "Console" tab
4. Look for lines starting with `[UPF Scanner]` — these are logs from the extension

---

## Development workflow

The day-to-day loop for working on this project:

```
1. Edit a file in lib/ or content/
2. Run: npm test
   → All tests should still pass
3. If a test fails, fix the code until it passes
4. Reload the extension in Chrome (↺ button on chrome://extensions)
5. Open a Tesco page, check the Console for the expected output
6. Repeat
```

**For logic code in `lib/`:** write or update the corresponding test in `test/unit/` first, then implement.

**For DOM extraction code in `content/`:** the Jest tests do not cover DOM code (no browser in Jest). Test by loading the extension in Chrome and verifying against a live Tesco page. For badge rendering, use `test/manual/badge-display.html` (open directly in Chrome, no server needed).

**Committing changes:**

Before committing, always run `npm test` and make sure all tests pass. Then:
```
git add lib/nova-classifier.js test/unit/nova-classifier.test.js
git commit -m "Your description of what changed"
```

---

## Project structure

```
upf-scanner/
│
├── manifest.json              Chrome extension manifest (version, permissions, files)
├── package.json               npm config: test scripts, Jest dependency
│
├── background/
│   └── service-worker.js      Background service worker (API calls, caching)
│
├── content/                   Scripts injected into supermarket pages
│   ├── main.js                Entry point: detects products, calls parser, shows badges
│   ├── sites/
│   │   ├── site-adapter.js    Interface definition (documentation only)
│   │   ├── base-adapter.js    Shared base class for all site adapters
│   │   ├── registry.js        Adapter registry — maps hostnames to adapters
│   │   ├── tesco.js           Tesco-specific extractor
│   │   ├── sainsburys.js      Sainsbury's-specific extractor
│   │   ├── asda.js            Asda-specific extractor
│   │   ├── waitrose.js        Waitrose-specific extractor
│   │   ├── morrisons.js       Morrisons-specific extractor
│   │   └── ocado.js           Ocado-specific extractor
│   └── ui/
│       └── styles.css         Badge and tooltip styles injected into the page
│
├── lib/                       Shared logic (no DOM dependencies — testable with Jest)
│   ├── ingredient-parser.js   Splits ingredient strings into token arrays
│   ├── nova-classifier.js     Classifies products NOVA 1–4 from tokens
│   ├── nova-indicators.js     Ultra-processed ingredient indicator database
│   ├── openfoodfacts.js       OpenFoodFacts API v3 client (barcode lookup)
│   └── browser-polyfill.js    Chrome/Firefox API compatibility shim
│
├── popup/                     The small window that appears when you click the icon
│   ├── popup.html
│   └── popup.js
│
├── icons/                     Extension icons (16×16, 32×32, 48×48, 128×128)
│
├── test/
│   ├── unit/                          Jest unit tests (run via npm test)
│   │   ├── nova-classifier.test.js
│   │   ├── nova-indicators.test.js
│   │   ├── openfoodfacts.test.js
│   │   ├── ingredient-parser.test.js
│   │   ├── base-adapter.test.js
│   │   ├── registry.test.js
│   │   ├── sainsburys-adapter.test.js
│   │   ├── asda-adapter.test.js
│   │   ├── waitrose-adapter.test.js
│   │   └── morrisons-adapter.test.js
│   ├── connectivity/                  Live API tests (npm run test:connectivity)
│   │   └── openfoodfacts-connectivity.test.js
│   └── manual/                        Browser-only tools (open in Chrome, not npm test)
│       ├── tesco-dom-regression.js    Paste into DevTools console
│       ├── badge-display.html         Badge rendering harness
│       ├── test-integration.html      Full pipeline harness
│       └── test-runner.html           General test runner
│
└── docs/
    ├── PROJECT_PLAN.md        10-phase implementation roadmap
    ├── DECISIONS.md           Architecture Decision Records (why things are the way they are)
    ├── TESTING.md             Testing guide (all test types explained)
    ├── DEVELOPMENT.md         This file
    ├── API.md                 OpenFoodFacts API integration details
    └── CLASSIFICATION_LOGIC.md  NOVA classification rules and indicators
```

---

## Browser integration tests

Some things cannot be tested with Jest because they require a real browser:
- Badge rendering and CSS appearance
- Tooltip behaviour

For these, use `test/badge-display.html`. Open it directly in Chrome (no server needed) — it's self-contained and runs automated checks plus a visual checklist.

---

## Building for distribution

There is no build step — the extension files are used directly by Chrome.

To share the extension or submit it to the Chrome Web Store, create a zip file of the project, excluding development-only files:

**On macOS/Linux:**
```
zip -r upf-scanner.zip . \
  --exclude "*.git*" \
  --exclude "node_modules/*" \
  --exclude "test/*" \
  --exclude "docs/*" \
  --exclude "*.md"
```

**On Windows (Command Prompt):**
Use a file manager to select all files and folders except `test/`, `docs/`, `node_modules/`, and `.git/`, then right-click → "Send to" → "Compressed (zipped) folder".

The zip file should contain: `manifest.json`, `background/`, `content/`, `lib/`, `popup/`, `icons/`.

---

*End of DEVELOPMENT.md*
