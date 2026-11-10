-- security_findings_latest_mv — materialize the DISTINCT ON instead of computing it live
-- (dispatch 2026-11-10, owner-reported live: "DATA INCOMPLETE -- 10 page(s) failed to load --
-- security findings (security_findings_latest)", Security panel showing zero findings)
--
-- Root-caused and REPRODUCED live (service-role, bypassing RLS -- so this is a floor, real RLS
-- sessions cost MORE per row per the 2026-10-14 finding this file's predecessor already
-- documented): security_findings grew from 20,793 rows (2026-10-14 measurement, the table this
-- view's own pageSize:1000/maxInflight:1 sequential-load fix was tuned against) to **242,074**
-- rows today -- an 11.6x increase in under a month, ~9,000 rows/day from the daily batch (one
-- fresh row per subject+rule, EVERY day, flagged or not; no bound on growth as long as the batch
-- keeps running). Measured today, directly against the live table:
--   - security_findings_latest (the plain DISTINCT ON view), deepest page (offset ~22,000 of
--     22,934 distinct rows): 7.78s -- right at the edge of the ~8s statement timeout.
--   - security_findings (the base table), a simple filtered query
--     (rule_id IN (...) AND pass=false) with the loader's own ORDER BY: 8.27s, timed out
--     (57014) outright.
--   - The SAME base-table query with NO order clause: 1.6s, 149,418 matching rows -- confirming
--     this is a sort/materialization cost problem, not a "no real findings" problem. Whatever the
--     app shows as "No findings match the current filters" during this failure is a casualty of
--     failed page loads, not a real empty result.
-- Both failure points are new since 2026-10-14's fix (the view's own comment already named this
-- as the "future work" that fix didn't attempt): "a real DB-side fix (materializing this view
-- instead of computing it live under RLS on every call) would fix the ROOT cost instead of
-- working around it." This file does that.
--
-- security_findings_latest_mv is a real materialized view -- computed ONCE per refresh, not on
-- every page request -- so read cost stops scaling with security_findings' row count entirely;
-- it scales with the OUTPUT size (~23k distinct subject+rule rows today), which stays roughly
-- flat as the underlying table keeps growing daily (new rows for an already-seen subject+rule
-- just replace that row's place in the DISTINCT ON on the next refresh, they don't add a new
-- output row).
--
-- Materialized views cannot carry RLS policies in Postgres (there is no
-- `ALTER MATERIALIZED VIEW ... ENABLE ROW LEVEL SECURITY`) -- so the MV itself is locked down
-- (no grants to authenticated/anon, service_role only) and a thin wrapper VIEW, kept at the SAME
-- NAME `security_findings_latest` the app already reads from (loadSecurityFindings(),
-- src/lib/supabase.js -- zero app-code change required by this migration), re-applies the EXACT
-- predicate "security_findings: gated read" (schema-security-gm-role-fix-2026-10-28.sql) already
-- enforces on the base table: same tenant_id check, same admin/owner/area_supervisor-always +
-- manager/gm-gated-by-org_config branch, using the same get_my_role() helper every other gated
-- policy in this schema already calls. A reader who could not see a row on the base table cannot
-- see it through this view either -- this is an RLS-equivalent wrapper, not a relaxation.
--
-- `drop view if exists` / `create materialized view` / `create or replace function` are safe to
-- re-run EXCEPT the `create materialized view` itself, which errors if it already exists --
-- re-running this file after a successful apply needs `drop materialized view if exists
-- public.security_findings_latest_mv cascade;` first (intentionally not auto-dropped here, so a
-- partial/failed re-run can't silently blow away a working materialized view).

drop view if exists public.security_findings_latest;

create materialized view public.security_findings_latest_mv as
select distinct on (tenant_id, loc, subject_key, rule_id)
  id, tenant_id, emp_token, wrin, loc, rule_id, window_start, window_end,
  value, threshold_used, pass, lifecycle_category, exoneration_share,
  baseline_context, explanation, computed_at, subject_key
from public.security_findings
order by tenant_id, loc, subject_key, rule_id, window_end desc, computed_at desc;

-- Required for `refresh materialized view concurrently` below -- lets reads keep hitting the OLD
-- snapshot while a refresh recomputes the new one, instead of a plain `refresh materialized view`
-- locking the whole view for the duration (which would re-create exactly the user-facing stall
-- this migration exists to fix, just moved from every page load to once a day).
create unique index security_findings_latest_mv_key_idx
  on public.security_findings_latest_mv (tenant_id, loc, subject_key, rule_id);

-- Locked down deliberately -- never grant select on the MV itself to authenticated/anon. All
-- app access goes through the RLS-equivalent wrapper view below.
revoke all on public.security_findings_latest_mv from public, anon, authenticated;

create view public.security_findings_latest as
select * from public.security_findings_latest_mv
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
  and (
    (select get_my_role()) in ('admin', 'owner', 'area_supervisor')
    or (
      (select get_my_role()) in ('manager', 'gm')
      and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
    )
  );

grant select on public.security_findings_latest to authenticated;

comment on materialized view public.security_findings_latest_mv is
  'Pre-computed distinct-latest-per-(tenant,loc,subject,rule) snapshot of security_findings. '
  'Refreshed by scripts/security-rules-run.mjs at the end of every daily batch run, via the '
  'refresh_security_findings_latest() RPC. Never queried directly by the app -- see the '
  'security_findings_latest view, which applies the real RLS-equivalent gate on top of it. '
  'See schema-security-findings-latest-materialized-2026-11-10.sql for why this replaced a '
  'plain (live-computed) view.';

comment on view public.security_findings_latest is
  'RLS-equivalent wrapper over security_findings_latest_mv -- same predicate as '
  '"security_findings: gated read" on security_findings itself, since a materialized view cannot '
  'carry RLS policies directly. loadSecurityFindings() (src/lib/supabase.js) reads this view by '
  'the same name it always has -- no app-code change required by this migration.';

-- SECURITY DEFINER so the daily batch's own service-role client can refresh the MV via a simple
-- RPC call (supabase.rpc('refresh_security_findings_latest')) rather than needing direct DDL
-- rights at runtime.
create or replace function public.refresh_security_findings_latest()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  refresh materialized view concurrently public.security_findings_latest_mv;
end;
$$;

revoke all on function public.refresh_security_findings_latest() from public, anon, authenticated;
grant execute on function public.refresh_security_findings_latest() to service_role;

-- One-time refresh so the view reflects today's data immediately, rather than waiting for
-- tomorrow's scheduled batch run to populate it for the first time.
select public.refresh_security_findings_latest();
