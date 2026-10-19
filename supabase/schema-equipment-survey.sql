-- ── Equipment Profile — survey links + append-only entries (Phase 2, owner request 2026-10-18/19) ──
-- See memory/project-equipment-profile.md for the full spec and the Phase 2 design agreed with the
-- owner (chat, 2026-10-19): ONE open link (no login, no per-store token, no expiry by default) with
-- an in-page store picker; every add/edit/correction is an INSERT, never an UPDATE or DELETE, keyed
-- by a stable instance_id so a correction is just a newer row for the same physical item, not a
-- destructive overwrite. "Current state" for a store = the latest row per instance_id excluding any
-- whose latest action is 'removed'. submitted_by is a free-text name (no login exists to attach a
-- real identity to an anonymous share-link write) cached client-side in localStorage, not verified.
--
-- Auth pattern mirrors eom_share_links / supabase/functions/eom-share (token-based, service-role
-- validated, the edge function is the only public gateway) -- but this link is NOT scoped to one
-- store or one period the way an EOM link is, so it gets its own, much simpler table rather than
-- reusing eom_share_links's store/period/snapshot-shaped columns.

create table if not exists public.equipment_survey_links (
  token        uuid             not null default gen_random_uuid() primary key,
  tenant_id    uuid             not null default '00000000-0000-0000-0000-000000000001',
  label        text,             -- optional note on who/what this link was generated for
  created_by   uuid references public.profiles(id),
  created_at   timestamptz      not null default now(),
  revoked      boolean          not null default false,
  view_count   integer          not null default 0,
  last_viewed_at timestamptz
);

alter table public.equipment_survey_links enable row level security;

-- Only signed-in users manage links; anonymous/public access is ONLY via the equipment-survey
-- edge function (service role) -- identical posture to eom_share_links.
drop policy if exists "equipment_survey_links: authenticated" on public.equipment_survey_links;
create policy "equipment_survey_links: authenticated" on public.equipment_survey_links
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

comment on table public.equipment_survey_links is
  'Equipment Profile project Phase 2 -- open (not store/period-scoped) share links for the crew walkthrough form. Validated server-side by supabase/functions/equipment-survey; never queried directly by the public page.';

-- ── Append-only survey entries ────────────────────────────────────────────────────────────────
create table if not exists public.equipment_survey_entries (
  id               uuid             not null default gen_random_uuid() primary key,
  tenant_id        uuid             not null default '00000000-0000-0000-0000-000000000001',
  instance_id      uuid             not null,        -- stable across corrections: same physical item, same instance_id, new row each edit
  loc              text             not null,
  catalog_item_id  uuid references public.equipment_catalog(id),   -- null when manual_entry_text is used instead
  manual_entry_text text,            -- freeform type-in when the real variant isn't in the dropdown yet
  placement_zone   text,             -- e.g. 'front_counter' | 'kitchen_line' | 'drive_thru' | 'back_of_house' (Phase 3 floor-plan placement builds on this)
  serial_number    text,
  cert_date        date,
  action           text             not null default 'added',   -- 'added' | 'corrected' | 'removed'
  submitted_by     text,             -- free-text name (localStorage-cached on the client), NOT a verified identity -- see this file's own header
  submitted_at     timestamptz      not null default now(),
  photo_url        text,             -- equipment-photos storage bucket path, when a data-plate photo was captured
  ai_extraction    jsonb,            -- raw {model,serial,manufacturer,manufactureDate,confidence_notes} from the Claude-vision autofill, kept even when the submitter corrected it -- audit trail for how well extraction is doing
  position_detail  jsonb,            -- owner feedback 2026-10-19: {side: 'side1_right'|'side1_left'|'side2_right'|'side2_left', relative: 'same_as_grill'|'opposite_of_grill'} -- both can be set together ("select both criteria if needed for clarity"); a store's own Side 1/2 numbering isn't standardized, so this is always relative to THAT store, never assumed
  created_at       timestamptz      not null default now()
);

-- Migration (safe to re-run): add position_detail to a table created before this column existed.
alter table public.equipment_survey_entries add column if not exists position_detail jsonb;

create index if not exists equipment_survey_entries_instance_idx on public.equipment_survey_entries (instance_id, submitted_at desc);
create index if not exists equipment_survey_entries_loc_idx on public.equipment_survey_entries (loc, submitted_at desc);

alter table public.equipment_survey_entries enable row level security;

-- Same posture as the links table: authenticated (in-app) users can read/manage; the public survey
-- form writes ONLY through the equipment-survey edge function (service role), never this table
-- directly, so there is no anon insert policy here.
drop policy if exists "equipment_survey_entries: authenticated" on public.equipment_survey_entries;
create policy "equipment_survey_entries: authenticated" on public.equipment_survey_entries
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

comment on table public.equipment_survey_entries is
  'Equipment Profile project Phase 2 -- append-only per-store equipment log. NEVER updated or deleted in place: a correction is a new row sharing the same instance_id, with a later submitted_at. "Current state" for a store = latest row per instance_id where the latest action != ''removed''.';

-- ── Storage bucket for data-plate photos ──────────────────────────────────────────────────────
-- Same `insert into storage.buckets` pattern as the qsr-reports/reports buckets above in
-- schema.sql. Private (not public read) -- unlike qsr-reports/reports, these are photos of
-- restaurant equipment, not business report files, and there's no reason for them to be
-- fetchable by anyone holding the anon key + a guessed path. Written only by the
-- equipment-plate-extract edge function (service role, bypasses Storage RLS entirely); read by
-- the authenticated in-app Equipment Profile UI once that exists (not yet built).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equipment-photos',
  'equipment-photos',
  false,
  20971520, -- 20 MB max per file (a phone photo is typically 2-8 MB)
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
) on conflict (id) do nothing;
