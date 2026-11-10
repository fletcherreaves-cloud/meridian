// @ts-nocheck
// Owner request 2026-11-10, following memory/finding-variance-recount-signal-2026-11-10.md's
// research: qsr_onhand/qsr_variance_stat both upsert on (loc, period, wrin), so a recount
// overwrites the previous count's own item-level values. deriveItemHistoryRows() (scripts/
// qsrsoft-onhand-pull.mjs) is the item-level counterpart to deriveSessionRows() -- this is a
// real test of the pure derivation function, same import style as qsrsoft-onhand-pull-fob-
// nudge.test.js (no live network/supabase call made by importing the module).
import { describe, it, expect } from 'vitest';
import { deriveItemHistoryRows } from '../../scripts/qsrsoft-onhand-pull.mjs';

function row(overrides = {}) {
  return {
    wrin: '00001-001', descr: 'Test Item', cls: 'Food',
    cases: 2, packs: 1, loose: 0, total_units: 24,
    unit_price: 1.5, on_hand_amt: 36,
    last_counted: '2026-11-01', last_submitted: '2026-11-01',
    ...overrides,
  };
}

describe('deriveItemHistoryRows() -- item-level count history', () => {
  it('maps a counted row to one append-only history row keyed by (loc, count_date, wrin)', () => {
    const rows = [row()];
    const out = deriveItemHistoryRows('0003708', '2026-11', rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      loc: '0003708', count_date: '2026-11-01', wrin: '00001-001', period: '2026-11',
      descr: 'Test Item', cls: 'Food', cases: 2, packs: 1, loose: 0,
      total_units: 24, unit_price: 1.5, on_hand_amt: 36,
    });
    expect(out[0].updated_at).toBeTruthy();
  });

  it('skips a row that has never been counted (last_counted null) -- nothing to snapshot', () => {
    const rows = [row({ last_counted: null })];
    expect(deriveItemHistoryRows('0003708', '2026-11', rows)).toHaveLength(0);
  });

  it('two items counted on different dates produce two distinct rows, each real count_date preserved', () => {
    const rows = [
      row({ wrin: '00001-001', last_counted: '2026-11-01' }),
      row({ wrin: '00002-002', last_counted: '2026-11-15' }),
    ];
    const out = deriveItemHistoryRows('0003708', '2026-11', rows);
    expect(out).toHaveLength(2);
    expect(out.find(r => r.wrin === '00001-001').count_date).toBe('2026-11-01');
    expect(out.find(r => r.wrin === '00002-002').count_date).toBe('2026-11-15');
  });

  it('a RECOUNT (same wrin, same pull, but last_counted has moved to a new date) produces a row for the NEW date only -- the caller upserts on (loc,count_date,wrin), so the OLD date\'s row this function already wrote on a prior run is never touched by this run, preserving it', () => {
    // This models what happens across two separate pull runs: run 1 sees the item counted on
    // the 1st; by run 2 it's been recounted and qsr_onhand.last_counted now reads the 15th.
    const run1 = deriveItemHistoryRows('0003708', '2026-11', [row({ last_counted: '2026-11-01' })]);
    const run2 = deriveItemHistoryRows('0003708', '2026-11', [row({ last_counted: '2026-11-15' })]);
    expect(run1[0].count_date).toBe('2026-11-01');
    expect(run2[0].count_date).toBe('2026-11-15');
    // Different primary keys (loc,count_date,wrin) -- an upsert of run2's row can never
    // overwrite run1's, which is the entire point (recount no longer erases history).
    expect(run1[0].count_date).not.toBe(run2[0].count_date);
  });

  it('preserves numeric zero values (loose=0, on_hand_amt=0) rather than dropping them as falsy', () => {
    const rows = [row({ loose: 0, on_hand_amt: 0 })];
    const out = deriveItemHistoryRows('0003708', '2026-11', rows);
    expect(out[0].loose).toBe(0);
    expect(out[0].on_hand_amt).toBe(0);
  });
});
