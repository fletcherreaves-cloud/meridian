---
name: systemic-issues-and-next-phase
description: The four recurring bug classes in Meridian, measured from 977 commits, and the structural fixes for each. Notes 57's registry kills two of them; the other two need their own fix. Also the highest-leverage additions not currently on any roadmap — golden-dataset tests, redundancy-as-reconciliation, data observability, and a semantic layer.
metadata:
  type: project
---

# What Meridian needs next — systemic view

Owner asked (2026-08-06): *"Is there anything else in this project that I am not
considering? Anything we could do that would solve issues we keep encountering?"*

This is grounded in the commit history, not general advice.

---

## 1. The pattern: instances get fixed, classes don't

Across **977 commits**, a large share are the *same handful of problems* recurring at new
call sites. Rough mention counts (they overlap, and include plans as well as fixes, so
treat as signal not precision):

| Theme | commits mentioning |
|---|---|
| loc zero-padding | 42 |
| auto-source / auto-first / manual-only wiring | 36 |
| weighting / averages | 88 / 43 |
| blank / silently / still-0 | 63 / 43 |

The clearest example — **loc zero-padding was fixed four times in a single week**, each
time at a different site:

- v4.809 — padding mismatch dropping 5 auto ops-pull streams from AAG/scope filters
- v4.823 — padding across the whole EOM loader family (onHand, varianceStat×3, waste, transfers, countStatus)
- v4.827 — FOB loc-padding safety fix
- v4.831 — qsr_fob loc-padding audit: real bugs in SAGE + a same-day regression of its own

Every one of those was a correct fix. None of them fixed the *class*. That's the pattern
worth breaking, and it's the honest reason the same kinds of bugs keep surfacing.

**Four classes, and where each stands:**

| # | Class | Structural fix | Status |
|---|---|---|---|
| 1 | Loc identity | canonical Loc type + boundary normalization | ❌ not planned |
| 2 | Metric sourcing | the Notes 57 registry | ✅ planned |
| 3 | Aggregation math | registry-declared rollup + `engine/weighted.js` | ✅ planned |
| 4 | Silent emptiness | loud failure at the boundary | ❌ not planned |

**Notes 57 already kills two of the four.** That's why it's the right priority — but it
only gets half the win unless 1 and 4 get the same treatment.

---

## 2. Class 1 — canonical loc identity

**Root cause:** a store has two representations (7-char zero-padded NSN in `qsr_*` tables,
unpadded almost everywhere else) and no canonical type. Every join, filter, and lookup is
a place where the wrong one can be used, and the failure is silent — rows just don't
match, so a panel renders empty rather than erroring.

**Fix as a class:**
- One `normLoc()` applied at *every* boundary — parse in, query out, no exceptions.
- Store a normalized column in Supabase (the RLS plan already flags this need for
  `can_see_loc`, so the two efforts share the work).
- A test that fails if any `loc` comparison happens against a non-normalized string.

This is a day of work that retires 42 commits' worth of recurring pain, and it's a
prerequisite for RLS Phase 2 anyway.

---

## 3. Class 4 — make silence loud

Today, several distinct failures all render as "blank tile" or "0":

- a query legitimately returning no rows
- a query hitting Supabase's 1000-row cap (the `loadQsrActSummary` truncation bug)
- a pull silently succeeding with 0 rows (v4.802 — `qsrsoft-ops-pull` did this for ~5 days)
- an upstream column header changing, so `findCol` returns −1 and the field becomes 0

These are four different problems with one indistinguishable symptom, which is why they
take days to notice and hours to diagnose.

**Fix as a class:**
- **Parser contracts.** A required column that isn't found should fail loudly, not yield
  0. Header drift at QSRSoft/LifeLenz currently corrupts data silently.
- **Loaders distinguish outcomes.** "No data" ≠ "query errored" ≠ "hit a row cap." Return
  the distinction; let the UI say which.
- **Never render a computed 0 that came from an empty set** — show "no data," which is a
  different and honest statement.

---

## 4. Things not on any roadmap that I'd argue for

### 4.1 Golden-dataset regression tests — highest leverage available

758 tests exist, but nearly all the recurring bugs live in *data sourcing and
aggregation*, which is the least covered area. The tests written this week (weighted
rollups, EOM item weighting) are the first of their kind.

