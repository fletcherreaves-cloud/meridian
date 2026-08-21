// @ts-nocheck
export default {version:'5.091', date:'2026-08-21', changes:[
  'Dispatch #52 -- the Security panel gets a drill-down, scoped from the real store 0013113 '
  + 'investigation (memory/finding-store-13113-packaging-variance-2026-08-21.md) rather than Part '
  + 'C\'s original wish list. Five measurements, in the order they mattered: flag rate normalized '
  + 'over a store\'s own subject population (not a raw count), cross-store prevalence of a '
  + 'subject\'s own flagged discriminators (local lead vs. estate-wide broken mapping), item-class '
  + 'composition vs. estate (reproduces the finding\'s own 82.1%/47.0%/~3.7σ numbers exactly), '
  + 'period trend, and secondary metrics vs. estate. Generalized to both cash (employee) and '
  + 'inventory (item) subjects -- new engine module src/engine/security-drilldown.js, one new '
  + 'on-demand loader (loadAuditRowsWindow), a "🔎 Investigate further" button that fetches '
  + 'nothing until clicked. Every number renders beside its baseline; nothing is labelled a cause.\n\n'
  + 'Rider: closed the schema-drift class from #510\'s review (schema.sql\'s CREATE TABLE silently '
  + 'going stale against a migration\'s ALTER TABLE ADD COLUMN). Building the guard test found 15 '
  + 'real instances across 7 tables, not the 1 known one -- including audit_rows.emp_token, the '
  + 'identity-reveal system\'s own key column, missing from schema.sql this whole time. All 15 '
  + 'fixed; the new test (mutation-tested against the real file, per the rider\'s own instruction) '
  + 'keeps the count at zero going forward.\n\n'
  + '1856/1856 tests (39 new: engine unit tests, two render-based panel tests, ten schema-drift '
  + 'tests). Build clean, no entry-chunk impact (both new modules reach only through the '
  + 'already-lazy security-panel chunk). Full writeup: memory/dispatch52-drilldown.md.',
]};
