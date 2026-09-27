/*
 * Shared helpers for the headless test scripts.
 *
 * Every script opens the built index.html in headless Chromium through
 * Playwright, drives the application through its own global objects
 * (State, Dedup, Screen, Agreement, Prisma, Diagram ...) and reports to the
 * console. There is no test framework: each script exits non-zero on failure
 * so CI can run them in sequence.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'index.html');
const OUT = path.join(__dirname, 'output');

function appUrl(query) {
  if (!fs.existsSync(APP)) {
    console.error('index.html not found. Run `npm run build` first.');
    process.exit(1);
  }
  return 'file://' + APP + (query ? '?' + query : '');
}

/* Open the app. Collects page errors and console errors, ignoring the two
   benign messages a sandbox without network produces (the Google Fonts
   stylesheet failing to load). */
async function openApp(opts) {
  opts = opts || {};
  fs.mkdirSync(OUT, { recursive: true });
  // CHROMIUM_PATH lets CI or a locked-down machine point at an existing
  // browser instead of downloading one with `npx playwright install`.
  const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({
    viewport: opts.viewport || { width: 1280, height: 800 },
    deviceScaleFactor: opts.scale || 1
  });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|fonts\.g/.test(t)) return;
    errors.push('CONSOLE: ' + t);
  });
  await page.goto(appUrl(opts.query), { waitUntil: 'load' });
  await page.waitForTimeout(opts.settle || 400);
  return { browser, page, errors };
}

/* A deterministic PRNG so corpora are identical between runs. */
const lcgSource = `
  let __s = SEED;
  const rnd = () => { __s = (__s * 1103515245 + 12345) & 0x7fffffff; return __s / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
`;

function log() { console.log.apply(console, arguments); }
function pass(name, detail) { log(`  PASS  ${name}${detail ? '  (' + detail + ')' : ''}`); }
function fail(name, detail) { log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`); }

module.exports = { ROOT, APP, OUT, appUrl, openApp, lcgSource, log, pass, fail };
