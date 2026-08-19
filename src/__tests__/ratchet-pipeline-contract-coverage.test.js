// @ts-nocheck
// R8 (dispatch32, 2026-08-19) — pull/write scripts should adopt scripts/_pipeline-contract.mjs.
//
// Dispatch #25/#32 (Workstream C) named the pipeline contract's three pieces: assert-on-zero
// (already ~40% adopted via scripts/lib/pull-outcome.mjs — see _pipeline-contract.mjs's own
// header for the correction to dispatch #25/#32's stale "2 of ~19" measurement), unconditional
// per-partition coverage logging, and a freshness SLA checker (both 0% adopted before this
// dispatch — nothing in the repo did either). This ratchets the count of named pull/write
// scripts that do NOT yet import _pipeline-contract.mjs, so the remaining rollout (dispatch
// #25's own "convert opportunistically, never as a sweep" guidance) is tracked without having
// to re-derive the list by hand next time — same shape as R1/R3/R4/R7.
//
// SCOPE: the fixed list below is dispatch #25's own canonical 20-script enumeration (measured
// directly against `scripts/`, re-confirmed still accurate by dispatch #32 the same day this
// ratchet was written), not an auto-discovered glob. A genuinely new pull script must be added
// here explicitly — which is no extra burden, since CLAUDE.md's own "Adding a new automated
// pull" standing rule (step 1) already requires adding it to sync-failure-watch.yml's list in
// the same PR; this is the second place, not a new habit.
//
// BOTH DIRECTIONS matter (ratchet-raw-metric-rows.test.js's own precedent):
//   - count > CEILING → FAIL, naming the new file (a script was added without being tracked
//     here — or dropped its import)
//   - count < CEILING → FAIL, saying "lower the ceiling to N" (a script adopted the contract
//     since the ceiling was last set, and the ratchet must not silently stop protecting that
//     progress)
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'scripts';
// Dispatch #25's own canonical enumeration (memory/dispatch-25.md), unchanged by dispatch #32's
// re-verification the same day. 20 scripts: the 18 it named as lacking an assert-on-zero guard,
// plus the two (qsrsoft-pmix-pull.mjs, qsrsoft-ops-pull.mjs) it confirmed already have one.
const NAMED_SCRIPTS = [
  'qsrsoft-dar-pull.mjs', 'qsrsoft-ebos-pull.mjs', 'qsrsoft-digital-app-pull.mjs',
  'qsrsoft-employee-roster-pull.mjs', 'qsrsoft-forms-pull.mjs', 'qsrsoft-inventory-history-pull.mjs',
  'qsrsoft-kb-pull.mjs', 'qsrsoft-mcdelivery-pull.mjs', 'qsrsoft-onhand-pull.mjs',
  'qsrsoft-roster-stats-pull.mjs', 'qsrsoft-shift-manager-pull.mjs', 'qsrsoft-turnover-pull.mjs',
  'qsrsoft-variance-pull.mjs', 'lifelenz-people-pull.mjs', 'lifelenz-pull.mjs',
  'qsrsoft-email-parse.mjs', 'qsrsoft-pull.mjs', 'forecast-week-precompute.mjs',
  'qsrsoft-pmix-pull.mjs', 'qsrsoft-ops-pull.mjs',
];
// Measured fresh on this branch AFTER converting lifelenz-pull.mjs and qsrsoft-dar-pull.mjs
// (dispatch #32's own two hand-conversions) — not copied from dispatch #25/#32's own text, per
// the standing rule those two dispatches (and R7 before this one) both state explicitly.
const CEILING = 18;

function importsContract(file) {
  const p = join(ROOT, file);
  if (!existsSync(p)) return null; // script renamed/removed — surfaced by the sanity test below
  return /_pipeline-contract\.mjs/.test(readFileSync(p, 'utf8'));
}

function findMissing() {
  return NAMED_SCRIPTS.filter(f => importsContract(f) === false);
}

describe('R8: named pull/write scripts should adopt scripts/_pipeline-contract.mjs', () => {
  it(`stays at exactly the measured ceiling (${CEILING}) — import logPartitionCoverage/checkFreshness from _pipeline-contract.mjs instead of leaving a script with no partition-coverage visibility or freshness SLA`, () => {
    const missing = findMissing();
    if (missing.length > CEILING) {
      throw new Error(
        `${missing.length} named scripts missing _pipeline-contract.mjs, ${missing.length - CEILING} more than ` +
        `the ceiling of ${CEILING}. New gap(s):\n${missing.join('\n')}\n\n` +
        `Either this is a genuinely new pull script (add it to NAMED_SCRIPTS above AND to ` +
        `sync-failure-watch.yml per CLAUDE.md's standing rule), or a script that previously ` +
        `imported _pipeline-contract.mjs stopped.`
      );
    }
    if (missing.length < CEILING) {
      throw new Error(
        `Only ${missing.length} named scripts are missing _pipeline-contract.mjs (ceiling was ` +
        `${CEILING}) — some script(s) adopted it since the ceiling was last set. Lower CEILING to ` +
        `${missing.length} in this file so the ratchet doesn't leave slack for the gap to regrow ` +
        `into. This is not a bug in your change; it's this ratchet's own upkeep.`
      );
    }
    expect(missing.length).toBe(CEILING);
  });

  it('sanity: every NAMED_SCRIPTS entry still exists in scripts/ (catches a rename/removal silently passing as "adopted")', () => {
    for (const f of NAMED_SCRIPTS) {
      expect(existsSync(join(ROOT, f)), `${f} not found in ${ROOT}/ — update NAMED_SCRIPTS`).toBe(true);
    }
  });

  it('sanity: at least one named script DOES import the contract (would false-pass if the pattern broke)', () => {
    expect(NAMED_SCRIPTS.some(f => importsContract(f) === true)).toBe(true);
  });
});
