// @ts-nocheck
export default {version:'5.777', date:'2026-11-14', changes:[
  '**Records panel: top-3 per category + near-miss detection** (Notes 61 item #13). Owner, ' +
  'verbatim: "Records should be all-time, not limited to the date selection. Wants top 3 per ' +
  'category + most recent record broken + near misses." "Most recent record broken" already ' +
  'existed (Recent Breaks); this closes the two genuinely new pieces. **Top 3**: every day-level ' +
  'category (Sales Day, GC Day, Breakfast Sales, Avg Check, OEPE, KVS, R2P) now tracks the 3 ' +
  'all-time-best confirmed days, not just #1 — shown as runner-up lines on the Overview tab\'s ' +
  'district champion cards. Week/month/day-of-week records stay single-best, a deliberate scope ' +
  'choice (those are checked far less often day-to-day). **Near misses**: the most recent ' +
  'confirmed day within 5% of a category\'s all-time record without beating it, surfaced as a new ' +
  '"📍 Near Misses" section on the Recent Breaks tab. Both respect the SAME provisional-day gate ' +
  'dispatch #103 already enforces — a still-open business day can never occupy a top-3 slot or ' +
  'count as a near-miss. 14 new tests. Full findings: ' +
  'memory/finding-records-top3-near-miss-2026-11-14.md.',
]};
