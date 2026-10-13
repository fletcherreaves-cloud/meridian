// @ts-nocheck
// Mass-review notes 70 (2026-10-13) — owner uploaded the MCDOK Hourly Manager Review workbook
// (period 04/01/26-09/30/26) for comparison against this app's live Shift Manager Report. Live
// measurement against shift_manager_monthly found 249/691 rows with healthy_use_pct exactly 0
// despite real transactions/oepe/kvs, concentrated almost entirely in a subset of stores (18213
// 100%, 33109 97%, vs 5985/5183/10422/10915/20475/29760/6972 0%) — the signature of
// aggregate()'s healthyUsePct average being diluted by a shared denominator (_spW) that also
// accrues weight from records whose own healthyUsePct was null. Same bug class as #172 (cashOS)
// and this PR's own parseDailyGlimpse fix, one level up the pipeline (aggregation, not parsing).
import { describe, it, expect } from 'vitest';
import { aggregate } from '../../scripts/qsrsoft-shift-manager-pull.mjs';

const MONTH_WINDOW = { isRange: false, period: '2026-04' };

describe('qsrsoft-shift-manager-pull.mjs aggregate() — healthyUsePct/oepeNoPark own weight (dispatch 2026-10-13)', () => {
  it('a manager whose records are a MIX of null and real healthyUsePct no longer reads a diluted-toward-0 average', () => {
    const records = [
      { loc: '11657', geid: 1, name: 'A, Manager', transactions: 100, oepe: 150, kvs: 40, r2p: 90, healthyUsePct: null },
      { loc: '11657', geid: 1, name: 'A, Manager', transactions: 100, oepe: 150, kvs: 40, r2p: 90, healthyUsePct: 0.9 },
    ];
    const [row] = aggregate(records, MONTH_WINDOW);
    // Before the fix: healthy_use_pct = (0.9*100) / (100+100) = 0.45 -- a false halved reading.
    // After the fix: healthy_use_pct = (0.9*100) / 100 = 0.9 -- the real value from the one
    // record that actually reported it, undiluted by the record that didn't.
    expect(row.healthy_use_pct).toBeCloseTo(0.9, 10);
    // oepe/kvs/r2p are unaffected -- both records report them, so the shared _spW is correct
    // for those metrics either way.
    expect(row.oepe).toBeCloseTo(150, 10);
  });

  it('a manager whose EVERY record has healthyUsePct null now reads null, not a false 0', () => {
    const records = [
      { loc: '18213', geid: 2, name: 'B, Manager', transactions: 50, oepe: 120, kvs: 35, r2p: 80, healthyUsePct: null },
      { loc: '18213', geid: 2, name: 'B, Manager', transactions: 60, oepe: 130, kvs: 38, r2p: 85, healthyUsePct: null },
    ];
    const [row] = aggregate(records, MONTH_WINDOW);
    // Before the fix: _hu stays 0 while _spW accrues 110 from both records -> healthy_use_pct
    // = 0/110 = 0, a FALSE exact-zero (this is exactly the 18213/33109 live pattern measured).
    // After the fix: _huW stays 0 -> null, correctly "no data" rather than "0% healthy usage."
    expect(row.healthy_use_pct).toBeNull();
    expect(row.oepe).not.toBeNull();
  });

  it('oepeNoPark gets the same isolated-weight treatment as healthyUsePct', () => {
    const records = [
      { loc: '3708', geid: 3, name: 'C, Manager', transactions: 100, oepe: 140, kvs: 40, r2p: 90, oepeNoPark: null },
      { loc: '3708', geid: 3, name: 'C, Manager', transactions: 100, oepe: 140, kvs: 40, r2p: 90, oepeNoPark: 130 },
    ];
    const [row] = aggregate(records, MONTH_WINDOW);
    expect(row.oepe_no_park).toBeCloseTo(130, 10);
  });

  it('avgCheck\'s pre-existing isolated-weight pattern is unchanged (regression guard)', () => {
    const records = [
      { loc: '5985', geid: 4, name: 'D, Manager', transactions: 100, oepe: 140, kvs: 40, r2p: 90, avgCheck: null },
      { loc: '5985', geid: 4, name: 'D, Manager', transactions: 100, oepe: 140, kvs: 40, r2p: 90, avgCheck: 6.5 },
    ];
    const [row] = aggregate(records, MONTH_WINDOW);
    expect(row.avg_check).toBeCloseTo(6.5, 10);
  });

  it('a wholly-populated manager (every record has every field) is numerically unchanged by the fix', () => {
    const records = [
      { loc: '5183', geid: 5, name: 'E, Manager', transactions: 80, oepe: 145, oepeNoPark: 135, kvs: 42, r2p: 95, healthyUsePct: 0.95, avgCheck: 6.1 },
      { loc: '5183', geid: 5, name: 'E, Manager', transactions: 120, oepe: 150, oepeNoPark: 140, kvs: 45, r2p: 100, healthyUsePct: 0.92, avgCheck: 6.3 },
    ];
    const [row] = aggregate(records, MONTH_WINDOW);
    const wavg = (a, wa, b, wb) => (a * wa + b * wb) / (wa + wb);
    expect(row.healthy_use_pct).toBeCloseTo(wavg(0.95, 80, 0.92, 120), 10);
    expect(row.oepe_no_park).toBeCloseTo(wavg(135, 80, 140, 120), 10);
  });
});
