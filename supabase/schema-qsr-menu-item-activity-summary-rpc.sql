-- ── qsr_menu_item_activity_summary() — server-side aggregate for Pricing Engine ────────────────
-- Owner-reported 2026-10-14 ("Need to get pricing data in the app. not loading") + the app's own
-- DATA INCOMPLETE banner: Pricing Engine's waste/comp/promo enrichment (dispatch #220) was
-- hitting partial-page-load failures on qsr_menu_item_activity.
--
-- Root cause, live-measured (service-role REST, 2026-10-14): the table has grown to 627,939 rows
-- total and 398,273 rows in just the default 30-day window -- NOT "a couple of days deep" as the
-- feature's original comment said when it shipped. src/lib/supabase.js's loadQsrMenuItemActivity()
-- pulls every raw row for the window via fetchAll(), which pages STRICTLY SEQUENTIALLY (one
-- 1000-row page awaited, then the next) -- ~400 serial round-trips for the default 30-day view,
-- well past the point where some page times out and fetchAll's own MAX_CONSECUTIVE_PAGE_FAILURES
-- gives up, surfacing exactly the "N page(s) failed... UNDERSTATED" banner the owner saw.
--
-- But the client never needed the raw rows -- src/engine/pricing-engine.js's enrichItemMargins()
-- immediately collapses every row into a SUM per (loc, item_number) across the window (waste,
-- comp = emp_meal+mgr_meal, promo, activity) and discards the rest. That's a few hundred output
-- rows (27 stores x ~390 active items/store, per memory/finding-menu-item-activity-subset-2026-08-28.md)
-- computed from hundreds of thousands of rows that never needed to leave Postgres. This function
-- does the SUM/GROUP BY server-side; src/lib/supabase.js's loadQsrMenuItemActivitySummary() calls
-- it and synthesizes one already-summed row per (loc, item_number) in the exact shape
-- enrichItemMargins() already expects -- enrichItemMargins() itself is UNCHANGED (its own sum-of-
-- one-row-per-item is a no-op over data already summed once).
--
-- No security definer -- runs as the calling role, same RLS tenant-scoping
-- (qsr_menu_item_activity: tenant select policy) a plain `select` already goes through. p_start/
-- p_end are both nullable (an "All Time" range in the UI passes neither) -- the aggregate is still
-- cheap even unfiltered, since the RESULT size never exceeds the real item count, only the amount
-- of work done to get there changes.
create or replace function public.qsr_menu_item_activity_summary(p_start date default null, p_end date default null)
returns table(loc text, item_number integer, waste numeric, comp numeric, promo numeric, activity numeric)
language sql stable
as $$
  select
    a.loc,
    a.item_number,
    sum(a.waste)                                            as waste,
    sum(coalesce(a.emp_meal, 0) + coalesce(a.mgr_meal, 0))   as comp,
    sum(a.promo)                                             as promo,
    sum(a.activity)                                          as activity
  from public.qsr_menu_item_activity a
  where a.item_number is not null
    and (p_start is null or a.date >= p_start)
    and (p_end   is null or a.date <= p_end)
  group by a.loc, a.item_number
$$;

-- Same tenant-scoped RLS the raw table already enforces on `select` applies here too (not
-- security definer), so this grants no more than a plain select already allowed. Matches the
-- access the client's existing loadQsrMenuItemActivity() call already relied on.
grant execute on function public.qsr_menu_item_activity_summary(date, date) to authenticated, anon;

comment on function public.qsr_menu_item_activity_summary(date, date) is
  'Per-(loc,item_number) SUM of waste/comp(emp_meal+mgr_meal)/promo/activity over an optional [p_start,p_end] window -- server-side aggregate for Pricing Engine''s enrichItemMargins(), replacing a client-side pull of every raw row (dispatch 2026-10-14, "pricing data not loading").';
