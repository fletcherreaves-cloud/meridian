// @ts-nocheck
export default {version:'5.762', date:'2026-11-13', changes:[
  '**Restaurant Profiles: corrected Volume Tier bands, auto-populate Volume Tier + Primary ' +
  'Daypart from real data (owner req).** The old bands (Low <$1.2M/Mid $1.2–2M/High $2–3M/Very ' +
  'High >$3M) were stale — now Low <$2M/yr, Mid $2–3.5M, High $3.5–6M, Very High >$6M. Both ' +
  'fields now auto-populate from real data, same manual-overrides-auto shape the 4 VLH-backed ' +
  'fields already use (a "📊 Auto" badge shows while the field is unedited, and picking a value ' +
  'by hand always wins): **Volume Tier** from trailing-12-month actual sales (the same auto-' +
  'first metric-source.js registry every other panel reads — no new network call). **Primary ' +
  'Daypart** from a trailing-90-day hourly sales mix across Breakfast/Lunch/Afternoon/Dinner/' +
  'Late Night (the same daypart hour-slot boundaries labor-standard.js/Daypart Pace already use) ' +
  '— a store only gets a named daypart when it holds a real plurality (≥30% share, ≥8pt lead over ' +
  'the runner-up); otherwise it reads "Balanced," same as a store genuinely led by its afternoon ' +
  'lull, which has no matching dropdown option. 10 new tests. Full suite (7989 tests) and build ' +
  'pass clean (699.02 KB eager, budget 850 KB).',
]};
