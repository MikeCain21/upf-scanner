/**
 * NOVA Extension - Background Service Worker
 *
 * Handles:
 * - API calls to OpenFoodFacts
 * - Caching with chrome.storage.local
 * - Message passing with content scripts
 *
 * @version 0.1.0
 * @phase 1 - Placeholder (will be implemented in Phase 6)
 */

console.log('[NOVA Background] Service worker loaded');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[NOVA Background] Extension installed/updated', details.reason);

  if (details.reason === 'install') {
    console.log('[NOVA Background] First time installation');
    // Could set up initial storage here
  } else if (details.reason === 'update') {
    console.log('[NOVA Background] Extension updated from version', details.previousVersion);
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[NOVA Background] Received message', message, 'from', sender.tab?.url);

  // Handle different message types (to be implemented in Phase 6)
  if (message.type === 'FETCH_PRODUCT') {
    // Placeholder for Phase 6: OpenFoodFacts API lookup
    console.log('[NOVA Background] FETCH_PRODUCT request (not yet implemented)');
    sendResponse({ success: false, error: 'Not implemented in Phase 1' });
    return true; // Keep message channel open
  }

  // Unknown message type
  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

console.log('[NOVA Background] Service worker ready');
