// @ts-nocheck
export default {version:'5.260', date:'2026-08-30', changes:[
  'Dispatch #219 -- EOM count-completion email polish: real item descriptions, FOB component ' +
  'breakdown as a table with each component\'s own actual %, and On-Hand link titles that say ' +
  'which class they\'re for. All three were owner-reported this morning and pre-diagnosed live ' +
  '(memory/dispatch-219.md) -- this lands the fixes.' +
  '\n\n' +
  'Task 1 -- item descriptions never reached the email. scripts/qsrsoft-onhand-pull.mjs\'s ' +
  '`ohForEngine` mapping (DB-shaped `deduped` rows -> the camelCase shape ' +
  'diagnoseIncompleteCount() expects) copied wrin/cls/onHandAmt/etc. but never `descr`, even ' +
  'though mapOnHandRow() already captures it and the engine already reads it. Extracted the ' +
  'mapping into an exported toEngineRows() (previously inline in main()\'s loop) and added ' +
  '`descr: r.descr` -- the whole data-side fix, now real-pipeline-testable. Live-measured before ' +
  'fixing: qsr_onhand carries a non-null descr on all 14,626/14,626 current rows (service-role ' +
  'read), and a real eom_count_notifications row from 2026-08-29 (pre-fix) had zero descr keys ' +
  'on any uncounted item -- confirms this is a plumbing bug, not an equally-empty upstream source.' +
  '\n\n' +
  'Task 2 -- FOB section becomes an HTML table. resend-notify.mjs\'s fobSectionHtml() component ' +
  'breakdown was a <ul> showing only $ + a target annotation; actualPP (the real actual-%-of-' +
  'sales per component, already computed by buildStoreFobReport()) was never rendered. Now a ' +
  '<table>: Component | Actual $ | Actual % | Target % | Δ. Judgment call: when row.fob_target ' +
  'is entirely absent (#215\'s "no resolvable target" case) there is no comps array to read ' +
  'actualPP from, yet the verification bar still requires Actual % to populate in that case -- ' +
  'so Actual % falls back to fs[k]/fs.sales (the identical fraction buildFobTargetReport() itself ' +
  'feeds into buildStoreFobReport() as compActual, just evaluated here instead of there through ' +
  'this file\'s own existing fobPp() rounding) only when comps[i].actualPP is unavailable; Target ' +
  '%/Δ still show "—" in that case since those genuinely don\'t exist without a target. ' +
  'Headline paragraph (FOB% of sales, target comparison, total $) stays prose, unchanged.' +
  '\n\n' +
  'Task 3 -- On-Hand Investigation link titles were identically \'On-Hand Inventory (this ' +
  'store)\' for every triggered class, so a food_condiment trigger showed what looked like the ' +
  'same link twice. Title now carries the resolved class letter (`On-Hand Inventory (F)` / `(C)` ' +
  '/ `(P)` / `(N)`), reusing the same CLASS_LETTER lookup already used for the URL\'s class= ' +
  'param -- matches fobToolLinks()\'s existing (F)/(C) convention (#214) rather than spelling out ' +
  'Food/Condiment, for consistency with the other links in the same email section.' +
  '\n\n' +
  'New/updated tests: an end-to-end descr test through the REAL toEngineRows() -> ' +
  'diagnoseIncompleteCount() -> buildNotificationRow() -> buildEmailContent() chain (not a re-' +
  'implementation of the mapping -- a revert of the descr fix fails this test); FOB table tests ' +
  'covering the target-present, target-absent, and no-fob_snapshot-at-all cases; onHandLink() ' +
  'title tests asserting the actual user-visible symptom (two distinct titles, not just two URLs) ' +
  'for all four classes. Updated two pre-existing tests whose assertions matched the OLD <li>-list ' +
  'text format (resend-notify.test.js, dispatch-215-fob-targets.test.js) to the new table shape -- ' +
  'intentional format changes, not regressions.' +
  '\n\n' +
  'Full suite 3372/3373 passing (the one failure is a pre-existing 5s timeout on a live-network ' +
  'test in dispatch-215-fob-targets.test.js, reproduced identically on origin/main before this ' +
  'change -- unrelated to this dispatch), build clean.',
]};
