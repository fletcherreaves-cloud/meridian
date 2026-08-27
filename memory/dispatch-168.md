# Dispatch #168 — "As of [date]" labels on tiles (extend to Store Dashboard)

## Scoping note — this is inferred, not a formal FR (unlike #167)

Unlike dispatch #167, there is no live Feature Request record for this one — the live
`feature_requests` table (queried directly, 2026-08-27) has exactly two rows and neither mentions
tile date labels. This item comes from CLAUDE.md's own "Next candidate areas" line: `"As of
[date]" labels on tiles.` — worded generically, not scoped to one panel.

**Measured before drafting this**: `src/views/at-a-glance.js` already ships exactly this — a
per-tile `_spanTag()` helper (v4.837, ~line 952) that shows the real date SPAN each tile is
aggregating (not just the newest date), with a ⚠ fallback note when a tile has silently fallen off
the selected period onto a 30-day default window. It's wired into **8 call sites** across At-A-
Glance's tiles already. Grepped the whole `src/` tree for the same pattern (`_spanTag`, `as of`,
freshness-tag equivalents) — **At-A-Glance is the only panel that has it.**
`src/views/store-dash.js` (Store Dashboard, the other major KPI-tile-heavy panel the owner uses
regularly) has **zero** per-tile date/freshness labeling — confirmed by grep, not assumed.

So: **do not rebuild At-A-Glance's version — it's done.** The open work, on current evidence, is
extending the same pattern to Store Dashboard's tiles. If you find a THIRD tile-bearing panel with
the same gap while working this, note it in the PR rather than silently expanding scope to cover
it — flag it, don't build it here.

## Task

1. **Read `_spanTag()` in `src/views/at-a-glance.js` (~line 961) first.** It's a closure over that
   component's local `today`/`effectiveDateRange`/`dateRange` — it is NOT a standalone exported
   helper, so it can't be imported as-is. Extract the REUSABLE part (the pure date-range-from-rows
   computation + the label/tooltip formatting) into a shared helper — a good home is
   `src/utils/date.js` (check what's already there first; this repo's standing rule is "check
   whether a helper exists before writing one" and this exact kind of date-span computation may
   already exist somewhere under a different name) — so At-A-Glance and Store Dashboard both call
   the SAME function instead of two independently-drifting copies. Refactor At-A-Glance's own call
   sites to use the extracted helper too (don't leave two implementations of the same idea).
2. **Apply it to Store Dashboard's KPI tiles** (`src/views/store-dash.js`) — same visual treatment
   (small italic date-span tag, ⚠ fallback note when a tile's data falls outside the panel's
   selected period), each tile sourced from ITS OWN underlying rows (per At-A-Glance's own
   documented principle: "each tile states its timeframe from its OWN source rows, not the toolbar
   selection, so the label can never claim a period the tile isn't showing" — do not regress this
   by wiring all tiles to one shared date range).
3. **Do not touch** Projections, Analytics, or any other panel — Store Dashboard only, per the
   measured gap above. If Store Dashboard turns out to have some tiles with no natural "rows"
   concept to span (e.g. a single-value config tile), skip those explicitly rather than forcing a
   tag onto something that doesn't have a real date range.

## Verification
- Render-based test against the REAL `StoreDash` component (per this repo's "verification must
  touch the call site" rule) proving at least one tile shows a correct span tag for a fixture with
  a known date range, and the ⚠ fallback note appears when rows fall outside the selected period.
- Confirm At-A-Glance's own existing tests still pass unchanged after the extraction refactor —
  the visual output for At-A-Glance's tiles must be byte-identical before/after (this is a refactor
  there, not a behavior change).
- Standard suite + build bar.

## Out of scope
- Any panel besides At-A-Glance (refactor target) and Store Dashboard (new coverage).
- Changing the fallback-window logic itself (the 30-day fallback, `effectiveDateRange.isFallback`)
  — reuse as-is.
