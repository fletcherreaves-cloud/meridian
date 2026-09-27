// @ts-nocheck
export default {version:'5.485', date:'2026-09-27', changes:[
  'EOM recap retuned + promoted to the GM default (owner-approved design, ships ahead of the ' +
  'next 3-day EOM inventory cycle): formatDiagnosisReport(mode:\'recap\') in eom-diagnosis.js now ' +
  'reads (a) Recount Candidates first -- cap raised 5→10 (RECAP_RECOUNT_CAP) and scoped to ' +
  'Food class only (Condiment stays supported by the underlying engine + mode:\'full\'\'s own ' +
  'Top-5, unchanged) -- then (b) Waste flags -- the waste-pattern/integrity findings that used to ' +
  'be folded into a single soft footnote line now get their own visible, capped, ranked section ' +
  '(RECAP_WASTE_FLAG_CAP), excluding the two checks that are manager-attribution by design ' +
  '(waste-patterns, waste-session -- those stay in the Chronic Offenders / Count Swings deep-dive ' +
  'tabs) -- then (c) Missed/uncounted items, same content as before, now third. mode:\'full\' is ' +
  'completely unchanged.',
  'Inventory Control (eom-dashboard.js) has a new default landing view for a single-store role ' +
  '(GM / SM-AM-DM, resolved from the signed-in profile\'s accessible_locs -- App.js now fetches ' +
  'that field alongside role/name and passes it + userRole down): a "My Store" tab replaces the ' +
  'district-wide Scoreboard/Cadence/etc. tab strip entirely, showing that store\'s live-computed ' +
  'recap (same computeDraft() the existing 🔬 Diagnose/✉️ Draft flow uses, so ' +
  'it can never drift, and never memoized so it can never go stale across a data refresh) with a ' +
  'prominent one-click Share button wired to the existing createShare()/createEomShareLink()/ ' +
  'shareOrCopy() mechanism. Supervisor/DO/OM/AS/Admin/Owner -- anyone without exactly one ' +
  'accessible_locs entry -- land on the existing multi-store Scoreboard/Progress default, ' +
  'completely unchanged. The existing per-row 🔬 Diagnose button + its draft modal ' +
  '(used by supervisors reviewing another store) is untouched.',
  'Note: eom-dashboard\'s own nav/route perm gate (panel-registry.js, perm:\'analytics.district\') ' +
  'still excludes gm/sm_am_dm today (GM_PERMS/SM_AM_DM_PERMS both carry analytics.district:false, ' +
  'analytics.store:true) -- a separate, pre-existing RBAC decision this dispatch does not widen. ' +
  'The default-view logic is wired and will activate the moment that gate opens (or a role is ' +
  'reached via a direct route); flagged here rather than fixed, since relaxing a panel-level perm ' +
  'is its own judgment call, not an execution detail of this recap change.',
  '7 new tests (src/__tests__/dispatch-eom-recap-priority-2026-09-27.test.js) against the real ' +
  'exported formatDiagnosisReport/RECAP_* constants -- confirmed to fail against the pre-fix ' +
  'engine (5/6 substantive assertions red) before the fix, all green after; existing eom-diagnosis ' +
  'recap tests updated for the new order/heading text, not weakened. Full suite green. Build ' +
  'clean, eager payload 552.89 KB gzip (budget 850 KB).',
]};
