# CLAUDE.md - Development Guide for Claude

**Last Updated:** 2026-03-21
**Version:** 1.2.1

> **About this file:** This project uses [Claude Code](https://claude.ai/claude-code) for AI-assisted development. This file is the primary instruction document that Claude reads at the start of every session to understand the project's architecture, principles, and conventions. It is intentionally committed to the repo for transparency.
>
> **For human contributors:** See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) instead.
>
> **Note:** References to `docs/PROGRESS.md` and `docs/PROJECT_PLAN.md` below are maintained privately by the maintainer and are not part of the public repository.

---

## Project Context

### Mission
Build a Chrome extension that identifies ultra-processed foods on UK supermarket websites using NOVA classification (1-4) based on ingredient analysis.

- **Use Case:** Inline badges on product listings showing NOVA rating

### Key Technology Decisions
- **Platform:** Chrome Extension (Manifest V3)
- **Data Source:** Barcode-first: extract `gtin13` from JSON-LD → OFF v2 barcode lookup (primary) → OFF v3 stateless ingredient analysis → local rule-based classifier (final fallback). See `docs/DECISIONS.md` for rationale.
- **Approach:** Barcode-first classification — extract barcode from PDP JSON-LD → look up in OFF v2 for NOVA score → fall back to OFF v3 ingredient analysis or local rules
- **Sites supported:** Tesco, Sainsbury's, ASDA, Morrisons, Waitrose, Ocado (each has a dedicated adapter in `content/sites/`)
- **Testing:** Jest unit tests (`npm test`) — all tests must pass (346 tests, all green)
- **Development:** Documentation-first, test-driven

### Success Criteria
- User can browse Supermarket website and see NOVA ratings inline
- Extension doesn't break page functionality or layout
- Reasonably accurate classification (prioritize avoiding false negatives for NOVA 4)
- Fast enough to not impact browsing experience

---

## Development Principles

### 1. Test Before Progress
**Never move to the next phase until current phase tests pass.**
- Each phase has a verification checklist in `docs/PROJECT_PLAN.md`
- ALL checklist items must have ✅ before proceeding
- Log test results in `docs/PROGRESS.md`
- If tests fail, debug until they pass

