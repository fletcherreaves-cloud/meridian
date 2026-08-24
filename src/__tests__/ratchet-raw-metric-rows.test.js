// @ts-nocheck
// R1 (dispatch16, 2026-08-18) — panels must not read raw metric rows.
//
// src/engine/metric-source.js exists specifically so a metric's value comes from ONE place
// (auto stream first, manual fill as last resort) — see CLAUDE.md's "Source data through the
// shared helpers" standing rule. Reading ds.laborRows/ctrlRows/opsRows directly in a PANEL
// re-introduces the manual-only bug class (recent windows blank/"-100%"/"-32%") that
// metric-source.js was built to retire. Nine of the last fifteen dispatch16-era defects were
// this same shape recurring in a file nobody had checked — this ratchet exists so the count
// can only go DOWN from here, never creep back up unnoticed.
//
// SCOPE: src/views/ ONLY. src/features/session.js is the PIPELINE layer where `ds` itself is
// assembled — reading raw rows there is its job, not a violation. The rule is that PANELS must
// not source metrics from raw rows; it was never that raw rows are untouchable anywhere. Do
// NOT widen this test's ROOT to src/features/ "to be thorough" — that conflates the two layers
// dispatch16 explicitly kept separate (see its own body: "features/session.js is the pipeline
// layer... reading raw rows there is its job").
//
// BOTH DIRECTIONS matter, same as sync-failure-watch.test.js and light-mode-white-alpha.test.js
// (the only two ratchets in this repo whose class has never recurred):
//   - count > CEILING → FAIL, naming the new file:line (a violation crept in)
//   - count < CEILING → FAIL, saying "lower the ceiling to N" (a stale ceiling is silent loss
//     of protection — a check that runs, passes, and cannot fail in the case it exists for)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/views';
// Measured fresh against origin/main, 2026-08-18 (re-measured per dispatch16's own instruction
// — main has moved since the dispatch's "~162/13 files at v5.034" estimate; this run landed on
// the identical number, so no drift occurred between v5.034 and this ratchet's seed commit).
// Dispatch #68 (2026-08-22): -1 in labor-tools.js's trendData — actVsNeed's own
// METRIC_SOURCES chain already existed (a stale comment claimed otherwise) and this dropped
// the raw ds.laborRows read it was routed through instead, switching to metricAvg like its
// laborPct/tpph/otHrs siblings on the same line.
// Dispatch #94 Phase 2 moved UnifiedTargetsPanel's SPEC/valuesForLoc/_fobMonthly raw-row
// filtering (ctrlRows/laborRows/opsRows/fobRows) out of src/views/store-dash.js into
// engine/tolerance-status.js, so 3 fewer raw reads remain in src/views/ -- per this test's own
// remediation instructions ("lower CEILING... this is not a bug in your change").
const CEILING = 158;

const PATTERN = /\bds\??\.(laborRows|ctrlRows|opsRows)\b/g;

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return name.endsWith('.js') && !name.endsWith('.test.js') ? [p] : [];
  });
}

function findHits() {
  const hits = [];
  for (const file of walk(ROOT)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const matches = line.match(PATTERN);
      if (matches) for (const m of matches) hits.push(`${file}:${i + 1}  ${m}`);
    });
  }
  return hits;
}

describe('R1: panels must not read raw metric rows (ds.laborRows/ctrlRows/opsRows) directly', () => {
  it(`stays at exactly the measured ceiling (${CEILING}) — route new metric reads through metric-source.js instead`, () => {
    const hits = findHits();
    if (hits.length > CEILING) {
      throw new Error(
        `${hits.length} raw metric-row reads in src/views/, ${hits.length - CEILING} more than the ` +
        `ceiling of ${CEILING}. New site(s):\n${hits.join('\n')}\n\n` +
        `Route through metricDaily/metricSeries/metricAvg (src/engine/metric-source.js) instead of ` +
        `reading ds.laborRows/ctrlRows/opsRows directly — see CLAUDE.md's "Source data through the ` +
        `shared helpers" standing rule.`
      );
    }
    if (hits.length < CEILING) {
      throw new Error(
        `Only ${hits.length} raw metric-row reads remain in src/views/ (ceiling was ${CEILING}) — ` +
        `some site(s) were converted since the ceiling was last set. Lower CEILING to ${hits.length} ` +
        `in this file so the ratchet doesn't leave slack for the class to regrow into. This is not ` +
        `a bug in your change; it's this ratchet's own upkeep.`
      );
    }
    expect(hits.length).toBe(CEILING);
  });

  it('sanity: the pattern actually matches something (would false-pass if the regex broke)', () => {
    expect(findHits().length).toBeGreaterThan(0);
  });
});
