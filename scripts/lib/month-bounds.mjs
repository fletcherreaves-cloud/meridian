// scripts/lib/month-bounds.mjs
// Correct month-range bounds for a `period` string ('YYYY-MM'), for querying a Postgres `date`
// column via Supabase's gte/lte or gte/lt.
//
// Exists because the SAME bug (hardcoding `${period}-31` as the upper bound) has now been found
// and fixed independently THREE times in this repo:
//   - src/lib/supabase.js's loadEbosMonthlyByStore (dispatch #365) -- Postgres error 22008
//     ("date/time field value out of range") for every month with fewer than 31 days (Feb, Apr,
//     Jun, Sep, Nov), silently swallowed into an empty result because the caller's error handling
//     just returned {}.
//   - scripts/eom-snapshot-pull.mjs (found 2026-09-04, run #111) -- same error, NOT swallowed,
//     so it hard-crashed the scheduled EOM Baseline Snapshot workflow outright once the active
//     period rolled to September.
//   - scripts/qsrsoft-onhand-pull.mjs's fetchFobSnapshotForStore -- same query shape against the
///    same qsr_fob.date column, found live-armed (not yet triggered) while fixing the other two;
//     called from three scheduled scripts (qsrsoft-onhand-pull.mjs itself, eom-notification-
//     resend.mjs, eom-digest-send.mjs).
// #365's own fix (`new Date(year, month, 0).getDate()`) was correct but written inline at one
// call site, so the second and third sites reintroduced the exact same mistake by hand rather
// than finding it already solved. This is the shared answer going forward -- import it, don't
// re-derive it.

// The real last calendar day of `period` ('YYYY-MM'), as 'YYYY-MM-DD'. Correct for every month
// including leap Februaries (Date's day-0-of-next-month idiom, not a hardcoded day count).
export function monthEndDate(period) {
  const [y, m] = period.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${period}-${String(lastDay).padStart(2, '0')}`;
}

// The first day of the month AFTER `period` ('YYYY-MM'), as 'YYYY-MM-DD'. Prefer this with an
// EXCLUSIVE `.lt('date', nextMonthStart(period))` bound over monthEndDate()'s inclusive `.lte()`
// where the call site can use either -- it needs no day-count logic at all, so there's nothing to
// get wrong.
export function nextMonthStart(period) {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
