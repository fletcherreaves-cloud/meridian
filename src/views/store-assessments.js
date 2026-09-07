// @ts-nocheck
// Store Assessments — manual per-store rating tracker (Staged Experiments / Risk Tracking).
// Replaces a table that never existed: backlog-master-2026-08-19.md §12 / backlog-open-
// 2026-09-06.md §12 tracked an "8/20 scheduling-workshop stores rated" progress figure
// against `store_assessments`, which had zero references anywhere in the repo — settled
// 2026-09-07 via a live service-role read (PGRST205, table never created). The figure lived
// only in the owner's own tracking; this is the real table (supabase/schema-store-
// assessments.sql) plus the panel that reads/writes it.
//
// Deliberately generic (assessmentType, default 'scheduling-workshop') rather than hardcoded
// to a specific 20-store cohort — the backlog item's own workshop membership isn't recorded
// anywhere in code, so this tracks EVERY store in the current location scope, same as every
// other panel's LocationSelector-driven scoping. A store not part of a given rating program
// simply stays "pending" until someone rates it, which costs nothing to show.
import * as React from 'react';
import { STORE_NAMES, INV_ORG_COORDS } from '../constants.js';
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { loadStoreAssessments, saveStoreAssessment } from '../lib/supabase.js';
import { withAlpha } from '../utils/fmt.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

export const locNum = s => { const n = parseInt(s, 10); return Number.isNaN(n) ? String(s == null ? '' : s) : String(n); };
const storeName = s => STORE_NAMES[locNum(s)] || locNum(s);
const niceDate = iso => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

const STATUS_COLOR = { rated: '#10b981', pending: '#f59e0b' };
const STATUS_LABEL = { rated: 'Rated', pending: 'Pending' };

// Pure: every store in `scopedLocs`, joined against its assessment row (or a default 'pending'
// stand-in). Extracted for direct unit testing, same reasoning as filterComplaintCases in
// customer-complaints.js — this suite runs Vitest under `node`, not jsdom, so the logic that
// decides what shows is what's tested, not the render. Sorted pending-first (the actionable
// ones), then alphabetically by store name within each status.
export function mergeAssessmentRows(scopedLocs, assessments) {
  const byLoc = {};
  for (const a of (assessments || [])) byLoc[locNum(a.loc)] = a;
  const locs = Array.from(scopedLocs || []);
  return locs.map(loc => byLoc[loc] || { loc, status: 'pending', rating: null, assessedDate: null, assessedBy: null, dueDate: null, notes: null })
    .sort((a, b) => (a.status === b.status ? storeName(a.loc).localeCompare(storeName(b.loc)) : a.status === 'pending' ? -1 : 1));
}

// Pure: rated/total/pct for the progress card.
export function assessmentProgress(rows) {
  const total = (rows || []).length;
  const rated = (rows || []).filter(r => r.status === 'rated').length;
  return { rated, total, pct: total ? Math.round((rated / total) * 100) : 0 };
}

const card = (label, value, color) => div({ style: { flex: '1 1 100px', minWidth: 100, background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '9px 12px' } },
  div({ style: { fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 } }, label),
  div({ style: { fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: color || 'var(--text)' } }, value));

