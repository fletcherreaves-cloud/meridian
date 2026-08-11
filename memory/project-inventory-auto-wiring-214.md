---
name: project-inventory-auto-wiring-214
description: "#214 — wired the Inventory Intelligence panel (Service/Production/Overstock/Transfers) to qsr_inventory_summary, auto-first with manual-upload gap-fill. Records the critical finding the issue's own framing missed (the table has no producer yet) and the two traps it flagged."
metadata:
  node_type: memory
  type: project
---

# #214 — Inventory panel auto-first wiring

## The finding the issue's framing missed: `qsr_inventory_summary` has NO producer

The issue said "qsr_inventory_summary already carries nearly everything" — true of the
**schema and the loader/save functions**, false of **live data**. Measured, not assumed:
`grep -rl "saveQsrInventorySummary\|qsr_inventory_summary" scripts/ .github/workflows/`
returns nothing outside the schema SQL files. `saveQsrInventorySummary` (supabase.js) is
defined and never called anywhere in this repo. `qsrsoft-onhand-pull.mjs` writes to a
**different** table (`qsr_onhand` — per-unit on-hand detail, no usage/daysSupply) via its own
`sb.from('qsr_onhand').upsert(...)` call, not through the shared helper.

**Consequence:** the wiring in this commit is correct and load-bearing the moment a producer
exists, but today the panel will show its honest "☁ no cloud data yet" state for every store,
falling back to manual upload gap-fill exactly as it did before this change (just now with a
visible, correct signal instead of silently reading as broken). This is NOT a wiring bug —
it's a separate, real gap: **no automated pull populates `qsr_inventory_summary` yet.**
Building that pull (Playwright + QSRSoft auth, two-path token/session per the standing
automated-pull rule) is real follow-up work, out of scope for "mostly wiring."

## The two traps, as implemented

1. **`cls` vocabulary.** Could not verify live (no Supabase session in this sandbox — and
   moot right now since the table is empty anyway). `mapInvClass()` (views/inventory.js)
   maps two known QSRSoft synonyms (`Non Product`→`Miscellaneous`, `Ops Supply`→
   `Ops Supplies`) explicitly and passes anything else through **unchanged** rather than
   guessing — an unrecognized value still shows under "All Classes" but not under its
   specific filter, and the panel surfaces a visible `⚠ N unrecognized class(es)` badge with
   the actual values in its tooltip so a real mismatch is caught immediately once live data
   flows, instead of being silently absorbed into the wrong bucket.
2. **Silent fallback on a failed read.** Copied the FOB panel's fix pattern exactly (3-state:
   `null`=loading / `[]`+error=failed / `[...]`=has rows), with a **visible** header badge
   (not tooltip-only) distinguishing loading / cloud-ok / cloud-failed / cloud-empty-but-
   succeeded. Manual upload is gap-fill only — merged in only for `(loc,wrin)` pairs the
   cloud stream doesn't cover, never overriding a cloud row.

## One thing NOT verified — flagged, not guessed

`eachFmt` (whether `usagePerDay` from the cloud stream is in cases or eaches) directly
changes the Overstock `excessCases`/`excessValue` math. The manual XLSX parser detects this
from the **filename** ("each"/"_ea" in the QSRSoft export name) — no equivalent signal exists
in `qsr_inventory_summary`'s columns. Defaulted to `eachFmt:false` (cases, matching
`startInv`/`endInv`/`purchases`' apparent unit) with an explicit `⚠️ UNVERIFIED` code comment
at the assignment site (views/inventory.js, `cloudRowsToPanelShape`) — flip it if a live pull
shows otherwise. Do not remove that comment without confirming against real data first.

## What changed, structurally

- **`src/parsers/inventory-parse.js` (new)** — `INV_MASTER` (298-item WRIN→area/pack-size
  table), `classifyInvArea`, `parseInvUOM`, `parseInventoryData` moved out of
  `views/inventory.js`. `pipeline.js` now imports `parseInventoryData` from here, not from
  `views/inventory.js` — this was required, not optional, for the lazy-load fix below: with
  `pipeline.js` still statically importing from `views/inventory.js`, a `lazyPanel()` wrapper
  in App.js would have been defeated (`INEFFECTIVE_DYNAMIC_IMPORT`) exactly like
  `one-pager.js`/`above-store-onepager.js` were before #207.
- **`App.js`** — `InventoryIntelligence` converted to `lazyPanel()`. Measured: entry chunk
  gzip **818.69 KB → 808.30 KB** (10.39 KB reclaimed), headroom 31.31 KB → 41.70 KB. Verified
  the `INEFFECTIVE_DYNAMIC_IMPORT` warning for `inventory.js` is gone from the build output
  (the only remaining one, `supabase.js`, is a separate, expected, unrelated case).
- **Unhidden**: `panel-registry.js`'s `kind:'optional'` → `kind:'nav'`, and the
  `OPTIONAL_PANELS` entry (constants.js) removed — per the issue's own "then unhide it" once
  auto-fed. Genuinely no longer needs a manual upload to show something useful (an honest
  status badge either way), even though the cloud side is empty until a producer ships.
- **`src/__tests__/inventory-cloud-wiring.test.js` (new)** — 12 tests covering
  `mapInvClass` (exact match / known synonym / unrecognized pass-through / empty), latest-
  period-wins merging, the `usage1000` derivation (including the zero-transactions-data
  case), and loc padding normalization. One real bug found and fixed by this suite before
  shipping: `avgDailyTxnsByLocMonth` crashed on a `null` array element (missing `r &&` guard)
  — not a hypothetical, an actual `TypeError` the test reproduced.

## Related

- #207 — bundle budget; this is #207's "batch 2" first item, folded into #214 per the
  owner's explicit "two-for-one, measure it" instruction.
- `memory/feedback-performance-budget.md` — the `INEFFECTIVE_DYNAMIC_IMPORT` failure mode
  this same split fixes, now documented twice with two real instances.
- `memory/data-sourcing-standard.md` — auto-first, freshest-wins, manual-as-gap-fill-only,
  the standing rule this wiring follows.
