// @ts-nocheck
// Tests of lifelenz-dar-pull.mjs's pure row-shaping + window-boundary helpers.
//
// darIntervalToRow's fixture below is the REAL `dar[]` element shape confirmed live (GitHub
// Actions run 44181293382, store 0003708, 2026-11-17) — see
// memory/finding-lifelenz-dar-schema-2026-11-17.md for the full discovery writeup and
// supabase/schema-lifelenz-dar.sql's header for why every FieldValue.value is parsed as
// numeric (the wire shape is a bare String for every fieldCode, including the two that are
// logically integer counts).
import { describe, it, expect } from 'vitest';
import {
  darIntervalToRow,
  locFromName,
  mostRecentlyCompletedHour,
  FIELD_CODES,
} from '../../scripts/lifelenz-dar-pull.mjs';

describe('lifelenz-dar-pull: locFromName', () => {
  it('extracts and zero-pads a store number from a schedule name', () => {
    expect(locFromName('0003708 - Ardmore')).toBe('0003708');
    expect(locFromName('3708 - Ardmore')).toBe('0003708');
  });
  it('returns null when no store number is present', () => {
    expect(locFromName('MCDOK/Emerald Arches')).toBeNull();
  });
});

describe('lifelenz-dar-pull: mostRecentlyCompletedHour', () => {
  it('floors to the current hour, then steps back one more hour', () => {
    const now = new Date('2026-11-17T21:47:12Z');
    const r = mostRecentlyCompletedHour(now);
    expect(r.toISOString()).toBe('2026-11-17T20:00:00.000Z');
  });
  it('rolls over a UTC day boundary correctly', () => {
    const now = new Date('2026-11-17T00:12:00Z');
    const r = mostRecentlyCompletedHour(now);
    expect(r.toISOString()).toBe('2026-11-16T23:00:00.000Z');
  });
});

describe('lifelenz-dar-pull: darIntervalToRow', () => {
  // Real response fixture, run 44181293382 (store 0003708, the business day's first hour).
  const REAL_INTERVAL = {
    missingActuals: false,
    startTime: '2026-11-16T04:00:00Z',
    data: [
      { fieldCode: 'net_sales', value: '1247.33' },
      { fieldCode: 'transactions', value: '103' },
      { fieldCode: 'total_transactions_variation', value: '-2' },
      { fieldCode: 'drive_through_transactions_variation', value: '1' },
      { fieldCode: 'window_transactions_variation', value: '-3' },
      { fieldCode: 'sandwiches', value: '211' },
      { fieldCode: 'sandwich_count_variation', value: '4' },
      { fieldCode: 'avg_dt_service_time', value: '168' },
      { fieldCode: 'avg_fc_service_time', value: '205' },
      { fieldCode: 'avg_mfy_service_time', value: '70' },
      { fieldCode: 'actual_punch_hours', value: '3.6166666666666667' },
      { fieldCode: 'total_hours_diff', value: '-1.3833333333333333' },
      { fieldCode: 'total_hours_ideal_variation', value: '0.3666666666666667' },
      { fieldCode: 'transactions_per_punch_hour', value: '2.488479262672811' },
      { fieldCode: 'sales_per_punch_hour', value: '29.52165898617512' },
      { fieldCode: 'labour_percentage_of_sales', value: '45.5027941681496' },
    ],
  };

  it('promotes every real fieldCode into its own numeric column', () => {
    const row = darIntervalToRow('0003708', REAL_INTERVAL);
    expect(row.loc).toBe('0003708');
    expect(row.start_time).toBe('2026-11-16T04:00:00Z');
    expect(row.missing_actuals).toBe(false);
    expect(row.net_sales).toBe(1247.33);
    expect(row.transactions).toBe(103);
    expect(row.labour_percentage_of_sales).toBeCloseTo(45.5027941681496, 10);
    // Every declared field code must have produced a column — this is what would catch a
    // silently-dropped fieldCode if FIELD_CODES and the row-shaping loop ever drifted apart.
    for (const code of FIELD_CODES) {
      expect(row).toHaveProperty(code);
      expect(row[code]).not.toBeNull();
    }
  });

  it('handles an hour with no real data yet (missingActuals=true, all-zero FieldValues)', () => {
    const interval = {
      missingActuals: true,
      startTime: '2026-11-16T05:00:00Z',
      data: FIELD_CODES.map(code => ({ fieldCode: code, value: '0' })),
    };
    const row = darIntervalToRow('0003708', interval);
    expect(row.missing_actuals).toBe(true);
    expect(row.net_sales).toBe(0);
    expect(row.transactions).toBe(0);
  });

  it('is null, not NaN or a crash, for a fieldCode missing from the response entirely', () => {
    const row = darIntervalToRow('0003708', { missingActuals: false, startTime: '2026-11-16T06:00:00Z', data: [] });
    for (const code of FIELD_CODES) expect(row[code]).toBeNull();
  });
});
