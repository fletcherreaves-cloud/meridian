// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { scanCsatDrivers, pearson, partialPearson, withinStoreCenter, csatTier, CSAT_OUTCOME_KEYS } from '../engine/csat-signals.js';

// Three stores, 12 months. WITHIN each store, higher OEPE strongly depresses OSAT.
// Stores have very different baselines (78 / 70 / 85 OSAT; 180 / 200 / 160 OEPE)
// so a naive pooled correlation is muddied by between-store differences — the
// within-store engine has to strip those to recover the true relationship.
function buildDs() {
  const STORES = ['3708', '3709', '3710'];
  const baseOepe = { '3708': 180, '3709': 200, '3710': 160 };
  const baseOsat = { '3708': 78, '3709': 70, '3710': 85 };
  const smgFullscale = [], opsRows = [], laborRows = [];

  for (const loc of STORES) {
    for (let m = 0; m < 12; m++) {
      const signal = (m % 6) * 3;                 // 0,3,6,9,12,15 within each store
      const oepe = baseOepe[loc] + signal;
      const osat = baseOsat[loc] - 0.8 * signal + (m % 2 ? 0.3 : -0.3);
      smgFullscale.push({
        loc, year: 2025, month: m + 1,
        osatTop2: osat, osatB2B: osat - 2, accuracyB2B: osat + 5, osat5: osat - 10,
        dtProblem: 5 + 0.2 * signal, overallProblem: 6 + 0.2 * signal,
      });
      // gc varies month-to-month but is INDEPENDENT of the OEPE signal, so it's a
      // real volume control the partial can use without swallowing the OEPE effect.
      const gc = 500 + ((m * 7) % 40);
      for (let d = 1; d <= 8; d++) {
        const date = new Date(2025, m, d);
        opsRows.push({ loc, date, oepe, kvst: 90, park: 5, r2p: 60 });
        laborRows.push({ loc, date, gc, sales: 8000, laborPct: 0.28, tpph: 60, avgCheck: 8 });
      }
    }
  }
  return { smgFullscale, opsRows, laborRows };
}

describe('csat-signals — helpers', () => {
  it('pearson returns null on zero variance', () => {
    expect(pearson([{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }])).toBe(null);
  });
  it('withinStoreCenter drops singletons and centers per store', () => {
    const { points, locsUsed } = withinStoreCenter([
      { loc: 'A', x: 10, y: 1 }, { loc: 'A', x: 20, y: 3 },
      { loc: 'B', x: 5, y: 9 }, // singleton → dropped
    ]);
    expect(locsUsed).toBe(1);
    expect(points.length).toBe(2);
    expect(points.reduce((s, p) => s + p.x, 0)).toBeCloseTo(0, 6); // centered
  });
  it('partialPearson collapses volume-driven relationships toward 0', () => {
    // x and y both = z exactly → their correlation is entirely explained by z.
    const t = [1, 2, 3, 4, 5, 6].map(z => ({ x: z, y: z, z }));
    const raw = pearson(t.map(p => ({ x: p.x, y: p.y })));
    expect(Math.abs(raw)).toBeCloseTo(1, 3);
    expect(partialPearson(t)).toBe(null); // denominator collapses → honestly undefined
  });
  it('csatTier gates on the within-store r and evidence', () => {
    expect(csatTier({ withinR: 0.55, spearman: 0.5, qValue: 0.005, partialR: 0.4, replicated: true, effN: 30 })).toBe('slam-dunk');
    expect(csatTier({ withinR: 0.45, spearman: 0.4, qValue: 0.03, partialR: 0.3, replicated: false, effN: 20 })).toBe('strong');
    expect(csatTier({ withinR: 0.32, qValue: 0.08, fdrSig: true })).toBe('watch');
    expect(csatTier({ withinR: 0.1, qValue: 0.9 })).toBe('noise');
  });
});

describe('scanCsatDrivers', () => {
  it('returns an empty shape with no ds', () => {
    const r = scanCsatDrivers(null);
    expect(r.results).toEqual([]);
    expect(r.csatOutcomes).toEqual([]);
  });

  it('recovers the within-store OEPE→OSAT relationship the pooled view would muddy', () => {
    const res = scanCsatDrivers(buildDs());
    expect(res.granularity).toBe('monthly');
    expect(res.csatOutcomes).toContain('osatTop2');

    const osatRows = res.byOutcome.osatTop2 || [];
    const oepe = osatRows.find(r => r.driverKey === 'oepe');
    expect(oepe).toBeTruthy();
    // Strong NEGATIVE within-store relationship (higher OEPE → lower OSAT).
    expect(oepe.withinR).toBeLessThan(-0.7);
    // n = 3 stores × 12 months; effN strips one DOF per store.
    expect(oepe.n).toBe(36);
    expect(oepe.effN).toBeGreaterThanOrEqual(24);
    // Survives the volume partial and lands in an actionable tier.
    expect(oepe.partialR).not.toBeNull();
    expect(['strong', 'slam-dunk']).toContain(oepe.tier);
    // Direction text: negative within-r reads "higher X → lower CSAT (hurts)".
    expect(oepe.direction).toMatch(/higher .*OEPE.*→ lower .*OSAT/i);
    expect(oepe.direction).toMatch(/hurts/);
  });

  it('drops zero-variance drivers instead of emitting bogus correlations', () => {
    const res = scanCsatDrivers(buildDs());
    const rows = res.byOutcome.osatTop2 || [];
    // avgCheck / laborPct / tpph are constant in the fixture → no within-store r.
    expect(rows.find(r => r.driverKey === 'avgCheck')).toBeFalsy();
  });

  it('exposes CSAT outcomes from the registry', () => {
    expect(CSAT_OUTCOME_KEYS).toContain('osatTop2');
    expect(CSAT_OUTCOME_KEYS).toContain('accuracyB2B');
  });
});
