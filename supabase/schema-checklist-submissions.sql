-- ============================================================================
-- Digital Checklists — fillable, cloud-saved submissions against the QSRSoft
-- form templates in public/forms/*.json (scripts/qsrsoft-forms-pull.mjs).
--
-- Owner request, 2026-09-01: "share screenshot... I want that expanded app wide"
-- led into a separate ask — pull every published form in the QSRSoft Printable
-- Forms Library and build an actual in-app fillable checklist (not just the
-- existing blank/print-only src/views/forms-print.js), saved to Supabase like
-- every other Meridian data type (CLAUDE.md standing rule).
--
-- One row per (store, form, business date) — matches how these forms are used
-- in practice (a store fills its Breakfast Pre-Shift once per business day;
-- Breakfast/Lunch/Dinner are separate form_ids already, so this does not need
-- a separate daypart/shift column). `responses` is keyed by
-- "<sectionIndex>::<itemTitle>" (src/views/checklist-fill.js's responseKey()) —
-- items have no stable id in the raw QSRSoft payload (src/engine/forms-model.js's
-- normalizeForm() drops it), and title+section is the same identifier a human
-- filling the form would recognize, unlike a positional index that silently
-- shifts if QSRSoft reorders questions on a re-pull.
--
-- loc is PADDED (matches qsr_forms_completion / qsr_product_mix / every other
-- QSRSoft-adjacent table) — see schema-product-mix.sql's own header for why.
--
-- form_id is QSRSoft's own formId (stable UUID, matches qsr_forms_completion) —
-- the join key if a future slice wants to compare "did we fill it in Meridian"
-- against QSRSoft's own completion tracking. form_slug/form_title are DISPLAY
-- ONLY (title can carry trailing spaces / "/ Tasks" suffixes, same caveat as
-- qsr_forms_completion.form_title) — never group or join on them.
--
-- filled_by is auth.uid() only — never a plaintext name, matching the PII rule
-- qsr_forms_completion's header already established for this exact data source.
--
-- tenant_id + tenant-scoped RLS from day one (CLAUDE.md standing rule). Zero
-- rows at creation time. Safe to run top-to-bottom; idempotent.
-- ============================================================================
create table if not exists public.qsr_checklist_submissions (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc            text        not null,               -- padded, e.g. '0037566'
  form_id        uuid        not null,                -- QSRSoft formId
  form_slug      text        not null,                -- public/forms/<slug>.json — DISPLAY/lookup only
  form_title     text        not null,                -- DISPLAY ONLY — dirty; never group by this
  business_date  date        not null,
  responses      jsonb       not null default '{}',   -- { "<sectionIdx>::<itemTitle>": { value, note? } }
  status         text        not null default 'in_progress' check (status in ('in_progress','submitted')),
  filled_by      uuid,                                 -- auth.uid() — never a plaintext name
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, loc, form_id, business_date)
);

alter table public.qsr_checklist_submissions enable row level security;
drop policy if exists qsr_checklist_submissions_tenant on public.qsr_checklist_submissions;
create policy qsr_checklist_submissions_tenant on public.qsr_checklist_submissions
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- store-day lookups (the panel's own load-on-open query) and per-form drill-downs.
create index if not exists qsr_checklist_submissions_loc_date_idx on public.qsr_checklist_submissions (loc, business_date desc);
create index if not exists qsr_checklist_submissions_form_idx on public.qsr_checklist_submissions (form_id, business_date desc);
