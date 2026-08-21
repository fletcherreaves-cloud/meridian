// @ts-nocheck
export default {version:'5.092', date:'2026-08-21', changes:[
  'Dispatch #54 Job B -- the actual sidebar regroup, and section-driven rendering finally '
  + 'adopted for real. AppSidebar now iterates SECTIONS + panelsForSection() instead of Job A\'s '
  + 'preserved v1 hand-built list; a section with zero visible panels for the caller renders no '
  + 'header at all.\n\n'
  + 'The owner\'s three answered decisions: Visit Readiness + Graded Visits -> Operations. '
  + 'Calendar / Events & Tags / Event Impact folded into Planning, hub first ("Planning (the hub, '
  + 'keeping its five tabs) . Calendar . Events & Tags . Event Impact") -- the hub is NOT '
  + 'exploded, its five internal tabs stay kind:\'hub-tab\'. A new Inventory & Food Cost section '
  + '-- Food Cost, End of Month, Inventory Control, Count Cycle, Inventory (which had NO sidebar '
  + 'entry at all before this -- Job A\'s own finding), plus Product Mix (stays optional/Panel-'
  + 'Manager-toggled, correctly grouped once enabled).\n\n'
  + 'Also resolved from Job A\'s disagreement catalog: Org Summary + Rankings -> Reports (out of '
  + 'the temporary "performance" placeholder, now retired); Forms Library / Printable Forms -> '
  + 'Forms; Metric Correlations + Why Engine -> a new Analysis section (both stay optional, so it '
  + 'renders empty in the live nav today). Left alone, flagged for a future pass: forecasting-'
  + 'section membership (references an owner list not available this session) and the help-vs-'
  + 'admin sidebar split (no owner instruction to separate them yet).\n\n'
  + '1859/1859 tests (5 net new -- the render-based nav snapshot fully re-captured for the new '
  + 'layout, plus dedicated assertions for the Planning link order and Inventory & Food Cost '
  + 'membership). Build clean, no entry-chunk impact. Full writeup: memory/dispatch54-job-b.md.',
]};