**Proposal:** freeze a small, anonymized, real dataset — a handful of stores over a
month, covering every stream — and snapshot the computed metric values. Then any sourcing
change, parser tweak, or rollup edit that shifts a number fails visibly in CI.

This is the single change most likely to stop regressions like v4.831's "fixed real bugs
in SAGE + own same-day regression." It also makes the Notes 57 registry migration *safe*,
which matters because that migration touches 110 metrics in live panels.

### 4.2 Use redundancy as a reconciliation oracle *before* cutting it

This one runs counter to the Notes 57 instinct, and I think it's the highest-value idea
here.

You're about to reduce redundant extraction. But right now that redundancy is pure cost —
you pay to pull `laborPct` from three sources and get **nothing** for it beyond fallback.

**Wire the overlap up as continuous validation first.** Where the same metric is available
from two or more sources, assert they agree within tolerance. A disagreement is, by
definition, a pipeline bug — and it surfaces automatically instead of via someone noticing
a number looks wrong.

Then cut with much better information, and consider *deliberately keeping one overlap* as
a permanent canary. That reframes redundancy from waste into free QA, and it uses data you
are already paying to pull.

### 4.3 Data observability, not just app telemetry

The Notes 54 statistics DB covers panel usage, crashes, sessions — all worth having. The
higher-value sibling watches **the data itself**:

- per-stream freshness vs its expected frequency (the registry will know this)
- row counts vs expected (27 stores × N days — a pull returning 60% of that is broken)
- null/zero rates per field
- distribution drift

Both v4.802 (five days of silent 0-row pulls) and v4.816 (cash check false-flagging 23 of
27 stores) were caught by a human eyeballing output. Neither had to be.

### 4.4 A semantic layer — one definition per metric

Deeper than sourcing: **the same metric name already means different math in different
places.** `ctrlRows` carries a comment noting Punched vs Actual Labor % was *backwards*
until 2026-08-03. Two panels can each be "right" about labor % and disagree.

The Notes 57 registry should carry the *definition* as a contract — which underlying
fields, which basis, which exclusions — and panels shouldn't be able to invent a variant.
Same discipline as the EOM early-vs-all-class basis question from v4.844: the answer must
live in one place, not be re-decided per screen.

### 4.5 A safety net before users arrive

Everything merges to `main` and goes straight to production. That's been fine for one
expert user who can spot a wrong number. It stops being fine the moment a GM is looking at
it.

- Confirm Vercel PR preview deploys are on and actually used for review.
- Decide what "verified" means before a panel is exposed to non-owners — the owner already
  wrote this rule in Notes 54 ("verified working and always accurate with data while
  clearly depicting as of dates"). It needs a mechanism, not just a rule.

### 4.6 The development environment itself

Small but recurring: no `.env.local` on the Mac (so local sessions can't query Supabase),
the Chrome extension unconnected, sessions archiving with uncommitted memory files. A
short documented bootstrap — env vars, what to install, what to verify — removes a
recurring tax. The memory-file rule added in #81 covers one part of this.

---

## 5. Honest sequencing

If the goal is "unlock the next phase," the order is dictated by what blocks what:

1. **RLS Phases 1–2.** Nothing else matters if no one else can safely log in. Already
   drafted, waiting on a go-ahead. *This is the actual gate.*
2. **Golden-dataset tests.** Makes everything below safe to do, especially the registry
   migration.
3. **Notes 57 registry.** Kills bug classes 2 and 3, and delivers the catalog.
4. **Loc identity + loud failure.** Kills classes 1 and 4. Loc identity is shared work with
   RLS Phase 2.
5. **Data observability.** Now cheap, because the registry knows every stream's SLA.
6. **UI/UX.** Deliberately last — it's the most visible and the least structural, and it
   goes much better on top of a system where numbers are trustworthy and metrics are
   wireable in one line.

---

## 6. The one-sentence version

Meridian's recurring problems aren't bad code — they're **the absence of a single place
where a metric is defined, sourced, aggregated, and validated.** Notes 57 builds exactly
that. Doing it alongside canonical loc identity, loud failure, and golden-dataset tests
converts four permanent tax lines into four solved problems.
