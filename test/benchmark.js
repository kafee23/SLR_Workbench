/*
 * Deduplication benchmark: three seeded runs on 4,500 distinct titles plus
 * 500 planted duplicates. Reports precision, recall, median time and the
 * number of candidate pairs compared versus an exhaustive pass.
 *
 * These are the figures quoted in the accompanying paper. Timings depend on
 * the machine; precision and recall should not.
 *
 *   npm run bench
 *   node test/benchmark.js --records 20000 --planted 2000
 */
'use strict';
const { openApp, log } = require('./_helpers');
const corpusSource = require('./corpus');

const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? +argv[i + 1] : def; };
const N = arg('records', 4500), D = arg('planted', 500), RUNS = arg('runs', 3);

(async () => {
  const { browser, page } = await openApp();
  const runs = [];
  for (let run = 0; run < RUNS; run++) {
    const r = await page.evaluate(async (src) => {
      const recs = eval(src);
      State.records = recs; State.sources = [{ id: 'sx', name: 'Mixed', count: recs.length }]; State.audit = [];
      const t0 = performance.now(); await Dedup.run(); const ms = Math.round(performance.now() - t0);
      const byGroup = new Map();
      State.records.forEach(x => { if (x.dupGroup) { const a = byGroup.get(x.dupGroup) || []; a.push(x); byGroup.set(x.dupGroup, a); } });
      const sharesTruth = (x) => (byGroup.get(x.dupGroup) || []).some(y => y !== x && y.truthId === x.truthId);
      const detected = State.records.filter(x => x._planted && x.dupGroup && sharesTruth(x)).length;
      let tp = 0, fp = 0; State.records.filter(x => x.isDuplicate).forEach(x => { if (sharesTruth(x)) tp++; else fp++; });
      const audit = State.audit.find(a => a.action === 'dedup').detail;
      const cand = +(audit.match(/([\d,]+) candidate pairs/)[1].replace(/,/g, ''));
      return { ms, tp, fp, detected, cand };
    }, corpusSource(N, D, 4242 + run * 17));
    runs.push(r);
    log(`run ${run + 1}: ${r.ms} ms, precision ${(r.tp / (r.tp + r.fp) * 100).toFixed(1)}%, recall ${(r.detected / D * 100).toFixed(1)}%, ${r.cand.toLocaleString()} candidate pairs`);
  }
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const total = N + D, exhaustive = total * (total - 1) / 2;
  log(`\n${total.toLocaleString()} records (${D} planted duplicates), ${RUNS} runs`);
  log(`median time            ${med(runs.map(r => r.ms))} ms`);
  log(`median candidate pairs ${med(runs.map(r => r.cand)).toLocaleString()}  (exhaustive would be ${exhaustive.toLocaleString()})`);
  log(`precision range        ${Math.min(...runs.map(r => r.tp / (r.tp + r.fp) * 100)).toFixed(1)} to ${Math.max(...runs.map(r => r.tp / (r.tp + r.fp) * 100)).toFixed(1)} per cent`);
  log(`recall range           ${Math.min(...runs.map(r => r.detected / D * 100)).toFixed(1)} to ${Math.max(...runs.map(r => r.detected / D * 100)).toFixed(1)} per cent`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
