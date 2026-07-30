import { describe, it, expect } from 'vitest';
import {
  runDiagnosis, formatDiagnosisReport, applyManagerRisk, SEVERITY, DEFAULT_CHECKS,
} from '../engine/eom-diagnosis.js';

const d = (y, m, day) => { const x = new Date(y, m - 1, day); x.setHours(0, 0, 0, 0); return x; };

describe('runDiagnosis — editable check registry', () => {
  it('runs checks in order and marks data-less checks as pending', () => {
    const res = runDiagnosis({
      store: '0003708', storeName: 'Tishomingo', period: '2026-07', asOf: d(2026, 7, 30),
      data: {
        fob: { sales: 100000, compWaste: 1500, rawWaste: 400, condiments: 900, empMgrMeals: 300, statVariance: 2000, unexplained: 100 },
        targets: { compWaste: 0.01, statVariance: 0.0125 }, // 1% / 1.25%
      },
    });
    // fob-components ran; variance/raw/waste/transfers have no data → pending (no data)
    expect(res.ran.find(r => r.id === 'fob-components')).toBeTruthy();
    expect(res.pending.map(p => p.id)).toEqual(expect.arrayContaining(['variance-top5', 'raw-items-timing', 'waste-patterns', 'transfers']));
    // statVariance 2% vs 1.25% target → flagged
    expect(res.findings.some(f => f.data.component === 'statVariance')).toBe(true);
  });

  it('variance top-5 + ±$50 fire when variance data is present, sorted by severity', () => {
    const variance = [
      { wrin: 'a', descr: 'Beef', dolDiff: -420, cls: 'Food' },     // 1
      { wrin: 'e', descr: 'Mustard', dolDiff: -220, cls: 'Condiment' }, // 2
      { wrin: 'b', descr: 'Cheese', dolDiff: 120, cls: 'Food' },    // 3
      { wrin: 'c', descr: 'Fries', dolDiff: -90, cls: 'Food' },     // 4
      { wrin: 'g', descr: 'Onion', dolDiff: 70, cls: 'Food' },      // 5 (top5 boundary)
      { wrin: 'f', descr: 'Ketchup', dolDiff: 55, cls: 'Condiment' }, // 6 → ≥$50, outside top5
      { wrin: 'd', descr: 'Buns', dolDiff: 30, cls: 'Food' },       // below $50
    ];
    const res = runDiagnosis({ store: 's', period: '2026-07', data: { variance } });
    const top5 = res.findings.filter(f => f.checkId === 'variance-top5');
    expect(top5).toHaveLength(5);
    expect(res.findings[0].severity).toBe(SEVERITY.critical); // -420 beef
    // ketchup (55, 6th) surfaces under variance-50, not double-counted in top5
    const fifty = res.findings.filter(f => f.checkId === 'variance-50');
    expect(fifty.map(f => f.data.wrin)).toContain('f');
    expect(fifty.map(f => f.data.wrin)).not.toContain('d'); // 30 < 50
  });

  it('incomplete-count check surfaces uncounted value', () => {
    const onHand = [
      { wrin: '1', cls: 'Food', descr: 'Beef', onHandAmt: 800, lastCounted: null },
      { wrin: '2', cls: 'Food', descr: 'Fries', onHandAmt: 300, lastCounted: d(2026, 7, 30) },
    ];
    const res = runDiagnosis({ store: 's', period: '2026-07', asOf: d(2026, 7, 30), data: { onHand } });
    const f = res.findings.find(x => x.checkId === 'incomplete-count');
    expect(f).toBeTruthy();
    expect(f.dollars).toBe(800);
  });

  it('actionItems only include medium+ severity', () => {
    const res = runDiagnosis({ store: 's', period: '2026-07', data: { variance: [{ wrin: 'a', descr: 'Beef', dolDiff: -500, cls: 'Food' }] } });
    expect(res.actionItems.length).toBeGreaterThan(0);
    expect(res.actionItems[0]).toMatch(/CRITICAL|HIGH/);
  });

  it('report formats findings + pending checks', () => {
    const res = runDiagnosis({ store: 's', storeName: 'Ada', period: '2026-07', data: { variance: [{ wrin: 'a', descr: 'Beef', dolDiff: -500, cls: 'Food' }] } });
    const rpt = formatDiagnosisReport(res);
    expect(rpt).toMatch(/Ada/);
    expect(rpt).toMatch(/Beef/);
    expect(rpt).toMatch(/awaiting data/i);
  });

  it('Top-5 celebrates a clean sweep when there are no Food/Condiment opportunities', () => {
    // Only a Paper short — not a profit-driver class, so nothing lands in the Food/Condiment Top-5.
    const res = runDiagnosis({ store: 's', storeName: 'Ada', period: '2026-07', data: { variance: [{ wrin: 'p', descr: 'Napkins', dolDiff: -300, cls: 'Paper' }] } });
    const rpt = formatDiagnosisReport(res);
    expect(rpt).toMatch(/Clean sweep|win in itself/i);
  });

  it('Finish-the-count + Count-integrity frame Paper/Non-Product as NOT food-cost-consequential', () => {
    const incomplete = {
      uncountedCount: 2, byState: { never: { n: 2, value: 500 } },
      uncounted: [
        { wrin: 'hm26', descr: 'Happy Meal Toy HM26', cls: 'nonproduct', state: 'never', valueAtRisk: 400, onHandAmt: 400 },
        { wrin: 'beef', descr: 'Beef 10:1', cls: 'food', state: 'never', valueAtRisk: 100, onHandAmt: 100 },
      ],
    };
    const res = runDiagnosis({ store: 's', storeName: 'Ada', period: '2026-07', data: { variance: [{ wrin: 'fry', descr: 'Fries', dolDiff: -200, cls: 'Food' }] } });
    const rpt = formatDiagnosisReport(res, { incomplete });
    expect(rpt).toMatch(/Finish the count to 100%/);
    expect(rpt).toMatch(/not food-cost-consequential/i);   // paper/non-product framing
    expect(rpt).not.toMatch(/true blanks/i);                // old blanket wording gone
    expect(rpt).toMatch(/Food\/Condiment item.*food-cost-consequential/i); // FC = real recovery in Count integrity
  });
});

