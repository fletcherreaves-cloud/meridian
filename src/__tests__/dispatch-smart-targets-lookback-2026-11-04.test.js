// @ts-nocheck
// Owner-requested 2026-11-04 ("Under Smart Targets, let's expand the lookback periods
// available... pre-defined options as well as a custom option"). computeSmartTargets
// (src/features/smart-targets.js) gained an optional 5th param, lookbackWeeks: when omitted
// (every pre-existing caller), behavior is byte-for-byte unchanged (the original 6W-then-
// 12W/26W/52W-cascade "recent" reading); when given, a 5th window of exactly that many weeks
// is computed and preferred, falling back to the cascade only if that window itself has no
// data for this store/metric.
import { describe, it, expect } from 'vitest';
import { DEFAULT_TARGETS } from '../constants.js';
import { computeSmartTargets } from '../features/smart-targets.js';

const LOC = Object.keys(DEFAULT_TARGETS)[0];
const weeksAgo = (n) => new Date(Date.now() - n * 7 * 86400000);

// metric 'oepe' (SMART_METRICS[0]): src:'ops', field:'oepe', dir:'lower'.
function opsRow(weeksBack, oepe) { return { loc: LOC, date: weeksAgo(weeksBack), oepe }; }
// trimmedMean (smart-targets.js) drops the top/bottom ~10% of samples, which empties out an
// array of fewer than 3 elements entirely (returns null) — every fixture below uses >=3 same-
// window rows so the window's own average resolves instead of nulling out on sample size alone.
function opsRows(weeksBackList, oepe) { return weeksBackList.map(w => opsRow(w, oepe)); }

describe('computeSmartTargets — lookbackWeeks (optional 5th param)', () => {
  it('omitting lookbackWeeks reproduces the original cascade behavior exactly (regression guard)', () => {
    const ds = { loaded: true, laborRows: [], opsRows: opsRows([1,2,3], 105), ctrlRows: [], fobRows: [], storeIds: [LOC] };
    const withoutParam = computeSmartTargets(LOC, ds, {});
    const withNullish = computeSmartTargets(LOC, ds, {}, new Date(), undefined);
    expect(withoutParam.oepe.recent).toBe(withNullish.oepe.recent);
    expect(withoutParam.oepe.recent).toBeCloseTo(105, 5); // constant-value window within 6W
    expect(withoutParam.oepe.lookbackWeeks).toBeNull();
    expect(withoutParam.oepe.avgCustom).toBeNull();
  });

  it('a custom lookback window is preferred over the default cascade when it has data', () => {
    // 6W sees only the recent, worse readings; a 13W custom window also pulls in older, better
    // readings from weeks 10-12 -- the two must disagree if the param is actually honored.
    const ds = {
      loaded: true, laborRows: [],
      opsRows: [...opsRows([1,2,3], 140), ...opsRows([10,11,12], 100)],
      ctrlRows: [], fobRows: [], storeIds: [LOC],
    };
    const default6w = computeSmartTargets(LOC, ds, {}); // weeks 10-12 fall outside 6W
    const custom13w = computeSmartTargets(LOC, ds, {}, new Date(), 13); // weeks 10-12 fall inside 13W

    expect(default6w.oepe.recent).toBeCloseTo(140, 5); // only the weeks-1-3 rows are within 6W
    expect(custom13w.oepe.lookbackWeeks).toBe(13);
    expect(custom13w.oepe.avgCustom).not.toBeNull();
    expect(custom13w.oepe.avgCustom).toBeLessThan(140); // the older, lower readings pulled the average down
    expect(custom13w.oepe.recent).toBe(custom13w.oepe.avgCustom);
  });

  it('a custom window beyond the old fixed 104-week row-inclusion ceiling still finds real data (cutLY widened)', () => {
    // Rows ~120 weeks back would have been excluded entirely by the OLD hardcoded cutLY=104W
    // bound before any window math even ran -- confirms the fix that widens cutLY to cover
    // whatever lookbackWeeks needs.
    const ds = { loaded: true, laborRows: [], opsRows: opsRows([119,120,121], 95), ctrlRows: [], fobRows: [], storeIds: [LOC] };
    const custom130w = computeSmartTargets(LOC, ds, {}, new Date(), 130);
    expect(custom130w.oepe.avgCustom).toBeCloseTo(95, 5);
  });

  it('falls back to the normal cascade when the custom window itself has no data (never returns null when a fallback exists)', () => {
    // Rows 30-32 weeks back -- outside a 6W custom window AND outside the 26W cascade tier, so
    // only the 52W cascade tier finds them.
    const ds = { loaded: true, laborRows: [], opsRows: opsRows([30,31,32], 120), ctrlRows: [], fobRows: [], storeIds: [LOC] };
    const custom6w = computeSmartTargets(LOC, ds, {}, new Date(), 6);
    expect(custom6w.oepe.avgCustom).toBeNull(); // the 6W window itself truly has nothing
    expect(custom6w.oepe.recent).toBeCloseTo(120, 5); // but `recent` still resolves via the cascade's 52W tier
  });

  it('a store with genuinely no data anywhere still returns null, not a fabricated reading', () => {
    const ds = { loaded: true, laborRows: [], opsRows: [], ctrlRows: [], fobRows: [], storeIds: [LOC] };
    const custom = computeSmartTargets(LOC, ds, {}, new Date(), 13);
    expect(custom.oepe.recent).toBeNull();
    expect(custom.oepe.avgCustom).toBeNull();
  });
});
