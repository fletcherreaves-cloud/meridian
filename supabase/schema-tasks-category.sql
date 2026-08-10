-- ============================================================================
-- Meridian — Task Queue: category + loc columns (issue #128)
-- ============================================================================
-- Harvested from the orphaned AIInsightsLog panel (store-analytics.js), which had a
-- well-chosen domain taxonomy — {ops, ctrl, labor, sales, weather, anomaly, other} — that
-- TaskQueuePanel never had. Also adds `loc` so an auto-filed or manually-added task can be
-- scoped to a specific store the way AIInsightsLog's entries were, instead of only ever
-- being district-wide.
--
-- Purely additive: two new nullable columns, no default required (existing rows keep
-- category=NULL/loc=NULL — the UI already treats an unset category as "other"). No RLS
-- changes — `tasks` is already tenant-scoped (schema-multitenant-phase2-rls.sql covers it).
--
-- Idempotent, safe to run any time.
-- ============================================================================

alter table public.tasks add column if not exists category text;
alter table public.tasks add column if not exists loc text;

comment on column public.tasks.category is
  'Domain facet, harvested from the orphaned AIInsightsLog taxonomy: ops | ctrl | labor | sales | weather | anomaly | other. NULL = uncategorized (treated as "other" client-side).';
comment on column public.tasks.loc is
  'Store this task is scoped to, or NULL for district-wide. Set automatically by AIBacktestScanner when it auto-files an anomaly finding (category=anomaly).';

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='tasks' and column_name in ('category','loc');
--   -- expect both rows present

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- alter table public.tasks drop column if exists category;
-- alter table public.tasks drop column if exists loc;
