# Dispatch #202 — fold EOM Supervisor into the Inventory Control hub as a district-rollup tab

## Context — owner-approved 2026-08-28; SEQUENCE AFTER DISPATCH #198 LANDS

⚠️ **Do not start this dispatch until dispatch #198 (eom-dashboard.js hand-rolled-backdrop sweep)
has merged to `main`.** Both touch `src/views/eom-dashboard.js`, and this session has twice hit
real merge bugs from independent engineers editing the same shared file concurrently
(duplicate imports, silently-combined edits that only surface when the full test suite runs, not
at the git-merge step). Check `origin/main`'s commit log for dispatch #198's merge before pulling
this dispatch — if it hasn't landed yet, wait rather than branching now and merging a stale base
later.

Owner confirmed this merge live in this session. `eom-summary` (EOM Supervisor,
`src/views/eom-supervisor.js`, 970 lines, district-level rollup, `kind:'nav'`,
`section:'operations'`, `perm:'analytics.district'`) currently sits OUTSIDE the merged
Inventory Control hub (`eom-dashboard.js`, which already hosts Food Cost / End of Month / Count
Cycle per dispatches #188/#189) with no registry comment explaining why it was excluded from that
earlier consolidation. The precedent to follow already exists in this codebase: Schedule
Retention's own "detail hub + cross-store rollup tab" pattern —
`ScheduleRetentionRollupSection`/`aggregateRetentionRollup` in `src/views/schedule-retention.js`
(dispatch #141) — is exactly this shape (a per-store detail view with a separate rollup tab
showing the same data aggregated across stores).

## Task

1. **Read `eom-supervisor.js` in full**, and `eom-dashboard.js`'s current tab/mode structure
   (post-#198, so its chrome should be freshly consolidated when you start). Also read
   `schedule-retention.js`'s rollup pattern as your template.
2. **Fold EOM Supervisor in as a new tab/mode inside the Inventory Control hub** — a
   district-wide rollup view alongside Food Cost / End of Month / Count Cycle, matching
   Schedule Retention's rollup-tab shape rather than inventing a new pattern.
3. **Watch the permission mismatch**: `eom-summary` is currently `perm:'analytics.district'`
   while the Inventory Control hub's other tabs are (confirm the actual perm) likely
   `analytics.store`-scoped. A district-only rollup tab living inside a store-scoped hub needs its
   own internal gate (hide/disable the rollup tab for users without `analytics.district`) rather
   than either silently widening the whole hub's access or silently hiding a tab with no
   explanation — check how `schedule-retention.js`'s rollup section handles this exact situation
   (if it does) and mirror it.
4. **Retire `eom-summary`** to `kind:'internal'` (harvest-then-remove, keep its `id`), redirect its
   deep link(s) into the hub's new rollup tab.
5. **Opportunistic panel-contract check** if it doesn't meaningfully widen scope.

## Verification

- Inventory Control hub's new rollup tab shows the same district-wide content EOM Supervisor
  showed standalone, gated correctly by `analytics.district`.
- A user with only `analytics.store` sees the hub's other tabs normally but not the rollup tab (or
  sees it appropriately disabled/hidden) — state in the PR body exactly how you handled this.
- Old `eom-summary` deep link redirects correctly.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- Redesigning EOM Supervisor's own rollup computation.
- Dispatch #198's own backdrop-cleanup work (should already be merged before you start — don't
  redo it).
