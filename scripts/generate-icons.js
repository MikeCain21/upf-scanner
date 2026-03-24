#!/usr/bin/env node
/**
 * generate-icons.js
 * Converts SVG source files to PNG icons for the UPF Scanner.
 *
 * Usage: node icons/generate-icons.js
 * Requires: sharp (npm install --save-dev sharp)
 */

const sharp = require('sharp');
const path = require('path');

const ICONS_DIR = path.join(__dirname);

const iconSizes = [16, 32, 48, 128];

async function generateIcons() {
  const svgPath = path.join(ICONS_DIR, 'icon.svg');

  for (const size of iconSizes) {
    const outPath = path.join(ICONS_DIR, `icon${size}.png`);
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`✅ Generated icon${size}.png`);
  }
}

async function main() {
  console.log('Generating UPF Scanner icons...\n');
  await generateIcons();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Error generating icons:', err.message);
  process.exit(1);
});
