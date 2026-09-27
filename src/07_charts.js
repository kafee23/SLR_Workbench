<script>
'use strict';
/* ════════════════════════════════════════════════════════════════
   SVG CHARTS · ANALYTICS · REPORTING CHECKLIST
   Charts are drawn by hand rather than through a charting library so the
   tool keeps working with no network, and so every figure exports as
   vector art at publication resolution.
   ════════════════════════════════════════════════════════════════ */

const PALETTE = ['#2a7f7f', '#c8a96e', '#5a3e8a', '#4a7a5a', '#d4604a', '#4fb3b3', '#8a6f3f', '#9b7fd4', '#7db892', '#e8957f'];

const Chart = {
  _txt(x, y, s, o) {
    o = o || {};
    return `<text x="${x}" y="${y}" font-size="${o.size || 11}" fill="${o.fill || 'rgba(10,10,20,.62)'}"
      text-anchor="${o.anchor || 'start'}" font-weight="${o.weight || 400}"
      font-family="${o.mono ? 'DM Mono, monospace' : 'DM Sans, Helvetica, Arial, sans-serif'}"
      ${o.transform ? `transform="${o.transform}"` : ''}>${esc(s)}</text>`;
  },
  _niceMax(v) {
    if (v <= 5) return 5;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
  },
  _frame(W, H, inner) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
      font-family="DM Sans, Helvetica, Arial, sans-serif"><rect width="${W}" height="${H}" fill="#ffffff"/>${inner}</svg>`;
  },

  /* vertical bars — counts across an ordered category axis */
  bars(data, opts) {
    opts = opts || {};
    const W = opts.width || 620, H = opts.height || 300;
    const M = { t: 18, r: 16, b: 42, l: 46 };
    const iw = W - M.l - M.r, ih = H - M.t - M.b;
    if (!data.length) return this._frame(W, H, this._txt(W / 2, H / 2, 'No data', { anchor: 'middle' }));
    const max = this._niceMax(Math.max.apply(null, data.map(d => d.value)));
    const bw = iw / data.length;
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const y = M.t + ih - (ih * i / 4);
      s += `<line x1="${M.l}" y1="${y}" x2="${M.l + iw}" y2="${y}" stroke="rgba(10,10,20,.09)" stroke-width="1"/>`;
      s += this._txt(M.l - 8, y + 3.5, Math.round(max * i / 4).toLocaleString(), { anchor: 'end', size: 10, mono: true });
    }
    data.forEach((d, i) => {
      const h = max ? (d.value / max) * ih : 0;
      const x = M.l + i * bw + bw * 0.16;
      const w = bw * 0.68;
      s += `<rect x="${x.toFixed(1)}" y="${(M.t + ih - h).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}"
        rx="3" fill="${opts.colour || PALETTE[0]}"><title>${esc(d.label)}: ${d.value}</title></rect>`;
      if (bw > 26 && d.value) s += this._txt(x + w / 2, M.t + ih - h - 5, d.value.toLocaleString(), { anchor: 'middle', size: 9.5, mono: true, fill: 'rgba(10,10,20,.55)' });
      const rotate = data.length > 12;
      s += this._txt(x + w / 2, M.t + ih + (rotate ? 12 : 15), d.label, {
        anchor: rotate ? 'end' : 'middle', size: 10,
        transform: rotate ? `rotate(-42 ${(x + w / 2).toFixed(1)} ${(M.t + ih + 12).toFixed(1)})` : ''
      });
    });
    s += `<line x1="${M.l}" y1="${M.t + ih}" x2="${M.l + iw}" y2="${M.t + ih}" stroke="rgba(10,10,20,.25)" stroke-width="1.2"/>`;
    return this._frame(W, H, s);
  },

  /* horizontal bars — long labels, ranked */
  hbars(data, opts) {
    opts = opts || {};
    const W = opts.width || 620;
    const rowH = 26, M = { t: 14, r: 52, b: 14, l: opts.labelWidth || 210 };
    const H = M.t + M.b + data.length * rowH;
    if (!data.length) return this._frame(W, 120, this._txt(W / 2, 60, 'No data', { anchor: 'middle' }));
    const iw = W - M.l - M.r;
    const max = Math.max.apply(null, data.map(d => d.value)) || 1;
    let s = '';
    data.forEach((d, i) => {
      const y = M.t + i * rowH;
      const w = (d.value / max) * iw;
      const label = d.label.length > 34 ? d.label.slice(0, 33) + '…' : d.label;
      s += this._txt(M.l - 9, y + rowH / 2 + 3.5, label, { anchor: 'end', size: 11 });
      s += `<rect x="${M.l}" y="${y + 4}" width="${Math.max(1, w).toFixed(1)}" height="${rowH - 10}" rx="3"
        fill="${opts.colour || PALETTE[(i % PALETTE.length)]}"><title>${esc(d.label)}: ${d.value}</title></rect>`;
      s += this._txt(M.l + w + 7, y + rowH / 2 + 3.5, d.value.toLocaleString(), { size: 10.5, mono: true, weight: 600, fill: 'rgba(10,10,20,.6)' });
    });
    return this._frame(W, H, s);
  },

  /* donut — composition */
  donut(data, opts) {
    opts = opts || {};
    const W = opts.width || 620, H = opts.height || 290;
    const cx = 140, cy = H / 2, R = 96, r = 56;
    const total = data.reduce((a, d) => a + d.value, 0);
    if (!total) return this._frame(W, H, this._txt(W / 2, H / 2, 'No data', { anchor: 'middle' }));
    let angle = -Math.PI / 2, s = '';
    data.forEach((d, i) => {
      const slice = (d.value / total) * Math.PI * 2;
      const a2 = angle + slice;
      const large = slice > Math.PI ? 1 : 0;
      const p = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
      const [x1, y1] = p(R, angle), [x2, y2] = p(R, a2), [x3, y3] = p(r, a2), [x4, y4] = p(r, angle);
      // A single category would otherwise collapse to a zero-length arc.
      const path = data.length === 1
        ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${PALETTE[0]}" stroke-width="${R - r}"/>`
        : `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}
            L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z"
            fill="${PALETTE[i % PALETTE.length]}"><title>${esc(d.label)}: ${d.value} (${pct(d.value, total)}%)</title></path>`;
      s += path;
      angle = a2;
    });
    s += this._txt(cx, cy - 2, total.toLocaleString(), { anchor: 'middle', size: 25, weight: 700, fill: '#0a0a14' });
    s += this._txt(cx, cy + 16, opts.centreLabel || 'total', { anchor: 'middle', size: 10.5, mono: true });
    const lx = 272;
    data.forEach((d, i) => {
      const y = 28 + i * 22;
      if (y > H - 14) return;
      s += `<rect x="${lx}" y="${y - 9}" width="11" height="11" rx="2.5" fill="${PALETTE[i % PALETTE.length]}"/>`;
      s += this._txt(lx + 18, y, d.label.length > 30 ? d.label.slice(0, 29) + '…' : d.label, { size: 11 });
      s += this._txt(W - 16, y, `${d.value.toLocaleString()} (${pct(d.value, total)}%)`, { anchor: 'end', size: 10.5, mono: true });
    });
    return this._frame(W, H, s);
  },

  /* stepped funnel — the screening cascade.
     Labels sit in a fixed gutter rather than inside the bar, because the
     later stages of a review produce bars far too narrow to hold text. */
  funnel(steps, opts) {
    opts = opts || {};
    const W = opts.width || 620;
    const rowH = 44, M = { t: 14, r: 64, b: 14, l: 176 };
    const H = M.t + M.b + steps.length * rowH;
    const iw = W - M.l - M.r;
    const max = steps.length ? (steps[0].value || 1) : 1;
    let s = '';
    steps.forEach((st, i) => {
      const y = M.t + i * rowH;
      const w = Math.max(3, (st.value / max) * iw);
      const colour = PALETTE[i % PALETTE.length];
      const mid = y + (rowH - 10) / 2 + 3;
      s += this._txt(M.l - 10, mid, st.label.length > 28 ? st.label.slice(0, 27) + '…' : st.label,
        { anchor: 'end', size: 11, weight: 600, fill: 'rgba(10,10,20,.72)' });
      s += `<rect x="${M.l}" y="${y + 3}" width="${w.toFixed(1)}" height="${rowH - 16}" rx="4" fill="${colour}"><title>${esc(st.label)}: ${st.value}</title></rect>`;
      const valueInside = w > 58;
      s += this._txt(valueInside ? M.l + w - 9 : M.l + w + 8, mid - 1, st.value.toLocaleString(),
        { anchor: valueInside ? 'end' : 'start', size: 12, weight: 700, mono: true, fill: valueInside ? '#ffffff' : 'rgba(10,10,20,.72)' });
      if (i < steps.length - 1) {
        const drop = st.value - steps[i + 1].value;
        if (drop > 0) {
          const dy = y + rowH - 6;
          s += this._txt(M.l - 10, dy, `−${drop.toLocaleString()}`, { anchor: 'end', size: 9.5, mono: true, fill: '#d4604a' });
          s += `<line x1="${M.l - 6}" y1="${dy - 3}" x2="${M.l - 1}" y2="${dy - 3}" stroke="#d4604a" stroke-width="1"/>`;
        }
      }
    });
    return this._frame(W, H, s);
  }
};

