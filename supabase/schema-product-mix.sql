-- ============================================================================
-- QSRSoft Product Mix (PMIX) — per-item units + dollars per store per day.
-- Issue #291: "the biggest analytical unlock" — PMIX turns "check rose" into
-- "realized prices flat, mix shifted toward X, units of Y fell." Feeds the
-- McValue FBP critical-path check-decomposition (deadline 2026-08-25) and the
-- Pricing Engine / Filet-O-Fish-Fridays correlation work (Notes 25 #1 / 28 #5).
--
-- STATUS (2026-08-14): schema + Supabase loader only. The live API pull is NOT
-- built — see scripts/qsrsoft-pmix-pull.mjs's header for why: the report's
-- host (api.reports.myqsrsoft.com) and path (/reports/mcd/product/
-- productMixDrillDown) are known from menu.json, but the actual request
-- params and response field names have never been captured via DevTools
-- (memory/qsrsoft-report-catalog.md still marks this ⬜, same as Shift
-- Manager was before #266). Guessing them is exactly what CLAUDE.md's
-- "measure it, don't reason about it" rule and #273's "do not guess the
-- back-pull shape" note both exist to prevent. This table is real and usable
-- today via the EXISTING manual-upload parser (parsePMixData,
-- src/parsers/index.js:1209) — see savePmixRows/loadPmixRows in
-- src/lib/supabase.js. Previously that parser's output was device-local
-- IndexedDB only (pmixRows in the Dexie schema); this table makes a manual
-- PMIX upload multi-device from day one, independent of the API pull.
--
-- Grain: (loc, date, item) — one row per menu item per store per day. Stores
-- units and dollars separately, never a computed unit price (issue's own
-- instruction, same principle as VOICE's count pairs in #288) — price is a
-- derived VIEW; storing only the derivation would lose the ability to
-- re-aggregate correctly across periods or re-derive price after a
-- correction. `dollars` is nullable: the manual-upload parser currently only
-- confirms a units column in real exports seen so far — see parsePMixData's
-- own comment for the unconfirmed candidate dollar-column names tried.
--
-- loc is PADDED (matches qsr_fob/qsr_service_stats/every other QSRSoft-sourced
-- table, not the unpadded STORE_NAMES key) — PR #269 review, 2026-08-14: this
-- repo has four documented loc-padding incidents (v4.809/823/827/831) from
-- exactly this ambiguity going unstated. A STORE_NAMES join needs ltrim(loc,'0').
--
-- tenant_id + tenant-scoped RLS from day one (CLAUDE.md standing rule; pattern
-- matches schema-shift-manager-range.sql / schema-coaching-cycles.sql). Zero
-- rows at creation time — the cheapest a tenant_id column ever gets.
-- Safe to run top-to-bottom; idempotent. Expected: "Success. No rows returned."
-- ============================================================================
create table if not exists public.qsr_product_mix (
  loc         text    not null,               -- padded, e.g. '0035064'
  date        date    not null,
  item        text    not null,                -- menu item # / code from the report
  desc_       text,                             -- item description ('desc' is a reserved word)
  family      text,                             -- family/category group
  units       numeric,
  dollars     numeric,                          -- nullable — see header; NEVER a computed unit price
  disc_qty    numeric,                          -- discounted/promo unit count
  disc_amt    numeric,                          -- discount $ amount
  tenant_id   uuid not null default '00000000-0000-0000-0000-000000000001',
  updated_at  timestamptz default now(),
  primary key (loc, date, item)
);

alter table public.qsr_product_mix enable row level security;
drop policy if exists qsr_product_mix_tenant on public.qsr_product_mix;
create policy qsr_product_mix_tenant on public.qsr_product_mix
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists qsr_product_mix_date_idx on public.qsr_product_mix (date, loc);
create index if not exists qsr_product_mix_family_idx on public.qsr_product_mix (loc, date, family);
