-- ── qsr_security_events — event-level controls detail (dispatch #58, #56 Part E) ─────────────────
-- audit_rows is a DAILY PER-EMPLOYEE AGGREGATE (loc, date, emp) -- no register, no timestamp. A
-- finding can say "12 refunds that day" and nothing more. This table turns those counts into
-- TIMED, REGISTER-ATTRIBUTED rows, sourced from QSRSoft's event_details endpoint (one row per
-- Register-Audit-drill-down event): time of event, register worked, daypart, tender, amount.
-- See memory/finding-qsrsoft-event-details-endpoint-2026-08-21.md for the full capture and
-- memory/dispatch-58.md for the scoping.
--
-- 🔴 RLS on this table is ROLE-GATED, copied from schema-security-findings.sql, NOT the plain
-- tenant-only policy the ordinary QSRSoft data tables (qsr_product_mix, qsr_forms_completion) use.
-- An earlier dispatch draft said "accessible_locs, like every other stream" -- that is wrong here.
-- This table carries time, register, and (pre-tokenization) crew/manager attribution for
-- loss-prevention events; a plain tenant-scoped read would make per-event controls activity
-- readable by any authenticated role, a strictly worse leak than security_findings itself.

create table if not exists public.qsr_security_events (
  id                    uuid        not null default gen_random_uuid() primary key,
  tenant_id             uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                   text        not null,               -- padded, e.g. '0029760' -- matches every other QSRSoft table's convention
  event_token           text        not null,                -- one of the 8 enumerated tokens (see EVENT_TOKENS in src/engine/security-events.js)
  event_dt              date        not null,
  event_tm              time        not null,
  reg_num               text,                                 -- e.g. 'POS0013' -- the register worked, the owner's own ask
  order_key             text,                                 -- joins to transaction_detail -- register PREFIX does NOT always match reg_num (finding file open question), do not assume a join is safe without checking
  event_name            text,
  event_display         text,
  event_amt             numeric,
  remaining_amt         numeric,                              -- semantics UNCONFIRMED (finding file) -- stored, never surfaced as a computed metric
  tender_type           text,
  daypart_name          text,
  store_busn_dt         date,                                 -- presumably the 4am ABC boundary -- unconfirmed, do not assume it matches event_dt
  -- Crew/manager are PII on ingest (plaintext "Name - badge" from QSRSoft) -- NEVER stored here.
  -- Tokenized through get_or_create_employee_token() exactly like security_findings' subject
  -- column; the badge number (a NEW identifier, NOT geid -- see finding file) is kept as its own
  -- column since it is a real, usable filter key even before any name/badge/geid reconciliation.
  crew_token            uuid        references public.employee_identity_vault(id),
  crew_badge            text,
  mgr_token             uuid        references public.employee_identity_vault(id),
  mgr_badge             text,
  mgr_code              text,                                 -- 'true' / 'Unknown' in the capture -- stored verbatim, semantics not fully settled
  pos_session_start_dt  date,
  pos_session_start_tm  time,
  updated_at            timestamptz not null default now()
);

-- Upsert key: (loc, order_key, event_dt, event_tm, event_token) is the dispatch's own CANDIDATE
-- key, explicitly flagged as UNVERIFIED against real data (the only capture to date is 38 rows,
-- one store/date/register/cashier). order_key can repeat across distinct events at the same
-- store on the same day (a single order can carry more than one promo/refund line), so event_tm
-- is included specifically to reduce same-order collisions, but this has NOT been checked against
-- a real multi-register, multi-cashier day. If the first live pull hits a genuine collision
-- (a legitimate second event with an identical key), widen the key -- do not silently drop or
-- overwrite a real row. NULLS NOT DISTINCT so a null order_key (if that ever occurs) still
-- participates in the uniqueness check rather than silently allowing infinite duplicates.
create unique index if not exists qsr_security_events_upsert_key
  on public.qsr_security_events (tenant_id, loc, event_token, event_dt, event_tm, coalesce(order_key, ''));

create index if not exists qsr_security_events_crew_idx on public.qsr_security_events (crew_token, event_dt desc) where crew_token is not null;
create index if not exists qsr_security_events_loc_date_idx on public.qsr_security_events (loc, event_dt desc);
create index if not exists qsr_security_events_token_idx on public.qsr_security_events (event_token, event_dt desc);

alter table public.qsr_security_events enable row level security;

-- Gated read: the SAME tier as security_findings' own RLS (schema-security-findings.sql:79-91,
-- copied verbatim below) -- admin/supervisor always; manager only when
-- org_config.gm_identity_reveal_enabled is set. Deliberately NOT the tenant-only pattern.
drop policy if exists "qsr_security_events: gated read" on public.qsr_security_events;
create policy "qsr_security_events: gated read" on public.qsr_security_events
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      get_my_role() in ('admin', 'supervisor')
      or (
        get_my_role() = 'manager'
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );
-- No insert/update/delete policy for any role -- writes come from the pull script's service-role
-- key, which bypasses RLS regardless. Same "writes are backend-only" pattern as security_findings.

comment on table public.qsr_security_events is
  'Event-level controls detail (dispatch #58, #56 Part E) -- time, register, daypart, amount, tender per event. crew/mgr are tokenized on ingest, never stored as plaintext. RLS matches security_findings'' role gate, not the ordinary tenant-only pattern. Written only by scripts/qsrsoft-security-events-pull.mjs (service role, once the empty-registers/cashiers question is settled -- see memory/dispatch-58.md); read gated to the same tier as reveal_employee_identity().';
