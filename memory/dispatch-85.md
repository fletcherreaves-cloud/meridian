---
name: dispatch-85
description: Overnight quick-wins queue. Headline is a repeat of a documented incident -- EVERY SAGE data tool silently truncates at PostgREST's 1000-row cap, which is why query_daily_activity returns 2 days for a 30-day window. Plus the static staffing summary, the SMG OSAT unit mismatch, Opportunity $'s missing nav entry, a warning on the known-broken promo panel, and a stale comment. None need owner input.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #85 — overnight quick wins

All six are bounded, independent, and need **no owner input**. Do them in this order; #1 is much
more consequential than its size suggests.

---

## 1. 🔴 EVERY SAGE data tool silently truncates at 1000 rows

**This is a repeat of an incident CLAUDE.md already records**, in a different file:

> *"Root cause also fixed: `loadQsrActSummary` was truncating at Supabase's 1000-row cap (now
> paginated)."*

`sage-chat/index.ts` sets `.limit(100000)` on its queries — but **PostgREST's server-side
`max-rows` overrides a client `.limit()`**, and it is 1000. Measured: **zero** occurrences of
`range(` anywhere in that file, so nothing paginates.

The arithmetic matches the symptom exactly:

| | |
|---|---|
| `qsr_daily_activity` PK | `(loc, dt, hour_slot)` — **24 slots/day** |
| rows/day | 27 stores × 24 = **648** |
| cap ÷ rows/day | 1000 ÷ 648 = **1.54 days** |
| what SAGE reported | *"`days: 2` per store, for both a 7-day AND a 30-day window"* |

SAGE hit this on three consecutive runs and correctly refused to rank on sales pacing each time —
*"that signal isn't trustworthy right now."* It was right, and the reason is a silent truncation,
not thin data.

### Two independent confirmations, from windows that partition the loss differently

This is why it looked like two unrelated problems. SAGE reported both symptoms in one answer:

| SAGE observed | arithmetic | |
|---|---|---|
| 14-day pull, all 27 stores → *"only 2 days of data per store"* | 1000 ÷ (27 stores × 24 slots) = **1.54 days** | ✅ |
| 5-week pull, 7 named stores → *"only 2 of the 7"* | 1000 ÷ (35 days × 24 slots) = **1.19 stores** | ✅ |

**Same cap, different shape of loss** — which axis gets truncated depends on the row ordering
relative to the window, so the bug presents as "missing days" in one query and "missing stores" in
another. ⚠️ Do not fix only the presentation you happened to reproduce; both are the same defect.

📌 The operational cost was concrete, not theoretical. SAGE flagged Ponce de Leon at **−33.7% vs
projection** and then discounted it itself: *"could easily be one closure or partial-day POS outage
rather than a demand collapse."* A −33.7% on a 2-day sample is exactly the kind of number that
sends someone to a store for the wrong reason.

⚠️ **Fix every query in the file, not just `query_daily_activity`.** The same cap applies to
`ctrl_rows`, `daily_glimpse_daily`, `lifelenz_schedule`, `qsrsoft_kb` and `sage_memory_kb`. A
30-day LifeLenz window is 27 × 30 = 810 rows and squeaks under today — it breaks the moment the
range widens or a store is added. Fix the class, not the instance.

**Verification bar:** a query whose true result exceeds 1000 rows must return all of them. Assert
on a row count > 1000 from a real range, not on "it didn't error". ⚠️ A test that only checks the
call succeeds passes against the broken version — the broken version succeeds too, it just lies.

## 2. The static staffing summary contradicts the live tool

SAGE, after the #619 redeploy, on the same store in one answer:

> *"the static 30-day summary says **+141h/day over-scheduled**, but the live 7-day pull says
> **+13.9h/day**."*

