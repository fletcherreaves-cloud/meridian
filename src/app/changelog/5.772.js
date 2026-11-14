// @ts-nocheck
export default {version:'5.772', date:'2026-11-14', changes:[
  '**Task #75 (Knowledge Base) batch 21 — InfoIcon rollout:** wired 3 more real candidates ' +
  '(`cash_os`, `drawer_open` on the Cash Controls Cockpit tab\'s Cash O/S hero and Drawer ' +
  'Opens/Day driver row; `data_collection_bounds` on Data Manager\'s Overview-tab coverage ' +
  'table, which previously had no header of its own to anchor to — added one, "DATA COVERAGE"). ' +
  'Also found and fixed a real bug while re-measuring the gap: `KB_ARTICLES` had a genuine ' +
  'duplicate top-level key, `graded_visits_guide`, defined twice — JS object-literal semantics ' +
  'silently shadow the first (thinner, now-dead) copy at runtime with the second (richer) one; ' +
  'deleted the dead copy. `condiment_pct` and `count_cycle_guide` remain deliberately deferred ' +
  '(confirmed, not assumed: Condiment only ever renders inside a generic 6-item mapped list in ' +
  'two separate files, never with its own standalone header; Count Cycle is a body-only tab ' +
  'component with no per-tab header, re-confirmed a 5th time). 3 new tests. Full suite (8042 ' +
  'tests) and build pass clean (703.68 KB eager, budget 850 KB).',
]};
