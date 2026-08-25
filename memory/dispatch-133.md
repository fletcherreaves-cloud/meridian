# Dispatch #133 — Labor Analysis: absurd Labor % on the in-progress current week

**Owner's ask (2026-08-25), screenshot attached:** *"Labor analysis > any chance we can work out
the calculations to account for an in-progress week."* Screenshot shows `Labor & Scheduling →
Labor Analysis`, scope "This Week (8d)", week of 2026-08-19, `LIVE`. Nearly every store shows a
Labor % of 200–1900% (Durant 397.86%, Duncan-Hwy 81 1911.73%, Elgin 1225.21%) with Sched Labor $
several times larger than Sales Fcst — clearly not real numbers. A handful of stores (Bonifay,
OKC-I240/Sooner, Harrah, Sulphur) show normal-looking 18–22% figures, each flagged with a ▲ icon.

## Read this first — a related fix already exists, and this is NOT that bug reappearing untouched

`src/engine/labor-analysis.js`'s `deriveBand1FromSchedule()` (~line 145-220) already has a
documented fix from 2026-08-05 (owner report, same symptom class) for exactly this shape of bug:
originally, `laborPctActual` divided by `salesForPct` (sales on days that already had a
`labor_pct` value) instead of the full week's `salesFcst` — on a partial week, `salesForPct` was
a small fraction of the real week, so multiplying that inflated % back across the FULL week's
sales overstated Labor %/Sched Labor $ well past 100%. The fix (still in place, confirmed by
reading the current code) divides by `salesFcst` (the full week) instead, which the code's own
comment states makes coverage gaps UNDER-state cost, "the safe direction" — i.e. today's bug
symptom (wildly OVER-stated %, not understated) is the **opposite** of what that fix should
produce. Two possibilities, and you need to determine which before touching anything:

1. This view (`src/views/labor-analysis.js`, confirmed via its `laborPctActual`/`laborTargetOrg`/
   `laborPctCoverage` field names to be reading `deriveBand1FromSchedule`'s output directly) is
   NOT actually hitting that code path today — some other aggregation or a stale cached value is
   in play. Verify this first, don't assume the code you read is the code that ran.
2. It IS the same code path, and there's a **new, day-level** version of the same root issue the
   2026-08-05 fix didn't anticipate: `deriveBand1FromSchedule`'s per-day loop does
   `a.laborDol += lp * fs` where `lp` is that day's raw `r.laborPct` (from LifeLenz's own daily
   schedule report, pulled as-is by `scripts/lifelenz-pull.mjs`'s `labor_pct` column, no semantic
   documentation of how LifeLenz itself computes it) and `fs` is that day's FULL-DAY forecast
   sales. **If LifeLenz computes `labor_pct` for TODAY — the currently in-progress day — as an
   intraday ratio (hours-cost accrued so far ÷ sales accrued so far), that ratio is only valid
   against SALES-SO-FAR, not the full day's forecast.** Multiplying a partial-day ratio by a
   full-day forecast would inflate that one day's `laborDol`, and since this is a *weekly*
   aggregate, one bad in-progress day is enough to blow up the whole week's Labor %/Sched Labor $ —
   this is the exact same "two atoms on different boundaries" mistake CLAUDE.md's own standing
   rule warns about, just one level more granular (within-day, not within-week) than the bug the
   2026-08-05 fix already caught.

## Do not guess — measure first

Per CLAUDE.md's "measure it, don't reason about it" rule (doubly so here — the last three times
this exact rule was skipped on a labor-basis bug in this repo, it produced a wrong fix or a wrong
diagnosis): before writing any fix,

1. Pull real `lifelenz_schedule` rows for one of the badly-affected stores (e.g. Duncan-Hwy 81,
   `#29760`, showing 1911.73%) across this in-progress week, and look at each day's raw
   `labor_pct`/`fcst_sales` values directly. Identify which specific day(s) are driving the
   inflated `laborDol` sum — is it TODAY specifically (the in-progress day), a future day that
   shouldn't have a value yet but does, or something else entirely?
2. Compare that against a store that's rendering correctly (the ▲-flagged ones — Bonifay, OKC-
   I240/Sooner, Harrah, Sulphur) for the SAME week — what's different about their day-by-day data
   that keeps them sane? (The ▲ icon itself — check what it means in this view; it may already be
   flagging exactly the distinction that matters here.)
3. Only once you can state, with the actual row values as evidence, which day(s) and which field
   produce the inflated number, decide the fix. A plausible direction if the hypothesis above
   holds: exclude (or don't fully weight) the in-progress day's `labor_pct` from the week's
   `laborDol` sum the same way a not-yet-happened future day is already excluded — but confirm
   this is really what's happening before implementing it, and state in the PR exactly what you
   found, not what seemed likely.

## Scope

`src/engine/labor-analysis.js` (`deriveBand1FromSchedule` and anywhere else that sums per-day
`labor_pct` into a week total) and `src/views/labor-analysis.js` only if the bug turns out to be
in how the view consumes/labels the engine's output rather than the aggregation itself. Do not
touch `computeLaborRow`, `laborTargetOrg`/target-side calculations, or any other panel that reads
`lifelenz_schedule` unless you find the identical bug there too — if so, flag it, don't fix it here.

## Verification bar

- State plainly, with actual row-level numbers (not a description), which day and field produced
  the inflated Labor % for at least one real affected store — this dispatch is explicitly
  uncertain about the exact mechanism, resolve that uncertainty with evidence before fixing.
- After the fix, the previously-absurd stores' Labor %/Sched Labor $ should land in a normal range
  comparable to the currently-correct (▲-flagged) stores for the same week, and the fix must not
  regress the 2026-08-05 case (a genuinely partial week — early days missing entirely — should
  still under-state, not over-state, per that fix's own "safe direction" reasoning).
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean.

## Do NOT

- Do not touch the 2026-08-05 fix's core precedent (dividing by full-week `salesFcst`, not
  partial-coverage `salesForPct`) without first confirming, with evidence, that it's actually
  wrong — it was itself a hard-won fix for a real, reported bug.
- Do not guess a fix from reading the code alone — pull real rows for a real affected store first.