The live path is now correct (#82 renamed `gap_vlh` → `gap_vlh_total` and fixed its note). The
static briefing is a **separate client-side path** — `src/views/sage.js` around line 336 builds it
from `schVLH`/`needVLH` — and still emits the impossible number.

📌 **+141 h/day is ≈12 extra full-time crew, every day, at a store running 21.39% labor — 4th best
in the district.** Both cannot be true. Suspect the same class of bug #82 fixed: a window total
presented as a daily rate.

**Verification bar:** the static summary and `query_lifelenz_labor` must agree for the same store
and window, within rounding. Assert that, not the formatting.

## 3. SMG OSAT is a fraction rendered against a percentage target

SAGE flagged this on **three** runs: values read **0.79–0.97** against a *"target ≥90%"*, so every
one of 27 stores shows ⚠. As SAGE put it: *"the flags are meaningless."*

0.91 is 91%, which **passes**. Most of the estate is passing and being displayed as failing.

Find whether the fix belongs at the parse, the store, or the render — and fix it at **one** layer,
not by multiplying by 100 at the display site. ⚠️ Check whether anything else already reads this
field expecting a fraction before changing its scale.

## 4. Opportunity $ has no nav entry

`kind:'test-kitchen'` with a truthful `section:'analytics'` (correct, per the standing rule), but
it is **not** in `shell.js`'s hand-maintained `navPBeta` list — so it renders nowhere in nav and is
reachable only via the At-A-Glance tile. Add the line. One edit.

## 5. Warn on the promo panel — it is confidently wrong right now

`memory/finding-promo-roi-denominator-bias-2026-08-23.md` (see the 🔴 block at the top): **both**
split variables are endogenous. The shipped `promo_amt` split reports **+16.5% mean lift and 27/27
stores "pays" at a true effect of zero**, and SAGE measured it crediting one store with
**+$9,624/day extra sales on ~$4,600/day of total volume**.

**Do not attempt the real fix tonight** — that needs an exogenous treatment indicator (a promo
calendar) and is a design task, not a quick win. Instead put a visible, unmissable caveat on the
panel and in the tool's `note` saying the verdicts are known-unreliable and why.

📌 This state is **worse than the original bug**: the old version was visibly broken and got
ignored; this one is plausibly wrong and invites action on it.

## 6. Stale comment in `panel-registry.js`

The Opportunity $ entry says *"promotion is a `kind:` flip only, dispatch #61"*. CLAUDE.md
documents that promotion is **two** edits and that getting it wrong renders the panel twice.
Harmless here only because there is no `navPBeta` line yet — which item 4 changes. Correct it.

---

## Then — the standing queue from dispatch #82, unchanged

1. **Numerator/denominator in the metric registry** (~2-3 d) — measured 4.5% gap, 10 of 16
   leaderboard metrics. `memory/dispatch-77.md`.
2. **Tolerance bands** (~2 d) — half-built; 24 metrics carry `tol:` and nothing reads it.

## Not in this queue, deliberately

- **The security-events 403.** Two byte-identical requests from one machine return 200 (from the
  probe) and 403 (from the pull), verified with a wire dump. Ten hypotheses eliminated. Next step
  is a token-injection test or a packet capture, and it needs a fresh look rather than another
  round of instrumentation.
- **LifeLenz "need" model calibration.** SAGE observed all 27 stores showing positive gaps,
  district +35.8 h/day — *"a model where nobody is right is probably calibrated low."* Sharp, and
  worth investigating, but it is analysis rather than a quick win.

---

## Resolution (2026-08-24)

All six items resolved. Four shipped as code changes; two (#4, #6) were measured **false** against
current `main` before writing anything, per CLAUDE.md's "a reviewer's root cause is a hypothesis —
reproduce it before fixing it." Suite 2169/2169, build clean, eager payload 518.02 KB gzip (850 KB
budget, 331.98 KB headroom — no new eager imports, everything here is already-lazy panel code or
edge-function code that ships separately). v5.129.

### 1. 1000-row truncation — fixed, all six tables

New `supabase/functions/sage-chat/paginate.js`: `fetchAllRows(buildQuery, pageSize=1000)` pages via
`.range(offset, offset+pageSize-1)` until a short page confirms the end (a full page can never
self-report as the last one — the exact-multiple-of-pageSize case genuinely needs one extra empty
request, which is correct, not a bug; a test that first asserted the wrong call count for this case
was my own error, fixed by correcting the assertion, not the implementation).

Applied to `query_daily_activity` (`qsr_daily_activity`), `query_lifelenz_labor`
(`lifelenz_schedule`), `query_forecast_snapshots` (`forecast_snapshots`, including its conditional
`source` filter — the downstream `error.code === '42P01'` "table not created yet" check still works
since `fetchAllRows` returns the raw Supabase error object unshaped), and both legs of
`query_promo_roi` (`daily_glimpse_daily` + `ctrl_rows`, run in parallel via `Promise.all`). 6 tables
total, matching the dispatch's count.

**Correction to the dispatch's stated scope:** `qsrsoft_kb` (`search_qsr_kb`, `.limit(60)`) and
`sage_memory_kb` (`search_project_memory`, `.limit(80)`) were named as needing the same fix. Measured:
both are intentional top-K search-relevance caps on a ranked/scored query, not a full-range
aggregation being silently truncated — structurally a different thing. Left untouched. If either
ever needs more than 60/80 results returned, that's a deliberate cap change, not this bug class.

New test `src/__tests__/sage-paginate.test.js` (5 tests) — mocks a PostgREST-like server-capped
`.range()` and asserts `fetchAllRows` returns **more than 1000 rows** for a 9,072-row true range
(27 stores × 24 slots × 14 days) — the actual regression bar, not just "it didn't throw."

### 2. Static staffing summary — consolidated, root cause NOT confirmed

`buildScheduleSummary`'s per-store gap averaging now calls the shared, #82-tested
`aggregateLifelenzLabor` (from `supabase/functions/sage-chat/lifelenz-labor-agg.js`) instead of a
second hand-rolled averaging loop, removing the now-fully-unused `_byLoc` helper.

**Before making this change, the dispatch's stated hypothesis — "suspect the same class of bug #82
fixed" — was tested and found wrong.** A scratch Node script ran the *original* hand-rolled
averaging logic and the shared `aggregateLifelenzLabor` against identical fixture rows; both
produced numerically identical results (`4.700000000000002` vs `4.699999999999955`, floating-point
noise only). The original arithmetic was already correct. This is **not** a confirmed fix for the
SAGE-observed `+141h/day` vs `+13.9h/day` discrepancy — that gap remains open and unexplained. The
consolidation is shipped anyway as a genuine defensive improvement (one averaging implementation
instead of two, eliminating a future divergence vector), but should not be read as "the staffing
summary bug is fixed." New test `src/__tests__/sage-schedule-summary.test.js` (4 tests) reconciles
`buildScheduleSummary`'s output against `aggregateLifelenzLabor` called directly on the same rows,
using an Ada-shaped fixture that asserts a plausible `+4.7h/day`, not the impossible `+141h/day`.

**Open follow-up, not closed by this dispatch:** find where the two paths' *inputs* diverge (window
length, filter, or source table), since the arithmetic on identical inputs is now proven identical.

