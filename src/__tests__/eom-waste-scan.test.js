import { describe, it, expect } from 'vitest';
import { scanWaste } from '../engine/eom-waste-scan.js';

describe('scanWaste', () => {
  it('flags a uniform/static waste value (same $ on many days = estimated)', () => {
    const waste = [1, 2, 3, 6, 7].map(d => ({ loc: '35064', dt: `2026-07-0${d}`, amount: 20, manager: 'Allen W' }));
    const { stores } = scanWaste(waste, { period: '2026-07' });
    const s = stores.find(x => x.loc === '35064');
    expect(s).toBeTruthy();
    expect(s.flags.some(f => f.kind === 'uniform' && f.nDays === 5)).toBe(true);
  });

  it('flags a high-$ session (manager × day outlier)', () => {
    const waste = [
      { loc: 's', dt: '2026-07-10', manager: 'A', amount: 30 },
      { loc: 's', dt: '2026-07-11', manager: 'B', amount: 28 },
      { loc: 's', dt: '2026-07-12', manager: 'C', amount: 25 },
      { loc: 's', dt: '2026-07-14', manager: 'D', amount: 200 },
      { loc: 's', dt: '2026-07-14', manager: 'D', amount: 150 },   // D's session $350
    ];
    const { stores } = scanWaste(waste, { period: '2026-07' });
    const sess = stores[0].flags.find(f => f.kind === 'session');
    expect(sess).toBeTruthy();
    expect(sess.manager).toBe('D');
  });

  it('quiet when nothing is anomalous', () => {
    const waste = ['A', 'B', 'C', 'D', 'E'].map((m, i) => ({ loc: 's', dt: `2026-07-1${i}`, manager: m, amount: 30 + i }));
    expect(scanWaste(waste, { period: '2026-07' }).nStores).toBe(0);
  });
});
