-- ── org_events visibility + impact model (Phase 2 of memory/project-events-calendar-redesign-2026-09-04.md) ──
-- Owner-approved 2026-09-04. All columns nullable/defaulted so every existing row keeps behaving
-- identically -- purely additive, same shape as schema-org-events-status.sql / -sports.sql.
-- Safe to re-run. saveOrgEvents/loadOrgEvents (src/lib/supabase.js) self-heal if this hasn't run
-- yet (strip-and-retry on "column does not exist", matching the existing scope/status/sports
-- self-heal pattern already there).
--
-- visibility: the owner's calendar-vs-log distinction ("I don't necessarily need to see that
-- power was out at a location on a calendar of events but do need to see things like sporting
-- events, concerts, festivals") -- structural now, not a UI convention. Defaulted per EVENT_TYPES
-- key by EVENT_TYPE_VISIBILITY (src/constants.js), overridable per event. NOT YET READ by any
-- consumer -- this migration and its column-wiring only make the value storable/settable; the
-- calendar-vs-log FILTERING (a store's in-app/print calendar actually respecting it) is Phase 3
-- (the unified Events panel), left for that pass on purpose.
--
-- relevance/expected_impact/impact_confidence/impact_n/lead_days/lag_days: storage for the
-- PredictHQ-style relevance rank, multi-metric impact (sales/gc/dtPct/etc, alongside -- NOT
-- replacing -- the existing expected_sales_delta/expected_gc_delta scalars), a confidence tier,
-- and leading/lagging-day windows (design doc §3.2). None of these are read by forecastDay/
-- computeEventFactors (forecast.js) -- that 3-tier precedence ladder is explicitly unchanged by
-- this phase, per the design doc's own instruction. Inert until a later phase wires them in.
--
-- rrule: RFC 5545 recurrence text (e.g. "FREQ=YEARLY;BYMONTH=11;BYDAY=4TH"), NULL = one-off.
-- Storage only in this migration -- the localStorage->Supabase recurring-rules migration itself
-- (design doc Phase 1 item 7) is a separate follow-on pass, not part of this column-add.

alter table public.org_events
  add column if not exists visibility        text check (visibility in ('calendar','log')),
  add column if not exists relevance         int check (relevance is null or (relevance >= 0 and relevance <= 100)),
  add column if not exists expected_impact   jsonb,
  add column if not exists impact_confidence text check (impact_confidence is null or impact_confidence in ('measured','estimated','assumed','unknown')),
  add column if not exists impact_n          int,
  add column if not exists lead_days         int not null default 0,
  add column if not exists lag_days          int not null default 0,
  add column if not exists rrule             text;

comment on column public.org_events.visibility is
  'calendar (customer/ops-facing, shown to a GM/crew) | log (internal record, e.g. a power outage) | null = falls back to EVENT_TYPE_VISIBILITY''s default for this event_type (src/constants.js). Owner''s distinction -- see schema header.';
comment on column public.org_events.relevance is
  '0-100 local-relevance rank (PredictHQ "Local Rank" model, design doc §3.2d) -- how much this event matters AT THIS STORE, not just in general. Null = not yet computed.';
comment on column public.org_events.expected_impact is
  'jsonb map of metric -> expected fractional delta, e.g. {"sales":0.08,"gc":0.05,"dtPct":-0.02}. Alongside, not replacing, expected_sales_delta/expected_gc_delta. Informational only -- forecastDay does not read this column.';
comment on column public.org_events.impact_confidence is
  'measured (from event_impact registry) | estimated | assumed (impactWeight default) | unknown. Mirrors retail-events.js''s standing "measured lift beats assumed lift" rule as an explicit, visible tier instead of a silent convention.';
comment on column public.org_events.impact_n is
  'Sample size behind a measured impact_confidence value (e.g. event_impact.n_home/n_away). Null when not measured.';
comment on column public.org_events.rrule is
  'RFC 5545 RRULE text for a recurring event series; null = one-off. Storage only -- the localStorage recurring-rules migration is a separate pass.';
