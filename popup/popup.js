/**
 * NOVA Extension - Popup Script
 *
 * Requests the current page's NOVA state from the background service worker,
 * renders the product score section when a product has been classified, and
 * provides cache-clear and debug-mode controls.
 *
 * @version 1.1.0
 */

(function () {
  'use strict';

  /** @type {Object.<number, {label: string, description: string}>} */
  const NOVA_LABELS = {
    1: { label: 'Unprocessed', description: 'Fresh or minimally processed food.' },
    2: { label: 'Processed ingredient', description: 'Simple culinary ingredient like oil, flour, or sugar.' },
    3: { label: 'Processed food', description: 'Made with added salt, sugar, or oil — but recognisable ingredients.' },
    4: { label: 'Ultra-processed', description: 'Contains additives not found in home cooking.' },
  };

  /** @type {HTMLElement} */
  const indicatorsEl = document.getElementById('nova-indicators');

  // DOM refs
  const productSection = document.getElementById('product-section');
  const novaBoxEl = document.getElementById('nova-box');
  const productNameEl = document.getElementById('product-name');
  const novaLabelEl = document.getElementById('nova-label');
  const novaDescriptionEl = document.getElementById('nova-description');
  const offLinkEl = document.getElementById('off-link');
  const clearCacheButton = document.getElementById('clearCache');
  const cacheStatusEl = document.getElementById('cache-status');
  const debugModeCheckbox = document.getElementById('debugMode');

  // ---------------------------------------------------------------------------
  // Product score section
  // ---------------------------------------------------------------------------

  /**
   * Renders the product section with score, name, indicators, and OFF link.
   *
   * @param {number} novaScore
   * @param {string|null} productName
   * @param {string|null} barcode
   * @param {string[]} markers
   */
  function renderProduct(novaScore, productName, barcode, markers) {
    const info = NOVA_LABELS[novaScore];
    if (!info) return;

    novaBoxEl.textContent = String(novaScore);
    novaBoxEl.className = `nova-box nova-${novaScore}`;
    novaBoxEl.setAttribute('aria-label', `NOVA ${novaScore}: ${info.label}`);
    productNameEl.textContent = productName || 'Unknown product';
    novaLabelEl.textContent = info.label;

    if (markers && markers.length > 0) {
      novaDescriptionEl.style.display = 'none';
      indicatorsEl.textContent = markers.join(', ');
      indicatorsEl.style.display = 'block';
    } else {
      novaDescriptionEl.textContent = info.description;
      novaDescriptionEl.style.display = 'block';
      indicatorsEl.style.display = 'none';
    }

    if (barcode) {
      offLinkEl.href = `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`;
      offLinkEl.style.display = '';
    } else {
      offLinkEl.style.display = 'none';
    }

    productSection.style.display = 'block';
  }

  // ---------------------------------------------------------------------------
  // Load NOVA state for the active tab
  // ---------------------------------------------------------------------------

  /**
   * Queries the background for the NOVA score of the active tab and renders
   * the product section when a score is available.
   */
  /**
   * Queries the background for the NOVA score of the active tab and renders
   * the product section when a score is available. Retries once after 3 s if
   * the content script is still classifying (popup opened before badge appeared).
   *
   * @param {number} [retryCount=0]
   */
  function loadPageNova(retryCount = 0) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return;

      chrome.runtime.sendMessage({ type: 'GET_PAGE_NOVA', tabId: tab.id }, (response) => {
        if (chrome.runtime.lastError) return; // popup may open before SW is ready
        if (response && response.novaScore) {
          renderProduct(response.novaScore, response.productName, response.barcode, response.markers || []);
        } else if (retryCount < 1) {
          // Classification may still be in progress — retry once after 3 s
          setTimeout(() => loadPageNova(retryCount + 1), 3000);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Debug toggle
  // ---------------------------------------------------------------------------

  /**
   * Loads the saved debug mode preference into the checkbox.
   */
  function loadDebugMode() {
    chrome.storage.local.get(['debugMode'], (data) => {
      debugModeCheckbox.checked = !!data.debugMode;
    });
  }

  debugModeCheckbox.addEventListener('change', (e) => {
    chrome.storage.local.set({ debugMode: e.target.checked });
  });

  // ---------------------------------------------------------------------------
  // Clear cache
  // ---------------------------------------------------------------------------

  /**
   * Sends CLEAR_CACHE to the service worker and updates button feedback.
   */
  function clearCache() {
    clearCacheButton.disabled = true;
    clearCacheButton.setAttribute('aria-busy', 'true');
    clearCacheButton.textContent = 'Clearing\u2026';
    cacheStatusEl.textContent = 'Clearing cache\u2026';
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, (response) => {
      const count = response?.cleared ?? 0;
      clearCacheButton.textContent = `Cleared (${count} entries)`;
      cacheStatusEl.textContent = `Cache cleared. ${count} ${count === 1 ? 'entry' : 'entries'} removed.`;
      setTimeout(() => {
        clearCacheButton.disabled = false;
        clearCacheButton.removeAttribute('aria-busy');
        clearCacheButton.textContent = 'Clear Cache';
        cacheStatusEl.textContent = '';
      }, 2000);
    });
  }

  clearCacheButton.addEventListener('click', clearCache);

  // ---------------------------------------------------------------------------
  // Initialise
  // ---------------------------------------------------------------------------

  loadPageNova();
  loadDebugMode();
})();
