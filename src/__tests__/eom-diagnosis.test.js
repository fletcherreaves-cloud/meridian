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
    // fob-components ran; variance/raw/waste/transfers pending (no data)
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
