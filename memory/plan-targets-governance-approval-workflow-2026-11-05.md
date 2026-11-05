# Design: Targets/Projections Ownership, Review Notes & Approval Workflow (2026-11-05)

## The ask (owner, verbatim, 2026-11-05)

> "let's devise a way to delegate whom is responsible and thus has full read/write access to
> these areas [Projections, Sales, Monthly/Yearly Targets]. It should be limited to one user per
> organization... I am ok with other users having read access only, or even perhaps we curate
> reports that show what the projections are... I would envision for other users to be able to
> make notations or send notes for potential corrections to be considered. A fail-safe of sorts
> to cover things we simply cannot or do not know in advance... how can we easily create an
> approval flow? ... I generate monthly projections and manually run the vba to create the sheets
> from the workbook... using a Draft, Pending Approval, In Review and Final appendage to the
> filenames... Realistically, all I currently use is Pending Approval and Final. These get
> emailed out due on the 15th of the month proceeding the month it takes effect and I give the
> operators (not supervisors) ~5 days to review and submit changes or requests. The final version
> is then submitted and dispersed to all levels ~20th of each month... bake into settings a way to
> customize this based on user or organization preference... Yearly should fall due in November...
> also be customizable... handled by pre-filling suggested targets and then having an actual
> meeting where changes can be discussed and made... printed copies by location for review and
> manual edit to be collected and updated in app should be an option as well as... live updating
> in app... if you see fit, you are welcome to rework our current settings... document work flows
> and add help tools and help icons... ere on caution as to making sure information... is
> prevalent and easy to find and consistent throughout panels."

Four sub-systems, in priority order (A and C are the load-bearing ones; B and D round it out):

- **(A) Ownership** — exactly one designated user with Monthly/Yearly/Projections write access.
- **(B) Correction notes** — a fail-safe for everyone else to flag something the owner should see.
- **(C) Approval-status workflow** — configurable due dates, a Pending Approval → Final state,
  email dispersal.
- **(D) Yearly print-and-reenter** — a paper round-trip option for the annual targets meeting.

## What already exists — measured before designing anything new

| Need | What's already in this codebase | Verdict |
|---|---|---|
| A "write access gated separately from read" model | **Doesn't exist for Targets today.** `panel-registry.js` gates `planning`/`monthly-proj`/`yearly-proj` on the single key `analytics.store` — read and write are the SAME permission. This directly confirms the owner's own observation: everyone who can see Monthly/Yearly Targets today can also edit them. | Build it |
| A precedent for splitting view/edit/approve into separate perm keys | **Performance Reviews already does exactly this**: `reviews.view` / `reviews.create` / `reviews.submit` / `reviews.approve` in `PERMISSION_GROUPS` (`src/engine/permissions.js`). | Reuse the shape |
| A "designated single person" concept distinct from role | **Doesn't exist anywhere in `permissions.js`.** Everything today is role-level (`DEFAULT_ROLES`/`hasPermission`). A true one-user constraint needs its own field. | Build it, additively |
| Where org-wide config (not per-user) already lives | **`org_config` table, key `app_settings`** — the SAME blob `settings.monthlyTargetConfig`/`settings.yearlyTargetConfig` (Tier 1/2 work, just shipped) already live in. A new `settings.targetsGovernance` key slots into the exact same object, zero new table. | Reuse directly |
| A notes/correction-request precedent to copy | **`coaching_cycle_notes`** (table + `loadCoachingCycleNotes`/`addCoachingCycleNote` in `supabase.js`) — freeform note, scoped to a record, author auto-attributed, insert-only, timestamped. The closest fit by far; `task-queue.js`'s ticket system and `calendar.js`'s `EventEntryModal` are both heavier general-purpose systems, not a close match. | Copy the pattern |
| A dated, audience-filtered scheduled email | **`eom-digest-send.yml`**'s pattern: an hourly cron that self-gates by reading an `org_config`-stored day/hour, not a fixed-cadence subscription. Monthly-cadence GitHub Actions already exist too (`measure-retail-impact.yml`, `cron: '0 8 1 * *'`). | Reuse the pattern |
| A status column on `monthly_targets`/`yearly_targets` | **Neither table has one.** Both are per-store rows (PK `(loc,year,month)` / `(loc,year)`); the owner's approval status is a per-PERIOD concept (the whole month's/year's set moves through the workflow together), not per-store. Adding a column to either big table would wrongly imply per-store status. | New small sidecar table |
| A print-and-reenter workflow | **Doesn't exist.** Yearly already has a Print Report action (`print-html.js` pattern) to build from, but the "blank column for hand markup, then collect and type back in" half is genuinely new. | Build it (smallest piece) |

