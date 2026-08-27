# Dispatch #158 — Leadership One-Pager: custom date-range picker + investigate DO/OM/Owner
# scope tiers for the "patch" dropdown

**Context (2026-08-27):** Owner report, same session as the FOB/week-picker fixes (v5.203):
*"Also need to add another date picker to build a range... May need to add DO to the dropdown
with owners as well and probably OM for future proofing."* Two related but distinct asks —
handle them separately, don't conflate the data problem (item 2) with the UI problem (item 1).

## Item 1 — custom date-range picker (straightforward — the pattern already exists elsewhere)

`src/views/above-store-onepager.js`'s `AboveStoreOnePager` (the Leadership One-Pager) only offers
3 fixed period presets — `mtd`/`lastweek`/`lastmonth` (see its `range` `useMemo`, ~line 94-102).
There is no way to pick an arbitrary start/end range.

**The pattern already exists in this codebase — reuse it, don't invent a new one.**
`src/views/one-pager.js` (the Store One-Pager) already has exactly this: a `rangeMode` state
(`'week'|'mtd'|'ytd'|'custom'`) and, when `rangeMode==='custom'`, two `<input type="date">`
fields bound to a `customRange` state (`{s,e}`) — see its render around line 221-230. Per
`memory/panel-contract.md` section 2 ("Date mode — pick one of three... Presets + custom
(`DateRangeControl`)"), the canonical component for this shape is **`DateRangeControl`** — check
`src/components/` for it and its usage in an already-converted panel (per the panel contract's own
dispatch #30 hand-conversions) before deciding whether to reuse `DateRangeControl` directly here
or mirror `one-pager.js`'s inline pattern. Prefer `DateRangeControl` if it fits this panel's needs
without a fight; don't force it if the panel's period semantics (mtd/lastweek/lastmonth are
period-anchored, not day-count presets — see the contract's own table) don't map cleanly, and say
which you chose and why in the PR body.

**Scope:**
1. Add a `'custom'` period option to `AboveStoreOnePager`'s period selector, alongside the
   existing 3, producing `range = {s, e}` from two date inputs.
2. Every builder this panel already calls (`buildCurrentState`, `buildReviewActuals`,
   `matchedVsLY`, `metricAvg`, `fobByRange`-derived aggregates, `buildScheduleActuals`,
   `buildPerLocationRows`) already takes a plain `{s,e}` range — confirm this by reading their
   signatures (see `src/engine/one-pager-data.js`) — so a custom range should flow through with
   **zero engine changes**, the same way `mtd`/`lastweek`/`lastmonth` already do. If you find a
   spot that doesn't (e.g. something hardcoding a period-label assumption), fix it minimally.
3. `rangeLabel`-equivalent display text for the custom case (something like "Aug 1 – Aug 26,
   2026", not a raw ISO range).

## Item 2 — DO/OM/Owner scope tiers: DATA INVESTIGATION FIRST, do not build UI against an empty
## table

The current "patch" dropdown (`above-store-onepager.js` ~line 452-453) is a single flat
`<select>` populated from `supervisorGroups()` (`src/constants.js`) — `{supervisor: [locs]}`,
ONE tier (direct-line Supervisor only). The owner wants higher tiers added: DO (District
Ops — sits above Supervisor per `CLAUDE.md`'s own RBAC table), Owner, and OM.

**Before writing any UI, establish where this data actually lives — measured, not assumed:**

1. **`staff_assignments` (dispatch #150's reports-to graph) is the obvious place this SHOULD
   live** — `src/engine/assignment-graph.js` already has `resolveScope(person, date, rows)`
   (person → their stores) and `whoOversees(loc, date, rows)` (store → who oversees it), built
   exactly for this kind of role-tier grouping, and `review-engine.js`'s `LADDER_ROLE_TO_REVIEW_ROLE`
   already knows about an `om` role. **But measured 2026-08-27: the live `staff_assignments`
   table has ZERO rows in production** (`content-range: */0` via the standard service-role curl
   recipe — CLAUDE.md's own Top Priorities section already documents #150/#151's SQL as "not yet
   applied to production"). Building a dropdown on top of `resolveScope`/`whoOversees` today would
   show nothing for DO/OM/Owner — confirm this is still true when you start (re-measure, don't
   trust this note), and if so, that's a **blocking prerequisite**, not something to build around.
2. **Check `org_config` and `Organization_Structure.xlsx`-shaped data** (the owner's own upload,
   available via the session's uploaded-files context if you have access to it, or ask) for
   whether DO/OM/Owner assignments already exist in a DIFFERENT, currently-populated shape (the
   `Locations` sheet has `Owner/Operator`/`Organization`/`Supervisor`/`GM` columns per store — no
   obvious DO/OM column was found in a quick pass, but look more carefully; don't take this note's
   quick scan as definitive).
3. **"Owner" may be trivial** — CLAUDE.md's RBAC table lists Owner/OO as "Org-level view", and
   this is currently a single-owner deployment (Fletcher). An "Owner" scope tier may just mean
   "All stores" (already the existing `'all'` scope) with a different label, not a real new
   grouping — check with the owner if genuinely ambiguous rather than inventing a distinct
   Owner-tier data model for a single person.

**Scope, once the data source is confirmed:**
4. If `staff_assignments` genuinely has no DO/OM rows and populating it is out of this dispatch's
   size, **stop and report back** rather than half-building a UI tier with nothing behind it —
   propose what a follow-up (backfill + this dispatch's UI) would need, don't silently skip the
   ask or fake it with placeholder data.
5. If a real, populated data source is found (either `staff_assignments` once seeded, or the
   Locations sheet's existing columns, or something else), extend the scope dropdown with the
   new tier(s), following the SAME UI pattern as the existing Supervisor-patch `<select>` — one
   dropdown per tier, or a single combined hierarchical picker, your call, but keep it as simple
   as the existing one unless there's a clear reason not to.

## Explicitly out of scope

- Any change to `staff_assignments`' schema, or actually running the #150/#151 backfill SQL
  against production (that's the owner's own call per CLAUDE.md's standing note on that migration
  — flag it as a blocker, don't do it yourself in this dispatch).
- The FOB/week-picker fixes (v5.203, already shipped) — unrelated, don't re-touch.
- `one-pager.js`'s own scope/location picker — only `above-store-onepager.js` is in scope here.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip (`above-store-onepager.js` is
  lazy-loaded — confirm it stays that way, report its own lazy-chunk size too).
- PR body must state: (a) whether `DateRangeControl` was reused or a hand-rolled pattern was
  used, and why; (b) the exact measurement taken for `staff_assignments`' row count and what
  credential produced it (per CLAUDE.md's "name the credential and the observation" rule); (c) if
  DO/OM/Owner tiers were NOT built due to the data gap, exactly what's blocking and what a
  follow-up needs — this is an acceptable, expected outcome for item 2, not a failure to report
  around.
