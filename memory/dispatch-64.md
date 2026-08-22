# Dispatch #64 — Visit Readiness sources half its metrics manually while auto streams exist

**Status:** ready to start. Needs nothing from the owner. **Priority: above the rest of the queue.**
**Found:** owner, 2026-08-22, from a Visit Readiness coaching report for Ardmore-Cooper/12th
(#24471) generated that day showing `R2P front counter · QSRSoft · Operations Report (Excel
upload) (manual) · 7 days · as of 2026-07-15` — **a 38-day-old input on a report dated today.**

---

## The report told the truth. The sourcing is the bug.

`SOURCE_META` (`src/engine/visit-readiness.js:39`) correctly labelled the input `manual` and
printed its real as-of date. That provenance line is what surfaced this — **it worked.** Do not
"fix" the label. The defect is one layer up: the metric should never have been reading a manual
stream in the first place.

## What's wrong

`visit-readiness.js` carries its **own** `srcs` chains (`SPEED`/`ACCURACY`/`QUALITY`/
`LEADERSHIP`/`FOODSAFETY`, lines 84-124) instead of calling `src/engine/metric-source.js`. This is
the standing rule verbatim: *"Source data through the shared helpers — never filter raw rows for a
metric or a vs-LY in a panel."* Those local chains have drifted strictly **worse** than the shared
ones — measured 2026-08-22:

| VR key | `visit-readiness.js` | `METRIC_SOURCES` | gap |
|---|---|---|---|
| `r2p` | `[opsRows]` | `[qsrActSummaryRows, opsRows]` | 🔴 **manual-only; auto exists** |
| `park` | `[opsRows]` | `[glimpseRows.parkedPct, opsServiceRows, opsRows]` | 🔴 **manual-only; 2 auto exist** |
| `tpph` | `[laborRows]` | `[qsrActSummaryRows, ctrlRows, laborRows]` | 🔴 **manual-only; auto exists** |
| `oepe` | `[glimpseRows, opsRows]` | `+ qsrActSummaryRows, opsServiceRows` | 2 auto fallbacks missing |
| `kvst` | `[glimpseRows, opsRows]` | `+ opsServiceRows, qsrActSummaryRows` | 2 auto fallbacks missing |
| `labor` | `[glimpseRows, laborRows]` | `laborPct: + ctrlRows` | minor; **note the key rename** |

**The auto R2P source already exists and is already reconciled.** `src/lib/supabase.js:1990`
derives it from the DAR as `(fc_untilserve − fc_untilclosedrawer) / fc_trans_cnt / 1000`, and its
own comment states it is *"Reconciled EXACTLY to the QSRSoft Daily Activity report's R2P column
across every"* store and *"Cloud-fresh (DAR pulls run ~8a/10a/2p CT)"*. Nothing needs building.

## Why this is worse than a stale label

**R2P feeds Speed (35% weight). TPPH feeds Leadership (15%).** So half the composite on that
report was computed from inputs frozen on 2026-07-15. The headline `47 · At risk`, the
`Recommended focus` ranking, and the coaching action are therefore **not describing the store as
it is today** — on a report whose entire purpose is coaching a GM. A confidently wrong coaching
report is worse than an obviously incomplete one.

## Phase 1 — route through the shared helper (the whole point)

Replace the local `srcs` mechanism with `metricDaily`/`metricSeries`/`metricAvg` from
`metric-source.js` for the six keys above. **This is a deletion, not a construction** — the
freshest-wins ordering, the auto-first chains, and future source additions all come free, and
`MANUAL_ONLY_METRICS` stays empty as the standing rule requires.

⚠️ **Key mapping is not identity.** VR's `labor` is the helper's `laborPct`; VR's `park` reads
`park` while the helper's first source is `glimpseRows.parkedPct`. Map explicitly; do not assume
the names line up.

⚠️ **Preserve the provenance display.** `SOURCE_META` drives the report's `Source / freshness`
column, which is what made this findable. The helper must report *which* source actually answered
so that column keeps telling the truth — if `metricDaily` doesn't expose that today, add it rather
than dropping the column to a constant.

## Phase 2 — the four metrics the helper doesn't cover yet

Not in `METRIC_SOURCES` at all, and reading manual streams that have auto equivalents:

- **`tRedA`** ← `ctrlRows` (manual Controls upload). Signals already reads Controls
  loss-prevention from **cloud** streams (`glimpse`/`cash`/`salesLedger`/`qsrActSummary`) as
  `(Cloud)` metric groups — see `src/engine/signal-registry.js`. Wire the same source in.
- **`comp` / `raw` / `statVar`** ← `fobRows` (FOB Excel). **`qsr_fob` is an auto stream** — At A
  Glance already reads FOB from it, dollar-weighted. Same treatment.

Per the standing rule, adding a metric is **one line in `METRIC_SOURCES`**. Do that, then Phase 1
picks them up automatically.

**Genuinely manual, leave alone:** `accB2B` / `problem` / `osat` come from `smgFullscale` (SMG
VOICE PDF/Excel drop) — no API exists, so manual is correct here. Keep the `manual` provenance
label honest. `schedGap` ← `schedRows` is LifeLenz, already auto.

## Verification bar

- **Reproduce first.** Generate the Ardmore-Cooper/12th (#24471) report before the change and
  capture R2P's as-of date and the composite score; regenerate after. The as-of must move to a
  current DAR date and **the score will change** — report both numbers in the PR body. A score
  that does *not* change means the wiring didn't take.
- **Render the real report** in the test, not the engine alone — per the standing revert rule, an
  engine-level test cannot tell "rewired" from "rewired but not called". A revert of either half
  must fail it.
- A store with **no** DAR coverage must still fall back to `opsRows` and still say `manual`.
- `npm run build` clean; entry-chunk before/after in the commit body.
- **Check `node -v` against `ci.yml`'s `[20, 22]` matrix** before trusting a local green (#60).

## Out of scope

Changing weights, targets, bands, or the food-safety flag. This dispatch changes **where the
numbers come from**, nothing about how they are scored.
