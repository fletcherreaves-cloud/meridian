// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  KPI_REGISTRY, kpiByKey, kpisByCategory, explainThreshold, makeMetricFromKpi,
} from '../engine/kpi-registry.js';
import { DEFAULT_REVIEW_CONFIG } from '../engine/review-engine.js';

describe('KPI_REGISTRY', () => {
  it('flattens every default-review metric, de-duped by key', () => {
    const reviewKeys = new Set();
    for (const mets of Object.values(DEFAULT_REVIEW_CONFIG.metrics)) {
      for (const m of mets) reviewKeys.add(m.key);
    }
    for (const k of reviewKeys) {
      expect(KPI_REGISTRY.find(e => e.key === k), `missing ${k}`).toBeTruthy();
    }
    const keys = KPI_REGISTRY.map(k => k.key);
    expect(new Set(keys).size).toBe(keys.length); // no dupes
  });

  it('includes the extra operational KPIs', () => {
    for (const key of ['tpph', 'cashOSPct', 'tRedAPct', 'parkPct']) {
      const k = kpiByKey(key);
      expect(k, `missing extra ${key}`).toBeTruthy();
      expect(k.inReview).toBe(false); // not a default review metric
      expect(k.src).toBe('auto');
    }
  });

  it('every entry carries category, unit, direction, and a threshold triple', () => {
    for (const k of KPI_REGISTRY) {
      expect(k.category).toBeTruthy();
      expect(k.categoryLabel).toBeTruthy();
      expect(['abs', 'pct']).toContain(k.unit);
      expect(['higher', 'lower']).toContain(k.better);
      expect(k.defaultT).toHaveLength(3);
    }
  });

  it('marks default-review metrics as inReview', () => {
    expect(kpiByKey('oepe').inReview).toBe(true);
    expect(kpiByKey('labor').inReview).toBe(true);
  });
});

describe('kpiByKey', () => {
  it('finds a KPI and returns null for unknown', () => {
    expect(kpiByKey('oepe').label).toMatch(/OEPE/);
    expect(kpiByKey('does-not-exist')).toBeNull();
  });
});

describe('kpisByCategory', () => {
  it('groups by category and covers all registry entries', () => {
    const g = kpisByCategory();
    const total = Object.values(g).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(KPI_REGISTRY.length);
    expect(g.rgr.some(k => k.key === 'oepe')).toBe(true);
    expect(g.profit.some(k => k.key === 'tpph')).toBe(true); // extra lands in profit
  });
});

describe('explainThreshold', () => {
  it('returns empty for a null kpi', () => {
    expect(explainThreshold(null)).toBe('');
  });

  it('describes a higher-is-better pct KPI in percent', () => {
    const txt = explainThreshold(kpiByKey('osat')); // pct, higher, t:[0.05,0,-0.05]
    expect(txt).toMatch(/Higher is better/);
    expect(txt).toMatch(/% deviation from target/);
    expect(txt).toMatch(/4 if actual ≥/);
    expect(txt).toMatch(/5\.00%/); // t4 = 0.05 rendered as percent
  });

  it('describes a lower-is-better abs KPI in raw units', () => {
    const txt = explainThreshold(kpiByKey('oepe')); // abs, lower, t:[-5,5,10]
    expect(txt).toMatch(/Lower is better/);
    expect(txt).toMatch(/raw units/);
    expect(txt).toMatch(/4 if actual ≤/);
    expect(txt).toMatch(/T4=-5/);
  });
});

describe('makeMetricFromKpi', () => {
  it('builds a review-metric def with a fresh weight and copied threshold', () => {
    const m = makeMetricFromKpi(kpiByKey('tpph'), { weight: 0.2 });
    expect(m.key).toBe('tpph');
    expect(m.weight).toBe(0.2);
    expect(m.scored).toBe(true);
    expect(m.better).toBe('higher');
    expect(m.field).toBe('tpph');
    expect(m.t).toEqual([0.2, -0.3, -0.6]);
    // mutating the returned threshold must not touch the registry
    m.t[0] = 999;
    expect(kpiByKey('tpph').defaultT[0]).toBe(0.2);
  });

  it('defaults weight to 0.1 and returns null for a null kpi', () => {
    expect(makeMetricFromKpi(kpiByKey('labor')).weight).toBe(0.1);
    expect(makeMetricFromKpi(null)).toBeNull();
  });

  it('carries pctInput / dollar / tgtField flags through when present', () => {
    const m = makeMetricFromKpi(kpiByKey('labor')); // pctInput + tgtField:'laborTgt'
    expect(m.pctInput).toBe(true);
    expect(m.tgtField).toBe('laborTgt');
    const noFlag = makeMetricFromKpi(kpiByKey('oepe'));
    expect(noFlag.pctInput).toBeUndefined();
    expect(noFlag.dollar).toBeUndefined();
  });
});
