// @ts-nocheck
export default {version:'5.652', date:'2026-11-06', changes:[
  '**Error-telemetry prep: every panel now has a name** (memory/plan-error-telemetry-auto-fix-' +
  '2026-11-06.md, task #102, owner-approved as its own PR before the real capture-function work). ' +
  '`lazyPanel()` (`App.js`) takes an optional `panelName` argument, threaded to `ErrorBoundary` ' +
  '(`features/session.js`) so a future crash report can say WHICH panel broke, not just that one ' +
  'did. All 93 real `lazyPanel()` call sites in `App.js` now pass one — the real `panel-' +
  'registry.js` id where it obviously matches (53 of 93), a readable slug of the component\'s own ' +
  'name otherwise (40 of 93), each one unique. Purely mechanical/structural this round: ' +
  '`componentDidCatch` logs the name to `console.error` and nothing more — no new Supabase table, ' +
  'no capture/reporting pipeline (that\'s task #103, intentionally not built here).',
]};