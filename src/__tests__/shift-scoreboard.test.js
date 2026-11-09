// @ts-nocheck
// Shift Scoreboard engine (task #122, owner-confirmed metric list + 2 additions 2026-11-08).
// Pure-function tests against real metric-source.js/DEFAULT_TARGETS shapes -- no mocking of the
// engine itself, so a revert of the real logic would fail these.
import { describe, it, expect } from 'vitest';
import {
  SCOREBOARD_METRICS, DEFAULT_VISIBLE_METRIC_IDS, computeShiftScoreboardTiles,
  computeShiftPaceVsPlan, shiftDivergenceFlag, shiftCashIntegrityFlag,
  DIVERGENCE_MIN_PCT, CASH_SPIKE_MULTIPLE,
} from '../engine/shift-scoreboard.js';

const LOC = '3708'; // Ardmore-Broadway -- has a real DEFAULT_TARGETS row (constants.js)
const today = new Date();

function dsWithToday(fields) {
  return { qsrActSummaryRows: [{ loc: LOC, date: today, ...fields }] };
}

// actVsSched (metric-source.js) is derive-only from actHrs (qsrActSummaryRows) and schedHrs
// (schedRows.schedTotHrs) -- two different rows, not a literal field on either.
function dsWithActVsSched(actHrs, schedTotHrs) {
  return {
    qsrActSummaryRows: [{ loc: LOC, date: today, actHrs }],
    schedRows: [{ loc: LOC, date: today, schedTotHrs }],
  };
}

// tRedAPct reads from opsCashRows (or ctrlRows), a field directly on that row -- not
// qsrActSummaryRows.
function dsWithTRedA(tRedAPct) {
  return { opsCashRows: [{ loc: LOC, date: today, tRedAPct }] };
}

describe('SCOREBOARD_METRICS catalog', () => {
  it('has a unique id for every entry and a real metric-source key', () => {
    const ids = SCOREBOARD_METRICS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of SCOREBOARD_METRICS) {
      expect(typeof m.metricKey).toBe('string');
      expect(typeof m.label).toBe('string');
    }
  });

  it('DEFAULT_VISIBLE_METRIC_IDS is every catalog id, in catalog order', () => {
    expect(DEFAULT_VISIBLE_METRIC_IDS).toEqual(SCOREBOARD_METRICS.map(m => m.id));
  });
});

describe('computeShiftScoreboardTiles', () => {
  it('reads a real metric value for today from qsrActSummaryRows', () => {
    const ds = dsWithToday({ oepe: 132, r2p: 88 });
    const tiles = computeShiftScoreboardTiles(ds, LOC, today, ['oepe', 'r2p']);
    expect(tiles.find(t => t.id === 'oepe').value).toBe(132);
    expect(tiles.find(t => t.id === 'r2p').value).toBe(88);
  });

  it('filters to only the visible ids requested, preserving catalog order', () => {
    const ds = dsWithToday({});
    const tiles = computeShiftScoreboardTiles(ds, LOC, today, ['tpph', 'oepe']);
    expect(tiles.map(t => t.id)).toEqual(['oepe', 'tpph']);
  });

  it('attaches this store\'s own real target from DEFAULT_TARGETS, not a generic one', () => {
    const ds = dsWithToday({ oepe: 132 });
    const tiles = computeShiftScoreboardTiles(ds, LOC, today, ['oepe']);
    expect(tiles[0].target).toBe(140); // constants.js '3708'.tOepe
  });

  it('returns null target (never fabricated) for a metric with no DEFAULT_TARGETS key', () => {
    const ds = dsWithActVsSched(28.5, 30);
    const tiles = computeShiftScoreboardTiles(ds, LOC, today, ['actVsSched']);
    expect(tiles[0].target).toBeNull();
    expect(tiles[0].value).toBe(-1.5);
  });

  it('returns null value (never 0/fabricated) when no data exists for the metric', () => {
    const tiles = computeShiftScoreboardTiles({}, LOC, today, ['oepe']);
    expect(tiles[0].value).toBeNull();
  });
});

describe('computeShiftPaceVsPlan', () => {
  it('computes real sales and guest-count pace vs plan from projSales/projGC', () => {
    const ds = dsWithToday({ sales: 1100, projSales: 1000, gc: 95, projGC: 100 });
    const pace = computeShiftPaceVsPlan(ds, LOC, today);
    expect(pace.salesPacePct).toBeCloseTo(10, 5);
    expect(pace.gcPacePct).toBeCloseTo(-5, 5);
  });

  it('returns null pace when the plan side is missing, never divides by zero/null', () => {
    const ds = dsWithToday({ sales: 1100 });
    const pace = computeShiftPaceVsPlan(ds, LOC, today);
    expect(pace.salesPacePct).toBeNull();
  });
});

describe('shiftDivergenceFlag', () => {
  it('flags when guest counts are up but sales are down, both past the magnitude floor', () => {
    const pace = { salesPacePct: -8, gcPacePct: 9 };
    const flag = shiftDivergenceFlag(pace);
    expect(flag).toBeTruthy();
    expect(flag.headline).toMatch(/Guest counts are up/);
  });

  it('flags the reverse direction too (sales up, guests down)', () => {
    const pace = { salesPacePct: 7, gcPacePct: -6 };
    const flag = shiftDivergenceFlag(pace);
    expect(flag.headline).toMatch(/Sales are up/);
  });

  it('does not flag when both move the same direction', () => {
    expect(shiftDivergenceFlag({ salesPacePct: 8, gcPacePct: 7 })).toBeNull();
  });

  it('does not flag when either side is under the minimum magnitude (noise floor)', () => {
    expect(shiftDivergenceFlag({ salesPacePct: -1, gcPacePct: DIVERGENCE_MIN_PCT })).toBeNull();
  });

  it('does not flag when pace data is incomplete', () => {
    expect(shiftDivergenceFlag({ salesPacePct: null, gcPacePct: 10 })).toBeNull();
    expect(shiftDivergenceFlag(null)).toBeNull();
  });
});

describe('shiftCashIntegrityFlag', () => {
  it('flags a real T-Red spike at or above the multiple of this store\'s own target', () => {
    // '3708' tRedAPct target = 0.0033 (constants.js) -- 2x = 0.0066
    const ds = dsWithTRedA(0.007);
    const flag = shiftCashIntegrityFlag(ds, LOC, today);
    expect(flag).toBeTruthy();
    expect(flag.id).toBe('cash-integrity-tRedAPct');
    expect(flag.headline).toContain(`${CASH_SPIKE_MULTIPLE}x`);
  });

  it('does not flag a reading under the spike multiple', () => {
    const ds = dsWithTRedA(0.004); // above target but under 2x
    expect(shiftCashIntegrityFlag(ds, LOC, today)).toBeNull();
  });

  it('returns null for a store with no DEFAULT_TARGETS entry, never a false positive', () => {
    const ds = dsWithTRedA(0.5);
    expect(shiftCashIntegrityFlag(ds, '999999999', today)).toBeNull();
  });
});
