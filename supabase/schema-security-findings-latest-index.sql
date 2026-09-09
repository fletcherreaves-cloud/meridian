-- Supporting index for security_findings_latest's DISTINCT ON — ✅ APPLIED AND VERIFIED
-- (2026-09-09 evening). Re-running this file is safe (`create index if not exists`) but not
-- necessary.
--
-- Measured 2026-09-09, after the view (schema-security-findings-latest-view.sql) was applied and
-- verified to return the correct 19,723 rows: a full sequential fetch through the view took
-- 59,975ms (20 pages) against 66,085ms (93 pages) through the base table directly — only a ~1.1x
-- wall-clock improvement, nowhere near what the ~4.7x row-count reduction implied. Per-page cost
-- on the view averaged ~3.0s vs ~0.71s on the base table — the view was doing MORE work per page,
-- not less, because `security_findings` had no index matching the view's
-- `distinct on (tenant_id, loc, subject_key, rule_id) order by ... window_end desc, computed_at
-- desc`. Without one, Postgres had to Sort the full 92,740-row table before it could compute
-- DISTINCT ON, on every single paginated request (the view isn't materialized, so nothing is
-- cached between requests) — that Sort, not the row count, was the actual bottleneck.
--
-- This index gives the planner a path that already returns rows in DISTINCT ON's required order,
-- letting it skip the Sort (Index Scan -> Unique instead of Seq Scan -> Sort -> Unique). Re-timed
-- the identical fetch after applying it: **9,708ms for the same 20-page fetch — 6.2x faster than
-- the view without this index, 6.8x faster than the original unindexed base-table load.** First
-- page still costs ~2.7s (planning/cold cache); every page after ran 270-500ms. Verified live
-- against production, not assumed — the standard fix for this symptom turned out to work exactly
-- as expected, but that was checked, not presumed, same as the row-count error a few hours
-- earlier in this same dispatch that turned out NOT to work as first claimed.

create index if not exists security_findings_latest_support_idx
  on public.security_findings (tenant_id, loc, subject_key, rule_id, window_end desc, computed_at desc);
