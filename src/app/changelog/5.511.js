// @ts-nocheck
export default {version:'5.511', date:'2026-10-08', changes:[
  'Fix: Forms Reviews pull was undercounting -- the first real production run saved only 2 ' +
  'rows for a 14-day backfill when today alone should have had 150+. Root cause: ' +
  'QSRSoft\'s schedules/scheduled endpoint treats endDate as EXCLUSIVE, which turned out to be ' +
  'one mechanism explaining two things previously logged as separate "quirks" -- a single-day ' +
  'query returning zero rows, and a window ending at "today" (vs "tomorrow") silently dropping ' +
  'almost everything. chunkDays() now always queries one calendar day past the logical day ' +
  'wanted, for every chunk. Re-running the backfill with the fix is the next step.',
]};
