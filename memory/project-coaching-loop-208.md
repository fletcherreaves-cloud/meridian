# Coaching feedback loop v1 (#208)

**Shipped:** v4.990, 2026-08-11. Fifth leg of Push 3's coaching spine — #201 identifies →
#209 makes the numbers trustworthy → #210 diagnoses labor → **this verifies**. Design:
`memory/project-coaching-feedback-loop.md`.

## Why this one matters most

Meridian tells the owner what is wrong. It never told him whether what he did about it
worked:

```
identify  →  assign  →  intervene  →  measure  →  VERIFY
   ✅          ⚠️           ✅          ✅        MISSING (until this)
```

Per the owner: it's also the only genuine differentiator on the table. QSRSoft's CoachQ turns
out to be an AI chat assistant with scheduled prompts (SAGE already matches it) — nobody in
this space has measure-and-verify coaching.

## Five rules, each enforced structurally

From the design doc — not conventions to remember, but things the code makes true:

1. **Baseline auto-captured, never typed.** `engine/coaching-loop.js`'s
   `snapshotMetricValue()` is the ONLY function that produces a baseline or result value.
   `startCoachingCycle()` and `recordCoachingResult()` both call it internally; neither accepts
   a caller-supplied number for either field.
2. **The follow-up comes to him.** A due cycle (`dueForReview()`) becomes a standard
   attention-feed item (`toAttentionItem()`, tagged `kind:'coaching-review'`) inside the
   EXISTING Needs Attention feed — `attention-feed.js` gained one passthrough function
   (`coachingReviewFeedItems`) and `buildAttentionFeed` one new input (`coachingItems`), not a
   new panel.
