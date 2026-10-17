# Access Log (app_access_log) — v5.577, 2026-10-17

## Trigger

Owner: "Should we incorporate any usage logs/reports for auditing and so forth" — an open,
exploratory question, not a scoped ask. Researched the codebase first (not speculation) before
answering: what already exists, what's genuinely missing. Owner then gave explicit latitude to
scope and build it: "Whatever you feel is best for now. We can always pivot later."

## What research found (before building anything)

- **Several proven, append-only, data-CHANGE audit tables already exist**: `org_assignment_audit`
  (supervisor/GM reassignments), `lifelenz_punch_edits` (who edited a time punch), and
  `identity_reveal_log` (every token→real-name reveal). Same shape every time: tenant-isolation
  policy + a RESTRICTIVE role-gate policy + no update/delete policy at all.
- **Zero general application-usage logging anywhere** — no login tracking, no panel-open
  tracking, nothing. `user_settings` is upsert-only (overwritten each save, no history).
- Supabase's own `auth.audit_log_entries` exists and captures logins for free, but this app
  never reads or surfaces it.
- SAGE's ad-hoc chat has no durable, queryable record of what was asked/answered — only
  scheduled/saved prompts (`sage_prompt_runs`) get real DB history.

## Scope decision

Deliberately NOT blanket usage telemetry (tracking every panel open across the whole app) —
low value for a 1-2-operator tool, high effort, and a real scope-creep risk the owner's own
"whatever's best, pivot later" framing explicitly invited avoiding. Scoped to two event types:

1. **`login`** — a real credential-based sign-in. `AuthGate.js`'s `onAuthStateChange` callback
   fires `'SIGNED_IN'` only on an actual credential check — NOT on `'INITIAL_SESSION'` (an
   already-persisted session restored on page load/refresh) or `'TOKEN_REFRESHED'` (a silent
   background renewal). Logging those would make every page refresh look like a fresh login.
2. **`panel_view`** — a view of either of the app's two existing Owner/Admin/DO-only panels:
   Pay Rate History (`src/views/pay-rate-history.js`) and Security (`src/views/security-panel.js`,
   logged only once `permState` resolves to `'allowed'`, never on a denied attempt). Not
   instrumented on every panel — pivot to more panels later if a real need shows up.

## Extension 1 (same day, owner: "other panels sound like a good plan")

Grepped `panel-registry.js`/`permissions.js` for every panel gated behind a permission key
narrower than the broadly-granted `analytics.*` tier (the same test Pay Rate History/Security
were picked by) and found three more real, narrowly-gated panels, none of them blanket
telemetry:

- **`admin-panel`** (`AdminPanel`, `src/views/admin.js`) — full user/role management, gated
  `users.manage.all`: **admin/owner only**, the single tightest permission in the whole system
  (tighter even than `payroll.view`/`security.auditLog`). The clearest match to the original
  rationale.
- **`settings`** (`Settings`, `src/views/management.js`) — app config, gated `settings.view`:
  VP/DO/Admin/Owner (false for Supervisor/OM/Manager/GM/SM-AM-DM).
- **`panel-manager`** (`PanelManagerPanel`, `src/app/App.js` — defined inline, not a separate
  view file) — nav/registry control, same `settings.view` gate as Settings.