### 2. Incremental & Verifiable
**Small, testable changes only.**
- Each phase builds on the previous
- Every commit should be working code (don't break main)
- No "big bang" integration - wire components gradually
- Can always demo working functionality at end of session

### 3. Documentation is Code
**Documentation is a first-class deliverable.**
- Update docs BEFORE or DURING implementation (not after)
- Code comments explain "why", not "what"
- Every architectural decision goes in `docs/DECISIONS.md`

### 4. User Testing Data Required
**Use real data, not mocked data.**
- Don't create synthetic test pages if real pages available
- Request specific test files from user when needed
- Real-world complexity reveals edge cases

### 5. Performance Matters
**Extension must be fast and unobtrusive.**
- Don't block page rendering
- Cache API responses aggressively
- Batch API calls, debounce on scroll
- Monitor console for performance warnings

---

## Development Rules

### MUST ✅

- **Write JSDoc comments** for all functions (params, returns, purpose)
- **Log classification reasoning** to console in debug mode (show which indicators triggered NOVA 4)
- **Handle errors gracefully** - never crash the page or extension
- **Update PROGRESS.md** every session with what was done
- **Add ADR to DECISIONS.md** for any architectural choice (even small ones)
- **Test extraction logic** with user-provided HTML before writing code
- **Use semantic versioning** (MAJOR.MINOR.PATCH)
- **Use atomic commits** — one logical change per commit; never batch unrelated changes together
- **Verify each phase checklist** completely before moving on
- **Use constants** for magic numbers and repeated strings
- **Clean up console logs** in production (use debug flag)

### Live Site Testing (Mandatory)

Before marking ANY phase ✅, open a real supermarket PDP and verify the new behaviour in-browser using Chrome DevTools MCP. Saved HTML test pages are useful for development but do not substitute for live testing.

- Run `chrome-nova` in terminal → Chrome opens with UPF Scanner loaded
- Open Claude Code in the upf-scanner directory → Chrome DevTools MCP connects to port 9222 automatically
- Verify the specific feature introduced in that phase on a real supermarket product page
- Run `test/manual/tesco-dom-regression.js` (DOM regression) as part of every end-of-session checklist

### API Spike Rule

Before implementing any external API integration, run a 30-minute spike: call the real endpoint with real data, inspect all response fields, and document findings in `docs/API.md`. Build the implementation after the spike.

### Barcode Test Case Validation

Before using any barcode as a test case, verify it returns a valid OFF result:
`https://world.openfoodfacts.org/api/v2/product/{barcode}.json`

### No New UI Feature Without User Need

Before implementing any new UI feature, use the brainstorming skill and state the specific user need the feature solves. If you can't articulate the user need, don't build it.

---

### MUST NOT ❌

- **Move to next phase** with failing tests
- **Make breaking changes** without documenting in DECISIONS.md
- **Hard-code values** - use constants/config files
- **Trust API responses** without validation/error handling
- **Inject code** that breaks page layout or functionality
- **Skip error handling** - all async code needs try/catch
- **Commit untested code** - always manually verify first
- **Create mocked test data** when real data is available or requested
- **Use `var`** - only const/let
- **Pollute global namespace** - use modules/IIFE

---

## Code Style & Standards

### File Organization

**Structure:**
```
background/       - Service worker, API calls
content/         - Content scripts injected into pages
  sites/         - Site-specific extractors (tesco.js, etc.)
  ui/           - Badge rendering, styles
lib/             - Shared utilities, classifiers
popup/           - Extension popup UI
test/            - Test files and harness
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase, verb-first | `extractIngredients()`, `classifyProduct()` |
| Constants | SCREAMING_SNAKE_CASE | `NOVA_4_INDICATORS`, `API_BASE_URL` |
| Classes | PascalCase | `ProductExtractor`, `NovaClassifier` |
| Files | kebab-case | `nova-classifier.js`, `tesco-adapter.js` |
| Folders | lowercase | `background/`, `content/`, `test/` |

### Comments

**JSDoc for Functions:**
```javascript
/**
 * Classifies a product using NOVA criteria based on ingredients
 * @param {string[]} ingredients - Array of ingredient strings
 * @returns {{score: number, reason: string, confidence: number}} NOVA classification result
 */
function classifyByIngredients(ingredients) {
  // ...
}
```

**Inline Comments (Explain Why):**
```javascript
// GOOD: Explains non-obvious logic
const threshold = 2; // NOVA 4 requires ≥2 ultra-processed indicators per OpenFoodFacts methodology

// BAD: States the obvious
const name = product.name; // Get product name
```

**TODO Comments:**
```javascript
// TODO: Handle multi-language ingredients (Phase 10)
// FIXME: Race condition when rapid scrolling (issue #5)
```

---

## Testing Protocol


### Test Files Location

- `test/unit/nova-classifier.test.js`          - Jest unit tests for `lib/nova-classifier.js`
- `test/unit/nova-indicators.test.js`          - Jest unit tests for `lib/nova-indicators.js`
- `test/unit/openfoodfacts.test.js`            - Jest unit tests for `lib/openfoodfacts.js`
- `test/unit/ingredient-parser.test.js`        - Jest unit tests for `lib/ingredient-parser.js`
- `test/unit/base-adapter.test.js`             - Jest unit tests for `content/sites/base-adapter.js`
- `test/unit/registry.test.js`                 - Jest unit tests for `content/sites/registry.js`
- `test/unit/sainsburys-adapter.test.js`       - Jest unit tests for Sainsbury's adapter
- `test/unit/asda-adapter.test.js`             - Jest unit tests for ASDA adapter
- `test/unit/morrisons-adapter.test.js`        - Jest unit tests for Morrisons adapter
- `test/unit/waitrose-adapter.test.js`         - Jest unit tests for Waitrose adapter
- `test/connectivity/openfoodfacts-connectivity.test.js` - Live connectivity tests for OFF API
- `test/manual/tesco-dom-regression.js`        - DOM regression check (run after Tesco selector changes)
- `test/manual/badge-display.html`             - Badge rendering harness (open in browser)
- `test/manual/test-integration.html`          - Integration test harness (open in browser)
- `test/manual/test-runner.html`               - Test runner harness (open in browser)
- `test/pages/`                                - Saved HTML pages (used for DOM regression checks)

### When Tests Fail

**Don't panic, follow this process:**

1. **Add debug logging** to understand what's happening
2. **Check console** for errors/warnings
3. **Verify test data** is correct and realistic
4. **Document findings** in `docs/PROGRESS.md`
5. **Fix the issue**
6. **Re-run full phase tests** (not just failed item)
7. **Only then proceed** to next phase

**Never:**
- Skip a failing test ("I'll fix it later")
- Move to next phase hoping it resolves itself
- Modify test criteria to make it pass artificially

---

## Decision-Making Framework

### Claude Can Decide Autonomously

**Code-Level Decisions:**
- Code structure and organization
- Variable/function naming
- Error handling approach
- Which utility functions to create
- Log message formatting
- Minor refactoring within current phase
- Bug fixes that don't change behavior

**Technical Decisions (within scope):**
- CSS styling for badges (colors, positioning)
- Caching strategy details (TTL, storage limits)
- Console logging format
- DOM selector strategies (within a site adapter)

### Must Ask User

**Feature/Scope Decisions:**
- Adding new supermarket sites beyond Tesco
- Adding features not in original plan
- Changing classification logic or thresholds
- Modifying NOVA rules or indicators

**Architecture Decisions:**
- Significant API changes
- Major refactoring across multiple files
- Changing data flow patterns
- Adding third-party dependencies

**When Uncertain About Tests:**
- "Test seems to pass but results look odd"
- "Should this edge case fail the test?"
- "Do we need more test data to verify?"

### How to Ask

**Format:**
```
I need to make a decision about [topic].

Options:
1. [Option A]: [Trade-offs]
2. [Option B]: [Trade-offs]

Recommendation: [Option X] because [reasoning]

Should I proceed with [Option X]?
```

**Document the Answer:**
After user responds, add an ADR to `docs/DECISIONS.md`:
```markdown
## ADR-009: [Decision Title]
**Date:** 2026-02-22
**Status:** Accepted

**Context:** [Why this decision was needed]

**Options Considered:**
1. [Option A] - [Pros/Cons]
2. [Option B] - [Pros/Cons]

**Decision:** [Chosen option]

**Consequences:** [Trade-offs and implications]
```

---

## Session Workflow

### Start of Session Checklist

**Every session, follow this sequence:**

1. ✅ **Read `CLAUDE.md`** (this file) - refresh on principles
2. ✅ **Read `docs/PROGRESS.md`** (last entry) - what was happening?
5. ✅ **Scan `docs/DECISIONS.md`** for recent decisions
6. ✅ **Summarize status** to user: current state, any open bugs, planned next work

### During Session

**Continuous actions:**
- Implement features incrementally
- Write JSDoc comments as you code
- Log progress notes in `docs/PROGRESS.md` (brief bullets)
- Add decisions to `docs/DECISIONS.md` when applicable
- Run tests as you go (don't wait until end)
- Commit working changes regularly using **atomic commits** (one logical change per commit)

**Example Progress Entry (during session):**
```markdown
## 2026-02-22 - Session 2 (In Progress)
- Implemented ingredient extraction for Tesco
- Added regex to clean allergen markers
- Tested with bread.html - ✅ works
- Testing with yogurt.html - found edge case with nested ingredients
```

### End of Session Checklist

**Before ending session:**

1. ✅ **Complete current task** - don't leave half-done work
2. ✅ **Run all tests** (`npm test` — all tests must be green)
3. ✅ **Remove any dead code** introduced this session (grep for newly added but uncalled functions)
4. ✅ **Run DOM regression check** (`test/manual/tesco-dom-regression.js`) to catch selector drift
5. ✅ **Update `docs/PROGRESS.md`** with:
   - What was accomplished
   - Test results
   - Any blockers
   - Next steps
6. ✅ **Review CLAUDE.md** — update any sections that no longer reflect the current architecture or approach; update the Last Updated date
7. ✅ **Commit with descriptive message**

**Example Commit Message:**
```
Phase 3: Ingredient extraction - Handle nested ingredients

- Added recursive parsing for ingredient sublists
- Tested with 5 product types (all passing)
- Updated PROGRESS.md with test results
- Phase 3 complete
```

**Example PROGRESS.md End-of-Session Entry:**
```markdown
## 2026-02-22 - Session 2 (Completed)
**Accomplished:**
- Phase 3: Ingredient extraction complete
- Tested with 5 Tesco product pages
- All verification tests passed ✅

**Test Results:**
✅ Extracts ingredient list from standard products
✅ Handles allergen markers (BOLD text)
✅ Parses percentages correctly
✅ Handles nested ingredients (e.g., "flour (wheat, barley)")
✅ Tested with bread, yogurt, crisps, ready meal, soup

**Blockers:** None

**Next Session:** Begin Phase 4 - NOVA 4 Indicator Database
```

---

## Common Scenarios

### Scenario: "Supermarket page structure has changed"

**Situation:** Classification stops working or ingredients can't be extracted after a site update. Each supermarket has its own adapter in `content/sites/` (tesco.js, sainsburys.js, asda.js, morrisons.js, waitrose.js, ocado.js).

**Action:**
1. Check the relevant adapter in `content/sites/` — verify DOM selectors are still valid
2. Run DOM regression check (`test/manual/tesco-dom-regression.js`) if applicable (Tesco-specific)
3. Inspect the live page or a freshly saved HTML file to identify the new structure
4. Update selectors in the adapter and re-test
5. Document selector change in `docs/PROGRESS.md` and add ADR if the approach changed

**Known fragile Tesco selectors (high drift risk):**
- Product title: `h1[data-auto="pdp-product-title"]`
- Ingredient text: `#accordion-panel-ingredients-panel` → find `<h3>Ingredients</h3>` → `nextElementSibling` + fallback chain
- Barcode: `script[type="application/ld+json"]` → `@graph` → Product → `gtin13` field

Run `test/manual/tesco-dom-regression.js` after any Tesco selector change.

---

### Scenario: "Ambiguous requirement"

**Situation:** Requirement is unclear or could be interpreted multiple ways

**Action:**
1. Check `docs/DECISIONS.md` for prior related decisions
2. Check `docs/PROJECT_PLAN.md` for context
3. If still unclear, ask user with options
4. Document answer in `docs/DECISIONS.md`

**Example:**
```
The plan says "handle nested ingredients" but doesn't specify depth.

Options:
1. Support 1 level only: "flour (wheat, barley)"
2. Support unlimited depth: "sauce (tomato (organic), spices (pepper, cumin))"

Recommendation: Option 1 for v1 (simpler), Option 2 for future enhancement

Which should I implement?
```

---

### Scenario: "Third-party API change"

**Situation:** OpenFoodFacts API response format changed

**Action:**
1. Document in `docs/PROGRESS.md` immediately
2. Add ADR for how to handle it
3. Update `docs/API.md` with new format
4. Implement backward compatibility if possible
5. Add version detection/fallback

**Example:**
```markdown
## ADR-011: Handle OpenFoodFacts API v3 format change

**Date:** 2026-02-25
**Status:** Accepted

**Context:**
OpenFoodFacts changed response structure in API v3.
Old: `product.nova_group`
New: `product.nova_groups_tags[0]`

**Decision:**
Support both formats with fallback:
```javascript
const novaScore = product.nova_groups_tags?.[0] || product.nova_group;
```

**Consequences:**
- Backward compatible with v2
- Future-proof for v3
- Slight performance overhead (negligible)
```

---

## Quality Gates

**All items must be ✅ before committing:**

- [ ] `npm test` passes (all tests green)
- [ ] Manual verification in browser confirms expected behaviour
- [ ] Regression: existing features unaffected
- [ ] All functions have JSDoc comments
- [ ] Error handling in place (try/catch on async, null checks)
- [ ] No hard-coded values (use constants)
- [ ] No commented-out code (remove or explain why kept)
- [ ] Any decisions documented in `docs/DECISIONS.md`
- [ ] `docs/PROGRESS.md` updated with what changed and why
- [ ] Code committed with descriptive atomic commit message

---

## Extension-Specific Guidelines

- **Don't pollute global namespace** — use modules or IIFE in content scripts
- **Service workers replace background pages** (Manifest V3) — they can be terminated when idle; use `chrome.storage` for persistence, never in-memory variables
- **Use MutationObserver** for detecting new products on infinite scroll / SPAs
- **Debounce scroll handlers** and use `requestIdleCallback` for non-urgent classification work

---

**Remember:** This document is the source of truth for how to develop this project. When in doubt, refer back to these principles and workflows.

**Next Steps After Reading This:**
1. Check `docs/PROGRESS.md` for current status and any open items
2. Check `docs/PROJECT_PLAN.md` for any planned enhancements
3. Begin work following session workflow above

---

*End of CLAUDE.md*
