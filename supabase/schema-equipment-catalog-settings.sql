-- ── Equipment Profile — PQRG reference settings (owner request 2026-11-02) ───────────────────
-- Owner, verbatim: "I want to tie in settings for equipment to the surveys... Tie it in as
-- references based on models selected that can be verified." Source: the Pocket Quality
-- Reference Guide (PQRG) -- McDonald's crew reference manual giving the exact operating settings
-- (cook time, temp, gap, steam, fan, platen temp, etc.) per equipment type/model/product.
--
-- Sibling table to equipment_catalog_consumables (schema-equipment-catalog.sql) -- same shape,
-- same purpose class (the correct reference data for a given catalog item), just settings
-- instead of consumable WRINs. One catalog item can have several rows (one per product it cooks
-- -- a combi oven's Bacon settings differ from its Folded Eggs settings).
--
-- Matching note: PQRG settings are sometimes brand/model-agnostic (fryer temp/time, grill cook
-- time/gap/temp, UHC holding temp/time are McDonald's-standardized targets that apply regardless
-- of which approved fryer/grill/UHC brand a store has) and sometimes brand-specific (combi oven
-- programs differ between Blodgett and Convotherm; toaster settings differ by Antunes/Prince
-- Castle sub-model). The seed script (scripts/seed-equipment-catalog-settings.mjs) matches
-- type-only PQRG entries to EVERY catalog_item_id of that type, and brand/model-specific entries
-- to the matching catalog row(s). needs_review=true marks a row where the match required
-- inferring which of several catalog rows bundled under one model string (e.g. "UTX-200 /
-- CTX-200") the PQRG's named variant corresponds to -- surfaced to the owner, never silently
-- asserted as certain.
create table if not exists public.equipment_catalog_settings (
  id               uuid             not null default gen_random_uuid() primary key,
  tenant_id        uuid             not null default '00000000-0000-0000-0000-000000000001',
  catalog_item_id  uuid             not null references public.equipment_catalog(id) on delete cascade,
  product          text             not null,     -- e.g. 'Bacon, Applewood Smoked', 'French Fries', 'Quarter Meat (Frozen)'
  setting_group    text,                           -- e.g. 'Grill Times, Temperatures & Settings', 'Combi Oven', 'UHC Holding Instructions'
  settings         jsonb            not null,      -- flexible key/value, e.g. {"cookTime":"90 sec","gapSetting":".265","grillTemp":"Upper 425°F, Lower 365°F","warmUpTime":"20 min"}
  needs_review     boolean          not null default false,  -- true = the catalog_item_id match required inferring between bundled model variants
  review_note      text,             -- why, when needs_review is true
  source_doc       text             not null default 'Pocket Quality Reference Guide (PQRG)',
  source_page      int,
  created_at       timestamptz      not null default now()
);

create index if not exists equipment_catalog_settings_item_idx on public.equipment_catalog_settings (catalog_item_id);

alter table public.equipment_catalog_settings enable row level security;

drop policy if exists "equipment_catalog_settings: tenant read" on public.equipment_catalog_settings;
create policy "equipment_catalog_settings: tenant read" on public.equipment_catalog_settings
  for select to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "equipment_catalog_settings: admin write" on public.equipment_catalog_settings;
create policy "equipment_catalog_settings: admin write" on public.equipment_catalog_settings
  for all to authenticated
  using (get_my_role() in ('admin', 'owner'))
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

comment on table public.equipment_catalog_settings is
  'PQRG reference operating settings per equipment_catalog item (2026-11-02) -- the "references based on models selected that can be verified" the owner asked for. Public read goes through the equipment-survey edge function (service role), same as equipment_catalog_consumables.';

-- ── Per-entry "I checked this against the equipment" acknowledgment ─────────────────────────────
-- equipment_survey_entries is append-only (see schema-equipment-survey.sql) -- this is a flat
-- field on the entry row itself, same convention as its existing cert_date/placement_zone flat
-- columns, not a new jsonb blob. Records that the crew member reviewed the PQRG reference panel
-- for the model they picked, not a claim that every individual setting was independently
-- re-measured -- the honest scope of a walkthrough form, not a calibration audit.
alter table public.equipment_survey_entries add column if not exists settings_reviewed boolean not null default false;
alter table public.equipment_survey_entries add column if not exists settings_review_notes text;

comment on column public.equipment_survey_entries.settings_reviewed is
  'true when the submitter viewed the PQRG reference settings panel for the matched catalog model and confirmed it against the real equipment (2026-11-02).';
comment on column public.equipment_survey_entries.settings_review_notes is
  'Free-text note from the submitter if settings looked off vs the PQRG reference (e.g. "grill gap set to .300, reference says .265 -- flagged for GM").';
