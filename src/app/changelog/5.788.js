// @ts-nocheck
export default {version:'5.788', date:'2026-11-14', changes:[
  '**KB coverage (task #75) — condiment_pct and count_cycle_guide, the two keys batches 20-22 ' +
  'kept re-confirming as "mechanically unresolvable," are now wired by fixing the actual gap ' +
  'instead of re-documenting it.** Both were blocked for the same underlying reason: the real ' +
  'render site gave no standalone labeled anchor to attach an InfoIcon to, and attaching one ' +
  'anyway would have been arbitrary (Condiment) or floated next to a bare number string with no ' +
  'header at all (Count Cycle). ' +
  '**condiment_pct:** At A Glance\'s "FOB COMPONENTS" grid renders Condiment as one of 6 ' +
  'visually-identical sibling tiles (Unexplained/Comp Waste/Raw Waste/Condiment/Emp Meal/Stat ' +
  'Var) — Condiment is the only one of the six with a written KB article, so its item in the grid ' +
  'array now carries an `articleKey`, and the render attaches an InfoIcon only where one is ' +
  'present. Data-driven, not a visual singling-out: the other 5 still render with no icon, same ' +
  'as before. ' +
  '**count_cycle_guide:** `CountCycleSection` (`src/views/count-cycle-panel.js`) bypasses the ' +
  'shared PanelChrome header entirely and rendered only a compact stats line with no title text ' +
  'at all — "47 stores · 2 critical · …" and nothing naming what it is. Added the actual missing ' +
  'label ("Count Cycle") next to that line, which gives the InfoIcon a real anchor rather than ' +
  'working around the absence of one. 2 new tests. Full suite (8169) and build pass clean.',
]};
