-- ═══════════════════════════════════════════════════════════════════════════════
-- Meridian — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Profiles ──────────────────────────────────────────────────────────────────
-- One row per authenticated user. Automatically created by a trigger on signup.
create table if not exists public.profiles (
  id               uuid references auth.users on delete cascade primary key,
  name             text,
  email            text,
  role             text not null default 'manager'
                     check (role in ('admin', 'supervisor', 'manager')),
  -- accessible_locs: null = all stores; array = restrict to these store location codes
  accessible_locs  text[],
  org              text check (org in ('mcdok', 'emerald')),
  created_at       timestamptz default now()
);

-- Auto-create a profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Org config ────────────────────────────────────────────────────────────────
-- Stores the Customize panel settings (review config, thresholds, weights, etc.)
-- Key format: 'review_config' (shared) or 'review_config_mcdok' / 'review_config_emerald'
create table if not exists public.org_config (
  key        text primary key,
  data       jsonb not null default '{}',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

-- ── Reviews ───────────────────────────────────────────────────────────────────
-- One row per performance review. The full review object is stored in `data` (JSONB).
-- The scalar columns are for filtering/RLS without having to unpack the JSONB.
create table if not exists public.reviews (
  id             text primary key,           -- e.g. "ronald_mcdonald_2026_H1"
  data           jsonb not null,             -- complete review object
  reviewee_name  text,
  reviewee_loc   text,                       -- store location code, e.g. "3708"
  review_year    integer,
  review_half    text check (review_half in ('H1', 'H2')),
  status         text default 'draft',
  org            text,
  owner_id       uuid references public.profiles(id),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ── Staff assignments (optional, for location tracking from 7th notes) ────────
-- Track which manager/supervisor was responsible for which store during each period.
-- Enables accurate review attribution when someone transfers between locations.
create table if not exists public.staff_assignments (
  id          uuid default gen_random_uuid() primary key,
  profile_id  uuid references public.profiles(id) on delete cascade,
  store_loc   text not null,
  start_date  date not null,
  end_date    date,                         -- null = currently assigned
  notes       text,
  created_at  timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════
-- All policies use get_my_role() — a SECURITY DEFINER function that reads
-- profiles WITHOUT triggering RLS, preventing infinite recursion.

-- ── SECURITY DEFINER helper (run before any policies) ─────────────────────────
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── profiles RLS ──────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles: own read"  on public.profiles;
drop policy if exists "profiles: admin all" on public.profiles;

create policy "profiles: own read" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: admin all" on public.profiles
  for all using (get_my_role() = 'admin');

-- ── org_config RLS ────────────────────────────────────────────────────────────
alter table public.org_config enable row level security;

drop policy if exists "config: authenticated read"     on public.org_config;
drop policy if exists "config: admin/supervisor write" on public.org_config;

create policy "config: authenticated read" on public.org_config
  for select using (auth.uid() is not null);

create policy "config: admin/supervisor write" on public.org_config
  for all using (get_my_role() in ('admin', 'supervisor'));

-- ── reviews RLS ───────────────────────────────────────────────────────────────
alter table public.reviews enable row level security;

drop policy if exists "reviews: admin all"            on public.reviews;
drop policy if exists "reviews: supervisor read"      on public.reviews;
drop policy if exists "reviews: manager read own locs" on public.reviews;
drop policy if exists "reviews: authenticated write"  on public.reviews;
drop policy if exists "reviews: authenticated update" on public.reviews;
drop policy if exists "reviews: admin delete"         on public.reviews;

create policy "reviews: admin all" on public.reviews
  for all using (get_my_role() = 'admin');

create policy "reviews: supervisor read" on public.reviews
  for select using (
    get_my_role() = 'supervisor' and (
      (select accessible_locs from public.profiles where id = auth.uid()) is null
      or reviewee_loc = any((select accessible_locs from public.profiles where id = auth.uid()))
    )
  );

create policy "reviews: manager read own locs" on public.reviews
  for select using (
    get_my_role() = 'manager' and
    reviewee_loc = any((select accessible_locs from public.profiles where id = auth.uid()))
  );

create policy "reviews: authenticated write" on public.reviews
  for insert with check (auth.uid() is not null);

create policy "reviews: authenticated update" on public.reviews
  for update using (auth.uid() is not null);

create policy "reviews: admin delete" on public.reviews
  for delete using (get_my_role() = 'admin');

-- ── staff_assignments RLS ─────────────────────────────────────────────────────
alter table public.staff_assignments enable row level security;

-- Users can see their own assignments; supervisors/admins see all
create policy "assignments: own or above" on public.staff_assignments
  for select using (
    profile_id = auth.uid() or
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('supervisor', 'admin')
    )
  );

create policy "assignments: admin/supervisor write" on public.staff_assignments
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('supervisor', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES (performance on common query patterns)
-- ═══════════════════════════════════════════════════════════════════════════════
create index if not exists reviews_loc_idx  on public.reviews (reviewee_loc);
create index if not exists reviews_year_idx on public.reviews (review_year, review_half);
create index if not exists reviews_org_idx  on public.reviews (org);
create index if not exists assign_profile_idx on public.staff_assignments (profile_id, start_date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INITIAL SEED (run manually after schema)
-- ═══════════════════════════════════════════════════════════════════════════════
-- After creating your first user account, promote it to admin:
--   update public.profiles set role = 'admin' where email = 'your@email.com';
--
-- Emerald Arches supervisor setup example:
--   update public.profiles
--     set role = 'supervisor',
--         org  = 'emerald',
--         accessible_locs = array['6178','6838','10034','35242','37566','38609','43701']
--     where email = 'brad@example.com';
