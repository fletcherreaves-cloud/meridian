# Dispatch #189 — merge Count Cycle into Inventory Control (owner-approved 2026-08-10, still open)

## Context

Same source as #188: `memory/decisions-panel-inventory-2026-08-10.md`, owner's approved merge
list: *"Count Cycle → merge into Inventory Control as a tab — a view of the same data, not a
separate job."* Not yet executed (verified 2026-08-28, both still separate live registry entries).
Same caveat as #188 applies — one sibling merge from this same doc (Calendar/Events) was later
reversed by the owner (dispatch #54, 2026-08-21); this specific item has not been contradicted by
anything since (checked `MEMORY.md` and dispatch #54/#54-job-b, which only regrouped nav
*sections*, never merged these two panels).

**⚠️ A genuine naming trap here, worse than #188's — verify before touching anything:**
"Inventory Control" is registry id **`eom-dashboard`**, file `src/views/eom-dashboard.js`,
component `EOMDashboardPanel`. This is **NOT** the same as registry id `inventory` (label
"Inventory", `src/views/inventory.js`) — a completely different, third panel that this dispatch
must NOT touch. Three panels are in play in this cluster (Count Cycle / Inventory Control /
Inventory) and only two of them (Count Cycle, Inventory Control) are this dispatch's concern. The
filename `eom-dashboard.js` also invites confusion with dispatch #188's "End of Month" (`fob-eom`)
work — they are unrelated files despite the similar name; do not let the two dispatches' branches
touch the same file by mistake.

## Files (verified 2026-08-28 via App.js's lazyPanel() block)

- Target (survives): registry id `eom-dashboard` (label "Inventory Control") →
  `EOMDashboardPanel`, `src/views/eom-dashboard.js`.
- Source (retires after harvest): registry id `count-cycle` (label "Count Cycle") →
  `CountCyclePanel`, `src/views/count-cycle-panel.js`.
- Both already `route:true` — no routing-migration work needed.

## Task

1. **Harvest first** (standing retire rule): read `CountCyclePanel` in full, identify anything
   distinct from `EOMDashboardPanel`'s existing content before folding it in.
2. Add Count Cycle as a tab within Inventory Control, matching whatever mode/tab pattern this
   codebase already uses elsewhere for multi-view panels (check existing precedent before
   inventing a new switcher).
3. Retire the `count-cycle` registry entry and route; redirect the old `?panel=count-cycle` deep
   link into the new tab rather than breaking it.
4. Opportunistic panel-contract check on both panels while you're in them (per
   `memory/panel-contract.md`'s standing rule) if it doesn't meaningfully widen this dispatch's
   scope: date-picker mode, `LocationSelector` adoption, print/export presence.
5. Do not touch `inventory` (the separate "Inventory" panel) or anything from dispatch #188 (End
   of Month / Food Cost).

## Verification

- Merged panel renders both original Inventory Control content and the harvested Count Cycle
  capability as a tab.
- Old `?panel=count-cycle` deep link redirects sensibly.
- Full suite + build. Version bump (check `origin/main` current version first — #188 may have
  landed first and moved the number).

## Out of scope

- End of Month → Food Cost merge (dispatch #188).
- Leadership One-Pager → Above-Store One-Pager merge (dispatch #190).
- The separate `inventory` panel.
