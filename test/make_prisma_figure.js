/*
 * Generates the two-arm PRISMA 2020 flow diagram from a worked example whose
 * counts reconcile, exactly as the app would export it. Writes SVG to
 * test/output/prisma_example.svg (and PNG to docs/images when --docs).
 *
 * The example: five databases (4,670 records), 1,912 duplicates removed,
 * 2,758 screened, 327 reports sought, 313 assessed, 246 excluded for five
 * stated reasons; plus an other-methods arm of 67 records leading to 9
 * included reports. Studies 71, reports 76.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { openApp, OUT, ROOT, log } = require('./_helpers');

const toDocs = process.argv.includes('--docs');

(async () => {
  const { browser, page } = await openApp();
  const res = await page.evaluate(() => {
    State.sources = [
      { id: 's1', name: 'Scopus', count: 1842 }, { id: 's2', name: 'Web of Science', count: 1516 },
      { id: 's3', name: 'IEEE Xplore', count: 623 }, { id: 's4', name: 'ACM Digital Library', count: 401 },
      { id: 's5', name: 'PubMed', count: 288 }];
    State.otherSources = [{ id: 'o1', name: 'Citation searching', count: 58 }, { id: 'o2', name: 'Organisation websites', count: 9 }];
    State.reasons = [
      { id: 'r1', reason: 'Not a primary study', count: 88 }, { id: 'r2', reason: 'Wrong population', count: 61 },
      { id: 'r3', reason: 'No empirical evaluation', count: 54 }, { id: 'r4', reason: 'Outcome not reported', count: 31 },
      { id: 'r5', reason: 'Not in English', count: 12 }];
    State.prisma.showOtherArm = true;
    State.prisma.overrides = { dupRemoved: 1912, autoRemoved: 0, otherRemoved: 0, screened: 2758, screenExcluded: 2431,
      sought: 327, notRetrieved: 14, assessed: 313, fulltextExcluded: 246, studies: 71, reports: 76,
      oSought: 67, oNotRetrieved: 3, oAssessed: 64, oExcluded: 55 };
    return { svg: Diagram.build({ typeScale: 1.4 }), checks: Prisma.checks() };
  });
  log('consistency checks:', JSON.stringify(res.checks));
  const svgPath = path.join(OUT, 'prisma_example.svg');
  fs.writeFileSync(svgPath, res.svg);
  log('wrote', path.relative(ROOT, svgPath));

  // Rasterise through the browser so no external converter is needed.
  const png = await page.evaluate(async (svg) => {
    const m = svg.match(/width="(\d+)" height="(\d+)"/);
    const w = +m[1], h = +m[2], scale = 2;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = url; });
    const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png').split(',')[1];
  }, res.svg);
  const pngPath = path.join(OUT, 'prisma_example.png');
  fs.writeFileSync(pngPath, Buffer.from(png, 'base64'));
  log('wrote', path.relative(ROOT, pngPath));
  if (toDocs) {
    fs.copyFileSync(pngPath, path.join(ROOT, 'docs', 'images', 'prisma_example.png'));
    fs.copyFileSync(svgPath, path.join(ROOT, 'docs', 'images', 'prisma_example.svg'));
    log('docs/images refreshed');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
