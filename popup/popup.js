/**
 * NOVA Extension - Popup Script
 *
 * Handles extension popup UI and user interactions
 *
 * @version 0.1.0
 * @phase 1 - Basic placeholder (full implementation in Phase 10)
 */

(function() {
  'use strict';

  console.log('[NOVA Popup] Loaded');

  // DOM elements
  const statusElement = document.getElementById('status');
  const scannedElement = document.getElementById('scanned');
  const nova4Element = document.getElementById('nova4');
  const clearCacheButton = document.getElementById('clearCache');
  const viewDocsLink = document.getElementById('viewDocs');
  const reportIssueLink = document.getElementById('reportIssue');

  /**
   * Load statistics from storage (placeholder for Phase 10)
   */
  async function loadStats() {
    try {
      const stats = await chrome.storage.local.get(['productsScanned', 'nova4Count']);

      if (stats.productsScanned !== undefined) {
        scannedElement.textContent = stats.productsScanned;
      }

      if (stats.nova4Count !== undefined) {
        nova4Element.textContent = stats.nova4Count;
      }

      console.log('[NOVA Popup] Stats loaded', stats);
    } catch (error) {
      console.error('[NOVA Popup] Error loading stats', error);
    }
  }

  /**
   * Clear cache (to be implemented in Phase 6)
   */
  function clearCache() {
    console.log('[NOVA Popup] Clear cache clicked (not yet implemented)');
    // Will be implemented in Phase 6
    alert('Cache clearing will be implemented in Phase 6');
  }

  /**
   * Open documentation
   */
  function openDocs() {
    console.log('[NOVA Popup] Opening documentation');
    // For now, just log. Could open README or GitHub in future
    alert('Documentation: See README.md in extension folder');
  }

  /**
   * Open issue reporting
   */
  function reportIssue() {
    console.log('[NOVA Popup] Opening issue reporting');
    alert('Issue reporting will be available when project is on GitHub');
  }

  // Event listeners
  clearCacheButton.addEventListener('click', clearCache);
  viewDocsLink.addEventListener('click', (e) => {
    e.preventDefault();
    openDocs();
  });
  reportIssueLink.addEventListener('click', (e) => {
    e.preventDefault();
    reportIssue();
  });

  // Initialize
  loadStats();

  console.log('[NOVA Popup] Ready');
})();
