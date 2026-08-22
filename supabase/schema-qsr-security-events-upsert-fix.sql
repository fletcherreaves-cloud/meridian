-- ── qsr_security_events upsert-key fix (dispatch #65) ───────────────────────────────────────────
-- schema-qsr-security-events.sql's own unique index uses an EXPRESSION:
--   (tenant_id, loc, event_token, event_dt, event_tm, coalesce(order_key, ''))
-- PostgREST (what supabase-js's .upsert({onConflict}) compiles to) can only target a conflict on
-- a plain COLUMN list -- it cannot reference an arbitrary expression like coalesce(...). An
-- upsert against that index therefore fails outright with "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification", which scripts/qsrsoft-security-events-
-- pull.mjs would have hit on its very first real write. Found by reading the schema before
-- writing the pull script's upsert call, not by running it and hitting the error live.
--
-- Fix: drop the expression index, add a real UNIQUE constraint on the plain columns using
-- NULLS NOT DISTINCT (Postgres 15+, which Supabase runs) -- this gets the exact same "a null
-- order_key still participates in uniqueness" behaviour the original comment described, but as
-- a plain-column constraint PostgREST's onConflict can target directly.

drop index if exists public.qsr_security_events_upsert_key;

alter table public.qsr_security_events
  add constraint qsr_security_events_upsert_key
  unique nulls not distinct (tenant_id, loc, event_token, event_dt, event_tm, order_key);

comment on constraint qsr_security_events_upsert_key on public.qsr_security_events is
  'Upsert key for scripts/qsrsoft-security-events-pull.mjs (onConflict: tenant_id,loc,event_token,event_dt,event_tm,order_key). NULLS NOT DISTINCT so a null order_key still collides with another null order_key on the same (loc,event_token,event_dt,event_tm) rather than allowing unlimited duplicates.';
