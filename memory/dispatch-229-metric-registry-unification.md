# Dispatch #229 — CLOSED (2026-09-12): direct-swap slice shipped

Follow-on to the original dispatch (kept above in this file, superseded by this note). Tasks 2
and (effectively) 3 both landed in one PR — see below for why Task 3 turned out to already be
partially done, which the original doc's own claim got wrong.

## What shipped

`src/engine/signal-registry.js`'s `extractMetricValues()` now routes 32 confirmed
field-identical metrics through `metric-source.js`'s existing auto-first `METRIC_SOURCES`
chains instead of a single static `ds[source]` read — `AUTO_FIRST_KEY_MAP` in that file lists
the exact set, each verified field-for-field against its `METRIC_SOURCES` definition (not by
name match alone) before being added: `oepe`, `kvst`, `r2p`, `parkPct`, `dtMixPct`, `sales`,
`gc`, `laborPct`, `tpph`, `avgRate`, `otHrs`, `discPct`, `discAmt`, `promoPct`, `promoAmt`,
`cashOSPct`, `cashOSAmt`, `drawerOpens`, `posOverCnt`, `posOverAmt`, `cashRefCnt`, `cashRefAmt`,
`cashlessRefCnt`, `cashlessRefAmt`, `tRedAPct`, `tRedACnt`, `tRedBPct`, `tRedBCnt`, `fobPct`,
`compWaste`, `rawWaste`, `statVar`.

**This closed Task 3 as a side effect, not a separate build.** The original dispatch's own claim
— *"the entire FOB family has no cloud sibling anywhere in the registry at all"* — was WRONG at
the time it was measured, or went stale before this PR: `metric-source.js` already had
`qsrFobRows`-backed chains for `compWaste`/`rawWaste`/`statVar`/`fobPct` (and their underlying
`$` legs) since dispatch #64, well before #229 was written. So "wire qsrFobRows into the FOB
family" (Task 3 as originally scoped) was already done elsewhere in the codebase; the actual gap
was narrower — `signal-registry.js` specifically wasn't calling into that existing machinery.
Once the direct-swap mechanism (Task 2) exists, routing the FOB keys through it is just four
more entries in the same map, not new source wiring. **Lesson repeated from this repo's own
standing rule:** a dispatch doc's claim about what's missing is a hypothesis, not a fact — it
was checked against the real code before writing anything, per "measure it, don't reason about
it," and found stale in exactly the way CLAUDE.md warns dispatch docs can go.

## Deliberately excluded: `avgCheck`

Looked like a 33rd direct swap by name and by METRIC_SOURCES key existing — but its chain
special-cases derive-BEFORE-srcs (dispatch #182: `sales ÷ gc` is tried ahead of any manual
value, unlike every other chain in this map, which only derives as a last resort when nothing
else answers). This is a real, demonstrated behavior difference, not a theoretical one:
`csat-signals.test.js`'s "drops zero-variance drivers" fixture sets a constant manual `avgCheck`
alongside a varying `gc`, specifically to test that a truly-constant driver produces no
correlation — under this swap, the fixture's `avgCheck` stopped being constant (the derived
`sales/gc` varies with `gc` even though the raw manual value doesn't), breaking that test. That
may well be the MORE correct live number, but it's a bigger, different change than "add an
auto-first fallback with manual still winning when present" — excluded from this dispatch,
named as a follow-on rather than shipped as a silent side effect.

## Still explicitly out of scope (per the original dispatch, unchanged)

- `manualRefAmt`, `discCnt`, `promoCnt` — confirmed no matching `METRIC_SOURCES` chain exists.
- The FOB sub-item %'s with no chain: `baseFoodPct`, `condiment`, `empMeal`, `unexplained`,
  `discCoupon`, `pLFoodPct`, `pLPaperPct`. `metric-source.js` has the `$`-amount legs for some of
  these (`condimentsAmt`/`empMgrMealsAmt`/`unexplainedAmt` via `qsrFobRows`) but no derived `%`
  chain composing them the way `compWaste`/`rawWaste`/`statVar` were built — a real, scoped
  follow-on, not attempted here.
- `avgCheck` (see above).
- No new UI (metric-picker pairing, staleness badges) — same as the original scope note.

## Verification

- **The motivating bug, closed and tested**: a store with a stale manual `opsRows` entry (30
  days old) plus fresh `qsrActSummaryRows` rows for the last 3 days now returns the fresh
  auto-sourced points for `oepe` through `extractMetricValues` — the exact call both Trend
  Explorer and the Scanner make. Test confirmed to FAIL against pre-fix code (returned 0 recent
  points instead of 3).
- District-wide (`scopeLoc` omitted) pulls now union `ds.storeIds` with every loc actually
  present in the metric's real source arrays, so a store with only auto-sourced data (never in
  `laborRows`, so never in `storeIds`) isn't silently dropped from a Scanner sweep.
- Monthly sum-vs-mean aggregation (`meta.aggregate === 'sum'`) verified unchanged through the new
  path (`otHrs`, a `sum` metric).
- A metric NOT in the map (`baseFoodPct`) verified to still read its static source exactly as
  before — the swap is selective, not a blanket behavior change.
- `metric-source-order.test.js`'s auto-first/manual-last ordering guard is inherited for free —
  these keys now call directly into the SAME `METRIC_SOURCES` chains that test already covers,
  rather than re-implementing ordering logic in `signal-registry.js`. No new ordering test
  needed; confirmed by reading `metricSeriesWithSource`'s own srcs-then-derive loop, which this
  dispatch's code calls unchanged.
- Full suite 506/506 files, 4806/4806 tests. Build clean. Eager-payload budget: 541.49 KB → 541.85
  KB gzipped (+0.36 KB — `signal-registry.js` now imports `metric-source.js`; both are already
  eagerly bundled in Signals-adjacent panels, so the delta is small).
- 9 pre-existing test files touching `signal-registry.js`/Trend Explorer/Scanner/CSAT re-run and
  confirmed green (only the `avgCheck`-adjacent fixture needed the deliberate exclusion above —
  no other regression).
