<script>
'use strict';
/* ════════════════════════════════════════════════════════════════
   SEARCH RECORD · PRISMA DATA · FLOW DIAGRAM
   ════════════════════════════════════════════════════════════════ */

const SearchRec = {
  add() {
    mutate('prisma', 'Added a row to the search record', () => {
      State.searchRows.push({ id: uid('sr'), db: '', query: '', filters: '', date: '', retrieved: 0, selected: 0 });
    });
    this.render();
  },
  update(id, field, value) {
    const row = State.searchRows.find(r => r.id === id); if (!row) return;
    mutate('prisma', `Search record updated: ${field} for ${row.db || 'new row'}`, () => {
      row[field] = (field === 'retrieved' || field === 'selected') ? num(value) : value;
    });
    this.totals();
  },
  remove(id) {
    const row = State.searchRows.find(r => r.id === id);
    mutate('prisma', `Removed search record row for ${row ? row.db : 'unknown'}`, () => {
      State.searchRows = State.searchRows.filter(r => r.id !== id);
    });
    this.render();
  },
  totals() {
    const r = State.searchRows.reduce((a, x) => a + num(x.retrieved), 0);
    const s = State.searchRows.reduce((a, x) => a + num(x.selected), 0);
    $('srTotalRetrieved').textContent = r.toLocaleString();
    $('srTotalSelected').textContent = s.toLocaleString();
  },
  render() {
    const body = $('searchBody');
    if (!State.searchRows.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-title">No searches recorded</div>
        <div style="font-size:12.5px">Add one row per database. Journals increasingly ask for the full strategy as a supplementary file, and PRISMA-S expects it.</div></div></td></tr>`;
      this.totals(); return;
    }
    const opts = COMMON_DATABASES.map(d => `<option value="${esc(d)}">`).join('');
    body.innerHTML = State.searchRows.map(r => `<tr>
      <td><input type="text" list="dbOptions" value="${esc(r.db)}" style="font-size:12px;padding:5px 8px" onchange="SearchRec.update('${r.id}','db',this.value)"></td>
      <td><textarea class="mono" style="font-size:11px;min-height:46px;padding:5px 8px" onchange="SearchRec.update('${r.id}','query',this.value)">${esc(r.query)}</textarea></td>
      <td><input type="text" value="${esc(r.filters)}" style="font-size:11.5px;padding:5px 8px" placeholder="e.g. 2015–2026, English" onchange="SearchRec.update('${r.id}','filters',this.value)"></td>
      <td><input type="date" value="${esc(r.date)}" style="font-size:11.5px;padding:5px 8px" onchange="SearchRec.update('${r.id}','date',this.value)"></td>
      <td><input type="number" min="0" value="${num(r.retrieved)}" style="font-size:12px;padding:5px 8px;text-align:right" onchange="SearchRec.update('${r.id}','retrieved',this.value)"></td>
      <td><input type="number" min="0" value="${num(r.selected)}" style="font-size:12px;padding:5px 8px;text-align:right" onchange="SearchRec.update('${r.id}','selected',this.value)"></td>
      <td><button class="btn btn-ghost-ink btn-xs" onclick="SearchRec.remove('${r.id}')">&times;</button></td></tr>`).join('');
    if (!$('dbOptions')) document.body.insertAdjacentHTML('beforeend', `<datalist id="dbOptions">${opts}</datalist>`);
    this.totals();
  },
  export(kind) {
    const rows = State.searchRows;
    if (!rows.length) { toast('Nothing to export', 'err'); return; }
    if (kind === 'csv') {
      const out = [['Database', 'Search string', 'Filters', 'Date searched', 'Retrieved', 'Screened']];
      rows.forEach(r => out.push([r.db, r.query, r.filters, r.date, r.retrieved, r.selected]));
      downloadBlob(toCSV(out), 'text/csv;charset=utf-8', Project.slug() + '_search_record.csv');
    } else if (kind === 'latex') {
      const escTex = s => String(s || '').replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
      const body = rows.map(r => `  ${escTex(r.db)} & \\texttt{${escTex(r.query)}} & ${escTex(r.date)} & ${num(r.retrieved)} & ${num(r.selected)} \\\\`).join('\n');
      const tex = `\\begin{table}[htbp]\n\\centering\n\\caption{Search strategy by database}\n\\label{tab:search}\n\\small\n\\begin{tabular}{p{2.4cm}p{6cm}p{1.8cm}rr}\n\\hline\nDatabase & Search string & Date & Retrieved & Screened \\\\\n\\hline\n${body}\n\\hline\n\\end{tabular}\n\\end{table}\n`;
      downloadBlob(tex, 'text/plain;charset=utf-8', Project.slug() + '_search_record.tex');
    } else {
      const head = '| Database | Search string | Filters | Date | Retrieved | Screened |\n|---|---|---|---|---|---|\n';
      const body = rows.map(r => `| ${r.db} | \`${String(r.query).replace(/\|/g, '\\|')}\` | ${r.filters} | ${r.date} | ${r.retrieved} | ${r.selected} |`).join('\n');
      downloadBlob(head + body + '\n', 'text/markdown;charset=utf-8', Project.slug() + '_search_record.md');
    }
    toast('Search record exported', 'ok');
  }
};

