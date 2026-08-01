import { describe, it, expect } from 'vitest';
import { buildStoreFobReport, buildFobReport } from '../engine/fob-report.js';

describe('buildStoreFobReport', () => {
  it('over target with a Variance-Stat driver → statv action naming top losers', () => {
    const r = buildStoreFobReport('5985', {
      name: 'Durant', org: 'OK', patch: 'P1',
      fob: { fobPct: 0.056, fob: 559 }, target: 0.015,
      monthly: { '2026-06': 0.038, '2026-07': 0.056 },
      varRows: [{ descr: 'McNuggets', dolDiff: -201 }, { descr: 'Beef', dolDiff: -134 }, { descr: 'Cheese', dolDiff: 50 }],
      compActual: { statv: 0.056, raw: 0.0025 }, compTarget: { statv: 0.015, raw: 0.003 },
    });
    expect(r.overTarget).toBe(true);
    expect(r.gapPP).toBeCloseTo(4.1, 1);
    expect(r.topDriver.key).toBe('statv');
    expect(r.actions[0]).toMatch(/Variance Stat is the driver/);
    expect(r.actions[0]).toMatch(/McNuggets/);
    expect(r.trend.dir).toBe('regressing');
    expect(r.actions.some(a => /Regressing/.test(a))).toBe(true);
  });

  it('flags masking when large losses are offset by gains', () => {
    const r = buildStoreFobReport('x', {
      name: 'X', org: 'OK', fob: { fobPct: 0.015, fob: 1000 }, target: 0.015,
      monthly: {}, varRows: [{ descr: 'A', dolDiff: -900 }, { descr: 'B', dolDiff: 600 }],
    });
    expect(r.masking).toBe(true);
    expect(r.actions.some(a => /offset by/.test(a))).toBe(true);
  });

  it('improving + on target = encouraging note, no opportunity', () => {
    const r = buildStoreFobReport('y', {
      name: 'Y', org: 'FL', fob: { fobPct: 0.036, fob: 900 }, target: 0.04,
      monthly: { '2026-06': 0.041, '2026-07': 0.036 }, varRows: [],
    });
    expect(r.overTarget).toBe(false);
    expect(r.trend.dir).toBe('improving');
    expect(r.oppScore).toBe(0);
    expect(r.actions.some(a => /improving/.test(a))).toBe(true);
  });
});

describe('buildFobReport', () => {
  it('groups by org (OK/FL), ranks opportunities, summarizes', () => {
    const stores = [
      { loc: '5985', org: 'OK' }, { loc: '3708', org: 'OK' }, { loc: '6178', org: 'FL' },
    ];
    const data = {
      '5985': { name: 'Durant', org: 'OK', patch: 'P1', fob: { fobPct: 0.056, fob: 559 }, target: 0.015, monthly: { '2026-06': 0.038, '2026-07': 0.056 }, varRows: [{ descr: 'N', dolDiff: -201 }], compActual: { statv: 0.056 }, compTarget: { statv: 0.015 } },
      '3708': { name: 'Ardmore', org: 'OK', patch: 'P1', fob: { fobPct: 0.038, fob: 200 }, target: 0.04, monthly: { '2026-07': 0.038 }, varRows: [] },
      '6178': { name: 'Freeport', org: 'FL', patch: 'P2', fob: { fobPct: 0.05, fob: 400 }, target: 0.04, monthly: {}, varRows: [] },
    };
    const rep = buildFobReport({ stores, get: s => data[String(s.loc)] });
    expect(rep.summary.nStores).toBe(3);
    expect(rep.summary.byOrg.OK.overTarget).toBe(1);   // Durant only
    expect(rep.orgs.map(o => o.org)).toEqual(['FL', 'OK']);
    expect(rep.opportunities[0].loc).toBe('5985');     // biggest gap ranks first
  });
});
