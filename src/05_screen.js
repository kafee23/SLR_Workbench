<script>
'use strict';
/* ════════════════════════════════════════════════════════════════
   RECORDS TABLE · REVIEWERS · SCREENING · AGREEMENT
   ════════════════════════════════════════════════════════════════ */

const Records = {
  vt: null,
  init() {
    this.vt = new VirtualTable({
      scrollEl: $('recScroll'), bodyEl: $('recBody'), rowHeight: 58, cols: 6,
      emptyHTML: '<tr><td colspan="6"><div class="empty"><div class="empty-title">No records match</div><div>Adjust the filters above.</div></div></td></tr>',
      renderRow: (r) => {
        const status = r.isDuplicate
          ? `<span class="badge b-dup">duplicate${r.dupScore ? ' ' + r.dupScore + '%' : ''}</span>`
          : (r.dupGroup ? '<span class="badge b-teal">kept</span>' : '<span class="badge b-pending">unique</span>');
        return `<tr class="${r.isDuplicate ? 'is-dup' : ''}" style="height:58px">
          <td><input type="checkbox" data-rec="${r.id}" ${r.isDuplicate ? 'checked' : ''} onchange="Records.toggleFlag('${r.id}',this.checked)"></td>
          <td><div class="t-title" style="max-height:34px;overflow:hidden">${esc(r.title) || '<em class="muted">untitled</em>'}</div>
              <div class="t-meta">${esc(r.doi || 'no DOI')}${r.dupGroup ? ' · group ' + r.dupGroup : ''}</div></td>
          <td style="font-size:11.5px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.authors)}</td>
          <td class="num">${esc(r.year)}</td>
          <td style="font-size:11.5px">${esc(r.dbSource)}</td>
          <td>${status}</td></tr>`;
      }
    });
    ['recSearch', 'recFilter', 'recSourceFilter'].forEach(id => {
      $(id).addEventListener('input', () => this.render());
      $(id).addEventListener('change', () => this.render());
    });
  },
  filtered() {
    const q = ($('recSearch').value || '').toLowerCase().trim();
    const f = $('recFilter').value;
    const src = $('recSourceFilter').value;
    return State.records.filter(r => {
      if (f === 'dup' && !r.isDuplicate) return false;
      if (f === 'unique' && r.isDuplicate) return false;
      if (src !== 'all' && r.dbSource !== src) return false;
      if (q && !((r.title || '').toLowerCase().includes(q) || (r.authors || '').toLowerCase().includes(q) || (r.doi || '').includes(q))) return false;
      return true;
    });
  },
  render() {
    if (!State.records.length) { $('recordTableCard').style.display = 'none'; this.renderStats(); return; }
    $('recordTableCard').style.display = '';
    const sel = $('recSourceFilter'), keep = sel.value;
    const names = Array.from(new Set(State.records.map(r => r.dbSource).filter(Boolean))).sort();
    sel.innerHTML = '<option value="all">All sources</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    sel.value = names.includes(keep) ? keep : 'all';
    const rows = this.filtered();
    this.vt.setRows(rows);
    $('recFooter').textContent = `${rows.length.toLocaleString()} shown of ${State.records.length.toLocaleString()} records · ${State.records.filter(r => r.isDuplicate).length.toLocaleString()} flagged as duplicates`;
    this.renderStats();
  },
  renderStats() {
    const total = State.records.length;
    const dup = State.records.filter(r => r.isDuplicate).length;
    const unique = total - dup;
    const withDoi = State.records.filter(r => r.doi).length;
    $('importStats').innerHTML = [
      ['Records imported', total, '', 'accent-gold'],
      ['Flagged duplicates', dup, total ? pct(dup, total) + '% of imports' : '', 'accent-coral'],
      ['Unique records', unique, 'carried into screening', 'accent-teal'],
      ['With a DOI', withDoi, total ? pct(withDoi, total) + '% of imports' : '', 'accent-sage']
    ].map(([label, value, sub, cls]) =>
      `<div class="stat ${cls}"><div class="stat-label">${label}</div><div class="stat-value">${value.toLocaleString()}</div><div class="stat-sub">${sub}</div></div>`).join('');
  },
  toggleFlag(id, checked) {
    const r = State.records.find(x => x.id === id);
    if (!r) return;
    mutate('dedup', `${checked ? 'Flagged' : 'Unflagged'} as duplicate: ${(r.title || '').slice(0, 80)}`, () => { r.isDuplicate = checked; });
    this.render(); UI.refreshCounts();
  },
  async removeFlaggedDuplicates() {
    const flagged = State.records.filter(r => r.isDuplicate);
    if (!flagged.length) { toast('Nothing is flagged', 'err'); return; }
    const ok = await UI.confirm('Remove flagged duplicates?',
      `This deletes <strong>${flagged.length.toLocaleString()}</strong> records flagged as duplicates. The count is written to the PRISMA data as <em>duplicate records removed</em>, and the action is recorded in the audit log. This cannot be undone from inside the tool, so make sure you have saved a .slrproj file first.`,
      'Remove ' + flagged.length.toLocaleString());
    if (!ok) return;
    mutate('dedup', `Removed ${flagged.length} records flagged as duplicates`, () => {
      State.prisma.overrides.dupRemoved = num(State.prisma.overrides.dupRemoved) + flagged.length;
      State.records = State.records.filter(r => !r.isDuplicate);
    });
    this.render(); UI.refreshCounts();
    toast(`${flagged.length.toLocaleString()} duplicates removed`, 'ok');
  }
};

