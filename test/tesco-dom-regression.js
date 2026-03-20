/**
 * UPF Scanner — Tesco PDP DOM Regression Test
 *
 * HOW TO USE:
 *   1. Open any Tesco product detail page (e.g. sunflower oil, bread, cheddar)
 *   2. Open DevTools console (F12 → Console)
 *   3. Paste this entire file and press Enter
 *
 * WHAT IT CHECKS:
 *   - Whether the accordion panel that holds ingredient text still exists and
 *     still uses the ID we expect (#accordion-panel-product-description)
 *   - Whether each selector in tesco.js returns ingredient-like text (>10 chars)
 *   - Whether the OLD ingredients panel (#accordion-panel-ingredients-panel)
 *     has moved back to holding ingredient text (would signal a Tesco revert)
 *
 * WHY WE NEED THIS:
 *   Tesco redesigned their PDP in early 2026, moving ingredient text from
 *   #accordion-panel-ingredients-panel to #accordion-panel-product-description.
 *   If they change the structure again, all products will silently fall back to
 *   NOVA 1 ("no ingredients found"). This test catches that before users notice.
 *
 * PASS CRITERIA:
 *   PRIMARY selector shows ✅ PASS with the product's ingredient text.
 *   If PRIMARY fails but a FALLBACK passes, update SELECTORS in tesco.js.
 *   If ALL fail, run the hint command to find the new panel location.
 */
(function novaIngredientRegressionCheck() {
  const SELECTORS = {
    // Current primary (complex products: bread, yoghurt, crisps)
    PRIMARY:  '#accordion-panel-ingredients-panel .UKSL9q_content > div',
    // Fallback 1 (simple products: sunflower oil, plain cheddar, eggs)
    F1:       '#accordion-panel-product-description .UKSL9q_content > div',
    // Fallback 2 & 3: data-testid variants survive panel ID prefix renames
    F2:       '[data-testid="accordion-panel"][id*="ingredients"] .UKSL9q_content > div',
    F3:       '[data-testid="accordion-panel"][id*="product-description"] .UKSL9q_content > div',
    // Fallback 4: old h3+div pattern (pre-2026 saved pages and rollback safety)
    F4_OLD:   '#accordion-panel-ingredients-panel h3 + div',
  };

  const rows = {};
  for (const [name, sel] of Object.entries(SELECTORS)) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim() ?? '';
    rows[name] = {
      selector: sel.slice(0, 60),
      found: !!el,
      textLength: text.length,
      preview: text.slice(0, 60),
      status: text.length > 10 ? '✅ PASS' : el ? '⚠️  found but short/empty' : '❌ not found',
    };
  }

  const productDescPanel = !!document.getElementById('accordion-panel-product-description');
  const oldIngrPanel     = !!document.getElementById('accordion-panel-ingredients-panel');
  const primaryText      = document.querySelector(SELECTORS.PRIMARY)?.textContent?.trim() ?? '';
  const f1Text           = document.querySelector(SELECTORS.F1)?.textContent?.trim() ?? '';

  console.group('%cUPF Scanner — Tesco DOM Regression Check', 'font-weight:bold;font-size:14px');
  console.log('Page:', window.location.href);
  console.log(
    '#accordion-panel-product-description present:',
    productDescPanel ? '✅ yes' : '❌ MISSING — structure changed!'
  );
  console.log(
    '#accordion-panel-ingredients-panel present:',
    oldIngrPanel ? '⚠️  yes (now holds Nutrition/Dietary in 2026 layout)' : '— not found'
  );
  console.table(rows);

  const resolvedText = primaryText.length > 10 ? primaryText : f1Text;
  if (resolvedText.length > 10) {
    const source = primaryText.length > 10 ? 'PRIMARY' : 'F1 (product-description)';
    console.log(
      `%c✅ Extraction OK via ${source} — ingredient text:`,
      'color:green',
      resolvedText.slice(0, 120)
    );
  } else {
    console.error('❌ ALL SELECTORS FAILED — no ingredient text found (>10 chars).');
    console.log('Run this to find the new panel location:');
    console.log(
      '[...document.querySelectorAll(\'[data-testid="accordion-panel"]\')]' +
      '.forEach(p => console.log(p.id, "|", p.textContent.slice(0,60)))'
    );
  }
  console.groupEnd();
}());
