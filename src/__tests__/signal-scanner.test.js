import { describe, it, expect } from 'vitest';
import {
  spearman, pValueFromR, benjaminiHochberg, scanAllPairs, SEEDED_SIGNALS, METRIC_CATEGORIES, findMetric, metricConcept,
  extractMetricValues, computeCustomSignal,
} from '../engine/signal-registry.js';

describe('signal scanner — Spearman', () => {
  it('is +1 for any strictly increasing (even nonlinear) relation', () => {
    const pairs = Array.from({ length: 30 }, (_, i) => ({ x: i, y: i * i })); // nonlinear, monotone
    expect(spearman(pairs)).toBeCloseTo(1, 5);
  });
  it('is -1 for a strictly decreasing relation', () => {
    const pairs = Array.from({ length: 30 }, (_, i) => ({ x: i, y: -i }));
    expect(spearman(pairs)).toBeCloseTo(-1, 5);
  });
  it('averages tied ranks', () => {
    const pairs = [{ x: 1, y: 5 }, { x: 1, y: 6 }, { x: 2, y: 7 }, { x: 3, y: 8 }, { x: 3, y: 9 }];
    expect(spearman(pairs)).not.toBeNull();
  });
  it('returns null under 5 points', () => {
    expect(spearman([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
  });
});

describe('signal scanner — p-values', () => {
  it('near-perfect correlation is highly significant', () => {
    expect(pValueFromR(0.99, 40)).toBeLessThan(1e-6);
  });
  it('a trivial correlation is not significant', () => {
    expect(pValueFromR(0.05, 40)).toBeGreaterThan(0.5);
  });
  it('r≈0.35 at n=30 sits near the 0.05 boundary', () => {
    const p = pValueFromR(0.35, 30);
    expect(p).toBeGreaterThan(0.02);
    expect(p).toBeLessThan(0.08);
  });
  it('is symmetric in the sign of r', () => {
    expect(pValueFromR(0.6, 25)).toBeCloseTo(pValueFromR(-0.6, 25), 10);
  });
});

describe('signal scanner — Benjamini–Hochberg FDR', () => {
  it('flags the small p-values and rejects the large ones', () => {
    const items = [{ p: 0.001 }, { p: 0.008 }, { p: 0.02 }, { p: 0.2 }, { p: 0.5 }, { p: 0.9 }];
    benjaminiHochberg(items, 0.05);
    expect(items.slice(0, 3).every(i => i.fdrSig)).toBe(true);
    expect(items.slice(3).some(i => i.fdrSig)).toBe(false);
    // q-values are monotone non-decreasing in p
    expect(items[0].qValue).toBeLessThanOrEqual(items[5].qValue);
  });
  it('is more lenient than Bonferroni when there are many true positives', () => {
    // 10 tests all at p=0.02. Bonferroni α/m = 0.005 rejects all of them;
    // BH: at k=10, p ≤ (10/10)·0.05 = 0.05, so all 10 survive.
    const items = Array.from({ length: 10 }, () => ({ p: 0.02 }));
    benjaminiHochberg(items, 0.05);
    expect(items.every(i => i.fdrSig)).toBe(true);
    expect(0.02 > 0.05 / 10).toBe(true); // Bonferroni would have rejected each
  });
});

describe('signal scanner — scanAllPairs', () => {
  // Build a synthetic cloud (glimpseRows) dataset where sales and gc move together.
  const days = Array.from({ length: 35 }, (_, i) => new Date(2026, 5, 1 + i));
  const glimpseRows = [];
  for (const loc of ['3708', '5183']) {
    for (let k = 0; k < days.length; k++) {
      const base = 1000 + k * 7; // deterministic upward trend
      glimpseRows.push({ loc, date: days[k], allNetSales: base * 10, gc: base, laborPct: 0.30 - k * 0.001, promoPct: 0.03 });
    }
  }

  it('finds the strong sales↔gc pairing and reports test bookkeeping', () => {
    const res = scanAllPairs({ glimpseRows }, { granularity: 'daily', minAbsR: 0.3, minN: 20 });
    expect(res.metricsUsed).toBeGreaterThanOrEqual(3);
    expect(res.tested).toBeGreaterThan(0);
    expect(res.results.length).toBeGreaterThan(0);
    const top = res.results[0];
    expect(Math.abs(top.r)).toBeGreaterThan(0.9);
    expect(top.rho).not.toBeNull();
    expect(top.qValue).toBeLessThan(0.05);
  });

  it('respects the min |r| floor', () => {
    const low = scanAllPairs({ glimpseRows }, { granularity: 'daily', minAbsR: 0.3, minN: 20 });
    const high = scanAllPairs({ glimpseRows }, { granularity: 'daily', minAbsR: 0.95, minN: 20 });
    expect(high.results.length).toBeLessThanOrEqual(low.results.length);
    expect(high.results.every(r => Math.abs(r.r) >= 0.95)).toBe(true);
  });

  it('returns empty (not an error) with no data', () => {
    const res = scanAllPairs({}, { granularity: 'daily' });
    expect(res.results).toEqual([]);
    expect(res.metricsUsed).toBe(0);
  });

  it('suppresses same-concept (tautological) pairs', () => {
    // Manual sales + cloud sales (same concept) plus an unrelated metric.
    const rows = [];
    for (const loc of ['3708', '5183']) {
      for (let k = 0; k < 35; k++) {
        rows.push({ loc, date: days[k], allNetSales: 1000 + k * 5, gc: 900 + k * 4, laborPct: 0.25 });
      }
    }
    // ledger sales (slSales) and DAR sales (qaSales) share concept 'net_sales'.
    const res = scanAllPairs({ salesLedgerRows: rows, qsrActSummaryRows: rows.map(r => ({ ...r, sales: r.allNetSales })) },
      { granularity: 'daily', minAbsR: 0.3, minN: 20 });
    // No surfaced pair may be two net_sales metrics.
    const tautology = res.results.find(r => metricConcept(r.xKey) === metricConcept(r.yKey));
    expect(tautology).toBeUndefined();
  });
});

describe('signal scanner — concept map', () => {
  it('groups manual and cloud versions of the same measure', () => {
    expect(metricConcept('sales')).toBe(metricConcept('slSales'));
    expect(metricConcept('sales')).toBe(metricConcept('qaSales'));
    expect(metricConcept('oepe')).toBe(metricConcept('glOepe'));
    expect(metricConcept('promoPct')).toBe(metricConcept('promoAmt')); // count/$/% collapse
  });
  it('keeps genuinely different measures in different concepts', () => {
    expect(metricConcept('sales')).not.toBe(metricConcept('gc'));
    expect(metricConcept('laborPct')).not.toBe(metricConcept('oepe'));
    expect(metricConcept('promoPct')).not.toBe(metricConcept('discPct'));
  });
  it('defaults ungrouped keys to their own key', () => {
    expect(metricConcept('r2p')).toBe('r2p');
  });
});

describe('signal scanner — weather metrics', () => {
  const days = Array.from({ length: 30 }, (_, i) => new Date(2026, 0, 1 + i));
  const weatherRows = days.map((d, k) => ({
    loc: '3708', date: d,
    tmax: 60 + k,          // always > 0
    tmin: 40 + k,
    davg: 50 + k,
    rain: k % 3 === 0 ? 0 : 0.2,  // dry every 3rd day → real zeros
    wspd: 5 + (k % 4),
  }));

  it('rainfall keeps its zero (dry) days — allowZero', () => {
    const vals = extractMetricValues('wxRain', { weatherRows }, 'daily');
    // 30 days, none dropped: the dry days (rain=0) must survive.
    expect(vals.length).toBe(30);
    expect(vals.some(v => v.value === 0)).toBe(true);
  });

  it('temperature drops 0 as a missing-data proxy (no allowZero)', () => {
    const withMissing = weatherRows.map((r, i) => i === 0 ? { ...r, tmax: 0 } : r);
    const vals = extractMetricValues('wxTmax', { weatherRows: withMissing }, 'daily');
    expect(vals.length).toBe(29); // the tmax=0 row is dropped
  });

  it('surfaces a weather↔sales relationship in the scanner', () => {
    // sales tracks temperature deterministically.
    const laborRows = days.map((d, k) => ({ loc: '3708', date: d, sales: (60 + k) * 100, gc: 500 + k }));
    const res = scanAllPairs({ weatherRows, laborRows }, { granularity: 'daily', minAbsR: 0.3, minN: 20 });
    const wxPair = res.results.find(r => (r.xKey === 'wxTmax' && r.yKey === 'sales') || (r.xKey === 'sales' && r.yKey === 'wxTmax'));
    expect(wxPair).toBeTruthy();
    expect(Math.abs(wxPair.r)).toBeGreaterThan(0.9);
  });

  it('does not pair temperature metrics with each other (temp concept)', () => {
    expect(metricConcept('wxTmax')).toBe(metricConcept('wxTavg'));
    const res = scanAllPairs({ weatherRows }, { granularity: 'daily', minAbsR: 0.1, minN: 20 });
    const tempPair = res.results.find(r =>
      ['wxTmax', 'wxTmin', 'wxTavg'].includes(r.xKey) && ['wxTmax', 'wxTmin', 'wxTavg'].includes(r.yKey));
    expect(tempPair).toBeUndefined();
  });
});

describe('signal scanner — calendar (day-of-week) factors', () => {
  const days = Array.from({ length: 42 }, (_, i) => new Date(2026, 0, 1 + i)); // 6 weeks
  const laborRows = days.map(d => {
    const wknd = (d.getDay() === 0 || d.getDay() === 6);
    return { loc: '3708', date: d, sales: wknd ? 14000 : 10000, gc: wknd ? 1400 : 1000 };
  });

  it('synthesizes a 0/1 weekend flag over the real data universe', () => {
    const vals = extractMetricValues('calWeekend', { laborRows }, 'daily');
    expect(vals.length).toBe(42);
    const weekendCount = vals.filter(v => v.value === 1).length;
    expect(weekendCount).toBe(12); // 6 weeks × 2 weekend days
  });

  it('calendar metrics only exist at daily granularity', () => {
    expect(extractMetricValues('calWeekend', { laborRows }, 'monthly')).toEqual([]);
  });

  it('a weekend→sales custom signal captures the lift as a strong correlation', () => {
    const sig = computeCustomSignal({ id: 't', xMetric: 'calWeekend', yMetric: 'sales', granularity: 'daily', scope: 'district' }, { laborRows });
    expect(sig.n).toBe(42);
    expect(sig.r).toBeGreaterThan(0.9); // weekend=1 lines up with the higher sales
  });

  it('never pairs two calendar factors with each other', () => {
    const res = scanAllPairs({ laborRows }, { granularity: 'daily', minAbsR: 0.1, minN: 20 });
    const calPair = res.results.find(r =>
      findMetric(r.xKey)?.category === 'calendar' && findMetric(r.yKey)?.category === 'calendar');
    expect(calPair).toBeUndefined();
  });
});

describe('signal registry — integrity', () => {
  it('every metric key is unique across all categories', () => {
    const keys = METRIC_CATEGORIES.flatMap(c => c.metrics.map(m => m.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('the relabeled T-Reds Before metric is still keyed tRedBPct', () => {
    expect(findMetric('tRedBPct').label).toBe('T-Reds Before Total %');
  });
  it('exposes T-Reds After and regular refund metrics that were previously missing', () => {
    for (const k of ['tRedAPct', 'tRedACnt', 'cashRefAmt', 'cashlessRefAmt', 'promoPct']) {
      expect(findMetric(k)).not.toBeNull();
    }
  });
  it('every seeded signal references real metric keys', () => {
    for (const s of SEEDED_SIGNALS) {
      expect(findMetric(s.xMetric), `${s.id} xMetric ${s.xMetric}`).not.toBeNull();
      expect(findMetric(s.yMetric), `${s.id} yMetric ${s.yMetric}`).not.toBeNull();
    }
  });
  it('cloud-sourced metrics point at real ds keys', () => {
    const cloudSources = new Set(['glimpseRows', 'cashRows', 'salesLedgerRows', 'qsrActSummaryRows']);
    const cloudMetrics = METRIC_CATEGORIES.flatMap(c => c.metrics).filter(m => cloudSources.has(m.source));
    expect(cloudMetrics.length).toBeGreaterThan(20);
  });
});
