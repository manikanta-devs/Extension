#!/usr/bin/env node
/**
 * generate-icons.js
 * Run this once to create placeholder PNG icons for the extension.
 * Requires: npm install -g canvas  OR  node >= 18 (uses built-in APIs)
 *
 * Usage: node generate-icons.js
 */

const fs   = require('fs');
const path = require('path');

// Simple PNG generator using pure Node.js (no dependencies)
// Creates a solid-color PNG with a star glyph

function createPNG(size, outputPath) {
  // We'll write a minimal valid PNG with a gradient background
  // Using a canvas-free approach with raw PNG bytes

  const { createCanvas } = (() => {
    try { return require('canvas'); } catch(_) { return null; }
  })() || {};

  if (createCanvas) {
    // Use canvas if available
    const canvas = createCanvas(size, size);
    const ctx    = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#0a1a30');
    grad.addColorStop(1, '#061428');
    ctx.fillStyle = grad;
    ctx.roundRect?.(0, 0, size, size, size * 0.22) || ctx.fillRect(0, 0, size, size);
    ctx.fill();

    // Glow border
    ctx.strokeStyle = 'rgba(0,212,255,0.6)';
    ctx.lineWidth   = size * 0.04;
    ctx.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);

    // Star / sparkle icon
    ctx.fillStyle = '#00d4ff';
    ctx.font      = `bold ${size * 0.55}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', size / 2, size / 2 + size * 0.02);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    console.log(`  ✓ Created ${outputPath} (${size}x${size})`);
  } else {
    // Fallback: write a minimal 1x1 valid PNG (transparent)
    // then note the user should replace these
    const PNG_1x1 = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478016360000000020001e221bc330000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(outputPath, PNG_1x1);
    console.log(`  ⚠ Created placeholder ${outputPath} — replace with real ${size}x${size} PNG`);
  }
}

const iconsDir = path.join(__dirname, 'extension', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

console.log('\n  Generating extension icons…\n');
createPNG(16,  path.join(iconsDir, 'icon16.png'));
createPNG(48,  path.join(iconsDir, 'icon48.png'));
createPNG(128, path.join(iconsDir, 'icon128.png'));

console.log('\n  Done! Icons are in extension/icons/');
console.log('  Tip: Install "canvas" for better icons: npm install canvas\n');
