-- ============================================================================
-- Customer Complaints (Propel Customer Care) — per-case complaint records.
-- Dispatch #231 (memory/dispatch-231-complaints-metric.md) — feeds
-- review-engine.js's `complaints` metric (Complaint Contacts/100K), which
-- previously had src:'manual' with NO automated actual-data source anywhere
-- in the app.
--
-- Endpoint confirmed (memory/finding-complaints-propel-api-2026-08-26.md):
--   GET https://propel.mcd.com/api/customer-care
--       ?action=getCustomerCareRestaurantCaseList&locationId=<hierarchy-node>
--       &timeFrame=5&page=N&rowsPerPage=N&sortBy=childCaseId&descending=false
--   → { totalCount, results: [ {locationId, parentCaseId, childCaseId,
--        issueCode, issueSubCode, incidentDate, receivedDate, caseStatus,
--        abbreviatedCustomerComments, customerComments, childCases:[]} ] }
--
-- Grain: one row per case, keyed on child_case_id (the API's own per-case id,
-- globally unique -- a "Multiple Issues" parent case's nested childCases[]
-- entries each get their own real childCaseId too, so they flatten into their
-- own rows here rather than nesting; parent_case_id is kept for traceability
-- back to the original bundled case). Loaded by
-- scripts/import-complaints-history.mjs from a seed produced by
-- scripts/browser-complaints-bulk-capture.js -- SSO+MFA gated, same
-- one-time/repeatable-backfill status as graded_visits' Propel sources, not
-- a scheduled pull. Do NOT add this to sync-failure-watch.yml.
--
-- loc is the 5-digit NSN, zero-padded, matching graded_visits' convention
-- (this table's rows come from the SAME Propel hierarchy-node chain, not the
-- 7-digit QSRSoft convention used by DAR/FOB/product-mix tables).
--
-- customer_comments is real customer-submitted free text -- NOT the
-- structured-PII class of field EcoSure's reviewer name is (no
-- get_or_create_employee_token()-style tokenization applies, per the finding
-- file's own security note), but still not a field to print/export/log
-- casually; treat with the same care as any customer-submitted text
-- surfaced elsewhere in this app.
--
-- tenant_id + tenant-scoped RLS from day one (CLAUDE.md standing rule;
-- pattern matches schema-product-mix.sql). Zero rows at creation time.
-- Safe to run top-to-bottom; idempotent. Expected: "Success. No rows
-- returned."
-- ============================================================================
create table if not exists public.customer_complaints (
  child_case_id             bigint  primary key,      -- API's own per-case id, globally unique
  parent_case_id            bigint,                    -- traceability only; may equal child_case_id
  loc                       text    not null,          -- 5-digit NSN, zero-padded (graded_visits convention)
  issue_code                text,
  issue_sub_code            text,
  incident_date             date    not null,          -- authoritative date for bucketing (owner-decided)
  received_date             date,
  case_status               text,
  abbreviated_customer_comments text,
  customer_comments         text,
  tenant_id                 uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table public.customer_complaints enable row level security;
drop policy if exists customer_complaints_tenant on public.customer_complaints;
create policy customer_complaints_tenant on public.customer_complaints
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists customer_complaints_loc_date_idx on public.customer_complaints (loc, incident_date);
