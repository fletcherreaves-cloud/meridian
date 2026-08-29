// @ts-nocheck
// Dispatch #215 Task 2 — unit tests for src/engine/eom-digest.js's roll-up engine.
// Synthetic multi-store fixtures throughout; no live Supabase/network.
import { describe, it, expect } from 'vitest';
import {
  buildEomDigest, classStatusesFromProgress, daysLeftInPeriod, UNASSIGNED_KEY,
} from '../engine/eom-digest.js';

const complete = (pct = 1) => ({ status: 'complete', pct });
const inProgress = (pct = 0.5) => ({ status: 'in_progress', pct });
const notStarted = () => ({ status: 'not_started', pct: 0 });
const na = () => ({ status: 'not_applicable', pct: null });

function store(loc, { name, org, patch, food, condiment, paper = complete(), nonproduct = complete(), uncountedValue = 0, fob = null, fobTarget = null } = {}) {
  return {
    loc, name: name || loc, org, patch,
    classStatuses: { food, condiment, paper, nonproduct },
    uncountedValue, fob, fobTarget,
  };
}

describe('daysLeftInPeriod', () => {
  it('counts down to (and including) the last day of the period', () => {
    expect(daysLeftInPeriod('2026-08', new Date('2026-08-29T12:00:00'))).toBe(2); // 29th -> 31st
    expect(daysLeftInPeriod('2026-08', new Date('2026-08-31T23:00:00'))).toBe(0);
  });
  it('clamps to 0 past the end of the period, never negative', () => {
    expect(daysLeftInPeriod('2026-08', new Date('2026-09-02T00:00:00'))).toBe(0);
  });
  it('returns null with no period', () => {
    expect(daysLeftInPeriod(null)).toBeNull();
  });
});

describe('classStatusesFromProgress', () => {
  it('maps a done class to complete, a partial class to in_progress, an untouched class to not_started', () => {
    const out = classStatusesFromProgress({
      food: { total: 10, counted: 10, pct: 1, done: true },
      condiment: { total: 8, counted: 3, pct: 0.375, done: false },
      paper: { total: 5, counted: 0, pct: 0, done: false },
    });
    expect(out.food.status).toBe('complete');
    expect(out.condiment.status).toBe('in_progress');
    expect(out.paper.status).toBe('not_started');
  });
  it('a class with zero items in scope reads not_applicable, not not_started', () => {
    const out = classStatusesFromProgress({ food: { total: 0, counted: 0, pct: 0, done: false } });
    expect(out.food.status).toBe('not_applicable');
    expect(out.nonproduct.status).toBe('not_applicable'); // missing entirely -> same treatment
  });
});

describe('buildEomDigest — district level', () => {
  const rows = [
    store('1', { name: 'Store A', org: 'mcdok', patch: 'Mary', food: complete(), condiment: complete() }),
    store('2', { name: 'Store B', org: 'mcdok', patch: 'Mary', food: inProgress(0.6), condiment: notStarted() }),
    store('3', { name: 'Store C', org: 'emerald', patch: 'Brad', food: complete(), condiment: complete() }),
  ];

  it('rolls every store into ONE group, with correct per-class tallies', () => {
    const d = buildEomDigest(rows, { level: 'district', period: '2026-08', asOf: new Date('2026-08-29') });
    expect(d.groups).toHaveLength(1);
    const g = d.groups[0];
    expect(g.storeCount).toBe(3);
    expect(g.completion.food).toEqual({ complete: 2, inProgress: 1, notStarted: 0, na: 0, total: 3 });
    expect(g.completion.condiment).toEqual({ complete: 2, inProgress: 0, notStarted: 1, na: 0, total: 3 });
    expect(g.doneFoodCond).toBe(2); // A and C — B has an open class
    expect(g.openFoodCond.map(s => s.loc)).toEqual(['2']);
  });

  it('headline states the number AND the decision — names the open store(s) and days left', () => {
    const d = buildEomDigest(rows, { level: 'district', period: '2026-08', asOf: new Date('2026-08-29') });
    const h = d.groups[0].headline;
    expect(h).toMatch(/2\/3 stores Food\+Cond complete/);
    expect(h).toContain('Store B');
    expect(h).toMatch(/2 days left/);
  });
});

describe('buildEomDigest — patch grouping', () => {
  const rows = [
    store('1', { name: 'S1', patch: 'Mary', food: complete(), condiment: complete() }),
    store('2', { name: 'S2', patch: 'Mary', food: complete(), condiment: complete() }),
    store('3', { name: 'S3', patch: 'Brad', food: notStarted(), condiment: notStarted() }),
  ];

  it('groups stores by their own patch field, one row per patch', () => {
    const d = buildEomDigest(rows, { level: 'patch', period: '2026-08' });
    const keys = d.groups.map(g => g.key).sort();
    expect(keys).toEqual(['Brad', 'Mary']);
    const mary = d.groups.find(g => g.key === 'Mary');
    expect(mary.storeCount).toBe(2);
    expect(mary.doneFoodCond).toBe(2);
    const brad = d.groups.find(g => g.key === 'Brad');
    expect(brad.storeCount).toBe(1);
    expect(brad.doneFoodCond).toBe(0);
  });

  it('a store with no supervisor assignment lands under UNASSIGNED_KEY, not dropped', () => {
    const withUnassigned = [...rows, store('4', { name: 'S4', patch: null, food: complete(), condiment: complete() })];
    const d = buildEomDigest(withUnassigned, { level: 'patch', period: '2026-08' });
    const totalStores = d.groups.reduce((s, g) => s + g.storeCount, 0);
    expect(totalStores).toBe(4); // nobody vanished
    const unassigned = d.groups.find(g => g.key === UNASSIGNED_KEY);
    expect(unassigned).toBeTruthy();
    expect(unassigned.storeCount).toBe(1);
    expect(unassigned.stores[0].loc).toBe('4');
  });

  it('sorts UNASSIGNED_KEY last regardless of alphabetical order', () => {
    const withUnassigned = [store('9', { name: 'S9', patch: undefined, food: complete(), condiment: complete() }), ...rows];
    const d = buildEomDigest(withUnassigned, { level: 'patch' });
    expect(d.groups[d.groups.length - 1].key).toBe(UNASSIGNED_KEY);
  });
});