/* ── PRISMA data ───────────────────────────────────────────── */
const Prisma = {
  /* Figures the tool can derive from the records themselves. Anything the
     tool cannot know (reports not retrieved, for instance) stays manual. */
  derive() {
    const live = State.records.filter(r => !r.isDuplicate);
    const dbIdentified = State.sources.reduce((a, s) => a + num(s.count), 0) || State.records.length;
    const otherIdentified = State.otherSources.reduce((a, s) => a + num(s.count), 0);
    const flagged = State.records.filter(r => r.isDuplicate).length;
    const removedAlready = num(State.prisma.overrides.dupRemoved);

    const titleExcl = live.filter(r => effectiveDecision(r, 'title') === 'exclude').length;
    const afterTitle = live.filter(r => advances(effectiveDecision(r, 'title')));
    const absExcl = afterTitle.filter(r => effectiveDecision(r, 'abstract') === 'exclude').length;
    const afterAbstract = afterTitle.filter(r => advances(effectiveDecision(r, 'abstract')));
    const ftExcl = afterAbstract.filter(r => effectiveDecision(r, 'fulltext') === 'exclude').length;
    const included = afterAbstract.filter(r => effectiveDecision(r, 'fulltext') === 'include');

    const studyIds = new Set();
    let unlinked = 0;
    included.forEach(r => { if (r.studyId) studyIds.add(r.studyId); else unlinked++; });

    return {
      dbIdentified, otherIdentified,
      dupRemoved: removedAlready || flagged,
      screened: live.length,
      screenExcluded: titleExcl + absExcl,
      sought: afterAbstract.length,
      assessed: afterAbstract.length,
      fulltextExcluded: ftExcl,
      studies: studyIds.size + unlinked,
      reports: included.length
    };
  },

  value(key) {
    const ov = State.prisma.overrides;
    if (ov[key] !== undefined && ov[key] !== null && ov[key] !== '') return num(ov[key]);
    const d = this.derive();
    if (key in d) return d[key];
    return 0;
  },
  isOverridden(key) {
    const v = State.prisma.overrides[key];
    return v !== undefined && v !== null && v !== '';
  },

  setField(key, raw) {
    const derived = this.derive();
    const v = raw === '' ? null : num(raw);
    mutate('prisma', v === null
      ? `Cleared override for ${key}`
      : `Set ${key} to ${v}${key in derived ? ` (derived value was ${derived[key]})` : ''}`,
      () => { if (v === null) delete State.prisma.overrides[key]; else State.prisma.overrides[key] = v; });
    this.renderForm();
  },

  autoFill() {
    const d = this.derive();
    mutate('prisma', 'Recalculated all PRISMA figures from the record set, discarding manual overrides for derivable fields', () => {
      Object.keys(d).forEach(k => { delete State.prisma.overrides[k]; });
      // Reason counts follow the recorded full-text exclusions.
      const tally = {};
      State.records.filter(r => !r.isDuplicate && effectiveDecision(r, 'fulltext') === 'exclude')
        .forEach(r => { const k = (r.exclusionReason.fulltext || 'Reason not recorded').trim(); tally[k] = (tally[k] || 0) + 1; });
      State.reasons = Object.keys(tally).map(k => ({ id: uid('rsn'), reason: k, count: tally[k] }));
      if (!State.reasons.length) State.reasons = [{ id: uid('rsn'), reason: 'Reason not recorded', count: 0 }];
    });
    this.renderForm();
    toast('Recalculated from records', 'ok');
  },

  clearOverrides() {
    mutate('prisma', 'Cleared every manual override', () => { State.prisma.overrides = {}; });
    this.renderForm();
  },

  addSource() {
    mutate('prisma', 'Added an identification source', () => { State.sources.push({ id: uid('src'), name: '', count: 0 }); });
    this.renderForm();
  },
  addOtherSource() {
    mutate('prisma', 'Added an other-methods source', () => { State.otherSources.push({ id: uid('osrc'), name: '', count: 0 }); });
    this.renderForm();
  },
  addReason() {
    mutate('prisma', 'Added a full-text exclusion reason', () => { State.reasons.push({ id: uid('rsn'), reason: '', count: 0 }); });
    this.renderForm();
  },
  updateRow(list, id, field, value) {
    const arr = State[list]; const row = arr.find(r => r.id === id); if (!row) return;
    mutate('prisma', `${list}: ${field} set to "${value}"`, () => {
      row[field] = field === 'count' ? num(value) : value;
    });
    this.renderForm();
  },
  removeRow(list, id) {
    mutate('prisma', `Removed an entry from ${list}`, () => { State[list] = State[list].filter(r => r.id !== id); });
    this.renderForm();
  },
  toggleOtherArm(on) {
    mutate('prisma', `Other-methods arm ${on ? 'shown' : 'hidden'}`, () => { State.prisma.showOtherArm = !!on; });
    this.renderForm();
  },

  renderForm() {
    if (UI.activeTab !== 'tab-data') return;
    $('showOtherArm').checked = !!State.prisma.showOtherArm;
    $('otherArmCard').style.display = State.prisma.showOtherArm ? '' : 'none';

    const rowHTML = (list, r, nameField, placeholder) => `
      <div style="display:flex;gap:8px;margin-bottom:7px;align-items:center">
        <input type="text" value="${esc(r[nameField])}" placeholder="${placeholder}" style="flex:1;font-size:12.5px;padding:6px 9px"
          onchange="Prisma.updateRow('${list}','${r.id}','${nameField}',this.value)">
        <input type="number" min="0" value="${num(r.count)}" style="width:92px;font-size:12.5px;padding:6px 9px;text-align:right"
          onchange="Prisma.updateRow('${list}','${r.id}','count',this.value)">
        <button class="btn btn-ghost-ink btn-xs" onclick="Prisma.removeRow('${list}','${r.id}')">&times;</button></div>`;

    $('sourceRows').innerHTML = State.sources.length
      ? State.sources.map(r => rowHTML('sources', r, 'name', 'Database or register')).join('')
      : '<p class="muted" style="font-size:12.5px">Sources are added automatically when you import a file. You can also add them by hand.</p>';

    $('otherSourceRows').innerHTML = State.otherSources.length
      ? State.otherSources.map(r => rowHTML('otherSources', r, 'name', 'e.g. Citation searching, Organisation website')).join('')
      : '<p class="muted" style="font-size:12.5px">Add the sources searched outside the databases: citation chaining, websites, organisations, contact with authors.</p>';

    $('reasonRows').innerHTML = State.reasons.length
      ? State.reasons.map(r => rowHTML('reasons', r, 'reason', 'Reason for exclusion at full text')).join('')
      : '<p class="muted" style="font-size:12.5px">No reasons recorded. Recalculate from records, or add them here.</p>';

    els('[data-prisma]').forEach(input => {
      const key = input.dataset.prisma;
      input.value = this.value(key);
      input.style.borderColor = this.isOverridden(key) ? 'var(--gold)' : '';
      input.title = this.isOverridden(key) ? 'Manual override — clear the field to return to the derived value' : 'Derived from your records';
      if (!input._bound) {
        input._bound = true;
        input.addEventListener('change', e => this.setField(key, e.target.value));
      }
    });

    this.renderChecks();
  },

  /* Internal consistency checks — the arithmetic a reviewer will run. */
  /* How far screening has actually progressed. Figures downstream of an
     unfinished stage are expected to be low, so they are reported as
     progress rather than as arithmetic errors. */
  screeningProgress() {
    const live = State.records.filter(r => !r.isDuplicate);
    const done = (stage, pool) => pool.filter(r => ['include', 'exclude', 'maybe'].includes(effectiveDecision(r, stage))).length;
    const afterTitle = live.filter(r => advances(effectiveDecision(r, 'title')));
    const afterAbs = afterTitle.filter(r => advances(effectiveDecision(r, 'abstract')));
    return {
      title: { done: done('title', live), total: live.length },
      abstract: { done: done('abstract', afterTitle), total: afterTitle.length },
      fulltext: { done: done('fulltext', afterAbs), total: afterAbs.length }
    };
  },

  checks() {
    const v = (k) => this.value(k);
    const out = [];
    const p = this.screeningProgress();
    const incomplete = [];
    STAGES.forEach(s => { if (p[s].total && p[s].done < p[s].total) incomplete.push(`${STAGE_LABEL[s].toLowerCase()} ${p[s].done}/${p[s].total}`); });
    if (incomplete.length) {
      out.push(['info', `Screening is still in progress (${incomplete.join(', ')}). Figures downstream of an unfinished stage will stay low until it is complete, so the checks below are suspended for those fields.`]);
    }
    const removed = v('dupRemoved') + v('autoRemoved') + v('otherRemoved');
    const expectScreened = v('dbIdentified') - removed;
    if (v('screened') !== expectScreened) {
      out.push(['warn', `Records screened is ${v('screened').toLocaleString()}, but identification minus removals gives ${expectScreened.toLocaleString()}. PRISMA expects these to reconcile.`]);
    }
    const screeningDone = !incomplete.length;
    if (screeningDone) {
      const expectSought = v('screened') - v('screenExcluded');
      if (v('sought') !== expectSought) {
        out.push(['warn', `Reports sought for retrieval is ${v('sought').toLocaleString()}, but records screened minus records excluded gives ${expectSought.toLocaleString()}.`]);
      }
      const expectAssessed = v('sought') - v('notRetrieved');
      if (v('assessed') !== expectAssessed) {
        out.push(['warn', `Reports assessed is ${v('assessed').toLocaleString()}, but reports sought minus reports not retrieved gives ${expectAssessed.toLocaleString()}.`]);
      }
      const reasonTotal = State.reasons.reduce((a, r) => a + num(r.count), 0);
      if (reasonTotal !== v('fulltextExcluded')) {
        out.push(['warn', `Exclusion reasons sum to ${reasonTotal.toLocaleString()}, but reports excluded is ${v('fulltextExcluded').toLocaleString()}. Every full-text exclusion needs a stated reason.`]);
      }
      const expectIncludedReports = v('assessed') - v('fulltextExcluded') + (State.prisma.showOtherArm ? (v('oAssessed') - v('oExcluded')) : 0);
      if (v('reports') !== expectIncludedReports) {
        out.push(['warn', `Reports of included studies is ${v('reports').toLocaleString()}, but the eligibility arithmetic gives ${expectIncludedReports.toLocaleString()}.`]);
      }
    }
    if (v('studies') > v('reports')) {
      out.push(['warn', `There are more studies (${v('studies')}) than reports (${v('reports')}). A study is described by at least one report, so studies cannot exceed reports.`]);
    }
    if (!State.reviewers.length) out.push(['warn', 'No reviewers are registered, so no selection process can be described for checklist item 8.']);
    const unresolved = Agreement.conflictRecords().length;
    if (unresolved) out.push(['warn', `${unresolved.toLocaleString()} screening conflicts are unresolved. Records in conflict do not count towards any figure above until they are settled.`]);
    if (!out.filter(o => o[0] === 'warn').length) out.push(['ok', 'Every figure reconciles. The flow diagram will balance.']);
    return out;
  },

  renderChecks() {
    const checks = this.checks();
    $('prismaChecks').innerHTML = `<div class="card"><div class="card-header"><h2 class="card-title">Consistency checks</h2></div>
      <div class="card-body">${checks.map(([kind, msg]) =>
        `<div class="callout ${kind === 'warn' ? 'warn' : kind === 'info' ? 'gold' : ''}" style="margin-bottom:8px">${esc(msg)}</div>`).join('')}</div></div>`;
  }
};

