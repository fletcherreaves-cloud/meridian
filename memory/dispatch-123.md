# Dispatch #123 — Crew Schedule Lookup: search an employee, see their upcoming schedule

**Owner's ask (2026-08-25), full context.** The owner asked to explore whether Meridian can show
actual crew/manager schedules; after investigation confirmed it's feasible, the owner chose the
**full build** option (schedule now, actual-punch-times layered on via a separate dispatch, #124,
kept out of this one for review-safety — see "Relationship to dispatch #124" below). Verbatim
requirements: *"search for an employee and see their upcoming schedule... will need date and
location selectors, multi select by names and put in url page migration."*

## ⚠️ Read before writing any code — this touches employee PII

This is the first Meridian feature that lets a user **search and browse individual named
employees' schedules** (not an aggregate, not a security-rule finding). Meridian already has a
tested, RBAC-gated pattern for exactly this kind of exposure — **use it, don't invent a new
one**:

- **`src/engine/identity-vault.js`** — `getOrCreateToken(supabase, employeeName)` /
  `tokenizeRows(supabase, rows, empField)`. Routes through the `get_or_create_employee_token()`
  Postgres RPC (`supabase/schema-identity-vault.sql`) — never a raw table insert (the vault table
  has zero RLS policies by design). A name goes IN, a stable `emp_token` UUID comes back; nothing
  resolves a token back to a name except the separate, gated
  `reveal_employee_identity()` path.
