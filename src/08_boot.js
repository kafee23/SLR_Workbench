<script>
'use strict';
/* ════════════════════════════════════════════════════════════════
   PROJECT FILE I/O · EXPORTS · BOOT
   ════════════════════════════════════════════════════════════════ */

const Exports = {
  recordsCSV() {
    const rows = [['ID', 'Title', 'Authors', 'Year', 'Journal', 'DOI', 'Source database', 'Keywords',
      'Volume', 'Issue', 'Pages', 'Duplicate', 'Duplicate group', 'Match score', 'Abstract']];
    State.records.forEach(r => rows.push([r.id, r.title, r.authors, r.year, r.journal, r.doi, r.dbSource,
      r.keywords, r.volume, r.issue, r.pages, r.isDuplicate ? 'Yes' : '', r.dupGroup || '', r.dupScore || '', r.abstract]));
    downloadBlob(toCSV(rows), 'text/csv;charset=utf-8', Project.slug() + '_records.csv');
    toast('Records exported', 'ok');
  }
};

const Project = {
  slug() {
    return (State.project.title || 'review').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'review';
  },

  renderForm() {
    const p = State.project;
    const set = (id, v) => { const e = $(id); if (e && e.value !== v) e.value = v; };
    set('pjTitle', p.title); set('pjType', p.reviewType); set('pjFramework', p.framework);
    set('pjQuestion', p.question); set('pjReg', p.registration); set('pjSearchDate', p.lastSearchDate);
    $('autosaveToggle').checked = !!State.settings.autosave;
    Reviewers.render();
    UI.refreshProjectStats();
  },

  bindForm() {
    const map = { pjTitle: 'title', pjType: 'reviewType', pjFramework: 'framework',
      pjQuestion: 'question', pjReg: 'registration', pjSearchDate: 'lastSearchDate' };
    Object.keys(map).forEach(id => {
      const node = $(id);
      node.addEventListener('change', () => {
        const key = map[id], old = State.project[key];
        if (old === node.value) return;
        mutate('project', `${key} changed from "${old || 'empty'}" to "${node.value || 'empty'}"`,
          () => { State.project[key] = node.value; });
        UI.refreshProjectStats();
      });
    });
    $('projFileInput').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (f) await this.openFile(f);
    });
    $('mergeFileInput').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (f) await this.doMerge(f);
    });
  },

  saveToFile() {
    State.project.modified = nowISO();
    const payload = JSON.stringify(State, null, 1);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(payload, 'application/json', `${this.slug()}_${stamp}.slrproj`);
    logAudit('project', `Exported project file (${State.records.length} records, ${(payload.length / 1024).toFixed(0)} KB)`);
    Store.markDirty();
    toast('Project file saved', 'ok');
  },

  async openFile(file) {
    if (Store.isDirty()) {
      const ok = await UI.confirm('Discard unsaved changes?',
        'The review currently open has changes that are not in a .slrproj file. Opening another project replaces it.', 'Open anyway');
      if (!ok) return;
    }
    try {
      const raw = JSON.parse(await file.text());
      const next = migrateState(raw);
      State = next;
      logAudit('project', `Opened project file ${file.name} (${State.records.length} records)`, 'system');
      Store.markDirty();
      bootRender();
      toast(`Opened "${State.project.title}"`, 'ok');
    } catch (e) {
      toast('Could not open that file: ' + e.message, 'err');
    }
  },

  mergeFromFile() { $('mergeFileInput').click(); },

  /* Merging a co-reviewer's file: decisions are unioned by reviewer, so a
     second screener's independent pass can be folded in without either
     party's decisions being overwritten. */
  async doMerge(file) {
    let incoming;
    try { incoming = migrateState(JSON.parse(await file.text())); }
    catch (e) { toast('Could not read that file: ' + e.message, 'err'); return; }

    const byId = new Map(State.records.map(r => [r.id, r]));
    const byDoi = new Map(State.records.filter(r => r.doi).map(r => [r.doi, r]));
    const byTitle = new Map(State.records.map(r => [normTitle(r.title), r]));

    let newReviewers = 0, matched = 0, added = 0, decisionsAdded = 0, conflictsCreated = 0;
    const report = [];

    incoming.reviewers.forEach(rv => {
      if (!State.reviewers.some(x => x.id === rv.id)) {
        State.reviewers.push(rv); newReviewers++;
      }
    });

    incoming.records.forEach(inc => {
      let target = byId.get(inc.id)
        || (inc.doi && byDoi.get(inc.doi))
        || byTitle.get(normTitle(inc.title));
      if (!target) {
        State.records.push(inc); added++;
        return;
      }
      matched++;
      STAGES.forEach(s => {
        const before = effectiveDecision(target, s);
        Object.keys(inc.decisions[s] || {}).forEach(revId => {
          if (!target.decisions[s][revId]) { target.decisions[s][revId] = inc.decisions[s][revId]; decisionsAdded++; }
        });
        if (!target.exclusionReason[s] && inc.exclusionReason[s]) target.exclusionReason[s] = inc.exclusionReason[s];
        const after = effectiveDecision(target, s);
        if (after === 'conflict' && before !== 'conflict') conflictsCreated++;
      });
    });

    mutate('project', `Merged ${file.name}: ${matched} records matched, ${added} added, ${decisionsAdded} decisions imported, ${newReviewers} new reviewers, ${conflictsCreated} new conflicts surfaced`, () => {});
    report.push(`<strong>${matched.toLocaleString()}</strong> records matched an existing record`);
    if (added) report.push(`<strong>${added.toLocaleString()}</strong> records were new and have been added`);
    report.push(`<strong>${decisionsAdded.toLocaleString()}</strong> decisions imported`);
    if (newReviewers) report.push(`<strong>${newReviewers}</strong> reviewer${newReviewers === 1 ? '' : 's'} added to the register`);
    report.push(conflictsCreated
      ? `<strong>${conflictsCreated.toLocaleString()}</strong> new conflicts are now waiting on the Agreement tab`
      : 'No new conflicts were created');

    bootRender();
    UI.openModal('Merge complete',
      `<p style="margin-bottom:12px">Merged <span class="mono">${esc(file.name)}</span>.</p>
       <ul style="margin-left:18px;line-height:1.9;font-size:13px">${report.map(r => '<li>' + r + '</li>').join('')}</ul>
       <div class="callout" style="margin-top:14px">Existing decisions were never overwritten. Where the two files disagreed, both decisions are kept and the record now appears in the conflict queue.</div>`,
      '<button class="btn btn-teal" onclick="UI.closeModal()">Close</button>');
  },

  async resetAll() {
    const ok = await UI.confirm('Start a new empty project?',
      'This clears every record, decision and setting from the screen. Save a .slrproj file first if you want to keep this review.', 'Start new project');
    if (!ok) return;
    State = blankState();
    logAudit('project', 'Started a new empty project', 'system');
    Store.markDirty();
    bootRender();
    toast('New project started', 'ok');
  }
};

