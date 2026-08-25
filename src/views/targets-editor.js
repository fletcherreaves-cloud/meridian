// @ts-nocheck
// ── Targets Editor (dispatch #132 item 3) ─────────────────────────────────────────────────
// "For all metrics without a target, let's setup a place in panel to establish targets so
// they write automatically > Give option to set company wide targets or by store/patch/
// state/owner." Scoped to the fields THIS dispatch is about (see target-overrides.js's
// TARGET_OVERRIDE_FIELDS) rather than a generic every-possible-field editor — the data model
// and this UI are both generic enough to extend later by adding one row to that registry.
//
// Scope hierarchy is the app's EXISTING one — LocationSelector's mode:'progressive'
// (All -> State -> Patch -> Store, PanelControls.js), the same control every other
// scope-aware panel in this app already uses. "Company-wide" = LocationSelector's "All
// Locations" tier.
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { LocationSelector } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { loadTargetOverrides, saveTargetOverride, deleteTargetOverride } from '../lib/supabase.js';
import {
  TARGET_OVERRIDE_FIELDS, SCOPE_LABELS, COMPANY_SCOPE_ID,
  indexTargetOverrides, resolveOverrideWithSource,
} from '../engine/target-overrides.js';
import { mergedTargetsForLoc } from '../engine/review-engine.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const inp = (p, ...c) => h('input', p, ...c);
const label9 = t => div({ style: { fontSize: '9px', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' } }, t);

// LocationSelector's {level,id} -> {scope_type, scope_id}. 'all' is this editor's
// "company-wide" tier — the plain-English label the owner actually used.
function selectorToScope(v) {
  if (!v || v.level === 'all') return { scope_type: 'company', scope_id: COMPANY_SCOPE_ID };
  if (v.level === 'state') return { scope_type: 'state', scope_id: v.id };
  if (v.level === 'patch') return { scope_type: 'patch', scope_id: v.id };
  return { scope_type: 'store', scope_id: v.id };
}
function scopeToSelector(scope_type, scope_id) {
  if (scope_type === 'company') return { level: 'all', id: null };
  if (scope_type === 'state') return { level: 'state', id: scope_id };
  if (scope_type === 'patch') return { level: 'patch', id: scope_id };
  return { level: 'store', id: scope_id };
}
const scopeRowLabel = (scope_type, scope_id) => scope_type === 'company' ? 'Company-wide (all stores)'
  : scope_type === 'state' ? 'State: ' + scope_id
  : scope_type === 'patch' ? 'Patch: ' + scope_id
  : 'Store: ' + (sNameC(scope_id) || scope_id);

const fmtVal = (v, unit) => v == null ? '—' : unit === 'pct' ? (v * 100).toFixed(2) + '%' : unit === 'usd' ? '$' + Number(v).toLocaleString() : unit === 'sec' ? v + ' sec' : String(v);

export function TargetsEditorPanel({ ds, onClose }) {
  const { useState, useEffect, useMemo } = React;
  const [rows, setRows] = useState(null);            // raw override rows, null = loading
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [fieldKey, setFieldKey] = useState(TARGET_OVERRIDE_FIELDS[0].field);
  const [scopeVal, setScopeVal] = useState({ level: 'all', id: null });
  const [valueInput, setValueInput] = useState('');
  const [previewStore, setPreviewStore] = useState(null);

  const _stores = useMemo(() => Object.keys(STORE_NAMES).map(loc => ({ loc })), []);
  const fieldDef = TARGET_OVERRIDE_FIELDS.find(f => f.field === fieldKey) || TARGET_OVERRIDE_FIELDS[0];

  const reload = () => { loadTargetOverrides().then(r => setRows(r)).catch(() => setRows([])); };
  useEffect(() => { reload(); }, []);

  const overridesIndex = useMemo(() => indexTargetOverrides(rows || []), [rows]);
  const fieldRows = useMemo(() =>
    (rows || []).filter(r => r.field === fieldKey)
      .sort((a, b) => { const ord = { company: 0, state: 1, patch: 2, store: 3 };
        return (ord[a.scope_type] - ord[b.scope_type]) || String(a.scope_id).localeCompare(String(b.scope_id)); }),
    [rows, fieldKey]);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const save = async () => {
    const num = fieldDef.unit === 'pct' ? parseFloat(valueInput) / 100 : parseFloat(valueInput);
    if (isNaN(num)) { showMsg('Enter a numeric value first'); return; }
    const { scope_type, scope_id } = selectorToScope(scopeVal);
    if (scope_type !== 'company' && !scope_id) { showMsg('Pick a State, Patch, or Store first'); return; }
    setBusy(true);
    const r = await saveTargetOverride({ scope_type, scope_id, field: fieldKey, value: num });
    setBusy(false);
    if (r.error) { showMsg('Save failed: ' + r.error); return; }
    showMsg('Saved ✓'); setValueInput(''); reload();
  };

  const remove = async (id) => {
    setBusy(true);
    const r = await deleteTargetOverride(id);
    setBusy(false);
    if (r.error) { showMsg('Delete failed: ' + r.error); return; }
    reload();
  };

  // Live cascade preview — dispatch #132's verification bar: demonstrate the override
  // cascade resolving end-to-end for a real store, not just describe it.
  const preview = useMemo(() => {
    if (!previewStore) return null;
    const ov = resolveOverrideWithSource(overridesIndex, fieldKey, previewStore);
    let full = null;
    if (ds) { try { full = mergedTargetsForLoc({ ...ds, targetOverrides: overridesIndex }, previewStore)[fieldKey] ?? null; } catch { full = null; } }
    return { ...ov, full };
  }, [previewStore, overridesIndex, fieldKey, ds]);

  return h(ModalShell, {
    title: 'Targets Editor', icon: '🎯', maxWidth: 820, onClose,
    subtitle: 'Set Performance Review targets by Company / State / Patch / Store — no re-upload needed',
    headerExtra: msg ? span({ style: { fontSize: '10px', color: 'var(--text3)' } }, busy ? '…' : msg) : null,
    bodyStyle: { padding: 14, display: 'flex', flexDirection: 'column', gap: 14 },
  },
    // ── field picker ──
    div(null, label9('Target field'),
      div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        ...TARGET_OVERRIDE_FIELDS.map(f => btn({
          key: f.field, onClick: () => setFieldKey(f.field),
          style: { padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: '10.5px',
            border: '.5px solid ' + (fieldKey === f.field ? 'var(--amber)' : 'var(--bdr)'),
            background: fieldKey === f.field ? 'var(--adim)' : 'transparent',
            color: fieldKey === f.field ? 'var(--amber)' : 'var(--text2)', fontWeight: fieldKey === f.field ? 700 : 400 },
        }, f.label)),
      ),
      div({ style: { fontSize: '9.5px', color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 } }, fieldDef.note),
    ),

    // ── existing overrides for this field ──
    div(null, label9('Existing overrides for this field (' + fieldRows.length + ')'),
      rows == null ? div({ style: { fontSize: '11px', color: 'var(--text3)' } }, 'Loading…')
      : fieldRows.length === 0 ? div({ style: { fontSize: '11px', color: 'var(--text3)', padding: '6px 0' } }, 'None set yet — every store falls back to the workbook/default target below.')
      : div({ style: { display: 'flex', flexDirection: 'column', gap: 5 } },
        ...fieldRows.map(r => div({ key: r.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
          span({ style: { fontSize: '9.5px', fontWeight: 700, padding: '1px 7px', borderRadius: 999, border: '.5px solid var(--bdr2)', color: 'var(--text2)' } }, SCOPE_LABELS[r.scope_type]),
          div({ style: { flex: 1, fontSize: '11px', color: 'var(--text)' } }, scopeRowLabel(r.scope_type, r.scope_id)),
          div({ style: { fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--amber)' } }, fmtVal(r.value, fieldDef.unit)),
          btn({ className: 'btn btn-sm', style: { fontSize: '10px', color: 'var(--text3)' }, disabled: busy, onClick: () => remove(r.id), title: 'Remove' }, '🗑'))),
      )),

    // ── set/update an override ──
    div({ style: { borderTop: '1px solid var(--bdr)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 } },
      div({ style: { fontSize: '10px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Set an override'),
      div(null, label9('Scope'),
        h(LocationSelector, { stores: _stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scopeVal, onChange: setScopeVal, mode: 'progressive' })),
      div({ style: { display: 'flex', alignItems: 'flex-end', gap: 8 } },
        div(null, label9('Value' + (fieldDef.unit === 'pct' ? ' (%)' : fieldDef.unit === 'usd' ? ' ($)' : fieldDef.unit === 'sec' ? ' (sec)' : '')),
          inp({ type: 'number', step: 'any', value: valueInput, onChange: e => setValueInput(e.target.value),
            placeholder: fieldDef.unit === 'pct' ? 'e.g. 5' : 'e.g. 240',
            style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '12px', padding: '6px 10px', width: 140 } })),
        btn({ className: 'btn btn-a', style: { fontSize: '11px', fontWeight: 700 }, disabled: busy, onClick: save }, '💾 Save override')),
    ),

    // ── cascade preview ──
    div({ style: { borderTop: '1px solid var(--bdr)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 } },
      div({ style: { fontSize: '10px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Preview — what does one store actually resolve to?'),
      div(null, label9('Store'),
        h(LocationSelector, { stores: _stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
          value: previewStore ? { level: 'store', id: previewStore } : { level: 'all', id: null },
          onChange: v => setPreviewStore(v.level === 'store' ? v.id : null), mode: 'progressive' })),
      preview && div({ style: { fontSize: '11px', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', background: 'var(--surf2)', borderRadius: 8, border: '.5px solid var(--bdr)' } },
        div(null, 'Override cascade: ', span({ style: { fontWeight: 700, color: preview.source ? 'var(--amber)' : 'var(--text3)' } },
          preview.value != null ? fmtVal(preview.value, fieldDef.unit) + ' — won at ' + SCOPE_LABELS[preview.source] + ' tier' : 'no override set at any tier')),
        div(null, 'Full resolved target (workbook/default, override included): ', span({ style: { fontWeight: 700, color: 'var(--text)' } }, fmtVal(preview.full, fieldDef.unit))),
      ),
    ),

    div({ style: { fontSize: '9px', color: 'var(--text3)', borderTop: '1px solid var(--bdr)', paddingTop: 8 } },
      'Precedence: Store override > Patch override > State override > Company override > monthly target > yearly target > app default. ' +
      'Covers the target fields dispatch #132 is about — see target-overrides.js to add more.'));
}