## Proposed design

### (A) Ownership

**New permission keys**, added to `PERMISSION_GROUPS` in `src/engine/permissions.js`, mirroring
the Performance Review shape exactly:

- `targets.view` — see Monthly/Yearly Targets and Sales Projections (read-only by default for
  most roles — this REPLACES `analytics.store` as the gate on these three panels specifically).
- `targets.edit` — type into a cell, run Customize, change a value. Narrow: only the default
  top-tier roles (`admin`/`owner`) carry it by default.

**The "exactly one person" constraint** is stronger than a role, so it needs its own field:
`settings.targetsGovernance.ownerId` — a Supabase user id, stored in the same `app_settings` blob.
`hasPermission('targets.edit')` becomes true when EITHER the caller's role already grants it
(today's `admin`/`owner` tier, unchanged) OR the caller's id matches the configured `ownerId` —
so the real owner can later delegate this to one specific other person (any role) without a code
change, and the system never has zero owners (role-based default always works as a floor).

**Settings UI**: a "Targets Owner" picker in the Settings → (new) "Targets Governance" section —
a dropdown of the org's users, admin-only to change.

**Everyone else**: `targets.view` on Monthly/Yearly/Projections, read-only — the click-to-edit
cells simply don't activate for a non-owner, same as how a locked/finalized period already should
behave (see C below). This is the "curated report" half of the ask — no separate report-only
surface needed, the existing panels already read fine; what's missing is a reader who can't
accidentally write.

### (B) Correction notes — the fail-safe

**New table `target_correction_notes`**, a near-exact copy of `coaching_cycle_notes`'s shape:

```
id, tenant_id, period_type ('monthly'|'yearly'), year, month (nullable for yearly),
loc (nullable — a note can be store-specific or about the whole period), field_key (nullable —
general or about one specific metric), note_text, author_name/email, created_at,
resolved boolean, resolved_at, resolved_by
```

Insert-only for everyone (anyone with `targets.view` can add a note — their one write permission
into this system); only the owner can mark one resolved. A small "💬 Notes" badge/button on the
Monthly/Yearly Targets panel header shows the open-note count; clicking opens a simple thread.
This is the literal "fail-safe... for things we cannot or do not know in advance" the owner asked
for — a non-owner who notices something wrong doesn't need edit access, just a place to say so
that the owner will actually see.

### (C) Approval-status workflow

**New small table `target_period_status`**, keyed `(tenant_id, period_type, year, month nullable)`:

```
status ('draft'|'pending_approval'|'in_review'|'final'), submitted_at, submitted_by,
finalized_at, finalized_by
```

**Ship the simple 2-state UI now, keep schema room for the full 4-state later** — matches the
owner's own "realistically all I currently use is Pending Approval and Final" and his explicit
ask to make this customizable going forward without a migration. v1: a single toggle/badge
(`Pending Approval ⇄ Final`) on the panel header; `draft`/`in_review` stay in the enum, unused
until a later settings toggle turns them on.

**Settings** (same `app_settings` blob, new key):
```js
settings.targetsGovernance = {
  ownerId: <uuid>,
  monthly: { pendingApprovalDueDay: 15, reviewWindowDays: 5, finalDueDay: 20 },
  yearly:  { dueMonth: 11, dueDay: <customizable> },
}
```

**Locking**: once `status==='final'`, the owner's own click-to-edit cells disable (a confirm-to-
reopen action, owner-only, logged) — "final... submitted and dispersed" should mean final.
Non-owners can read a `pending_approval` period (that's the whole point of the review window) and
`final` once dispersed; they never see edit controls either way.

**Email dispersal** — two distinct triggers, not one cron doing everything:
1. **In-app, action-triggered**: a "Submit for Approval" button (owner-only) immediately emails
   the filtered audience (operators, not supervisors — reuse whatever role-filter the EOM digest
   system already applies for its own audience targeting) with a link into the read view. A
   "Finalize" button does the same for the Final dispersal to all levels.
2. **A due-day reminder, in-app only, not email** — reusing the Action Checklist mechanism that
   already nudges on things like "stores missing projection lock": if `pendingApprovalDueDay` has
   passed and status is still `draft`, add a checklist item. Keeps the system's one existing "are
   we on schedule" channel instead of inventing a second, parallel notification surface.

### (D) Yearly print-and-reenter

Smallest net-new piece. Yearly Targets already has a Print Report action
(`print-html.js` pattern). Add a **"Print for Review"** mode: one page per store (or per patch),
pre-filled with suggested starting values (last year's actuals, or the Smart Targets suggestion
engine already in the app), with blank space for hand-written revisions from the meeting. Re-entry
needs nothing new — the EXISTING click-to-edit cells in Yearly Targets already are the "update in
app after the meeting" step; this is a formatting mode on an existing export, not a new feature.

### Findability — the owner's own stated risk

*"This app is and will be a new experience for everyone... ere on caution as to making sure
information... is prevalent and easy to find and consistent throughout panels."* Concretely:
- A status badge (Draft/grey → Pending Approval/amber → Final/green) on both Monthly and Yearly
  Targets panel headers, same icon language both places.
- A new KB article — "Targets Governance: how review & approval works" — covering all four
  pieces, linked via the same ⓘ `InfoIcon` pattern already standard throughout the app.
- The Notes badge, the status badge, and the owner-only edit-lock all need to look and behave
  identically between Monthly and Yearly (one shared small component, not two copies).

## Build phasing (four separate, reviewable PRs — this is too large for one)

1. **Schema + permission split.** Owner runs the two new tables' SQL (DDL stays the owner's own
   action, same as every other schema file). Split `targets.view`/`targets.edit` out of
   `analytics.store` for these three panels, add the `ownerId` override, add the Settings picker.
   No status/notes UI yet — this phase alone is already a real, mergeable narrowing of who can
   write.