/* ── render everything ─────────────────────────────────────── */
function bootRender() {
  Project.renderForm();
  Records.render();
  SearchRec.render();
  Checklist.items();
  UI.refreshCounts();
  const tab = UI.activeTab;
  UI.switchTab(tab);
}

/* ── boot ──────────────────────────────────────────────────── */
(async function boot() {
  // tab bar
  $('tabBar').addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (t) UI.switchTab(t.dataset.tab);
  });
  $('modalBack').addEventListener('click', e => { if (e.target === $('modalBack')) UI.closeModal(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeModal(false); });

  Import.init();
  Records.init();
  Screen.init();
  Project.bindForm();

  await Store.init();
  const saved = await Store.load();
  if (saved) {
    try {
      State = migrateState(saved.state);
      State.meta.lastSavedAt = saved.savedAt;
      toast(`Restored "${State.project.title}" from this browser`, 'ok');
    } catch (e) {
      toast('A saved project was found but could not be read: ' + e.message, 'err');
    }
  }
  if (!State.reviewers.length) {
    // A dual-screened review needs two reviewers; start people off with them.
    State.reviewers = [
      { id: uid('rev'), name: 'Reviewer A', initials: 'RA', colour: REVIEWER_COLOURS[0] },
      { id: uid('rev'), name: 'Reviewer B', initials: 'RB', colour: REVIEWER_COLOURS[1] }
    ];
    State.activeReviewerId = State.reviewers[0].id;
  }
  Checklist.items();

  // restore dedup settings into the controls
  $('dupThreshold').value = State.settings.dupThreshold;
  $('dupThreshVal').textContent = State.settings.dupThreshold + '%';
  $('dupStrategy').value = State.settings.dupStrategy;
  $('dupYearGuard').value = String(State.settings.dupYearGuard);

  bootRender();
  if (State.records.length) { $('recordTableCard').style.display = ''; }

  window.addEventListener('beforeunload', e => {
    if (Store.isDirty() && Store.backend() === 'none') { e.preventDefault(); e.returnValue = ''; }
  });

  // Keep the relative "last saved" label honest without re-rendering the page.
  setInterval(() => { if ($('pjStatSaved')) $('pjStatSaved').textContent = fmtRelative(State.meta.lastSavedAt); }, 20000);
})();

