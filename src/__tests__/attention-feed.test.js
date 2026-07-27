import { describe, it, expect } from 'vitest';
import { fobOutliers, salesBehindLY, staleData, slowDT, visitRisk, signalDecay, rankAttention, buildAttentionFeed, SEV } from '../engine/attention-feed.js';

const nm = (l) => 'Store' + l;

describe('fobOutliers', () => {
  it('flags stores whose FOB% runs above the dollar-weighted district rate', () => {
    // district rate = (300+300+2000)/(10000+10000+20000)=2600/40000=6.5%
    const fob = {
      a: { fobPct: 0.03, fob$: 300, sales: 10000 },   // below
      b: { fobPct: 0.03, fob$: 300, sales: 10000 },   // below
      c: { fobPct: 0.10, fob$: 2000, sales: 20000 },  // 10% >> district*1.3, ~$700 excess → flagged
    };
    const items = fobOutliers(fob, nm);
    expect(items).toHaveLength(1);
    expect(items[0].loc).toBe('c');
    expect(items[0].dollars).toBeGreaterThan(0);
  });
  it('needs at least 3 stores to form a district baseline', () => {
    expect(fobOutliers({ a: { fobPct: 0.9, fob$: 900, sales: 1000 } }, nm)).toHaveLength(0);
  });
  it('marks very-high FOB as critical', () => {
    const fob = { a: { fobPct: 0.03, fob$: 300, sales: 10000 }, b: { fobPct: 0.03, fob$: 300, sales: 10000 }, c: { fobPct: 0.12, fob$: 1200, sales: 10000 } };
    expect(fobOutliers(fob, nm)[0].severity).toBe('crit');
  });
});

describe('salesBehindLY', () => {
  it('flags stores behind LY beyond the min gap', () => {
    const rows = [{ loc: 'a', cur: 8000, ly: 10000 }, { loc: 'b', cur: 10500, ly: 10000 }];
    const items = salesBehindLY(rows, nm);
    expect(items).toHaveLength(1);
    expect(items[0].loc).toBe('a');
    expect(items[0].dollars).toBe(-2000);
  });
});

describe('staleData', () => {
  it('escalates by age', () => {
    expect(staleData(3)).toHaveLength(0);
    expect(staleData(9)[0].severity).toBe('warn');
    expect(staleData(20)[0].severity).toBe('crit');
  });
});

describe('slowDT', () => {
  it('flags DT over target', () => {
    const rows = [{ loc: 'a', dt: 300, target: 240 }, { loc: 'b', dt: 200, target: 240 }];
    const items = slowDT(rows, nm);
    expect(items).toHaveLength(1);
    expect(items[0].loc).toBe('a');
  });
});

describe('visitRisk', () => {
  it('flags elevated food-safety (crit) and at-risk readiness (warn)', () => {
    const stores = [
      { loc: 'a', band: 'ready', fsFlag: 'low', readiness: 90, fsScore: 80 },
      { loc: 'b', band: 'at-risk', fsFlag: 'watch', readiness: 62, fsScore: 60 },
      { loc: 'c', band: 'watch', fsFlag: 'elevated', readiness: 74, fsScore: 45 },
    ];
    const items = visitRisk(stores, nm);
    expect(items.find(i => i.loc === 'c' && i.category === 'Food Safety').severity).toBe('crit');
    expect(items.find(i => i.loc === 'b' && i.category === 'Visit Readiness').severity).toBe('warn');
    expect(items.some(i => i.loc === 'a')).toBe(false);
  });
});

describe('signalDecay', () => {
  it('flags a saved correlation whose strength dropped well below its peak', () => {
    const saved = [
      { status: 'confirmed', outcomeKey: 'o', driverKey: 'd', outcomeLabel: 'OSAT', driverLabel: 'Speed',
        history: [{ withinR: 0.62 }, { withinR: 0.55 }, { withinR: 0.30 }] }, // 0.30 < 0.62*0.65 → decaying
      { status: 'confirmed', outcomeKey: 'o2', driverKey: 'd2', outcomeLabel: 'X', driverLabel: 'Y',
        history: [{ withinR: 0.5 }, { withinR: 0.48 }] }, // holding
      { status: 'dismissed', outcomeKey: 'o3', driverKey: 'd3', history: [{ withinR: 0.9 }, { withinR: 0.1 }] }, // dismissed → ignored
    ];
    const items = signalDecay(saved);
    expect(items).toHaveLength(1);
    expect(items[0].title).toMatch(/Speed → OSAT/);
  });
});

describe('rankAttention', () => {
  it('orders by severity, then dollars, and caps', () => {
    const items = [
      { id: 1, severity: 'warn', dollars: -500 },
      { id: 2, severity: 'crit', dollars: -100 },
      { id: 3, severity: 'warn', dollars: -2000 },
      { id: 4, severity: 'info', dollars: -9999 },
    ];
    const ranked = rankAttention(items, { max: 3 });
    expect(ranked.map(r => r.id)).toEqual([2, 3, 1]); // crit first; among warns, bigger $ first; info dropped by cap
  });
});

describe('buildAttentionFeed', () => {
  it('fuses detectors into one ranked feed', () => {
    const feed = buildAttentionFeed({
      fobByStore: { a: { fobPct: 0.03, fob$: 300, sales: 10000 }, b: { fobPct: 0.03, fob$: 300, sales: 10000 }, c: { fobPct: 0.12, fob$: 1200, sales: 10000 } },
      salesLY: [{ loc: 'd', cur: 8000, ly: 10000 }],
      ageDays: 20,
      storeName: nm,
    });
    // stale (crit) + fob-c (crit) + ly-d (warn), stale/crit first
    expect(feed[0].category).toMatch(/Data|Food Cost/);
    expect(feed.some(i => i.category === 'Sales')).toBe(true);
    expect(feed.every(i => 'severity' in i)).toBe(true);
  });
});
