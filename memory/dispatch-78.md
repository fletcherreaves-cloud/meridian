---
name: dispatch-78
description: Backfill RGR visit history for 2024 and 2025 from Propel. The rows were captured and analysed on 2026-08-22 but NEVER committed, so only counts and derived stats survive - this needs a fresh capture, not an import. Owner-approved, waiting on him being at the Mac.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #78 — backfill RGR 2024 + 2025 (needs a fresh capture, not an import)

**Status:** owner-approved 2026-08-23, **blocked on the owner being at the Mac** (*"yes, but it
will later when I am on Mac"*). Propel needs his authenticated browser session.
**Reads:** `memory/finding-ecosure-propel-api-2026-08-22.md`, `memory/dispatch-74.md` (the CFV
import this mirrors).

---

## 🔴 Read this first: the data is NOT sitting in a file

`memory/finding-ecosure-propel-api-2026-08-22.md:1146` records RGR as **2024 (27), 2025 (27),
2026 (15) — "analysed, all reconciled to their rollups"**, and the ρ=0.342 pairing across 25
stores could only have been computed with both years in hand. **The capture happened.**

**But `memory/data/` contains exactly one file: `cfv-history-2023-2026.json`.** The RGR rows were
never committed. Only the counts and the derived statistics survive.

📌 This is the standing "commit every memory file in the same commit as the work that cites it"
rule failing in its purest form: **the analysis survived and the data didn't.** Worth remembering
before the next capture session ends.

**So this dispatch is a re-capture.** Do not go looking for a file to import.

## What to capture

Propel, `getScoredVisitListResults`, `category=visitResult`, operator-level node, one call per
year. `year=` is a plain query parameter (`finding-ecosure-propel-api-2026-08-22.md:246-249`), so
2024 and 2025 are a parameter change, not a research project.

⚠️ **One stale line in that same file to ignore:** `:256` says *"Untested — nobody has run
year=2025 yet."* That was written before the capture and is superseded by `:1146` and by the
2024→2025 pairing analysis. It is a within-file contradiction, not a live blocker.

## Requirements

1. **Commit the rows.** `memory/data/rgr-history-2024-2026.json`, same shape and spirit as
   `cfv-history-2023-2026.json`. **This is the whole point of the dispatch** — a capture that
   isn't committed has already been done once and lost.
2. **Reconcile before trusting.** The counts must land on 27 / 27 for 2024 / 2025, matching what
   the finding recorded. A different number means the query differs from the one that produced the
   analysis, and that needs explaining before import.
3. **RGR visits carry no channel.** That is load-bearing: v5.117 fixed the Channel-over-time
   denominator precisely so importing these would not dilute every year's channel shares. Do not
   invent a channel for them.
4. **Only CFV / RGR / EcoSure are load-bearing for scoring** (owner, 2026-08-23). McDonald's
   records other visit types; do not import them.
5. Expect **2026 RGR to keep growing** — the year isn't over and more are scheduled. Not a
   discrepancy.

## What this unblocks

Visit Patterns' per-year blocks currently hold RGR for 2026 only, which is an **import gap, not a
fact about the programme** (RGR runs every year, owner-stated). Once 2024/2025 land, the day-of-
week, daypart and channel views cover the full graded-visit history rather than a CFV-plus-one-year
slice.

## Verification bar

The committed file is the artifact. A test or a recorded reconciliation showing per-year counts
matching the finding — not a screenshot, and not "the panel looks fuller."
