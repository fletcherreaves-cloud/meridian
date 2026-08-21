// @ts-nocheck
export default {version:'5.090', date:'2026-08-21', changes:[
  'Dispatch #54 Job A -- shell.js\'s sidebar now reads label/icon/permission from panel-registry.js '
  + 'instead of duplicating them as literal strings for ~44 nav items, via two new lookups '
  + '(navP/navPBeta). Pure refactor: header order/grouping is byte-identical to before -- verified '
  + 'by rendering AppSidebar and diffing its exact text output, not just asserting registry shape.\n\n'
  + 'Caught one real drift doing it: the Test Kitchen "Projections" entry\'s registry label/icon '
  + '(stale "Proj Workflow" / lock, from a pruned duplicate nav line) disagreed with the live label '
  + '(Projections / ▦, unchanged since v4.517) -- fixed in the registry, today\'s UI wins.\n\n'
  + 'Also corrected section: on 21 panels so it describes where each ACTUALLY renders today, not a '
  + 'partly-aspirational earlier guess (the registry previously implied ~60% of a regroup that is '
  + '0% done in the UI). This is metadata-only for now -- shell.js still renders its existing '
  + 'hand-built header list, per the registry\'s own "v1 stays literal until v2 is adopted" note -- '
  + 'but it is now a truthful starting point for Job B\'s actual regroup. Full disagreement catalog '
  + 'and the two items flagged for Job B\'s attention (Inventory has no sidebar entry at all; Forms '
  + 'Library/Printable Forms\' corrected-to-today section is analytics, not their eventual forms '
  + 'target) in memory/dispatch-54-job-a.md.\n\n'
  + '1817/1817 tests (2 net new: a render-based nav snapshot test, and two registry-drift guards '
  + 'replacing one now-structurally-unnecessary test). Build clean, entry-chunk eager payload '
  + '510.36 KB gzip, no new imports.',
]};
