-- ── EVENT-004 — "General Drawer Open" (drawer_open) crew rate, peer baseline (task #131) ────────
-- memory/finding-qsrsoft-security-events-drawer-open-2026-11-10.md. Extends
-- schema-security-rules-events-phase1.sql's "events" domain with the 4th rule, sourced from the
-- 9th EVENT_TOKENS entry (src/engine/security-events.js, added same dispatch). Same registry, same
-- interpreter, same aggregator (scripts/security-rules-run.mjs) as EVENT-001/002/003 -- no new
-- mechanism.
--
-- The owner's KB screenshot named this "General Drawer Open" (a drawer open with no other POS
-- event attached); the real API's own event_name on these rows is "Unauthorized Drawer Open" --
-- both describe the same category, see the finding file for the full measurement.
--
-- Why this wasn't shipped alongside EVENT-001/002/003 the same day: at that time the real
-- event_token for this category was unknown (task #131 is what found it) and no real
-- drawer_open data existed to check the sessions-worked denominator convention against. Both are
-- now resolved by a real, live measurement (not assumed):
--   - A 7-day/28-store production-shaped backfill (2026-11-03..09) landed 1,211 real drawer_open
--     rows (confirmed via a service-role REST count, not just the pull's own log).
--   - Of the 528 real (loc, date, crew_token) buckets with >=1 drawer_open event in that window,
--     ALL 528 (100%) had sessionCnt > 0 -- the denominator comes from that crew member's OTHER
--     flagged events the same day, since a drawer_open row never carries a session of its own
--     (security-events.js's own sentinel-date fix nulls pos_session_start_dt/_tm on every
--     drawer_open row -- the raw API sends the literal string "0000-00-00"/"00:00:00", not an
--     absent field). So the EVENT-001/002-shaped denominator genuinely fits this token, measured,
--     not assumed to fit by analogy.
--   - 45.3% of the 1,152 real crew/day buckets with sessionCnt>=5 (the scoreable population) had
--     at least one drawer_open event -- this is a COMMON occurrence, not rare, which is exactly
--     why the threshold below is set at the measured tail (p95), not at "any occurrence."
--
-- ⚠️ Shape chosen to match EVENT-001/002/003's CURRENT live shape, not their own phase1 SQL
-- file's -- a real REST read on 2026-11-10 found all three already upgraded from that file's flat
-- `ratio`/rate-threshold shape to `z-score`/`threshold:{"default":2.5}` sometime after it was
-- written (schema-security-rules-events-phase1.sql itself is now STALE relative to the live
-- table for those three rows -- noted here, not fixed in this dispatch, since reconciling that
-- file is a separate, scoped cleanup). EVENT-004 is built new, straight to that current shape, to
-- stay consistent with its siblings as they actually run today: z-score, peer baseline (store
-- colleagues, same choice as EVENT-001/002 -- a drawer-open habit plausibly reads as a store/
-- shift-culture signal more than an individual-privileged-action one, so opportunity_factor is
-- false, matching EVENT-001/002 rather than EVENT-003's true), threshold 2.5 sigma, min_denominator
-- 5 -- all identical to the three siblings' live rows.
--
-- The RAW rate distribution (pre-z-score) is still real, measured evidence that this metric is
-- workable at all, even though the final gate is sigma-based, not a flat rate cutoff: p50=0,
-- p75=43.48, p90=100, p95=142.86, p99=290.32, max=600 (per 1,000 sessions, 1,152 real crew/day
-- buckets with sessionCnt>=5) -- full detail in the finding file, not reproduced here.
--
-- ACTIVE = FALSE, same posture as every other Phase-1 rule in this registry -- do not flip blind.
-- Given how COMMON this event measured (45.3% of scoreable shifts had >=1), review the real
-- security-findings output against a short list of real stores/managers before activating, more
-- than usual -- a rule that fires on nearly half of all shifts if mis-thresholded is a real
-- operational-noise risk, not just a tuning nuisance. The z-score framing already limits this to
-- OUTLIERS relative to peers rather than any occurrence, which is why z-score (not a flat rate)
-- was chosen in the first place.
--
-- Idempotent: safe to re-run.

insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'EVENT-004', 'events', 'drawer-open-rate', 'General/unauthorized drawer-open event rate',
  'drawer_open event count from qsr_security_events (QSRSoft KB: "General Drawer Open"; the API''s own event_name is "Unauthorized Drawer Open"), normalized per 1,000 POS sessions worked -- same convention as EVENT-001/002, confirmed by a real 7-day backfill to actually have a usable sessionCnt denominator for this token (528/528 real crew/day buckets with a drawer_open event also had sessionCnt>0, from that crew member''s other flagged events the same day -- drawer_open rows carry no session of their own). Subject is the crew_token logged in on the register at the time, which a real sample shows is usually a named badge (only 5/1211 sampled rows had no crew attribution at all). z-scored against store peers, not a flat rate -- measured 45.3% of scoreable crew/day buckets have >=1 such event (common, not rare), which is exactly why this flags statistical outliers relative to colleagues rather than any occurrence.',
  '["qsr_security_events"]', 'z-score',
  '{"numerator": {"field": "drawerOpenCnt", "agg": "sum"}, "denominator": {"field": "sessionCnt", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_denominator": 5}',
  28, 'peer', '{"default": 2.5}', 2, 1, 'low', false,
  '{}', '{}', '["register physically checked/counted outside a sale (change fund, drawer audit)", "equipment test after a jam or power cycle", "shift-change drawer verification"]',
  'Pull the flagged crew member''s drawer_open events for the window (register, time, daypart) and check against scheduled drawer-count/change-fund procedures before treating any single instance as a concern -- this event measured as common across the whole network, not rare.',
  'memory/finding-qsrsoft-security-events-drawer-open-2026-11-10.md', 1, false
)
on conflict (tenant_id, rule_id) do nothing;
