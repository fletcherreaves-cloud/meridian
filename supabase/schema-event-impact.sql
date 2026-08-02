-- ── Event Impact Registry (Notes 47 "findings home") ────────────────────────────────────────────
-- Per store × event-type measured sales impact — the housed, drillable record of what each kind of
-- event actually does to sales at each location. Seeded from the 2022-2025 football measurement
-- (home/away n-shrunk lifts); extensible to festivals, weather, LTOs, etc. Editable overrides with a
-- measured seed kept for reset. Feeds the forecast. Run once in the Supabase SQL editor.

create table if not exists public.event_impact (
  loc            text not null,          -- store number, unpadded
  event_type     text not null,          -- 'sports' | 'event' (festival) | 'weather' | 'holiday' | ...
  home_impact    numeric,                -- sales-lift fraction for the primary/home case (e.g. 0.07 = +7%)
  away_impact    numeric,                -- sales-lift fraction for the away case (sports only; null otherwise)
  measured_home  numeric,                -- original measured seed (for reset-to-measured)
  measured_away  numeric,
  n_home         integer,                -- sample size behind the measurement
  n_away         integer,
  source         text default 'measured',-- 'measured' | 'override' | 'default'
  store_type     text,                   -- editable soft label: 'rural' | 'travel' | 'metro' (not used in math)
  note           text,
  updated_by     text,
  updated_at     timestamptz default now(),
  primary key (loc, event_type)
);
create index if not exists event_impact_loc_idx on public.event_impact (loc);
alter table public.event_impact enable row level security;
create policy "event_impact: read scoped" on public.event_impact for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid()
    and (p.accessible_locs is null or public.event_impact.loc = any (p.accessible_locs))));
create policy "event_impact: write scoped" on public.event_impact for all
  using (auth.role() = 'service_role'
    or exists (select 1 from public.profiles p where p.id = auth.uid()
      and (p.accessible_locs is null or public.event_impact.loc = any (p.accessible_locs))))
  with check (auth.role() = 'service_role'
    or exists (select 1 from public.profiles p where p.id = auth.uid()
      and (p.accessible_locs is null or public.event_impact.loc = any (p.accessible_locs))));
