// @ts-nocheck
// ── Target Overrides — company/state/patch/store scope cascade (dispatch #132 item 3) ─────
//
// Owner's ask: "For all metrics without a target, let's setup a place in panel to establish
// targets so they write automatically > Give option to set company wide targets or by
// store/patch/state/owner." "owner" here is this app's existing org grouping (MCDOK/Emerald
// Arches — getStoreOrg/constants.js), but the scope tiers the owner actually described map
// 1:1 onto the hierarchy LocationSelector (src/components/PanelControls.js, mode:'progressive')
// already renders: All → State → Patch → Store. Reusing THAT hierarchy (same INV_ORG_COORDS
// state/sup fields the selector's buildLocationHierarchy() reads) rather than inventing a
// parallel "owner" scope concept is the point of this file — a store's state/patch here are
// looked up the identical way the selector groups it, so a patch picked in the Targets editor
// UI is the same patch a store falls under everywhere else in the app.
//
// ARCHITECTURE DECISION (dispatch #132 item 3, stated plainly per the dispatch's own ask):
// overrides live in a NEW table (target_overrides, supabase/schema-target-overrides.sql)
// rather than being written into yearly_targets/monthly_targets rows. Those two tables are
// each a snapshot of an UPLOADED WORKBOOK, one row per (loc, year[, month]) — see
// schema-yearly-targets.sql's own header. A company/state/patch-scoped value has no (loc, year)
// to attach to without either inventing a fake loc per scope tier (which would corrupt the "this
// is literally what the sheet said" provenance yearly-projections.js's district-rollup UI relies
// on) or writing the same value onto every store's row (which loses "this was a district
// default, not this store's own number" the moment it's read back). A dedicated overlay table
// keeps the uploaded-workbook data untouched and makes an override's scope and provenance
// self-describing at read time, matching the dispatch's own recommendation.
//
// PRECEDENCE (highest wins): STORE override > PATCH override > STATE override > COMPANY
// override > monthly_targets > yearly_targets > DEFAULT_TARGETS. An override is a human
// intentionally setting/correcting a number right now, so it wins over a workbook value from
// whenever it was last uploaded — the same reasoning that already makes monthly win over yearly
// in mergedTargetsForLoc (review-engine.js).
//
// Kept intentionally NOT year-scoped in this first pass (unlike yearly_targets/monthly_targets):
// an override applies to every period until changed or removed. The owner's ask was about
// establishing missing targets, not versioning them per year; a `year` dimension is a natural
// future extension of the same table/UI if that's ever needed (see the schema file's comment).

import { INV_ORG_COORDS } from '../constants.js';

export const SCOPE_TYPES = ['company', 'state', 'patch', 'store'];
export const SCOPE_LABELS = { company: 'Company-wide', state: 'State', patch: 'Patch', store: 'Store' };
export const COMPANY_SCOPE_ID = 'ALL';

// A store's own state/patch ids, from the SAME source (INV_ORG_COORDS) and SAME fields
// (.state / .sup) buildLocationHierarchy() in PanelControls.js reads — so a patch selected here
// is the identical patch LocationSelector's progressive mode shows for that store.
export function scopeIdsForLoc(loc) {
  const meta = INV_ORG_COORDS?.[String(loc)];
  return { state: meta?.state ?? null, patch: meta?.sup ?? null };
}

const overrideKey = (scopeType, scopeId) => `${scopeType}:${scopeType === 'company' ? COMPANY_SCOPE_ID : String(scopeId ?? '')}`;

// rows: flat array as loaded from Supabase target_overrides — [{id, scope_type, scope_id,
// field, value, updated_at, updated_by}, ...]. Indexes once per load so per-loc resolution
// (called once per metric per month inside autoPopulateKPIs) doesn't re-scan the whole table.
// Returns { [field]: { 'store:3708': value, 'patch:Robert Spencer': value, ... } }.
export function indexTargetOverrides(rows) {
  const idx = {};
  for (const r of (rows || [])) {
    if (!r || !r.field || r.value == null || !SCOPE_TYPES.includes(r.scope_type)) continue;
    (idx[r.field] ||= {})[overrideKey(r.scope_type, r.scope_id)] = r.value;
  }
  return idx;
}

// Resolve ONE field's override for one loc, by precedence store > patch > state > company.
// overridesIndex is indexTargetOverrides()'s output (or null/undefined — no overrides loaded).
export function resolveOverride(overridesIndex, field, loc) {
  const byKey = overridesIndex && overridesIndex[field];
  if (!byKey) return null;
  const { state, patch } = scopeIdsForLoc(loc);
  if (loc != null && byKey[overrideKey('store', loc)] != null) return byKey[overrideKey('store', loc)];
  if (patch != null && byKey[overrideKey('patch', patch)] != null) return byKey[overrideKey('patch', patch)];
  if (state != null && byKey[overrideKey('state', state)] != null) return byKey[overrideKey('state', state)];
  if (byKey[overrideKey('company')] != null) return byKey[overrideKey('company')];
  return null;
}

