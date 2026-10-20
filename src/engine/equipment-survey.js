// @ts-nocheck
// Equipment Profile project, Phase 2 — shared resolution logic for the append-only survey log.
// Imported both by the client (future admin views) and by supabase/functions/equipment-survey
// via a relative path outside supabase/functions/ (the same pattern sage-chat/index.ts already
// uses for eom-ledger-baseline.js/forms-completion.js/stream-freshness.js) so the one real piece
// of business logic here — "what does a store currently have" — is tested against the actual
// algorithm, not a reimplementation of it.

// equipment_survey_entries is append-only: every add/edit/correction is a new row sharing the
// same instance_id as the physical item it describes, with a later submitted_at. "Current state"
// for a store is the latest row per instance_id, excluding any instance whose latest action is
// 'removed'. Rows must already be sorted newest-first by submitted_at (both the edge function's
// query and this function itself assume that — this function does not re-sort).
export function latestEntriesByInstance(rowsNewestFirst) {
  const latest = new Map();
  for (const r of (rowsNewestFirst || [])) {
    if (!r || !r.instance_id) continue;
    if (!latest.has(r.instance_id)) latest.set(r.instance_id, r);
  }
  return [...latest.values()].filter(r => r.action !== 'removed');
}

// ── Placement/side/relative option catalogs (owner feedback 2026-10-19) ───────────────────────
// Single source of truth for both the client form's <select> dropdowns (equipment-survey-view.js
// imports these, no longer declares its own copy) and the rollup/email formatting below, which
// the equipment-survey edge function also needs (owner request 2026-10-19: "include a rolled up
// list of what is entered... send results to their email").
export const PLACEMENTS = [
  { value: 'front_counter', label: 'Front Counter' },
  { value: 'drive_thru', label: 'Drive Thru' },
  { value: 'mccafe_cell', label: 'McCafé Cell' },
  { value: 'bdap_cell', label: 'BDAP Cell' },
  { value: 'dessert_cell', label: 'Dessert Cell' },
  { value: 'production_area', label: 'Production Area (Kitchen)' },
  { value: 'prep_area', label: 'Prep Area' },
  { value: 'back_of_house', label: 'Back of House' },
];
export const SIDE_OPTIONS = [
  { value: 'side1_right', label: 'Side 1 — Right' },
  { value: 'side1_left', label: 'Side 1 — Left' },
  { value: 'side2_right', label: 'Side 2 — Right' },
  { value: 'side2_left', label: 'Side 2 — Left' },
];
export const RELATIVE_OPTIONS = [
  { value: 'same_as_grill', label: 'Same side as grill(s)' },
  { value: 'opposite_of_grill', label: 'Opposite side of grill(s)' },
];
export const placementLabel = v => PLACEMENTS.find(o => o.value === v)?.label || '';
export const sideLabel = v => SIDE_OPTIONS.find(o => o.value === v)?.label || '';
export const relativeLabel = v => RELATIVE_OPTIONS.find(o => o.value === v)?.label || '';

// One current-state entry -> its display description, e.g. "Grill — Frymaster FPEG30" or, for a
// crew "type it in" manual entry with no catalog match, the raw manual text. `catalogById` is a
// {id: catalogRow} map built from the same equipment_catalog rows the form already loads.
export function describeEquipmentEntry(entry, catalogById) {
  const item = entry?.catalog_item_id ? (catalogById || {})[entry.catalog_item_id] : null;
  return item ? `${item.type} — ${item.manufacturer} ${item.model}` : (entry?.manual_entry_text || 'Equipment');
}

// Current-state entries -> flat rollup rows, each field already resolved to its display label
// (not a raw code) so both the client's review screen and the edge function's email body can
// render the SAME rollup without either one re-deriving these labels a second time.
export function buildEquipmentRollupRows(entries, catalogById) {
  return (entries || []).map(e => ({
    description: describeEquipmentEntry(e, catalogById),
    placement: e.placement_zone ? placementLabel(e.placement_zone) : '',
    side: e.position_detail?.side ? sideLabel(e.position_detail.side) : '',
    relative: e.position_detail?.relative ? relativeLabel(e.position_detail.relative) : '',
    serial: e.serial_number || '',
    certDate: e.cert_date || '',
    submittedBy: e.submitted_by || '',
  }));
}

// Plain-text rollup — the crew member's own copy (clipboard/native share sheet) and the fallback
// body for an email client that strips HTML. storeLabel is a plain string (e.g. "Ardmore —
// Broadway"), not a loc code, so this stays independent of STORE_NAMES/the client bundle.
export function buildEquipmentRollupText(storeLabel, rows) {
  const lines = [`Equipment Survey — ${storeLabel}`, ''];
  if (!rows || !rows.length) { lines.push('No equipment logged for this store yet.'); return lines.join('\n'); }
  rows.forEach((r, i) => {
    const bits = [r.placement, r.side, r.relative, r.serial && `S/N ${r.serial}`, r.certDate && `Cert ${r.certDate}`].filter(Boolean);
    lines.push(`${i + 1}. ${r.description}${bits.length ? ' — ' + bits.join(' · ') : ''}`);
  });
  lines.push('', `${rows.length} item(s) total.`);
  return lines.join('\n');
}

// Current GM (name + email) for a store as-of a date, from org_config's 'app_settings' blob's own
// gmAssignments timeline shape ({loc, gm, gmEmail, start}) — the SAME live source
// management.js's GmAssignmentsEditor writes to and src/features/morning-brief.js's whoIsGM()
// resolves from, per that file's own "latest start <= date wins" rule (constants.js's
// latestEffective()). Reimplemented here, small and framework-free, rather than imported from
// morning-brief.js: that file pulls in the full dashboard view layer (React components, heavy
// deps), which the equipment-survey edge function (Deno, a standalone public gateway) can't carry
// — this is the one piece of that logic the edge function actually needs, isolated the same way
// latestEntriesByInstance() above already isolates the one piece of resolution logic IT needs.
export function resolveStoreGM(gmAssignments, loc, dateStr) {
  const key = String(parseInt(loc, 10));
  const d = dateStr || new Date().toISOString().slice(0, 10);
  let best = null, bestStart = null;
  for (const a of (gmAssignments || [])) {
    if (String(parseInt(a.loc, 10)) !== key) continue;
    const s = a.start || '';
    if (s && d && s > d) continue; // not yet effective on `date`
    if (best === null || s >= (bestStart || '')) { best = a; bestStart = s; }
  }
  return (best && best.gm) ? { name: best.gm, email: best.gmEmail || '' } : null;
}
