---
name: plan-shift-scoreboard-2026-11-07
description: Design conversation for the Shift Scoreboard (SM/AM/DM home screen, task #122) — base metric list, "2nd Side Usage" term resolved, divergence-signal recommendation (owner-endorsed), and the data-freshness/cadence question raised 2026-11-07. NOT built yet — "eventually" per owner. Capture only, so this doesn't die with the session per CLAUDE.md's memory-commit rule.
metadata:
  type: project
---

# Shift Scoreboard — design conversation (2026-11-07, task #122)

Fourth of the "Four Decks" role-based home-screen builds (Game Plan and The Patch already shipped
real, v5.687/v5.688 — see `plan-game-plan-front-door-2026-11-07.md` /
`plan-the-patch-front-door-2026-11-07.md`). Owner: *"For the Shift Scoreboard, eventually, let's
allow customization as to what metrics should be shown... continue your base plan, but allow
additional metrics to be added."* **Explicitly "eventually" — this file is design capture, not a
build-now instruction.**

## Base metric list (owner's own)

OEPE, KVS, **2nd Side Usage**, DT Parked %, R2P, Labor, Sales.

**"2nd Side Usage" resolved (owner clarified 2026-11-07): "Healthy usage of Side 2 or KVS."**
This is the SAME metric already live elsewhere in the app as **"2nd Side Healthy Usage"** —
`src/views/performance-reviews.js`'s `kvsHealthy` metric-source chain (auto-sourced cloud-first:
Daily Glimpse / OpsService / QSR Act Summary, manual Ops upload fallback; target auto-fills from
the yearly-targets workbook's "Healthy Use 2nd Side" row — see `src/app/changelog/5.184.js`,
`memory/project-scoring-revisit.md`'s QSRSoft KB "2nd Side Formula" reference). **Not a new
metric to define — reuse the existing `kvsHealthy` source**, same as every other metric on this
list already has a real source elsewhere in the app (OEPE/KVS/DT-Parked/R2P/Labor/Sales).

## "Wow, I didn't realize that" additions — divergence signals, not more tiles

Owner invited my own judgment on what would make a floor manager go "wow… take action" while
staying concise. My recommendation (**owner's response: "I can agree here!"**): the win isn't
more raw numbers, it's **divergence signals — things that contradict what the primary numbers
suggest**, because a manager scanning sales/labor/OEPE in isolation won't catch a contradiction
between two of them:

1. **Traffic-vs-sales divergence** — guest count holding steady while sales dip (or the reverse)
   is invisible from either number alone; immediately actionable (suggestive-selling miss,
   pricing issue, register problem). Source: `swing-detect.js`'s `classify()` pattern, applied
   intraday instead of day-level.
2. **Staffing gap vs. need** — "2 heads short of what the schedule should have right now,"
   sourced the same way `query_labor_summary`'s Controls-basis Act-vs-Need staffing gap already
   works (SAGE tool, `src/engine/...` — NOT the LifeLenz schedule baseline, which the two
   baselines can disagree sharply on per CLAUDE.md's SAGE tools note).
3. **A binary cash-integrity flag (T-Red spike)** — rare, urgent, belongs as a flag/badge on the
   glance screen, never a number tile.

## Open design question raised by the owner: data freshness / update cadence

Owner, same turn: *"I would posit that maybe it should remain dynamic to account for displaying
the relevant information at the time. This will also bring to question how frequently we update
this data throughout the day and any implications of doing so... It will need to be fresh data
as much as possible, even if we need to explore new ways of attaining said data."*

**My honest technical read, by signal — freshness is not one dial, it splits into two very
different stories depending on the signal's underlying stream:**

- **Signals 1 & 2 (traffic-vs-sales, staffing gap) are DAR-backed** (`qsr_daily_activity`,
  hour-slot structured, pulled by `scripts/qsrsoft-dar-pull.mjs`). This stream **already has a
  proven intraday multi-pull cadence** — the Data-Refresh sprint added ~8a/10a/2p CT pulls on top
  of the 5am CDT daily backfill (CLAUDE.md, Top Priorities). That means today's floor manager
  already goes stale after the 2pm pull until tomorrow's 5am run — a real gap for the
  afternoon/dinner/close shifts specifically. **The concrete, cheap unlock for these two signals
  is bumping that intraday schedule to roughly hourly during operating hours** — same script,
  same two-path auth (direct token → Playwright fallback), just more cron entries in the existing
  GitHub Action. No new integration needed. This is the "free win" half of the owner's question.
- **Signal 3 (cash-integrity / T-Red) is Glimpse/cash-sheet-backed**, and that stream is
  **emailed, not pulled — twice a day (1pm + 4pm CT)** per `qsrsoft-email-parse.mjs`
  (CLAUDE.md's "API over email" standing rule already flags email ingestion as forward-only and
  coarse). A T-Red spike at 6pm would not surface until the next day's 1pm parse — structurally
  the opposite of "urgent and fresh." Two real options, not solved here: (a) find whether
  QSRSoft's reporting API exposes controls/cash data directly (the same kind of discovery that
  turned DAR from manual-only into a true automated pull) — this is a research item, not yet
  attempted; or (b) if no API exists, the signal stays twice-daily and must be **badged with its
  own honest "as of [time]" staleness label** (reusing the already-shipped `_spanTag()` pattern
  from At-A-Glance) rather than presented as live. Pretending it's fresher than it is would
  violate this app's own "every number is real" discipline (Game Plan/Patch's own standard).
- **Implementation trap to flag now, before this is ever built:** `qsr_daily_activity_rollup`
  **zero-fills hours that haven't happened yet rather than omitting them** (CLAUDE.md, dispatch
  #153's finding, which is specifically about an in-progress "today" fooling a rate-metric
  average). Any live "today so far" computation for signals 1/2 must explicitly exclude
  un-elapsed hour-slots, not just check `count(hour_slot)==24` — that check only catches a
  genuinely short/failed pull, not an in-progress shift. This is the exact bug class #153 already
  found once; a Scoreboard signal computed naively would reintroduce it.