- **`src/views/security-panel.js`'s `securityPanelAccess(userRole, gmRevealEnabled)`** (~line 52)
  is the existing precedent for gating who can see identity-revealing employee data: admin/
  supervisor always allowed, a `manager` role only if `loadGmIdentityRevealEnabled()`
  (`src/lib/supabase.js:4288`) says their org has explicitly turned that on. **This new panel
  needs the same shape of gate** — reuse `securityPanelAccess`/`loadGmIdentityRevealEnabled`
  directly if the same role semantics apply, or a close sibling if crew-schedule visibility should
  be scoped differently (e.g. maybe GMs should always see their OWN store's schedule without the
  reveal toggle — that's a real design question, not obvious; think it through and state your
  reasoning in the PR, don't silently default to wide-open).
- **`memory/finding-qsrsoft-time-punches-endpoint-2026-08-21.md`** documents a QSRSoft endpoint
  that sits immediately adjacent to this feature and returns full SSNs if queried carelessly —
  not in this dispatch's scope (see #124), but read it anyway: the discipline it establishes
  (never fetch/log/persist SSN, assert-guard `selectCols` in any script that goes near that family
  of endpoints) is the same discipline this dispatch's own LifeLenz work should hold itself to,
  since LifeLenz's employment/identity fields are a similar sensitivity class even without an SSN
  literally present.

## What's confirmed feasible, and what still needs investigating

Confirmed by reading the actual pull script: `scripts/lifelenz-pull.mjs`'s existing
`SHIFTS_QUERY` (`ShiftsForSchedulePeriod`, ~line 702) already requests
`assignedEmploymentId` per shift — a real, stable per-employee key LifeLenz's schema exposes —
but does **not** currently request an employee name field, and the per-role rollup
(`src/engine/lifelenz-shift-jobs.js`) throws that identity away entirely, aggregating straight to
`business_role_id`. **Not yet confirmed:** whether LifeLenz's GraphQL schema exposes a name field
on whatever type `assignedEmploymentId` resolves to (an `Employment`/`Employee` type, most likely)
— investigate via introspection (the existing pull scripts already do ad-hoc GraphQL
introspection when probing an unknown field, e.g. `v4.297`'s "introspect BusinessOfficeLocation
schema to find schedule field" commit) before assuming names are reachable at all. If a name
field isn't there, `assignedEmploymentId` alone (as an opaque display key, e.g. "Employee
#12345") is still enough to ship search-by-ID and multi-select, with a name-lookup added later —
don't block the whole dispatch on this if LifeLenz genuinely doesn't expose it; degrade gracefully
and say so in the PR.

## Scope — build all of this

1. **A new or extended LifeLenz pull** capturing per-employee shift assignments (store, date,
   shift start/end, `assignedEmploymentId`, role/job title if available from the existing
   per-job pull's `businessRoleId`/`jobTitleId`, and a name if the investigation above confirms
   one is reachable). Follow this repo's standing "Adding a new automated pull" checklist in full
   (CLAUDE.md Dev Rules): watched in `sync-failure-watch.yml`, per-stream staleness visible (not
   pooled into an existing `Math.max` freshness check), a real Supabase table with `tenant_id` +
   RLS, two-path auth matching the existing pull scripts' pattern, manual-upload fallback
   considered (probably not applicable here — this is closer to Register Audit than to a P&L
   report — state your reasoning if you skip it).
2. **Any employee name captured is tokenized on ingest** via `identity-vault.js`'s
   `getOrCreateToken`/`tokenizeRows`, exactly as the Register Audit pull already does — the stored
   schedule rows carry `emp_token`, never a raw name column. Confirm this by reading how
   `scripts/qsrsoft-register-audit-pull.mjs` (or wherever Register Audit's pull lives) already
   does it, and mirror that pattern.
3. **A new panel** ("Crew Schedule" or similar — pick a name consistent with this app's existing
   nav labels) that:
   - Searches/**multi-selects by employee** (name, if reachable — resolved through
     `reveal_employee_identity()` for an authorized viewer, same as Security panel's `onReveal`
     pattern; token/ID otherwise).
   - Has **date** and **location** selectors — use the shared `DateRangeControl`
     (`src/components/PanelControls.js`) and `LocationSelector` (same file, `mode:'progressive'`
     for the same mobile-usability reason dispatch #120 just fixed elsewhere) **from day one** —
     do not hand-roll new pickers, per `memory/panel-contract.md`'s standing rule.
   - Shows each selected employee's **upcoming schedule** (shift dates/times, store, role) for
     the selected date range/location scope.
   - **Is a `route:true` panel from the start** (`panel-registry.js`), rendered via
     `RoutePanelShell` — the owner explicitly asked for this, and it avoids ever needing a
     modal→route conversion later. Follow an existing `route:true` panel's wiring pattern (grep
     `panel-registry.js` for other `route:true` entries and see how they're rendered in
     `App.js`/`shell.js`).
   - Gated by the RBAC decision above — do not ship this reachable by every role by default.
4. **Leave a clear, explicit seam for dispatch #124** (actual punch times) to add a "Punched"
   column/section later without a rewrite — e.g. a per-employee-per-day row shape that a punch
   dataset can join onto by `(loc, date, emp_token)` or equivalent. Don't build the punch feature
   itself here.

## Relationship to dispatch #124

Dispatch #124 (QSRSoft actual-punch-times pull) is being written and dispatched **separately, in
parallel** — it touches a completely different pull script and a new, separate Supabase table, so
it can be built and reviewed independently without file conflicts with this dispatch. Wiring
punch data INTO this panel as a "Punched" column is explicitly **out of scope for both #123 and
#124** — it will be a small, focused follow-up dispatch once both land, once there's a real panel
and a real punch table to join.

## Verification bar

- Confirm the LifeLenz introspection finding (name field reachable or not) is stated plainly in
  the PR, with evidence (the actual introspection query/response), not assumed either way.
- Confirm no raw employee name ever lands in a Supabase table outside the identity vault's own
  `employee_identity_vault` — grep your own new/changed pull script and table schema for this
  before calling it done.
- Confirm the RBAC gate: a role without access sees a permission-denied state, not the schedule
  data with a delay.
- Render the panel with realistic multi-employee, multi-week synthetic data; confirm search,
  multi-select, date range, and location scope all narrow results correctly, and that the panel
  is reachable via its own URL (`route:true`).
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean. Report before/after entry-chunk size per the standing performance-budget rule (this
  should be a new lazy-loaded panel, not added to the eager entry).

## Do NOT

- Do not touch QSRSoft's punch endpoints or anything from `memory/finding-qsrsoft-time-punches-
  endpoint-2026-08-21.md` — that's dispatch #124, entirely.
- Do not store a raw employee name in any table other than the identity vault itself.
- Do not hand-roll a new date or location picker — reuse the shared components.
- Do not skip the RBAC gating question — decide it explicitly and say why in the PR.
