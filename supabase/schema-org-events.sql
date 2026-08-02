-- ── Org calendar events + school config (Notes 46) ───────────────────────────────────────────────
-- Cloud-first replacement for the localStorage `mf_events` calendar. Holds staffing/school/sports/
-- festival events per store, with structured Expected Impact (magnitude × daypart), owner-tunable
-- sales/GC deltas, the source URL, verification status, and a provenance stamp. Feeds the forecast.
-- Run this once in the Supabase SQL editor.

create table if not exists public.org_events (
  id                   bigint generated always as identity primary key,
  loc                  text not null,            -- store number, UNPADDED (matches STORE_NAMES / the calendar)
  date_start           date not null,
  date_end             date not null,
  span                 boolean default false,    -- multi-day event
  category             text,                     -- 'School Calendar' | 'Sports - College Football' | 'Festival / Fair' | ...
  event_type           text,                     -- EVENT_TYPES key: school_start/school_end/school_no_school/... | sports | event
  label                text not null,
  impact_magnitude     text,                     -- High | Medium | Low
  impact_daypart       text,                     -- breakfast | afternoon | day | dinner | all | gameday
  impact_gameday       boolean default false,
  impact_raw           text,                     -- original sheet text (audit)
  expected_sales_delta numeric,                  -- owner-tunable manual sales effect (fraction, e.g. 0.08 = +8%); overrides the impact default
  expected_gc_delta    numeric,                  -- owner-tunable manual guest-count effect (fraction)
  url                  text,                     -- verification / source hyperlink
  verification         text,                     -- Confirmed | Estimated
  note                 text,
  entered_by           text,                     -- provenance: who
  entered_at           timestamptz default now(),-- provenance: when
  method               text,                     -- provenance: how — 'bulk upload' | 'manual' | 'ai search' | 'recurring rule'
  updated_at           timestamptz default now(),
  unique (loc, date_start, label)
);
create index if not exists org_events_loc_date_idx on public.org_events (loc, date_start);
create index if not exists org_events_date_idx on public.org_events (date_start);
alter table public.org_events enable row level security;
-- Read: scoped to the caller's accessible stores (owner/null = all).
create policy "org_events: read scoped" on public.org_events for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.accessible_locs is null or public.org_events.loc = any (p.accessible_locs))
  ));
-- Write: any authenticated user for their accessible stores, plus the service role (bulk import).
create policy "org_events: write scoped" on public.org_events for all
  using (
    auth.role() = 'service_role'
    or exists (select 1 from public.profiles p where p.id = auth.uid()
               and (p.accessible_locs is null or public.org_events.loc = any (p.accessible_locs)))
  )
  with check (
    auth.role() = 'service_role'
    or exists (select 1 from public.profiles p where p.id = auth.uid()
               and (p.accessible_locs is null or public.org_events.loc = any (p.accessible_locs)))
  );

-- Per-store school district config: term dates + bell times → daypart forecasting signal.
create table if not exists public.org_school_config (
  loc          text primary key,        -- store number, unpadded
  city         text,
  state        text,
  district     text,
  first_day    date,
  last_day     date,
  start_time   text,                     -- bell time, e.g. '8:05 AM'
  stop_time    text,
  verification text,
  url          text,
  updated_at   timestamptz default now()
);
alter table public.org_school_config enable row level security;
create policy "org_school_config: read scoped" on public.org_school_config for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.accessible_locs is null or public.org_school_config.loc = any (p.accessible_locs))
  ));
create policy "org_school_config: write scoped" on public.org_school_config for all
  using (
    auth.role() = 'service_role'
    or exists (select 1 from public.profiles p where p.id = auth.uid()
               and (p.accessible_locs is null or public.org_school_config.loc = any (p.accessible_locs)))
  )
  with check (
    auth.role() = 'service_role'
    or exists (select 1 from public.profiles p where p.id = auth.uid()
               and (p.accessible_locs is null or public.org_school_config.loc = any (p.accessible_locs)))
  );
