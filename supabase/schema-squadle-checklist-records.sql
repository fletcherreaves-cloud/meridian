-- ── squadle_checklist_records — Squadle food-safety checklist tablet, item-level records ──
-- Source: Squadle's Firebase-backed real-time data layer (`hq.squadle.com`'s own backend).
-- Auth: Firebase Authentication (email/password) -> Squadle's `createRealtimePermissionSession`
-- endpoint (sl.squadle.com) mints a short-lived custom Firebase token -> exchanged via
-- `verifyCustomToken` for a Realtime-Database-scoped idToken -> raw RTDB wire protocol query
-- against `/records/<date>/<locationId>` on whichever of the ~23 sharded "customer databases"
-- (`sqdl-prod-cd-NNN`) hosts that location (resolved by brute-force fan-out on first use, then
-- cached per location -- confirmed this resolves to exactly one shard per location, live).
-- Full chain confirmed end-to-end live 2026-11-12 -- see
-- memory/finding-hme-squadle-integration-2026-11-06.md for the complete research history,
-- including the two real traps that blocked this for a while: (1) the realtime-permission-
-- session step is REQUIRED -- the plain login idToken is NOT valid on the shard databases, only
-- the one minted via that exchange; (2) the `/channels/email/<key>` lookup's key is NOT a plain
-- url-encoded email -- it is `encodeURIComponent(email).replace(/\./g,'%2E')`, i.e. the LITERAL
-- 3-character string "%2E" substituted for each "." (confirmed by reading hq.squadle.com's own
-- compiled JS bundle), which must never be re-decoded by whatever HTTP/URL layer touches it.
--
-- This table's pull script is scripts/squadle-pull.mjs. Each record is a full, item-level
-- checklist run for one store/day (shift name, every task's every action: temperature readings,
-- pass/fail formulas, signature image URLs) -- genuinely richer than the monthly compliance-%
-- rollup the owner's own manual Squadle exports show. Stored as a raw JSONB blob for Phase 1
-- (task #105) -- deliberately NOT parsed into per-task columns yet; the real shape is deep,
-- nested, and per-checklist-template-variable, so promoting fields to columns is Phase 2 work
-- once a real consuming panel/engine decides what it actually needs (same "raw bucket first,
-- promote on demand" precedent as lifelenz_compliance_audit's own `raw` column).
create table if not exists public.squadle_checklist_records (
  tenant_id           uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                 text        not null,   -- store number, 7-char zero-padded -- derived from the record's own `tags` field (one tag is literally the store number, e.g. "6972"), NOT a separate lookup table
  squadle_location_id text        not null,   -- Squadle's own location push-id (e.g. "-M8rkFa0NUGRQPamf4CH") -- kept alongside loc since the loc derivation depends on tag content existing
  dt                  date        not null,   -- the record's own date key (YYYY-MM-DD, Squadle's own partition key -- not independently re-derived from a timestamp)
  shard               text,                   -- which sqdl-prod-cd-NNN database this record was read from -- diagnostic only, lets a future re-pull skip the brute-force resolution
  created_on          timestamptz,            -- the record's own createdOn field
  data                jsonb       not null,   -- the full raw record (shifts/tasks/actions/signatures) -- see header note above
  pulled_at           timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (squadle_location_id, dt)
);

create index if not exists squadle_checklist_records_loc_dt_idx
  on public.squadle_checklist_records (loc, dt desc);

alter table public.squadle_checklist_records enable row level security;

-- Same two-layer pattern as every other tenant-scoped stream table (tenant match +
-- accessible_locs loc-scoping via the public.my_locs() RESTRICTIVE predicate).
drop policy if exists "squadle_checklist_records: tenant read" on public.squadle_checklist_records;
create policy "squadle_checklist_records: tenant read" on public.squadle_checklist_records
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "squadle_checklist_records: loc scope" on public.squadle_checklist_records;
create policy "squadle_checklist_records: loc scope" on public.squadle_checklist_records
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
-- No insert/update/delete policy for any role -- every write comes from
-- scripts/squadle-pull.mjs's service-role key, which bypasses RLS entirely.

comment on table public.squadle_checklist_records is
  'Squadle food-safety checklist tablet, item-level daily records (raw JSONB), one row per location per day. Written only by scripts/squadle-pull.mjs (service role); read gated by ordinary tenant + accessible_locs RLS. Phase 1 (task #105) -- not yet surfaced in any UI panel or metric-source chain; see memory/finding-hme-squadle-integration-2026-11-06.md for the deferred Phase 2 plan (likely extends or parallels the existing Forms Completion feature).';
