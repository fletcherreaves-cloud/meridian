import { describe, it, expect } from 'vitest';
import { buildEomReport } from '../engine/eom-report-build.js';

describe('buildEomReport (shared dashboard + share-link builder)', () => {
  it('builds recap + full markdown + FOB components from raw rows', () => {
    const r = buildEomReport({
      loc: '43701', name: 'Ponce de Leon', period: '2026-07',
      components: { sales: 281291, comp: 416, raw: 1158, cond: 4560, emp: 565, statv: 4297, unex: -17 },
      targets: { tFOBTarget: 0.0485, tCompWaste: 0.0015, tRawWaste: 0.008, tCondiment: 0.017, tEmpFood: 0.002, tStatLoss: 0.02, tUnex: 0 },
      onHand: [{ wrin: '1', cls: 'food', descr: 'Beef', on_hand_amt: 500, last_counted: null }],
      variance: [{ wrin: '2', cls: 'food', descr: 'Fries', dolDiff: -120 }],
    });
    expect(r.recapMd).toMatch(/EOM FOB 2026-07/);
    expect(r.fullMd).toMatch(/FOB Variance Analysis/);
    expect(r.fob).toBeTruthy();
    expect(Array.isArray(r.fob.components)).toBe(true);
    // The FOB one-liner reflects the passed target (3.90% actual vs 4.85% target → under).
    expect(r.recapMd).toMatch(/FOB 3\.90%/);
  });

  it('tolerates empty data (no throw, degrades gracefully)', () => {
    const r = buildEomReport({ loc: '1', name: 'X', period: '2026-07' });
    expect(typeof r.recapMd).toBe('string');
    expect(typeof r.fullMd).toBe('string');
    expect(r.fob).toBe(null);
  });
});
