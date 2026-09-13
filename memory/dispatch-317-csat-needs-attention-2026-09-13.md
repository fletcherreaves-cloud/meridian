# GH #317 — CSAT comment opportunities wired into Needs Attention (2026-09-13)

`rankCommentOpportunities()` (`src/engine/csat-opportunities.js`) was fully built, tested, and
already fed the SMG VOICE panel's own Opportunities tab — real detractor-count ranking, theme
clustering, and honesty guardrails (Wilson-lower-bound confidence-adjusted rate, thin-sample
flagging below `MIN_N`) all already existed. But nothing fed its output into
`src/engine/attention-feed.js`'s cross-domain `buildAttentionFeed()`, so a store's worst
guest-comment trend never showed up alongside FOB/sales/speed issues in the single "what needs
my attention" list — exactly what GH #317 asked for.

## What was already true (checked before building)

- `rankCommentOpportunities(rows, {storeName})` returns `{stores:[{loc, name, total, neg, pos,
  neu, negRate, negRateAdj, avgScore, thin, opportunity, topThemes}], district:{...},
  totalComments}` — `opportunity` is the absolute detractor count (the file's own stated design:
  never let a 1-of-1 store outrank a 30-of-120 one), `negRateAdj` is a Wilson-lower-bound
  confidence-adjusted rate, `thin` flags a sub-`MIN_N` (8) sample.
- `attention-feed.js`'s own header states its design principle explicitly: *"detectors take
  already-computed inputs... so the engine stays pure and testable."* Every other detector in
  the file (fobOutliers, opportunityAlerts, daypartErosionAlerts, etc.) follows this — none
  re-derive their own data from raw rows. The new detector does the same: it takes
  `rankCommentOpportunities()`'s own return shape, not raw `ds.smgRows`.
- `buildAttentionFeed` has exactly one real caller, `attention-now.js`'s `useAttentionFeed`
  hook (confirmed by grep) — no other call site needed updating.

## What changed

- **`src/engine/attention-feed.js`** — new `csatOpportunityAlerts(csat, storeName, {minDetractors
  = 3, critRate = 0.3})`. Filters to stores at/above `minDetractors` (a real opportunity, not a
  1-2-comment blip); `severity: 'crit'` only for a non-thin sample at/above `critRate`, else
  `'warn'`. Both thresholds are a stated judgment call (not a measured cut like the swing
  alarm's -10%) — flagged as such in the code comment rather than presented as derived.
  Wired into `buildAttentionFeed`'s params (`csatOpportunities`) and `bySource`.
- **`src/views/attention-now.js`** — `useAttentionFeed` now computes `rankCommentOpportunities(
  ds?.smgRows || [], {storeName: nm})` inline (same pattern as its sibling `dtRows`/`erosionRows`
  computations) and passes it through as `csatOpportunities`.

## What did NOT change

- `csat-opportunities.js` itself, `smg-voice.js`'s own Opportunities tab, and the theme
  lexicon/Wilson-bound math — all untouched. This dispatch only wires the existing, already-
  validated output into a second consumer.

## Tests

- `src/__tests__/attention-feed.test.js` — 7 new cases: threshold filtering (below-minDetractors
  never flags even at a scary rate — the honesty guardrail), crit requiring BOTH non-thin AND
  high rate, graceful degradation on a null/malformed input, a `buildAttentionFeed` wiring test,
  and a test that runs the REAL `rankCommentOpportunities()` (not just a hand-built fixture) to
  catch any real integration mismatch.
- `src/__tests__/dispatch-317-csat-attention-wiring.test.js` — renders the ACTUAL
  `useAttentionFeed` hook (not just the engine function, per the standing "would this
  verification still pass if reverted" rule, since the wiring itself lives in
  `attention-now.js`) with a real `ds.smgRows` fixture; confirms a store with several negative
  comments surfaces under "Guest Voice," and a store with no SMG data at all is unaffected.

All 9 new/extended assertions confirmed to fail against pre-fix code (`git stash` round-trip on
the 2 changed source files, tests left in place).

Full suite 508/508 files, 4838/4838 tests. Build clean, 542.11 KB / 850 KB eager-payload budget.
