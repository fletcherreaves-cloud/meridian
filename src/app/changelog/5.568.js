// @ts-nocheck
export default {version:'5.568', date:'2026-10-15', changes:[
  'QSRSoft 7-year historical backfill, metered (owner, live, 2026-10-15): "QSRSoft retains data ' +
  'only for 7 years on a rolling cycle. Every day drops a day... I will eventually want to ' +
  'backfill all stores data for that period. Set it up whenever convenient and meter the data ' +
  'in if that works best for limits and such." New information, not previously recorded ' +
  'anywhere in this repo -- see memory/project-qsrsoft-7year-backfill.md for the full writeup.',
  'scripts/qsrsoft-ebos-pull.mjs gained QSRSOFT_EBOS_START_DATE/END_DATE (matching DAR/OPS\' own ' +
  'naming) -- it previously had NO explicit backfill override and did one unbounded per-store ' +
  'API call for the whole requested range. CLAUDE.md\'s claim that every pull script already ' +
  'honours this override was not actually true for EBOS until now.',
  'New scripts/qsrsoft-backfill-driver.mjs -- the missing auto-advancing cursor. Nothing in ' +
  'this repo had ever metered a multi-year, multi-report-type, all-27-store backfill before; ' +
  'every prior one (the ops-pull 27-month backfill CLAUDE.md cites) was a human manually ' +
  're-dispatching workflow_dispatch chunk by chunk. Each scheduled run advances EBOS/DAR/OPS ' +
  'independently by ~90 days, walking backward toward a continuously-recomputed "today minus 7 ' +
  'years" floor (never a frozen anchor, since QSRSoft\'s own retention floor recedes by a day ' +
  'every day too). New qsrsoft_backfill_cursor table tracks per-type progress so the campaign ' +
  'resumes exactly where it left off across however many days it takes.',
  'New daily .github/workflows/qsrsoft-backfill.yml (+ workflow_dispatch for a manual kick, ' +
  'with only/chunk_days/years_back/dry_run inputs), staggered clear of the existing DAR/OPS/' +
  'EBOS daily pull windows. Added to sync-failure-watch.yml\'s watched list per the standing ' +
  '"adding a new automated pull" rule.',
  '7 new tests for the pure chunk-picking logic (targetStartDate/nextChunk) -- the receding- ' +
  'floor behavior, final-chunk clipping to the floor, and the done signal are all covered ' +
  'without any network or Supabase access. Full suite green (611/611 files, 5689/5689 tests), ' +
  'npm run build clean, within the entry-chunk budget.',
  '⚠️ Needs a one-time manual step: run schema-qsrsoft-backfill-cursor.sql in the Supabase SQL ' +
  'editor to create the cursor table. Until then the driver fails cleanly on its first bootstrap ' +
  'read/write (surfaced via sync-failure-watch, same as any other not-yet-migrated table).',
]};
