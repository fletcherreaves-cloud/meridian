// @ts-nocheck
// ── Digital Checklists ────────────────────────────────────────────────────────
// Fillable, cloud-saved version of the QSRSoft Printable Forms Library (every
// published form public/forms/*.json — scripts/qsrsoft-forms-pull.mjs). Owner
// request, 2026-09-01: "build an actual in-app fillable checklist panel (replaces
// paper pre-shift/cleanliness checklists with a real Meridian workflow, saved to
// Supabase)" — distinct from src/views/forms-print.js, which stays the existing
// blank/print-by-hand version (untouched by this file).
//
// One panel-agnostic renderer drives every form: normalizeForm()'s item shape
// (kind: 'check' | 'field' | 'text' — src/engine/forms-model.js) is generic
// across the whole library, not just Pre-Shift/Travel Path, so no per-form UI is
// needed here, matching the same "zero per-consumer wiring" design already used
// for the app-wide screenshot Share button.
//
// Items have no stable id in the raw QSRSoft payload — responseKey() below keys
// on "<sectionIndex>::<itemTitle>", the same identifier a human filling the form
// would recognize, and the same convention supabase/schema-checklist-submissions.sql
// documents for the `responses` jsonb column.
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector, buildLocationHierarchy } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS } from '../constants.js';
import { businessDate } from '../utils/date.js';
import { normalizeForm, sectionColor, CARD_COLOR } from '../engine/forms-model.js';
import { loadChecklistSubmission, saveChecklistSubmission } from '../lib/supabase.js';

const h = React.createElement;
const { useMemo, useState, useEffect, useCallback } = React;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const EMPTY_STORES = [];

function asModel(json, meta) {
  if (Array.isArray(json)) return normalizeForm(json, meta);
  if (json && Array.isArray(json.sections)) return json;
  if (json && Array.isArray(json.questions)) return normalizeForm(json.questions, { ...meta, ...json });
  return normalizeForm([], meta);
}

export function responseKey(sectionIdx, title) {
  return `${sectionIdx}::${String(title || '').trim()}`;
}

