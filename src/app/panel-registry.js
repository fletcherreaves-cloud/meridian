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
// The drift that causes is already in the codebase: DevDashboard, AIInsightsLog and
// AnomalyPanel have state and render lines but NOTHING can open them (ForecastAudit was
// briefly in this list too — corrected 2026-08-10, issue #114: it was never actually
// orphaned, it's live at src/features/projections.js:1808 with three real entry points;
// only a standalone App.js nav entry was missing, now added); showMonthlyProj /
// showSmartTargetsV2 / showLaborAnalysis / showSkillsMatrix are declared and counted in
// anyModalOpen but never rendered.
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
//   route    Dispatch27 Workstream E (the plan's rule: "would I ever want to send someone a link
//            to this?"). true = a DESTINATION — URL-synced via src/app/routing.js, rendered as a
//            full-page view that replaces AtAGlance/StoreDash/etc rather than overlaying them.
//            Omitted (falsy) = an INTERRUPTION — an ordinary modal, no URL footprint. Only the
//            four panels the plan specifically flagged as misclassified destinations carry this
//            today; adding it to a panel is a real routing change (see routing.js), not a label.
export const PANELS = [
  { id:'about', label:'About', icon:'ℹ️', perm:null, kind:'nav', section:'admin' },
  { id:'above-store', label:'Above-Store One-Pager', icon:'📄', perm:'analytics.district', kind:'nav', section:'analytics' },
  { id:'aiscan', label:'Anomaly Scan', icon:'🔍', perm:'analytics.ai', kind:'optional', section:'intelligence' },
  { id:'attention', label:'Needs Attention', icon:'🔴', perm:null, kind:'nav', section:'daily' },
  { id:'brief', label:'Forecast Brief', icon:'🔭', perm:'analytics.brief', kind:'nav', section:'analytics' },
  // Planning cluster, in the owner's own stated order (dispatch #54 Job B, 2026-08-21): "Planning
  // (the hub, keeping its five tabs) · Calendar · Events & Tags · Event Impact" -- four sidebar
  // links, the hub NOT exploded (its five internal tabs stay kind:'hub-tab', see monthly-proj/
  // pace-target/etc below). Grouped physically together here (not alphabetical, like the rest of
  // this array) because panelsForSection() renders in PANELS declaration order and this order is
  // an explicit owner decision, not incidental.
  { id:'planning', label:'Planning', icon:'🎯', perm:'analytics.store', kind:'nav', section:'planning' },
  { id:'calendar-manager', label:'Calendar', icon:'📅', perm:'analytics.dashboard', kind:'nav', section:'planning' },
  { id:'events', label:'Events & Tags', icon:'◷', perm:null, kind:'nav', section:'planning' },
  { id:'event-impact', label:'Event Impact', icon:'📈', perm:'analytics.dashboard', kind:'nav', section:'planning' },
  { id:'channel-intel', label:'Channel Intel', icon:'📊', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'compare', label:'Store Compare', icon:'⇄', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'corr-explorer', label:'Metric Correlations', icon:'🔗', perm:'analytics.store', kind:'optional', section:'analysis' },
  // Crew Schedule Lookup (dispatch #123) -- search an employee, see their upcoming schedule.
  // perm:'analytics.store' (dispatch #125, RBAC re-decision) -- was 'security.view' when the
  // panel gated behind an identity-reveal step; the owner reversed that ("no reason to hide
  // names for scheduling and punch times", 2026-08-25) and the panel now shows names directly
  // with no internal permission check of its own (see src/views/crew-schedule-panel.js's file
  // header for the full reasoning). This is now ORDINARY panel RBAC -- the same nav-gate key
  // Labor Tools/Scheduling/Calendar Manager use, backstopped by the table's own accessible_locs
  // RLS (supabase/schema-lifelenz-shift-assignments.sql), not a panel-specific gate.
  { id:'crew-schedule', label:'Crew Schedule', icon:'🗓', perm:'analytics.store', kind:'nav', section:'people', route:true },
  { id:'dar-daypart', label:'DAR Analysis', icon:'⏱', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'data-manager', label:'Data Manager', icon:'🗄', perm:'data.upload', kind:'nav', section:'admin' },
  { id:'delivery-mix', label:'3PO Delivery', icon:'🛵', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'dialedin', label:'DI Calibration', icon:'◎', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting', tkOrder:4 },
  { id:'dicompare', label:'DI Compare', icon:'⚡', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting', route:true, tkOrder:7 },
  { id:'district-lens', label:'District Lens', icon:'🌐', perm:'analytics.district', kind:'optional', section:'analytics' },
  { id:'dt-sos', label:'DT Speed of Service', icon:'🚗', perm:'analytics.store', kind:'nav', section:'analytics' },
  { id:'news', label:'Local News', icon:'📰', perm:'analytics.store', kind:'nav', section:'analytics' },
  { id:'count-cycle', label:'Count Cycle', icon:'📋', perm:'analytics.store', kind:'nav', section:'inventory-food-cost', route:true },
  { id:'eom-dashboard', label:'Inventory Control', icon:'📦', perm:'analytics.district', kind:'nav', section:'inventory-food-cost', route:true },
  { id:'eom-summary', label:'EOM Supervisor', icon:'📊', perm:'analytics.district', kind:'nav', section:'operations' },
  // fcst-accuracy CONVERTED 2026-08-24 (dispatch #106 Phase B) from a standalone route:true
  // entry to kind:'hub-tab' -- same "opens a hub and selects a tab, no sidebar entry of its
  // own" pattern this registry already uses for sched-summary/labor-analysis/skills-matrix
  // etc (see the `kind` field doc above). Opening 'fcst-accuracy' now selects
  // ForecastReportsPanel's Forecast Accuracy tab and routes to 'forecast-reports' below, exactly
  // like 'labor-analytics' selects SchedulingHubPanel's Analytics tab and routes to 'sched-hub'.
  // Its own panel component (ForecastAccuracyPanel, src/views/analytics.js) is unchanged.
  { id:'fcst-accuracy', label:'Forecast Accuracy', icon:'🎯', perm:'analytics.forecasting', kind:'hub-tab', section:'forecasting' },
  // route:true — Dispatch #121: converted from a small ModalShell+iframe to a real URL-addressable
  // page (RoutePanelShell in App.js), per memory/panel-contract.md's standing conversion rule.
  { id:'fcst-ref', label:'Fcst Reference', icon:'📐', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting', route:true, tkOrder:8 },
  // disabledWhen:'noStore' (dispatch #61) -- the one per-item option in the old hand-built
  // shell.js list (`navPBeta('forecast-audit', { disabled: !selStore })`). Declared here so the
  // derived Test Kitchen loop doesn't need to special-case this id -- shell.js maps the key to
  // the actual `!selStore` predicate (the registry has no access to component-local state).
  { id:'forecast-audit', label:'Forecast Audit', icon:'🔬', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting', tkOrder:10, disabledWhen:'noStore' },
  // NEW 2026-08-24 (dispatch #106 Phase B) — one parent entry, route:true, replacing the two
  // former standalone route entries above/below (fcst-accuracy, lifelenz-bridge — both now
  // kind:'hub-tab', see their own comments), each now an internal tab of ForecastReportsPanel
  // (src/features/forecast-reports.js — a thin shell, reuses ForecastAccuracyPanel/
  // LifeLenzBridgePanel as-is, no logic duplicated into it). Takes fcst-accuracy's old tkOrder
  // slot (5) since it's the primary of the two merged reports. kind:'test-kitchen' — same
  // status either former entry had, not a promotion.
  // Label "Forecast Reports" — owner-confirmed 2026-08-24 ("Forecast Reports > approved"),
  // choosing it over the dispatch's other candidate, "Forecasting Center". Not a proposal
  // anymore; do not re-open the naming question. See memory/dispatch-106.md's Resolution section.
  { id:'forecast-reports', label:'Forecast Reports', icon:'🎯', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting', route:true, tkOrder:5 },
  { id:'feature-requests', label:'Feature Requests', icon:'💡', perm:null, kind:'nav', section:'analytics' },
  { id:'fob-analysis', label:'Food Cost', icon:'🥗', perm:'analytics.store', kind:'nav', section:'inventory-food-cost', route:true },
  { id:'fob-eom', label:'End of Month', icon:'📋', perm:'analytics.store', kind:'nav', section:'inventory-food-cost', route:true },
  // QSRSoft Forms dashboard, Slice 2 of 3 -- kind:'test-kitchen' since Slice 3's pull script
  // (the data source) hasn't shipped yet; the panel renders an honest empty state against a real
  // read, not fake data. Promote to kind:'nav' once Slice 3 lands and the owner has seen it live.
  { id:'forms-completion', label:'Form Completions', icon:'✅', perm:'analytics.store', kind:'test-kitchen', section:'forms', tkOrder:9 },
  { id:'forms-library', label:'Forms Library', icon:'🗂', perm:null, kind:'nav', section:'forms' },
  { id:'forms-print', label:'Printable Forms', icon:'🖨', perm:null, kind:'nav', section:'forms' },
  { id:'gm-brief', label:'GM Letters', icon:'👨‍💼', perm:'analytics.store', kind:'optional', section:'reports' },
  // Owner-answered 2026-08-21 (dispatch #54 Job B): "They would be more Operations" -- moved out
  // of People alongside visit-readiness below.
  { id:'graded-visits', label:'Graded Visits', icon:'📋', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'help', label:'Help', icon:'?', perm:null, kind:'nav', section:'admin' },
  // Dispatch #54 Job A found this had NO sidebar entry at all (only reachable via ?modal=inventory
  // deep link). Job B's Inventory & Food Cost section gives it a real one for the first time --
  // the owner's own list explicitly named it ("plus Inventory and Product Mix").
  { id:'inventory', label:'Inventory', icon:'📦', perm:'analytics.store', kind:'nav', section:'inventory-food-cost' },
  { id:'kb', label:'Knowledge Base', icon:'📖', perm:null, kind:'nav', section:'admin' },
  { id:'labor-allocation', label:'Labor Allocation', icon:'', perm:'analytics.store', kind:'hub-tab', section:'scheduling' },
  { id:'labor-analysis', label:'Labor Analysis', icon:'', perm:'analytics.store', kind:'hub-tab', section:'scheduling' },
  { id:'labor-analytics', label:'Labor Analytics', icon:'', perm:'analytics.labor', kind:'hub-tab', section:'scheduling' },
  { id:'leader-one-pager', label:'Leadership One-Pager', icon:'📋', perm:null, kind:'nav', section:'analytics' },
  { id:'lfz-gap', label:'LifeLenz Gap', icon:'📊', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting', tkOrder:6 },
  // lifelenz-bridge CONVERTED 2026-08-24 (dispatch #106 Phase B) from a standalone route:true
  // entry to kind:'hub-tab', same pattern as fcst-accuracy above — opens ForecastReportsPanel's
  // "MBI vs LifeLenz Accuracy" tab (the name dispatch #105 confirmed with the owner, unchanged
  // by the merge) and routes to 'forecast-reports'. Its own panel component (LifeLenzBridgePanel,
  // src/features/lifelenz.js) is unchanged.
  { id:'lifelenz-bridge', label:'MBI vs LifeLenz Accuracy', icon:'🌉', perm:'analytics.forecasting', kind:'hub-tab', section:'forecasting' },
  { id:'loc-intel', label:'Market Intelligence', icon:'🗺', perm:'analytics.store', kind:'nav', section:'analytics' },
  { id:'metric-lineage', label:'Metric Lineage', icon:'🔍', perm:null, kind:'nav', section:'admin' },
  { id:'model-assign', label:'Forecast Models', icon:'🎯', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting', tkOrder:3 },
  { id:'monthly-proj', label:'Monthly Proj', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
  { id:'morning-brief', label:'Daily Brief', icon:'☀️', perm:'analytics.brief', kind:'nav', section:'daily' },
  { id:'my-reports', label:'My Reports', icon:'🗂', perm:'analytics.dashboard', kind:'nav', section:'analytics' },
  { id:'one-pager', label:'Store One-Pager', icon:'📄', perm:'analytics.store', kind:'nav', section:'analytics' },
  // Opportunity $ v1 (memory/design-opportunity-dollars.md) -- flagship "every performance gap
  // becomes recoverable dollars" panel. kind:'test-kitchen' with its real eventual section:
  // 'analytics' set from day one (promotion is a `kind:` flip only, dispatch #61); it sits next
  // to the At-A-Glance headline tile that already links here (onOpenModal('opportunity-dollars')).
  { id:'opportunity-dollars', label:'Opportunity $', icon:'💰', perm:'analytics.district', kind:'test-kitchen', section:'analytics', tkOrder:13 },
  { id:'operator-summary', label:'Org Summary', icon:'📊', perm:'analytics.district', kind:'nav', section:'reports' },
  { id:'pace-target', label:'Pace Target', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
  { id:'panel-manager', label:'Panel Manager', icon:'🧩', perm:'settings.view', kind:'nav', section:'admin' },
  { id:'perf-calc', label:'Performance Calc', icon:'🧮', perm:'analytics.store', kind:'optional', section:'people' },
  { id:'perf-reviews', label:'Performance Reviews', icon:'📋', perm:'reviews.view', kind:'nav', section:'people', route:true },
  { id:'pmix', label:'Product Mix', icon:'🍔', perm:'analytics.store', kind:'optional', section:'inventory-food-cost' },
  { id:'priority-brief', label:'Priority Actions', icon:'🎯', perm:'analytics.brief', kind:'optional', section:'notifications' },
  // label/icon corrected 2026-08-21 (dispatch #54 Job A): was 'Proj Workflow'/lock, a stale
  // label from the PRUNED duplicate nav line in shell.js (the live line has said
  // 'Projections'/▦ since v4.517 -- the registry was built from the pruned line, not the live
  // one). Today's UI wins.
  // section corrected 2026-08-21 (dispatch #55 Part A) -- was 'planning', which is false and
  // went unnoticed only because kind:'test-kitchen' makes section: inert. Left wrong, a future
  // promotion would have dropped Projections into the Planning section's owner-approved four
  // links (#516) instead of Forecasting and Labor Projections where it belongs.
  { id:'proj', label:'Projections', icon:'▦', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting', route:true, tkOrder:1 },
  { id:'proj-brief', label:'Proj Brief', icon:'', perm:'analytics.forecasting', kind:'internal', section:'daily' },
  { id:'promo-roi', label:'Promo / Discount ROI', icon:'🎟️', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'pvsa', label:'Proj vs Actuals', icon:'◑', perm:'analytics.forecasting', kind:'test-kitchen', section:'forecasting', tkOrder:2 },
  { id:'ranking', label:'Rankings', icon:'🏆', perm:'analytics.store', kind:'nav', section:'reports' },
  { id:'record-day', label:'Record Days', icon:'🏆', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'report', label:'Date-Range Report', icon:'📅', perm:null, kind:'nav', section:'daily', route:true },
  { id:'revintel', label:'Revenue', icon:'◈', perm:'analytics.store', kind:'optional', section:'analytics' },
  { id:'sage', label:'SAGE', icon:'🧠', perm:null, kind:'nav', section:'analytics' },
  { id:'sched-hub', label:'Scheduling', icon:'🗓', perm:'analytics.store', kind:'nav', section:'scheduling', route:true },
  // Schedule Retention Report (dispatch #134) -- permanent, per-location report: pick a store +
  // a period, see every LifeLenz business week in it side by side (same rollup() metrics
  // Schedule Summary already computes), to check whether a store retained training from a
  // schedule workshop. A separate, standalone route:true entry (not a Scheduling-hub tab) --
  // it's inherently single-store, unlike every other tab in that hub. kind:'nav' from day one
  // per the standing route-migration rule.
  { id:'sched-retention', label:'Training Retention', icon:'🎓', perm:'analytics.store', kind:'nav', section:'scheduling', route:true },
  { id:'sched-summary', label:'Sched Summary', icon:'', perm:'analytics.store', kind:'hub-tab', section:'scheduling' },
  { id:'scheduling', label:'Scheduling', icon:'', perm:'analytics.store', kind:'hub-tab', section:'scheduling' },
  // Static nav gate only (admin/supervisor always match, manager sees the entry per
  // permissions.js's comment) -- the REAL RLS-tier check, including the manager
  // org_config.gm_identity_reveal_enabled condition this key can't express, happens live inside
  // src/views/security-panel.js's securityPanelAccess(). Never treat `perm:'security.view'`
  // alone as sufficient for a manager.
  { id:'security', label:'Security', icon:'🔒', perm:'security.view', kind:'nav', section:'people' },
  { id:'settings', label:'Settings', icon:'⚙', perm:'settings.view', kind:'nav', section:'admin' },
  { id:'signals', label:'Signals', icon:'📡', perm:'analytics.store', kind:'nav', section:'analytics' },
  { id:'skills-matrix', label:'Skills Matrix', icon:'', perm:'analytics.store', kind:'hub-tab', section:'people' },
  { id:'smart-targets', label:'Smart Targets', icon:'', perm:null, kind:'internal', section:'planning' },
  { id:'smart-targets-v2', label:'Smart Targets V2', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
  { id:'smg-voice', label:'Guest Voice', icon:'💬', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'store-kb', label:'Store Kb', icon:'', perm:'analytics.store', kind:'internal', section:'admin' },
  { id:'targets', label:'Targets', icon:'', perm:null, kind:'internal', section:'planning' },
  // Targets Editor (dispatch #132 item 3) -- company/state/patch/store override cascade for
  // Performance Review target fields that have no (or an adjustable) workbook source. Gated on
  // reviews.customize (same perm as "Customize scoring weights & thresholds" -- admin-only by
  // default, supervisor/manager false) since it's the same class of admin action: changing how
  // reviews score, not viewing/submitting one. section:'people', next to perf-reviews, since
  // every field it edits today is a Performance Review metric target.
  { id:'targets-editor', label:'Targets Editor', icon:'🎯', perm:'reviews.customize', kind:'nav', section:'people' },
  { id:'task-queue', label:'Task Queue', icon:'⚡', perm:null, kind:'nav', section:'analytics' },
  // Dispatch #77 -- gated on analytics.district (a general leaderboard, not a Security panel;
  // must NOT inherit security.view), kind:'test-kitchen' with its real eventual section:'analytics'
  // set from day one, per the standing rule (promotion is a `kind:` flip only, dispatch #61).
  { id:'top-bottom', label:'Top/Bottom Performers', icon:'🏆', perm:'analytics.district', kind:'test-kitchen', section:'analytics', tkOrder:12 },
  { id:'unified-targets', label:'Unified Targets', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
  { id:'visit-readiness', label:'Visit Readiness', icon:'🛡️', perm:'analytics.store', kind:'nav', section:'operations' },
  { id:'why-engine', label:'Why Engine', icon:'🔬', perm:'analytics.ai', kind:'optional', section:'analysis' },
  { id:'yearly-proj', label:'Yearly Proj', icon:'', perm:'analytics.store', kind:'hub-tab', section:'planning' },
];

// ── Dead navigation, measured 2026-08-07 ────────────────────────────────────
// Both lists are pinned by src/__tests__/panel-registry.test.js so they cannot grow.
// Neither is fixed here: wiring an orphan up or deleting vestigial state is a behaviour
// change, and Phase 1 ships as a pure refactor. Recorded so the decision is visible.

/** Panels with a render line in App.js that NOTHING sets true. Real, complete, unreachable.
 *  ForecastAudit was removed from this list 2026-08-10 (issue #114) — it was never actually
 *  orphaned (live at src/features/projections.js:1808, three real entry points); it now also
 *  has a standalone nav entry (id 'forecast-audit' in PANELS above) wired to the same
 *  showAudit state this list used to describe as unreachable.
 *  dev-dashboard removed 2026-08-10 (issue #123) — deleted outright, not reinstated. Its Data
 *  Audit tab (the only part with no live equivalent) is now DataManagerPanel's Coverage tab;
 *  its Settings Dump moved into the LIVE DevDashboard (management.js:27); its Engine Trace tab
 *  was dropped (superseded by the standalone ForecastAudit panel above).
 *  ai-insights removed 2026-08-10 (issue #128) — deleted outright, not reinstated. Its category
 *  taxonomy is now a facet on TaskQueuePanel. The "scanners auto-file findings" idea it was
 *  designed for but never built was NOT ported into runScan — the owner settled that design
 *  separately in issue #134 (a standalone Insight Ledger panel with situation-key dedup), so
 *  the auto-filer belongs there, not bolted onto AIBacktestScanner. The owner confirmed
 *  mf_insights (its localStorage journal) held nothing worth migrating.
 *  anomalies removed 2026-08-10 (issue #127) — deleted outright, not reinstated. Its one real
 *  capability (event-tagged DOW-baseline exclusion) is now ported into runScan (the live AI
 *  Backtest Scanner) in analytics.js; everything else about the panel had drifted from its own
 *  engine's actual field names and would have rendered blank even if it were reachable.
 *
 *  ⭐ THIS LIST IS NOW EMPTY, as of 2026-08-10 — every panel that had a render line in App.js
 *  with nothing able to set it true has been harvested and deleted (issues #114/#123/#127/#128).
 *  Empty is the resting state, not an achievement: an entry appearing here means a panel was
 *  built and then orphaned, and the fix is to harvest what's worth keeping and delete the rest,
 *  not to let it accumulate. panel-registry.test.js enforces that anything openable is listed
 *  in the reachable tables above. */
export const ORPHANS = [
];

/** State that survived the Notes 24 hub consolidation: only ever reset, never opened,
 *  never rendered. Harmless (always false) but each one is counted in anyModalOpen. */
export const VESTIGIAL_STATE = [
  'showLaborAnalysis', 'showLaborAnalytics', 'showMonthlyProj', 'showPace', 'showSchedSum',
  'showScheduling', 'showSkillsMatrix', 'showSmartTargetsV2', 'showUnifiedTargets', 'showYearly',
];

// Section order + display labels for the v2 sidebar (owner's specified IA, Notes 54; regrouped
// dispatch #54 Job B, 2026-08-21). This is now the ACTUAL sidebar order — shell.js's AppSidebar
// renders by iterating this array + panelsForSection(), not a hand-built literal list (Job A's
// "v1 stays literal until v2 is adopted" note no longer applies; v2 is adopted as of Job B).
export const SECTIONS = [
  { id:'daily',              label:'Daily' },
  { id:'notifications',      label:'Notifications' },
  { id:'reports',            label:'Reports' },
  { id:'planning',           label:'Planning' },
  { id:'operations',         label:'Operations' },
  { id:'inventory-food-cost', label:'Inventory & Food Cost' },
  { id:'scheduling',         label:'Scheduling & Labor' },
  { id:'people',             label:'People' },
  { id:'analytics',          label:'Analytics' },
  { id:'analysis',           label:'Analysis' },
  { id:'forecasting',        label:'Forecasting and Labor Projections' },
  { id:'forms',              label:'Forms' },
  { id:'intelligence',       label:'Intelligence' },
  { id:'help',               label:'Help' },
  { id:'admin',              label:'Admin' },
];
// 'inventory-food-cost' and 'analysis' are NEW (Job B, owner-answered 2026-08-21):
//   - Inventory & Food Cost: "all inventory and food cost related items should be grouped
//     together" -- Food Cost, End of Month, Inventory Control, Count Cycle, Inventory, Product Mix.
//   - Analysis: Metric Correlations, Why Engine (both stay kind:'optional' -- Panel Manager
//     toggle-able, hidden by default; this section only governs where they'd group IF enabled,
//     it does not make them always-visible).
// 'performance' (Job A's temporary today-accurate placeholder for the ad hoc "PERFORMANCE"
// header) is RETIRED -- its three members (operator-summary/ranking -> reports, planning ->
// planning) now have real owner-decided homes. See memory/dispatch54-job-b.md.

export const PANEL_BY_ID = Object.fromEntries(PANELS.map(p => [p.id, p]));

/** Panels a caller may see, for one section. `can` is App's perm(key) helper. */
export function panelsForSection(sectionId, can, { includeTestKitchen = false } = {}) {
  return PANELS.filter(p =>
    p.section === sectionId &&
    (p.kind === 'nav' || (includeTestKitchen && p.kind === 'test-kitchen')) &&
    (!p.perm || can(p.perm)));
}

/** Panels a caller may see, for the ⚗ TEST KITCHEN block (dispatch #61). Derived from
 * kind:'test-kitchen' + the permission filter, ordered by `tkOrder` -- NOT declaration order,
 * which is alphabetical and does not match the curated order the sidebar has always rendered
 * (see memory/dispatch-61.md). Promoting a panel out of Test Kitchen is now just flipping its
 * `kind:` -- it drops out of this filter and picks up wherever its `section:` already routes it,
 * with no second edit in shell.js and no duplicate render. */
export function testKitchenPanels(can) {
  return PANELS
    .filter(p => p.kind === 'test-kitchen' && (!p.perm || can(p.perm)))
    .sort((a, b) => a.tkOrder - b.tkOrder);
}

/** Single permission gate. Replaces the duplicate check in nav AND in onOpenModal. */
export function canOpen(id, can) {
  const p = PANEL_BY_ID[id];
  if (!p) return false;          // unknown id — caller should treat as a bug, not a no-op
  return !p.perm || can(p.perm);
}
