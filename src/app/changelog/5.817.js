// @ts-nocheck
export default {version:'5.817', date:'2026-11-17', changes:[
  '**Added a real, hourly LifeLenz DAR pull** (`lifelenz_dar` table) standing in for QSRSoft\'s ' +
  'own DAR pull while it stays paused for compliance reasons. A 4-round live GraphQL ' +
  'introspection discovery pinned down `darData`\'s real shape -- every field name guessed from ' +
  'an earlier manual capture turned out to be wrong (`totals`/`dar[].data` are generic ' +
  'fieldCode/value lists, not named properties; the per-interval field is `dar`, not ' +
  '"intervals"). Runs hourly at :05 past the hour, re-pulling a trailing 6-hour window so a ' +
  'late-settling or missed hour self-heals on the next run. Confirmed the returned hourly ' +
  'buckets line up with Meridian\'s own 4am business-day boundary for the one store measured. ' +
  'Deliberately NOT yet wired into any app-facing data (stream-freshness/metric-source/ds) -- ' +
  'that is a named follow-on pending a second measurement against a Florida (Eastern-time) ' +
  'store, since whether LifeLenz buckets hours in each store\'s own local timezone is still an ' +
  'open, unmeasured question. Full writeup: memory/finding-lifelenz-dar-schema-2026-11-17.md.',
]};
