// @ts-nocheck
// ── Custom Report Builder (Reports redesign Phase 4, 2026-10-16) ─────────────────────────────
// Owner's ask, verbatim (memory/project-reports-redesign.md): "select the various metrics we
// have available... side-by-side to be able to build a custom report and save it out within the
// reporting system... under its own subtitled section of customized reporting." Built on
// ReportShell (Phase 2) exactly like Loss Prevention Summary (Phase 2's proof report) -- the
// only new piece is a dynamic metric picker (engine/custom-report.js's customReportCatalog, the
// Phase 1 reconciled catalog) instead of a fixed metric list, plus a saved/shared-definitions
// layer (schema-custom-reports.sql) above it.
//
// Sharing (owner decision 2, 2026-10-15): a definition marked shared is visible to everyone in
// the tenant (RLS), but only its author can edit/delete it — isOwner below gates Edit/Delete/
// the Shared toggle in the UI; RLS is the real enforcement, this is just not offering a control
// that would fail anyway.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS } from '../constants.js';
import { fP, f$, fN } from '../utils/fmt.js';
import { buildCustomReportRows, customReportCatalog, customReportMetricMeta } from '../engine/custom-report.js';
import { loadCustomReports, saveCustomReport, updateCustomReport, deleteCustomReport, supabase } from '../lib/supabase.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

function _fmt(v, unit) {
  if (v == null) return '—';
  if (unit === 'pct') return fP(v, 2);
  if (unit === '$') return f$(v);
  return fN(v, 2);
}

const _dshort = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
// A period's display label -- a single day shows once, a multi-day period shows its own
// start–end (which may be clipped short at either edge of the picked range; see
// splitRangeByGranularity's own clipping comment in engine/custom-report.js).
function _periodLabel(r) {
  if (!r.periodStart) return '';
  return r.periodStart === r.periodEnd ? _dshort(r.periodStart) : `${_dshort(r.periodStart)} – ${_dshort(r.periodEnd)}`;
}

const VIEW_AS_OPTIONS = [
  { id: 'range', label: 'Whole Range (total)' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));