export function ChecklistFillPanel({ onClose, stores, initialSlug }) {
  const [index, setIndex] = useState(null);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null);
  const [model, setModel] = useState(null);
  const [loadingForm, setLoadingForm] = useState(false);

  const treeStores = stores || EMPTY_STORES;
  const tree = useMemo(() => buildLocationHierarchy(treeStores, INV_ORG_COORDS, STORE_NAMES), [treeStores]);
  const [loc, setLoc] = useState(null);
  const [date, setDate] = useState(() => businessDate(new Date()));
  const [responses, setResponses] = useState({});
  const [status, setStatus] = useState('in_progress');
  const [saveState, setSaveState] = useState(null); // null|loading|saving|saved|submitted|error
  const [saveErr, setSaveErr] = useState(null);

  // Load the manifest of every pulled form.
  useEffect(() => {
    let live = true;
    fetch('/forms/index.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('index ' + r.status))))
      .then(rows => {
        if (!live) return;
        const list = Array.isArray(rows) ? rows : (rows.forms || []);
        setIndex(list);
        if (initialSlug) { const hit = list.find(r => r.slug === initialSlug); if (hit) setSel(hit); }
      })
      .catch(e => { if (live) { setErr(e.message); setIndex([]); } });
    return () => { live = false; };
  }, [initialSlug]);

  // Load + normalize the selected form.
  useEffect(() => {
    if (!sel) { setModel(null); return; }
    let live = true;
    setLoadingForm(true); setModel(null); setResponses({}); setStatus('in_progress');
    fetch(`/forms/${sel.slug}.json`, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('form ' + r.status))))
      .then(json => { if (live) setModel(asModel(json, sel)); })
      .catch(e => { if (live) setErr(e.message); })
      .finally(() => { if (live) setLoadingForm(false); });
    return () => { live = false; };
  }, [sel]);

  // Load any existing submission for this exact (store, form, date).
  useEffect(() => {
    if (!sel || !loc || !date) return;
    let live = true;
    setSaveState('loading'); setSaveErr(null);
    loadChecklistSubmission({ loc, formId: sel.formId, businessDate: date }).then(row => {
      if (!live) return;
      setResponses(row?.responses || {});
      setStatus(row?.status || 'in_progress');
      setSaveState(null);
    }).catch(() => { if (live) setSaveState(null); });
    return () => { live = false; };
  }, [sel, loc, date]);

  const setValue = useCallback((key, value) => {
    setResponses(prev => ({ ...prev, [key]: { ...(prev[key] || {}), value } }));
  }, []);

  const onSave = useCallback(async (nextStatus) => {
    if (!sel || !loc || !date) return;
    setSaveState('saving'); setSaveErr(null);
    const r = await saveChecklistSubmission({
      loc, formId: sel.formId, formSlug: sel.slug, formTitle: sel.title,
      businessDate: date, responses, status: nextStatus,
    });
    if (r.saved) { setStatus(nextStatus); setSaveState(nextStatus === 'submitted' ? 'submitted' : 'saved'); }
    else { setSaveState('error'); setSaveErr(r.error); }
  }, [sel, loc, date, responses]);

  const groups = useMemo(() => {
    const g = {};
    for (const row of (index || [])) {
      const k = row.category || 'Forms';
      (g[k] || (g[k] = [])).push(row);
    }
    for (const k in g) g[k].sort((a, b) => String(a.title).localeCompare(b.title));
    return g;
  }, [index]);

  return h(RoutePanelShell, {
    title: '✅ Digital Checklists',
    subtitle: 'Fill any QSRSoft shift/operations checklist in-app — saved to Supabase per store and day',
    onBack: onClose,
    bodyStyle: { padding: 0, display: 'flex', overflow: 'hidden' },
  },
    // ── Left: form picker ──
    div({ style: { width: 280, flex: 'none', borderRight: '1px solid var(--bdr)', overflowY: 'auto', overflowX: 'hidden', padding: 10, background: 'var(--surf)' } },
      index == null
        ? div({ style: { color: 'var(--text2)', fontSize: 12, padding: 10 } }, 'Loading forms…')
        : (index.length === 0
          ? div({ style: { color: 'var(--text2)', fontSize: 12, padding: 10, lineHeight: 1.5 } },
              div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: 4 } }, 'No forms captured yet'),
              'Run the pull: node scripts/qsrsoft-forms-pull.mjs',
              err ? div({ style: { marginTop: 8, color: 'var(--warn,#f59e0b)' } }, 'Note: ' + err) : null,
            )
          : Object.keys(groups).sort().map(cat =>
              div({ key: cat, style: { marginBottom: 12 } },
                div({ style: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', margin: '2px 4px 6px' } }, cat),
                groups[cat].map(row =>
                  h('button', {
                    key: row.slug,
                    onClick: () => setSel(row),
                    style: {
                      display: 'block', width: '100%', textAlign: 'left', marginBottom: 4,
                      padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                      border: '1px solid ' + (sel && sel.slug === row.slug ? 'var(--accent,#f5bc00)' : 'var(--bdr)'),
                      background: sel && sel.slug === row.slug ? 'var(--accent-dim,rgba(245,188,0,.12))' : 'var(--bg)',
                      color: 'var(--text)', fontWeight: sel && sel.slug === row.slug ? 700 : 500,
                    },
                  },
                    div({}, row.title),
                    row.itemCount ? div({ style: { fontSize: 10, color: 'var(--text2)', marginTop: 1 } }, row.itemCount + ' items') : null,
                  ),
                ),
              ),
            )),
    ),
    // ── Right: fill form ──
    div({ style: { flex: 1, overflowY: 'auto', overflowX: 'auto', padding: 16, minWidth: 0 } },
      !sel
        ? div({ style: { color: 'var(--text2)', fontSize: 13, padding: 24, textAlign: 'center' } }, 'Select a form to fill it in.')
        : div({},
            div({ style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 } },
              h(LocationSelector, { stores: treeStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, mode: 'store', value: loc ? { level: 'store', id: loc } : { level: 'all', id: null }, onChange: v => setLoc(v.id || null) }),
              h('input', {
                type: 'date', value: date, onChange: e => setDate(e.target.value),
                style: { padding: '6px 9px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', fontSize: 12 },
              }),
            ),
            !loc
              ? div({ style: { color: 'var(--warn,#f59e0b)', fontSize: 12, padding: '10px 0' } }, 'Pick a store above to fill this checklist.')
              : (loadingForm
                ? div({ style: { color: 'var(--text2)', fontSize: 12 } }, 'Loading ' + sel.title + '…')
                : (model
                  ? h(FillForm, { model, responses, setValue, status, saveState, saveErr, onSave })
                  : div({ style: { color: 'var(--warn,#f59e0b)', fontSize: 12 } }, 'Could not load this form' + (err ? ': ' + err : '.')))),
          ),
    ),
  );
}

