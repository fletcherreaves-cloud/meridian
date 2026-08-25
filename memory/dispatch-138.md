# Dispatch #138 — Time Punches: a real panel to view qsr_punch_times (currently no UI at all)

**Owner's ask (2026-08-25):** *"where do i find the time punches"* — following up on dispatch #124
(the QSRSoft Time Punches pull) and #126 (its un-tokenization). Investigated directly: the data is
real and correct (`qsr_punch_times`, 132,350 rows, 81,846 with a resolved `employee_name` — 62% —
via `qsr_employee_tenure`), but **zero files under `src/views` reference `qsr_punch_times` or a
punch-times loader.** The pull has been running (dispatch #124/#126) with nowhere to look at its
own output. This is a real, confirmed gap, not a "did you look in the right place" question.

## Grounding — this is a companion panel to Crew Schedule Lookup, reuse its shape

`src/views/crew-schedule-panel.js` (dispatch #123, un-tokenized by #125) is the closest existing
precedent and should be the template, not a fresh design:
- `RoutePanelShell` (route:true, deep-linkable), `DateRangeControl` + `LocationSelector` (same
  `mode:'progressive'` convention), group-by-employee + search-by-name UI.
- Names render DIRECTLY (`row.employee_name || `Employee #${geid.slice(-5)}`` fallback) — same
  un-tokenized convention dispatch #125/#126 established for this exact data class. Do NOT
  reintroduce a reveal-click/token step.
- RBAC: same ordinary panel gating as Crew Schedule Lookup (`perm:'analytics.store'` in
  `panel-registry.js`, no extra security-tier check) plus `qsr_punch_times`'s own RLS
  (`accessible_locs`-scoped, already live per `supabase/schema-qsr-punch-times.sql`) — do not
  invent a stricter gate than the sibling panel has for the same PII class.

## Data source — new loader needed, nothing exists yet

No `loadPunchTimes`-shaped function exists anywhere in `src/lib/supabase.js` — add one, following
the same shape as `loadLifeLenzShiftAssignments` (scoped by loc list + date range). Real columns to
work with (`supabase/schema-qsr-punch-times.sql`): `loc, geid, employee_name, punch_type ('shift'|
'meal'), is_paid_break, start_date_time, end_date_time, in_modified, out_modified, job_title_code,
badge_type`. Two things to build around, not work around:
1. **No business-day `dt` column** — the schema's own header flags this as unconfirmed/not
   business-day-bucketed. If you bucket punches by day for display, apply `businessDate()`
   (`src/utils/date.js`) explicitly and say so, rather than assuming `start_date_time`'s calendar
   date is the right bucket.
2. **`punch_type: 'shift'|'meal'`** — a meal punch is a break within a shift, not a second shift.
   The UI should visually pair a meal punch with its enclosing shift punch for the same
   employee/day (e.g. an indented sub-row), not list them as equal siblings — read a few real rows
   for one employee/day first to confirm the actual pairing shape before designing this.

## Scope — build

1. **New route:true panel**, e.g. `src/views/time-punches-panel.js`, nav entry next to Crew
   Schedule Lookup (same `section:'people'` or wherever Crew Schedule Lookup landed — check
   `panel-registry.js` for its actual section and match it).
2. **New `loadPunchTimes()` loader** in `src/lib/supabase.js`.
3. Location + date range scoping, employee search/group, meal-punch pairing per above.
4. In/out-modified flags (`in_modified`/`out_modified`) are a real, already-flagged loss-prevention
   signal per the schema's own comment ("real loss-prevention signal, unconsumed today") — surface
   them visibly (an icon/flag on an edited punch), don't just drop the columns from the query.

## Do NOT

- Do not add a reveal-click/token step for names — this data class is un-tokenized by explicit
  owner directive (dispatch #125/#126), same as Crew Schedule Lookup.
- Do not invent a stricter RBAC gate than Crew Schedule Lookup has for the same class of data.
- Do not assume `start_date_time`'s calendar date is the business day without applying
  `businessDate()` explicitly.
- Print/export is NOT requested here — do not add it speculatively; keep this dispatch to viewing
  the data. (If wanted later, it's the same `ExportDropdown` pattern every other panel this session
  used — trivial to add as a follow-up.)

## Verification bar

- Confirm `qsr_punch_times` rows render for a real store/date range, with real names showing for
  rows that have one and the geid-fallback for rows that don't (matches the 62%/38% split measured
  live 2026-08-25).
- Confirm a meal punch visually associates with its enclosing shift punch for the same employee/day
  (state how you determined the pairing rule from real data, not assumed).
- Confirm location scoping via `LocationSelector` actually narrows the query (RLS + explicit loc
  filter), not just a client-side filter over an unscoped fetch.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean;
  report before/after entry-chunk size (new lazy-loaded panel, should be additive-only).
