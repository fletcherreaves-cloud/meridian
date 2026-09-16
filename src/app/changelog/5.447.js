// @ts-nocheck
export default {version:'5.447', date:'2026-09-16', changes:[
  'Panel-contract consistency sweep (Task #55, first batch) — owner asked for "standardizing ' +
  'panel controls (calendar/date pickers, location/patch/operator/state selectors, ' +
  'print/export/save/share functions, close button consistency and location (top right corner))" ' +
  'per the standing rule in memory/panel-contract.md. Re-audited fresh (the doc\'s own backdrop-' +
  'ratchet figure had drifted to 42 by this point, not the "77" it still read) before touching code.',
  'Close button: EventImpactPanel (views/event-impact.js) and Signals\' PromoteModal ' +
  '(views/signals.js) converted from a hand-rolled position:fixed/inset:0/rgba(0,0,0 backdrop to ' +
  'ModalShell. ratchet-modal-backdrop-bypass.test.js\'s CEILING lowered 42 -> 40 in the same commit ' +
  '(re-measured fresh, not by arithmetic).',
  'Location selector: EventImpactPanel, Calendar Manager\'s grid-tab scope toggle ' +
  '(features/calendar.js), and Visit Readiness (views/visit-readiness.js) converted from hand-' +
  'rolled All/OK/FL pills + raw <select> pickers to the shared LocationSelector ' +
  '(components/PanelControls.js). Each kept its existing scope-string shape (\'all\'|\'ok\'|\'fl\'|' +
  '\'grp:X\'|loc) for every downstream consumer (labels, report saves, My Reports restore) by ' +
  'deriving it from LocationSelector\'s {level,id} value, so only the control itself changed.',
  'Print/export: Metric Lineage (views/metric-lineage.js) had a real <table> and zero export ' +
  'mechanism (confirmed by the audit\'s scan, not assumed) -- added the shared LazyExportDropdown ' +
  '(CSV/JSON/HTML-print) alongside converting its own hand-rolled backdrop to ModalShell.',
  'NOT converted this pass, on purpose (documented in the ratchet test\'s own history comment): ' +
  'pace-to-target.js / schedule-summary.js / skills-matrix.js / yearly-projections.js / ' +
  'labor-analysis.js / features/lifelenz.js all share one deliberate "embedded ? fill the ' +
  'Planning-hub tab : near-fullscreen bottom-sheet" layout, and features/smart-targets.js is a ' +
  'third distinct pattern (a 92%-width right-side drawer) -- collapsing any of those into ' +
  'ModalShell\'s centered/capped dialog would be a real visual regression across working panels, ' +
  'not a mechanical shell swap, so they were left alone pending a product decision.',
  'Also surfaced, not yet decided: RoutePanelShell\'s dismiss control is structurally top-LEFT ' +
  '(a "←" Back button) with "📸 Share" top-right, not matching ModalShell\'s top-right "✕" ' +
  'convention -- back-navigation and close are different semantics, but if the owner\'s "top ' +
  'right corner" mandate is meant to apply universally this is a real structural gap to resolve, ' +
  'not a per-panel bug. Screenshot-share (RoutePanelShell only) and link-share (2 EOM-only files) ' +
  'are two separate, narrow, already-internally-consistent mechanisms with no single name to ' +
  'converge panels onto -- also left as an open product question.',
  '2 new tests (dispatch-panel-contract-sweep-2026-09-16.test.js) rendering the real ' +
  'MetricLineagePanel consumer (ModalShell close wiring + a real CSV download through the shared ' +
  'ExportDropdown), plus every existing test file touching the 5 converted panels re-run and ' +
  'passing unchanged (event-impact/calendar/visit-readiness/signals/metric-provenance suites, ' +
  '93+ tests).',
  'Also fixed, root-cause not skip: CI turned up the "pre-existing, unrelated date-boundary ' +
  'flake" v5.446\'s own changelog had been carrying in eom-share-links-manage.test.js -- its ' +
  '"active" share-link fixture hardcoded a fixed calendar expiresAt (2026-09-15T12:00Z), correct ' +
  'the day it was written but a ticking time bomb against eom-dashboard.js\'s real ' +
  '`new Date(l.expiresAt) < new Date()` status check, which flipped it to "Expired" the moment ' +
  'real time crossed that date -- exactly the standing date-boundary rule (CLAUDE.md) this repo ' +
  'already has a name for. Fixed by deriving every fixture date from Date.now() at test-run time ' +
  'instead of a fixed string, so it can\'t rot again. Full suite now 516/516 files, 4941/4941 ' +
  'tests, zero known flakes. Build clean, eager payload 549.39 KB / 850 KB budget (test-only ' +
  'change; v5.446 measured 547.54 KB -- the small delta is ModalShell/PanelControls\' own weight ' +
  'in the 5 already-lazyPanel()\'d converted panels, not a new eager import).',
]};