describe('newly-lit checks consume mapped eBOS data', () => {
  it('waste-patterns flags a disproportionate manager', () => {
    const waste = [
      { type: 'raw', amount: 400, manager: 'Big W', edited: false },
      { type: 'completed', amount: 50, manager: 'Small W', edited: false },
    ];
    const res = runDiagnosis({ store: 's', period: '2026-07', data: { waste } });
    const f = res.findings.find(x => x.checkId === 'waste-patterns');
    expect(f).toBeTruthy();
    expect(f.data.manager).toBe('Big W');
  });

  it('transfers flags an unapproved transfer', () => {
    const transfers = [
      { id: 9, type: 'Out', trans_nsn: 6972, store_busn_dt: '07/20/2026', status: 'rejected', total_amt: 30, header_total_amt: 30, invty_class_cd: 'F' },
    ];
    const res = runDiagnosis({ store: 's', period: '2026-07', data: { transfers } });
    const f = res.findings.find(x => x.checkId === 'transfers');
    expect(f).toBeTruthy();
    expect(f.data.status).toBe('rejected');
  });

  it('raw-items-timing attributes a variance to its count date and judges recount value', () => {
    const rawItems = [{
      wrin: '00005-086', descr: 'BEEF',
      counts: [{ dt: '2026-07-05', difference: -900, variance: -2000, manager: 'Cinthya a', isCount: true }],
    }];
    const res = runDiagnosis({ store: 's', period: '2026-07', data: { rawItems } });
    const f = res.findings.find(x => x.checkId === 'raw-items-timing');
    expect(f).toBeTruthy();
    expect(f.data.late).toBe(false); // 07-05 is early → recount won't recover
    expect(f.detail).toMatch(/won't recover/i);
  });

  it('uom-sanity flags a variance that is a clean whole-case multiple (verify entry)', () => {
    const data = {
      variance: [
        { wrin: 'w1', descr: 'QP Meat', cls: 'Food', variance: -897, dolDiff: -1200 }, // 897/300 ≈ 2.99 → 3 cases
        { wrin: 'w2', descr: 'Cheese', cls: 'Food', variance: -47, dolDiff: -80 },      // 47/12 = 3.9 → not clean
      ],
      rawItems: [
        { wrin: 'w1', caseSz: 300 },
        { wrin: 'w2', caseSz: 12 },
      ],
    };
    const res = runDiagnosis({ store: 's', period: '2026-07', data });
    const flags = res.findings.filter(f => f.checkId === 'uom-sanity');
    expect(flags.map(f => f.data.wrin)).toEqual(['w1']); // only the clean case-multiple
    expect(flags[0].data.cases).toBe(3);
    expect(flags[0].severity).toBe(SEVERITY.info); // a verify nudge, not a hard claim
    expect(flags[0].detail).toMatch(/case-vs-each/i);
  });

  it('count-manipulation flags >4 same-day counts + the negate-the-variance tell', () => {
    const rawItems = [{
      wrin: 'w1', descr: 'Beef', counts: [
        { dt: '2026-07-29T08:00:00', difference: -180, isCount: true },
        { dt: '2026-07-29T08:30:00', difference: -175, isCount: true },
        { dt: '2026-07-29T09:00:00', difference: -170, isCount: true },
        { dt: '2026-07-29T09:30:00', difference: -160, isCount: true },
        { dt: '2026-07-29T10:00:00', difference: -20, isCount: true },   // 5th entry walks -180 → -20
      ],
    }];
    const f = runDiagnosis({ store: 's', period: '2026-07', data: { rawItems } }).findings.find(x => x.checkId === 'count-manipulation');
    expect(f).toBeTruthy();
    expect(f.data.nCounts).toBe(5);
    expect(f.data.negated).toBe(true);
    expect(f.detail).toMatch(/negate/i);
  });

  it('count-manipulation does NOT flag legit travel-path counting (2-4 entries)', () => {
    const rawItems = [{ wrin: 'w1', descr: 'Beef', counts: [
      { dt: '2026-07-29T08:00:00', difference: -50, isCount: true },
      { dt: '2026-07-29T08:20:00', difference: -40, isCount: true },
      { dt: '2026-07-29T08:40:00', difference: -30, isCount: true },
    ] }];
    const res = runDiagnosis({ store: 's', period: '2026-07', data: { rawItems } });
    expect(res.findings.some(x => x.checkId === 'count-manipulation')).toBe(false);
  });

  it('waste-inflation flags a count-window spike vs the daily median', () => {
    const waste = [];
    for (const d of ['01','02','03','04','05','06','07','08','09','10']) waste.push({ dt: `2026-07-${d}`, amount: 20 });
    waste.push({ dt: '2026-07-30', amount: 400 }); // EOM day, 20× the median
    const f = runDiagnosis({ store: 's', period: '2026-07', data: { waste } }).findings.find(x => x.checkId === 'waste-inflation' && x.data.day === '2026-07-30');
    expect(f).toBeTruthy();
    expect(f.data.nearEOM).toBe(true);
    expect(f.severity).toBe(SEVERITY.high);
  });

  it('waste-inflation flags a repeated-static nightly value', () => {
    const waste = ['10','11','12','13','14','15'].map(d => ({ dt: `2026-07-${d}`, amount: 12.5 }));
    const f = runDiagnosis({ store: 's', period: '2026-07', data: { waste } }).findings.find(x => x.checkId === 'waste-inflation' && x.data.amount === 12.5);
    expect(f).toBeTruthy();
    expect(f.data.nDays).toBe(6);
    expect(f.detail).toMatch(/static|copy-paste|guessed/i);
  });

  it('waste-inflation stays silent on a normal, varied waste log', () => {
    const waste = ['10','11','12','13','14','15','16'].map((d, i) => ({ dt: `2026-07-${d}`, amount: 18 + i }));
    expect(runDiagnosis({ store: 's', period: '2026-07', data: { waste } }).findings.some(x => x.checkId === 'waste-inflation')).toBe(false);
  });

  it('unrealistic-over flags a large fries OVER as HIGH', () => {
    const variance = [{ wrin: 'w1', descr: 'World Famous Fries', dolDiff: 120 }];
    const f = runDiagnosis({ store: 's', period: '2026-07', data: { variance } }).findings.find(x => x.checkId === 'unrealistic-over');
    expect(f).toBeTruthy();
    expect(f.data.isFries).toBe(true);
    expect(f.severity).toBe(SEVERITY.high);
  });

  it('unrealistic-over ignores shorts (negative dolDiff) and small gains', () => {
    const variance = [
      { wrin: 'w1', descr: 'Beef Patty', dolDiff: -300 }, // short → not this check
      { wrin: 'w2', descr: 'Ketchup', dolDiff: 20 },       // small gain → under threshold
    ];
    expect(runDiagnosis({ store: 's', period: '2026-07', data: { variance } }).findings.some(x => x.checkId === 'unrealistic-over')).toBe(false);
  });

  it('transfers flags an EOM-count-window transfer as a phantom-transfer risk', () => {
    const transfers = [
      { id: 'A', dir: 'In', status: 'approved', dt: '2026-07-30', lineAmt: 200, transferTotal: 200, counterpartyNsn: '3708', cls: 'Food' }, // inside count window
      { id: 'B', dir: 'Out', status: 'approved', dt: '2026-07-05', lineAmt: 300, transferTotal: 300, counterpartyNsn: '3709', cls: 'Food' }, // mid-month
    ];
    const res = runDiagnosis({ store: 's', period: '2026-07', data: { transfers } }).findings.filter(x => x.checkId === 'transfers');
    const A = res.find(f => f.data.transferId === 'A'), B = res.find(f => f.data.transferId === 'B');
    expect(A.data.boundary).toBe(true);
    expect(A.severity).toBe(SEVERITY.medium);
    expect(A.detail).toMatch(/phantom-transfer/i);
    expect(B.data.boundary).toBe(false);
  });

  it('negative-onhand flags an impossible below-zero balance as HIGH', () => {
    const onHand = [{ wrin: 'w1', descr: 'Big Mac Sauce', totalUnits: -6, onHandAmt: -48 }];
    const f = runDiagnosis({ store: 's', period: '2026-07', data: { onHand } }).findings.find(x => x.checkId === 'negative-onhand');
    expect(f).toBeTruthy();
    expect(f.severity).toBe(SEVERITY.high);
    expect(f.data.totalUnits).toBe(-6);
  });

  it('negative-onhand ignores normal positive balances', () => {
    const onHand = [{ wrin: 'w1', descr: 'Fries', totalUnits: 40, onHandAmt: 320 }];
    expect(runDiagnosis({ store: 's', period: '2026-07', data: { onHand } }).findings.some(x => x.checkId === 'negative-onhand')).toBe(false);
  });

  it('negative-usage flags an impossible below-zero usage as HIGH', () => {
    const variance = [{ wrin: 'w1', descr: 'Sweetener', actualUsage: -42, dolDiff: 0 }];
    const f = runDiagnosis({ store: 's', period: '2026-07', data: { variance } }).findings.find(x => x.checkId === 'negative-usage');
    expect(f).toBeTruthy();
    expect(f.severity).toBe(SEVERITY.high);
    expect(f.data.actualUsage).toBe(-42);
  });

  it('negative-usage ignores normal positive/zero usage', () => {
    const variance = [{ wrin: 'w1', descr: 'Beef', actualUsage: 500, dolDiff: -300 }, { wrin: 'w2', descr: 'Salt', actualUsage: 0 }];
    expect(runDiagnosis({ store: 's', period: '2026-07', data: { variance } }).findings.some(x => x.checkId === 'negative-usage')).toBe(false);
  });

  it('uom-sanity stays silent when no case sizes are available', () => {
    const res = runDiagnosis({ store: 's', period: '2026-07', data: { variance: [{ wrin: 'w1', variance: -900, dolDiff: -1200 }] } });
    expect(res.findings.some(f => f.checkId === 'uom-sanity')).toBe(false);
  });
});

describe('applyManagerRisk overlay', () => {
  it('bumps severity on flagged-manager findings', () => {
    const findings = [{ checkId: 'waste-patterns', severity: SEVERITY.medium, severityWord: 'medium', dollars: 0, links: [], data: { manager: 'J. Doe' } }];
    applyManagerRisk(findings, { 'J. Doe': 0.8 });
    expect(findings[0].severity).toBe(SEVERITY.high);
    expect(findings[0].links.some(l => l.type === 'manager-risk')).toBe(true);
  });
});

describe('registry is editable data', () => {
  it('DEFAULT_CHECKS is an ordered, mutable config array', () => {
    expect(Array.isArray(DEFAULT_CHECKS)).toBe(true);
    expect(DEFAULT_CHECKS.every(c => 'id' in c && 'order' in c && 'enabled' in c)).toBe(true);
  });
});

describe('editable-flow config (checksConfig / applyChecksConfig)', () => {
  it('checksConfig exposes tunable shape without run functions', async () => {
    const { checksConfig } = await import('../engine/eom-diagnosis.js');
    const cfg = checksConfig();
    expect(cfg.every(c => 'id' in c && 'order' in c && 'enabled' in c && 'params' in c)).toBe(true);
    expect(cfg.some(c => 'run' in c)).toBe(false);
  });
  it('applyChecksConfig merges overrides (enabled/order/params) and preserves run()', async () => {
    const { applyChecksConfig } = await import('../engine/eom-diagnosis.js');
    const merged = applyChecksConfig([
      { id: 'variance-50', enabled: false, order: 5, params: { threshold: 75 } },
    ]);
    const v50 = merged.find(c => c.id === 'variance-50');
    expect(v50.enabled).toBe(false);
    expect(v50.order).toBe(5);
    expect(v50.params.threshold).toBe(75);
    expect(typeof v50.run).toBe('function'); // run preserved
    // a disabled check is skipped by runDiagnosis
    const res = runDiagnosis({ store: 's', period: '2026-07', checks: merged,
      data: { variance: [{ wrin: 'z', descr: 'Z', dolDiff: 60, cls: 'Food' }] } });
    expect(res.findings.some(f => f.checkId === 'variance-50')).toBe(false);
  });
});