/* ── flow diagram ──────────────────────────────────────────── */
const Diagram = {
  wrap(text, maxChars) {
    // Keep "(n = 123)" together as one token so a count never splits across lines.
    const glued = String(text).replace(/\(n = (\d[\d,]*)\)/g, (m) => m.replace(/ /g, ''));
    const words = glued.split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return (lines.length ? lines : ['']).map(l => l.replace(//g, ' '));
  },

  /* A box is measured before it is drawn so rows can be aligned. */
  /* Typographic scale. 1 suits the screen; 1.4 gives type that stays legible
     when a two-arm diagram is reduced to the width of a journal page. */
  typeScale: 1,

  measure(box, w) {
    const T = this.typeScale;
    const PAD = 11 * T, TLH = 15 * T, BLH = 13.5 * T;
    const titleChars = Math.floor((w - 2 * PAD) / (5.6 * T));
    const bulletChars = Math.floor((w - 2 * PAD - 8) / (5.1 * T));
    box._title = this.wrap(box.title, titleChars);
    box._bullets = (box.bullets || []).map(b => this.wrap(b, bulletChars));
    const bulletLines = box._bullets.reduce((a, b) => a + b.length, 0);
    box.h = Math.max(46, PAD + box._title.length * TLH + (bulletLines ? 5 + bulletLines * BLH : 0) + PAD - 2);
    box.w = w;
    return box.h;
  },

  draw(box) {
    const T = this.typeScale;
    const PAD = 11 * T, TLH = 15 * T, BLH = 13.5 * T;
    const { x, y, w, h, fill, stroke } = box;
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
    let ty = y + PAD + 10 * T;
    box._title.forEach(line => {
      s += `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="${11.5 * T}" font-weight="600" fill="#0a0a14" font-family="Syne, DM Sans, sans-serif">${esc(line)}</text>`;
      ty += TLH;
    });
    if (box._bullets.length) {
      ty += 3 * T;
      const centred = !!box.centreBullets;
      box._bullets.forEach(lines => {
        lines.forEach((line, i) => {
          s += centred
            ? `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="${10.5 * T}" fill="rgba(10,10,20,0.72)" font-family="DM Sans, sans-serif">${esc(line)}</text>`
            : `<text x="${x + PAD}" y="${ty}" font-size="${10.5 * T}" fill="rgba(10,10,20,0.72)" font-family="DM Sans, sans-serif">${i === 0 ? '' : '   '}${esc(line)}</text>`;
          ty += BLH;
        });
      });
    }
    return s;
  },

  build(opts) {
    if (opts && opts.typeScale) this.typeScale = opts.typeScale;
    const v = (k) => Prisma.value(k);
    const dual = !!State.prisma.showOtherArm;
    const PHASE_W = Math.round(26 * Math.max(1, (this.typeScale + 1) / 2));
    const BW = 258, SW = 236, HGAP = 42, ARMGAP = 40, VGAP = 26, MARGIN = 14;
    const leftX = MARGIN + PHASE_W + 10;
    const leftSideX = leftX + BW + HGAP;
    const rightX = leftSideX + SW + ARMGAP;
    const rightSideX = rightX + BW + HGAP;
    const W = Math.ceil(dual ? rightSideX + SW + MARGIN : leftSideX + SW + MARGIN);

    const C = {
      idFill: '#faf7f0', idStroke: '#c8a96e',
      scFill: '#f2f8f8', scStroke: '#2a7f7f',
      exFill: '#fdf4f2', exStroke: '#d4604a',
      inFill: '#f3f8f4', inStroke: '#4a7a5a'
    };

    // ── build box definitions ──
    const srcBullets = State.sources.filter(s => s.name || s.count).map(s => `${s.name || 'Database'} (n = ${num(s.count)})`);
    const b_identified = { title: 'Records identified from:', bullets: srcBullets.length ? srcBullets : [`Databases and registers (n = ${v('dbIdentified')})`], fill: C.idFill, stroke: C.idStroke };
    const b_removed = {
      title: 'Records removed before screening:',
      bullets: [`Duplicate records removed (n = ${v('dupRemoved')})`,
                `Records marked ineligible by automation tools (n = ${v('autoRemoved')})`,
                `Records removed for other reasons (n = ${v('otherRemoved')})`],
      fill: C.exFill, stroke: C.exStroke
    };
    const b_screened = { title: `Records screened`, bullets: [`(n = ${v('screened')})`], centreBullets: true, fill: C.scFill, stroke: C.scStroke };
    const b_screenExcl = { title: `Records excluded`, bullets: [`(n = ${v('screenExcluded')})`], centreBullets: true, fill: C.exFill, stroke: C.exStroke };
    const b_sought = { title: `Reports sought for retrieval`, bullets: [`(n = ${v('sought')})`], centreBullets: true, fill: C.scFill, stroke: C.scStroke };
    const b_notRet = { title: `Reports not retrieved`, bullets: [`(n = ${v('notRetrieved')})`], centreBullets: true, fill: C.exFill, stroke: C.exStroke };
    const b_assessed = { title: `Reports assessed for eligibility`, bullets: [`(n = ${v('assessed')})`], centreBullets: true, fill: C.scFill, stroke: C.scStroke };
    const reasonBullets = State.reasons.filter(r => r.reason || r.count).map(r => `${r.reason || 'Reason'} (n = ${num(r.count)})`);
    const b_ftExcl = { title: `Reports excluded (n = ${v('fulltextExcluded')}):`, bullets: reasonBullets.length ? reasonBullets : ['Reasons not yet recorded'], fill: C.exFill, stroke: C.exStroke };
    const b_included = {
      title: 'Studies included in review',
      bullets: [`Studies (n = ${v('studies')})`, `Reports of included studies (n = ${v('reports')})`],
      fill: C.inFill, stroke: C.inStroke
    };

    const oBullets = State.otherSources.filter(s => s.name || s.count).map(s => `${s.name || 'Source'} (n = ${num(s.count)})`);
    const b_oIdent = { title: 'Records identified from:', bullets: oBullets.length ? oBullets : [`Other methods (n = ${v('otherIdentified')})`], fill: C.idFill, stroke: C.idStroke };
    const b_oSought = { title: 'Reports sought for retrieval', bullets: [`(n = ${v('oSought')})`], centreBullets: true, fill: C.scFill, stroke: C.scStroke };
    const b_oNotRet = { title: 'Reports not retrieved', bullets: [`(n = ${v('oNotRetrieved')})`], centreBullets: true, fill: C.exFill, stroke: C.exStroke };
    const b_oAssessed = { title: 'Reports assessed for eligibility', bullets: [`(n = ${v('oAssessed')})`], centreBullets: true, fill: C.scFill, stroke: C.scStroke };
    const b_oExcl = { title: `Reports excluded`, bullets: [`(n = ${v('oExcluded')})`], centreBullets: true, fill: C.exFill, stroke: C.exStroke };

    // ── measure and lay out rows ──
    const T = this.typeScale;
    const HEADER_H = Math.round(32 * Math.max(1, (T + 1) / 2));
    let y = MARGIN + HEADER_H + 12;
    const rows = [];
    const addRow = (boxes) => {
      let h = 0;
      boxes.forEach(({ box, x, w }) => { h = Math.max(h, this.measure(box, w)); });
      boxes.forEach(({ box, x }) => { box.x = x; box.y = y; });
      rows.push({ y, h, boxes });
      y += h + VGAP;
      return h;
    };

    addRow([{ box: b_identified, x: leftX, w: BW }, { box: b_removed, x: leftSideX, w: SW }]
      .concat(dual ? [{ box: b_oIdent, x: rightX, w: BW }] : []));
    const rowIdent = rows[0];
    addRow([{ box: b_screened, x: leftX, w: BW }, { box: b_screenExcl, x: leftSideX, w: SW }]);
    addRow([{ box: b_sought, x: leftX, w: BW }, { box: b_notRet, x: leftSideX, w: SW }]
      .concat(dual ? [{ box: b_oSought, x: rightX, w: BW }, { box: b_oNotRet, x: rightSideX, w: SW }] : []));
    addRow([{ box: b_assessed, x: leftX, w: BW }, { box: b_ftExcl, x: leftSideX, w: SW }]
      .concat(dual ? [{ box: b_oAssessed, x: rightX, w: BW }, { box: b_oExcl, x: rightSideX, w: SW }] : []));
    y += 6;
    const incW = dual ? (rightX + BW - leftX) : BW;
    this.measure(b_included, incW);
    b_included.x = leftX; b_included.y = y;
    const H = Math.ceil(y + b_included.h + MARGIN + 8);

    // ── arrows ──
    const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0a0a14" stroke-width="1.4" marker-end="url(#arrowhead)"/>`;

    let arrows = '';
    const vGapArrow = (from, to) => arrow(from.x + from.w / 2, from.y + from.h, to.x + to.w / 2, to.y - 4);
    const hArrow = (from, to) => arrow(from.x + from.w, from.y + Math.min(from.h, to.h) / 2, to.x - 4, from.y + Math.min(from.h, to.h) / 2);

    arrows += hArrow(b_identified, b_removed);
    arrows += vGapArrow(b_identified, b_screened);
    arrows += hArrow(b_screened, b_screenExcl);
    arrows += vGapArrow(b_screened, b_sought);
    arrows += hArrow(b_sought, b_notRet);
    arrows += vGapArrow(b_sought, b_assessed);
    arrows += hArrow(b_assessed, b_ftExcl);
    arrows += arrow(b_assessed.x + b_assessed.w / 2, b_assessed.y + b_assessed.h, b_assessed.x + b_assessed.w / 2, b_included.y - 4);
    if (dual) {
      arrows += vGapArrow(b_oIdent, b_oSought);
      arrows += hArrow(b_oSought, b_oNotRet);
      arrows += vGapArrow(b_oSought, b_oAssessed);
      arrows += hArrow(b_oAssessed, b_oExcl);
      // The included box spans both arms, so the other-methods arm enters it from above.
      arrows += arrow(b_oAssessed.x + b_oAssessed.w / 2, b_oAssessed.y + b_oAssessed.h,
        b_oAssessed.x + b_oAssessed.w / 2, b_included.y - 4);
    }

    // ── phase bars ──
    const phaseBar = (y1, y2, label, colour) => {
      const h = y2 - y1, midY = y1 + h / 2;
      return `<rect x="${MARGIN}" y="${y1}" width="${PHASE_W}" height="${h}" rx="5" fill="${colour}"/>
        <text x="${MARGIN + PHASE_W / 2}" y="${midY + 3.5}" text-anchor="middle" font-size="${10 * T}" font-weight="700" fill="#fff"
        font-family="Syne, DM Sans, sans-serif" transform="rotate(-90 ${MARGIN + PHASE_W / 2} ${midY})" letter-spacing="0.5">${esc(label)}</text>`;
    };
    let phases = '';
    phases += phaseBar(rowIdent.y, rowIdent.y + rowIdent.h, 'IDENTIFICATION', '#c8a96e');
    phases += phaseBar(rows[1].y, rows[3].y + rows[3].h, 'SCREENING', '#2a7f7f');
    phases += phaseBar(b_included.y, b_included.y + b_included.h, 'INCLUDED', '#4a7a5a');

    // ── arm headers ──
    let headers = `<rect x="${leftX}" y="${MARGIN}" width="${leftSideX + SW - leftX}" height="${HEADER_H}" rx="6" fill="#c8a96e26" stroke="#c8a96e" stroke-width="1.2"/>
      <text x="${(leftX + leftSideX + SW) / 2}" y="${MARGIN + HEADER_H / 2 + 4.5 * T}" text-anchor="middle" font-size="${12 * T}" font-weight="700" fill="#7a5f2e" font-family="Syne, DM Sans, sans-serif">Identification of studies via databases and registers</text>`;
    if (dual) {
      headers += `<rect x="${rightX}" y="${MARGIN}" width="${rightSideX + SW - rightX}" height="${HEADER_H}" rx="6" fill="#5a3e8a22" stroke="#5a3e8a" stroke-width="1.2"/>
        <text x="${(rightX + rightSideX + SW) / 2}" y="${MARGIN + HEADER_H / 2 + 4.5 * T}" text-anchor="middle" font-size="${12 * T}" font-weight="700" fill="#4a3070" font-family="Syne, DM Sans, sans-serif">Identification of studies via other methods</text>`;
    }

    const allBoxes = [b_identified, b_removed, b_screened, b_screenExcl, b_sought, b_notRet, b_assessed, b_ftExcl, b_included]
      .concat(dual ? [b_oIdent, b_oSought, b_oNotRet, b_oAssessed, b_oExcl] : []);

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DM Sans, Helvetica, Arial, sans-serif">
<defs><marker id="arrowhead" markerWidth="9" markerHeight="7" refX="8.5" refY="3.5" orient="auto"><polygon points="0 0, 9 3.5, 0 7" fill="#0a0a14"/></marker></defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${headers}
${phases}
${arrows}
${allBoxes.map(b => this.draw(b)).join('\n')}
</svg>`;
  },

  uiScale() { const sel = $('diagramType'); return sel ? parseFloat(sel.value) || 1 : 1; },
  render() {
    const host = $('diagramWrap');
    if (!host) return;
    host.innerHTML = this.build({ typeScale: this.uiScale() });
  },

  exportSVG() {
    downloadBlob(this.build({ typeScale: this.uiScale() }), 'image/svg+xml;charset=utf-8', Project.slug() + '_prisma_flow.svg');
    toast('SVG exported', 'ok');
  },

  exportPNG(scale) {
    const svgStr = this.build({ typeScale: this.uiScale() });
    const m = svgStr.match(/width="(\d+)" height="(\d+)"/);
    const w = m ? +m[1] : 900, h = m ? +m[2] : 1200;
    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => { downloadBlob(b, 'image/png', Project.slug() + '_prisma_flow.png'); toast('PNG exported', 'ok'); });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not rasterise the diagram; export the SVG instead', 'err'); };
    img.src = url;
  }
};
</script>
