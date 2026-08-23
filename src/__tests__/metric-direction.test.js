// @ts-nocheck
// Dispatch #77 -- guards METRIC_SOURCES' new `direction` field the way metric-chains.test.js
// already guards its resolution chains: read the REAL panel-side source text (not a hand-
// copied snapshot) and assert it still agrees with the registry, so a future edit on either
// side that reintroduces a contradiction fails the suite instead of shipping silently.
//
// The dispatch's own finding: direction was declared independently in at least 8 places
// under two flag names (lowerBetter / the inverse higherBetter), and three metrics --
// Labor %, R2P, Discount % -- each had one site declaring the OPPOSITE direction from every
// other site in the app. Owner-ruled 2026-08-23: all three are lower-better, no two-sided
// third state. Full adjudication in memory/dispatch-77.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { METRIC_SOURCES, metricDirection, rankableMetricKeys } from '../engine/metric-source.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const analyticsSrc = readFileSync(path.join(__dirname, '../views/analytics.js'), 'utf8');
const storeDashSrc = readFileSync(path.join(__dirname, '../views/store-dash.js'), 'utf8');

// Extracts the lowerBetter boolean for a specific `id:'xxx'` entry from raw source text.
// Anchoring on the closing quote right after the id (not just a substring match) so 'disc'
// can't accidentally match store-dash's sibling 'discP' entry. Returns undefined (not false)
// if the id can't be found at all, so a renamed/moved id fails loudly rather than silently
// comparing against the wrong (or no) value.
function lowerBetterFor(src, id) {
  const re = new RegExp(`id:\\s*'${id}'[^}]*?lowerBetter:\\s*(true|false)`, 's');
  const m = src.match(re);
  return m ? m[1] === 'true' : undefined;
}

describe('METRIC_SOURCES direction (dispatch #77)', () => {
  it('every rankable metric has a real "lower" or "higher" direction, never a typo', () => {
    const keys = rankableMetricKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(['lower', 'higher']).toContain(METRIC_SOURCES[key].direction);
  });

  it('park and actVsNeed are deliberately left without a direction, not silently defaulted', () => {
    // See the METRIC_SOURCES header comment: park was already pulled from readiness scoring
    // (engine/pipeline.js #181) after a real quadrant measurement refuted a single-axis
    // direction; actVsNeed is a signed gap, not a monotone quantity. Neither is a "TODO".
    expect(metricDirection('park')).toBeNull();
    expect(metricDirection('actVsNeed')).toBeNull();
    expect(rankableMetricKeys()).not.toContain('park');
    expect(rankableMetricKeys()).not.toContain('actVsNeed');
  });

  // The core guard: for every panel-side declaration this test can locate, assert it agrees
  // with the registry. Collects ALL violations before failing (metric-chains.test.js's own
  // bad[]-array idiom) so one run shows every disagreement, not just the first.
  it('panel-side lowerBetter tables agree with the registry direction', () => {
    const checks = [
      // [registryKey, expectedDirection, source text, id used in that table, site label]
      ['oepe',      'lower',  storeDashSrc, 'oepe',    "store-dash.js METRICS (svc)"],
      ['r2p',       'lower',  storeDashSrc, 'r2p',     "store-dash.js METRICS (svc) -- dispatch #77 fix"],
      ['laborPct',  'lower',  storeDashSrc, 'labor',   "store-dash.js METRICS (labor)"],
      ['tpph',      'higher', storeDashSrc, 'tpph',    "store-dash.js METRICS (labor)"],
      ['discPct',   'lower',  storeDashSrc, 'disc',    "store-dash.js METRICS (fob, id=disc)"],
      ['cashOSPct', 'lower',  storeDashSrc, 'cashOS',  "store-dash.js METRICS (pos)"],
      ['oepe',      'lower',  analyticsSrc, 'oepe',    "analytics.js CORR_PREDICTORS"],
      ['r2p',       'lower',  analyticsSrc, 'r2p',     "analytics.js CORR_PREDICTORS"],
      ['laborPct',  'lower',  analyticsSrc, 'labor',   "analytics.js CORR_PREDICTORS -- dispatch #77 fix"],
      ['tpph',      'higher', analyticsSrc, 'tpph',    "analytics.js CORR_PREDICTORS"],
      ['otHrs',     'lower',  analyticsSrc, 'otHrs',   "analytics.js CORR_PREDICTORS"],
      ['cashOSPct', 'lower',  analyticsSrc, 'cashOS',  "analytics.js CORR_PREDICTORS"],
      ['tRedAPct',  'lower',  analyticsSrc, 'tRedA',   "analytics.js CORR_PREDICTORS"],
      ['discPct',   'lower',  analyticsSrc, 'discPct', "analytics.js CORR_PREDICTORS -- dispatch #77 fix"],
    ];
    const bad = [];
    for (const [key, expectedDir, src, id, label] of checks) {
      const lowerBetter = lowerBetterFor(src, id);
      if (lowerBetter === undefined) { bad.push(`${label} (id='${id}'): could not locate the declaration -- renamed or moved?`); continue; }
      const declaredDir = lowerBetter ? 'lower' : 'higher';
      const registryDir = metricDirection(key);
      if (registryDir !== expectedDir) bad.push(`${key}: registry direction is '${registryDir}', this check expected '${expectedDir}' -- update the check, don't silence it`);
      if (declaredDir !== registryDir) bad.push(`${key} @ ${label}: panel declares '${declaredDir}', registry says '${registryDir}'`);
    }
    expect(bad).toEqual([]);
  });

  it('the three owner-ruled fixes are actually in place (revert-sensitive)', () => {
    // Dispatch #77 -- these three exact sites read the wrong direction before this dispatch,
    // per the owner ruling in memory/dispatch-77.md. A revert of any one fix must fail here.
    expect(lowerBetterFor(analyticsSrc, 'labor')).toBe(true);   // was false
    expect(lowerBetterFor(analyticsSrc, 'discPct')).toBe(true); // was false
    expect(lowerBetterFor(storeDashSrc, 'r2p')).toBe(true);     // was false
  });
});
