<script>
'use strict';
/* ════════════════════════════════════════════════════════════════
   SLR WORKBENCH v2 — core: utilities, state, storage, audit
   ════════════════════════════════════════════════════════════════ */

const SCHEMA_VERSION = 2;
const APP_VERSION = '2.0.0';

/* ── utilities ─────────────────────────────────────────────── */
const $  = (id) => document.getElementById(id);
const el = (sel, root) => (root || document).querySelector(sel);
const els = (sel, root) => Array.from((root || document).querySelectorAll(sel));

let _uidCounter = 0;
function uid(prefix) {
  _uidCounter += 1;
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + _uidCounter.toString(36);
}
function nowISO() { return new Date().toISOString(); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function num(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function pct(a, b) { return b > 0 ? Math.round((a / b) * 1000) / 10 : 0; }
function debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(self, args), ms);
  };
}
function yieldToUI() { return new Promise(r => setTimeout(r, 0)); }
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtRelative(iso) {
  if (!iso) return 'never';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return secs + 's ago';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
  return fmtDateTime(iso).slice(0, 10);
}
function downloadBlob(content, mime, filename) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows) {
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

/* ── toast ─────────────────────────────────────────────────── */
function toast(msg, kind) {
  const host = $('toastHost');
  if (!host) return;
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

/* ── state ─────────────────────────────────────────────────── */
const REVIEWER_COLOURS = ['#2a7f7f', '#c8a96e', '#5a3e8a', '#4a7a5a', '#d4604a', '#8a6f3f', '#4fb3b3', '#9b7fd4'];
const STAGES = ['title', 'abstract', 'fulltext'];
const STAGE_LABEL = { title: 'Title screening', abstract: 'Abstract screening', fulltext: 'Full-text eligibility' };

function blankState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    project: {
      id: uid('pj'),
      title: 'Untitled Review',
      reviewType: 'systematic',
      framework: 'PICO',
      question: '',
      registration: '',
      lastSearchDate: '',
      created: nowISO(),
      modified: nowISO()
    },
    reviewers: [],
    activeReviewerId: null,
    blinded: false,
    records: [],
    sources: [],
    otherSources: [],
    reasons: [],
    searchRows: [],
    prisma: { overrides: {}, showOtherArm: false },
    checklist: null,
    audit: [],
    settings: { dupThreshold: 88, dupStrategy: 'hybrid', dupYearGuard: 1, autosave: true },
    meta: { lastSavedAt: null, lastDedupAt: null }
  };
}

let State = blankState();

/* Every field a record carries. Anything absent is filled on load so that
   older project files keep working without special-case checks downstream. */
function normaliseRecord(r) {
  const rec = {
    id: r.id || uid('rec'),
    title: r.title || '',
    authors: r.authors || '',
    year: r.year || '',
    journal: r.journal || '',
    doi: (r.doi || '').toString().trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, ''),
    abstract: r.abstract || '',
    keywords: r.keywords || '',
    volume: r.volume || '', issue: r.issue || '', pages: r.pages || '',
    publisher: r.publisher || '', url: r.url || '', type: r.type || '',
    dbSource: r.dbSource || r.source || '',
    importBatch: r.importBatch || '',
    importedAt: r.importedAt || nowISO(),
    isDuplicate: !!r.isDuplicate,
    dupGroup: r.dupGroup || null,
    dupScore: r.dupScore || null,
    dupMethod: r.dupMethod || '',
    decisions: r.decisions || { title: {}, abstract: {}, fulltext: {} },
    resolved: r.resolved || { title: null, abstract: null, fulltext: null },
    exclusionReason: r.exclusionReason || { title: '', abstract: '', fulltext: '' },
    studyId: r.studyId || null,
    notes: r.notes || ''
  };
  STAGES.forEach(s => {
    if (!rec.decisions[s]) rec.decisions[s] = {};
    if (!(s in rec.resolved)) rec.resolved[s] = null;
    if (!(s in rec.exclusionReason)) rec.exclusionReason[s] = '';
  });
  return rec;
}

