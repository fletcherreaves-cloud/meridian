// @ts-nocheck
// #232 Finding 3 — split out of store-dash.js. App.js needs exactly three of store-dash.js's 47
// exports unconditionally at startup (an effect that migrates legacy flat targets to the v2
// format on mount, and a memo that computes mergedTargets) — everything else App.js imported from
// that file was either dead (never referenced) or already gated behind view/show state. Those
// three pure functions — ymKey, loadTargetsV2, migrateTargetsToV2 — were the ONLY thing keeping
// the whole 145 KB store-dash.js file (chart-component library + Chart.js runtime + a dozen panel
// components) pinned into the entry chunk, the same INEFFECTIVE_DYNAMIC_IMPORT mechanism #230/#232
// already fixed for analytics.js/projections.js/pace-to-target.js. saveTargetsV2 isn't imported by
// App.js directly but is migrateTargetsToV2's own internal dependency, so it travels here too.
//
// store-dash.js still owns the REST of the monthly/yearly-targets CRUD (getMonthTargets,
// setMonthTargets, copyMonthTargets, toggleMonthLock, exportTargetsV2, getTargetMonths, and the
// separate yearly-targets group) — those are used only by UnifiedTargetsPanel/MonthlyTargetManager/
// EventCalendar, which stay in store-dash.js and are now lazy-loaded, so there's no reason to move
// them out too. store-dash.js imports ymKey/loadTargetsV2/saveTargetsV2 back from this file to keep
// its own functions working — single source of truth, not a duplicate.

// Storage: localStorage 'mf_targets_v2': { 'YYYY-MM': { loc: {targets} } }

export function ymKey(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function loadTargetsV2() {
  try { return JSON.parse(localStorage.getItem('mf_targets_v2') || '{}'); } catch { return {}; }
}

export function saveTargetsV2(data) {
  try { localStorage.setItem('mf_targets_v2', JSON.stringify(data)); return true; } catch { return false; }
}

// Bootstrap: migrate existing flat targets to v2 format for current month
export function migrateTargetsToV2(userTargets, ym) {
  if (!userTargets || !Object.keys(userTargets).length) return;
  const v2 = loadTargetsV2();
  if (v2[ym]) return; // already have this month
  v2[ym] = {};
  Object.entries(userTargets).forEach(([loc, tgts]) => {
    if (loc && tgts && typeof tgts === 'object') v2[ym][loc] = { ...tgts };
  });
  saveTargetsV2(v2);
}
