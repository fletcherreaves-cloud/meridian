# Dispatch #159 — Performance Review "Auto-fill from Uploaded Data" stops at June despite
# confirmed live July/August data — find the real cutoff, don't guess

**Context (2026-08-27):** Owner report with a screenshot: opened a GM review (Stacey Hyatt,
store 5985, Full Year 2026), clicked "Auto-fill from Uploaded Data" on the KPI Results tab.
OEPE, Voice OSAT, R2P, KVS Time, and 2nd Side Healthy Usage all populated Jan–Jun with real
numbers; Jul–Dec all show the blank "Act"/"Tgt" placeholder — including August, the current,
partially-elapsed month. Owner wants July (fully complete) and August (in-progress, as far as
it's elapsed) to populate too.

**This session already ruled out one hypothesis — don't re-derive it, start past it:**
`qsr_daily_activity` (the auto-pulled DAR table) genuinely has July/August rows for this exact
store — measured directly via the standard service-role curl recipe:
`loc=eq.0005985&dt=gte.2026-07-01&dt=lt.2026-09-01` → `content-range: 0-0/1368`. So this is NOT
a "the data doesn't exist yet" gap — CLAUDE.md's own standing rule ("A missing-data gap is never
a finding, it is a work item... back pull the data needed") doesn't even apply here; the data is
already pulled. Something in the resolution chain between that table and the KPI table's Act
cells is not reaching July/August for this metric set, and this dispatch is that root-cause.

## What already exists (read the code, don't re-derive)

- **`autoPopulateKPIs(review, ds)`** (`src/engine/review-engine.js`, ~line 1457) — the function
  `doAutoFill()` in `performance-reviews.js` calls directly on click (`~line 901-907`, no network
  fetch of its own — it's a pure transform over the ALREADY-LOADED `ds`). Iterates
  `Object.entries(review.kpis.months)` — confirmed by dispatch #152 to be all 12 keys on any
  #152-era review (`blankReview`'s `for (let m=1;m<=12;m++)`), so the loop itself isn't the
  reason months 7-12 are skipped.
- **OEPE/R2P/KVS/Labor%** are resolved via `metricRate`/`metricAvg` (`src/engine/metric-source.js`)
  with `range = monthRange(m)` (the FULL calendar month, not clipped to "so far" — confirmed by
  this file's own comment at ~line 1580). `metricRate`/`metricAvg` are auto-first: for `oepe`,
  the source order is `[['glimpseRows','oepe'], ['qsrActSummaryRows','oepe'],
  ['opsServiceRows','oepe'], ['opsRows','oepe']]` (`metric-source.js` `METRIC_SOURCES.oepe`); for
  `r2p`, `[['qsrActSummaryRows','r2p'], ['opsRows','r2p']]`. **`ds.qsrActSummaryRows` and
  `ds.glimpseRows` — NOT `qsr_daily_activity` directly** — are what these actually read from
  client-side; they're populated by `loadQsrActSummary(daysBack=35)` and `loadGlimpse(daysBack=45)`
  respectively (`src/lib/supabase.js`), both of which default to a ROLLING window from "now", not
  the full year. Neither of those covers January–June (the months that DID populate) — so
  whatever populated Jan–Jun for OEPE/R2P almost certainly came from the LAST fallback in each
  chain (`opsRows`/`opsServiceRows` — the owner's own manual Ops Report uploads, which this
  session's uploaded reference files confirm go at least through August 26).
- **FOB** (`mo.foodOB`) reads `ds.fobRows` directly (`fobM = byMonth(ds.fobRows)`, ~line 1483,
  1604-1607) — the MANUAL upload array, not the auto `qsr_fob`/`fobByRange` path `one-pager-data.js`
  uses. This is a SEPARATE, already-known-shape issue (manual-only sourcing) from the OEPE/R2P
  puzzle above — don't conflate the two in your root-cause writeup, name them separately.

## The actual investigation this dispatch needs — this session could not resolve it without a
## live browser, and guessed no further per CLAUDE.md's "measure it, don't reason about it" rule

The open question: for August 2026 (well within `qsrActSummaryRows`' 35-day rolling window from
"now"), why did OEPE/R2P/Labor% NOT populate at all — not even partially? A few concrete,
falsifiable hypotheses to check, IN ORDER, stopping as soon as one is confirmed:

1. **Does `ds.qsrActSummaryRows` actually cover August in THIS session's live app state?**
   Use Playwright (per `memory/feedback-verification-in-sandbox.md`'s working recipe) to load the
   real app, open dev tools / inject a console read of `ds.qsrActSummaryRows`'s date range after
   a normal login, and confirm whether it's actually populated for Aug 2026 or came back empty/
   stale. This is the single most direct way to settle the question — do this FIRST.
2. **If `qsrActSummaryRows` DOES cover August**, then `metricRate`/`metricAvg` themselves (or
   `monthRange(8)`'s date construction, or a loc-padding mismatch between `review.loc` and
   whatever `qsrActSummaryRows` rows carry) must be the culprit — trace `metricAvg`/`metricRate`'s
   actual per-day resolution loop against a manually-constructed August row to find where it drops
   out.
3. **If `qsrActSummaryRows` does NOT cover August** despite the 45-day Glimpse / 35-day DAR
   windows nominally reaching back far enough, check whether these loaders are even being CALLED
   for a browser session that's been open since before August, or whether there's a caching/
   staleness issue separate from the loader's own `daysBack` parameter (e.g. `ds` populated once
   at login and never refreshed intra-session) — this would be a different, real bug (stale
   client cache), not a `daysBack` sizing problem.
4. Whatever the actual mechanism, name it precisely in the PR body with the measurement that
   proved it — this dispatch's deliverable is as much the ROOT CAUSE WRITEUP as the fix.

## Fix, once root-caused

- If it's a stale/never-refreshed `ds` — the fix is almost certainly NOT in `autoPopulateKPIs`
  itself, but in whatever load/refresh path feeds `ds.qsrActSummaryRows`/`ds.glimpseRows`.
- If it's a genuine gap in the auto-first chain reaching a full calendar month vs. a rolling
  window — consider whether `metricAvg`/`metricRate` need a wider-window variant for this specific
  monthly-KPI use case, or whether `autoPopulateKPIs` should pull from a differently-scoped query
  for months outside the rolling window. Don't invent a new mechanism without checking whether
  `metric-source.js` already has (or should reuse) something for "give me this whole month even
  if it's outside the usual rolling window."
- **FOB** (`mo.foodOB`, manual-only) is a real, separate, smaller finding — flag it as a follow-up
  candidate in the PR body (same shape as the `MANUAL_ONLY_METRICS` standing rule in CLAUDE.md:
  "manual sourcing is always temporary") but only fix it here if it's a small, clean win once
  you're already in this code; don't let it block the main OEPE/R2P/Labor% finding.

## Explicitly out of scope

- Voice OSAT (SMG FullScale) — genuinely manual-upload-sourced by design (CLAUDE.md: "SMG VOICE
  (CSAT) | 📤 Manual"), a real data-availability gap if the owner hasn't uploaded July/August's
  FullScale sheet yet, not a code bug. Confirm this distinction in the PR body rather than lumping
  it in with the OEPE/R2P finding.
- Any change to the Leadership/Store One-Pager (dispatch #158, separate work).
- The Performance Review UI itself (already rebuilt by dispatch #157/v5.202) — this dispatch is
  data-sourcing only.

## Verification bar

- A reproducing test BEFORE the fix (confirm it fails), matching the "measure it" discipline —
  ideally exercising the real `autoPopulateKPIs` call with a `ds` shaped to match whatever the
  root cause turns out to be (a `qsrActSummaryRows` fixture with August rows, or whatever the
  actual mechanism requires), not a synthetic case that can't fail against the real bug.
- Full `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as
  `main`. `npm run build` clean, report before/after entry-chunk gzip.
- PR body must state the exact root cause, the measurement that proved it (which tool, which
  data, what it showed), and — if item 2's fix turns out to be larger than this dispatch's scope
  — a clear statement of what's fixed here vs. what remains open.
