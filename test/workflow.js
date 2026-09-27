/*
 * End-to-end workflow check on a 5,000-record synthetic corpus.
 *
 *  1. storage backend detected
 *  2. deduplication: precision, recall, timing, candidate pairs
 *  3. table virtualisation: DOM rows for 5,000 records
 *  4. dual screening and Cohen's kappa
 *  5. conflict resolution removes the record from the queue
 *  6. PRISMA derivation and consistency checks
 *  7. flow diagram builds in single- and two-arm forms without NaN/undefined
 *  8. autosave then reload restores the project
 *  9. every tab renders; analytics charts and checklist rows counted
 * 10. .slrproj round trip is lossless
 * 11. co-reviewer merge imports decisions, overwrites none, surfaces conflicts
 *
 * Thresholds are deliberately conservative so the check is stable across
 * machines: recall must be 100 per cent, precision at least 95 per cent, and
 * deduplication must finish inside 15 seconds.
 */
'use strict';
const { openApp, log, pass, fail } = require('./_helpers');
const corpusSource = require('./corpus');

(async () => {
  const { browser, page, errors } = await openApp();
  let failures = 0;
  const check = (name, cond, detail) => { if (cond) pass(name, detail); else { fail(name, detail); failures++; } };

  log('\nworkflow checks');

  // 1
  const backend = await page.evaluate(() => Store.backend());
  check('storage backend available', backend !== 'none', backend);

  // 2
  const dd = await page.evaluate(async (src) => {
    const recs = eval(src);
    State.records = recs;
    State.sources = [{ id: 'sx', name: 'Mixed', count: recs.length }];
    const t0 = performance.now(); await Dedup.run(); const ms = Math.round(performance.now() - t0);
    const byGroup = new Map();
    State.records.forEach(x => { if (x.dupGroup) { const a = byGroup.get(x.dupGroup) || []; a.push(x); byGroup.set(x.dupGroup, a); } });
    const sharesTruth = (x) => (byGroup.get(x.dupGroup) || []).some(y => y !== x && y.truthId === x.truthId);
    const detected = State.records.filter(x => x._planted && x.dupGroup && sharesTruth(x)).length;
    let tp = 0, fp = 0; State.records.filter(x => x.isDuplicate).forEach(x => { if (sharesTruth(x)) tp++; else fp++; });
    let largest = 0; byGroup.forEach(g => { largest = Math.max(largest, g.length); });
    const audit = State.audit.find(a => a.action === 'dedup').detail;
    const cand = +(audit.match(/([\d,]+) candidate pairs/)[1].replace(/,/g, ''));
    return { n: State.records.length, ms, tp, fp, detected, largest, cand, exhaustive: recs.length * (recs.length - 1) / 2 };
  }, corpusSource(4500, 500, 4242));
  const precision = dd.tp / (dd.tp + dd.fp), recall = dd.detected / 500;
  check('deduplication recalls every planted duplicate', recall === 1, `${dd.detected}/500`);
  check('deduplication precision at least 95 per cent', precision >= 0.95, `${(precision * 100).toFixed(1)}% (${dd.fp} false flags)`);
  check('deduplication finishes inside 15 s', dd.ms < 15000, `${dd.ms} ms, ${dd.cand.toLocaleString()} candidate pairs of ${dd.exhaustive.toLocaleString()}`);
  check('no runaway duplicate group', dd.largest <= 6, `largest group ${dd.largest}`);

  // 3
  await page.evaluate(() => UI.switchTab('tab-import'));
  await page.waitForTimeout(400);
  const dom = await page.evaluate(() => ({ rows: document.querySelectorAll('#recBody tr:not(.spacer)').length, total: Records.filtered().length }));
  check('record table is virtualised', dom.rows < 60 && dom.total >= 4900, `${dom.rows} DOM rows for ${dom.total} records`);

  // 4
  const k = await page.evaluate(() => {
    const [A, B] = State.reviewers;
    const live = State.records.filter(r => !r.isDuplicate).slice(0, 300);
    let s = 7; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    live.forEach(rec => {
      const a = r() > 0.6 ? 'include' : 'exclude';
      const b = r() > 0.12 ? a : (a === 'include' ? 'exclude' : 'include');
      rec.decisions.title[A.id] = a; rec.decisions.title[B.id] = b;
    });
    const res = Agreement.cohen('title', A.id, B.id, 'include');
    return { n: res.n, po: res.po, kappa: res.kappa, lo: res.lo, hi: res.hi, conflicts: Agreement.conflictRecords().length };
  });
  check('kappa computed over doubly screened records only', k.n === 300, `n=${k.n}, po=${(k.po * 100).toFixed(1)}%, kappa=${k.kappa.toFixed(3)} [${k.lo.toFixed(3)}, ${k.hi.toFixed(3)}]`);
  check('disagreements appear in the conflict queue', k.conflicts > 0, `${k.conflicts} conflicts`);

  // 5
  const res5 = await page.evaluate(() => {
    const before = Agreement.conflictRecords().length;
    const first = Agreement.conflictRecords()[0];
    Agreement.resolve(first.rec.id, first.stage, 'include');
    return { before, after: Agreement.conflictRecords().length, eff: effectiveDecision(first.rec, first.stage) };
  });
  check('resolving a conflict removes it from the queue', res5.after === res5.before - 1 && res5.eff === 'include', `${res5.before} -> ${res5.after}`);

  // 6
  const pr = await page.evaluate(() => { Prisma.autoFill(); return { d: Prisma.derive(), checks: Prisma.checks().map(c => c[0]) }; });
  check('PRISMA counts derived from records', pr.d.dbIdentified === 5000 && pr.d.screened > 4000, `identified=${pr.d.dbIdentified}, screened=${pr.d.screened}, excluded=${pr.d.screenExcluded}`);
  check('consistency checks report screening in progress', pr.checks.includes('info'), pr.checks.join(', '));

  // 7
  const dg = await page.evaluate(() => {
    const single = Diagram.build({ typeScale: 1 });
    State.prisma.showOtherArm = true;
    State.otherSources = [{ id: 'o1', name: 'Citation searching', count: 40 }];
    const dual = Diagram.build({ typeScale: 1.4 });
    State.prisma.showOtherArm = false;
    return { singleOk: single.includes('<svg') && !/NaN|undefined/.test(single), dualOk: dual.includes('other methods') && !/NaN|undefined/.test(dual) };
  });
  check('single-arm flow diagram builds cleanly', dg.singleOk);
  check('two-arm flow diagram builds cleanly at print scale', dg.dualOk);

  // 8
  await page.evaluate(async () => { State.project.title = 'Persistence probe'; Store.markDirty(); await Store.saveNow(); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  const restored = await page.evaluate(() => ({
    title: State.project.title, records: State.records.length,
    flagged: State.records.filter(r => r.isDuplicate).length,
    decisions: State.records.reduce((a, r) => a + Object.keys(r.decisions.title).length, 0)
  }));
  check('autosave restores the project after reload', restored.title === 'Persistence probe' && restored.records === 5000 && restored.decisions >= 600, `${restored.records} records, ${restored.flagged} flagged, ${restored.decisions} decisions`);

  // 9
  const tabs = await page.$$eval('.tab', ts => ts.map(t => t.dataset.tab));
  for (const t of tabs) { await page.evaluate(id => UI.switchTab(id), t); await page.waitForTimeout(200); }
  const charts = await page.evaluate(() => { UI.switchTab('tab-analytics'); return document.querySelectorAll('#analyticsGrid svg').length; });
  const chk = await page.evaluate(() => { UI.switchTab('tab-checklist'); const items = Checklist.items(); return { rows: items.length, numbered: new Set(items.map(i => i.no.replace(/[a-z]/g, ''))).size }; });
  check('all tabs render without error', tabs.length === 10, `${tabs.length} tabs`);
  check('analytics draws five SVG charts', charts === 5, `${charts} charts`);
  check('checklist has 42 rows across 27 numbered items', chk.rows === 42 && chk.numbered === 27, `${chk.rows} rows, ${chk.numbered} items`);

  // 10
  const rt = await page.evaluate(() => {
    const json = JSON.stringify(State);
    const back = migrateState(JSON.parse(json));
    return { same: back.records.length === State.records.length && back.project.title === State.project.title && back.audit.length === State.audit.length, kb: Math.round(json.length / 1024) };
  });
  check('.slrproj round trip is lossless', rt.same, `${rt.kb} KB`);

  // 11  co-reviewer merge: B screens 200 further records in a separate copy;
  //     merging must import B's decisions, overwrite none of A's, and surface
  //     the disagreements as conflicts.
  const mg = await page.evaluate(async () => {
    const [A, B] = State.reviewers;
    const live = State.records.filter(r => !r.isDuplicate);
    // A decides 300..499 alone in the master copy
    live.slice(300, 500).forEach((r, i) => { r.decisions.title[A.id] = i % 3 === 0 ? 'exclude' : 'include'; });
    const aBefore = live.reduce((n, r) => n + (r.decisions.title[A.id] ? 1 : 0), 0);
    // B's copy: same project, B decides the same 200 with 10 per cent disagreement
    const copy = JSON.parse(JSON.stringify(State));
    copy.records.filter(r => !r.isDuplicate).slice(300, 500).forEach((r, i) => {
      const a = i % 3 === 0 ? 'exclude' : 'include';
      r.decisions.title[B.id] = i % 10 === 0 ? (a === 'include' ? 'exclude' : 'include') : a;
    });
    const file = new File([JSON.stringify(copy)], 'reviewer_b.slrproj', { type: 'application/json' });
    const conflictsBefore = Agreement.conflictRecords().length;
    const bBefore = live.reduce((n, r) => n + (r.decisions.title[B.id] ? 1 : 0), 0);
    await Project.doMerge(file);
    UI.closeModal();
    const live2 = State.records.filter(r => !r.isDuplicate);
    const aAfter = live2.reduce((n, r) => n + (r.decisions.title[A.id] ? 1 : 0), 0);
    const bAfter = live2.reduce((n, r) => n + (r.decisions.title[B.id] ? 1 : 0), 0);
    const aUnchanged = live2.slice(300, 500).every((r, i) => r.decisions.title[A.id] === (i % 3 === 0 ? 'exclude' : 'include'));
    return { aBefore, aAfter, bBefore, bAfter, aUnchanged, conflictsBefore, conflictsAfter: Agreement.conflictRecords().length, records: State.records.length };
  });
  check('merge imports the co-reviewer\'s decisions', mg.bAfter - mg.bBefore === 200, `${mg.bBefore} -> ${mg.bAfter} decisions by B`);
  check('merge never overwrites existing decisions', mg.aUnchanged && mg.aAfter === mg.aBefore, `${mg.aAfter} decisions by A unchanged`);
  check('merge surfaces disagreements as conflicts', mg.conflictsAfter - mg.conflictsBefore === 20, `${mg.conflictsBefore} -> ${mg.conflictsAfter} conflicts`);
  check('merge adds no records when every record matches', mg.records === 5000, `${mg.records} records`);

  if (errors.length) { log('\nscript errors:'); errors.forEach(e => log('  ' + e)); failures++; }
  log(`\n${failures ? failures + ' failure(s)' : 'all workflow checks passed'}`);
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
