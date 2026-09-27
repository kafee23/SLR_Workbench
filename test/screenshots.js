/*
 * Captures the screenshots used in the README and in the paper's workflow
 * figure. Loads the built-in 400-record sample, runs deduplication, records a
 * plausible partial dual-screening pass, then photographs each tab at 2x
 * with all notifications cleared.
 *
 *   npm run screenshots        -> test/output/shot_*.png
 *   node test/screenshots.js --docs   also refreshes docs/images/*.png
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { openApp, OUT, ROOT, log } = require('./_helpers');

const toDocs = process.argv.includes('--docs');

(async () => {
  const { browser, page } = await openApp({ viewport: { width: 1280, height: 780 }, scale: 2 });
  await page.evaluate(async () => {
    State.project.title = 'Adversarial robustness of intrusion detection: a systematic review';
    State.project.registration = 'CRD42026123456';
    State.blinded = true;
    Import.loadSample();
    await Dedup.run();
    const [A, B] = State.reviewers;
    let s = 23; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    State.records.filter(x => !x.isDuplicate).forEach((rec, i) => {
      const a = r() > 0.7 ? 'include' : 'exclude';
      const b = r() > 0.1 ? a : (a === 'include' ? 'exclude' : 'include');
      if (i % 5 !== 0) rec.decisions.title[A.id] = a;
      rec.decisions.title[B.id] = b;
    });
    State.activeReviewerId = A.id;
    Screen.stage = 'title';
    Prisma.autoFill();
  });
  await page.waitForTimeout(3600); // let toasts expire

  const shots = [
    ['tab-project', 'project', 0],
    ['tab-import', 'import', 150],
    ['tab-screen', 'screening', 0],
    ['tab-agree', 'agreement', 0],
    ['tab-search', 'search-record', 0],
    ['tab-data', 'prisma-data', 0],
    ['tab-diagram', 'flow-diagram', 0],
    ['tab-analytics', 'analytics', 0],
    ['tab-checklist', 'checklist', 0],
    ['tab-audit', 'audit-log', 0]
  ];
  for (const [tab, name, scroll] of shots) {
    await page.evaluate(t => UI.switchTab(t), tab);
    await page.waitForTimeout(600);
    if (scroll) { await page.evaluate(y => window.scrollTo(0, y), scroll); await page.waitForTimeout(250); }
    const file = path.join(OUT, `shot_${name}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1280, height: 780 } });
    log('captured', path.relative(ROOT, file));
    if (toDocs) {
      fs.copyFileSync(file, path.join(ROOT, 'docs', 'images', `${name}.png`));
    }
  }
  await browser.close();
  if (toDocs) log('docs/images refreshed');
})().catch(e => { console.error(e); process.exit(1); });
