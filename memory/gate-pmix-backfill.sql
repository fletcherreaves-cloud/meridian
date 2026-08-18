-- ============================================================================
-- GATE — Product Mix backfill completeness (task #153 precondition)
-- Written 2026-08-17 for run 32079492626 (Jan 2026 -> today, all 27 stores).
-- Run in the Supabase SQL Editor BEFORE anything reads qsr_product_mix.
--
-- WHY THIS EXISTS ------------------------------------------------------------
-- The first backfill attempt wrote 0 rows after a Playwright auth flake and
-- STILL EXITED 0. That is #263, confirmed live, on a brand-new pull, on its
-- first real use. The fail-fast guard is #393 and is NOT MERGED, so this run
-- is unguarded: a green Action does not mean rows landed. The log is exactly
-- what lied last time. Verify against the table, not the run.
--
-- WHY A PARTIAL BACKFILL IS WORSE THAN AN EMPTY ONE --------------------------
-- A store missing from a month reads downstream as "this restaurant had no
-- price change" — precisely the wrong answer to the question the backfill
-- exists to answer.
--
-- ⚠ DO NOT GATE ON count(*) --------------------------------------------------
-- The upsert conflict key is (loc, date, item, price) — price is IN the key,
-- so a price change ADDS a row instead of updating one. Row counts therefore
-- inflate at exactly the stores that changed price. Gate on distinct loc and
-- distinct date; treat raw row counts as descriptive only.
-- ============================================================================


-- ── GATE 1 — the pass/fail. Expect 27 stores in EVERY month, Jan -> Aug. ────
select
  date_trunc('month', date)::date as mo,
  count(distinct loc)             as stores,      -- must be 27 every row
  count(distinct date)            as days,
  count(*)                        as rows_desc    -- descriptive only, see note
from qsr_product_mix
where date >= '2026-01-01'
group by 1
order by 1;


-- ── GATE 2 — where the hole is. Only needed if GATE 1 shows a short month. ──
-- Per store x month. A store with far fewer days than its peers in the same
-- month is a partial pull, not a closed restaurant — re-run that window.
select
  loc,
  date_trunc('month', date)::date as mo,
  count(distinct date)            as days
from qsr_product_mix
where date >= '2026-01-01'
group by 1,2
order by days asc, loc, mo;


-- ── GATE 3 — stores absent entirely (invisible to GATE 2, which can only ────
--            list stores that have at least one row).
--
-- ⚠ CORRECTED 2026-08-18. The first version of this query selected `d.loc` from
-- the pmix side while filtering on `d.loc is null` — which returns a column of
-- NULLs and names nothing. It gave a COUNT of missing stores and no identity,
-- which is the one thing this gate exists to provide. Select from the side that
-- HAS the rows (the DAR), and null-test the side that is missing them.
select a.loc
from      (select distinct loc from qsr_daily_activity where dt   >= '2026-01-01') a
left join (select distinct loc from qsr_product_mix   where date >= '2026-01-01') p
  on p.loc = a.loc
where p.loc is null;

-- ✅ RESOLVED 2026-08-18 — ran, answered, no gap. Do not re-raise.
--   `count(distinct loc) … where date = '2026-02-11'` returned 26 against ~27
--   stores, which looked like a missing store. It is not. GATE 3 above returned
--   ZERO rows: every store the DAR sees since Jan 1 is present in pmix.
--   The 26 is Ponce de Leon (loc 43701), which OPENED 03/13/26 and therefore did
--   not exist in February. Already recorded in src/constants.js:93 and :346
--   ("0 valid LY rows", recentOnly, tagged new-location/insufficient-history) —
--   the codebase knew before this gate asked.
--
-- ⚠ CARRY THIS INTO TASK #153: 43701 has no pre-March baseline, so it cannot
--   take part in any pre/post price comparison. EXCLUDE IT AND NAME IT in the
--   output — a store excluded for a legitimate reason and a store missing
--   because a pull dropped it look identical in a results table and mean
--   opposite things. It is already one of the two exclusions in the McValue
--   analysis, whose coverage guard (111 PRE / 112 POST, min = max, 25 stores)
--   would have dropped it regardless.


-- ── ONLY AFTER ALL THREE PASS: the task #153 measurement ────────────────────
-- Per Oklahoma restaurant, the first 2026 date on which its set of distinct
-- prices changes for a stable item set. Cross-tab against the check step-up in
-- the two weeks from 3 June. Report as a TABLE OF RESTAURANTS, not a summary
-- sentence. If it was not price, say so plainly and early — that is the more
-- valuable answer, and far better found this week than in the room on the 25th.