Deliberately did NOT add Performance Reviews (`reviews.view` is broadly granted to almost every
role — doesn't fit the "restricted tier" test) or Data Manager (`data.upload`, also broad).
Checked for a dedicated roster/PII viewer (CLAUDE.md's `employeeRoster` PII fields) — none
exists in the UI; that data never reaches a panel, so there's nothing to instrument there.

No schema change needed — `app_access_log.panel_id` is free text with no `check` constraint, so
the three new `panel_id` values need only the app-side change + `access-log.js`'s `PANEL_LABELS`
map, not a new migration. All three panels only ever mount after their own `perm(...)` gate in
`App.js` has already passed, so (like Pay Rate History, unlike Security) no internal
`permState` resolution dance was needed — a plain mount-effect suffices.

## What shipped

- `supabase/schema-app-access-log.sql` — `app_access_log` table. Columns: `actor_id`,
  `event_type` (`'login'|'panel_view'`), `panel_id` (null for login), `created_at`. RLS: tenant
  isolation (permissive) + self-insert-only (`actor_id = auth.uid()`) + admin/owner-only read
  (RESTRICTIVE `get_my_role() in ('admin','owner')`) + no update/delete policy at all.
  **Deliberately tighter than `employee_pay_rate_changes`'s `('admin','owner','do')` precedent**
  — this log is oversight OF a DO's own logins/panel views too, not something a DO reviews for
  others, so DO is excluded from read access.
- `src/lib/supabase.js`'s `logAppAccess(eventType, panelId)` / `loadAppAccessLog(limit)` —
  same best-effort, never-block-the-UI pattern as `logOrgAssignmentChange`.
- New permission key `security.auditLog` (`src/engine/permissions.js`) — `true` only for
  `admin`/`owner` (via `ALL_PERMISSION_KEYS` auto-grant), explicitly `false` everywhere else
  including `do`.
- New viewer panel `src/views/access-log.js` (`AccessLogPanel`) — plain chronological table
  (who/event/panel/when), resolving actor names/roles via a `profiles` query. Deliberately NOT
  built on `ReportShell` — this content has no real store/date-range scope to filter on (it's
  "who accessed what, across the whole tenant"), so the location-selector/date-range machinery
  doesn't fit. `panel-registry.js` entry: `kind:'test-kitchen'` (new, unproven, needs a manual
  SQL migration run — same status `employee_pay_rate_changes` had at ship time), real eventual
  `section:'admin'` given from day one per the kind-vs-section convention, `route:true`.

## Manual action — DONE

`supabase/schema-app-access-log.sql` was run in the Supabase SQL editor the same day (owner
confirmed). `app_access_log` is live; the three new `panel_id` values above need no further SQL.

## Verification

25 new tests from the original cut (see git history for the exact names), plus 3 more for this
extension: `admin-panel-access-log.test.js`, `settings-panel-access-log.test.js`, and one added
INTO the existing `dispatch-panel-manager-core-section-2026-09-18.test.js` (not a third new
file) — each mounts the REAL panel component (not a stand-in) and asserts the exact
`logAppAccess('panel_view', '<id>')` call on mount, same pattern as
`pay-rate-history-panel.test.js`'s own logging test.

**PanelManagerPanel's test deliberately did NOT get its own new test file.** `PanelManagerPanel`
is defined inline in `src/app/App.js` (not a separate view module), so any test exercising it has
to import that whole file. A first attempt added a dedicated
`panel-manager-access-log.test.js` alongside the pre-existing
`dispatch-panel-manager-core-section-2026-09-18.test.js` (which already imports the same
component from the same place) — under the full suite, Vitest's per-file module isolation meant
App.js's module graph loaded a SECOND time, and a stray dynamic import
(`at-a-glance.js`→`count-cycle.js`→`weekly-cadence.js`, unrelated to Panel Manager itself)
resolved after that second file's environment had already torn down
(`EnvironmentTeardownError`, surfaced only under the full-suite run, not in isolation). Fixed by
adding the logging assertion into the one existing test file instead of a second one.

Full suite run alongside this work also surfaced 3 unrelated, pre-existing failures
(`item-velocity-panel.test.js`, `labor-opportunity-cost-panel.test.js`,
`weather-impact-panel.test.js`) caused by the sandbox's wall-clock date rolling from 2026-10-16 to
2026-10-17 mid-session: each test's `D(d) = new Date(Date.now() - d*86400000)` fixture dates are
relative to real "now", but so is ReportShell's own default date-range
(`resolveDatePreset`→`lastClosedBusinessDay(today)`, `src/components/PanelControls.js`/
`src/utils/date.js`) — a day-boundary rollover shifts which fixture days fall inside the real
default range out from under a test written against a specific prior "now". Fixed by pinning
`Date.now()` with `vi.useFakeTimers()`/`vi.setSystemTime()` in each date-dependent test (the same
established pattern already used in 10 other files in this suite), not by touching
ReportShell/resolveDatePreset themselves — those were never the bug.
