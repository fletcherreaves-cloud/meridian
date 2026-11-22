// @ts-nocheck
export default {version:'5.849', date:'2026-11-22', changes:[
  '**Egress Wave 1 delta-sync pilot #3: `lifelenz_schedule_variance` now watermark-syncs too.** ' +
  'Task #190, continuing Wave 1\'s readiness-ordered rollout ' +
  '(`memory/plan-egress-reduction-2026-11-20.md` Section 17/19). First closed the loader gap the ' +
  'original audit pass caught: `loadLifeLenzScheduleVariance` never exposed `seq`, even though ' +
  'it\'s part of the table\'s real primary key `(loc, edited_by, occurred_at, seq)` — `seq` exists ' +
  'specifically because `occurred_at` isn\'t unique per `(loc, edited_by)` when LifeLenz batches ' +
  'multiple field changes from one save action under the same timestamp. Fixed in the SAME commit ' +
  'as the delta-sync build, same pattern pilot #2 used for `lifelenz_job_hours`\'s missing ' +
  '`updatedAt`. `loadLifeLenzScheduleVariance({ since })` gained the additive `since` param; ' +
  '`_stScheduleVariance` now reads a `localStorage` watermark and merges the delta into ' +
  '`ds.scheduleVarianceRows` by `(loc, editedBy, occurredAt, seq)` instead of replacing the whole ' +
  'array every login — with a dedicated test proving two same-instant, same-editor edits stay ' +
  'distinct rows rather than colliding. The daily rollup (`scheduleVarianceDailyRows`) is ' +
  'recomputed from the merged rows, not just the delta. Confirmed upsert-only before building on ' +
  'it. 6 new tests ' +
  '(`dispatch-egress-wave1-pilot3-lifelenz-schedulevariance-watermark-2026-11-22.test.js`). See ' +
  '`memory/plan-egress-reduction-2026-11-20.md` Section 20. Full suite + build both clean.',
]};