/* ── reviewers ─────────────────────────────────────────────── */
const Reviewers = {
  active() { return State.reviewers.find(r => r.id === State.activeReviewerId) || null; },
  byId(id) { return State.reviewers.find(r => r.id === id) || null; },
  add() {
    const n = State.reviewers.length;
    const rev = {
      id: uid('rev'),
      name: 'Reviewer ' + String.fromCharCode(65 + n),
      initials: 'R' + (n + 1),
      colour: REVIEWER_COLOURS[n % REVIEWER_COLOURS.length]
    };
    mutate('project', `Added reviewer ${rev.name}`, () => {
      State.reviewers.push(rev);
      if (!State.activeReviewerId) State.activeReviewerId = rev.id;
    });
    this.render(); UI.refreshCounts();
  },
  update(id, field, value) {
    const rev = this.byId(id); if (!rev) return;
    const old = rev[field];
    if (old === value) return;
    mutate('project', `Reviewer ${old} renamed to ${value}`, () => { rev[field] = value; });
    this.render();
  },
  async remove(id) {
    const rev = this.byId(id); if (!rev) return;
    const n = State.records.reduce((acc, r) =>
      acc + STAGES.reduce((a, s) => a + (r.decisions[s][id] ? 1 : 0), 0), 0);
    const ok = await UI.confirm('Remove this reviewer?',
      n ? `${esc(rev.name)} has recorded <strong>${n}</strong> decisions. Removing the reviewer deletes those decisions, which will change every agreement statistic. Consider keeping the reviewer instead.`
        : `Remove ${esc(rev.name)} from the register?`, 'Remove');
    if (!ok) return;
    mutate('project', `Removed reviewer ${rev.name} and ${n} associated decisions`, () => {
      State.reviewers = State.reviewers.filter(r => r.id !== id);
      State.records.forEach(r => STAGES.forEach(s => { delete r.decisions[s][id]; }));
      if (State.activeReviewerId === id) State.activeReviewerId = State.reviewers[0] ? State.reviewers[0].id : null;
    });
    this.render(); Screen.render(); Agreement.render(); UI.refreshCounts();
  },
  setActive(id) {
    mutate(null, null, () => { State.activeReviewerId = id || null; });
    this.render(); Screen.render();
  },
  setBlinded(on) {
    mutate('project', `Blinded screening ${on ? 'enabled' : 'disabled'}`, () => { State.blinded = !!on; });
    Screen.render();
  },
  render() {
    const host = $('reviewerList');
    if (!State.reviewers.length) {
      host.innerHTML = `<div class="empty" style="padding:24px 12px"><div class="empty-title">No reviewers yet</div>
        <div style="font-size:12.5px">A systematic review needs at least two independent screeners. Add them here so decisions can be attributed and agreement measured.</div></div>`;
    } else {
      host.innerHTML = State.reviewers.map(r => `
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          <span class="rev-dot" style="background:${esc(r.colour)};width:12px;height:12px"></span>
          <input type="text" value="${esc(r.name)}" style="flex:1" onchange="Reviewers.update('${r.id}','name',this.value)">
          <input type="text" value="${esc(r.initials)}" maxlength="4" style="width:64px;text-align:center" class="mono" onchange="Reviewers.update('${r.id}','initials',this.value)">
          <button class="btn btn-ghost-ink btn-xs" onclick="Reviewers.remove('${r.id}')">Remove</button>
        </div>`).join('');
    }
    const sel = $('activeReviewer');
    sel.innerHTML = State.reviewers.length
      ? State.reviewers.map(r => `<option value="${r.id}"${r.id === State.activeReviewerId ? ' selected' : ''}>${esc(r.name)}</option>`).join('')
      : '<option value="">No reviewers registered</option>';
    $('blindedMode').checked = !!State.blinded;
  }
};

