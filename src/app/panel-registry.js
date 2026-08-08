// @ts-nocheck
// ── Panel registry — ONE source of truth for every panel in the app ──────────
//
// Built 2026-08-07 for the UI/UX restructure (Notes 54). Before this, opening a panel
// meant keeping FOUR hand-maintained lists in sync:
//   1. the nav item          src/app/shell.js
//   2. the onOpenModal chain  src/app/App.js  (~78 `if (modal === '…')` branches)
//   3. the render list        src/app/App.js  (~85 `showX && h(Panel)` lines)
//   4. anyModalOpen           src/app/App.js  (a hand-written OR of ~60 booleans)
// …plus a permission check duplicated between (1) and (2).
//
// The drift that causes is already in the codebase: DevDashboard, AIInsightsLog,
// AnomalyPanel and ForecastAudit all have state and render lines but NOTHING can open
// them; showMonthlyProj / showSmartTargetsV2 / showLaborAnalysis / showSkillsMatrix are
// declared and counted in anyModalOpen but never rendered.
//
// This file is generated-then-curated from the live code, not transcribed — every id,
// permission and nav label below was extracted from shell.js and App.js so it matches
// what actually ships.
//
// FIELDS
//   id       modal id used by onOpenModal (unchanged — legacy deep-links keep working)
//   label    sidebar label
//   icon     sidebar icon
//   perm     permission key, or null for ungated. Checked ONCE, here.
//   kind     nav          — a real sidebar entry
//            hub-tab      — opens a hub and selects a tab (no sidebar entry of its own)
//            optional     — Panel Manager registry, hidden by default (constants.js OPTIONAL_PANELS)
//            test-kitchen — experimental; hidden when betaMode is on
//            internal     — reachable only from inside another panel
//            orphan       — renders, but NOTHING opens it. Recorded so it's findable
//                           rather than silently dead. See ORPHANS below.
//   section  NEW information architecture (Notes 54). Used by the v2 sidebar only —
//            the v1 sidebar keeps its existing literal list until v2 is adopted.
export const PANELS = [
  { id:'about', label:'About', icon:'ℹ️', perm:null, kind:'nav', section:'help' },
  { id:'above-store', label:'Above-Store One-Pager', icon:'📄', perm:'analytics.district', kind:'nav', section:'reports' },
  { id:'aiscan', label:'Anomaly Scan', icon:'🔍', perm:'analytics.ai', kind:'optional', section:'intelligence' },
  { id:'attention', label:'Needs Attention', icon:'🔴', perm:null, kind:'nav', section:'notifications' },
  { id:'brief', label:'Forecast Brief', icon:'🔭', perm:'analytics.brief', kind:'nav', section:'analytics' },
  { id:'calendar-manager', label:'Calendar', icon:'📅', perm:'analytics.dashboard', kind:'nav', section:'planning' },
  { id:'channel-intel', label:'Channel Intel', icon:'📊', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'compare', label:'Store Compare', icon:'⇄', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'corr-explorer', label:'Metric Correlations', icon:'🔗', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'dar-daypart', label:'DAR Analysis', icon:'⏱', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'data-manager', label:'Data Manager', icon:'🗄', perm:'data.upload', kind:'nav', section:'admin' },
  { id:'delivery-mix', label:'3PO Delivery', icon:'🛵', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'dialedin', label:'DI Calibration', icon:'◎', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting' },
  { id:'dicompare', label:'DI Compare', icon:'⚡', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting' },
  { id:'district-lens', label:'District Lens', icon:'🌐', perm:'analytics.district', kind:'optional', section:'analytics' },
  { id:'dt-sos', label:'DT Speed of Service', icon:'🚗', perm:'analytics.store', kind:'nav', section:'analytics' },
  { id:'news', label:'Local News', icon:'📰', perm:'analytics.store', kind:'nav', section:'analytics' },
  { id:'count-cycle', label:'Count Cycle', icon:'📋', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'eom-dashboard', label:'Inventory Control', icon:'📦', perm:'analytics.district', kind:'nav', section:'operations' },
  { id:'eom-summary', label:'EOM Supervisor', icon:'📊', perm:'analytics.district', kind:'nav', section:'operations' },
  { id:'event-impact', label:'Event Impact', icon:'📈', perm:'analytics.dashboard', kind:'nav', section:'planning' },
  { id:'events', label:'Events & Tags', icon:'◷', perm:null, kind:'nav', section:'planning' },
  { id:'fcst-accuracy', label:'Forecast Accuracy', icon:'🎯', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting' },
  { id:'fcst-ref', label:'Fcst Reference', icon:'📐', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting' },
  { id:'feature-requests', label:'Feature Requests', icon:'💡', perm:null, kind:'nav', section:'help' },
  { id:'fob-analysis', label:'Food Cost', icon:'🥗', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'fob-eom', label:'End of Month', icon:'📋', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'forms-library', label:'Forms Library', icon:'🗂', perm:null, kind:'nav', section:'forms' },
  { id:'forms-print', label:'Printable Forms', icon:'🖨', perm:null, kind:'nav', section:'forms' },
  { id:'gm-brief', label:'GM Letters', icon:'👨‍💼', perm:'analytics.store', kind:'optional', section:'reports' },
  { id:'graded-visits', label:'Graded Visits', icon:'📋', perm:'analytics.store', kind:'nav', section:'people' },
  { id:'help', label:'Help', icon:'?', perm:null, kind:'nav', section:'help' },
  { id:'inventory', label:'Inventory', icon:'📦', perm:'analytics.store', kind:'optional', section:'operations' },
  { id:'kb', label:'Knowledge Base', icon:'📖', perm:null, kind:'nav', section:'help' },
  { id:'labor-analysis', label:'Labor Analysis', icon:'', perm:'analytics.store', kind:'hub-tab', section:'scheduling' },
  { id:'labor-analytics', label:'Labor Analytics', icon:'', perm:'analytics.labor', kind:'hub-tab', section:'scheduling' },
  { id:'leader-one-pager', label:'Leadership One-Pager', icon:'📋', perm:null, kind:'nav', section:'reports' },
  { id:'lfz-gap', label:'LifeLenz Gap', icon:'📊', perm:'analytics.forecasting', kind:'test-kitchen', section:'scheduling' },
  { id:'lifelenz-bridge', label:'LifeLenz Bridge', icon:'🌉', perm:'analytics.forecasting', kind:'test-kitchen', section:'scheduling' },
  { id:'loc-intel', label:'Market Intelligence', icon:'🗺', perm:'analytics.store', kind:'nav', section:'analytics' },
  { id:'metric-lineage', label:'Metric Lineage', icon:'🔍', perm:null, kind:'nav', section:'help' },
  { id:'model-assign', label:'Forecast Models', icon:'🎯', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting' },
  { id:'monthly-proj', label:'Monthly Proj', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
  { id:'morning-brief', label:'Daily Brief', icon:'☀️', perm:'analytics.brief', kind:'nav', section:'daily' },
  { id:'my-reports', label:'My Reports', icon:'🗂', perm:'analytics.dashboard', kind:'nav', section:'reports' },
  { id:'one-pager', label:'Store One-Pager', icon:'📄', perm:'analytics.store', kind:'nav', section:'reports' },
  { id:'operator-summary', label:'Org Summary', icon:'📊', perm:'analytics.district', kind:'nav', section:'reports' },
  { id:'pace-target', label:'Pace Target', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
  { id:'panel-manager', label:'Panel Manager', icon:'🧩', perm:'settings.view', kind:'nav', section:'admin' },
  { id:'perf-calc', label:'Performance Calc', icon:'🧮', perm:'analytics.store', kind:'optional', section:'people' },
  { id:'perf-reviews', label:'Performance Reviews', icon:'📋', perm:'reviews.view', kind:'nav', section:'people' },
  { id:'planning', label:'Planning', icon:'🎯', perm:'analytics.store', kind:'nav', section:'planning' },
  { id:'pmix', label:'Product Mix', icon:'🍔', perm:'analytics.store', kind:'optional', section:'operations' },
  { id:'priorities', label:'Attention Now', icon:'🎯', perm:null, kind:'nav', section:'notifications' },
  { id:'priority-brief', label:'Priority Actions', icon:'🎯', perm:'analytics.brief', kind:'optional', section:'notifications' },
  { id:'proj', label:'Proj Workflow', icon:'🔒', perm:'analytics.forecasting', kind:'test-kitchen', section:'planning' },
  { id:'proj-brief', label:'Proj Brief', icon:'', perm:'analytics.forecasting', kind:'internal', section:'daily' },
  { id:'promo-roi', label:'Promo / Discount ROI', icon:'🎟️', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'pvsa', label:'Proj vs Actuals', icon:'◑', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting' },
  { id:'ranking', label:'Rankings', icon:'🏆', perm:'analytics.store', kind:'nav', section:'reports' },
  { id:'record-day', label:'Record Days', icon:'🏆', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'report', label:'Date-Range Report', icon:'📅', perm:null, kind:'nav', section:'reports' },
  { id:'revintel', label:'Revenue', icon:'◈', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'sage', label:'SAGE', icon:'🧠', perm:null, kind:'nav', section:'intelligence' },
  { id:'sched-hub', label:'Scheduling', icon:'🗓', perm:'analytics.store', kind:'nav', section:'scheduling' },
  { id:'sched-summary', label:'Sched Summary', icon:'', perm:'analytics.store', kind:'hub-tab', section:'scheduling' },
  { id:'scheduling', label:'Scheduling', icon:'', perm:'analytics.store', kind:'hub-tab', section:'scheduling' },
  { id:'settings', label:'Settings', icon:'⚙', perm:'settings.view', kind:'nav', section:'admin' },
  { id:'signals', label:'Signals', icon:'📡', perm:'analytics.store', kind:'nav', section:'analytics' },
  { id:'skills-matrix', label:'Skills Matrix', icon:'', perm:'analytics.store', kind:'hub-tab', section:'people' },
  { id:'smart-targets', label:'Smart Targets', icon:'', perm:null, kind:'internal', section:'planning' },
  { id:'smart-targets-v2', label:'Smart Targets V2', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
  { id:'smg-voice', label:'Guest Voice', icon:'💬', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'store-kb', label:'Store Kb', icon:'', perm:'analytics.store', kind:'internal', section:'admin' },
  { id:'targets', label:'Targets', icon:'', perm:null, kind:'internal', section:'planning' },
  { id:'task-queue', label:'Task Queue', icon:'⚡', perm:null, kind:'nav', section:'help' },
  { id:'unified-targets', label:'Unified Targets', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
  { id:'visit-readiness', label:'Visit Readiness', icon:'🛡️', perm:'analytics.store', kind:'nav', section:'people' },
  { id:'why-engine', label:'Why Engine', icon:'🔬', perm:'analytics.ai', kind:'optional', section:'intelligence' },
  { id:'yearly-proj', label:'Yearly Proj', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
];

// ── Dead navigation, measured 2026-08-07 ────────────────────────────────────
// Both lists are pinned by src/__tests__/panel-registry.test.js so they cannot grow.
// Neither is fixed here: wiring an orphan up or deleting vestigial state is a behaviour
// change, and Phase 1 ships as a pure refactor. Recorded so the decision is visible.

/** Panels with a render line in App.js that NOTHING sets true. Real, complete, unreachable. */
export const ORPHANS = [
  { id:'anomalies',      state:'showAnoms',    component:'AnomalyPanel',  note:'renders at App.js:3245; setShowAnoms is only ever called to close it' },
  { id:'ai-insights',    state:'showInsights', component:'AIInsightsLog', note:'renders at App.js:3169' },
  { id:'dev-dashboard',  state:'showDev',      component:'DevDashboard',  note:'renders at App.js:3171; would need a developer perm if reinstated' },
  { id:'forecast-audit', state:'showAudit',    component:'(inline)',      note:'renders at App.js:3472; also gated on selStore' },
];

/** State that survived the Notes 24 hub consolidation: only ever reset, never opened,
 *  never rendered. Harmless (always false) but each one is counted in anyModalOpen. */
export const VESTIGIAL_STATE = [
  'showLaborAnalysis', 'showLaborAnalytics', 'showMonthlyProj', 'showPace', 'showSchedSum',
  'showScheduling', 'showSkillsMatrix', 'showSmartTargetsV2', 'showUnifiedTargets', 'showYearly',
];

// Section order + display labels for the v2 sidebar (owner's specified IA, Notes 54).
export const SECTIONS = [
  { id:'daily',         label:'Daily' },
  { id:'notifications', label:'Notifications' },
  { id:'reports',       label:'Reports' },
  { id:'planning',      label:'Planning' },
  { id:'operations',    label:'Operations' },
  { id:'scheduling',    label:'Scheduling & Labor' },
  { id:'people',        label:'People' },
  { id:'analytics',     label:'Analytics' },
  { id:'forecasting',   label:'Forecasting' },
  { id:'forms',         label:'Forms' },
  { id:'intelligence',  label:'Intelligence' },
  { id:'help',          label:'Help' },
  { id:'admin',         label:'Admin' },
];

export const PANEL_BY_ID = Object.fromEntries(PANELS.map(p => [p.id, p]));

/** Panels a caller may see, for one section. `can` is App's perm(key) helper. */
export function panelsForSection(sectionId, can, { includeTestKitchen = false } = {}) {
  return PANELS.filter(p =>
    p.section === sectionId &&
    (p.kind === 'nav' || (includeTestKitchen && p.kind === 'test-kitchen')) &&
    (!p.perm || can(p.perm)));
}

/** Single permission gate. Replaces the duplicate check in nav AND in onOpenModal. */
export function canOpen(id, can) {
  const p = PANEL_BY_ID[id];
  if (!p) return false;          // unknown id — caller should treat as a bug, not a no-op
  return !p.perm || can(p.perm);
}