function migrateState(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a project file');
  let s = raw;
  const v = s.schemaVersion || 1;
  if (v > SCHEMA_VERSION) {
    throw new Error('This file was made by a newer version of the tool (schema ' + v + ').');
  }
  if (v < 2) {
    // v1 files stored flat screenTitle/screenAbstract/screenFulltext strings
    // with no reviewer attribution. Those decisions are carried across and
    // attributed to a placeholder reviewer so nothing is silently lost.
    const legacy = { id: 'legacy_reviewer', name: 'Imported (v1)', initials: 'V1', colour: REVIEWER_COLOURS[5] };
    const base = blankState();
    base.project.title = s.projectTitle || base.project.title;
    base.reviewers = [legacy];
    base.activeReviewerId = legacy.id;
    base.records = (s.papers || s.records || []).map(p => {
      const rec = normaliseRecord(p);
      const map = { include: 'include', exclude: 'exclude', maybe: 'maybe' };
      [['screenTitle', 'title'], ['screenAbstract', 'abstract'], ['screenFulltext', 'fulltext']].forEach(([old, stage]) => {
        const val = map[p[old]];
        if (val) { rec.decisions[stage][legacy.id] = val; rec.resolved[stage] = val; }
      });
      if (p.screenExclusionReason) rec.exclusionReason.fulltext = p.screenExclusionReason;
      return rec;
    });
    base.sources = (s.sources || []).map(x => ({ id: uid('src'), name: x.name || '', count: num(x.count) }));
    base.reasons = (s.reasons || []).map(x => ({ id: uid('rsn'), reason: x.reason || '', count: num(x.count) }));
    base.audit = [{ id: uid('a'), at: nowISO(), actor: 'system', action: 'project', detail: 'Migrated project from schema v1 to v2' }];
    return base;
  }
  // current schema: fill any gaps
  const base = blankState();
  s = Object.assign(base, s);
  s.project = Object.assign(base.project, raw.project || {});
  s.settings = Object.assign(base.settings, raw.settings || {});
  s.prisma = Object.assign(base.prisma, raw.prisma || {});
  s.meta = Object.assign(base.meta, raw.meta || {});
  s.records = (raw.records || []).map(normaliseRecord);
  s.reviewers = raw.reviewers || [];
  s.audit = raw.audit || [];
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

/* ── audit ─────────────────────────────────────────────────── */
const AUDIT_CAP = 4000;
function logAudit(action, detail, actorOverride) {
  const actor = actorOverride || (Reviewers.active() ? Reviewers.active().name : 'unattributed');
  State.audit.push({ id: uid('a'), at: nowISO(), actor, action, detail: String(detail) });
  if (State.audit.length > AUDIT_CAP) {
    const dropped = State.audit.length - AUDIT_CAP;
    State.audit = State.audit.slice(dropped);
    State.audit.unshift({ id: uid('a'), at: nowISO(), actor: 'system', action: 'project',
      detail: dropped + ' older entries were trimmed to keep the log bounded' });
  }
}

/* Single funnel for every change: mutate the state, log it, mark dirty,
   schedule the autosave, and let the caller re-render. */
function mutate(action, detail, fn) {
  const result = fn ? fn() : undefined;
  State.project.modified = nowISO();
  if (action) logAudit(action, detail);
  Store.markDirty();
  return result;
}

const Audit = {
  render() {
    const filter = $('auditFilter') ? $('auditFilter').value : 'all';
    const rows = State.audit.filter(a => filter === 'all' || a.action === filter).slice().reverse();
    const body = $('auditBody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4"><div class="empty"><div class="empty-title">No activity yet</div><div>Actions you take are recorded here.</div></div></td></tr>';
      $('auditFooter').textContent = '';
      return;
    }
    const shown = rows.slice(0, 600);
    body.innerHTML = shown.map(a =>
      `<tr><td class="mono" style="font-size:11px;white-space:nowrap">${esc(fmtDateTime(a.at))}</td>
       <td style="font-size:11.5px">${esc(a.actor)}</td>
       <td><span class="badge b-teal">${esc(a.action)}</span></td>
       <td style="font-size:12px;line-height:1.5">${esc(a.detail)}</td></tr>`).join('');
    $('auditFooter').textContent = shown.length < rows.length
      ? `Showing the most recent ${shown.length} of ${rows.length} entries. Export for the full log.`
      : `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`;
  },
  export() {
    const rows = [['Timestamp', 'Actor', 'Action', 'Detail']];
    State.audit.forEach(a => rows.push([a.at, a.actor, a.action, a.detail]));
    downloadBlob(toCSV(rows), 'text/csv;charset=utf-8', Project.slug() + '_audit_log.csv');
    toast('Audit log exported', 'ok');
  }
};

/* ── storage: IndexedDB with a localStorage fallback ───────── */
const Store = (function () {
  const DB_NAME = 'slr_workbench';
  const DB_VERSION = 1;
  const STORE = 'projects';
  const LS_KEY = 'slr_workbench_project';
  const SLOT = 'current';

  let db = null;
  let backend = 'none';
  let dirty = false;
  let saving = false;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'slot' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  function idbPut(value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }
  function idbGet(slot) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(slot);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbDelete(slot) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(slot);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function setStatus(kind, text) {
    const dot = $('saveDot'), txt = $('saveText');
    if (!dot || !txt) return;
    dot.className = 'save-dot' + (kind ? ' ' + kind : '');
    txt.textContent = text;
  }

  const scheduleSave = debounce(() => { api.saveNow(); }, 1400);

  const api = {
    async init() {
      try {
        db = await openDB();
        backend = 'indexeddb';
      } catch (e) {
        try {
          localStorage.setItem('__slr_probe', '1');
          localStorage.removeItem('__slr_probe');
          backend = 'localstorage';
        } catch (e2) {
          backend = 'none';
        }
      }
      this.describe();
      return backend;
    },
    backend() { return backend; },
    describe() {
      const box = $('storageStatus');
      if (!box) return;
      const msgs = {
        indexeddb: ['', 'Using IndexedDB in this browser. Large reviews save without hitting a size ceiling.'],
        localstorage: ['warn', 'IndexedDB is unavailable, so the tool has fallen back to localStorage. That has a size limit of roughly 5&nbsp;MB, which a few thousand records with abstracts can exceed. Export a .slrproj file regularly.'],
        none: ['warn', 'No browser storage is available, most likely because this page is open in a private window or storage is blocked. Nothing will be saved automatically. Use <span class="mono">Save .slrproj</span> before you close this tab.']
      };
      const [cls, text] = msgs[backend] || msgs.none;
      box.className = 'callout' + (cls ? ' ' + cls : '');
      box.innerHTML = text;
    },
    setAutosave(on) {
      State.settings.autosave = !!on;
      if (on && dirty) scheduleSave();
      setStatus(dirty ? 'dirty' : '', on ? (dirty ? 'Unsaved' : 'Saved') : 'Autosave off');
    },
    markDirty() {
      dirty = true;
      setStatus('dirty', 'Unsaved');
      if (State.settings.autosave) scheduleSave();
    },
    isDirty() { return dirty; },
    async saveNow() {
      if (backend === 'none') { setStatus('error', 'No storage'); return false; }
      if (saving) return false;
      saving = true;
      setStatus('saving', 'Saving');
      const payload = { slot: SLOT, savedAt: nowISO(), state: JSON.parse(JSON.stringify(State)) };
      try {
        if (backend === 'indexeddb') await idbPut(payload);
        else localStorage.setItem(LS_KEY, JSON.stringify(payload));
        dirty = false;
        State.meta.lastSavedAt = payload.savedAt;
        setStatus('', 'Saved');
        UI.refreshProjectStats();
        return true;
      } catch (e) {
        const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
        setStatus('error', quota ? 'Storage full' : 'Save failed');
        toast(quota
          ? 'Browser storage is full. Save a .slrproj file now to avoid losing work.'
          : 'Could not save to the browser: ' + (e && e.message ? e.message : 'unknown error'), 'err');
        return false;
      } finally {
        saving = false;
      }
    },
    async load() {
      if (backend === 'none') return null;
      try {
        let payload;
        if (backend === 'indexeddb') payload = await idbGet(SLOT);
        else {
          const raw = localStorage.getItem(LS_KEY);
          payload = raw ? JSON.parse(raw) : null;
        }
        return payload && payload.state ? payload : null;
      } catch (e) { return null; }
    },
    async clearBrowser() {
      const ok = await UI.confirm('Clear the browser copy?',
        'This removes the autosaved copy from this browser. Anything you have not exported as a .slrproj file will be gone. The review currently open stays on screen until you reload.');
      if (!ok) return;
      try {
        if (backend === 'indexeddb') await idbDelete(SLOT);
        else localStorage.removeItem(LS_KEY);
        dirty = true;
        setStatus('dirty', 'Not saved');
        toast('Browser copy cleared', 'ok');
      } catch (e) { toast('Could not clear storage', 'err'); }
    }
  };
  return api;
})();

/* ── modal + generic UI helpers ────────────────────────────── */
const UI = {
  _resolve: null,
  openModal(title, bodyHTML, footerHTML, opts) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = bodyHTML;
    $('modalFooter').innerHTML = footerHTML || '';
    $('modalBox').className = 'modal' + (opts && opts.wide ? ' wide' : '');
    $('modalBack').classList.add('open');
  },
  closeModal(value) {
    $('modalBack').classList.remove('open');
    if (this._resolve) { const r = this._resolve; this._resolve = null; r(value === true); }
  },
  confirm(title, message, confirmLabel) {
    return new Promise(resolve => {
      this._resolve = resolve;
      this.openModal(title, `<p style="line-height:1.65">${message}</p>`,
        `<button class="btn btn-ghost-ink" onclick="UI.closeModal(false)">Cancel</button>
         <button class="btn btn-coral" onclick="UI.closeModal(true)">${esc(confirmLabel || 'Continue')}</button>`);
    });
  },
  openProjectFile() { $('projFileInput').click(); },
  refreshProjectStats() {
    if ($('pjStatRecords')) $('pjStatRecords').textContent = State.records.length.toLocaleString();
    if ($('pjStatSchema')) $('pjStatSchema').textContent = 'v' + State.schemaVersion;
    if ($('pjStatSaved')) $('pjStatSaved').textContent = fmtRelative(State.meta.lastSavedAt);
    if ($('hdrProjectTitle')) $('hdrProjectTitle').textContent = State.project.title || 'Untitled Review';
  },
  activeTab: 'tab-project',
  switchTab(id) {
    els('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
    els('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    this.activeTab = id;
    const onShow = {
      'tab-project': () => Project.renderForm(),
      'tab-import': () => Records.render(),
      'tab-screen': () => Screen.render(),
      'tab-agree': () => Agreement.render(),
      'tab-search': () => SearchRec.render(),
      'tab-data': () => Prisma.renderForm(),
      'tab-diagram': () => Diagram.render(),
      'tab-analytics': () => Analytics.render(),
      'tab-checklist': () => Checklist.render(),
      'tab-audit': () => Audit.render()
    };
    if (onShow[id]) onShow[id]();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  refreshCounts() {
    const unique = State.records.filter(r => !r.isDuplicate).length;
    const conflicts = Agreement.conflictRecords().length;
    const chk = Checklist.progress();
    if ($('tc-import')) $('tc-import').textContent = State.records.length;
    if ($('tc-screen')) $('tc-screen').textContent = unique;
    if ($('tc-agree')) {
      $('tc-agree').textContent = conflicts;
      $('tc-agree').className = 'tab-count' + (conflicts ? ' alert' : '');
    }
    if ($('tc-check')) $('tc-check').textContent = chk.done + '/' + chk.total;
    this.refreshProjectStats();
  }
};
</script>
