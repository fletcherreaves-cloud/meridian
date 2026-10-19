-- ── Equipment Profile — equipment catalog (Phase 1 of 3, owner request 2026-10-18) ─────────────
-- See memory/project-equipment-profile.md for the full spec. This is the master reference list
-- an eventual store walkthrough form (Phase 2) will pick from via dropdown: equipment type ×
-- manufacturer × model. The app's actual stated purpose (owner, same conversation) is a GATING
-- reference -- grills/toasters take manufacturer-specific Teflon release sheets, espresso/
-- shake/OJ machines take manufacturer-specific chemicals, and ordering the wrong one is a real,
-- costly mistake. Knowing which model a store actually has is what lets a later feature
-- cross-reference `equipment_catalog_consumables` against that store's real
-- `qsr_ebos_line_items` purchases and flag a wrong-WRIN order.
--
-- Seeded (scripts/seed-equipment-catalog.mjs) from the one real structured cross-reference
-- document on hand: data/equipment-survey/Reference Guides/Grill_Toaster_Release_Sheets-
-- Belts_Reference_Guide.pdf (Martin Brower, updated 2024-01-06) -- grills and toasters only.
-- Every other equipment type (fryers, UHC, beverage/McCafé, blended ice, combi ovens, prep
-- lines, breakfast staging) has manufacturer Equipment Resource sheets in
-- data/equipment-survey/Help Files/ but no comparable model->consumable-WRIN cross-reference
-- table yet -- those categories start empty and grow organically via the Phase 2 "type it in,
-- flag for review" escape hatch, same as the owner's original spec intends.

create table if not exists public.equipment_catalog (
  id               uuid             not null default gen_random_uuid() primary key,
  tenant_id        uuid             not null default '00000000-0000-0000-0000-000000000001',
  type             text             not null,          -- e.g. 'grill', 'toaster' -- free text, not an enum: new types arrive via the flag-for-review path, not a migration
  manufacturer     text             not null,
  model            text             not null,           -- as a human reads it, e.g. "2-platen Electric (MWE-9501/9801, MWG-9501)"
  model_aliases    text[]           default '{}',        -- individual model numbers, for matching/search (e.g. '{MWE-9501,MWE9801,MWG-9501}')
  needs_serial     boolean          not null default false,
  needs_cert_date  boolean          not null default false,
  flagged          boolean          not null default false,  -- true = crew-added variant pending owner review (spec: immediately selectable by everyone, reviewed later)
  source           text             not null default 'official',  -- 'official' (seeded from a real vendor reference doc) | 'crew-added'
  source_doc       text,             -- which reference document this came from, for traceability
  notes            text,
  created_by       text,             -- free-text name on a crew-added entry (no login on the eventual survey form -- see Phase 2 design); null for seeded/official rows
  created_at       timestamptz      not null default now()
);

create index if not exists equipment_catalog_type_idx on public.equipment_catalog (type, manufacturer);

alter table public.equipment_catalog enable row level security;

-- Reference data: any authenticated user can read (needed for the walkthrough form's dropdown)
-- and insert (the "type it in, flag for review" escape hatch must work for anyone on the spot,
-- per the owner's own spec -- a crew-added row always lands with flagged=true, enforced by the
-- insert policy below, not left to the client to set honestly).
drop policy if exists "equipment_catalog: tenant read" on public.equipment_catalog;
create policy "equipment_catalog: tenant read" on public.equipment_catalog
  for select to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "equipment_catalog: authenticated insert" on public.equipment_catalog;
create policy "equipment_catalog: authenticated insert" on public.equipment_catalog
  for insert to authenticated
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and flagged = true);

-- Clearing a flag (owner review) or correcting a seeded row is an admin-only update.
drop policy if exists "equipment_catalog: admin update" on public.equipment_catalog;
create policy "equipment_catalog: admin update" on public.equipment_catalog
  for update to authenticated
  using (get_my_role() in ('admin', 'owner'))
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

comment on table public.equipment_catalog is
  'Equipment Profile project (memory/project-equipment-profile.md), Phase 1 -- type x manufacturer x model reference list for the Phase 2 store walkthrough form''s dropdown. flagged=true rows are crew-added variants pending owner review.';

-- ── Per-model consumable WRIN cross-reference ───────────────────────────────────────────────
-- The actual gating data: for a given catalog item, which WRIN(s) are the CORRECT ones to
-- order. One catalog item can have several (a grill has an upper AND lower release sheet; a
-- toaster can have a release sheet plus more than one belt type).
create table if not exists public.equipment_catalog_consumables (
  id               uuid             not null default gen_random_uuid() primary key,
  tenant_id        uuid             not null default '00000000-0000-0000-0000-000000000001',
  catalog_item_id  uuid             not null references public.equipment_catalog(id) on delete cascade,
  consumable_type  text             not null,     -- e.g. 'upper_release_sheet', 'lower_release_sheet', 'belt_crown', 'belt_main', 'belt_heel_club', 'belt_wrap'
  wrin             text             not null,
  label            text,             -- human description from the source doc, e.g. "Crown Belt (2 belts)"
  notes            text,             -- e.g. a noted upcoming WRIN changeover once a current one depletes
  source_doc       text,
  created_at       timestamptz      not null default now()
);

create index if not exists equipment_catalog_consumables_item_idx on public.equipment_catalog_consumables (catalog_item_id);
create index if not exists equipment_catalog_consumables_wrin_idx on public.equipment_catalog_consumables (wrin);

alter table public.equipment_catalog_consumables enable row level security;

drop policy if exists "equipment_catalog_consumables: tenant read" on public.equipment_catalog_consumables;
create policy "equipment_catalog_consumables: tenant read" on public.equipment_catalog_consumables
  for select to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "equipment_catalog_consumables: admin write" on public.equipment_catalog_consumables;
create policy "equipment_catalog_consumables: admin write" on public.equipment_catalog_consumables
  for all to authenticated
  using (get_my_role() in ('admin', 'owner'))
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

comment on table public.equipment_catalog_consumables is
  'The correct consumable WRIN(s) per equipment_catalog item -- the actual gating data this project exists for: cross-reference a store''s real equipment_survey_entries (Phase 2) against its qsr_ebos_line_items purchases to flag an order for the wrong release sheet/belt/chemical.';
