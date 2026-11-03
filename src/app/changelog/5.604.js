// @ts-nocheck
export default {version:'5.604', date:'2026-11-03', changes:[
  '**Fixed stale "Lock Week" documentation** (Workflow Guide\'s WEEKLY/MONTHLY steps, the ' +
  '`locked_projections` and `planning_hub` KB articles) that told users Planning → Monthly/Yearly ' +
  'tabs support double-click override and locking a projection. They don\'t -- those are the ' +
  '`monthly_targets`/`yearly_targets` editors (v5.602/v5.603), a different Supabase table from ' +
  'the real locked-projection system, which only exists in ⚗ Test Kitchen → ▦ Projections. The ' +
  '`planning_hub` article\'s false claim was itself a regression from an earlier Workflow-Guide ' +
  'audit that fixed a different staleness in the same lines but introduced this one.',
]};
