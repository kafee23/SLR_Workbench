/*
 * Builds examples/sample_review.slrproj: a small review part-way through
 * screening, assembled from the four example exports so that everything in
 * it is traceable to a file in examples/.
 *
 * The project has two reviewers, deduplication already run, title screening
 * complete for both reviewers with a couple of deliberate disagreements (one
 * resolved, one left open), abstract screening under way, a search record,
 * and PRISMA counts derived from the decisions. Open it from the Project tab
 * to see every part of the tool populated.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { openApp, ROOT, log } = require('./_helpers');

const EX = path.join(ROOT, 'examples');
const read = (f) => fs.readFileSync(path.join(EX, f), 'utf8');

(async () => {
  const { browser, page } = await openApp();
  const files = {
    'Web of Science': ['web_of_science.ris', read('web_of_science.ris')],
    'IEEE Xplore': ['ieee_xplore.bib', read('ieee_xplore.bib')],
    'PubMed': ['pubmed.nbib', read('pubmed.nbib')],
    'Scopus': ['scopus_export.csv', read('scopus_export.csv')]
  };
  const json = await page.evaluate(async (files) => {
    State = blankState();
    State.project.title = 'Learning-based intrusion detection under distribution shift: a systematic review';
    State.project.reviewType = 'systematic';
    State.project.framework = 'PICO';
    State.project.question = 'How robust are learning-based network intrusion detection systems to distribution shift and adversarial perturbation under realistic deployment conditions?';
    State.project.registration = 'OSF: osf.io/example';
    State.project.lastSearchDate = '2026-09-15';
    State.reviewers = [
      { id: 'rev_a', name: 'Reviewer A', initials: 'RA', colour: REVIEWER_COLOURS[0] },
      { id: 'rev_b', name: 'Reviewer B', initials: 'RB', colour: REVIEWER_COLOURS[1] }
    ];
    State.activeReviewerId = 'rev_a';
    State.blinded = true;

    // import each export attributed to its database, as the UI would
    for (const [source, [name, text]] of Object.entries(files)) {
      const { kind, rows } = Parse.run(name, text);
      const batch = uid('batch');
      const added = rows.map(r => normaliseRecord(Object.assign({}, r, { id: uid('rec'), dbSource: source, importBatch: batch })));
      mutate('import', `Imported ${added.length} records from ${name} (${kind.toUpperCase()}) attributed to ${source}`, () => {
        State.records = State.records.concat(added);
        State.sources.push({ id: uid('src'), name: source, count: added.length });
      });
    }
    await Dedup.run();

    // title screening by both reviewers, with two disagreements
    const live = State.records.filter(r => !r.isDuplicate);
    const includeIf = (r) => /intrusion|anomaly|adversarial|lateral movement|malware|zero trust|graph neural/i.test(r.title);
    live.forEach((r, i) => {
      const a = includeIf(r) ? 'include' : 'exclude';
      let b = a;
      if (i === 1) b = a === 'include' ? 'exclude' : 'include';   // disagreement, resolved below
      if (i === 4) b = a === 'include' ? 'exclude' : 'include';   // disagreement, left open
      r.decisions.title.rev_a = a; r.decisions.title.rev_b = b;
      if (a === 'exclude') r.exclusionReason.title = 'Not about detection or defence';
    });
    logAudit('screen', 'Title screening completed by both reviewers (sample project)', 'Reviewer A');
    const open = Agreement.conflictRecords();
    if (open[0]) Agreement.resolve(open[0].rec.id, open[0].stage, 'include');

    // abstract screening under way for Reviewer A only
    Screen.eligible('abstract').slice(0, 4).forEach((r, i) => {
      r.decisions.abstract.rev_a = i === 3 ? 'exclude' : 'include';
      if (i === 3) r.exclusionReason.abstract = 'No empirical evaluation';
    });

    State.searchRows = [
      { id: uid('sr'), db: 'Scopus', query: 'TITLE-ABS-KEY(("intrusion detection" OR "anomaly detection") AND ("distribution shift" OR adversarial OR robust*))', filters: '2015 to 2026; English', date: '2026-09-15', retrieved: 7, selected: 7 },
      { id: uid('sr'), db: 'Web of Science', query: 'TS=(("intrusion detection" OR "anomaly detection") AND ("distribution shift" OR adversarial OR robust*))', filters: '2015 to 2026', date: '2026-09-15', retrieved: 6, selected: 6 },
      { id: uid('sr'), db: 'IEEE Xplore', query: '("intrusion detection" OR "anomaly detection") AND (adversarial OR "distribution shift")', filters: 'Journals and conferences', date: '2026-09-15', retrieved: 5, selected: 5 },
      { id: uid('sr'), db: 'PubMed', query: '(intrusion detection[tiab] OR anomaly detection[tiab]) AND (adversarial[tiab] OR robust*[tiab])', filters: 'none', date: '2026-09-15', retrieved: 4, selected: 4 }
    ];
    Prisma.autoFill();
    State.reasons = [{ id: uid('rsn'), reason: 'Not about detection or defence', count: 0 }, { id: uid('rsn'), reason: 'No empirical evaluation', count: 0 }];
    Checklist.items();
    const c = State.checklist;
    c.find(i => i.no === '1').done = true; c.find(i => i.no === '1').location = 'Title';
    c.find(i => i.no === '4').done = true; c.find(i => i.no === '4').location = 'Section 1.2';
    c.find(i => i.no === '24a').done = true; c.find(i => i.no === '24a').location = 'Section 2.1';
    c.find(i => i.no === '12').na = true; c.find(i => i.no === '12').note = 'Narrative synthesis; no pooled effect measure';
    State.project.modified = nowISO();
    return JSON.stringify(State, null, 1);
  }, files);

  const out = path.join(EX, 'sample_review.slrproj');
  fs.writeFileSync(out, json);
  const state = JSON.parse(json);
  log(`wrote ${path.relative(ROOT, out)}: ${state.records.length} records, ${state.records.filter(r => r.isDuplicate).length} flagged duplicates, ${state.audit.length} audit entries, ${(json.length / 1024).toFixed(0)} KB`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