2. **Status workflow** — the 2-state badge, lock-on-final, Settings due-date fields, the Action
   Checklist due-day reminder.
3. **Correction notes thread.**
4. **Email dispersal** (Submit-for-Approval / Finalize buttons) + **Yearly print-for-review mode**
   + the KB article tying all four pieces together.

Each phase ships, tests, and is live-verified independently — matches how every other feature
this session has shipped, and means phase 1 (the security-relevant one) gets full attention on
its own rather than being buried in a bigger diff.

## Open questions for the owner — confirm before Phase 1 starts

RBAC changes are exactly the kind of thing this project's own standing rules (CLAUDE.md Dev
Rules, "a genuine product-judgment call... is NEVER applied unattended") say should go to the
owner as a design doc first, which is what this is. Five concrete questions:

1. **Who can the Targets Owner be?** Always whoever already holds `admin`/`owner` (today's top
   tier, unchanged default), or do you want the ability to delegate it to someone at a LOWER role
   (e.g. a DO) while still restricting everyone else? (The design supports either — just need the
   default confirmed.)
2. **Supervisor visibility**: you said the Pending-Approval email goes to operators, not
   supervisors. Do supervisors get READ access to Monthly Targets at all (e.g. once it's Final),
   or should they never see this panel regardless of state?
3. **Due-day reminder**: in-app only (Action Checklist style, as proposed), or should it also
   email you directly? Recommending in-app-only to avoid email fatigue — confirm or override.
4. **Yearly print mode**: one PDF per store, or a single multi-store packet for the meeting?
5. **OK to ship in the 4 phases above across separate PRs**, rather than one large one?

## Why this wasn't started yet

This touches RBAC (who can write production targets data) and a brand-new schema (two tables,
owner-run DDL) — Tier C by this project's own standing rules. Writing the design first, getting
the five questions above answered, costs one read; building the wrong default for "who can be the
owner" or "what locks on Final" costs a rebuild of real, security-relevant code. The YoY Trends
dashboard design (`memory/plan-yoy-trend-dashboard-2026-11-05.md`, task #90) is lower-stakes and
ready to build once scoped; this one is ready to build once the five questions above are answered.
