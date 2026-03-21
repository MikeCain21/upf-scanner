'use strict';

/**
 * Jest unit tests for content/sites/registry.js
 *
 * Tests adapter registration and URL-based adapter resolution.
 *
 * Run with: npm test
 */

// registry.js imports base-adapter.js implicitly via window assignment in the
// browser, but in Node/Jest we only need the registry object itself.
const { registry: _registry } = require('../../content/sites/registry');

// ---------------------------------------------------------------------------
// Helper — creates a fresh registry instance for each test so registrations
// don't bleed between tests. Uses jest.isolateModules for correct isolation.
// ---------------------------------------------------------------------------

function makeRegistry() {
  let reg;
  jest.isolateModules(() => {
    reg = require('../../content/sites/registry').registry;
  });
  return reg;
}

// ---------------------------------------------------------------------------
// Fake adapter factory
// ---------------------------------------------------------------------------

function fakeAdapter(hostname, siteId = hostname) {
  return {
    SITE_ID: siteId,
    isSupported: (url) => url.includes(hostname),
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('registry.register', () => {
  it('registers a single adapter and makes it retrievable', () => {
    const registry = makeRegistry();
    const adapter = fakeAdapter('tesco.com', 'tesco');
    registry.register(adapter);
    expect(registry.getAdapter('https://www.tesco.com/groceries/')).toBe(adapter);
  });

  it('registers multiple adapters and resolves the correct one', () => {
    const registry = makeRegistry();
    const tesco = fakeAdapter('tesco.com', 'tesco');
    const waitrose = fakeAdapter('waitrose.com', 'waitrose');
    registry.register(tesco);
    registry.register(waitrose);
    expect(registry.getAdapter('https://www.waitrose.com/ecom/products/abc/1')).toBe(waitrose);
    expect(registry.getAdapter('https://www.tesco.com/groceries/en-GB/products/123')).toBe(tesco);
  });
});

// ---------------------------------------------------------------------------
// getAdapter — URL resolution
// ---------------------------------------------------------------------------

describe('registry.getAdapter', () => {
  it('returns null when no adapters are registered', () => {
    const registry = makeRegistry();
    expect(registry.getAdapter('https://www.tesco.com/')).toBeNull();
  });

  it('returns null when no adapter matches the URL', () => {
    const registry = makeRegistry();
    registry.register(fakeAdapter('tesco.com'));
    expect(registry.getAdapter('https://www.asda.com/product/123')).toBeNull();
  });

  it('returns the first matching adapter when multiple could match', () => {
    const registry = makeRegistry();
    const first = fakeAdapter('tesco.com', 'tesco-first');
    const second = { SITE_ID: 'tesco-second', isSupported: (url) => url.includes('tesco.com') };
    registry.register(first);
    registry.register(second);
    // First registered adapter wins
    expect(registry.getAdapter('https://www.tesco.com/groceries/')).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// getAll
// ---------------------------------------------------------------------------

describe('registry.getAll', () => {
  it('returns empty array when nothing registered', () => {
    const registry = makeRegistry();
    expect(registry.getAll()).toEqual([]);
  });

  it('returns all registered adapters', () => {
    const registry = makeRegistry();
    const a = fakeAdapter('tesco.com');
    const b = fakeAdapter('waitrose.com');
    registry.register(a);
    registry.register(b);
    expect(registry.getAll()).toEqual([a, b]);
  });

  it('returns a copy — mutations do not affect internal state', () => {
    const registry = makeRegistry();
    registry.register(fakeAdapter('tesco.com'));
    const all = registry.getAll();
    all.pop();
    expect(registry.getAll()).toHaveLength(1);
  });
});
