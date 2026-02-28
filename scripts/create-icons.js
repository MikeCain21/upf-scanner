/**
 * create-icons.js
 *
 * Generates minimal valid PNG icon files for the NOVA Extension.
 * Uses only Node.js built-ins — no npm dependencies required.
 *
 * Each icon is a solid-colour square (#4a7c59 — earthy green, NOVA-themed).
 * Replace with real artwork for v1.1+.
 *
 * Usage:  node scripts/create-icons.js
 * Output: icons/icon16.png  icons/icon32.png  icons/icon48.png  icons/icon128.png
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Icon colour: earthy green (#4a7c59) matching NOVA 1 badge theme
const R = 0x4a;
const G = 0x7c;
const B = 0x59;

const SIZES = [16, 32, 48, 128];
const ICONS_DIR = path.resolve(__dirname, '..', 'icons');

/**
 * Computes a CRC-32 checksum for a PNG chunk.
 * Uses the standard CRC table from the PNG spec.
 *
 * @param {Buffer} buf
 * @returns {number}
 */
function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c;
    }
    return t;
  })());

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a PNG chunk: 4-byte length + type + data + CRC.
 *
 * @param {string} type - 4-char chunk type (e.g. 'IHDR')
 * @param {Buffer} data
 * @returns {Buffer}
 */
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

/**
 * Generates a minimal valid PNG buffer for a solid-colour square.
 *
 * @param {number} size - Width and height in pixels
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @returns {Buffer}
 */
function makePng(size, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bit depth=8, colour type=2 (RGB), compression=0, filter=0, interlace=0
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Build raw pixel data: one filter byte (0) per row + RGB pixels
  const rowSize = 1 + size * 3; // filter byte + RGB per pixel
  const rawData = Buffer.alloc(rowSize * size);
  for (let row = 0; row < size; row++) {
    const offset = row * rowSize;
    rawData[offset] = 0; // filter type: None
    for (let col = 0; col < size; col++) {
      rawData[offset + 1 + col * 3] = r;
      rawData[offset + 2 + col * 3] = g;
      rawData[offset + 3 + col * 3] = b;
    }
  }

  // Compress with zlib (deflate) — PNG IDAT payload
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // IEND is always empty
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', iend),
  ]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

for (const size of SIZES) {
  const outPath = path.join(ICONS_DIR, `icon${size}.png`);
  const png = makePng(size, R, G, B);
  fs.writeFileSync(outPath, png);
  console.log(`Written: ${outPath} (${png.length} bytes)`);
}

console.log('Done. All icons generated.');
