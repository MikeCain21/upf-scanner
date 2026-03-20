/**
 * UPF Scanner - Adapter Registry
 *
 * Maintains the list of registered site adapters and resolves which adapter
 * should handle a given URL.
 *
 * Usage in an adapter file (at the bottom):
 *   registry.register(new TescoAdapter());
 *
 * Usage in content/main.js:
 *   const adapter = registry.getAdapter(window.location.href);
 *
 * Note: manifest.json content_scripts already scopes which adapter files are
 * injected per domain, so in practice only one adapter is ever loaded per page.
 * The registry is a safety net and enables unit-testing adapter resolution.
 *
 * @version 1.0.0
 */

'use strict';

const registry = (() => {
  /** @type {import('./base-adapter').BaseAdapter[]} */
  const _adapters = [];

  return {
    /**
     * Registers a site adapter.
     *
     * @param {object} adapter - An instance of BaseAdapter (or compatible object)
     */
    register(adapter) {
      _adapters.push(adapter);
    },

    /**
     * Returns the first registered adapter that supports the given URL,
     * or null if no adapter matches.
     *
     * @param {string} url - The full page URL to match against
     * @returns {object|null}
     */
    getAdapter(url) {
      return _adapters.find(a => a.isSupported(url)) ?? null;
    },

    /**
     * Returns a copy of all registered adapters. Primarily for testing.
     *
     * @returns {object[]}
     */
    getAll() {
      return [..._adapters];
    },
  };
})();

// Dual export: CommonJS for Jest tests; window assignment for browser content scripts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registry };
} else {
  window.__novaExt = window.__novaExt || {};
  window.__novaExt.registry = registry;
}
