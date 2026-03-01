#!/usr/bin/env node
/**
 * Generate PNG icons from SVG for PWA manifest
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const svgContent = readFileSync(join(publicDir, 'icon.svg'), 'utf8');

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable.png', size: 512 },
];

async function generateIcons() {
  console.log('Generating PNG icons from SVG...');

  for (const { name, size } of sizes) {
    const outputPath = join(publicDir, name);

    await sharp(Buffer.from(svgContent))
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`  Created ${name} (${size}x${size})`);
  }

  console.log('Done!');
}

generateIcons().catch(console.error);