describe('buildEomDigest — org grouping', () => {
  const rows = [
    store('1', { org: 'mcdok', food: complete(), condiment: complete() }),
    store('2', { org: 'mcdok', food: complete(), condiment: complete() }),
    store('3', { org: 'emerald', food: complete(), condiment: complete() }),
  ];
  it('groups by org and labels the two known orgs by name', () => {
    const d = buildEomDigest(rows, { level: 'org' });
    const ok = d.groups.find(g => g.key === 'mcdok');
    const fl = d.groups.find(g => g.key === 'emerald');
    expect(ok.storeCount).toBe(2);
    expect(fl.storeCount).toBe(1);
    expect(ok.label).toMatch(/Oklahoma/);
    expect(fl.label).toMatch(/Florida/);
  });
});

describe('buildEomDigest — FOB-vs-target aggregation', () => {
  const overTgt = { fobPct: 0.30, fob: 30000, comp: 100, raw: 100, cond: 100, emp: 100, statv: 100, unex: 100 };
  const underTgt = { fobPct: 0.20, fob: 20000, comp: 50, raw: 50, cond: 50, emp: 50, statv: 50, unex: 50 };
  const tgt = { fobPct: 0.25, comp: 0.03, raw: 0.03, cond: 0.03, emp: 0.03, statv: 0.03, unex: 0.03 };

  it('a store over its FOB target counts toward overTargetCount with a positive gapPP, sorted worst-first', () => {
    const rows = [
      store('1', { name: 'Over A', patch: 'P1', food: complete(), condiment: complete(), fob: overTgt, fobTarget: tgt }),
      store('2', { name: 'Under B', patch: 'P1', food: complete(), condiment: complete(), fob: underTgt, fobTarget: tgt }),
    ];
    const d = buildEomDigest(rows, { level: 'patch', period: '2026-08' });
    const g = d.groups[0];
    expect(g.fob.overTargetCount).toBe(1);
    expect(g.fob.underTargetCount).toBe(1);
    expect(g.fob.worstStores[0].loc).toBe('1');
    expect(g.fob.worstStores[0].gapPP).toBeCloseTo(5, 5); // 30% - 25% = 5pp
    expect(g.fob.nWithFobData).toBe(2);
    expect(g.headline).toMatch(/FOB: 1 store over target \(worst: Over A \+5pp\)/);
  });

  it('a store under target does not count as over, and gapPP is negative/zero', () => {
    const rows = [store('1', { name: 'Under Only', patch: 'P1', food: complete(), condiment: complete(), fob: underTgt, fobTarget: tgt })];
    const d = buildEomDigest(rows, { level: 'patch' });
    expect(d.groups[0].fob.overTargetCount).toBe(0);
    expect(d.groups[0].fob.underTargetCount).toBe(1);
    expect(d.groups[0].headline).toMatch(/all 1 store with data at\/under target/);
  });

  it('stores with no FOB data or no target are excluded from the FOB aggregate but still counted toward completion', () => {
    const rows = [
      store('1', { name: 'No FOB', patch: 'P1', food: complete(), condiment: complete(), fob: null, fobTarget: tgt }),
      store('2', { name: 'No Target', patch: 'P1', food: complete(), condiment: complete(), fob: overTgt, fobTarget: null }),
    ];
    const d = buildEomDigest(rows, { level: 'patch' });
    const g = d.groups[0];
    expect(g.storeCount).toBe(2);
    expect(g.fob.nWithFobData).toBe(0);
    expect(g.fob.avgGapPP).toBeNull();
  });
});

describe('buildEomDigest — no double counting / totals sanity', () => {
  it('the sum of all groups\' storeCount at patch level equals the input length', () => {
    const rows = Array.from({ length: 7 }, (_, i) => store(String(i), { patch: i % 2 ? 'A' : 'B', food: complete(), condiment: complete() }));
    const d = buildEomDigest(rows, { level: 'patch' });
    expect(d.groups.reduce((s, g) => s + g.storeCount, 0)).toBe(7);
  });

  it('uncountedValue sums across the group\'s stores', () => {
    const rows = [
      store('1', { patch: 'A', food: complete(), condiment: complete(), uncountedValue: 100 }),
      store('2', { patch: 'A', food: complete(), condiment: complete(), uncountedValue: 250.5 }),
    ];
    const d = buildEomDigest(rows, { level: 'patch' });
    expect(d.groups[0].uncountedValue).toBeCloseTo(350.5, 5);
  });
});
