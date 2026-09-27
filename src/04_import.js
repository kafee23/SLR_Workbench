<script>
'use strict';
/* ════════════════════════════════════════════════════════════════
   IMPORT · DEDUPLICATION · RECORD TABLE
   ════════════════════════════════════════════════════════════════ */

/* ── virtualised table ─────────────────────────────────────── */
function VirtualTable(cfg) {
  const { scrollEl, bodyEl, rowHeight, overscan = 8 } = cfg;
  let rows = [];
  let raf = null;

  function paint() {
    raf = null;
    const total = rows.length;
    if (!total) { bodyEl.innerHTML = cfg.emptyHTML || ''; return; }
    const viewH = scrollEl.clientHeight || 600;
    const top = scrollEl.scrollTop;
    let start = Math.max(0, Math.floor(top / rowHeight) - overscan);
    let end = Math.min(total, Math.ceil((top + viewH) / rowHeight) + overscan);
    // Below a few hundred rows the windowing costs more than it saves.
    if (total <= 120) { start = 0; end = total; }
    const padTop = start * rowHeight;
    const padBottom = (total - end) * rowHeight;
    const parts = [];
    if (padTop > 0) parts.push(`<tr class="spacer" style="height:${padTop}px"><td colspan="${cfg.cols}" style="padding:0;border:none"></td></tr>`);
    for (let i = start; i < end; i++) parts.push(cfg.renderRow(rows[i], i));
    if (padBottom > 0) parts.push(`<tr class="spacer" style="height:${padBottom}px"><td colspan="${cfg.cols}" style="padding:0;border:none"></td></tr>`);
    bodyEl.innerHTML = parts.join('');
  }
  function schedule() { if (raf === null) raf = requestAnimationFrame(paint); }
  scrollEl.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  return {
    setRows(r) { rows = r; scrollEl.scrollTop = Math.min(scrollEl.scrollTop, Math.max(0, r.length * rowHeight - 100)); paint(); },
    setEmpty(html) { cfg.emptyHTML = html; },
    refresh() { paint(); },
    count() { return rows.length; },
    rows() { return rows; }
  };
}

/* ── text normalisation ────────────────────────────────────── */
function normTitle(t) {
  return String(t == null ? '' : t).toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\band\b|&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function firstAuthorSurname(authors) {
  if (!authors) return '';
  const first = String(authors).split(/;|\band\b/)[0].trim();
  if (!first) return '';
  const surname = first.includes(',') ? first.split(',')[0] : first.split(/\s+/).pop();
  return surname.toLowerCase().replace(/[^a-z]/g, '');
}

/* ── bounded edit distance ─────────────────────────────────────
   Returns the true Levenshtein distance when it is <= maxDist, and
   maxDist+1 otherwise. Banding plus a per-row minimum check lets most
   non-matching pairs abandon after a handful of rows. This replaces the
   v1 behaviour of returning a fabricated distance for long strings. */
function boundedLev(a, b, maxDist) {
  const m = a.length, n = b.length;
  if (m === 0) return n <= maxDist ? n : maxDist + 1;
  if (n === 0) return m <= maxDist ? m : maxDist + 1;
  if (Math.abs(m - n) > maxDist) return maxDist + 1;
  const INF = maxDist + 1;
  let prev = new Int32Array(n + 2);
  let cur = new Int32Array(n + 2);
  for (let j = 0; j <= n; j++) prev[j] = j <= maxDist ? j : INF;
  prev[n + 1] = INF;
  for (let i = 1; i <= m; i++) {
    const lo = Math.max(1, i - maxDist);
    const hi = Math.min(n, i + maxDist);
    cur[0] = i <= maxDist ? i : INF;
    if (lo > 1) cur[lo - 1] = INF;
    let rowMin = INF;
    const ca = a.charCodeAt(i - 1);
    for (let j = lo; j <= hi; j++) {
      let v = prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1);
      const del = prev[j] + 1; if (del < v) v = del;
      const ins = cur[j - 1] + 1; if (ins < v) v = ins;
      if (v > INF) v = INF;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (hi < n) cur[hi + 1] = INF;
    if (rowMin > maxDist) return INF;
    const t = prev; prev = cur; cur = t;
  }
  return prev[n] > maxDist ? INF : prev[n];
}

/* Similarity as a percentage, short-circuited by the threshold so we never
   pay for a full matrix on a pair that cannot possibly qualify. */
function titleSimilarity(a, b, threshold) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);
  if (minLen / maxLen < threshold / 100) return 0;
  const maxDist = Math.floor(maxLen * (1 - threshold / 100));
  if (maxDist < 0) return 0;
  const d = boundedLev(a, b, maxDist);
  if (d > maxDist) return 0;
  return Math.round((1 - d / maxLen) * 1000) / 10;
}

