// @ts-nocheck
// #214 — Inventory panel auto-first cloud wiring: class-vocabulary mapping, latest-period
// selection, and the usage1000 transaction-count derivation. Guards the two traps the issue
// flagged (cls vocabulary mismatch silently under-reporting Paper; a failed read looking
// like an empty one) plus the freshest-wins merge logic.
import { describe, it, expect } from 'vitest';
import { mapInvClass, avgDailyTxnsByLocMonth, cloudRowsToPanelShape } from '../views/inventory.js';

describe('mapInvClass — the cls-vocabulary trap', () => {
  it('passes through exact matches unchanged', () => {
    expect(mapInvClass('Paper')).toBe('Paper');
    expect(mapInvClass('Food')).toBe('Food');
    expect(mapInvClass('Condiment')).toBe('Condiment');
    expect(mapInvClass('Ops Supplies')).toBe('Ops Supplies');
    expect(mapInvClass('Miscellaneous')).toBe('Miscellaneous');
  });
  it('maps known QSRSoft synonyms', () => {
    expect(mapInvClass('Non Product')).toBe('Miscellaneous');
    expect(mapInvClass('Ops Supply')).toBe('Ops Supplies');
  });
  it('passes an UNRECOGNIZED value through as-is — never silently forces it into a bucket', () => {
    expect(mapInvClass('Frozen Novelty')).toBe('Frozen Novelty');
  });
  it('empty/missing class becomes Miscellaneous, not a crash', () => {
    expect(mapInvClass('')).toBe('Miscellaneous');
    expect(mapInvClass(null)).toBe('Miscellaneous');
    expect(mapInvClass(undefined)).toBe('Miscellaneous');
  });
});

describe('avgDailyTxnsByLocMonth', () => {
  it('averages txns per (loc, month) over the distinct dates present', () => {
    const rows = [
      { loc: '10422', date: '2026-07-01', txns: 200 },
      { loc: '10422', date: '2026-07-02', txns: 300 },
      { loc: '10422', date: '2026-08-01', txns: 500 }, // different month, separate bucket
      { loc: '0010422', date: '2026-07-03', txns: 400 }, // padded loc, same store as above
    ];
    const out = avgDailyTxnsByLocMonth(rows);
    expect(out['10422|2026-07']).toBeCloseTo((200 + 300 + 400) / 3, 5);
    expect(out['10422|2026-08']).toBe(500);
  });
  it('ignores rows with no loc/date, never divides by zero', () => {
    expect(avgDailyTxnsByLocMonth([{ txns: 100 }, { loc: '123' }, null])).toEqual({});
    expect(avgDailyTxnsByLocMonth([])).toEqual({});
    expect(avgDailyTxnsByLocMonth(undefined)).toEqual({});
  });
});

describe('cloudRowsToPanelShape', () => {
  const txns = { '10422|2026-07': 1000 }; // avg 1000 txns/day that month

  it('maps the direct fields per the issue field table', () => {
    const { rows } = cloudRowsToPanelShape([
      { loc: '10422', period: '2026-07', wrin: '00001-705', descr: 'Beef Patty 10:1', cls: 'Food',
        uom: 'CS/24', caseSz: 24, cost: 12.5, startInv: 10, purchases: 5, endInv: 8,
        actualUsage: 7, usagePerDay: 2, daysSupply: 4 },
    ], txns);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.loc).toBe('10422');
    expect(r.wrin).toBe('00001-705');
    expect(r.description).toBe('Beef Patty 10:1');
    expect(r.class_).toBe('Food');
    expect(r.usageDay).toBe(2);
    expect(r.daysSupply).toBe(4); // prefer the source's own daysSupply, don't recompute
    expect(r.area).toBe('Production'); // 00001-705 is in INV_MASTER as Production
    expect(r.cost).toBe(12.5);
    expect(r.startingInv).toBe(10);
    expect(r.endingInv).toBe(8);
  });

  it('derives usage1000 from usagePerDay and the transaction-count map', () => {
    const { rows } = cloudRowsToPanelShape([
      { loc: '10422', period: '2026-07', wrin: '00001-705', descr: 'x', cls: 'Food',
        usagePerDay: 5, daysSupply: 4 },
    ], txns);
    // 5 usage/day ÷ (1000 txns/day ÷ 1000) = 5
    expect(rows[0].usage1000).toBeCloseTo(5, 4);
  });

  it('usage1000 is 0 (not fabricated) when no transaction data covers that loc/month', () => {
    const { rows } = cloudRowsToPanelShape([
      { loc: '99999', period: '2026-07', wrin: '00001-705', descr: 'x', cls: 'Food', usagePerDay: 5, daysSupply: 4 },
    ], txns);
    expect(rows[0].usage1000).toBe(0);
  });

  it('keeps only the LATEST period per (loc,wrin) — freshest wins', () => {
    const { rows } = cloudRowsToPanelShape([
      { loc: '10422', period: '2026-06', wrin: '00001-705', descr: 'old', cls: 'Food', usagePerDay: 1, daysSupply: 1 },
      { loc: '10422', period: '2026-07', wrin: '00001-705', descr: 'new', cls: 'Food', usagePerDay: 9, daysSupply: 9 },
    ], txns);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('new');
  });

  it('flags an unrecognized cls value for the caller to surface, without dropping the row', () => {
    const { rows, unrecognizedClasses } = cloudRowsToPanelShape([
      { loc: '10422', period: '2026-07', wrin: '00001-705', descr: 'x', cls: 'Non Product', usagePerDay: 1, daysSupply: 1 },
      { loc: '10422', period: '2026-07', wrin: '00002-678', descr: 'y', cls: 'Weird Class', usagePerDay: 1, daysSupply: 1 },
    ], txns);
    expect(rows).toHaveLength(2);
    // 'Non Product' is a KNOWN synonym (maps cleanly to Miscellaneous) — not flagged.
    // 'Weird Class' matches nothing — flagged so the caller can warn, per the issue's Trap 1.
    expect(unrecognizedClasses).toEqual(['Weird Class']);
  });

  it('normalizes a zero-padded loc the same way a bare one is normalized', () => {
    const { rows } = cloudRowsToPanelShape([
      { loc: '0010422', period: '2026-07', wrin: '00001-705', descr: 'x', cls: 'Food', usagePerDay: 1, daysSupply: 1 },
    ], txns);
    expect(rows[0].loc).toBe('10422');
  });
});
