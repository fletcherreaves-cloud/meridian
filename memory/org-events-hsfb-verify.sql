-- ============================================================================
-- Verify the HS Football 2026 PARTIALS-completed swap landed in org_events.
-- Requires service-role (RLS blocks the anon key on org_events — confirmed,
-- not a table-empty result). Run in the Supabase SQL Editor.
--
-- loc here is UNPADDED (String(e.loc) in scripts/seed-org-events.mjs, matching
-- the workbook's "Store #" column) — do NOT zero-pad to 7 like the QSR tables.
-- ============================================================================

-- ── 1 · Per-school game count and home count, live vs the workbook ──────────
-- Expect exactly 10 games and the home counts below for all ten. Anything off
-- means the swap didn't fully replace the old PARTIAL rows.
--   Atoka 10422→5  Elgin 33222→4  Holdenville 35064→5  Lindsay 18213→4
--   Madill 13113→5  Marietta 33109→5  Pauls Valley 31357→5  Purcell 11657→5
--   Sulphur 32525→5  Tishomingo 43380→6
-- Home/away is encoded directly in the label text ("... (Home)" / "... (Away)")
-- per the seed script's parser output — match on that.
select
  loc,
  count(*)                                     as games,
  count(*) filter (where label ilike '%(Home)%') as home,
  count(*) filter (where label ilike '%(Away)%') as away
from org_events
where loc in ('10422','33222','35064','18213','13113','33109','31357','11657','32525','43380')
group by loc
order by loc;


-- ── 2 · Total row count for these 10 schools — expect exactly 100 ───────────
select count(*) as total_rows
from org_events
where loc in ('10422','33222','35064','18213','13113','33109','31357','11657','32525','43380');


-- ── 3 · The OSD removal — confirm the game is genuinely gone, not just unlabeled ─
-- Expect ZERO rows. Any row returned means the delete-and-reimport didn't fully
-- clear the old PARTIAL data before the upsert.
select loc, date_start, label, opponent
from org_events
where loc = '43380'
  and (opponent ilike '%deaf%' or label ilike '%deaf%' or label ilike '%OSD%');


-- ── 4 · Tishomingo's full slate, live — should be exactly these 10 dates/opponents ─
-- Cross-check against the workbook rows shown in the README/xlsx verification.
select date_start, label, opponent, kickoff
from org_events
where loc = '43380'
order by date_start;


-- ── 5 · Stale rows check — anything from the OLD (pre-swap) import still present ─
-- ⚠ FIXED 2026-08-18: v1 of this query filtered only on loc + entered_at, with no
-- label/category restriction. Run that way it returns every OTHER event type ever
-- entered for these 10 stores -- holidays, LTO calendar, tax-free weekend, Black
-- Friday, community events, college football, school-district calendar -- all of
-- which are UNRELATED to the HS football swap and are SUPPOSED to have an old
-- entered_at. That is correct, not a defect, and running v1 doesn't test what it
-- claims to. Confirmed by eye across the full v1 return: zero rows contained the
-- word "Football" -- reassuring, but an eyeball scan of ~430 rows isn't the same
-- rigor as a scoped query. Run v2 below for the real answer.
--
-- v2 -- scoped to football rows only:
select loc, date_start, label, entered_by, entered_at
from org_events
where loc in ('10422','33222','35064','18213','13113','33109','31357','11657','32525','43380')
  and label ilike '%football%'
  and entered_at < '2026-08-18'
order by loc, date_start;
-- Expect ZERO rows. Any row here is a leftover FOOTBALL row from the 2026-08-02
-- PARTIAL run that the delete-then-reimport step should have removed -- e.g. a
-- stale Tishomingo/OSD row hiding behind a different label than the current one,
-- or an old date for a game whose date changed between runs.
