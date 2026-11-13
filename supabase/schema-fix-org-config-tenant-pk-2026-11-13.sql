-- ═══════════════════════════════════════════════════════════════════════════════
-- Fix org_config's primary key for multi-tenant (task #70, owner-authorized when run)
--
-- schema-multitenant-phase2-rls.sql's own comment on the org_config policy block already
-- flagged this: "NOTE: key stays the PK for now (single-tenant safe). Before operator #2
-- shares this table, change the PK to (key, tenant_id) and update the app upsert onConflict."
-- That comment is 100% correct as far as it goes -- but on its own, JUST changing the PK does
-- NOT fix the collision it names. Re-read while scoping this fix, confirmed by reading the
-- live function definitions (not assumed):
--
--   - org_config's tenant_id column DEFAULTs to the hardcoded owner-tenant literal
--     ('00000000-0000-0000-0000-000000000001') and has NO set_tenant_id_trg trigger attached
--     (schema-multitenant-phase2-rls.sql's own table-list for that trigger explicitly EXCLUDES
--     profiles + org_config, "handled specially... KEEP their default").
--   - A column DEFAULT is applied before any BEFORE INSERT trigger ever sees the row -- so even
--     after the PK becomes (key, tenant_id), a second tenant's INSERT with no explicit tenant_id
--     would still land tagged as the OWNER's tenant_id (same literal, every time), because
--     nothing in this table's write path ever resolves the real caller's tenant.
--   - Net effect if only the PK changed: tenant #2 writing a NEW key for the first time gets
--     silently stamped as tenant #1 anyway, so it STILL collides with (or silently overwrites)
--     the owner's row on that same key -- the composite key never actually comes into play,
--     because both tenants' writes carry the identical tenant_id value. A migration that only
--     changed the PK would look fixed and not be.
--
-- This is a genuine correction to the *scope* task #76's framing left for org_config (not a
-- reversal of anything task #76 itself got wrong -- that pass was specifically about RLS
-- read-side correctness, which it confirmed org_config already had; this is the write-side gap
-- a PK-only fix would leave open). Confirmed before writing this that dropping org_config's
-- default is actually safe, not just copying the other-46-tables pattern blindly:
--   - every real write to org_config in this codebase (src/lib/supabase.js, eom-supervisor.js,
--     review-engine.js, permissions.js -- grepped directly) goes through an authenticated
--     client session that already called supabase.auth.getUser() and is gated by the
--     "config: tenant write" RLS policy's `get_my_role() in ('admin','supervisor')` check --
--     which itself requires an existing profiles row. So public.current_tenant_id() (a lookup
--     against profiles.tenant_id by auth.uid()) will ALWAYS resolve to a real, non-null value
--     for anyone capable of writing to org_config at all. There is no bootstrap gap here the
--     way there genuinely is for a brand-new user's first-ever signup (profiles' own reason for
--     keeping its default) -- org_config's inclusion in that same "keep the default" sentence
--     was incidental grouping, not a second real reason.
--   - No scripts/*.mjs Node pull script writes to org_config (grepped directly -- several READ
--     it for digest config, none upsert to it), so there's no service-role writer to worry
--     about losing today's single-tenant-safe fallback for -- but set_tenant_id() already
--     carries that exact fallback (coalesce to the owner tenant when current_tenant_id() is
--     null) regardless, so even a hypothetical future service-role write stays safe.
--
-- ⚠️ Run this once in the Supabase SQL editor (idempotent -- every statement is drop-if-exists/
-- create, or an ALTER guarded to no-op if already applied). This session has no DDL execution
-- path; the owner runs this, same as every other migration in this repo.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Drop the hardcoded column DEFAULT + attach the standard tenant-stamping trigger ──
-- (public.set_tenant_id() already exists -- schema-multitenant-phase2-rls.sql -- reused as-is,
-- not touched here; its own single-tenant-era fallback is separately flagged there, out of
-- scope for this pass)

alter table public.org_config alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.org_config;
create trigger set_tenant_id_trg before insert on public.org_config
  for each row execute function public.set_tenant_id();

-- ── 2. Change the primary key from (key) to (key, tenant_id) ──────────────────────
-- Every existing row already carries a real tenant_id value (the column had a non-null
-- default until step 1 above dropped it), so this is safe to run as-is -- no backfill needed.

do $$
declare
  pk_name text;
begin
  select conname into pk_name
  from pg_constraint
  where conrelid = 'public.org_config'::regclass and contype = 'p';
  if pk_name is not null then
    execute format('alter table public.org_config drop constraint %I', pk_name);
  end if;
end $$;

alter table public.org_config add primary key (key, tenant_id);

-- ── 3. Verify ──────────────────────────────────────────────────────────────────────
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.org_config'::regclass and contype = 'p';
-- expect: PRIMARY KEY (key, tenant_id)
--
-- select column_default from information_schema.columns
--   where table_schema='public' and table_name='org_config' and column_name='tenant_id';
-- expect: null (no more hardcoded default)
--
-- select tgname from pg_trigger where tgrelid = 'public.org_config'::regclass;
-- expect: set_tenant_id_trg present
-- ═══════════════════════════════════════════════════════════════════════════════
