/*
 * Runs the application's built-in self-test (index.html?selftest=1) in
 * headless Chromium and fails if any check fails or any script error occurs.
 *
 * The self-test lives inside the app so end users can run it too. It covers
 * the places where a silent wrong answer would be worse than a crash:
 *   - the banded edit distance against a full-matrix reference
 *   - long strings compared honestly (no fabricated distance)
 *   - Cohen's kappa against a hand-computed 2x2
 *   - Fleiss' kappa under perfect agreement
 *   - blocking recall against an exhaustive pass
 *   - DOI normalisation and JSON round-trip of records
 *   - migration of v1 project files
 */
'use strict';
const { openApp, log } = require('./_helpers');

(async () => {
  const { browser, page, errors } = await openApp({ query: 'selftest=1' });
  await page.waitForSelector('#selftestSummary', { state: 'attached', timeout: 30000 });
  const out = await page.evaluate(() => {
    const s = document.getElementById('selftestSummary');
    const rows = Array.from(document.querySelectorAll('#selftestOutput > div'))
      .map(d => d.innerText.replace(/\n/g, ' | '));
    return { passed: +s.dataset.passed, total: +s.dataset.total, rows };
  });
  log(`\nself-test: ${out.passed}/${out.total} passed`);
  out.rows.forEach(r => log('  ' + r));
  if (errors.length) { log('\nscript errors:'); errors.forEach(e => log('  ' + e)); }
  await browser.close();
  process.exit(out.passed === out.total && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
