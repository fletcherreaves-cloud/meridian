-- Supporting index for security_findings_latest's DISTINCT ON — NOT YET APPLIED, NOT YET MEASURED.
--
-- Measured 2026-09-09, after the view (schema-security-findings-latest-view.sql) was applied and
-- verified to return the correct 19,723 rows: a full sequential fetch through the view took
-- 59,975ms (20 pages) against 66,085ms (93 pages) through the base table directly — only a ~1.1x
-- wall-clock improvement, nowhere near what the ~4.7x row-count reduction implied. Per-page cost
-- on the view averaged ~3.0s vs ~0.71s on the base table — the view is doing MORE work per page,
-- not less, because `security_findings` has no index matching the view's
-- `distinct on (tenant_id, loc, subject_key, rule_id) order by ... window_end desc, computed_at
-- desc`. Without one, Postgres has to Sort the full 92,740-row table before it can compute
-- DISTINCT ON, on every single paginated request (the view isn't materialized, so nothing is
-- cached between requests) — that Sort, not the row count, is the actual bottleneck now.
--
-- This index gives the planner a path that already returns rows in DISTINCT ON's required order,
-- letting it skip the Sort entirely (Index Scan -> Unique instead of Seq Scan -> Sort -> Unique).
-- This is the standard, well-established fix for exactly this symptom — but it is NOT verified
-- here: nothing in this session could run EXPLAIN ANALYZE against production, so treat the
-- expected win as a strong hypothesis, not a measured result. Re-run the same timed comparison
-- this file's header cites (a full sequential fetch through both `security_findings_latest` and
-- `security_findings`) after applying this index, and correct this file's own claim if the
-- numbers don't move the way expected — same standing rule that caught the view's original
-- row-count error.

create index if not exists security_findings_latest_support_idx
  on public.security_findings (tenant_id, loc, subject_key, rule_id, window_end desc, computed_at desc);
