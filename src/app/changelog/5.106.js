// @ts-nocheck
export default {version:'5.106', date:'2026-08-22', changes:[
  'Dispatch #64 -- Visit Readiness was sourcing half its metrics from its OWN local '
  + '`srcs` chains instead of the shared auto-first resolver (src/engine/metric-source.js), and '
  + 'those local chains had drifted strictly worse: r2p, park and tpph were manual-only while auto '
  + 'sources already existed for all three; oepe and kvst were each missing two auto fallbacks. '
  + "Found via a real coaching report for Ardmore-Cooper/12th (#24471) dated 2026-08-22 that scored "
  + "the store off an R2P value 38 days stale (2026-07-15) -- and because R2P feeds Speed (35% "
  + "weight) and TPPH feeds Leadership (15%), roughly half that day's composite was computed from "
  + "frozen inputs on a report whose entire purpose is coaching a GM with today's numbers.\n\n"
  + 'Phase 1 (deletion, not construction): oepe/kvst/park/r2p/tpph and labor (-> laborPct, a key '
  + 'rename, not identity) now resolve through metric-source.js\'s METRIC_SOURCES chains instead of '
  + "local srcs arrays -- freshest-wins ordering, existing auto fallbacks and future source "
  + "additions all come free. Added metric-source.js's metricSeriesWithSource() (metricSeries() is "
  + 'now a thin wrapper over it) so the per-day WINNING source is recoverable, not just the value -- '
  + 'needed because SOURCE_META\'s provenance column is what made the original bug findable and had '
  + 'to keep reporting which source actually answered. Phase 2: tRedA now maps to the existing '
  + "tRedAPct chain (opsCashRows before ctrlRows, no new chain needed -- it already existed and was "
  + "auto-first-correct); comp/raw/statVar gained new METRIC_SOURCES entries deriving a % from the "
  + "auto-pulled qsr_fob $$ amounts (compWasteAmt/rawWasteAmt/statVarianceAmt over prodSalesAmt, "
  + "mirroring analytics.js's cloudFobRows) as a fallback behind the manual FOB Excel's own %. "
  + "qsr_fob's loc is stored zero-padded by deliberate loader contract (4 other consumers rely on "
  + "it); metric-source.js's per-source indexer now normalizes ONLY that one source at the index "
  + "boundary rather than changing the loader or any caller. accB2B/problem/osat (SMG FullScale, no "
  + "API exists) and schedGap (already reads schedRows, an auto LifeLenz stream, directly and "
  + "correctly) are left on the local resolver by design -- not every spec migrated, and the ones "
  + "that didn't are commented as deliberate, not overlooked.\n\n"
  + 'Self-caught during implementation, before any code shipped: monthly-cadence metrics (SMG/FOB) '
  + "had NO window cutoff in the old local resolver at all (scanned full history for the latest "
  + "value on record) -- reusing the 45-day daily window would have silently broken that semantic "
  + "for anything uploaded more than 45 days ago, so monthly lookups get a ~3-year lookback instead. "
  + "Caught the same way via live-data verification, after code shipped in this session but before "
  + "commit: a blanket 'exclude v===0 from the daily mean' carried over from the old local resolver "
  + "(which never mattered under a single-source chain) silently discarded EVERY day of park once "
  + "the auto chain's real 0% park-rate answer got there first -- the exact #150/#178 "
  + "zero-discarding bug class metric-source.js's mode:'any' already exists to prevent. Removed; "
  + "mode:'pos' chains can never contain a 0 by construction (filtered upstream), so the exclusion "
  + "was a no-op for those and actively wrong for mode:'any' ones.\n\n"
  + "Verification bar was the score itself, live, service-role key, both engines run "
  + '(git-checked-out pre-dispatch visit-readiness.js vs. the new one) against the SAME real '
  + 'Ardmore-Cooper/12th data: R2P moved from {111.7s, source opsRows, as-of 2026-07-15} to '
  + '{128.5s, source qsrActSummaryRows, as-of 2026-08-22} -- current DAR data, not a 38-day-old '
  + 'upload -- and the composite readiness score moved from 48.6 to 53.2. A revert-sensitive test '
  + 'suite (5 new tests) proves the wiring, not just the intent: auto-only fixtures the old local '
  + 'chains could never have read resolve correctly with the right key remaps (labor->laborPct, '
  + 'tRedA->tRedAPct, comp->compWaste, raw->rawWaste) and the right field trap (park -> '
  + "glimpseRows.parkedPct); a no-DAR-coverage store still falls back to opsRows and still reports "
  + "'manual'; the not-measured reason for a migrated metric names the LIVE metric-source.js chain, "
  + "not the deleted local one; and the HTML/CSV report (not just the engine) surfaces a migrated "
  + 'driver\'s real auto source. All 5 fail against the pre-fix code and pass against the shipped '
  + 'code, confirmed by stashing the fix and re-running. Out of scope, untouched: weights, targets, '
  + 'bands, the food-safety flag. 2021/2021 tests (31 in visit-readiness.test.js, 5 new). Build '
  + 'clean, entry chunk 511.84 -> 512.03 KB gzip (visit-readiness.js itself is lazy-loaded, not in '
  + 'the entry chunk).',
]};
