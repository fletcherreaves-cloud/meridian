-- Give the rollup table the same tenant_id trigger the base tables have.
--
-- qsr_daily_activity_rollup.tenant_id is NOT NULL, and the DAR pull runs as
-- service_role — which has no auth.uid(), so it cannot supply a tenant itself.
-- Every other data table solves this with set_tenant_id() (schema-multitenant-
-- phase1/2), which defaults to the caller's tenant when logged in and to the
-- owner tenant for service-role ingestion. Same treatment here, so the pull can
-- upsert rollup rows without knowing about tenants at all.

drop trigger if exists qsr_daily_activity_rollup_set_tenant on public.qsr_daily_activity_rollup;
create trigger qsr_daily_activity_rollup_set_tenant
  before insert on public.qsr_daily_activity_rollup
  for each row execute function public.set_tenant_id();

-- VERIFY:
--   select tgname from pg_trigger
--    where tgrelid = 'public.qsr_daily_activity_rollup'::regclass and not tgisinternal;
