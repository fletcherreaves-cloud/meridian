// @ts-nocheck
export default {version:'5.519', date:'2026-10-12', changes:[
  'Count Cycle: extended the new-WRIN exception (v5.517) to a second, different case the ' +
  'owner flagged while reviewing that PR -- a stale PRE-PERIOD dead row (last_counted before ' +
  'the period even opened, $0 on-hand) that can never be counted because it is not real ' +
  'inventory. This is the exact dispatch #96 Condiment phantom-row shape, reintroduced for ' +
  '~10/27 stores when COVER_FRAC was raised to near-100%. isStaleDeadRow() (engine/count-' +
  'cycle.js) identifies it; detectSessions() now excludes it from the coverage denominator the ' +
  'same way a new WRIN is excluded, and lists it separately as `staleItems` rather than making ' +
  'it silently invisible -- "same comments for awareness" as new items, per owner decision.',
  'Surfaced everywhere newItems already is: Count Cycle\'s StoreCard gets a parallel orange ' +
  '"needs cleanup" badge (count-cycle-panel.js), the share-link markdown report gets a ' +
  '"Stale items -- needs cleanup, not counting" section worded for removal rather than ' +
  'counting, and the Weekly Count Status report gets its own Stale items column (table, print ' +
  'HTML, and CSV export).',
  'Re-pointed the dispatch #96 regression tests (count-cycle.test.js) at the NEW, fixed ' +
  'behavior -- they previously asserted the phantom row blocks compliance (the real, known ' +
  'consequence flagged in PR #1420, not a test bug); now they assert it does not, and that it ' +
  'shows up in staleItems instead. 10 new tests total (isStaleDeadRow unit tests + the updated ' +
  'dispatch #96 fixtures + a formatWeeklyComplianceReport case). Full suite and npm run build ' +
  'both pass clean.',
]};