/* ── disjoint set ──────────────────────────────────────────── */
function makeDSU(n) {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { a = find(a); b = find(b); if (a === b) return false; parent[b] = a; return true; }
  return { find, union };
}

/* ── parsers ───────────────────────────────────────────────── */
const Parse = {
  detect(name, text) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'bib' || ext === 'bibtex') return 'bibtex';
    if (ext === 'nbib') return 'nbib';
    if (ext === 'ris') return 'ris';
    if (ext === 'csv') return 'csv';
    if (ext === 'tsv') return 'tsv';
    const head = text.slice(0, 2000);
    if (/^\s*@\w+\s*\{/m.test(head)) return 'bibtex';
    if (/^PMID\s*-\s/m.test(head)) return 'nbib';
    if (/^TY\s{2}-\s/m.test(head)) return 'ris';
    if (head.includes('\t')) return 'tsv';
    return 'csv';
  },

  ris(text) {
    const out = [];
    const lines = text.split(/\r?\n/);
    let cur = null, lastTag = null;
    const push = () => { if (cur && (cur.title || cur.doi)) out.push(cur); cur = null; };
    for (const raw of lines) {
      const m = raw.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
      if (m) {
        const tag = m[1], val = m[2].trim();
        if (tag === 'TY') { push(); cur = { authorList: [], keywordList: [], type: val }; lastTag = tag; continue; }
        if (!cur) cur = { authorList: [], keywordList: [] };
        lastTag = tag;
        switch (tag) {
          case 'TI': case 'T1': case 'CT': cur.title = (cur.title ? cur.title + ' ' : '') + val; break;
          case 'AU': case 'A1': case 'A2': cur.authorList.push(val); break;
          case 'PY': case 'Y1': { const y = (val.match(/\d{4}/) || [])[0]; if (y && !cur.year) cur.year = y; break; }
          case 'DA': { const y = (val.match(/\d{4}/) || [])[0]; if (y && !cur.year) cur.year = y; break; }
          case 'JO': case 'JF': case 'JA': case 'T2': case 'BT': if (!cur.journal) cur.journal = val; break;
          case 'DO': cur.doi = val; break;
          case 'AB': case 'N2': cur.abstract = (cur.abstract ? cur.abstract + ' ' : '') + val; break;
          case 'KW': cur.keywordList.push(val); break;
          case 'VL': cur.volume = val; break;
          case 'IS': cur.issue = val; break;
          case 'SP': cur.startPage = val; break;
          case 'EP': cur.endPage = val; break;
          case 'UR': case 'L1': if (!cur.url) cur.url = val; break;
          case 'PB': cur.publisher = val; break;
          case 'ER': push(); break;
        }
      } else if (cur && lastTag && raw.trim()) {
        // continuation of the previous tag
        const val = raw.trim();
        if (lastTag === 'AB' || lastTag === 'N2') cur.abstract = (cur.abstract || '') + ' ' + val;
        else if (lastTag === 'TI' || lastTag === 'T1') cur.title = (cur.title || '') + ' ' + val;
      }
    }
    push();
    return out.map(r => ({
      title: (r.title || '').trim(), authors: r.authorList.join('; '), year: r.year || '',
      journal: r.journal || '', doi: r.doi || '', abstract: (r.abstract || '').trim(),
      keywords: r.keywordList.join('; '), volume: r.volume || '', issue: r.issue || '',
      pages: [r.startPage, r.endPage].filter(Boolean).join('-'), url: r.url || '',
      publisher: r.publisher || '', type: r.type || ''
    }));
  },

  nbib(text) {
    const out = [];
    const blocks = text.split(/\r?\n\r?\n+/).filter(b => /^PMID\s*-/m.test(b));
    for (const block of blocks) {
      const fields = {};
      let lastKey = null;
      for (const raw of block.split(/\r?\n/)) {
        const m = raw.match(/^([A-Z]{2,4})\s*-\s(.*)$/);
        if (m) { lastKey = m[1]; (fields[lastKey] = fields[lastKey] || []).push(m[2].trim()); }
        else if (lastKey && raw.trim()) { const arr = fields[lastKey]; arr[arr.length - 1] += ' ' + raw.trim(); }
      }
      const g = (k) => (fields[k] && fields[k][0]) || '';
      const doiField = (fields.AID || fields.LID || []).find(v => /\[doi\]/i.test(v)) || '';
      const dp = g('DP');
      out.push({
        title: g('TI').replace(/\.$/, ''),
        authors: (fields.AU || []).join('; '),
        year: (dp.match(/\d{4}/) || [''])[0],
        journal: g('JT') || g('TA'),
        doi: doiField.replace(/\s*\[doi\]\s*/i, '').trim(),
        abstract: (fields.AB || []).join(' '),
        keywords: (fields.MH || fields.OT || []).join('; '),
        volume: g('VI'), issue: g('IP'), pages: g('PG'),
        url: '', publisher: '', type: (fields.PT || []).join('; ')
      });
    }
    return out.filter(r => r.title);
  },

  bibtex(text) {
    const out = [];
    const entryRe = /@(\w+)\s*\{([^,]*),/g;
    let m;
    const starts = [];
    while ((m = entryRe.exec(text)) !== null) starts.push({ index: m.index, type: m[1], body: m.index + m[0].length });
    for (let i = 0; i < starts.length; i++) {
      const from = starts[i].body;
      const to = i + 1 < starts.length ? starts[i + 1].index : text.length;
      const body = text.slice(from, to);
      const rec = { type: starts[i].type };
      // field = {value} | "value" | bare
      const fieldRe = /(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,\n}]+)/g;
      let f;
      while ((f = fieldRe.exec(body)) !== null) {
        const key = f[1].toLowerCase();
        let val = f[2].trim().replace(/^[{"]|[}"]$/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
        rec[key] = val;
      }
      if (!rec.title && !rec.doi) continue;
      out.push({
        title: rec.title || '',
        authors: (rec.author || '').split(/\s+and\s+/).map(s => s.trim()).filter(Boolean).join('; '),
        year: (String(rec.year || '').match(/\d{4}/) || [''])[0],
        journal: rec.journal || rec.booktitle || rec.journaltitle || '',
        doi: rec.doi || '', abstract: rec.abstract || '',
        keywords: rec.keywords || '', volume: rec.volume || '', issue: rec.number || '',
        pages: (rec.pages || '').replace(/--/g, '-'), url: rec.url || '',
        publisher: rec.publisher || '', type: rec.type || ''
      });
    }
    return out;
  },

  delimited(text, delim) {
    const rows = [];
    let cur = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { cur.push(field); field = ''; }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
    if (field || cur.length) { cur.push(field); rows.push(cur); }
    if (!rows.length) return [];
    const header = rows[0].map(h => h.trim().toLowerCase().replace(/^﻿/, ''));
    const pick = (row, ...names) => {
      for (const n of names) {
        const idx = header.indexOf(n);
        if (idx >= 0 && row[idx] != null && String(row[idx]).trim()) return String(row[idx]).trim();
      }
      // fall back to a loose contains match
      for (const n of names) {
        const idx = header.findIndex(h => h.includes(n));
        if (idx >= 0 && row[idx] != null && String(row[idx]).trim()) return String(row[idx]).trim();
      }
      return '';
    };
    return rows.slice(1).filter(r => r.some(c => String(c).trim())).map(r => ({
      title: pick(r, 'title', 'document title', 'article title', 'ti'),
      authors: pick(r, 'authors', 'author', 'author full names', 'au'),
      year: (pick(r, 'year', 'publication year', 'py', 'date').match(/\d{4}/) || [''])[0],
      journal: pick(r, 'source title', 'journal', 'publication title', 'journal name', 'so'),
      doi: pick(r, 'doi', 'di'),
      abstract: pick(r, 'abstract', 'ab'),
      keywords: pick(r, 'author keywords', 'keywords', 'index keywords', 'de'),
      volume: pick(r, 'volume', 'vl'), issue: pick(r, 'issue', 'is'),
      pages: pick(r, 'pages', 'page start', 'bp'),
      url: pick(r, 'url', 'link', 'doi link'),
      publisher: pick(r, 'publisher', 'pu'),
      type: pick(r, 'document type', 'publication type', 'type')
    })).filter(r => r.title || r.doi);
  },

  run(name, text) {
    const kind = this.detect(name, text);
    switch (kind) {
      case 'ris': return { kind, rows: this.ris(text) };
      case 'nbib': return { kind, rows: this.nbib(text) };
      case 'bibtex': return { kind, rows: this.bibtex(text) };
      case 'tsv': return { kind, rows: this.delimited(text, '\t') };
      default: return { kind: 'csv', rows: this.delimited(text, ',') };
    }
  }
};