const _label = (style) => (...children) => div({ style: { fontSize: '9px', color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', ...style } }, ...children);

export function CustomReportBuilderPanel({ ds, stores, can, onClose }) {
  const { useState, useEffect, useMemo } = React;
  const [uid, setUid] = useState(null);
  const [saved, setSaved] = useState(null); // null = loading
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [reportName, setReportName] = useState('');
  const [shareIt, setShareIt] = useState(false);
  const [editingId, setEditingId] = useState(null); // set -> Save updates this row instead of inserting a new one
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [groupBy, setGroupBy] = useState('range'); // 'range' | 'daily' | 'weekly' | 'monthly' -- owner ask 2026-10-17
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows);

  const catalog = useMemo(() => customReportCatalog(can), [can]);

  useEffect(() => {
    let live = true;
    loadCustomReports().then(r => { if (live) setSaved(r); }).catch(() => { if (live) setSaved([]); });
    (async () => { try { const u = (await supabase?.auth?.getUser())?.data?.user?.id || null; if (live) setUid(u); } catch {} })();
    return () => { live = false; };
  }, []);

  const refresh = async () => { try { setSaved(await loadCustomReports()); } catch { setSaved([]); } };

  const toggleKey = (key) => { setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]); setRows(null); };

  const loadDef = (def) => { setSelectedKeys(def.metricKeys); setReportName(def.name); setShareIt(def.shared); setEditingId(def.id); setRows(null); };
  const newReport = () => { setSelectedKeys([]); setReportName(''); setShareIt(false); setEditingId(null); setRows(null); };

  const saveAs = async () => {
    if (!reportName.trim() || !selectedKeys.length) return;
    setBusy(true); setMsg('');
    const payload = { name: reportName.trim(), metricKeys: selectedKeys, shared: shareIt };
    const r = editingId ? await updateCustomReport(editingId, payload) : await saveCustomReport(payload);
    if (r.error) { setMsg('Save failed — ' + r.error); }
    else {
      setMsg('Saved');
      if (!editingId && r.id) setEditingId(r.id);
      await refresh();
    }
    setBusy(false);
    setTimeout(() => setMsg(''), 2500);
  };

  const removeDef = async (id) => {
    setBusy(true);
    await deleteCustomReport(id);
    if (editingId === id) newReport();
    await refresh();
    setBusy(false);
  };

  const toggleShare = async (def) => {
    setBusy(true);
    await updateCustomReport(def.id, { shared: !def.shared });
    await refresh();
    setBusy(false);
  };

  const run = async ({ range, locs }) => {
    setRows(buildCustomReportRows(ds, { locs, range: { s: range.s, e: range.e }, metricKeys: selectedKeys, groupBy }));
  };

  const grouped = (rows || []).some(r => r.periodStart);
  const getExportData = () => ({
    title: reportName.trim() || 'Custom Report',
    headers: [...(grouped ? ['Period'] : []), 'Store', ...selectedKeys.map(k => customReportMetricMeta(k).label)],
    rows: (rows || []).map(r => [...(grouped ? [_periodLabel(r)] : []), r.name, ...selectedKeys.map(k => _fmt(r[k], customReportMetricMeta(k).unit))]),
  });

  const savedList = () => div(null,
    _label({})('Saved Custom Reports (' + ((saved || []).length) + ')' + (busy ? ' …' : '') + (msg ? ' · ' + msg : '')),
    saved == null ? div({ style: { fontSize: '11px', color: 'var(--text3)' } }, 'Loading…')
    : !saved.length ? div({ style: { fontSize: '11px', color: 'var(--text3)', padding: '8px 0' } }, 'No saved custom reports yet. Build one below.')
    : div({ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      ...saved.map(def => {
        const isOwner = uid && def.createdBy === uid;
        return div({ key: def.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: editingId === def.id ? 'var(--adim)' : 'var(--surf2)', border: '.5px solid ' + (editingId === def.id ? 'var(--amber)' : 'var(--bdr)'), borderRadius: 8 } },
          span({ style: { fontSize: 15 } }, '🧩'),
          div({ style: { flex: 1, minWidth: 0 } },
            div({ style: { fontSize: '11.5px', fontWeight: 700, color: 'var(--text)' } }, def.name),
            div({ style: { fontSize: '9px', color: 'var(--text3)' } },
              def.metricKeys.length + ' metric' + (def.metricKeys.length === 1 ? '' : 's') +
              (def.shared ? ' · 🔗 Shared' + (def.createdByLabel ? ' by ' + def.createdByLabel : '') : (isOwner ? ' · Private' : '')))),
          btn({ className: 'btn btn-sm btn-a', style: { fontSize: '10px', fontWeight: 700 }, onClick: () => loadDef(def) }, '▶ Load'),
          isOwner ? btn({ className: 'btn btn-sm', style: { fontSize: '10px' }, onClick: () => toggleShare(def) }, def.shared ? '🔗 Unshare' : '🔗 Share') : null,
          isOwner ? btn({ className: 'btn btn-sm', style: { fontSize: '10px', color: 'var(--text3)' }, onClick: () => removeDef(def.id), title: 'Delete' }, '🗑') : null);
      })));

  const picker = () => div(null,
    div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 } },
      _label({ marginBottom: 0 })('Build a report — pick metrics, side by side'),
      editingId ? btn({ className: 'btn btn-sm', style: { fontSize: '10px' }, onClick: newReport }, '＋ New (clear)') : null),
    selectedKeys.length ? div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 } },
      ...selectedKeys.map(k => btn({ key: k, onClick: () => toggleKey(k), className: 'btn btn-sm btn-a',
        style: { fontSize: '10px', fontWeight: 700 }, title: 'Remove' }, customReportMetricMeta(k).label + ' ✕')))
      : div({ style: { fontSize: '10px', color: 'var(--text3)', marginBottom: 10 } }, 'No metrics selected yet — pick from the categories below.'),
    div({ style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      ...catalog.map(cat => div({ key: cat.key },
        div({ style: { fontSize: '9px', fontWeight: 700, color: cat.color, marginBottom: 4 } }, cat.label),
        div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          ...cat.metrics.map(m => btn({ key: m.key, onClick: () => toggleKey(m.key),
            style: { padding: '3px 10px', fontSize: '10px', borderRadius: 999, cursor: 'pointer',
              border: '.5px solid ' + (selectedKeys.includes(m.key) ? 'var(--amber)' : 'var(--bdr)'),
              background: selectedKeys.includes(m.key) ? 'var(--adim)' : 'transparent',
              color: selectedKeys.includes(m.key) ? 'var(--amber)' : 'var(--text3)',
              fontWeight: selectedKeys.includes(m.key) ? 700 : 400 } },
            (selectedKeys.includes(m.key) ? '✓ ' : '') + m.label)))))));

  const saveForm = () => div({ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--bdr)', paddingTop: 10, marginTop: 4 } },
    h('input', { type: 'text', placeholder: 'Report name', value: reportName, onChange: e => setReportName(e.target.value),
      style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '5px 10px', flex: '1 1 200px' } }),
    h('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', color: 'var(--text3)', cursor: 'pointer' } },
      h('input', { type: 'checkbox', checked: shareIt, onChange: e => setShareIt(e.target.checked) }), '🔗 Share with everyone'),
    btn({ className: 'btn btn-a', style: { fontSize: '11px', fontWeight: 700 }, disabled: busy || !reportName.trim() || !selectedKeys.length, onClick: saveAs },
      editingId ? '💾 Save Changes' : '💾 Save As New'));

  const td2 = (v) => td({ style: { padding: '5px 8px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', textAlign: 'right' } }, v);

  const viewAsControl = () => div({ style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
    span({ style: { fontSize: '10px', color: 'var(--text3)', fontWeight: 600 } }, 'View As'),
    h('select', {
      value: groupBy, onChange: e => { setGroupBy(e.target.value); setRows(null); },
      title: 'How to break out the picked date range -- the window itself (Date Range above) is unchanged; this only controls whether it reports as one total or split into days/weeks/months.',
      style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '10.5px', padding: '4px 8px' },
    }, ...VIEW_AS_OPTIONS.map(o => h('option', { key: o.id, value: o.id }, o.label))),
    rows == null ? null : span({ style: { fontSize: '9.5px', color: 'var(--text3)' } }, '(Run Report again after changing this)'));

  const resultsTable = () => rows == null
    ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 20, fontSize: '11px' } }, selectedKeys.length ? 'Choose a date range and location, then Run Report.' : 'Pick at least one metric above, then Run Report.')
    : !rows.length
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 20, fontSize: '11px' } }, 'No stores matched this selection.')
      : div({ style: { overflowX: 'auto' } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 400 + selectedKeys.length * 110 } },
          h('thead', null, h('tr', null,
            grouped ? h(SortTh, { label: 'Period', colKey: 'periodStart', sortKey, sortDir, onSort }) : null,
            h(SortTh, { label: 'Store', colKey: 'name', sortKey, sortDir, onSort, style: { position: 'sticky', left: 0, background: 'var(--surf)' } }),
            ...selectedKeys.map(k => h(SortTh, { key: k, label: customReportMetricMeta(k).label, colKey: k, sortKey, sortDir, onSort, align: 'right' })))),
          h('tbody', null, ...sorted.map((r, i) => tr({ key: r.loc + (r.periodStart || ''), style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
            grouped ? td({ style: { padding: '5px 8px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, _periodLabel(r)) : null,
            td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, r.name),
            ...selectedKeys.map(k => td2(_fmt(r[k], customReportMetricMeta(k).unit))))))));

  return h(ReportShell, {
    title: 'Custom Report Builder', icon: '🧩', onBack: onClose,
    subtitlePrefix: 'Pick any metrics, side by side, over a date range and scope — save and share',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { display: 'flex', flexDirection: 'column', gap: 18 } },
      savedList(),
      div({ style: { borderTop: '1px solid var(--bdr)', paddingTop: 12 } }, picker(), saveForm()),
      div({ style: { borderTop: '1px solid var(--bdr)', paddingTop: 12 } }, viewAsControl(), resultsTable()),
    ),
  );
}