const SAVE_LABEL = { loading: 'Loading…', saving: 'Saving…', saved: '✓ Draft saved', submitted: '✓ Submitted', error: 'Save failed' };

function FillForm({ model, responses, setValue, status, saveState, saveErr, onSave }) {
  const btn = { padding: '7px 14px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700 };
  const primary = { ...btn, border: '1px solid var(--accent,#f5bc00)', background: 'var(--accent,#f5bc00)', color: '#111' };
  return div({},
    div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' } },
      div({},
        div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } }, model.title),
        div({ style: { fontSize: 11, color: 'var(--text2)', marginTop: 2 } },
          `${model.itemCount} items · ${(model.sections || []).length} sections`
          + (status === 'submitted' ? ' · Submitted' : ' · Draft')),
      ),
      div({ style: { display: 'flex', gap: 6, alignItems: 'center' } },
        saveState && span({ style: { fontSize: 11, color: saveState === 'error' ? 'var(--crit,#ef4444)' : 'var(--text2)' } },
          saveState === 'error' ? `Save failed${saveErr ? ': ' + saveErr : ''}` : SAVE_LABEL[saveState] || ''),
        h('button', { onClick: () => onSave('in_progress'), style: btn, disabled: saveState === 'saving' }, 'Save Draft'),
        h('button', { onClick: () => onSave('submitted'), style: primary, disabled: saveState === 'saving' }, 'Submit'),
      ),
    ),
    (model.sections || []).map((sec, si) => {
      const c = sectionColor(sec.color);
      return div({ key: si, style: { marginBottom: 12 } },
        sec.title ? div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: c.fg, background: c.bg, padding: '5px 9px', borderRadius: 4, marginBottom: 5 } }, sec.title) : null,
        (sec.items || []).map((it, ii) => h(FillItem, { key: ii, it, rkey: responseKey(si, it.title), value: responses[responseKey(si, it.title)]?.value, onChange: v => setValue(responseKey(si, it.title), v) })),
      );
    }),
  );
}

function FillItem({ it, rkey, value, onChange }) {
  const card = { background: CARD_COLOR.bg, color: CARD_COLOR.fg, borderRadius: 6, padding: '7px 9px', marginBottom: 5 };
  const title = { fontWeight: 600, marginBottom: 5, fontSize: 12.5 };
  const optRow = (selected) => ({
    background: selected ? 'var(--accent,#f5bc00)' : '#fff', color: '#111',
    border: '1px solid ' + (selected ? 'var(--accent,#f5bc00)' : '#cbd2e0'), borderRadius: 4,
    padding: '5px 9px', marginTop: 3, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
    cursor: 'pointer', fontWeight: selected ? 700 : 400,
  });
  const circle = (selected) => ({ width: 12, height: 12, border: '1.5px solid #333', borderRadius: '50%', flex: 'none', display: 'inline-block', background: selected ? '#111' : 'transparent' });

  if (it.kind === 'check') {
    const opts = (it.options && it.options.length ? it.options : ['Complete', 'Needs Action', 'Action Taken']);
    return div({ style: card },
      div({ style: title }, it.title),
      opts.map((o, i) => div({
        key: i, onClick: () => onChange(o), style: optRow(value === o),
      }, span({ style: circle(value === o) }), o)),
    );
  }
  if (it.kind === 'field') {
    return div({ style: card },
      div({ style: title }, it.title),
      h('input', {
        type: it.field === 'time' ? 'time' : 'date', value: value || '', onChange: e => onChange(e.target.value),
        style: { background: '#fff', color: '#111', border: 'none', borderRadius: 4, height: 26, padding: '0 6px', maxWidth: it.field === 'time' ? 110 : 160, fontSize: 12 },
      }),
    );
  }
  const lines = Math.max(1, it.lines || 1);
  return div({ style: card },
    div({ style: title }, it.title),
    lines > 1
      ? h('textarea', {
          value: value || '', onChange: e => onChange(e.target.value), rows: lines,
          style: { width: '100%', background: '#fff', color: '#111', border: 'none', borderRadius: 4, padding: '4px 6px', fontSize: 12, resize: 'vertical', fontFamily: 'inherit' },
        })
      : h('input', {
          type: 'text', value: value || '', onChange: e => onChange(e.target.value),
          style: { width: '100%', background: '#fff', color: '#111', border: 'none', borderRadius: 4, height: 26, padding: '0 6px', fontSize: 12 },
        }),
  );
}