/* ── decision helpers ──────────────────────────────────────── */
function requiredReviewers() {
  return Math.min(2, Math.max(1, State.reviewers.length));
}
function effectiveDecision(rec, stage) {
  if (rec.resolved[stage]) return rec.resolved[stage];
  const ds = Object.values(rec.decisions[stage] || {});
  if (!ds.length) return 'pending';
  const uniq = new Set(ds);
  if (uniq.size > 1) return 'conflict';
  return ds.length >= requiredReviewers() ? ds[0] : 'partial';
}
function advances(decision) { return decision === 'include' || decision === 'maybe'; }

const DECISION_LABEL = { include: 'Include', exclude: 'Exclude', maybe: 'Maybe', pending: 'Pending', conflict: 'Conflict', partial: 'Awaiting 2nd' };
const DECISION_CLASS = { include: 'b-include', exclude: 'b-exclude', maybe: 'b-maybe', pending: 'b-pending', conflict: 'b-conflict', partial: 'b-pending' };

/* ── screening ─────────────────────────────────────────────── */
const Screen = {
  vt: null,
  stage: 'title',
  init() {
    this.vt = new VirtualTable({
      scrollEl: $('screenScroll'), bodyEl: $('screenBody'), rowHeight: 104, cols: 4,
      emptyHTML: '<tr><td colspan="4"><div class="empty"><div class="empty-title">Nothing to show</div><div>Change the filter, or move to another stage.</div></div></td></tr>',
      renderRow: (r) => this.row(r)
    });
    $('screenSearch').addEventListener('input', debounce(() => this.render(), 180));
  },
  setStage(s) { this.stage = s; this.render(); },
  eligible(stage) {
    const live = State.records.filter(r => !r.isDuplicate);
    if (stage === 'title') return live;
    if (stage === 'abstract') return live.filter(r => advances(effectiveDecision(r, 'title')));
    return live.filter(r => advances(effectiveDecision(r, 'title')) && advances(effectiveDecision(r, 'abstract')));
  },
  visible() {
    const stage = this.stage;
    const me = State.activeReviewerId;
    const show = $('screenShow').value;
    const q = ($('screenSearch').value || '').toLowerCase().trim();
    return this.eligible(stage).filter(r => {
      const mine = me ? r.decisions[stage][me] : null;
      const eff = effectiveDecision(r, stage);
      if (show === 'todo' && mine) return false;
      if (show === 'mine' && !mine) return false;
      if (show === 'conflict' && eff !== 'conflict') return false;
      if (show === 'include' && eff !== 'include') return false;
      if (show === 'exclude' && eff !== 'exclude') return false;
      if (q && !((r.title || '').toLowerCase().includes(q) || (r.abstract || '').toLowerCase().includes(q) || (r.keywords || '').toLowerCase().includes(q))) return false;
      return true;
    });
  },
  row(r) {
    const stage = this.stage, me = State.activeReviewerId;
    const mine = me ? r.decisions[stage][me] : null;
    const others = State.reviewers.filter(v => v.id !== me).map(v => ({ rev: v, d: r.decisions[stage][v.id] })).filter(x => x.d);
    const hide = State.blinded && !mine;
    const otherHTML = hide
      ? `<span class="badge b-pending" title="Blinded until you record your own decision">hidden</span>`
      : (others.length
        ? others.map(o => `<span class="rev-chip" title="${esc(o.rev.name)}"><span class="rev-dot" style="background:${esc(o.rev.colour)}"></span>${esc(o.rev.initials)} ${DECISION_LABEL[o.d]}</span>`).join(' ')
        : '<span class="muted" style="font-size:11.5px">none yet</span>');
    const eff = effectiveDecision(r, stage);
    const btn = (val, label, cls) =>
      `<button class="btn btn-xs ${mine === val ? cls : 'btn-ghost-ink'}" onclick="Screen.decide('${r.id}','${val}')">${label}</button>`;
    const reasonCell = mine === 'exclude'
      ? `<input type="text" list="reasonOptions" value="${esc(r.exclusionReason[stage] || '')}" placeholder="Reason" style="font-size:11.5px;padding:5px 8px" onchange="Screen.setReason('${r.id}',this.value)">`
      : '<span class="muted" style="font-size:11px">&mdash;</span>';
    return `<tr style="height:104px">
      <td><div class="t-title" style="max-height:38px;overflow:hidden">${esc(r.title) || '<em class="muted">untitled</em>'}</div>
        <div class="t-meta">${esc(r.authors ? r.authors.split(';')[0] : '')}${r.year ? ' · ' + esc(r.year) : ''}${r.journal ? ' · ' + esc(r.journal.slice(0, 44)) : ''}</div>
        <div style="font-size:11px;color:rgba(10,10,20,.45);margin-top:3px;max-height:28px;overflow:hidden;line-height:1.4">${esc((r.abstract || '').slice(0, 190))}</div></td>
      <td>${otherHTML}<div style="margin-top:5px"><span class="badge ${DECISION_CLASS[eff]}">${DECISION_LABEL[eff]}</span></div></td>
      <td><div class="btn-row" style="gap:4px">${btn('include', 'Include', 'btn-sage')}${btn('maybe', 'Maybe', 'btn-gold')}${btn('exclude', 'Exclude', 'btn-coral')}</div>
        ${mine ? `<button class="btn btn-xs btn-ghost-ink" style="margin-top:5px" onclick="Screen.decide('${r.id}','')">Clear</button>` : ''}</td>
      <td>${reasonCell}</td></tr>`;
  },
  decide(id, value) {
    const me = State.activeReviewerId;
    if (!me) { toast('Choose which reviewer you are on the Project tab first', 'err'); return; }
    const r = State.records.find(x => x.id === id); if (!r) return;
    const stage = this.stage;
    mutate('screen', `${STAGE_LABEL[stage]}: ${value ? DECISION_LABEL[value] : 'cleared'} — ${(r.title || '').slice(0, 70)}`, () => {
      if (value) r.decisions[stage][me] = value; else delete r.decisions[stage][me];
      if (value !== 'exclude') r.exclusionReason[stage] = '';
      // A new decision invalidates any earlier resolution of a conflict.
      if (r.resolved[stage] && effectiveDecision(r, stage) === 'conflict') r.resolved[stage] = null;
    });
    this.render(); UI.refreshCounts();
  },
  setReason(id, value) {
    const r = State.records.find(x => x.id === id); if (!r) return;
    mutate('screen', `Exclusion reason set to "${value}" — ${(r.title || '').slice(0, 60)}`, () => {
      r.exclusionReason[this.stage] = value;
      if (value && !State.reasons.some(x => x.reason.toLowerCase() === value.toLowerCase())) {
        State.reasons.push({ id: uid('rsn'), reason: value, count: 0 });
      }
    });
  },
  render() {
    if (UI.activeTab !== 'tab-screen') { UI.refreshCounts(); return; }
    const stage = this.stage;
    $('screenStage').value = stage;
    const me = Reviewers.active();
    $('screenAsChip').innerHTML = me
      ? `<span class="rev-dot" style="background:${esc(me.colour)}"></span>${esc(me.name)}`
      : '<span style="color:var(--coral)">No reviewer selected</span>';
    const gate = $('screenGate');
    if (!State.reviewers.length) {
      gate.style.display = ''; gate.innerHTML = 'Add at least one reviewer on the Project tab before screening. For a systematic review, two independent screeners are the expected standard.';
    } else if (State.reviewers.length === 1) {
      gate.style.display = ''; gate.innerHTML = 'Only one reviewer is registered, so no agreement statistic can be computed. Add a second reviewer if your protocol specifies dual screening.';
    } else { gate.style.display = 'none'; }

    $('reasonOptions') || document.body.insertAdjacentHTML('beforeend', '<datalist id="reasonOptions"></datalist>');
    $('reasonOptions').innerHTML = State.reasons.map(r => `<option value="${esc(r.reason)}">`).join('');

    const rows = this.visible();
    const elig = this.eligible(stage);
    const show = $('screenShow').value;
    const conflicts = elig.filter(r => effectiveDecision(r, stage) === 'conflict').length;
    // An empty list means different things at different points in the workflow;
    // say which one it is rather than showing the same shrug every time.
    if (!rows.length) {
      let msg;
      if (!elig.length && stage !== 'title') {
        msg = `<div class="empty-title">Nothing has reached this stage yet</div>
          <div>Records arrive here once they are included at the previous stage.</div>`;
      } else if (show === 'todo' && elig.length) {
        msg = `<div class="empty-title">You have decided every record at this stage</div>
          <div style="margin-bottom:12px">${conflicts ? `${conflicts} record${conflicts === 1 ? '' : 's'} disagree with your co-reviewer and need resolving.` : 'Nothing is waiting on you.'}</div>
          <div class="btn-row" style="justify-content:center">
            ${conflicts ? `<button class="btn btn-violet btn-sm" onclick="UI.switchTab('tab-agree')">Resolve ${conflicts} conflict${conflicts === 1 ? '' : 's'}</button>` : ''}
            <button class="btn btn-ghost-ink btn-sm" onclick="document.getElementById('screenShow').value='all';Screen.render()">Show all records</button>
          </div>`;
      } else {
        msg = `<div class="empty-title">No records match this filter</div><div>Change the filter, or move to another stage.</div>`;
      }
      this.vt.setEmpty(`<tr><td colspan="4"><div class="empty">${msg}</div></td></tr>`);
    }
    this.vt.setRows(rows);
    $('screenTableTitle').textContent = STAGE_LABEL[stage];

    const decidedByMe = me ? elig.filter(r => r.decisions[stage][me.id]).length : 0;
    const counts = { include: 0, exclude: 0, maybe: 0, conflict: 0, pending: 0, partial: 0 };
    elig.forEach(r => { counts[effectiveDecision(r, stage)]++; });
    $('screenStats').innerHTML = [
      ['Eligible at this stage', elig.length, '', 'accent-gold'],
      ['Decided by you', decidedByMe, elig.length ? pct(decidedByMe, elig.length) + '% complete' : '', 'accent-teal'],
      ['Resolved include', counts.include, '', 'accent-sage'],
      ['In conflict', counts.conflict, counts.conflict ? 'needs resolution' : 'none outstanding', 'accent-violet']
    ].map(([l, v, s, c]) => `<div class="stat ${c}"><div class="stat-label">${l}</div><div class="stat-value">${v.toLocaleString()}</div><div class="stat-sub">${s}</div></div>`).join('');
    $('screenProgressText').textContent = `${decidedByMe}/${elig.length} decided`;
    $('screenFooter').textContent = `${rows.length.toLocaleString()} shown · include ${counts.include} · exclude ${counts.exclude} · maybe ${counts.maybe} · conflict ${counts.conflict} · awaiting ${counts.pending + counts.partial}`;
    UI.refreshCounts();
  },
  exportDecisions() {
    const header = ['Record ID', 'Title', 'Authors', 'Year', 'DOI', 'Source'];
    STAGES.forEach(s => {
      State.reviewers.forEach(v => header.push(`${STAGE_LABEL[s]} — ${v.name}`));
      header.push(`${STAGE_LABEL[s]} — outcome`, `${STAGE_LABEL[s]} — reason`);
    });
    const rows = [header];
    State.records.filter(r => !r.isDuplicate).forEach(r => {
      const row = [r.id, r.title, r.authors, r.year, r.doi, r.dbSource];
      STAGES.forEach(s => {
        State.reviewers.forEach(v => row.push(r.decisions[s][v.id] || ''));
        row.push(effectiveDecision(r, s), r.exclusionReason[s] || '');
      });
      rows.push(row);
    });
    downloadBlob(toCSV(rows), 'text/csv;charset=utf-8', Project.slug() + '_screening_decisions.csv');
    toast('Decisions exported', 'ok');
  }
};

