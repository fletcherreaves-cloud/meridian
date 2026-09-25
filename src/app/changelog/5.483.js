// @ts-nocheck
export default {version:'5.483', date:'2026-09-25', changes:[
  'IA: Above-Store One-Pager, My Reports and Store One-Pager moved from Analytics into Reports ' +
  '(owner decision -- notes-67-queue.md §1\'s Reports grouping named all three, landed now). ' +
  'Performance Reviews moved into a brand-new HR section (owner: "new HR section"), the first ' +
  'concrete member of the HR grouping notes-67 asked for.',
  'Both moves are section: reassignments only in panel-registry.js -- no component, route, or ' +
  'permission change. Reports now renders Above-Store One-Pager, My Reports, Store One-Pager, ' +
  'Org Summary, Leaderboards in that order (declaration order, same rule every other section ' +
  'follows); HR renders right after People, before Analytics.',
  'shell-nav-snapshot.test.js\'s external-oracle EXPECTED array updated to match the real ' +
  'rendered order, plus its own permission-gate map: denying reviews.view now also hides the ' +
  'new \'HR\' section header itself, since Performance Reviews is its only member today (same ' +
  '"fully empty section drops its header" behavior Operations/Scheduling & Labor already ' +
  'demonstrate elsewhere in that file). Full suite 544/544 files, 5120/5120 tests (one unrelated ' +
  'pre-existing flake on the first run, confirmed by a clean re-run). Build clean, eager payload ' +
  '552.45 KB gzip (budget 850 KB).',
  'Two more notes-67 items were re-verified against live code in the same pass and turned out ' +
  'already resolved with zero code needed: the "District Overview needs a back button" and ' +
  '"URL-view conversion" asks were both already satisfied by independent later work (route ' +
  'conversions, hub-tab deep links) -- see memory/backlog-open-2026-09-06.md for the full ' +
  'verification notes.',
]};
