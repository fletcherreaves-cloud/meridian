# Dispatch #28 — Workstream F: role-based voice

**Board (2026-08-19):** `main` at v5.067 (`bce6cb6`). Workstream E dispatch (routing vs modals)
handed off, nothing merged against it yet. Workstreams A–D are shipped or dispatched. This is
Workstream F, next in the plan's recommended order — independent of E/D's UI-shell work; it's a
data/prompt-layer change, not a routing or component change, so it can proceed in parallel with
either.

---

## This isn't just a plan aspiration — it's already a standing rule in CLAUDE.md

Before scoping the work, check what's already binding: CLAUDE.md's "UI Conventions" section
carries a **"Voice by role"** standing rule (owner-stated 2026-08-17) that restates this
workstream's premise almost verbatim — *"say the number AND the decision"*, explicitly **both, not
a trade-off**: *"The default surface of any panel states what to do, in one line, in restaurant
words. The supporting metric, its window, and its comparison basis stay visible next to it — never
replaced... The depth stays reachable and stays exact... A number nobody acts on is not a shipped
feature."* This is not new scope to propose to the owner — it's an existing standing rule the
codebase doesn't yet meet. Treat CLAUDE.md's wording as the spec; the plan doc below is the
rationale and evidence behind it.

## The two pieces of evidence from the plan still reproduce, unchanged

Checked both cited strings directly against current `main` rather than trusting the plan write-up:

- **Count Cycle**: `src/engine/count-cycle.js:235` still emits `'No complete weekly count on
  record'` — unchanged, still analyst/audit language, not a decision.
- **DI Compare**: `src/views/analytics.js:6895` still emits `'Not Dialed-In is better —
  recalibrate'` — unchanged, still an instruction to a modeller (recalibrate *what*, using *which*
  tool), not an operator action.

Neither has drifted since 2026-08-17. The gap is real and current, not stale.

## The mechanism gap, confirmed by reading the actual permission engine

`src/engine/permissions.js` (full file read) is genuinely access-only: `PERMISSION_GROUPS` is a
flat list of boolean toggles (`reviews.view`, `analytics.district`, `data.upload`, etc.),
`ROLE_PERMISSION_TEMPLATES` maps exactly **three** role templates (`admin`/`supervisor`/`manager`)
to those toggles, and `hasPermission()` returns a bool. **There is no field anywhere in this file
for tone, verbosity, or presentation mode** — the plan's claim that "role gates access but not
presentation" is exactly right, and `src/app/panel-registry.js`'s `perm` field (confirmed earlier,
Workstream E's dispatch) is the same shape: a gate, not a voice.

## The one real precedent that exists today — and how coarse it actually is

**SAGE already does this, partially** (`supabase/functions/sage-chat/index.ts:690-698`) — worth
reading before building anything new, since it's the one working example in the repo:

```
Frame advice for a ${scope.role === 'supervisor' ? 'multi-store supervisor (patch-level coaching
across their stores)' : 'single-store manager (store-level, tactical, shift-actionable)'}.
```

This is a **binary branch**, not a role ladder — `scope.role==='supervisor'` gets one framing
sentence, and *everything else restricted* (manager, GM, office staff, whatever else `profiles.role`
holds) falls into the same "single-store manager" bucket. It's also **prompt-only**: it steers an
LLM's free-text tone, it doesn't touch any deterministic dashboard panel's copy or layout. Good
starting precedent for *how* to phrase a role-conditioned instruction; not evidence that the
harder problem (a panel computing and displaying a decision, not prose) is solved anywhere yet.

## A real scoping fact the plan doesn't mention: the schema only enforces 3 roles, not 8

CLAUDE.md's own RBAC table lists 8 conceptual tiers (Developer → Admin → Owner/OO → VP → DO →
Supervisor → GM → Office Staff). Checked what's actually enforced: **`supabase/schema.sql:13`'s
`profiles.role` column has `check (role in ('admin', 'supervisor', 'manager'))`** — three values,
matching `permissions.js`'s three templates exactly, not the eight-tier ladder. No migration
anywhere in this repo's tracked `supabase/*.sql` adds `'developer'` or any of the other five
values to that constraint (checked directly — zero hits for `developer` in `supabase/`).
`App.js:975` reads `data.role !== 'developer'` as a live comparison, which **cannot be reached from
a DB-constrained profile row today** unless the constraint has been altered directly in production
outside this repo's tracked SQL — I can't verify which from here (no direct DB access to compare
against `schema.sql`), so don't assume either answer. **Practical consequence for this
workstream:** design the voice tiers against the **3 roles actually distinguishable today**
(admin / supervisor / manager), and treat the 8-tier ladder as the eventual target, not the
buildable-now scope — building 8 voice tiers against a 3-value column produces 5 tiers nothing can
ever select. If the fuller ladder is wanted, that's a schema change to flag to the owner first, not
an assumption to build around.

## Morning Brief — the plan's own "best next home" for this — has zero decision-first framing today

The plan's SAGE-as-primary-interface reframe (*"a paragraph that says what to do beats a panel
showing what happened, for someone on a phone mid-shift"*) points at Morning Brief as the most
natural surface. Checked directly: grepped `src/features/morning-brief.js` for
decision/action-shaped language (`so what`, `pull someone`, `recommend`, `action:`) — **zero
matches**. Despite being named "Daily KPI summary" in `CLAUDE.md`'s panel table, it's metric-only
today, same as Count Cycle and DI Compare.

## The closest existing near-miss — start here, it's the cheapest lift

`src/engine/visit-readiness.js:419` already computes **"Top risk drivers across all sub-scores"** —
a ranked list of what's wrong, per store, from a weighted composite. That's most of the way to a
decision already: it has found *which* gap matters, the harder half of "an operator needs a
decision." It's missing only the **last mile** — turning "your weakest driver is Speed" into "your
Speed sub-score is dragging you below PACE-ready; your DT SOS regressed 18s vs last week's readiness
snapshot" or similar. Cheaper to extend an existing ranked-driver computation into a one-line verdict
than to build the "which gap matters" judgment from scratch on a panel that doesn't have it yet
(Morning Brief, Count Cycle).

## Standard to build to (from the plan, now CLAUDE.md's own wording)

> Every surface answers **"so what do I do?" in its first line.** If it can't, it's an analyst
> surface and should be labeled as one.

Test empirically, not by reading the code: **hand the panel to someone at operator level and see
whether they take the right action without being told.** Don't grade this workstream on whether the
copy sounds better — grade it on whether the test passes.

## Tracks

None named in the plan for this workstream specifically.

## What NOT to do

- Don't strip or hide the analytical depth to make room for the decision line — the owner's
  standing instruction is explicit **both/and**, not a simplification trade. The depth (Dialed-In
  MAPE tables, DAR Analysis, Scanner's Pearson/Spearman/FDR output) stays exactly as exact as it is
  today; this workstream adds a layer above it, it doesn't replace it.
- Don't relabel a metric string as a "decision" without actually computing which threshold it
  crossed and what action follows — "Labor's fine" is a decision only if something checked it
  against a target and picked an action; a renamed metric with no logic behind it fails the
  empirical test above immediately.
- Don't design voice tiers for the 8-role ladder CLAUDE.md conceptually describes — the schema only
  enforces 3 (`admin`/`supervisor`/`manager`). Build against what's real; flag the ladder gap to the
  owner if the fuller model is wanted.
- Don't treat SAGE's existing binary supervisor/manager split as "already solved" — it's the right
  pattern at the wrong resolution (2 buckets, prompt-only), not a finished implementation to copy
  verbatim onto a dashboard panel.