// Same precedence as resolveOverride, but also names which tier won — for the Targets editor's
// "here's what this store actually resolves to, and why" preview (dispatch #132 verification
// bar: demonstrate the override cascade working end-to-end, not just describe it).
export function resolveOverrideWithSource(overridesIndex, field, loc) {
  const byKey = overridesIndex && overridesIndex[field];
  if (!byKey) return { value: null, source: null };
  const { state, patch } = scopeIdsForLoc(loc);
  if (loc != null && byKey[overrideKey('store', loc)] != null) return { value: byKey[overrideKey('store', loc)], source: 'store' };
  if (patch != null && byKey[overrideKey('patch', patch)] != null) return { value: byKey[overrideKey('patch', patch)], source: 'patch' };
  if (state != null && byKey[overrideKey('state', state)] != null) return { value: byKey[overrideKey('state', state)], source: 'state' };
  if (byKey[overrideKey('company')] != null) return { value: byKey[overrideKey('company')], source: 'company' };
  return { value: null, source: null };
}

// Overlay every field the index carries onto an already-resolved targets object for one loc.
// Never removes a field baseTargets already had unless an override for that SAME field resolves
// (so a store with no override at any tier is completely unaffected — this is purely additive).
export function applyTargetOverrides(baseTargets, overridesIndex, loc) {
  if (!overridesIndex) return baseTargets;
  const fields = Object.keys(overridesIndex);
  if (!fields.length) return baseTargets;
  const out = { ...baseTargets };
  for (const field of fields) {
    const v = resolveOverride(overridesIndex, field, loc);
    if (v != null) out[field] = v;
  }
  return out;
}

// Registry of fields the Targets editor (src/views/targets-editor.js) exposes. Scoped to what
// THIS dispatch is actually about, per its own "ship real coverage for these first, not a
// placeholder shell" instruction — extending coverage later is adding one row here, the UI and
// data model underneath are already generic.
//
// `reviewKey` cross-references review-engine.js's DEFAULT_REVIEW_CONFIG metric key, and `field`
// is the exact key REVIEW_METRIC_TARGET_FIELD maps that metric's target from — so this table and
// review-engine.js's map describe the same wiring from two directions and must stay in sync
// (src/__tests__/target-overrides.test.js checks that every reviewKey here really is in
// REVIEW_METRIC_TARGET_FIELD, not just documented as if it were).
export const TARGET_OVERRIDE_FIELDS = [
  { field: 'tMcdWait', reviewKey: 'delivWait', label: 'Delivery Wait (sec)', unit: 'sec',
    note: 'Workbook-sourced (yearly targets, "McDelivery Restaurant Wait Time"). Override to adjust without a re-upload.' },
  { field: 'tDigAppGCRD', reviewKey: 'digitalGC', label: 'Digital App GC/Rest/Day', unit: 'num',
    note: 'Workbook-sourced (yearly targets, "Digital App (GC/R/D)").' },
  { field: 'tMcdGCRD', reviewKey: 'delivGC', label: 'Delivery GC/Rest/Day', unit: 'num',
    note: 'Workbook-sourced (yearly targets, "McDelivery (GC/R/D)").' },
  { field: 'tHeadcount', reviewKey: 'headcount', label: 'Total Headcount', unit: 'num',
    note: 'Workbook-sourced (yearly targets, "Total Headcount Target").' },
  { field: 'tShiftLeaders', reviewKey: 'shiftCert', label: 'Shift Leader / Shift-Cert Mgr Target', unit: 'num',
    note: 'Workbook-sourced (yearly targets, "Shift Leader Target") — reused as the closest existing match for '
      + '"# Shift Certified Managers" (see review-engine.js REVIEW_METRIC_TARGET_FIELD comment; not confirmed to '
      + 'be the exact same concept). Override here if that mapping is wrong for a scope.' },
  { field: 'tFOBTarget', reviewKey: 'foodOB', label: 'FOB % Target', unit: 'pct',
    note: 'Workbook-sourced (yearly or monthly targets — monthly already wins when both exist). The review\'s '
      + 'Food-Over-Base $ target is this % × the month\'s sales.' },
  { field: 'tTotalProfitTarget', reviewKey: 'totalProfit', label: 'Total Profit vs Target ($)', unit: 'usd',
    note: 'No workbook source exists for this. Until an override is set (at any scope), Total Profit scores on '
      + 'the interim rule: positive actual = passing, non-positive = not passing.' },
  { field: 'tComplaintsTarget', reviewKey: 'complaints', label: 'Complaint Contacts /100K', unit: 'num',
    note: 'No workbook source: the yearly workbook\'s "1-800 Contacts" column is a raw per-store COUNT target, '
      + 'not a /100K rate, and no guest-count-normalized actual is captured anywhere in the app yet — set an '
      + 'interim numeric target here rather than reusing that count.' },
];
