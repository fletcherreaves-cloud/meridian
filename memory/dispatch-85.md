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
