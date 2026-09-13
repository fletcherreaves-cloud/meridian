// @ts-nocheck
export default {version:'5.433', date:'2026-09-13', changes:[
  'Coaching Loop (#208) -- real, measured verdicts. NOISE_THRESHOLDS shipped deliberately empty ' +
  'at v1 ("ship cycle recording without verdicts rather than with wrong ones"), so every coaching ' +
  'review sat at "not enough measured data yet to verdict." Ran the existing read-only ' +
  'measure-coaching-noise-threshold.mjs against live Supabase labor_rows/qsr_fob (service-role ' +
  'access confirmed by direct curl, not assumed) -- 12,268-23,454 trailing-30-day movements per ' +
  'metric across 26-27 stores -- and filled in a p90 "real change" bar per metric: labor_pct ' +
  '2.117pp, fob_total_pct 0.733pp, condiment_pct 0.243pp, raw_waste_pct 0.184pp, comp_waste_pct ' +
  '0.064pp. Matches this codebase\'s standing precedent (swing alarm, count-completeness) of ' +
  'citing the exact measurement a threshold came from inline in the code, not picking one from ' +
  'feel. computeVerdict()/recordCoachingResult() now return real improved/worse/no-change ' +
  'verdicts for all 5 v1 metrics; coaching-modal.js needed no changes -- it was already built to ' +
  'render real verdicts the moment the data existed. Full measurement + rationale for choosing ' +
  'p90 over p95/p99: memory/finding-coaching-noise-thresholds-2026-09-13.md.',
  '6 rewritten/added coaching-loop.test.js cases confirmed to fail against pre-fix (empty-' +
  'threshold) code via a git-stash round-trip that kept the new tests in place against the old ' +
  'engine file.',
  'Full suite 506/506 files, 4810/4810 tests.',
]};
