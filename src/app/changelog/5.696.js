// @ts-nocheck
export default {version:'5.696', date:'2026-11-08', changes:[
  '**Wired 15 more Knowledge Base articles into their real panels (task #75, ongoing KB-coverage '+
  'backlog), and resolved both carry-over items flagged by the last two batches.** Re-measured the '+
  'real gap first: of 117 `KB_ARTICLES` keys, 55 had a clickable "?" `InfoIcon` wired (up from 43 '+
  'two batches ago), 62 did not. Wired: Projections (`proj`), Workflow Guide, Proj vs Actuals, DI '+
  'Calibration, Planning Hub, Scheduling Hub, Panel Manager, Date-Range Report, Monthly & Yearly '+
  'Targets (`targets_editor`), Home / At A Glance, Store Dashboard Overview, Shift Analysis Tab, '+
  'Why Engine, GM Letters, Smart Target Engine. Four of those (Projections/Proj vs Actuals/DI '+
  'Calibration/Date-Range Report) use the "shell lives at the App.js routing gate" pattern — the '+
  'same pattern Security\'s own wiring already used — so they are build+full-suite verified '+
  'rather than given a new render test, matching that precedent; the other 11 keys each wire an '+
  '`InfoIcon` directly inside an exported, independently-mountable component and get a real '+
  'mount-and-click render test. `targets_editor` needed its real mount point traced for the '+
  'first time (two prior batches left it unwired, unable to find it): it is '+
  '`MonthlyProjectionsPanel` (Planning → Monthly) and `YearlyProjectionsPanel`\'s Target '+
  'Categories view (Planning → Yearly), found by grepping `saveMonthlyTargets`/'+
  '`saveYearlyTargets`\'s real call sites rather than guessing from a panel-registry id. The '+
  'other carry-over, `security_guide` vs. `security_panel_guide`, turned '+
  'out already resolved by an earlier PR today (#1744) — confirmed via a direct `KB_ARTICLES` grep '+
  '(zero `security_guide` key remains) and its own regression test, not re-done. '+
  '70 of 117 keys now wired.',
]};
