# Dispatch #117 — MBI vs LifeLenz Accuracy: guard against implausible LifeLenz actuals

**Owner's ask, verbatim (2026-08-25, mobile screenshot of the Accuracy tab):** *"Need to solve
for missing LifeLenz data in accuracy."* Screenshot showed the week of Aug 5–11: Wed Aug 5 LFZ
var **+3665.94%**, Thu/Fri Aug 6–7 LFZ var **"—"** (blank), and the week's `LFZ avg |var|` summary
reading **734.38%** — an obviously-broken aggregate next to a normal-looking `MBI avg |var| 1.34%`
for the same week.

## Root cause — measured directly against production Supabase, not guessed

`lifelenz_schedule` is the source for the LFZ side of `MBI vs LifeLenz Accuracy`
(`runAccuracy` in `src/features/lifelenz.js`, `lfzByDate[dk]={forecast:r.fcstSales,
actual:r.sales}` sourced from `ds.schedRows`). Queried the table directly (`sales`, `fcst_sales`,
`loc`, `date`) for 2026-07-20 → 2026-08-24, 27 stores/day:

| Date range | `sales`/`fcst_sales` ratio (all 27 stores) |
|---|---|
| 2026-07-20 → 2026-08-04 | 0.96–1.03 (normal) |
| **2026-08-05** | **0.039 avg** (every store's `sales` ≈ 4% of forecast — a partial-day capture) |
| **2026-08-06, 2026-08-07** | **`sales` is `NULL` for all 27 stores** |
| 2026-08-08 → 2026-08-24 | 0.88–1.03 (normal) |

Cross-referenced against the `LifeLenz Daily Sync` workflow's own run history
(`mcp__github__actions_list`, `lifelenz-pull.yml`): runs on **Aug 7, 8, 9, 10 all show
`conclusion:"failure"`** — a real 4-day pull outage (consistent with CLAUDE.md's documented
LifeLenz-token-expires-monthly pattern). A **manual `workflow_dispatch` run on Aug 11 at 11:40 UTC
succeeded** (someone — almost certainly the owner — refreshed the token and re-ran by hand,
matching the documented runbook). But `LIFELENZ_SAFETY_DAYS` defaults to **3**, so that recovery
run only re-pulled Aug 8 forward — it never reached back to Aug 5 (the in-flight day the outage
started mid-pull, hence the ~4% partial capture) or Aug 6–7 (fully missed). Those three dates have
sat wrong in `lifelenz_schedule` for 20 days with nothing to correct them, because the daily
sync's own 3-day safety window moved past them within days of the outage ending.

**✅ Already fixed as a DATA backfill, outside this dispatch — do not redo.** Triggered
`lifelenz-pull.yml` via `workflow_dispatch` with `start_date=2026-08-05` on 2026-08-25 to
re-pull and correct Aug 5–7 (and idempotently re-confirm everything after). Verify it landed
before assuming the *specific* Aug 5–7 numbers are still wrong — but the CODE gap below is real
regardless of whether this one incident is now backfilled, because the underlying failure mode
(a multi-day outage whose recovery run's fixed safety window doesn't reach back far enough) is
not novel — CLAUDE.md already documents an earlier 6-day LifeLenz outage that went unnoticed for
lack of alerting. It will recur.

## Scope — the code-side defensive fix

`MBI vs LifeLenz Accuracy` (`runAccuracy`/`groupAccByWeek` in `src/features/lifelenz.js`) treats
whatever is in `lfz.actual` as ground truth for variance math with only an `actual>0` guard
(`lfzVarPct=(lfz&&lfz.actual>0)?(lfz.forecast-lfz.actual)/lfz.actual*100:null`). A `null`/zero
actual already degrades gracefully to "—". A **small nonzero partial-day actual does not** — it
produces a nonsensical variance (this incident: +3665.94%) that then poisons
`groupAccByWeek`'s `avgLfzAbsVar` (a plain average of `Math.abs(lfzVarPct)` across the week, no
outlier handling), making the whole week's LFZ accuracy stat unusable and — as happened here —
reads to the owner as "something is broken," which it was, just not in the UI.

Add a plausibility guard on the LifeLenz side only (MBI's `mbi.actual` comes from a different,
independently-sourced pipeline — `forecast_snapshots` — leave that leg alone unless you find it
has the same failure mode, in which case say so rather than silently expanding scope):

- Pick a defensible floor for "this LifeLenz actual looks like an incomplete pull, not a real
  closed day" — e.g. `actual` under some fraction of `forecast` (McDonald's daily sales don't
  swing to ~4% of forecast in reality; pick and justify a specific ratio, don't guess one without
  reasoning about it against real store-day variability) — and treat a day that fails the check
  the same way a `null`/zero actual is already treated: excluded from `lfzVarPct` (render as
  something like "⚠ Incomplete" rather than a wild %) and excluded from `avgLfzAbsVar`.
- Do **not** suppress a genuinely bad LifeLenz forecast (a real day where LifeLenz was just
  wrong) — only catch actuals implausible enough to be a pull artifact, not a bad prediction.
- Keep this local to the LFZ leg of `runAccuracy`/`groupAccByWeek` — do not touch `mbiVarPct`/
  `avgMbiAbsVar`, `runLifeLenzBridgeScan`, or anything outside `MBI vs LifeLenz Accuracy`.

## Verification bar

- A unit/render test that reproduces this exact incident's shape (a week containing one
  null-actual day and one small-partial-actual day alongside normal days) and asserts the
  guarded day(s) render as excluded/flagged, not as a wild percentage, and that `avgLfzAbsVar`
  for that week is computed only from the plausible days.
- Confirm a normal week (no incomplete days) renders byte-identical to before — this is an
  additive guard, not a rework of the accuracy math.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean.

## Do NOT

- Do not touch `lifelenz-pull.mjs`'s `SAFETY_DAYS`/gap-detection logic, or attempt to make the
  pull "smarter" about re-pull windows — that's a real possible follow-up but a different, riskier
  change to a production data pipeline; out of scope here. If you think it's clearly warranted,
  say so in the PR description rather than doing it.
- Do not touch `sync-failure-watch.yml` or alerting — this dispatch is UI-defensiveness only.
- Do not re-run the Aug 5–7 backfill — already done (see above); verify, don't repeat.
