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
// dispatch #132 was actually about, then extended by dispatch #135 to the REST of
// DEFAULT_REVIEW_CONFIG's `src:'manual'` metrics the owner explicitly asked to add — extending
// coverage further later is adding one row here, the UI and data model underneath are already
// generic.
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
  // ── Dispatch #135 item 2 — re-verified, not just re-asserted (owner explicitly disputed #132's
  // "no workbook source" finding for these two). Re-checked parseYearlyTargets/parseMonthlyTargets
  // (src/parsers/index.js) header-by-header, the live production yearly_targets/monthly_targets
  // Supabase schema+data (service-role query, 2026-08-25), and supabase/schema-yearly-targets.sql's
  // own "Full column capture" column list. Neither table has a Total-Profit column, confirming
  // #132's finding stands for that one. Complaints is more nuanced — see its note below.
  { field: 'tTotalProfitTarget', reviewKey: 'totalProfit', label: 'Total Profit vs Target ($)', unit: 'usd',
    note: 'No column for this exists in yearly_targets or monthly_targets (parser + live production schema '
      + 're-checked 2026-08-25 — zero "profit" hits in src/parsers/index.js, and the real Supabase table columns '
      + 'confirm it). A DIFFERENT owner workbook, MFR_Performance_Review_ver_4.xlsm ("Metric Scoring" sheet, '
      + 'audited memory/perf-review-excel-audit.md), does define real Total Profit RATING BANDS (±0.42%/1.30%) — '
      + 'likely what "found in targets" refers to — but that is a scoring-threshold definition, not a per-store '
      + 'target VALUE, and is out of this dispatch\'s scope (see that file\'s open "align to Excel bands" item). '
      + 'Until an override is set here (at any scope), Total Profit scores on the interim rule: positive actual = '
      + 'passing, non-positive = not passing.' },
  { field: 'tComplaintsTarget', reviewKey: 'complaints', label: 'Complaint Contacts /100K', unit: 'num',
    note: 'The yearly workbook DOES carry a real, live column here — "1-800 Contacts" (t1800Contacts / '
      + 'contacts_1800 in Supabase; memory/qsrsoft-report-catalog.md records a real district value, LY 223.3 → '
      + '2026 target 197.0) — so the owner is right that something under this name is "in Yearly Targets". But '
      + 'it is a raw per-store COUNT target (plain parseFloat, no guest-count normalization anywhere near it), '
      + 'not the /100K RATE this review metric scores, and no guest-count-normalized actual is captured anywhere '
      + 'in the app either — re-checked 2026-08-25, unchanged from #132. Set an interim /100K target here rather '
      + 'than reusing the raw count.' },
  // ── Dispatch #135 item 1 — the REST of DEFAULT_REVIEW_CONFIG's src:'manual' metrics, now
  // explicitly requested by the owner. Investigated the same way as totalProfit/complaints above,
  // not assumed override-only: re-read parseYearlyTargets/parseMonthlyTargets in full (2026-08-25)
  // for EPB2B/FS Audits/EcoSure/FS Tablet/Shift Verifications/Retention — zero header matches for
  // any of the six. performance-reviews.js's own SRC() lines (Customize → Reviews help text)
  // independently confirm each ACTUAL comes from a system other than the targets workbook (SMG
  // FullScale, QSRSoft SimpleThink Forms, EcoSure visit-report emails, Squaddle/Jolt, Pace Portal,
  // QSRSoft shift-verification records, manual observation) — none of those systems' values flow
  // into yearly_targets/monthly_targets either. All six are genuinely override-only.
  { field: 'tEPB2BTarget', reviewKey: 'epb2b', label: 'EPB2B (Pace Portal, %)', unit: 'pct',
    note: 'No workbook target column (checked both parsers). Actual is sourced from SMG FullScale, "Experienced '
      + 'a Problem (Yes) → 1-rating %" (see performance-reviews.js SRC notes). Override-only.' },
  { field: 'tFSAuditsTarget', reviewKey: 'fsAudits', label: 'FS Audits Completed', unit: 'pct',
    note: 'No workbook target column. Actual is sourced from QSRSoft SimpleThink → Forms → Completed Forms '
      + '(filtered by manager/supervisor). Override-only.' },
  { field: 'tFSEcoSureTarget', reviewKey: 'fsEcoSure', label: 'Food Safety EcoSure (%)', unit: 'pct',
    note: 'No workbook target column. Actual is sourced from EcoSure visit reports (email) — see also '
      + 'memory/finding-ecosure-propel-api-2026-08-22.md for the Propel API sample now available for the '
      + 'separate Visit Readiness engine; that is real-visit ACTUAL data, not a workbook TARGET. Override-only.' },
  { field: 'tFSTabletTarget', reviewKey: 'fsTablet', label: 'FS Completion T-60 (%)', unit: 'pct',
    note: 'No workbook target column. Actual is sourced from the Squaddle or Jolt app. Override-only.' },
  { field: 'tShiftVerifTarget', reviewKey: 'shiftVerif', label: '# Shift Verifications by GM', unit: 'num',
    note: 'No workbook target column. Actual is sourced from QSRSoft shift-verification records — performance-'
      + 'reviews.js\'s own SRC note flags this as "not currently used by this org." Override-only.' },
  { field: 'tRetentionTarget', reviewKey: 'retention', label: 'Execution of Retention Prg.', unit: 'pct',
    note: 'No workbook target column. Actual is a manual Y/N judgment call ("observed execution") — '
      + 'memory/perf-review-excel-audit.md records this as a subjective/participation metric the owner flagged '
      + 'as possibly optional, not tied to a hard number. Override-only.' },
];
