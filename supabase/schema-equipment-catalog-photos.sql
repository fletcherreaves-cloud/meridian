-- ── Equipment catalog reference photos (Layout Planner, owner request 2026-10-21) ────────────
-- Real product photos for the equipment_catalog's 14 catalog TYPES (grill, fryer, toaster,
-- steamer, combi_oven, uhc, staging_cabinet, prep_line, blended_ice, abs, juice_dispenser,
-- sweetener_creamer_dispenser, espresso_1step, espresso_2step, shake_sundae), sourced from the
-- real manufacturer/PM-card reference PDFs in data/equipment-survey/Help Files/ -- none carry a
-- Proprietary/Confidential/Classified marking (checked against every candidate source doc before
-- use; two docs that DID carry "Classified - Confidential © McDonald's" were skipped in favor of
-- a clean alternate source for the same equipment type -- see scripts/upload-equipment-catalog-
-- photos.mjs's own source-file comments for the per-type mapping).
--
-- Deliberately a SEPARATE bucket from `equipment-photos` (schema-equipment-survey.sql) -- that
-- bucket holds per-INSTANCE data-plate photos a crew member captures live for one specific real
-- unit (equipment_survey_entries.photo_url), written only by the equipment-plate-extract edge
-- function. These are catalog-TYPE-level stock reference photos (one per type, not per store/
-- instance), uploaded once and reused everywhere that type appears. Mixing the two would make
-- `equipment-photos` ambiguous about what a given object actually represents.
--
-- PUBLIC read (not auth-gated) -- deliberately matching the qsr-reports/reports precedent
-- (schema.sql: "Public read — file contents are CSV business reports (no PII)... Anyone with the
-- anon key and the exact storage path can download") rather than equipment-photos' auth-gated
-- posture. These are generic manufacturer stock photos with no PII and no confidentiality
-- marking (checked, see header above) -- strictly less sensitive than the business CSVs that
-- precedent already treats as public-read, so public:true is consistent with established
-- practice here, not a new exception. A public bucket's objects are served from Storage's own
-- `/object/public/<bucket>/<path>` endpoint, which bypasses storage.objects RLS entirely for
-- GET -- no custom policy needed or added here.
--
-- Note: this file documents the bucket for reference/idempotent re-creation. In practice the
-- bucket was created live via the Storage API (supabase.storage.createBucket with service-role
-- credentials) rather than this SQL file, since that path needs no SQL-editor access -- see
-- scripts/upload-equipment-catalog-photos.mjs. Running this block in the SQL editor afterward is
-- harmless (on conflict do nothing) and keeps the bucket's existence documented in schema form
-- like every other bucket in this repo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equipment-catalog-photos',
  'equipment-catalog-photos',
  true,
  5242880, -- 5 MB max per file (these are compressed reference JPEGs, ~50-150 KB each)
  array['image/jpeg', 'image/png']
) on conflict (id) do nothing;
