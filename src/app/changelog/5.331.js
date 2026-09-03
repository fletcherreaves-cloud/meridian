// @ts-nocheck
export default {version:'5.331', date:'2026-09-03', changes:[
  'Fixed: the Leadership One-Pager narrative never loaded back. save() correctly upserted the ' +
  'narrative text to Supabase (one_pagers, keyed on level/scope_key/period), but nothing ever ' +
  'called loadOnePagers() back on open -- reopening the panel, or switching weeks and switching ' +
  'back, always showed a blank textarea even for an already-saved week, silently discarding the ' +
  'work the moment the panel closed. Now loads on open and re-matches whenever level/scope/period ' +
  'changes, client-side against the exact key save() upserts on (loadOnePagers has no server-side ' +
  'filter).',
  '2 new tests covering both the load-back match and the correctly-blank no-match case, plus the ' +
  'existing dispatch #160 panel-contract mock updated for the new call. Full suite (3722 tests) ' +
  'and build both clean (533.13 KB / 850 KB eager budget). Smoke-tested via dev server + headless ' +
  'Chromium, zero JS errors.',
]};
