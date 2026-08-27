# Dispatch #164 — Confirm what `compType:'calendar'` means on `labor-summary` (#330), the one
# open 4am-business-day boundary question

**Context (2026-08-27):** CLAUDE.md's 4am business-day section states this is the ONE remaining
open boundary question, everything else already measured: *"The DAR is ALREADY business-day
aligned... What `compType:'calendar'` means on `labor-summary` is still unconfirmed — that is the
only live boundary question (#330), and it is on the numerator side only."* This dispatch answers
it — a bounded, measurable question, not a design decision.

## What already exists (read the code, don't re-derive)

- **`businessDate()`/`lastClosedBusinessDay()`** (`src/utils/date.js:101,117` per CLAUDE.md — cite
  by symbol name, not the line numbers, per this project's own standing rule on stale citations)
  — the canonical 4am ABC cutover helpers. Never re-derive this inline.
- **`memory/dar-vs-ops-reconciliation.md`** (2026-08-07) — already measured that DAR's `hour_slot`
  (`05:00 → 28:00`) is business-day aligned, ~0.01% reconciliation error on complete days. Read
  this file in full for the measurement methodology to reuse here.
- **`compType:'trading'` vs `compType:'calendar'`** — both pull scripts (LifeLenz and/or QSRSoft,
  check which one(s) actually expose this parameter — grep `compType` across `scripts/`) already
  use both values for different purposes. `'trading'` is confirmed ≈ the 4am business day.
  `'calendar'` on `labor-summary` specifically is the unconfirmed one — find every place
  `labor-summary`'s `compType:'calendar'` output is actually CONSUMED in the app (which metric,
  which field) before trying to characterize what it means abstractly.

## Scope

1. Find the exact API/report `labor-summary` with `compType:'calendar'` refers to — which pull
   script, which endpoint, which response field(s) actually get ingested into which Supabase
   table/column.
2. Measure it directly the way `dar-vs-ops-reconciliation.md` did for the DAR: pull a real day's
   `compType:'calendar'` labor-summary response, compare its date/hour boundaries against a known
   business-day-aligned source (DAR) and against a plain midnight-to-midnight calendar day, for
   the SAME store/date. Determine which one it actually matches.
3. Document the finding precisely: does `compType:'calendar'` mean "midnight-to-midnight
   calendar day" (as the name suggests) or something else? Which fields/metrics in the app
   currently consume this value, and do any of them silently assume the WRONG boundary as a
   result (the "numerator side only" caveat in CLAUDE.md's own note — check whether a
   denominator elsewhere in the same ratio is on a different boundary, creating the exact
   "silently mixes two different days" bug class CLAUDE.md warns about for 4am-boundary work).
4. If a real boundary mismatch is found in an active metric, fix it (small, targeted — matching
   this project's established "found a real bug while investigating, fix it if it's contained"
   pattern). If nothing is currently affected (calendar-vs-trading distinction exists but nothing
   consuming it is actually broken), say so clearly and update CLAUDE.md's own note to mark #330
   resolved, with the measurement recorded — don't leave it as a permanently-open question once
   it's been answered.

## Explicitly out of scope

- Any change to `businessDate()`/`lastClosedBusinessDay()` themselves — this dispatch is about a
  SPECIFIC label (`compType:'calendar'`) on a specific report, not the shared cutover helpers.
- Re-deriving or re-measuring the DAR's own 4am alignment — already confirmed, cite
  `dar-vs-ops-reconciliation.md`, don't redo it.

## Verification bar

- If a fix is made: new/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"`
  suite passing at the same or higher count as `main`. `npm run build` clean if code changed.
- PR body (or, if no code change was needed, a `memory/` finding note committed alongside a
  CLAUDE.md update marking #330 resolved) must state the exact measurement: what
  `compType:'calendar'` actually returns, compared against what, and the conclusion.
