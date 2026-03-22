// lib/storage-crypto.js
// AES-256-GCM encryption helpers for chrome.storage.local cache entries.
//
// Usage:
//   await StorageCrypto.encryptValue(obj)   → { _enc: 1, iv: '...', ct: '...' }
//   await StorageCrypto.decryptValue(stored) → original obj, or null on miss/failure

/* global chrome */

const StorageCrypto = (() => {
  'use strict';

  const ENC_KEY_STORAGE_KEY = '_enc_key';

  /** In-memory CryptoKey cache — avoids repeated import on every cache read/write. */
  let _cachedKey = null;

  /**
   * Gets the AES-256-GCM CryptoKey, generating and persisting it on first call.
   * The key is stored as raw bytes (base64) in chrome.storage.local under '_enc_key'.
   * On subsequent service worker starts the key is re-imported from storage.
   * @returns {Promise<CryptoKey>}
   */
  async function getOrGenerateKey() {
    if (_cachedKey) return _cachedKey;

    const result = await chrome.storage.local.get(ENC_KEY_STORAGE_KEY);

    if (result[ENC_KEY_STORAGE_KEY]) {
      const rawBytes = base64ToBytes(result[ENC_KEY_STORAGE_KEY]);
      _cachedKey = await crypto.subtle.importKey(
        'raw', rawBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
      );
    } else {
      // Generate a new 256-bit key, persist it for future sessions.
      const newKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
      );
      const exported = await crypto.subtle.exportKey('raw', newKey);
      await chrome.storage.local.set({ [ENC_KEY_STORAGE_KEY]: bytesToBase64(exported) });
      // Re-import as non-extractable for the remainder of this session.
      _cachedKey = await crypto.subtle.importKey(
        'raw', exported, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
      );
    }

    return _cachedKey;
  }

  /**
   * Encrypts any JSON-serializable value using AES-256-GCM.
   * A fresh random 12-byte IV is generated per call, so identical inputs
   * produce different ciphertext each time.
   * @param {*} value
   * @returns {Promise<{_enc: number, iv: string, ct: string}>}
   */
  async function encryptValue(value) {
    const key = await getOrGenerateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      _enc: 1,
      iv: bytesToBase64(iv),
      ct: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  /**
   * Decrypts an encrypted value. Returns null for legacy/invalid/tampered entries.
   * Callers should treat null as a cache miss.
   * @param {*} stored
   * @returns {Promise<*|null>}
   */
  async function decryptValue(stored) {
    if (!stored || stored._enc !== 1) return null;
    try {
      const key = await getOrGenerateKey();
      const iv = base64ToBytes(stored.iv);
      const ciphertext = base64ToBytes(stored.ct);
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      return null;
    }
  }

  /**
   * Resets the in-memory key cache. Used in tests to simulate a new service worker start.
   */
  function _resetKeyCache() {
    _cachedKey = null;
  }

  /**
   * Converts an ArrayBuffer or Uint8Array to a base64 string.
   * Uses a loop instead of spread (...) to avoid "Maximum call stack size exceeded"
   * on large byte arrays (spread via Function.apply has a ~65k argument limit).
   * @param {ArrayBuffer|Uint8Array} bytes
   * @returns {string}
   */
  function bytesToBase64(bytes) {
    const uint8 = new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  }

  /**
   * Converts a base64 string to a Uint8Array.
   * @param {string} b64
   * @returns {Uint8Array}
   */
  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const api = { getOrGenerateKey, encryptValue, decryptValue, _resetKeyCache };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
