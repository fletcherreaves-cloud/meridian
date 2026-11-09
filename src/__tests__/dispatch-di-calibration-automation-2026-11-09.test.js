// @ts-nocheck
// DI Calibration automation (owner-directed 2026-11-09): "can we automate the DI calibration
// and have it execute either by our own conditions as we previously defined or just schedule
// them update on a schedule per your determination." Covers scripts/di-calibration-run.mjs's
// pure store-selection logic (selectStoresToCalibrate) — the only part of that script with no
// Supabase/forecastDay I/O, same "no network mocking needed" posture as
// dispatch-rolling-forecast-capture-2026-11-09.test.js's own date-window coverage.
import { describe, it, expect } from 'vitest';
import { selectStoresToCalibrate } from '../../scripts/di-calibration-run.mjs';

describe('selectStoresToCalibrate', () => {
  it('full mode selects every store regardless of drift, even with no drift data at all', () => {
    const { toCalibrate, skipped } = selectStoresToCalibrate('full', ['1', '2', '3'], {});
    expect(toCalibrate.map(s => s.loc)).toEqual(['1', '2', '3']);
    expect(skipped).toEqual([]);
    expect(toCalibrate.every(s => s.reason === 'full mode')).toBe(true);
  });

  it('full mode ignores drift status entirely — a store flagged "ok" is still selected', () => {
    const driftByLoc = { '1': { status: 'ok', drift: 0.2, mape2w: 10, mape6w: 9.8 } };
    const { toCalibrate } = selectStoresToCalibrate('full', ['1'], driftByLoc);
    expect(toCalibrate).toHaveLength(1);
  });

  it('weekly mode selects only stores with status==="recalibrate"', () => {
    const driftByLoc = {
      '1': { status: 'recalibrate', drift: 6.1, mape2w: 15, mape6w: 8.9 },
      '2': { status: 'warn', drift: 3, mape2w: 11, mape6w: 8 },
      '3': { status: 'ok', drift: 0.5, mape2w: 9, mape6w: 8.5 },
    };
    const { toCalibrate, skipped } = selectStoresToCalibrate('weekly', ['1', '2', '3'], driftByLoc);
    expect(toCalibrate.map(s => s.loc)).toEqual(['1']);
    expect(skipped.map(s => s.loc)).toEqual(['2', '3']);
  });

  it('weekly mode treats a null drift result (insufficient history) as skipped, not selected', () => {
    const { toCalibrate, skipped } = selectStoresToCalibrate('weekly', ['1'], { '1': null });
    expect(toCalibrate).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/not enough recent history/);
  });

  it('weekly mode treats a missing key the same as an explicit null (same skip path)', () => {
    const { toCalibrate, skipped } = selectStoresToCalibrate('weekly', ['1'], {});
    expect(toCalibrate).toEqual([]);
    expect(skipped).toHaveLength(1);
  });

  it('each selected store carries a human-readable reason naming the real drift numbers', () => {
    const driftByLoc = { '1': { status: 'recalibrate', drift: 7.3, mape2w: 18.2, mape6w: 10.9 } };
    const { toCalibrate } = selectStoresToCalibrate('weekly', ['1'], driftByLoc);
    expect(toCalibrate[0].reason).toContain('18.2');
    expect(toCalibrate[0].reason).toContain('10.9');
  });

  it('empty store list returns empty results for either mode, not an error', () => {
    expect(selectStoresToCalibrate('weekly', [], {})).toEqual({ toCalibrate: [], skipped: [] });
    expect(selectStoresToCalibrate('full', [], {})).toEqual({ toCalibrate: [], skipped: [] });
  });
});