function EditForm({ row, onSave, onCancel, saving }) {
  const { useState } = React;
  const [status, setStatus] = useState(row.status || 'pending');
  const [rating, setRating] = useState(row.rating || '');
  const [assessedDate, setAssessedDate] = useState(row.assessedDate || '');
  const [assessedBy, setAssessedBy] = useState(row.assessedBy || '');
  const [dueDate, setDueDate] = useState(row.dueDate || '');
  const [notes, setNotes] = useState(row.notes || '');
  const inS = { padding: '5px 8px', borderRadius: 6, border: '.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', fontSize: 11, width: '100%' };
  const lblS = { fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', marginBottom: 3, display: 'block' };
  const field = (label, el) => div({ style: { flex: '1 1 140px', minWidth: 120 } }, h('label', { style: lblS }, label), el);
  return div({ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 4px' } },
    div({ style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
      field('Status', h('select', { value: status, onChange: e => setStatus(e.target.value), style: inS },
        h('option', { value: 'pending' }, 'Pending'), h('option', { value: 'rated' }, 'Rated'))),
      field('Rating', h('input', { type: 'text', value: rating, onChange: e => setRating(e.target.value), placeholder: 'e.g. 4/5, Pass', style: inS })),
      field('Assessed Date', h('input', { type: 'date', value: assessedDate || '', onChange: e => setAssessedDate(e.target.value), style: inS })),
      field('Assessed By', h('input', { type: 'text', value: assessedBy, onChange: e => setAssessedBy(e.target.value), style: inS })),
      field('Due Date', h('input', { type: 'date', value: dueDate || '', onChange: e => setDueDate(e.target.value), style: inS }))),
    field('Notes', h('textarea', { value: notes, onChange: e => setNotes(e.target.value), rows: 2, style: { ...inS, resize: 'vertical' } })),
    div({ style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
      btn({ onClick: onCancel, disabled: saving, style: { padding: '5px 12px', borderRadius: 6, border: '.5px solid var(--bdr)', background: 'transparent', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' } }, 'Cancel'),
      btn({
        onClick: () => onSave({ status, rating: rating || null, assessedDate: assessedDate || null, assessedBy: assessedBy || null, dueDate: dueDate || null, notes: notes || null }),
        disabled: saving, style: { padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--accent,#f5bc00)', color: '#0f1117', fontSize: 11, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1 },
      }, saving ? 'Saving…' : 'Save')));
}

export function StoreAssessmentsPanel({ stores, onClose }) {
  const { useState, useMemo, useEffect } = React;
  const [scope, setScope] = useState({ level: 'all', id: null });
  const [assessments, setAssessments] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [editingLoc, setEditingLoc] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    loadStoreAssessments().then(rows => { if (alive) { setAssessments(rows); setLoaded(true); } })
      .catch(e => { if (alive) { setLoadErr(e?.message || 'load failed'); setLoaded(true); } });
    return () => { alive = false; };
  }, []);

  const tree = useMemo(() => buildLocationHierarchy(stores, INV_ORG_COORDS, STORE_NAMES), [stores]);
  const scopedLocs = useMemo(() => new Set(locationSelectorLocs(scope, tree).map(locNum)), [scope, tree]);
  const rows = useMemo(() => mergeAssessmentRows(scopedLocs, assessments), [scopedLocs, assessments]);
  const progress = useMemo(() => assessmentProgress(rows), [rows]);

  const handleSave = async (loc, fields) => {
    setSaving(true);
    const { error } = await saveStoreAssessment(loc, fields);
    setSaving(false);
    if (error) { setLoadErr(error); return; }
    // Optimistic local merge — no full reload needed, same shape saveStoreAssessment wrote.
    setAssessments(prev => {
      const next = prev.filter(a => locNum(a.loc) !== locNum(loc));
      next.push({ loc, assessmentType: 'scheduling-workshop', ...fields });
      return next;
    });
    setEditingLoc(null);
  };

  const thS = { padding: '6px 8px', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'left', background: 'var(--surf2)' };
  const tdS = { padding: '6px 8px', fontSize: 11, borderBottom: '.5px solid var(--bdr)', verticalAlign: 'top' };

  return h(RoutePanelShell, {
    icon: '🗒️',
    title: 'Store Assessments',
    subtitle: 'Manual per-store rating tracker — Staged Experiments / Risk Tracking',
    onBack: onClose,
  },
    div({ style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      h(LocationSelector, { stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope, mode: 'progressive' }),

      !loaded
        ? div({ style: { textAlign: 'center', padding: '32px 20px', color: 'var(--text3)', fontSize: 12 } }, 'Loading…')
        : loadErr && !assessments.length
        ? div({ style: { textAlign: 'center', padding: '32px 20px', color: 'var(--crit)', fontSize: 12 } },
            'Could not load store_assessments — ', loadErr,
            div({ style: { color: 'var(--text3)', marginTop: 6, fontSize: 11 } }, 'If this table hasn\'t been created yet, run supabase/schema-store-assessments.sql in the Supabase SQL editor.'))
        : [
            div({ key: 'cards', style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
              card('Rated', `${progress.rated}/${progress.total}`, '#10b981'),
              card('Progress', `${progress.pct}%`),
              card('Pending', String(progress.total - progress.rated), '#f59e0b')),

            rows.length === 0
              ? div({ key: 'empty', style: { textAlign: 'center', padding: '32px 20px', color: 'var(--text3)', fontSize: 12 } }, 'No stores in this scope.')
              : div({ key: 'tbl', style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflowX: 'auto' } },
                  h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 760 } },
                    h('thead', null, h('tr', null,
                      h('th', { style: thS }, 'Store'), h('th', { style: thS }, 'Status'), h('th', { style: thS }, 'Rating'),
                      h('th', { style: thS }, 'Assessed'), h('th', { style: thS }, 'By'), h('th', { style: thS }, 'Due'),
                      h('th', { style: thS }, 'Notes'), h('th', { style: thS }))),
                    h('tbody', null, ...rows.flatMap(r => {
                      const isEditing = editingLoc === r.loc;
                      const trEls = [h('tr', {
                        key: r.loc,
                        style: { background: isEditing ? 'rgba(245,188,0,.06)' : 'transparent' },
                      },
                        h('td', { style: { ...tdS, fontWeight: 600, whiteSpace: 'nowrap' } },
                          storeName(r.loc), span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 9, marginLeft: 5 } }, '#' + r.loc)),
                        h('td', { style: tdS },
                          span({ style: { fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: withAlpha(STATUS_COLOR[r.status] || 'var(--text3)', '22'), color: STATUS_COLOR[r.status] || 'var(--text3)' } }, STATUS_LABEL[r.status] || r.status)),
                        h('td', { style: { ...tdS, color: 'var(--text2)' } }, r.rating || '—'),
                        h('td', { style: { ...tdS, color: 'var(--text2)', whiteSpace: 'nowrap' } }, niceDate(r.assessedDate)),
                        h('td', { style: { ...tdS, color: 'var(--text2)' } }, r.assessedBy || '—'),
                        h('td', { style: { ...tdS, color: 'var(--text2)', whiteSpace: 'nowrap' } }, niceDate(r.dueDate)),
                        h('td', { style: { ...tdS, color: 'var(--text2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.notes || '—'),
                        h('td', { style: tdS },
                          btn({ onClick: () => setEditingLoc(isEditing ? null : r.loc), style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 10, fontWeight: 600, cursor: 'pointer' } }, isEditing ? 'Close' : 'Edit')))];
                      if (isEditing) trEls.push(h('tr', { key: r.loc + '-edit' },
                        h('td', { colSpan: 8, style: { padding: '0 8px 10px', background: 'var(--surf3)' } },
                          h(EditForm, { row: r, saving, onCancel: () => setEditingLoc(null), onSave: fields => handleSave(r.loc, fields) }))));
                      return trEls;
                    })))),
          ]));
}
