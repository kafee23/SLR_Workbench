#!/usr/bin/env node
/*
 * build.js — assemble the single-file SLR Workbench from src/.
 *
 * The application is developed as eight ordered parts (markup, styles and
 * five script blocks) and shipped as one self-contained HTML file. This
 * script concatenates the parts in order and writes:
 *
 *   index.html                          the file GitHub Pages serves
 *   dist/SLR_Workbench_v<version>.html  the versioned release copy
 *
 * The output is a plain concatenation with no injected banner, so a build
 * from a clean checkout is byte-identical to the released file. CI checks
 * this by rebuilding and diffing against the committed index.html.
 *
 * No dependencies. Run with:  node build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const PARTS = [
  '01_head.html',
  '02_body.html',
  '03_core.js',
  '04_import.js',
  '05_screen.js',
  '06_prisma.js',
  '07_charts.js',
  '08_boot.js'
];

function readPart(name) {
  const p = path.join(SRC, name);
  if (!fs.existsSync(p)) {
    console.error(`build: missing source part ${name}`);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8');
}

function versionFromSource(core) {
  const m = core.match(/const APP_VERSION = '([^']+)'/);
  return m ? m[1] : '0.0.0';
}

function main() {
  const parts = PARTS.map(readPart);
  const html = parts.join('');
  const version = versionFromSource(parts[2]);

  const outIndex = path.join(ROOT, 'index.html');
  const distDir = path.join(ROOT, 'dist');
  const outDist = path.join(distDir, `SLR_Workbench_v${version}.html`);

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(outIndex, html, 'utf8');
  fs.writeFileSync(outDist, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
  const lines = html.split('\n').length;
  console.log(`build: v${version}  ${lines} lines  ${kb} KB`);
  console.log(`  -> ${path.relative(ROOT, outIndex)}`);
  console.log(`  -> ${path.relative(ROOT, outDist)}`);

  // Sanity: every <script> must be balanced and the document must close.
  const opens = (html.match(/<script>/g) || []).length;
  const closes = (html.match(/<\/script>/g) || []).length;
  if (opens !== closes || !/<\/html>\s*$/.test(html)) {
    console.error('build: output looks malformed (unbalanced <script> or missing </html>)');
    process.exit(1);
  }
}

main();