/* ── analytics ─────────────────────────────────────────────── */
const Analytics = {
  population() {
    const scope = $('anScope') ? $('anScope').value : 'unique';
    if (scope === 'all') return State.records;
    const live = State.records.filter(r => !r.isDuplicate);
    if (scope === 'included') return live.filter(r => effectiveDecision(r, 'fulltext') === 'include');
    return live;
  },
  tally(records, fn, limit) {
    const map = new Map();
    records.forEach(r => {
      const keys = fn(r);
      (Array.isArray(keys) ? keys : [keys]).forEach(k => {
        if (!k) return;
        map.set(k, (map.get(k) || 0) + 1);
      });
    });
    const arr = Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return limit ? arr.slice(0, limit) : arr;
  },
  card(id, title, svg, note) {
    return `<div class="card"><div class="card-header"><h2 class="card-title">${esc(title)}</h2>
      <div class="btn-row"><button class="btn btn-ghost-ink btn-xs" onclick="Analytics.exportChart('${id}','svg')">SVG</button>
      <button class="btn btn-ghost-ink btn-xs" onclick="Analytics.exportChart('${id}','png')">PNG</button></div></div>
      <div class="card-body"><div class="chart-host" id="chart_${id}">${svg}</div>
      ${note ? `<p class="card-note">${note}</p>` : ''}</div></div>`;
  },
  render() {
    if (UI.activeTab !== 'tab-analytics') return;
    const host = $('analyticsGrid');
    const recs = this.population();
    if (!recs.length) {
      host.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="card-body"><div class="empty">
        <div class="empty-title">Nothing to chart yet</div><div>Import records on the first tab.</div></div></div></div>`;
      return;
    }
    const years = this.tally(recs, r => r.year).filter(d => /^\d{4}$/.test(d.label)).sort((a, b) => a.label.localeCompare(b.label));
    const journals = this.tally(recs, r => r.journal, 12);
    const sources = this.tally(recs, r => r.dbSource, 8);
    const kw = this.tally(recs, r => (r.keywords || '').split(/;|,/).map(s => s.trim().toLowerCase()).filter(s => s.length > 2), 14);

    const live = State.records.filter(r => !r.isDuplicate);
    const afterTitle = live.filter(r => advances(effectiveDecision(r, 'title')));
    const afterAbs = afterTitle.filter(r => advances(effectiveDecision(r, 'abstract')));
    const included = afterAbs.filter(r => effectiveDecision(r, 'fulltext') === 'include');
    const funnel = [
      { label: 'Imported', value: State.records.length },
      { label: 'After duplicates removed', value: live.length },
      { label: 'Passed title screening', value: afterTitle.length },
      { label: 'Passed abstract screening', value: afterAbs.length },
      { label: 'Included after full text', value: included.length }
    ];

    host.innerHTML = [
      this.card('funnel', 'Screening cascade', Chart.funnel(funnel),
        'Drawn from the decisions actually recorded, so it lags behind the PRISMA Data tab until screening is complete.'),
      this.card('years', 'Publications by year', Chart.bars(years, { colour: PALETTE[0] }),
        `${years.length} distinct years across ${recs.length.toLocaleString()} records.`),
      this.card('sources', 'Records by database', Chart.donut(sources, { centreLabel: 'records' }),
        'Counts are as imported. Overlap between databases is what deduplication removes.'),
      this.card('journals', 'Most frequent publication venues', Chart.hbars(journals, { colour: PALETTE[3] })),
      this.card('keywords', 'Most frequent author keywords', Chart.hbars(kw, { colour: PALETTE[2] }),
        'Author keywords are inconsistently supplied by databases; treat this as indicative, not as a bibliometric result.')
    ].join('');
  },
  exportChart(id, kind) {
    const hostEl = $('chart_' + id);
    if (!hostEl) return;
    const svg = hostEl.querySelector('svg');
    if (!svg) return;
    const str = new XMLSerializer().serializeToString(svg);
    if (kind === 'svg') {
      downloadBlob(str, 'image/svg+xml;charset=utf-8', `${Project.slug()}_${id}.svg`);
      toast('Chart exported', 'ok');
      return;
    }
    const w = +svg.getAttribute('width') || 620, h = +svg.getAttribute('height') || 300, scale = 3;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * scale; c.height = h * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { downloadBlob(b, 'image/png', `${Project.slug()}_${id}.png`); toast('Chart exported', 'ok'); });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not rasterise the chart', 'err'); };
    img.src = url;
  }
};

/* ── PRISMA 2020 reporting checklist ───────────────────────────
   The official 27 items with their sub-items, worded for any discipline.
   Each row carries a location field because that is what journals ask for. */
function buildChecklist() {
  const raw = [
    ['TITLE', '1', 'Title', 'Identify the report as a systematic review.'],
    ['ABSTRACT', '2', 'Abstract', 'See the PRISMA 2020 for Abstracts checklist.'],
    ['INTRODUCTION', '3', 'Rationale', 'Describe the rationale for the review in the context of existing knowledge.'],
    ['INTRODUCTION', '4', 'Objectives', 'Provide an explicit statement of the objective(s) or question(s) the review addresses.'],
    ['METHODS', '5', 'Eligibility criteria', 'Specify the inclusion and exclusion criteria for the review and how studies were grouped for the syntheses.'],
    ['METHODS', '6', 'Information sources', 'Specify all databases, registers, websites, organisations, reference lists and other sources searched or consulted. Specify the date when each source was last searched or consulted.'],
    ['METHODS', '7', 'Search strategy', 'Present the full search strategies for all databases, registers and websites, including any filters and limits used.'],
    ['METHODS', '8', 'Selection process', 'Specify the methods used to decide whether a study met the inclusion criteria, including how many reviewers screened each record and each report retrieved, whether they worked independently, and if applicable, details of automation tools used.'],
    ['METHODS', '9', 'Data collection process', 'Specify the methods used to collect data from reports, including how many reviewers collected data from each report, whether they worked independently, any processes for obtaining or confirming data from investigators, and if applicable, details of automation tools used.'],
    ['METHODS', '10a', 'Data items — outcomes', 'List and define all outcomes for which data were sought. Specify whether all results compatible with each outcome domain in each study were sought, and if not, the methods used to decide which results to collect.'],
    ['METHODS', '10b', 'Data items — other variables', 'List and define all other variables for which data were sought. Describe any assumptions made about missing or unclear information.'],
    ['METHODS', '11', 'Study risk of bias assessment', 'Specify the methods used to assess risk of bias in the included studies, including the tool(s) used, how many reviewers assessed each study, whether they worked independently, and if applicable, details of automation tools used.'],
    ['METHODS', '12', 'Effect measures', 'Specify for each outcome the effect measure(s) used in the synthesis or presentation of results.'],
    ['METHODS', '13a', 'Synthesis — eligibility', 'Describe the processes used to decide which studies were eligible for each synthesis.'],
    ['METHODS', '13b', 'Synthesis — data preparation', 'Describe any methods required to prepare the data for presentation or synthesis.'],
    ['METHODS', '13c', 'Synthesis — tabulation and display', 'Describe any methods used to tabulate or visually display results of individual studies and syntheses.'],
    ['METHODS', '13d', 'Synthesis — methods', 'Describe any methods used to synthesise results and provide a rationale for the choice(s). If meta-analysis was performed, describe the model(s), the method(s) used to identify statistical heterogeneity, and the software packages used.'],
    ['METHODS', '13e', 'Synthesis — heterogeneity', 'Describe any methods used to explore possible causes of heterogeneity among study results.'],
    ['METHODS', '13f', 'Synthesis — sensitivity analyses', 'Describe any sensitivity analyses conducted to assess robustness of the synthesised results.'],
    ['METHODS', '14', 'Reporting bias assessment', 'Describe any methods used to assess risk of bias due to missing results in a synthesis.'],
    ['METHODS', '15', 'Certainty assessment', 'Describe any methods used to assess certainty (or confidence) in the body of evidence for an outcome.'],
    ['RESULTS', '16a', 'Study selection', 'Describe the results of the search and selection process, from the number of records identified to the number of studies included, ideally using a flow diagram.'],
    ['RESULTS', '16b', 'Study selection — near misses', 'Cite studies that might appear to meet the inclusion criteria but were excluded, and explain why.'],
    ['RESULTS', '17', 'Study characteristics', 'Cite each included study and present its characteristics.'],
    ['RESULTS', '18', 'Risk of bias in studies', 'Present assessments of risk of bias for each included study.'],
    ['RESULTS', '19', 'Results of individual studies', 'For all outcomes, present for each study a summary of the data for each group and an effect estimate with its precision, ideally using structured tables or plots.'],
    ['RESULTS', '20a', 'Results of syntheses — contributing studies', 'Briefly summarise the characteristics and risk of bias among contributing studies.'],
    ['RESULTS', '20b', 'Results of syntheses — statistical results', 'Present results of all statistical syntheses conducted. If meta-analysis was done, present for each the summary estimate, its precision, and measures of statistical heterogeneity. If comparing groups, describe the direction of the effect.'],
    ['RESULTS', '20c', 'Results of syntheses — heterogeneity', 'Present results of all investigations of possible causes of heterogeneity among study results.'],
    ['RESULTS', '20d', 'Results of syntheses — sensitivity', 'Present results of all sensitivity analyses conducted to assess robustness of the synthesised results.'],
    ['RESULTS', '21', 'Reporting biases', 'Present assessments of risk of bias due to missing results for each synthesis assessed.'],
    ['RESULTS', '22', 'Certainty of evidence', 'Present assessments of certainty in the body of evidence for each outcome assessed.'],
    ['DISCUSSION', '23a', 'Discussion — interpretation', 'Provide a general interpretation of the results in the context of other evidence.'],
    ['DISCUSSION', '23b', 'Discussion — limitations of evidence', 'Discuss any limitations of the evidence included in the review.'],
    ['DISCUSSION', '23c', 'Discussion — limitations of process', 'Discuss any limitations of the review processes used.'],
    ['DISCUSSION', '23d', 'Discussion — implications', 'Discuss implications of the results for practice, policy and future research.'],
    ['OTHER', '24a', 'Registration', 'Provide registration information for the review, including the register name and registration number, or state that the review was not registered.'],
    ['OTHER', '24b', 'Protocol', 'Indicate where the review protocol can be accessed, or state that a protocol was not prepared.'],
    ['OTHER', '24c', 'Amendments', 'Describe and explain any amendments to information provided at registration or in the protocol.'],
    ['OTHER', '25', 'Support', 'Describe sources of financial or non-financial support for the review, and the role of the funders or sponsors.'],
    ['OTHER', '26', 'Competing interests', 'Declare any competing interests of review authors.'],
    ['OTHER', '27', 'Availability of data, code and other materials', 'Report which of the following are publicly available and where: data collection forms; data extracted from included studies; data used for all analyses; analytic code; any other materials used in the review.']
  ];
  return raw.map(([section, no, item, desc]) =>
    ({ id: 'chk_' + no, section, no, item, desc, done: false, na: false, location: '', note: '' }));
}

const SECTION_COLOUR = { TITLE: '#c8a96e', ABSTRACT: '#8a6f3f', INTRODUCTION: '#5a3e8a', METHODS: '#2a7f7f', RESULTS: '#4a7a5a', DISCUSSION: '#d4604a', OTHER: '#4fb3b3' };

const Checklist = {
  items() {
    if (!State.checklist || !State.checklist.length) State.checklist = buildChecklist();
    return State.checklist;
  },
  progress() {
    const all = this.items();
    const applicable = all.filter(i => !i.na);
    return { done: applicable.filter(i => i.done).length, total: applicable.length, na: all.length - applicable.length, all: all.length };
  },
  set(id, field, value) {
    const it = this.items().find(i => i.id === id); if (!it) return;
    mutate('project', `Checklist item ${it.no} (${it.item}): ${field} set to ${value === true ? 'yes' : value === false ? 'no' : '"' + value + '"'}`, () => {
      it[field] = value;
      if (field === 'na' && value) it.done = false;
      if (field === 'done' && value) it.na = false;
    });
    this.render();
  },
  reset() {
    mutate('project', 'Reset the reporting checklist', () => { State.checklist = buildChecklist(); });
    this.render();
  },
  render() {
    if (UI.activeTab !== 'tab-checklist') { UI.refreshCounts(); return; }
    const filter = $('checkFilter').value;
    const items = this.items().filter(i =>
      filter === 'all' || (filter === 'done' && i.done) || (filter === 'todo' && !i.done && !i.na) || (filter === 'na' && i.na));
    const p = this.progress();
    $('checkProgressLabel').textContent = `${p.done} of ${p.total} applicable items reported${p.na ? `, ${p.na} marked n/a` : ''}`;
    $('checkProgressPct').textContent = (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%';
    $('checkProgressFill').style.width = (p.total ? (p.done / p.total) * 100 : 0) + '%';

    const bySection = {};
    items.forEach(i => { (bySection[i.section] = bySection[i.section] || []).push(i); });
    $('checklistHost').innerHTML = Object.keys(bySection).map(sec => `
      <div class="card" style="margin-bottom:14px">
        <div class="card-header" style="border-left:4px solid ${SECTION_COLOUR[sec] || '#2a7f7f'}">
          <h2 class="card-title">${esc(sec)}</h2>
          <span class="mono muted" style="font-size:11.5px">${bySection[sec].filter(i => i.done).length}/${bySection[sec].filter(i => !i.na).length} reported</span>
        </div>
        <div class="card-body tight"><div class="table-wrap"><table>
          <thead><tr><th style="width:52px">Item</th><th>Recommendation</th><th style="width:132px">Location</th><th style="width:118px">Status</th></tr></thead>
          <tbody>${bySection[sec].map(i => `<tr${i.na ? ' style="opacity:.55"' : ''}>
            <td class="mono" style="font-weight:700;color:${SECTION_COLOUR[sec] || '#2a7f7f'}">${esc(i.no)}</td>
            <td><div style="font-weight:600;font-size:12.5px;margin-bottom:2px">${esc(i.item)}</div>
                <div style="font-size:11.5px;color:rgba(10,10,20,.55);line-height:1.5">${esc(i.desc)}</div>
                ${i.na ? `<input type="text" value="${esc(i.note)}" placeholder="Why does this not apply?" style="margin-top:6px;font-size:11.5px;padding:5px 8px" onchange="Checklist.set('${i.id}','note',this.value)">` : ''}</td>
            <td><input type="text" value="${esc(i.location)}" placeholder="p. / §" class="mono" style="font-size:11.5px;padding:5px 8px" onchange="Checklist.set('${i.id}','location',this.value)"></td>
            <td><label class="switch" style="margin-bottom:5px"><input type="checkbox" ${i.done ? 'checked' : ''} onchange="Checklist.set('${i.id}','done',this.checked)"><span style="font-size:11.5px">Reported</span></label>
                <label class="switch"><input type="checkbox" ${i.na ? 'checked' : ''} onchange="Checklist.set('${i.id}','na',this.checked)"><span style="font-size:11.5px">n/a</span></label></td>
          </tr>`).join('')}</tbody></table></div></div></div>`).join('');
    UI.refreshCounts();
  },
  export(kind) {
    const items = this.items();
    if (kind === 'csv') {
      const rows = [['Section', 'Item', 'Topic', 'Checklist item', 'Location where item is reported', 'Reported', 'Not applicable', 'Note']];
      items.forEach(i => rows.push([i.section, i.no, i.item, i.desc, i.location, i.done ? 'Yes' : 'No', i.na ? 'Yes' : '', i.note]));
      downloadBlob(toCSV(rows), 'text/csv;charset=utf-8', Project.slug() + '_prisma_checklist.csv');
    } else {
      const body = items.map(i => `<tr><td>${esc(i.section)}</td><td>${esc(i.no)}</td><td><b>${esc(i.item)}</b><br>${esc(i.desc)}</td>
        <td>${esc(i.location)}</td><td>${i.na ? 'n/a — ' + esc(i.note) : (i.done ? 'Reported' : 'Not yet')}</td></tr>`).join('');
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
        <style>body{font-family:Calibri,Arial,sans-serif;font-size:10pt}table{border-collapse:collapse;width:100%}
        td,th{border:1px solid #999;padding:5px;vertical-align:top}th{background:#eee}</style></head><body>
        <h2>PRISMA 2020 Checklist — ${esc(State.project.title)}</h2>
        <table><thead><tr><th>Section</th><th>#</th><th>Checklist item</th><th>Location</th><th>Status</th></tr></thead>
        <tbody>${body}</tbody></table></body></html>`;
      downloadBlob(html, 'application/msword', Project.slug() + '_prisma_checklist.doc');
    }
    toast('Checklist exported', 'ok');
  }
};
</script>
