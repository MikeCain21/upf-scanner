/**
 * NOVA Extension - Popup Script
 *
 * Handles extension popup UI: stats display, clear cache, debug toggle.
 *
 * @version 0.9.0
 * @phase 10 - Production popup
 */

(function() {
  'use strict';

  // DOM elements
  const clearCacheButton = document.getElementById('clearCache');
  const debugModeCheckbox = document.getElementById('debugMode');

  // ---------------------------------------------------------------------------
  // Debug toggle
  // ---------------------------------------------------------------------------

  /**
   * Loads the saved debug mode state into the checkbox.
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
   * Sends CLEAR_CACHE message to service worker and updates button text.
   */
  function clearCache() {
    clearCacheButton.disabled = true;
    clearCacheButton.textContent = 'Clearing…';
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, (response) => {
      clearCacheButton.textContent = `Cleared (${response?.cleared ?? 0} entries)`;
      setTimeout(() => {
        clearCacheButton.disabled = false;
        clearCacheButton.textContent = 'Clear Cache';
      }, 2000);
    });
  }

  clearCacheButton.addEventListener('click', clearCache);

  // ---------------------------------------------------------------------------
  // Initialise
  // ---------------------------------------------------------------------------

  loadDebugMode();
})();
