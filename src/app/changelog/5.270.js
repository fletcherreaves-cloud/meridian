// @ts-nocheck
export default {version:'5.270', date:'2026-08-30', changes:[
  'Dispatch #225 -- Inventory Control: shared LocationSelector + a real month picker across all 5 ' +
  'tabs (Scoreboard/EOM Count/Cadence/Count Cycle/Supervisor Rollup). Task 1 measured (not ' +
  'assumed) whether the panel\'s old blocker comment was still true: a per-store comparison of ' +
  'supervisorGroups() against buildLocationHierarchy()\'s Patch resolution (both run through the ' +
  'SAME live orgAssignments()/whoRan() timeline) agreed for all 27 real stores -- the stale-seed ' +
  'concern dispatch #139 already fixed. The bespoke state-pills/patch-select/store-select trio is ' +
  'now the shared LocationSelector (mode:progressive); `scope`/`patch`/`oneStore` state stays ' +
  'exactly as every existing consumer in eom-dashboard.js already reads it -- a UI swap, not a ' +
  're-derivation. Supervisor Rollup (EOMSupervisorPanel) now gets the same shared location scope ' +
  '(its own groupType/selGroup toggle stays, and now composes with the location narrower instead ' +
  'of being silently overridden by it) and the same shared `period`, replacing its own former ' +
  'independent selYear/selMonth state + internal month/year <select> pair. The hardcoded ' +
  'recentPeriods(4) (current month + prior 3, no more) is replaced by loadEomPeriods() -- every ' +
  '\'YYYY-MM\' with at least one qsr_onhand/eom_count_status row, no arbitrary cap, fetched once ' +
  'per panel mount.' +
  '\n\n' +
  'Verification: src/__tests__/dispatch-225-location-selector-patch-agreement.test.js is Task 1\'s ' +
  'actual measurement (AGREE, all 27 stores). ' +
  'src/__tests__/dispatch-225-location-month-picker.test.js drives the REAL EOMDashboardPanel -> ' +
  'EOMSupervisorPanel chain: picking the OK/FL state pill narrows the visible Scoreboard rows to ' +
  'that state only ("1 shown"), picking a month far outside the old 4-month window (2024-01, only ' +
  'reachable via loadEomPeriods()) swaps the visible store data to that period\'s, and Supervisor ' +
  'Rollup\'s groupType toggle still renders and composes with the location pick without crashing. ' +
  'Sanity-checked by temporarily breaking the onChange wiring and confirming the location tests ' +
  'fail (would-this-fail-if-reverted). dispatch-202-eom-supervisor-rollup.test.js updated for the ' +
  'new behavior (location/date bands now show for Supervisor Rollup; its own "Period:" label is ' +
  'gone). Full suite 3388/3388 passing (6 unrelated pre-existing failures -- missing `web-push` ' +
  'package in this worktree\'s node_modules, present in package.json but not installed; untouched ' +
  'by this change). Build clean, entry budget 527.00 KB gzip eager (budget 850 KB) -- the lazy ' +
  'eom-dashboard chunk actually shrank slightly (252.75 KB -> 251.77 KB) despite the new control, ' +
  'from the ~30 lines of hand-rolled picker markup removed.'
]};