/* ── import ────────────────────────────────────────────────── */
const COMMON_DATABASES = ['Scopus', 'Web of Science', 'PubMed', 'IEEE Xplore', 'ACM Digital Library',
  'ScienceDirect', 'SpringerLink', 'Wiley Online Library', 'EMBASE', 'PsycINFO', 'CINAHL',
  'Cochrane Library', 'ERIC', 'JSTOR', 'ProQuest', 'Google Scholar', 'Grey literature', 'Citation searching'];

const Import = {
  _queue: [],
  _batches: [],

  init() {
    const dz = $('dropzone'), fi = $('fileInput');
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('over');
      this.handleFiles(Array.from(e.dataTransfer.files));
    });
    fi.addEventListener('change', e => { this.handleFiles(Array.from(e.target.files)); e.target.value = ''; });
  },

  async handleFiles(files) {
    if (!files.length) return;
    const parsed = [];
    for (const f of files) {
      try {
        const text = await f.text();
        const { kind, rows } = Parse.run(f.name, text);
        if (!rows.length) { toast(`No records found in ${f.name}`, 'err'); continue; }
        parsed.push({ file: f, kind, rows });
      } catch (e) {
        toast(`Could not read ${f.name}: ${e.message}`, 'err');
      }
    }
    if (!parsed.length) return;
    this._queue = parsed;
    this.askSource(0);
  },

  askSource(idx) {
    if (idx >= this._queue.length) { this._queue = []; this.finish(); return; }
    const item = this._queue[idx];
    const guess = COMMON_DATABASES.find(d => item.file.name.toLowerCase().includes(d.toLowerCase().split(' ')[0])) || '';
    const opts = COMMON_DATABASES.map(d => `<option value="${esc(d)}"${d === guess ? ' selected' : ''}>${esc(d)}</option>`).join('');
    UI.openModal('Which database is this export from?', `
      <p style="margin-bottom:14px;line-height:1.6"><span class="mono">${esc(item.file.name)}</span> parsed as
      <span class="badge b-gold">${esc(item.kind.toUpperCase())}</span> with
      <strong>${item.rows.length.toLocaleString()}</strong> records.</p>
      <div class="field">
        <label class="fl" for="srcSelect">Source database</label>
        <select id="srcSelect">${opts}<option value="__custom">Other (type below)&hellip;</option></select>
      </div>
      <div class="field"><label class="fl" for="srcCustom">Custom name</label>
        <input type="text" id="srcCustom" placeholder="Name of the database or register"></div>
      <p class="hint">Attributing each export to its database is what lets the Identification box in the flow diagram list sources separately.</p>
      <div class="callout" style="margin-top:12px">File ${idx + 1} of ${this._queue.length}</div>`,
      `<button class="btn btn-ghost-ink" onclick="Import.skipFile(${idx})">Skip this file</button>
       <button class="btn btn-teal" onclick="Import.confirmSource(${idx})">Import ${item.rows.length.toLocaleString()} records</button>`);
    setTimeout(() => {
      const sel = $('srcSelect'), custom = $('srcCustom');
      const sync = () => { custom.style.display = sel.value === '__custom' ? '' : 'none'; };
      sel.addEventListener('change', sync); sync();
    }, 0);
  },

  skipFile(idx) { UI.closeModal(); this.askSource(idx + 1); },

  confirmSource(idx) {
    const sel = $('srcSelect'), custom = $('srcCustom');
    const source = sel.value === '__custom' ? (custom.value || '').trim() : sel.value;
    if (!source) { toast('Give the source a name', 'err'); return; }
    const item = this._queue[idx];
    const batch = uid('batch');
    const added = item.rows.map(r => normaliseRecord(Object.assign({}, r, {
      id: uid('rec'), dbSource: source, importBatch: batch
    })));
    mutate('import', `Imported ${added.length} records from ${item.file.name} (${item.kind.toUpperCase()}) attributed to ${source}`, () => {
      State.records = State.records.concat(added);
      const existing = State.sources.find(s => s.name === source);
      if (existing) existing.count += added.length;
      else State.sources.push({ id: uid('src'), name: source, count: added.length });
    });
    this._batches.push({ file: item.file.name, kind: item.kind, source, count: added.length, at: nowISO() });
    UI.closeModal();
    this.askSource(idx + 1);
  },

  finish() {
    this.renderLog();
    Records.render();
    UI.refreshCounts();
    $('recordTableCard').style.display = '';
    toast(`${State.records.length.toLocaleString()} records in the project`, 'ok');
    const box = $('dupSummary');
    box.style.display = '';
    box.className = 'callout gold';
    box.innerHTML = 'Records imported. Run duplicate detection before you begin screening.';
  },

  renderLog() {
    const host = $('importLog');
    if (!this._batches.length) { host.innerHTML = ''; return; }
    host.innerHTML = `<div style="font-size:11.5px;font-weight:600;color:rgba(10,10,20,.55);margin-bottom:7px">IMPORTED THIS SESSION</div>` +
      this._batches.map(b => `<div style="display:flex;align-items:center;gap:10px;padding:7px 11px;background:var(--paper2);border-radius:7px;margin-bottom:5px;font-size:12.5px">
        <span class="badge b-gold">${esc(b.kind.toUpperCase())}</span>
        <span class="mono" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.file)}</span>
        <span class="badge b-teal">${esc(b.source)}</span>
        <strong class="mono">${b.count.toLocaleString()}</strong></div>`).join('');
  },

  downloadTemplate(kind) {
    if (kind === 'csv') {
      downloadBlob(toCSV([
        ['Title', 'Authors', 'Year', 'Source Title', 'DOI', 'Abstract', 'Author Keywords', 'Volume', 'Issue', 'Pages'],
        ['An example article title', 'Smith, J.; Nguyen, T.', '2024', 'Journal of Examples', '10.1000/example', 'Abstract text goes here.', 'example; template', '12', '3', '101-115']
      ]), 'text/csv;charset=utf-8', 'slr_import_template.csv');
    } else {
      downloadBlob(['TY  - JOUR', 'TI  - An example article title', 'AU  - Smith, J.', 'AU  - Nguyen, T.',
        'PY  - 2024', 'JO  - Journal of Examples', 'DO  - 10.1000/example', 'AB  - Abstract text goes here.',
        'KW  - example', 'VL  - 12', 'IS  - 3', 'SP  - 101', 'EP  - 115', 'ER  - ', ''].join('\r\n'),
        'application/x-research-info-systems', 'slr_import_template.ris');
    }
  },

  loadSample() {
    const topics = ['federated learning', 'adversarial robustness', 'intrusion detection', 'explainable AI',
      'zero trust architecture', 'digital identity', 'anomaly detection', 'edge computing', 'threat intelligence',
      'privacy preserving analytics', 'graph neural networks', 'side channel analysis'];
    const contexts = ['in industrial control systems', 'for IoT networks', 'in cloud environments',
      'for critical infrastructure', 'in vehicular networks', 'under distribution shift',
      'for healthcare data', 'at the network edge', 'in smart grids'];
    const journals = ['IEEE Access', 'Computers & Security', 'Future Generation Computer Systems',
      'IEEE Transactions on Information Forensics and Security', 'Journal of Network and Computer Applications',
      'ACM Computing Surveys', 'Sensors', 'Applied Sciences'];
    const surnames = ['Chowdhury', 'Nguyen', 'Silva', 'Okafor', 'Takahashi', 'Muller', 'Rossi', 'Ahmed',
      'Kim', 'Petrov', 'Dubois', 'Haddad', 'Novak', 'Ferreira'];
    const dbs = ['Scopus', 'Web of Science', 'IEEE Xplore', 'PubMed', 'ACM Digital Library'];
    const rows = [];
    let seed = 20260919;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    for (let i = 0; i < 340; i++) {
      const t = `${pick(topics).replace(/^./, c => c.toUpperCase())} ${pick(contexts)}: a ${pick(['systematic', 'comparative', 'empirical', 'large-scale'])} ${pick(['study', 'evaluation', 'analysis', 'framework'])}`;
      rows.push({
        title: t,
        authors: `${pick(surnames)}, ${pick(['A', 'B', 'C', 'D'])}.; ${pick(surnames)}, ${pick(['E', 'F', 'G'])}.`,
        year: String(2018 + Math.floor(rnd() * 8)),
        journal: pick(journals),
        doi: rnd() > 0.25 ? `10.${1000 + Math.floor(rnd() * 8000)}/sample.${i}` : '',
        abstract: `This paper investigates ${pick(topics)} ${pick(contexts)}. We propose an approach and evaluate it against established baselines, reporting improvements in detection accuracy and computational overhead.`,
        keywords: `${pick(topics)}; ${pick(topics)}`,
        dbSource: pick(dbs)
      });
    }
    // Deliberate near-duplicates so detection has something to find.
    for (let i = 0; i < 60; i++) {
      const src = rows[Math.floor(rnd() * 300)];
      const variant = Object.assign({}, src);
      variant.dbSource = pick(dbs.filter(d => d !== src.dbSource));
      if (rnd() > 0.5) variant.title = src.title.replace(/:.*/, '') + ': ' + pick(['a systematic study', 'an empirical analysis', 'a comparative evaluation']);
      else variant.title = src.title.replace(/\s+/g, ' ').replace(/a /i, 'the ');
      if (rnd() > 0.6) variant.doi = '';
      rows.push(variant);
    }
    const batch = uid('batch');
    const added = rows.map(r => normaliseRecord(Object.assign({}, r, { id: uid('rec'), importBatch: batch })));
    mutate('import', `Loaded ${added.length} synthetic sample records for demonstration`, () => {
      State.records = State.records.concat(added);
      const bySource = {};
      added.forEach(r => { bySource[r.dbSource] = (bySource[r.dbSource] || 0) + 1; });
      Object.keys(bySource).forEach(name => {
        const ex = State.sources.find(s => s.name === name);
        if (ex) ex.count += bySource[name]; else State.sources.push({ id: uid('src'), name, count: bySource[name] });
      });
    });
    this._batches.push({ file: 'synthetic sample', kind: 'sample', source: 'mixed', count: added.length, at: nowISO() });
    this.finish();
  }
};

