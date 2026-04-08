// test/unit/storage-crypto.test.js
'use strict';

// Node 18 doesn't expose crypto as a bare global in Jest's node environment.
// Polyfill it here so the Web Crypto API is available on all supported Node versions.
if (typeof crypto === 'undefined') {
  global.crypto = require('node:crypto').webcrypto;
}

// Mock chrome.storage.local with an in-memory store before requiring the module.
const store = {};
global.chrome = {
  storage: {
    local: {
      get: async (key) => {
        if (typeof key === 'string') return { [key]: store[key] };
        return Object.fromEntries(Object.entries(store));
      },
      set: async (obj) => Object.assign(store, obj),
    },
  },
};

const StorageCrypto = require('../../lib/storage-crypto');

beforeEach(() => {
  // Clear in-memory store and key cache between tests
  Object.keys(store).forEach(k => delete store[k]);
  StorageCrypto._resetKeyCache();
});

describe('StorageCrypto', () => {
  test('encrypts and decrypts a cache entry round-trip', async () => {
    const entry = { novaScore: 4, productName: 'Test Biscuits', markers: ['emulsifier'], timestamp: Date.now() };
    const encrypted = await StorageCrypto.encryptValue(entry);
    const decrypted = await StorageCrypto.decryptValue(encrypted);
    expect(decrypted).toEqual(entry);
  });

  test('encrypted value is not plaintext', async () => {
    const entry = { novaScore: 1, productName: 'Banana' };
    const encrypted = await StorageCrypto.encryptValue(entry);
    expect(encrypted._enc).toBe(1);
    expect(typeof encrypted.iv).toBe('string');
    expect(typeof encrypted.ct).toBe('string');
    // The ciphertext should not contain the plaintext product name
    expect(atob(encrypted.ct)).not.toContain('Banana');
  });

  test('two encryptions of the same value produce different ciphertext (random IV)', async () => {
    const entry = { novaScore: 2 };
    const enc1 = await StorageCrypto.encryptValue(entry);
    const enc2 = await StorageCrypto.encryptValue(entry);
    expect(enc1.ct).not.toBe(enc2.ct);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  test('returns null for a legacy unencrypted entry', async () => {
    const legacy = { novaScore: 3, productName: 'Old Entry', timestamp: Date.now() };
    const result = await StorageCrypto.decryptValue(legacy);
    expect(result).toBeNull();
  });

  test('returns null for null input', async () => {
    expect(await StorageCrypto.decryptValue(null)).toBeNull();
  });

  test('returns null for a tampered ciphertext', async () => {
    const encrypted = await StorageCrypto.encryptValue({ novaScore: 1 });
    // Corrupt the last 4 base64 chars of the ciphertext
    encrypted.ct = encrypted.ct.slice(0, -4) + 'AAAA';
    const result = await StorageCrypto.decryptValue(encrypted);
    expect(result).toBeNull();
  });

  test('persists key across sessions (key cache reset)', async () => {
    const entry = { novaScore: 2, productName: 'Bread' };
    const encrypted = await StorageCrypto.encryptValue(entry);

    // Simulate new service worker start — reset in-memory key cache
    StorageCrypto._resetKeyCache();

    // Should still decrypt using the key re-imported from storage
    const decrypted = await StorageCrypto.decryptValue(encrypted);
    expect(decrypted).toEqual(entry);
  });
});