**Net recommendation (not yet actioned, for whenever #122 is picked up):** treat the DAR-backed
signals and the email-backed signal as two separate freshness tracks. Bumping DAR intraday pull
frequency is low-risk, low-cost, and should probably happen regardless of when the Scoreboard
itself gets built, since it improves every DAR-fed panel's intraday freshness, not just this one.
The cash-integrity flag's real fix is a data-sourcing question (is there an API) before it's a UI
question — worth a short research pass the next time this is scoped, rather than assumed solvable
by just "pulling more often" on the current email pipeline.

## Status

Not built. Base plan (7 metrics, now with "2nd Side Usage" resolved to the existing `kvsHealthy`
source) + the 3 divergence-signal additions are the full design as of this entry.

## Addendum 2026-11-08 — the freshness track is now closed, both halves

Owner follow-up, same day: *"I would suggest every :15 minutes... Might help with data bloat"*
for signals 1/2, and *"let's see if we can resolve this in any way [for signal 3] — Operations
report?, check other feeds, explore new pulls"*. Both resolved, by measurement, not guesswork:

- **"Data bloat" was never a real risk — both pulls already upsert, not insert.**
  `qsrsoft-dar-pull.mjs` (`.upsert(batch, {onConflict:'loc,dt,hour_slot'})`) and
  `qsrsoft-ops-pull.mjs` (`onConflict:'loc,dt'`) both overwrite existing rows keyed on the
  primary key — a 15-min cadence refreshes the SAME rows more often, it does not add new ones.
  Nothing needed changing there.
- **The cash-integrity signal's "needs a new API" framing in this file's own body (above) was
  WRONG, and the correction matters: `tRedAPct`/`tRedBPct`/`drawerOpens` (`metric-source.js`)
  already resolve from `opsCashRows` FIRST** (`qsr_cash_sheet`, populated by
  `qsrsoft-ops-pull.mjs`'s REAL API-pulled `cash-sheet-extract` endpoint — "Controls: discount,
  T-Reds, meals, drawer, refunds" per that script's own header comment) — **falling back to the
  manual/emailed `ctrlRows` only when the auto source is missing.** The email-only Glimpse/cash
  tables this file originally pointed at are NOT this signal's primary source; they're a
  secondary stream feeding different metrics. So there was no new API to discover — the real
  fix was the exact same cadence bump as signals 1/2, just applied to a second workflow.
- **Shipped 2026-11-08:** both `.github/workflows/qsrsoft-dar-pull.yml` and
  `qsrsoft-ops-pull.yml` now run every 15 min, ~7:00 AM-10:45 PM CDT (`*/15 12-23 * * *` +
  `*/15 0-3 * * *`), narrowed to `days_recent=1` for those intraday runs specifically (the
  once-daily catch-up runs keep their full rolling windows). Measured real per-run cost before
  shipping (GitHub Actions run history, not estimated): DAR ~90-100s/run, Ops ~100-140s/run.
  Net new load ≈ 61 extra DAR runs/day + 63 extra Ops runs/day vs. the prior ~8a/10a/2p CT /
  ~2p CT schedules — roughly **+6,500 GitHub Actions minutes/month combined**, a real recurring
  cost flagged to the owner at ship time (not previously measured against the account's actual
  Actions-minutes plan/quota — worth a one-time check in GitHub billing after this lands, same
  "measure, don't assume a resource cap" lesson as the Vercel deployment-count incident).
- **The dispatch #153 zero-fill trap (noted above) is now MORE relevant, not less** — a 15-min
  cadence means "today so far" data in `qsr_daily_activity`/`qsr_cash_sheet` updates near-live,
  which makes it more tempting (and more wrong, if done naively) for a future live Scoreboard
  signal to read an in-progress hour as if it were a closed one. Still nothing to fix today —
  this is a requirement on whichever consumer eventually computes a live intraday rate off these
  tables, not on the pull cadence itself.

Next concrete step whenever Scoreboard itself is picked up: the data freshness problem is now
solved end-to-end for all 3 signals; what's left is building the Scoreboard UI/engine itself.
