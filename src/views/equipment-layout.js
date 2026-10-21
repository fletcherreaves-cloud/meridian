// @ts-nocheck
// ── Layout Planner (owner request 2026-10-21) ─────────────────────────────────────────────────
// Real, in-app, read/write visual floor-plan view of a store's Equipment Profile survey data —
// the interactive-mockup version of this (a claude.ai Artifact prototype) proved the interaction
// out first; this is that design wired to real data. Separate code path from
// equipment-survey-view.js (the anonymous, token-gated crew walkthrough form): this panel is for
// a signed-in Meridian user and reads/writes equipment_catalog/equipment_survey_entries directly
// through the normal authenticated Supabase client (loadEquipmentCatalogDirect/
// loadEquipmentEntriesDirect/saveEquipmentEntryDirect, lib/supabase.js), not the public edge
// function.
//
// equipment_survey_entries is APPEND-ONLY: every add/reposition/edit/remove here is a new INSERT
// (never an update-in-place), sharing the same instance_id for the same physical item. "Current
// state" is resolved client-side via engine/equipment-survey.js's latestEntriesByInstance(), the
// SAME function the crew form and the edge function both already use — one definition of
// "current" for the whole app.
//
// Scope note (deliberate, not an oversight): v1 is single-store. The original mockup let an item
// drag from one store's board onto another's as a "transfer" — that has no real equivalent in
// this schema (equipment_survey_entries.loc is fixed per row; there is no concept yet of one
// physical unit's history spanning two stores' logs). Building that would mean designing new
// cross-store semantics, not wiring up the existing ones — left as an explicitly open question
// (see memory/project-equipment-profile.md) rather than invented here.
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import {
  PLACEMENTS, SIDE_OPTIONS, RELATIVE_OPTIONS, placementLabel, sideLabel, relativeLabel,
  latestEntriesByInstance, describeEquipmentEntry,
} from '../engine/equipment-survey.js';
import {
  loadEquipmentCatalogDirect, loadEquipmentEntriesDirect, saveEquipmentEntryDirect,
  equipmentCatalogPhotoUrl,
} from '../lib/supabase.js';

const h = React.createElement;
const { useState, useEffect, useMemo, useRef, useCallback } = React;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// Display-only metadata for the 14 catalog TYPES (icon + grouping) — the real manufacturer/model
// rows for each type come live from equipment_catalog; this is just the palette's visual shape.
export const CATALOG_TYPE_GROUPS = [
  { group: 'Cooking', types: [
    { id: 'grill', label: 'Grill', icon: '🍳' },
    { id: 'fryer', label: 'Fryer', icon: '🍟' },
    { id: 'toaster', label: 'Toaster', icon: '🍞' },
    { id: 'steamer', label: 'Steamer', icon: '♨️' },
    { id: 'combi_oven', label: 'Combi Oven', icon: '🔥' },
    { id: 'uhc', label: 'UHC', icon: '🗄️' },
  ]},
  { group: 'Prep & Staging', types: [
    { id: 'staging_cabinet', label: 'Staging Cabinet', icon: '📦' },
    { id: 'prep_line', label: 'Prep Line', icon: '🥬' },
  ]},
  { group: 'Beverage', types: [
    { id: 'blended_ice', label: 'Blended Ice', icon: '🧊' },
    { id: 'abs', label: 'ABS', icon: '🥤' },
    { id: 'juice_dispenser', label: 'Juice Dispenser', icon: '🧃' },
    { id: 'sweetener_creamer_dispenser', label: 'Sweetener/Creamer', icon: '🍯' },
    { id: 'espresso_1step', label: 'Espresso (1-Step)', icon: '☕' },
    { id: 'espresso_2step', label: 'Espresso (2-Step)', icon: '☕' },
    { id: 'shake_sundae', label: 'Shake/Sundae', icon: '🍨' },
  ]},
];
const ALL_TYPES = CATALOG_TYPE_GROUPS.flatMap(g => g.types);
const typeMeta = (id) => ALL_TYPES.find(t => t.id === id) || { id, label: id, icon: '❓' };

