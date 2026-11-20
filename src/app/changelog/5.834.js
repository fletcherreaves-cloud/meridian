// @ts-nocheck
export default {version:'5.834', date:'2026-11-20', changes:[
  '**Egress reduction, Phase 0: trimmed LifeLenz Schedule\'s default login window.** ' +
  '`loadLifeLenzSchedule`\'s default `daysBack` was 455 (~15 months, "covers YoY + trends" — ' +
  'itself a never-audited guess, per the comment history: 1825 days -> 455 -> this). Audited ' +
  'every `ds.schedRows` reader in the app (insights.js, metric-source.js\'s schedRows-sourced ' +
  'chains, smart-targets.js/projections.js/one-pager-data.js\'s `computeScheduleRollup` callers, ' +
  'visit-readiness.js, schedule-retention.js) — none needs more than its own selected date ' +
  'range; the one no-filter consumer (Schedule Retention\'s `computeStoreWeeks`) just shows ' +
  'fewer weeks with a shorter window, not a broken feature. Measured live: the old default ' +
  'pulled 12,212 rows (~6.9MB uncompressed JSON) on every single login; the new 180-day default ' +
  'pulls 5,292 (~57% cut). `daysBack` stays an overridable param for any future caller that needs ' +
  'deeper history on demand. First of several planned login-footprint reductions — see ' +
  '`memory/plan-egress-reduction-2026-11-20.md`.',
]};
