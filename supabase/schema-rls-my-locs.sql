-- Companion to schema-rls-phase2-loc.sql. Create this FIRST.
create or replace function public.my_locs()
returns text[] language sql stable security definer set search_path = public
as $$
  select case
           when p.accessible_locs is null then null
           when cardinality(p.accessible_locs) = 0 then null
           else (select array_agg(ltrim(x, '0')) from unnest(p.accessible_locs) as t(x))
         end
  from public.profiles p
  where p.id = auth.uid()
$$;

comment on function public.my_locs() is
  'Caller''s accessible store list, zero-stripped. NULL = unrestricted. Takes no arguments so policies can wrap it as (select public.my_locs()) and get an InitPlan evaluated once per statement — measured 590ms bare vs 13.8ms wrapped on qsr_daily_activity.';