// Rough footprint layout, same shape the mockup validated — 4 cols x 5 rows, zones sized to grow
// with content (CSS grid auto rows) rather than clip.
const ZONE_GRID_AREA = {
  front_counter:   '1 / 1 / 2 / 3',
  drive_thru:      '1 / 3 / 2 / 5',
  mccafe_cell:     '2 / 1 / 3 / 2',
  bdap_cell:       '2 / 2 / 3 / 3',
  dessert_cell:    '2 / 3 / 3 / 5',
  production_area: '3 / 1 / 5 / 5',
  prep_area:       '5 / 1 / 6 / 3',
  back_of_house:   '5 / 3 / 6 / 5',
};

// Pure: current-state entries (already latest-per-instance, non-removed) -> placed items with
// placement_zone set, each carrying its resolved display fields. Exported for testing.
export function buildPlacedItems(currentEntries, catalogById) {
  return (currentEntries || [])
    .filter(e => e.placement_zone)
    .map(e => ({
      instanceId: e.instance_id,
      typeId: e.catalog_item_id ? (catalogById[e.catalog_item_id]?.type || null) : null,
      catalogItemId: e.catalog_item_id || null,
      manualText: e.manual_entry_text || null,
      zone: e.placement_zone,
      side: e.position_detail?.side || '',
      relative: e.position_detail?.relative || '',
      serial: e.serial_number || '',
      certDate: e.cert_date || '',
      submittedBy: e.submitted_by || '',
      submittedAt: e.submitted_at || '',
      description: describeEquipmentEntry(e, catalogById),
    }));
}