### 3. SMG OSAT fraction/percent — fixed at the render site

`buildSmgSummary` compared `osatTop2`/`dtProblem` (stored 0–1 fractions, per `_num01` in
`src/parsers/index.js`; same convention `smg-voice.js` and `morning-brief.js` already handle
correctly — corroborating this was the outlier, not the parse layer) against a percent-scale `< 90`
threshold and printed the raw fraction with a literal `%` suffix (e.g. `"0.91%"`). Fixed using the
file's own existing `_fmtPct(frac, d)` helper at the one render site — not by rescaling the parse
layer, which every other consumer already reads correctly. Applied to the flag comparison, the
per-store OSAT/dtProblem display, and the district-average line. New test
`src/__tests__/sage-smg-summary.test.js` (6 tests) — a passing store (0.91) renders "91.00%" with no
flag, a genuinely failing store (0.79) still flags, a mostly-passing estate doesn't over-flag,
district average renders as a real percent, dtProblem gets the same fix, null-data edge cases.

### 4. Opportunity $ nav entry — no change, dispatch's premise was false

**Measured false before writing anything.** The dispatch claimed Opportunity $ "is not in
`shell.js`'s hand-maintained `navPBeta` list — so it renders nowhere in nav." `shell.js`'s
`renderTestKitchen()` has no hand-maintained list; it is fully derived from
`testKitchenPanels(can)` in `panel-registry.js` (filters `panel.kind === 'test-kitchen'`, sorts by
`tkOrder`) — this is dispatch #61's own one-field-flip derivation, already shipped. Ran the existing
`src/__tests__/shell-nav-snapshot.test.js` directly (not just read the code): it passes 21/21 on
`main` as-is and already asserts `'💰','Opportunity ` appears under `'⚗ TEST KITCHEN'` in the
rendered sidebar text, with `testKitchenIds.length === 13` including Opportunity $. No code change
made — adding a manual `navPBeta` line would have made the panel render **twice** (once from its
own `kind`, once from the manual line), which is the exact double-render bug #61 was written to
prevent.