/* ── deduplication ─────────────────────────────────────────── */
const Dedup = {
  _cancel: false,
  _running: false,

  blockKeys(rec) {
    const keys = [];
    const t = normTitle(rec.title);
    const compact = t.replace(/ /g, '');
    if (compact.length >= 12) {
      keys.push('p:' + compact.slice(0, 10));
      keys.push('s:' + compact.slice(-10));
      const mid = Math.floor(compact.length / 2);
      keys.push('m:' + compact.slice(mid - 5, mid + 5));
    } else if (compact.length >= 4) {
      keys.push('p:' + compact);
    }
    const words = t.split(' ').filter(w => w.length > 4);
    if (words.length >= 2) {
      const sig = words.slice().sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).slice(0, 3).sort();
      keys.push('w:' + sig.join('|'));
    }
    const sur = firstAuthorSurname(rec.authors);
    if (sur && rec.year) keys.push('a:' + sur + ':' + rec.year);
    return keys;
  },

  progress(p, label) {
    const wrap = $('dedupProgressWrap');
    if (p === null) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    $('dedupProgressLabel').textContent = label || '';
    $('dedupProgressPct').textContent = Math.round(p) + '%';
    $('dedupProgressFill').style.width = p + '%';
  },

  cancel() { this._cancel = true; },

  async run() {
    if (this._running) return;
    if (!State.records.length) { toast('Import some records first', 'err'); return; }
    this._running = true; this._cancel = false;
    $('runDedupBtn').disabled = true;
    $('cancelDedupBtn').style.display = '';

    const strategy = $('dupStrategy').value;
    const threshold = num($('dupThreshold').value) || 88;
    const yearGuard = num($('dupYearGuard').value);
    State.settings.dupStrategy = strategy;
    State.settings.dupThreshold = threshold;
    State.settings.dupYearGuard = yearGuard;

    const recs = State.records;
    const n = recs.length;
    const t0 = performance.now();

    recs.forEach(r => { r.isDuplicate = false; r.dupGroup = null; r.dupScore = null; r.dupMethod = ''; });
    const dsu = makeDSU(n);
    let doiPairs = 0, titlePairs = 0, compared = 0, chainBlocked = 0;

    // Phase 1 — DOI exact
    this.progress(4, 'Phase 1 of 3 · matching DOIs');
    await yieldToUI();
    const doiMap = new Map();
    for (let i = 0; i < n; i++) {
      const d = recs[i].doi;
      if (!d) continue;
      if (doiMap.has(d)) { if (dsu.union(doiMap.get(d), i)) { doiPairs++; recs[i].dupMethod = 'doi'; } }
      else doiMap.set(d, i);
    }

    // Phase 2 — blocking
    let candidatePairs = [];
    if (strategy !== 'doi') {
      this.progress(12, 'Phase 2 of 3 · building candidate blocks');
      await yieldToUI();
      const blocks = new Map();
      const norm = new Array(n);
      for (let i = 0; i < n; i++) {
        norm[i] = normTitle(recs[i].title);
        for (const k of this.blockKeys(recs[i])) {
          let arr = blocks.get(k);
          if (!arr) { arr = []; blocks.set(k, arr); }
          arr.push(i);
        }
        if (i % 4000 === 0) await yieldToUI();
      }
      const seen = new Set();
      const MAX_BLOCK = 400; // a block this large is a bad key, not a cluster of duplicates
      for (const [key, idxs] of blocks) {
        if (idxs.length < 2 || idxs.length > MAX_BLOCK) continue;
        for (let a = 0; a < idxs.length; a++) {
          for (let b = a + 1; b < idxs.length; b++) {
            const i = idxs[a], j = idxs[b];
            const pk = i < j ? i * n + j : j * n + i;
            if (seen.has(pk)) continue;
            seen.add(pk);
            candidatePairs.push(i, j);
          }
        }
      }

      // Phase 3 — compare candidates only
      const totalPairs = candidatePairs.length / 2;
      for (let p = 0; p < candidatePairs.length; p += 2) {
        if (this._cancel) break;
        const i = candidatePairs[p], j = candidatePairs[p + 1];
        if (dsu.find(i) === dsu.find(j)) continue;
        const ri = recs[i], rj = recs[j];
        if (yearGuard < 99 && ri.year && rj.year && Math.abs(num(ri.year) - num(rj.year)) > yearGuard) continue;
        if (ri.doi && rj.doi && ri.doi !== rj.doi) continue; // distinct DOIs are distinct works
        compared++;
        const sim = titleSimilarity(norm[i], norm[j], threshold);
        if (sim >= threshold) {
          // Guard against transitive chaining. Union-find alone would merge A
          // with C whenever A~B and B~C, even where A and C are plainly
          // different papers, and on a large set those chains snowball into
          // enormous false groups. A record joins a group only if it also
          // matches that group's representative.
          const ri = dsu.find(i), rj2 = dsu.find(j);
          if (ri !== rj2 && !(ri === i && rj2 === j)) {
            if (titleSimilarity(norm[ri], norm[rj2], threshold) < threshold) { chainBlocked++; continue; }
          }
          dsu.union(i, j);
          titlePairs++;
          rj.dupScore = sim; rj.dupMethod = 'title';
        }
        if ((p / 2) % 900 === 0) {
          this.progress(15 + (p / 2 / Math.max(1, totalPairs)) * 80,
            `Phase 3 of 3 · comparing ${Math.round(p / 2).toLocaleString()} of ${Math.round(totalPairs).toLocaleString()} candidate pairs`);
          await yieldToUI();
        }
      }
    }

    // Assign groups and choose which record to keep
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = dsu.find(i);
      let arr = groups.get(root);
      if (!arr) { arr = []; groups.set(root, arr); }
      arr.push(i);
    }
    let gid = 1, dupCount = 0, largestGroup = 0;
    for (const [, members] of groups) {
      if (members.length < 2) continue;
      largestGroup = Math.max(largestGroup, members.length);
      const g = gid++;
      // Keep the richest record: DOI, then abstract, then longest title.
      members.sort((a, b) => {
        const ra = recs[a], rb = recs[b];
        const score = (r) => (r.doi ? 4 : 0) + (r.abstract ? 2 : 0) + (r.journal ? 1 : 0);
        return score(rb) - score(ra) || (rb.title || '').length - (ra.title || '').length;
      });
      members.forEach((idx, k) => {
        recs[idx].dupGroup = g;
        recs[idx].isDuplicate = k > 0;
        if (k > 0) dupCount++;
      });
    }

    const ms = Math.round(performance.now() - t0);
    this.progress(100, this._cancel ? 'Cancelled' : 'Complete');
    await yieldToUI();
    this.progress(null);
    $('runDedupBtn').disabled = false;
    $('cancelDedupBtn').style.display = 'none';
    this._running = false;

    const candidates = Math.round(candidatePairs.length / 2);
    const exhaustive = (n * (n - 1)) / 2;
    mutate('dedup', `Deduplication over ${n} records using ${strategy} at ${threshold}% similarity, year tolerance ${yearGuard === 99 ? 'ignored' : '±' + yearGuard}: ${doiPairs} DOI matches, ${titlePairs} title matches, ${dupCount} records flagged across ${gid - 1} groups (largest group ${largestGroup}). ${candidates.toLocaleString()} candidate pairs compared instead of ${exhaustive.toLocaleString()} exhaustive comparisons; ${chainBlocked} merges refused as transitive chains (${ms} ms).`, () => {
      State.meta.lastDedupAt = nowISO();
      const ov = State.prisma.overrides;
      if (ov.dupRemoved === undefined) ov.dupRemoved = dupCount;
    });

    const box = $('dupSummary');
    box.style.display = '';
    box.className = 'callout' + (dupCount ? ' warn' : '');
    box.innerHTML = this._cancel
      ? 'Detection cancelled. Partial results are shown; run it again for a complete pass.'
      : `<strong>${dupCount.toLocaleString()}</strong> of ${n.toLocaleString()} records flagged as duplicates
         across ${gid - 1} groups &mdash; ${doiPairs} by DOI, ${titlePairs} by title similarity at ${threshold}%.<br>
         <span class="mono" style="font-size:11.5px">Compared ${candidates.toLocaleString()} candidate pairs in ${ms} ms
         (an exhaustive pass would have been ${exhaustive.toLocaleString()}). Largest group ${largestGroup} records.</span><br>
         <span style="font-size:12px">Flagged records are not deleted. Sort by the duplicate filter below and check the groups before removing anything.
         ${largestGroup > 6 ? '<strong>A group of ' + largestGroup + ' records is unusually large &mdash; inspect it before removing, and consider raising the threshold.</strong>' : ''}</span>`;
    Records.render();
    UI.refreshCounts();
  }
};
</script>