/* ── self-test, opened with ?selftest=1 ────────────────────────
   Verifies the parts of the tool where a silent wrong answer would be
   worse than a crash: the edit distance, the kappa arithmetic, and the
   blocked deduplication finding what an exhaustive pass would find. */
function runSelfTest() {
  const results = [];
  const ok = (name, pass, detail) => results.push({ name, pass, detail: detail || '' });

  // reference Levenshtein, full matrix
  function refLev(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    return d[m][n];
  }
  const alphabet = 'abcdefgh ';
  let levFails = 0, levChecked = 0;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 900; t++) {
    const la = 1 + Math.floor(rnd() * 40), lb = 1 + Math.floor(rnd() * 40);
    let a = '', b = '';
    for (let i = 0; i < la; i++) a += alphabet[Math.floor(rnd() * alphabet.length)];
    for (let i = 0; i < lb; i++) b += alphabet[Math.floor(rnd() * alphabet.length)];
    const truth = refLev(a, b);
    for (const cap of [0, 1, 3, 8, 50]) {
      levChecked++;
      const got = boundedLev(a, b, cap);
      const expect = truth <= cap ? truth : cap + 1;
      if (got !== expect) { levFails++; if (levFails < 4) console.error('lev mismatch', { a, b, cap, got, expect }); }
    }
  }
  ok('boundedLev matches a full-matrix reference', levFails === 0, `${levChecked} comparisons, ${levFails} mismatches`);

  // long strings must produce a real distance, not the v1 fabricated one
  const long1 = 'a'.repeat(400), long2 = 'a'.repeat(399) + 'b';
  ok('long strings are compared honestly', boundedLev(long1, long2, 5) === 1, `distance ${boundedLev(long1, long2, 5)} for two 400-char strings differing by one character`);

  // Cohen's kappa against a hand-computed example.
  // 2x2: a=20 both include, b=5, c=10, d=15 → n=50, po=.70, pe=.5, kappa=.40
  (function () {
    const saveRecords = State.records, saveRevs = State.reviewers;
    const A = 'ta', B = 'tb';
    State.reviewers = [{ id: A, name: 'A', initials: 'A', colour: '#000' }, { id: B, name: 'B', initials: 'B', colour: '#111' }];
    const mk = (a, b) => { const r = normaliseRecord({ title: 't' + Math.random() }); r.decisions.title[A] = a; r.decisions.title[B] = b; return r; };
    const recs = [];
    for (let i = 0; i < 20; i++) recs.push(mk('include', 'include'));
    for (let i = 0; i < 5; i++) recs.push(mk('include', 'exclude'));
    for (let i = 0; i < 10; i++) recs.push(mk('exclude', 'include'));
    for (let i = 0; i < 15; i++) recs.push(mk('exclude', 'exclude'));
    State.records = recs;
    const res = Agreement.cohen('title', A, B, 'include');
    ok('Cohen’s kappa matches a hand-computed 2×2', Math.abs(res.kappa - 0.4) < 1e-9 && res.n === 50,
      `n=${res.n}, po=${res.po.toFixed(3)}, pe=${res.pe.toFixed(3)}, kappa=${res.kappa.toFixed(6)} (expected 0.400000)`);

    // Fleiss with perfect agreement across 3 raters must be 1
    const C = 'tc';
    State.reviewers.push({ id: C, name: 'C', initials: 'C', colour: '#222' });
    const perfect = [];
    for (let i = 0; i < 10; i++) { const r = normaliseRecord({ title: 'p' + i }); r.decisions.title[A] = 'include'; r.decisions.title[B] = 'include'; r.decisions.title[C] = 'include'; perfect.push(r); }
    for (let i = 0; i < 10; i++) { const r = normaliseRecord({ title: 'q' + i }); r.decisions.title[A] = 'exclude'; r.decisions.title[B] = 'exclude'; r.decisions.title[C] = 'exclude'; perfect.push(r); }
    State.records = perfect;
    const f = Agreement.fleiss('title', [A, B, C], 'include');
    ok('Fleiss’ kappa is 1 under perfect agreement', Math.abs(f.kappa - 1) < 1e-9, `kappa=${f.kappa.toFixed(6)} over n=${f.n}`);
    State.records = saveRecords; State.reviewers = saveRevs;
  })();

  // Blocking must not lose duplicates an exhaustive pass would find.
  (function () {
    const titles = [];
    let s2 = 999;
    const r2 = () => { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; return s2 / 0x7fffffff; };
    const words = ['adversarial', 'federated', 'detection', 'privacy', 'network', 'anomaly', 'learning',
      'systems', 'evaluation', 'framework', 'robust', 'secure', 'edge', 'graph', 'transfer'];
    for (let i = 0; i < 700; i++) {
      const n = 6 + Math.floor(r2() * 5);
      let t = '';
      for (let j = 0; j < n; j++) t += words[Math.floor(r2() * words.length)] + ' ';
      titles.push(t.trim());
    }
    // inject 80 near-duplicates
    for (let i = 0; i < 80; i++) {
      const base = titles[Math.floor(r2() * 600)];
      titles.push(r2() > 0.5 ? base + ' study' : base.replace(/^\w+\s/, ''));
    }
    const recs = titles.map((t, i) => normaliseRecord({ title: t, year: '2020', id: 'r' + i }));
    const norm = recs.map(r => normTitle(r.title));
    const TH = 88;
    // exhaustive truth
    const truth = new Set();
    for (let i = 0; i < recs.length; i++) for (let j = i + 1; j < recs.length; j++) {
      if (titleSimilarity(norm[i], norm[j], TH) >= TH) truth.add(i + ':' + j);
    }
    // blocked candidates
    const blocks = new Map();
    recs.forEach((r, i) => Dedup.blockKeys(r).forEach(k => {
      let a = blocks.get(k); if (!a) { a = []; blocks.set(k, a); } a.push(i);
    }));
    const found = new Set();
    let compared = 0;
    for (const [, idxs] of blocks) {
      if (idxs.length < 2 || idxs.length > 400) continue;
      for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) {
        const i = Math.min(idxs[a], idxs[b]), j = Math.max(idxs[a], idxs[b]);
        compared++;
        if (titleSimilarity(norm[i], norm[j], TH) >= TH) found.add(i + ':' + j);
      }
    }
    let missed = 0;
    truth.forEach(k => { if (!found.has(k)) missed++; });
    const recall = truth.size ? (truth.size - missed) / truth.size : 1;
    const exhaustive = (recs.length * (recs.length - 1)) / 2;
    ok('blocking recalls the duplicate pairs an exhaustive pass finds', recall >= 0.98,
      `recall ${(recall * 100).toFixed(1)}% (${truth.size - missed}/${truth.size} pairs), ${compared.toLocaleString()} candidate comparisons vs ${exhaustive.toLocaleString()} exhaustive`);
  })();

  // Record normalisation must survive a round trip through JSON.
  (function () {
    const r = normaliseRecord({ title: 'x', doi: 'https://doi.org/10.1/AB' });
    const back = normaliseRecord(JSON.parse(JSON.stringify(r)));
    ok('DOI is normalised for matching', r.doi === '10.1/ab', `got "${r.doi}"`);
    ok('records survive a JSON round trip', JSON.stringify(r) === JSON.stringify(back));
  })();

  // v1 project files must migrate rather than fail.
  (function () {
    const v1 = { projectTitle: 'Legacy', papers: [{ id: 'p1', title: 'Legacy paper', screenTitle: 'include', screenFulltext: 'exclude', screenExclusionReason: 'Wrong population' }], sources: [{ name: 'Scopus', count: 10 }] };
    try {
      const m = migrateState(v1);
      const rec = m.records[0];
      ok('v1 project files migrate with decisions preserved',
        m.schemaVersion === 2 && rec.decisions.title.legacy_reviewer === 'include' && rec.exclusionReason.fulltext === 'Wrong population',
        `title decision "${rec.decisions.title.legacy_reviewer}", reason "${rec.exclusionReason.fulltext}"`);
    } catch (e) { ok('v1 project files migrate with decisions preserved', false, e.message); }
  })();

  const passed = results.filter(r => r.pass).length;
  const host = document.createElement('div');
  host.id = 'selftestOutput';
  host.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999;overflow:auto;padding:30px;font-family:DM Mono,monospace;font-size:13px';
  host.innerHTML = `<h1 style="font-family:Syne,sans-serif;margin-bottom:14px">Self-test: ${passed}/${results.length} passed</h1>` +
    results.map(r => `<div style="padding:9px 12px;margin-bottom:7px;border-radius:7px;background:${r.pass ? '#eef6f0' : '#fdeeea'};border-left:4px solid ${r.pass ? '#4a7a5a' : '#d4604a'}">
      <strong>${r.pass ? 'PASS' : 'FAIL'}</strong> &nbsp;${esc(r.name)}<br><span style="color:#666;font-size:11.5px">${esc(r.detail)}</span></div>`).join('') +
    `<div id="selftestSummary" data-passed="${passed}" data-total="${results.length}"></div>`;
  document.body.appendChild(host);
  return { passed, total: results.length, results };
}
if (location.search.indexOf('selftest=1') >= 0) {
  window.addEventListener('load', () => setTimeout(runSelfTest, 350));
}
</script>
</body>
</html>