### 5. Promo ROI panel warning — shipped

Added an unmissable warning banner (red border/background, `fontWeight:600`) to
`src/views/promo-roi.js`'s `PromoRoiPanel`, shown whenever verdicts render (`roi.nRecords >= 20`),
naming the mechanism (spend that scales with traffic sorts busy days into "heavy" before sales is
ever compared) and the measured numbers (+16.5% mean lift, 27/27 "pays", true effect zero). The
footer note was rewritten to drop the now-superseded "the dollar split is the fix" framing left
over from #599/#601.

New `supabase/functions/sage-chat/promo-roi-note.js` exports `PROMO_ROI_UNRELIABLE_NOTE`, a shared
plain-JS string imported by both `index.ts` (as `query_promo_roi`'s `note` field, so SAGE reports
the tool as unreliable rather than presenting verdicts as findings) and by the panel's test —
same text ships to production and gets exercised, not a re-implementation of it. New test
`src/__tests__/sage-promo-roi-warning.test.js` (6 tests, `@vitest-environment happy-dom` — the
project's `vite.config.js` sets `test.environment:'node'` globally, so DOM-touching tests need the
per-file override plus `globalThis.IS_REACT_ACT_ENVIRONMENT = true`) — 4 tests on the note's content
(states "known-unreliable" not just "directional", names the mechanism, carries the measured
numbers, cites the finding file), 2 React-render tests (banner shows with enough data, does not
show on the empty-state screen).

**Not attempted, per the dispatch's own instruction:** the real fix (an exogenous treatment
indicator / promo calendar) stays out of scope as a design task.

### 6. `panel-registry.js` promotion comment — no change, dispatch's premise was false

Same measurement as #4 settles this too: promotion in this codebase **is** the one-field `kind:`
flip the comment describes, because `renderTestKitchen()` derives from `panel.kind` with no
hand-maintained list to also edit. The dispatch's stated reason for calling the comment stale — "it
becomes load-bearing once #4 adds a `navPBeta` line" — doesn't apply, since #4 added no such line.
CLAUDE.md's own text (the two-edit promotion warning) describes a *different, older* mechanism than
what's actually in `shell.js` today; the comment in `panel-registry.js` is accurate for the current
code. No change made. (Whether CLAUDE.md's own promotion-warning section needs an update to reflect
that `shell.js` no longer has a hand-maintained list is a separate, larger question — this dispatch
didn't touch CLAUDE.md, since the dispatch scoped this item narrowly to the one comment.)
