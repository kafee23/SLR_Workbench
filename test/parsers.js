/*
 * Parser checks: RIS, BibTeX, NBIB/MEDLINE and CSV fixtures from examples/
 * are parsed inside the app and the results compared with expectations.
 * Also confirms that the same paper exported from three databases in three
 * formats normalises to one DOI and 100 per cent title similarity, which is
 * what lets deduplication match records across sources.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { openApp, ROOT, log, pass, fail } = require('./_helpers');

const EX = path.join(ROOT, 'examples');
const read = (f) => fs.readFileSync(path.join(EX, f), 'utf8');

(async () => {
  const { browser, page, errors } = await openApp();
  const fixtures = {
    'web_of_science.ris': read('web_of_science.ris'),
    'ieee_xplore.bib': read('ieee_xplore.bib'),
    'pubmed.nbib': read('pubmed.nbib'),
    'scopus_export.csv': read('scopus_export.csv')
  };

  const res = await page.evaluate((fx) => {
    const out = {};
    for (const [name, text] of Object.entries(fx)) {
      const r = Parse.run(name, text);
      out[name] = { kind: r.kind, rows: r.rows };
    }
    // the shared paper appears in all four exports
    const shared = 'Adversarial robustness of intrusion detection models under distribution shift';
    const findShared = (rows) => rows.find(x => normTitle(x.title) === normTitle(shared));
    const hits = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, findShared(v.rows)]));
    const norm = Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, v ? normaliseRecord(v) : null]));
    return { out, hits, dois: Object.fromEntries(Object.entries(norm).map(([k, v]) => [k, v ? v.doi : null])) };
  }, fixtures);

  let failures = 0;
  const check = (name, cond, detail) => { if (cond) pass(name, detail); else { fail(name, detail); failures++; } };

  log('\nparser checks');
  check('RIS detected and parsed', res.out['web_of_science.ris'].kind === 'ris' && res.out['web_of_science.ris'].rows.length === 6, `${res.out['web_of_science.ris'].rows.length} records`);
  check('BibTeX detected and parsed', res.out['ieee_xplore.bib'].kind === 'bibtex' && res.out['ieee_xplore.bib'].rows.length === 5, `${res.out['ieee_xplore.bib'].rows.length} records`);
  check('NBIB detected and parsed', res.out['pubmed.nbib'].kind === 'nbib' && res.out['pubmed.nbib'].rows.length === 4, `${res.out['pubmed.nbib'].rows.length} records`);
  check('CSV detected and parsed', res.out['scopus_export.csv'].kind === 'csv' && res.out['scopus_export.csv'].rows.length === 7, `${res.out['scopus_export.csv'].rows.length} records`);

  const ris0 = res.out['web_of_science.ris'].rows[0];
  check('RIS multi-line title continuation joined', /under distribution shift$/.test(ris0.title), ris0.title);
  check('RIS authors joined with semicolons', ris0.authors.includes(';'), ris0.authors);
  check('RIS pages built from SP and EP', ris0.pages === '101-118', ris0.pages);

  const bib0 = res.out['ieee_xplore.bib'].rows[0];
  check('BibTeX braces stripped from fields', !/[{}]/.test(bib0.title) && !/[{}]/.test(bib0.journal), bib0.journal);
  check('BibTeX double hyphen pages normalised', bib0.pages === '101-118', bib0.pages);

  const nb0 = res.out['pubmed.nbib'].rows[0];
  check('NBIB indented continuation joined', /systematic review$/.test(nb0.title), nb0.title);
  check('NBIB DOI taken from AID [doi]', nb0.doi === '10.1000/nbib.0001', nb0.doi);

  const csv = res.out['scopus_export.csv'].rows;
  const quoted = csv.find(r => /commas and/.test(r.abstract));
  check('CSV quoted field with commas and embedded newline preserved', !!quoted && /\n/.test(quoted.abstract));
  const escaped = csv.find(r => /"defences"/.test(r.abstract));
  check('CSV doubled quotes unescaped', !!escaped);

  const doiSet = new Set(Object.values(res.dois).filter(Boolean));
  check('shared paper found in all four exports', Object.values(res.hits).every(Boolean));
  check('shared paper normalises to one DOI across formats', doiSet.size === 1, Array.from(doiSet).join(', '));

  if (errors.length) { log('\nscript errors:'); errors.forEach(e => log('  ' + e)); failures++; }
  log(`\n${failures ? failures + ' failure(s)' : 'all parser checks passed'}`);
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