/* ── agreement ─────────────────────────────────────────────── */
const Agreement = {
  collapse() { const s = $('agreeCollapse'); return s ? s.value : 'include'; },
  code(d, mode) {
    if (!d) return null;
    if (d === 'maybe') return mode === 'separate' ? 'maybe' : mode;
    return d;
  },
  conflictRecords() {
    const out = [];
    State.records.filter(r => !r.isDuplicate).forEach(r => {
      STAGES.forEach(s => { if (effectiveDecision(r, s) === 'conflict') out.push({ rec: r, stage: s }); });
    });
    return out;
  },

  /* Cohen's kappa over the records both reviewers actually decided. */
  cohen(stage, aId, bId, mode) {
    const cats = mode === 'separate' ? ['include', 'maybe', 'exclude'] : ['include', 'exclude'];
    const idx = {}; cats.forEach((c, i) => { idx[c] = i; });
    const k = cats.length;
    const m = Array.from({ length: k }, () => new Array(k).fill(0));
    let n = 0;
    Screen.eligible(stage).forEach(r => {
      const a = this.code(r.decisions[stage][aId], mode);
      const b = this.code(r.decisions[stage][bId], mode);
      if (!a || !b) return;
      m[idx[a]][idx[b]]++; n++;
    });
    if (n === 0) return { n: 0, cats, matrix: m };
    let agree = 0, pe = 0;
    for (let i = 0; i < k; i++) agree += m[i][i];
    const rowSum = m.map(r => r.reduce((x, y) => x + y, 0));
    const colSum = cats.map((_, j) => m.reduce((x, r) => x + r[j], 0));
    for (let i = 0; i < k; i++) pe += (rowSum[i] / n) * (colSum[i] / n);
    const po = agree / n;
    const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
    const se = pe === 1 ? 0 : Math.sqrt((po * (1 - po)) / (n * Math.pow(1 - pe, 2)));
    return { n, cats, matrix: m, rowSum, colSum, po, pe, kappa, se, lo: kappa - 1.96 * se, hi: kappa + 1.96 * se };
  },

  /* Fleiss' kappa for three or more reviewers, over records rated by all of them. */
  fleiss(stage, ids, mode) {
    const cats = mode === 'separate' ? ['include', 'maybe', 'exclude'] : ['include', 'exclude'];
    const rmax = ids.length;
    const table = [];
    Screen.eligible(stage).forEach(r => {
      const codes = ids.map(id => this.code(r.decisions[stage][id], mode));
      if (codes.some(c => !c)) return;
      const counts = cats.map(c => codes.filter(x => x === c).length);
      table.push(counts);
    });
    const N = table.length;
    if (N === 0 || rmax < 2) return { n: 0, raters: rmax };
    const pj = cats.map((_, j) => table.reduce((a, row) => a + row[j], 0) / (N * rmax));
    const Pi = table.map(row => (row.reduce((a, x) => a + x * x, 0) - rmax) / (rmax * (rmax - 1)));
    const Pbar = Pi.reduce((a, x) => a + x, 0) / N;
    const Pe = pj.reduce((a, p) => a + p * p, 0);
    const kappa = Pe === 1 ? 1 : (Pbar - Pe) / (1 - Pe);
    return { n: N, raters: rmax, cats, pj, Pbar, Pe, kappa };
  },

  interpret(k) {
    if (!isFinite(k)) return ['—', 'b-pending'];
    if (k < 0) return ['poor (worse than chance)', 'b-exclude'];
    if (k <= 0.20) return ['slight', 'b-exclude'];
    if (k <= 0.40) return ['fair', 'b-maybe'];
    if (k <= 0.60) return ['moderate', 'b-maybe'];
    if (k <= 0.80) return ['substantial', 'b-include'];
    return ['almost perfect', 'b-include'];
  },

  render() {
    if (UI.activeTab !== 'tab-agree') { UI.refreshCounts(); return; }
    const stage = $('agreeStage').value;
    const conflicts = this.conflictRecords();
    const stageConf = conflicts.filter(c => c.stage === stage);

    const elig = Screen.eligible(stage);
    const fully = elig.filter(r => Object.keys(r.decisions[stage]).length >= requiredReviewers()).length;
    $('agreeCards').innerHTML = [
      ['Eligible at this stage', elig.length, '', 'accent-gold'],
      ['Double-screened', fully, elig.length ? pct(fully, elig.length) + '% of eligible' : '', 'accent-teal'],
      ['Conflicts outstanding', stageConf.length, 'at ' + STAGE_LABEL[stage].toLowerCase(), 'accent-violet']
    ].map(([l, v, s, c]) => `<div class="stat ${c}"><div class="stat-label">${l}</div><div class="stat-value">${v.toLocaleString()}</div><div class="stat-sub">${s}</div></div>`).join('');

    const host = $('agreeDetail');
    if (State.reviewers.length < 2) {
      host.innerHTML = '<div class="empty"><div class="empty-title">Two reviewers required</div><div>Register a second reviewer on the Project tab to compute agreement.</div></div>';
    } else {
      const mode = this.collapse();
      const pairs = [];
      for (let i = 0; i < State.reviewers.length; i++)
        for (let j = i + 1; j < State.reviewers.length; j++)
          pairs.push([State.reviewers[i], State.reviewers[j]]);
      let html = `<div class="inline-fields" style="margin-bottom:16px">
        <div style="flex:0 0 260px"><label class="fl" for="agreeCollapse">Treat a "maybe" decision as</label>
        <select id="agreeCollapse" onchange="Agreement.render()">
          <option value="include"${mode === 'include' ? ' selected' : ''}>Include (advances to next stage)</option>
          <option value="exclude"${mode === 'exclude' ? ' selected' : ''}>Exclude</option>
          <option value="separate"${mode === 'separate' ? ' selected' : ''}>Its own category (three-category kappa)</option>
        </select></div>
        <div class="callout" style="flex:1">Kappa is computed only over records that both reviewers have decided. Records awaiting a second decision are excluded rather than counted as agreement.</div></div>`;

      pairs.forEach(([a, b]) => {
        const res = this.cohen(stage, a.id, b.id, mode);
        if (!res.n) {
          html += `<div class="card" style="margin-bottom:12px"><div class="card-body">
            <strong>${esc(a.name)}</strong> vs <strong>${esc(b.name)}</strong> &mdash;
            <span class="muted">no records have been decided by both reviewers at this stage yet.</span></div></div>`;
          return;
        }
        const [word, cls] = this.interpret(res.kappa);
        const cells = res.cats.map((rc, i) =>
          `<tr><th style="text-align:left;background:var(--paper2)">${DECISION_LABEL[rc] || rc}</th>` +
          res.cats.map((_, j) => `<td class="num"${i === j ? ' style="background:rgba(74,122,90,.1);font-weight:700"' : ''}>${res.matrix[i][j]}</td>`).join('') +
          `<td class="num muted">${res.rowSum[i]}</td></tr>`).join('');
        html += `<div class="card" style="margin-bottom:12px"><div class="card-body">
          <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
            <div style="flex:1 1 230px">
              <div style="font-family:var(--font-display);font-weight:700;font-size:14px;margin-bottom:9px">${esc(a.name)} vs ${esc(b.name)}</div>
              <div style="font-family:var(--font-display);font-size:34px;font-weight:700;letter-spacing:-1.5px;color:var(--teal);line-height:1">&kappa; = ${res.kappa.toFixed(3)}</div>
              <div style="margin-top:6px"><span class="badge ${cls}">${word}</span></div>
              <div class="mono" style="font-size:11.5px;color:rgba(10,10,20,.55);margin-top:10px;line-height:1.7">
                95% CI ${res.lo.toFixed(3)} to ${res.hi.toFixed(3)}<br>
                Observed agreement ${(res.po * 100).toFixed(1)}%<br>
                Expected by chance ${(res.pe * 100).toFixed(1)}%<br>
                n = ${res.n} doubly screened</div>
            </div>
            <div style="flex:1 1 280px">
              <div class="stat-label" style="margin-bottom:6px">Contingency table &mdash; rows ${esc(a.initials)}, columns ${esc(b.initials)}</div>
              <table style="font-size:12px"><thead><tr><th></th>${res.cats.map(c => `<th class="num">${DECISION_LABEL[c] || c}</th>`).join('')}<th class="num">Total</th></tr></thead>
              <tbody>${cells}<tr style="background:var(--paper2)"><th style="text-align:left">Total</th>${res.colSum.map(c => `<td class="num">${c}</td>`).join('')}<td class="num"><strong>${res.n}</strong></td></tr></tbody></table>
            </div>
          </div></div></div>`;
      });

      if (State.reviewers.length >= 3) {
        const f = this.fleiss(stage, State.reviewers.map(r => r.id), mode);
        if (f.n) {
          const [word, cls] = this.interpret(f.kappa);
          html += `<div class="card" style="border-color:var(--gold)"><div class="card-body">
            <div style="font-family:var(--font-display);font-weight:700;font-size:14px;margin-bottom:6px">Fleiss' &kappa; &mdash; all ${f.raters} reviewers</div>
            <div style="font-family:var(--font-display);font-size:30px;font-weight:700;color:var(--gold-dim);letter-spacing:-1.2px">&kappa; = ${f.kappa.toFixed(3)}</div>
            <div style="margin-top:6px"><span class="badge ${cls}">${word}</span></div>
            <div class="mono" style="font-size:11.5px;color:rgba(10,10,20,.55);margin-top:9px">Computed over ${f.n} records rated by all ${f.raters} reviewers. Mean observed agreement ${(f.Pbar * 100).toFixed(1)}%, chance agreement ${(f.Pe * 100).toFixed(1)}%.</div>
            </div></div>`;
        }
      }
      html += `<div class="callout gold" style="margin-top:14px">For the methods section, report the statistic, the value, the stage it was computed at, and how disagreements were settled. Landis and Koch's descriptors are conventional but arbitrary; quote the value itself, not only the word.</div>`;
      host.innerHTML = html;
    }

    // conflict queue
    const body = $('conflictBody');
    $('conflictCount').textContent = conflicts.length + (conflicts.length === 1 ? ' conflict' : ' conflicts');
    if (!conflicts.length) {
      body.innerHTML = '<tr><td colspan="3"><div class="empty"><div class="empty-title">No conflicts</div><div>Every doubly screened record has an agreed outcome.</div></div></td></tr>';
    } else {
      body.innerHTML = conflicts.slice(0, 400).map(({ rec, stage: s }) => {
        const chips = State.reviewers.map(v => {
          const d = rec.decisions[s][v.id];
          return d ? `<span class="rev-chip"><span class="rev-dot" style="background:${esc(v.colour)}"></span>${esc(v.initials)} ${DECISION_LABEL[d]}</span>` : '';
        }).join(' ');
        return `<tr><td><div class="t-title">${esc(rec.title)}</div>
          <div class="t-meta">${esc(STAGE_LABEL[s])}${rec.year ? ' · ' + esc(rec.year) : ''}</div></td>
          <td>${chips}</td>
          <td><div class="btn-row" style="gap:4px">
            <button class="btn btn-xs btn-sage" onclick="Agreement.resolve('${rec.id}','${s}','include')">Include</button>
            <button class="btn btn-xs btn-coral" onclick="Agreement.resolve('${rec.id}','${s}','exclude')">Exclude</button>
            <button class="btn btn-xs btn-ghost-ink" onclick="Agreement.resolve('${rec.id}','${s}','')">Clear</button>
          </div></td></tr>`;
      }).join('');
    }
  },

  resolve(id, stage, value) {
    const r = State.records.find(x => x.id === id); if (!r) return;
    const who = Reviewers.active() ? Reviewers.active().name : 'unattributed';
    mutate('resolve', `Conflict at ${STAGE_LABEL[stage]} resolved as ${value || 'unresolved'} by ${who} — ${(r.title || '').slice(0, 70)}`,
      () => { r.resolved[stage] = value || null; });
    this.render(); UI.refreshCounts();
  },

  exportConflicts() {
    const rows = [['Stage', 'Title', 'Authors', 'Year', 'DOI'].concat(State.reviewers.map(v => v.name), ['Resolved as'])];
    this.conflictRecords().forEach(({ rec, stage }) => {
      rows.push([STAGE_LABEL[stage], rec.title, rec.authors, rec.year, rec.doi]
        .concat(State.reviewers.map(v => rec.decisions[stage][v.id] || ''), [rec.resolved[stage] || '']));
    });
    downloadBlob(toCSV(rows), 'text/csv;charset=utf-8', Project.slug() + '_conflicts.csv');
    toast('Conflicts exported', 'ok');
  }
};
</script>
