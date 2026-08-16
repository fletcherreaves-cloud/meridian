// scripts/lib/pull-outcome.mjs
// Shared failure-detection for the QSRSoft/LifeLenz pull scripts (#263).
//
// The bug this closes: a pull can log "ERROR" per date or per store inside its own
// try/catch, keep going, and still exit(0) at the end — because nothing tallied the
// failures against the total and decided whether the RUN succeeded, only whether the
// process crashed. That is exactly how the Sulphur/Marietta-style gaps went unnoticed:
// nothing here claims to catch those specifically (#265's completeness ledger is the
// piece that catches an outage the pull itself never saw, e.g. an upstream QSRSoft
// hole with no error at all) — this only makes a pull that DID see failures say so,
// instead of the failures dying inside a console.warn.
//
// Three exit conditions, applied uniformly:
//   1. Auth failure -- unchanged, each script already owns this (its auth ladder is
//      script-specific); this module does not touch it.
//   2. Zero rows saved across a non-empty requested scope -- a pull that "succeeded"
//      but wrote nothing is not a success.
//   3. Failure rate above a threshold -- most units can fail individually (a flaky
//      request, a closed store-day) without the run being broken; ALL or MOST of them
//      failing is a different thing than a few.
//
// FAIL_THRESHOLD_PCT (25%) is a first-cut, not a measured number -- there is no prior
// data on "how often does an individual date/store legitimately fail" because this
// exact tally has never been captured before. Documented here rather than justified,
// per this repo's own standing rule against inventing thresholds: once real runs
// accumulate under this instrumentation, recalibrate against the observed distribution
// the same way the swing alarm's -10% and the count-completeness 0.75 were picked.
const FAIL_THRESHOLD_PCT = 0.25;

export function makeOutcomeTracker(label, { failThresholdPct = FAIL_THRESHOLD_PCT } = {}) {
  const failed = []; // { unit, reason }
  return {
    fail(unit, reason) { failed.push({ unit, reason: String(reason) }); },
    failedUnits: () => failed.map(f => f.unit),
    // requestedUnits: every unit (date/store/period) this run attempted -- the
    // denominator. totalSaved: rows actually written. formatRerun(units): script-specific
    // string a human can paste back in (a date list, a store CSV, whatever that script's
    // own override env var expects) -- printed only when something failed.
    finalize({ requestedUnits, totalSaved, formatRerun }) {
      const n = requestedUnits.length;
      const failRate = n > 0 ? failed.length / n : 0;
      if (failed.length > 0) {
        console.warn(`[${label}] ${failed.length}/${n} unit(s) failed (${Math.round(failRate * 100)}%):`);
        for (const f of failed) console.warn(`  ${f.unit}: ${f.reason}`);
        if (formatRerun) console.warn(`[${label}] re-run just the failed ones: ${formatRerun(failed.map(f => f.unit))}`);
      }
      if (n > 0 && totalSaved === 0) {
        console.error(`[${label}] ✗ zero rows saved across ${n} requested unit(s) -- a quiet no-op, not a success.`);
        return 1;
      }
      if (failRate > failThresholdPct) {
        console.error(`[${label}] ✗ failure rate ${Math.round(failRate * 100)}% exceeds the ${Math.round(failThresholdPct * 100)}% threshold.`);
        return 1;
      }
      return 0;
    },
  };
}