export function EquipmentLayoutPanel({ stores, onClose }) {
  const [locValue, setLocValue] = useState({ level: 'store', id: null });
  const loc = locValue.level === 'store' ? locValue.id : null;

  const [catalog, setCatalog] = useState(null); // null = loading
  const [entries, setEntries] = useState(null); // null = no store picked yet
  const [loadErr, setLoadErr] = useState('');
  const [selectedUid, setSelectedUid] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadEquipmentCatalogDirect().then(setCatalog).catch(() => setCatalog([])); }, []);

  useEffect(() => {
    if (!loc) { setEntries(null); return; }
    let cancelled = false;
    setEntries(null);
    setSelectedUid(null);
    loadEquipmentEntriesDirect(loc)
      .then(rows => { if (!cancelled) setEntries(rows || []); })
      .catch(e => { if (!cancelled) { setEntries([]); setLoadErr(String(e?.message || e)); } });
    return () => { cancelled = true; };
  }, [loc]);

  const catalogById = useMemo(() => {
    const m = {};
    for (const c of (catalog || [])) m[c.id] = c;
    return m;
  }, [catalog]);
  const catalogByType = useMemo(() => {
    const m = {};
    for (const c of (catalog || [])) (m[c.type] = m[c.type] || []).push(c);
    return m;
  }, [catalog]);

  const current = useMemo(() => latestEntriesByInstance(
    (entries || []).slice().sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || '')),
  ), [entries]);
  const placed = useMemo(() => buildPlacedItems(current, catalogById), [current, catalogById]);
  const unplaced = useMemo(() => current.filter(e => !e.placement_zone), [current]);
  const selected = placed.find(p => p.instanceId === selectedUid) || null;

  // ── Drag engine: pointer events, imperative shadow node (no re-render during drag) ──────────
  const floorRef = useRef(null);
  const shadowRef = useRef(null);
  const [overZone, setOverZone] = useState(null);

  const commitPlacement = useCallback(async ({ instanceId, catalogItemId, zone, side, relative }) => {
    setSaving(true);
    const prior = current.find(e => e.instance_id === instanceId);
    const { entry, error } = await saveEquipmentEntryDirect({
      instance_id: instanceId || undefined,
      loc,
      catalog_item_id: catalogItemId ?? prior?.catalog_item_id ?? null,
      manual_entry_text: prior?.manual_entry_text ?? null,
      placement_zone: zone,
      serial_number: prior?.serial_number ?? null,
      cert_date: prior?.cert_date ?? null,
      position_detail: { side: side ?? prior?.position_detail?.side ?? '', relative: relative ?? prior?.position_detail?.relative ?? '' },
      action: prior ? 'corrected' : 'added',
    });
    setSaving(false);
    if (error) { alert('Could not save: ' + error); return; }
    setEntries(prev => [entry, ...(prev || [])]);
    setSelectedUid(entry.instance_id);
  }, [current, loc]);

  const startDrag = useCallback((e, info) => {
    const meta = typeMeta(info.typeId);
    const shadow = document.createElement('div');
    shadow.style.cssText = 'position:fixed;z-index:999;pointer-events:none;opacity:.92;'
      + 'transform:translate(-50%,-50%) scale(1.05);background:var(--surf2);border:1px solid var(--bdr2);'
      + 'border-radius:6px;padding:4px 8px;font-size:11px;color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,.5);'
      + 'display:flex;align-items:center;gap:5px;white-space:nowrap;';
    shadow.innerHTML = `<span>${meta.icon}</span><span>${meta.label}</span>`;
    document.body.appendChild(shadow);
    shadowRef.current = shadow;
    const move = (x, y) => { shadow.style.left = x + 'px'; shadow.style.top = y + 'px'; };
    move(e.clientX, e.clientY);

    function onMove(ev) {
      move(ev.clientX, ev.clientY);
      shadow.style.display = 'none';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      shadow.style.display = '';
      const zoneEl = el && el.closest ? el.closest('[data-zone]') : null;
      setOverZone(zoneEl ? zoneEl.dataset.zone : null);
    }
    async function onUp(ev) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      shadow.remove(); shadowRef.current = null;
      shadow.style.display = 'none';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const zoneEl = el && el.closest ? el.closest('[data-zone]') : null;
      setOverZone(null);
      if (!zoneEl) return;
      const zone = zoneEl.dataset.zone;
      if (info.fromPalette) {
        await commitPlacement({ instanceId: null, catalogItemId: null, zone, side: 'side1_right', relative: '' });
      } else {
        await commitPlacement({ instanceId: info.instanceId, zone });
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [commitPlacement]);

  const removeItem = useCallback(async (instanceId) => {
    const prior = current.find(e => e.instance_id === instanceId);
    if (!prior) return;
    if (!confirm('Remove this item? It stays in survey history, just off the current floor plan.')) return;
    setSaving(true);
    const { entry, error } = await saveEquipmentEntryDirect({
      instance_id: instanceId, loc,
      catalog_item_id: prior.catalog_item_id, manual_entry_text: prior.manual_entry_text,
      placement_zone: prior.placement_zone, serial_number: prior.serial_number, cert_date: prior.cert_date,
      position_detail: prior.position_detail, action: 'removed',
    });
    setSaving(false);
    if (error) { alert('Could not save: ' + error); return; }
    setEntries(prev => [entry, ...(prev || [])]);
    if (selectedUid === instanceId) setSelectedUid(null);
  }, [current, loc, selectedUid]);

  const editField = useCallback(async (instanceId, patch) => {
    const prior = current.find(e => e.instance_id === instanceId);
    if (!prior) return;
    setSaving(true);
    const { entry, error } = await saveEquipmentEntryDirect({
      instance_id: instanceId, loc,
      catalog_item_id: patch.catalog_item_id !== undefined ? patch.catalog_item_id : prior.catalog_item_id,
      manual_entry_text: prior.manual_entry_text,
      placement_zone: prior.placement_zone,
      serial_number: patch.serial_number !== undefined ? patch.serial_number : prior.serial_number,
      cert_date: patch.cert_date !== undefined ? patch.cert_date : prior.cert_date,
      position_detail: {
        side: patch.side !== undefined ? patch.side : (prior.position_detail?.side || ''),
        relative: patch.relative !== undefined ? patch.relative : (prior.position_detail?.relative || ''),
      },
      action: 'corrected',
    });
    setSaving(false);
    if (error) { alert('Could not save: ' + error); return; }
    setEntries(prev => [entry, ...(prev || [])]);
  }, [current, loc]);

  // ── Render ────────────────────────────────────────────────────────────────────────────────
  const zoneItems = (zoneId) => placed.filter(p => p.zone === zoneId);

  return h(RoutePanelShell, {
    title: 'Layout Planner', icon: '🗺️', onBack: onClose,
    subtitle: 'Drag equipment onto the floor plan — writes real Equipment Profile survey entries',
  },
    div({ style: { marginBottom: 12 } },
      h(LocationSelector, {
        stores: (stores && stores.length) ? stores : Object.keys(STORE_NAMES).map(l => ({ loc: l })),
        invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
        value: locValue, onChange: setLocValue, mode: 'store', variant: 'dropdown',
      }),
    ),
    !loc
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a store to view or edit its floor plan.')
      : catalog == null || entries == null
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Loading…')
        : div({ style: { display: 'flex', gap: 14, flexWrap: 'wrap' } },
          // Palette
          div({ style: { width: 230, minWidth: 200, flexShrink: 0 } },
            div({ style: { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text3)', fontWeight: 700, marginBottom: 6 } }, 'Equipment Catalog'),
            ...CATALOG_TYPE_GROUPS.map(g => div({ key: g.group, style: { marginBottom: 10 } },
              div({ style: { fontSize: '10px', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700, opacity: .85, margin: '4px 0' } }, g.group),
              ...g.types.map(t => div({
                key: t.id, style: {
                  display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surf2)',
                  border: '1px solid var(--bdr2)', borderRadius: 7, padding: '7px 8px', margin: '4px 0',
                  cursor: 'grab', fontSize: '12px', touchAction: 'none',
                },
                onPointerDown: (e) => { e.preventDefault(); startDrag(e, { fromPalette: true, typeId: t.id }); },
              },
                span({ style: { fontSize: '15px', width: 18, textAlign: 'center' } }, t.icon),
                span({ style: { flex: 1, fontWeight: 600 } }, t.label),
                h('img', {
                  src: equipmentCatalogPhotoUrl(t.id), alt: t.label, title: 'Reference photo',
                  style: { width: 28, height: 28, objectFit: 'contain', background: '#fff', borderRadius: 4, border: '1px solid var(--bdr2)' },
                  onError: (e) => { e.target.style.visibility = 'hidden'; },
                }),
              )),
            )),
          ),
          // Floor
          div({ ref: floorRef, style: { flex: 1, minWidth: 320 } },
            div({
              style: {
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: 'minmax(50px, auto)',
                gap: 8, padding: 10, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--bdr)',
              },
            },
              ...Object.keys(ZONE_GRID_AREA).map(zoneId => div({
                key: zoneId, 'data-zone': zoneId,
                style: {
                  gridArea: ZONE_GRID_AREA[zoneId], display: 'flex', flexDirection: 'column',
                  border: overZone === zoneId ? '1.5px solid var(--accent)' : '1.5px dashed var(--bdr2)',
                  background: overZone === zoneId ? 'var(--surf3)' : 'var(--surf)', borderRadius: 8,
                  padding: '3px 4px 4px', minHeight: 50,
                },
              },
                span({ style: { fontSize: '9px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 700, marginBottom: 3 } }, placementLabel(zoneId)),
                div({ style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                  ...zoneItems(zoneId).map(p => div({
                    key: p.instanceId,
                    style: {
                      display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surf2)',
                      border: selectedUid === p.instanceId ? '2px solid var(--accent)' : '1px solid var(--bdr2)',
                      borderRadius: 6, padding: '3px 6px', fontSize: '10.5px', cursor: 'grab', touchAction: 'none',
                    },
                    onPointerDown: (e) => { e.preventDefault(); startDrag(e, { fromPalette: false, instanceId: p.instanceId, typeId: p.typeId }); },
                    onClick: () => setSelectedUid(selectedUid === p.instanceId ? null : p.instanceId),
                  },
                    span(null, typeMeta(p.typeId).icon),
                    span(null, p.description),
                  )),
                ),
              )),
            ),
            unplaced.length > 0 && div({ style: { marginTop: 10, fontSize: '10.5px', color: 'var(--text3)' } },
              `${unplaced.length} item(s) logged without a floor-plan zone yet — edit them from the crew walkthrough form, or they'll appear here once placed.`),
          ),
          // Inspector
          div({ style: { width: 250, minWidth: 220, flexShrink: 0 } },
            div({ style: { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text3)', fontWeight: 700, marginBottom: 8 } }, saving ? 'Saving…' : 'Details'),
            !selected
              ? div({ style: { fontSize: '11px', color: 'var(--text3)' } }, 'Click a placed item to view or edit its logged data.')
              : div({ style: { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: 12 } },
                div({ style: { fontSize: '13px', fontWeight: 700, marginBottom: 8 } }, typeMeta(selected.typeId).icon + ' ' + selected.description),
                h(InspectorField, { label: 'Manufacturer / Model', children: h('select', {
                  value: selected.catalogItemId || '', style: _selStyle,
                  onChange: (e) => editField(selected.instanceId, { catalog_item_id: e.target.value || null }),
                },
                  h('option', { value: '' }, 'Type it in instead'),
                  ...(catalogByType[selected.typeId] || []).map(c => h('option', { key: c.id, value: c.id }, `${c.manufacturer} ${c.model}`)),
                )}),
                h(InspectorField, { label: 'Side', children: h('select', {
                  value: selected.side, style: _selStyle, onChange: (e) => editField(selected.instanceId, { side: e.target.value }),
                },
                  h('option', { value: '' }, '—'),
                  ...SIDE_OPTIONS.map(s => h('option', { key: s.value, value: s.value }, s.label)),
                )}),
                h(InspectorField, { label: 'Relative to grill', children: h('select', {
                  value: selected.relative, style: _selStyle, onChange: (e) => editField(selected.instanceId, { relative: e.target.value }),
                },
                  h('option', { value: '' }, '—'),
                  ...RELATIVE_OPTIONS.map(r => h('option', { key: r.value, value: r.value }, r.label)),
                )}),
                h(InspectorField, { label: 'Serial Number', children: h('input', {
                  type: 'text', value: selected.serial, placeholder: 'Not logged yet', style: _selStyle,
                  onBlur: (e) => { if (e.target.value !== selected.serial) editField(selected.instanceId, { serial_number: e.target.value }); },
                  defaultValue: selected.serial,
                })}),
                h(InspectorField, { label: 'Cert Date', children: h('input', {
                  type: 'date', defaultValue: selected.certDate, style: _selStyle,
                  onBlur: (e) => { if (e.target.value !== selected.certDate) editField(selected.instanceId, { cert_date: e.target.value || null }); },
                })}),
                div({ style: { fontSize: '10px', color: 'var(--text3)', margin: '8px 0' } },
                  selected.submittedBy ? `Logged by ${selected.submittedBy}` : 'Submitter not recorded',
                  selected.submittedAt ? ' — ' + new Date(selected.submittedAt).toLocaleString() : ''),
                btn({ className: 'btn btn-sm', style: { color: 'var(--bad)' }, onClick: () => removeItem(selected.instanceId) }, '✕ Remove from floor plan'),
              ),
          ),
        ),
  );
}

function InspectorField({ label, children }) {
  return div({ style: { fontSize: '11px', color: 'var(--text3)', marginBottom: 8 } },
    span(null, label), children);
}
const _selStyle = { width: '100%', marginTop: 3, fontSize: '11.5px', padding: '5px 7px' };
