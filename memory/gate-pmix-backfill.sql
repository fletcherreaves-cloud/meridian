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
select d.loc
from (select distinct loc from qsr_product_mix) d
right join (select distinct loc from qsr_daily_activity
            where dt >= '2026-01-01') a on a.loc = d.loc
where d.loc is null;


-- ── ONLY AFTER ALL THREE PASS: the task #153 measurement ────────────────────
-- Per Oklahoma restaurant, the first 2026 date on which its set of distinct
-- prices changes for a stable item set. Cross-tab against the check step-up in
-- the two weeks from 3 June. Report as a TABLE OF RESTAURANTS, not a summary
-- sentence. If it was not price, say so plainly and early — that is the more
-- valuable answer, and far better found this week than in the room on the 25th.