3. **Starts from an existing finding.** `startCoachingCycle(ds, {loc, metricKey, note})` takes
   store and metric as given; nothing in this file chooses them. The UI entry point (Patch
   Heatmap's FOB/Labor dimension rows) already has both.
4. **Verdict is measured, never self-reported.** `computeVerdict(baseline, result, metricKey)`
   reads `NOISE_THRESHOLDS[metricKey]` — there is no field anywhere for a typed grade.
5. **Single-user first.** No ack machinery, no GM logins, no store notifications anywhere in
   this feature.

## The v1 fallback: NOISE_THRESHOLDS ships empty

The issue's own explicit instruction: *"If this measurement isn't ready, ship the loop
recording cycles WITHOUT verdicts rather than with wrong ones."* No live Supabase session in
this sandbox to run `scripts/measure-coaching-noise-threshold.mjs` (written in an earlier
segment of this session, prep for exactly this). `NOISE_THRESHOLDS` in
`engine/coaching-loop.js` is `{}` — `computeVerdict()` always returns `null` today. Every
cycle recorded in v1 is a real before/after measurement with an honest "not enough data to
verdict yet" label, not a confident wrong one.

**UPDATE (#237, 2026-08-12) — this is no longer "waiting on a run," it's a measured negative
result.** Both the raw-drift script and the district-differencing follow-on it gated
(`scripts/measure-district-relative-noise.mjs`) have now run against live data — full numbers
in `memory/project-noise-measurement-237.md`. The owner's target improvement (0.25–0.50pp)
sits inside ordinary 30-day drift for both labor (median 0.841pp) and FOB total (p75 0.416pp).
District-wide differencing, tested as the fix, mostly doesn't help: FOB-family reduction factors
are ~0.98x–1.07x (no real noise removed — FOB drift is store-idiosyncratic, not a shared district
signal), and labor's apparent 2.30x reduction is almost entirely a tail effect sitting in the same
region #236 already flagged as contaminated (labor's real reduction, at the percentiles that
aren't known-broken, is closer to 1.13x). `NOISE_THRESHOLDS` stays `{}` — not because the
measurement hasn't run, but because it ran and district-differencing isn't the fix. The next
candidate per #237's own contingency is longer measurement windows or confidence-based (not
binary) verdicts, not a threshold picked to paper over a ~1.0x reduction.

## A real correctness fix found while building this

`engine/coaching-loop.js`'s FOB baselines/results are **dollar-weighted**
(Σamt/Σsales over the trailing window) from `ds.qsrFobRows`, matching `computeFOBMetrics`'
(`analytics.js`) own established convention for FOB% — CLAUDE.md's standing rule ("never
average averages, dollar-weight aggregates") applies directly: a daily FOB% is itself a
ratio, and a simple mean of 30 such ratios is not the same number as Σamt/Σsales for the
month.

**The already-shipped `scripts/measure-coaching-noise-threshold.mjs` (an earlier segment)
was doing the simple-mean version.** Fixed in the same commit as this feature —
`rollingMovements()` now accepts an optional `weightKey` and computes a weighted trailing
average when one is supplied (FOB components pass `'weight'` = `prod_sales_amt`; `labor_pct`
passes none, staying a simple mean). This matters beyond style: the eventual measured
threshold has to apply to the SAME quantity the verdict actually computes, or the whole
exercise of measuring a threshold is invalid — a mismatched definition would either be too
loose (missing real changes) or too tight (false verdicts) in a way nobody could predict
without re-deriving it.

`labor_pct` deliberately does NOT get the same weighting — it stays `metricAvg(ds, loc,
range, 'laborPct')`, a simple mean of daily values, because that is what every other Labor
Tools panel already shows for a period's labor%. A coaching baseline should read the same
number the owner sees everywhere else in the app, not a more mathematically "correct" but
different one nobody else displays.

## Data model

`coaching_cycles` (Supabase, `supabase/schema-coaching-cycles.sql` — **owner needs to run
this against the live project**): `loc`, `metric`, `baseline`, `coached_at`, `note`,
`review_at` (auto = `coached_at` + 30 days), `result`, `verdict`. Tenant + per-loc RLS,
mirroring `schema-inv-count-sessions.sql`'s pattern. Small, slow-growing table — loads
eagerly at startup (`App.js`'s `_stCoachingCycles`, alongside the other small per-user
streams) rather than through `metric-source.js`'s lazy-fill mechanism, which exists
specifically for LARGE manual-fallback streams (`auditRows`, `wasteRows`).

`saveCoachingCycle`/`updateCoachingCycleResult`/`loadCoachingCycles` (`src/lib/supabase.js`)
mirror the `saveEomCountException`/`loadEomCountExceptions` CRUD shape already established in
this file.

## Engine (`src/engine/coaching-loop.js`)

- `COACHING_METRICS` — the 5 allowed metrics: `labor_pct`, `fob_total_pct`,
  `condiment_pct`, `raw_waste_pct`, `comp_waste_pct`. The SAME 5
  `measure-coaching-noise-threshold.mjs` measures, so a real threshold slots in with zero
  shape mismatch.
- `snapshotMetricValue(ds, loc, metricKey, asOf)` — trailing `SNAPSHOT_WINDOW_DAYS` (14)
  ending at `lastClosedBusinessDay(asOf)` (never literal "today" — signature #4), returns
  `null` (not a fabricated 0) when there's no real data.
- `startCoachingCycle` / `dueForReview` / `computeVerdict` / `recordCoachingResult` /
  `toAttentionItem` — see the five rules above.

## UI

- **Patch Heatmap** (`src/views/patch-heatmap.js`) — a "🎯 Coach" button on the FOB and Labor
  dimension rows only (`COACH_METRIC_BY_DIM = {FOB:'fob_total_pct', Labor:'labor_pct'}` —
  Sales/Speed/Controls have no coaching metric and get no button, matching the issue's scope
  discipline). Opens `CoachingModal` in `mode:'start'`.
- **Needs Attention** (`AttentionPanel`, `src/views/analytics.js`) — a coaching-review item's
  action button is "🎯 Log Verdict →", never the generic "✓ Ack" (acknowledging it would hide
  the follow-up without ever measuring whether the coaching worked — exactly the failure this
  whole feature exists to prevent). Opens `CoachingModal` in `mode:'review'`.
- **`src/views/coaching-modal.js`** (new, `ModalShell`-based) — one component, two modes.
  `start`: shows the live auto-captured baseline, a note textarea (the only typed field), and
  a "Start Coaching" button. `review`: shows baseline → a LIVE preview of what the result/
  verdict will be if saved right now (computed via the same `recordCoachingResult` the save
  itself calls, so the number shown is never a guess), and a "Record Follow-up" button.
- **`App.js`'s `refreshCoachingCycles`** — re-fetches `coaching_cycles` after either modal
  saves, so a just-recorded verdict clears its Needs Attention item immediately rather than
  waiting for the next full page reload. Threaded down the same way `onOpenStore` already is
  (`App.js` → `AtAGlance`/`AttentionPanel` → `PatchHeatmap`).

## Bundle cost — not chased, said plainly

`coaching-modal.js` and `coaching-loop.js` land in the entry chunk. `AttentionPanel` (which
needs the review modal) lives in `analytics.js`, which is still fully static in `App.js` —
the same open "could analytics.js split its landing tiles from its deeper panels" question
#207 flagged and explicitly deferred, not resolved by this feature. Measured: entry chunk
gzip 813.82 KB → 815.30 KB (+1.48 KB, almost entirely this changelog text — the feature's own
code plus this changelog entry's first draft measured 813.73 KB, i.e. net-negative before the
changelog text itself was accounted for, another rolldown re-chunking side effect like
v4.985's). Still 34.70 KB under the 850 KB budget.

## Verification

16 new tests (`src/__tests__/coaching-loop.test.js`): dollar-weighting proven against a
fixture deliberately shaped so a naive mean-of-ratios would diverge from the correct answer;
the in-progress-day exclusion; auto-capture (no code path for a typed baseline); due-for-review
filtering; the null-verdict v1 fallback asserted against the actual empty `NOISE_THRESHOLDS`
object (not just claimed in a comment); and future-state verdict classification once a
threshold is registered (a temporary threshold set and restored within the test, proving the
classification logic itself is correct ahead of having a real number).

Full suite (1300 tests) + build both pass clean.

**Not verified against live data or in a browser** — no authenticated Supabase session in this
sandbox. The owner needs to: (1) run `supabase/schema-coaching-cycles.sql`, (2) eventually run
`scripts/measure-coaching-noise-threshold.mjs` (now dollar-weight-corrected) to populate real
`NOISE_THRESHOLDS`, and (3) exercise the actual "Coach this" → wait → "Log Verdict" flow
against real data to confirm the UI behaves as designed.

## What v1 does NOT do (per the design doc's own "v1 does not have to do all three")

No escalation/re-diagnosis for a coached-and-not-improved item, no "this worked at N stores"
recommendation surfacing, no rate/hours/sales-style decomposition. The design doc is explicit
these are what makes the loop "more than tracking" but that v1 only has to make them
*possible* — the cycle log + measured verdict this ships is the foundation they'd build on.
