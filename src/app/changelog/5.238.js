// @ts-nocheck
export default {version:'5.238', date:'2026-08-28', changes:[
  'Dispatch #199 -- merged Performance Calculator into Performance Reviews\' Customize tab, the ' +
  'same "harvest-then-remove" move dispatch #135 item 3 already did for Targets Editor. Checked ' +
  'first whether the calculator\'s own scoring logic duplicated or diverged from review-engine.js\'s ' +
  'rateMetric/ratingColor/computeScores, per the dispatch\'s explicit ask -- it does neither: ' +
  'store-dash.js\'s PerformanceCalculator never imported those functions (grep-verified). They ' +
  'score a PERSON\'s review against 1-4 rating bands from a KPI actual-vs-target deviation; the ' +
  'calculator projects a STORE\'s operational metrics (OEPE seconds -> drive-thru cars/hour -> ' +
  'guest-count conversion -> daily sales -> labor hours -> TPPH) from three slider inputs through a ' +
  'fixed throughput formula. "Performance Calculator" and "Performance Reviews" share a name and a ' +
  'section:\'people\', not an engine -- there was nothing to reconcile or switch over, so the move ' +
  'is a pure relocation with the throughput math ported verbatim (new src/views/performance-' +
  'calculator.js, PerformanceCalculatorSection, content-only -- no ModalShell/fixed-overlay/close ' +
  'button, same pattern as targets-editor.js\'s TargetsEditorSection). New "Calculator" sub-tab ' +
  'added to Performance Reviews\' Customize tab alongside Weights/Thresholds/Targets/Competencies/' +
  'Logos. perf-calc retired to kind:\'hub-tab\' in panel-registry.js (kept its id so panel-' +
  'registry.test.js\'s dispatch<->registry pairing still passes) and removed from constants.js\'s ' +
  'OPTIONAL_PANELS toggle list; onOpenModal(\'perf-calc\') now redirects into Performance Reviews\' ' +
  'Customize > Calculator via the existing perfReviewsEntry lifted-tab state (#135\'s mechanism, ' +
  'reused rather than duplicated).' +
  '\n\n' +
  'RBAC note, flagged rather than silently absorbed: perf-calc was gated on perm:\'analytics.store\' ' +
  '(true for every role, opt-in via Panel Manager). Performance Reviews\' Customize tab is gated on ' +
  'perm:\'reviews.customize\', true only for Admin/Owner/Developer. Folding perf-calc into Customize ' +
  '-- per this dispatch\'s explicit instruction to match #135\'s exact destination -- narrows who can ' +
  'reach it: Supervisor/Manager/VP/GM/SM_AM_DM could previously enable and use it and now cannot ' +
  'reach it at all (the redirect checks perm(\'reviews.customize\'), so it silently no-ops for them, ' +
  'the same behavior #135\'s redirect already established for targets-editor). This is a real access-' +
  'control side effect of matching the specified target location, not a change made unprompted; the ' +
  'owner may want a broader-audience home for it later, but this dispatch\'s scope was the merge, ' +
  'not an RBAC redesign.' +
  '\n\n' +
  'Panel-contract pass on the merged surface: the hand-rolled position:fixed/inset:0/rgba(0,0,0 ' +
  'overlay + its own \'✕\' close button are gone (folded into an already-RoutePanelShell-wrapped ' +
  'tab with no chrome of its own -- backdrop-bypass ratchet CEILING 68 -> 67, re-measured fresh, not ' +
  'copied); the fixed 280px-sidebar two-column slider layout became a wrapping flex layout so it ' +
  'stacks instead of overflowing on mobile. Two dead imports (getKB, lastClosedBusinessDay) removed ' +
  'from store-dash.js now that PerformanceCalculator no longer lives there.' +
  '\n\n' +
  'New test: dispatch-199-perf-calc-customize.test.js renders the REAL PerformanceReviewsPanel -> ' +
  'CustomizePanel -> PerformanceCalculatorSection chain (not an isolated helper, per this repo\'s ' +
  '"would this verification still pass if reverted?" rule) and asserts the real calculator content ' +
  '(sliders, Projected Impact, Impact Chain) renders under Customize > Calculator, both via a tab ' +
  'click and via the initialTab/initialCustomizeSection redirect props.' +
  '\n\n' +
  'Verification: full suite 297/297 files, 3092/3092 tests passing (one unrelated flaky test in ' +
  'dispatch-141-retention-rollup.test.js under full-suite parallel load, confirmed passing 17/17 in ' +
  'isolation -- not touched by this change). npm run build clean; eager payload 546.04 KB / 850 KB ' +
  'gzip budget (303.96 KB headroom) -- folding a lazy standalone panel into an already-lazy one is ' +
  'close to size-neutral.',
]}
