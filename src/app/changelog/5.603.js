// @ts-nocheck
export default {version:'5.603', date:'2026-11-03', changes:[
  '**Monthly Targets (Planning → Monthly): in-app editor (task #62).** Same click-to-edit shape ' +
  'as Yearly Targets (v5.602) on the real, live `MonthlyProjectionsPanel` grid -- a separate, ' +
  'more complete-looking `MonthlyTargetManager` system was found to be a genuine dead end ' +
  '(unreachable from the live UI, writes only to per-device localStorage, never Supabase) and ' +
  'was left alone rather than "fixed". Saves call `saveMonthlyTargets({[loc]: fullRow}, year, ' +
  'month)` -- always the full row, matching Yearly\'s upsert semantics. `tProdSales` (Sales $) is ' +
  'editable here too since there is no competing lock/override mechanism on this grid to conflict ' +
  'with.',
]};
