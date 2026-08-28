# Dispatch #194 — merge Feature Requests into Task Queue (owner-approved 2026-08-10, still open)

## Context

From the same `memory/decisions-panel-inventory-2026-08-10.md` merge list as #188-191: *"Feature
Requests → merge into Task Queue with a type field. Owner asked for this in Notes 26."* Not yet
executed (verified 2026-08-28, both still separate live registry entries: `feature-requests` →
`FeatureRequestsPanel`, `src/views/feature-requests.js`; `task-queue` → `TaskQueuePanel`,
`src/views/task-queue.js`, both statically imported in `App.js`).

**⚠️ Checked for a later contradiction before dispatching this, per the pattern that caught the
Calendar/Events reversal (#188-191).** Dispatch #54 (2026-08-21) named Feature Requests as one of
"three missing right-side modals to BUILD" (About, Metric Lineage, Feature Requests — matching
SAGE's persistent-drawer treatment, not an ordinary `ModalShell` popup). **That build never
happened** — verified 2026-08-28: `showFeatureRequests&&h(FeatureRequestsPanel,...)` in `App.js`
is still an ordinary `showX`-gated modal, no right-side-drawer treatment exists for it. So there is
no conflicting investment to protect here — merging Feature Requests' content into Task Queue now
doesn't waste the #54 work, because that work was never done. If your own read of the current code
finds otherwise (e.g. a right-side modal treatment landed since this was written), stop and flag it
rather than assuming this note is still accurate — this exact kind of staleness bit dispatch #56-57
in this session's own history (Calendar/Events).

## Files (verify via App.js's lazyPanel()/import block before touching anything — same drift
   caveat as every other merge dispatch this batch)

- Target (survives): registry id `task-queue` → `TaskQueuePanel`, `src/views/task-queue.js`.
- Source (retires after harvest): registry id `feature-requests` → `FeatureRequestsPanel`,
  `src/views/feature-requests.js`.
- Neither is currently `route:true` — this dispatch does NOT need to touch routing; that's a
  separate, later URL-migration-batch decision (Task Queue was explicitly named in dispatch #54 as
  one of the panels that should STAY a modal — "a personal work list, read alongside other work" —
  don't convert it here or assume it should become route:true as a side effect of this merge).

## Task

1. **Harvest first** (standing retire rule): read `FeatureRequestsPanel` in full. It's
   Supabase-backed (`feature_requests` table or similar — confirm the actual table name from the
   code, don't assume) and pre-seeded with roadmap history per CLAUDE.md's panel table. Identify
   what's structurally different from `TaskQueuePanel`'s existing shape before designing the merge.
2. **Add a `type` field** distinguishing Feature Request from Task/Bug entries within the merged
   panel — this is the owner's own stated mechanism ("with a type field"), not a redesign
   decision left to you. Check whether `TaskQueuePanel`'s existing schema already has a `type`- or
   `tier`-like column it can extend (CLAUDE.md's own SAGE section mentions "🐞 Log" creating Task
   Queue tickets with a `tier` field — check `saveTask`/`task_queue` table shape) rather than
   inventing a parallel classification field if one already exists.
3. Migrate/import Feature Requests' existing Supabase rows into the merged table's shape if the
   underlying tables differ — do not lose the pre-seeded roadmap history. If the two already share
   one table (unlikely but check), this step may be a no-op; state which case you found.
4. Retire the `feature-requests` registry entry (harvest-then-remove, same as every other dispatch
   this batch); redirect the old `?modal=feature-requests` dispatch id into Task Queue's merged
   view (matching the existing `if(modal==='feature-requests') setShowFeatureRequests(true)` call
   site — repoint it) rather than leaving it silently dead.
5. Opportunistic panel-contract check on Task Queue while you're in it (date-picker mode,
   LocationSelector if applicable, print/export) if it doesn't meaningfully widen scope.

## Verification

- Merged panel renders both original Task Queue content and the harvested Feature Requests
  content/history, filterable or visually distinguished by the new `type` field.
- Confirm no pre-seeded Feature Request data was lost — count rows before/after if a migration
  step was needed.
- Old `feature-requests` modal dispatch id redirects into the merged panel.
- Standard suite + build. Version bump (check `origin/main` current version first).

## Out of scope

- Converting either panel to `route:true` — Task Queue is explicitly a "stays modal" panel per
  dispatch #54's own reasoning; don't second-guess that here.
- Any other panel merge from the 2026-08-10 list (Metric Correlations, Help→Workflow) — separate
  dispatches.
