// @ts-nocheck
export default {version:'5.751', date:'2026-11-12', changes:[
  '**Daily Review (test kitchen) — GM Phase 1, "answer the questions up front each day" (Notes ' +
  '75).** New engine (`engine/daily-review.js`) + panel assembling yesterday\'s Sales/Service/' +
  'Controls(Labor+Cash)/FOB vs target for one store, reusing metric-source.js\'s auto-first ' +
  'sourcing, vs-ly.js\'s matched current-vs-LY, and getTargetsForDate\'s month-aware targets — ' +
  'the same data every other panel already trusts, nothing new pulled. Of the ~30 metrics the ' +
  'owner named, every one already had a real source AND a real target except Paper Cost % ' +
  '(target exists, no metric-source actual-value key yet — surfaced as a visible gap, not ' +
  'dropped). Service section calls out which DAYPART drove any OEPE/R2P/KVS Time reading, both ' +
  'directions ("slowest in Dinner, best in Breakfast"), from the same raw hourly DAR rows DT ' +
  'Speed of Service already uses. A department scorecard row shows worst-status-per-section at ' +
  'a glance. GM-only for now — Supervisor/OM data flows are still pending from the owner; this ' +
  'engine is designed so a later patch/district rollup extends it rather than a rewrite. Ships ' +
  'in Test Kitchen (`daily-review`, section `operations`, same tier as Visit Readiness) per the ' +
  'standing "every new panel starts there" rule — nothing promoted, nothing default yet. 15 new ' +
  'tests (engine + real panel render), full suite (7926 tests) and build pass clean.',
]};
