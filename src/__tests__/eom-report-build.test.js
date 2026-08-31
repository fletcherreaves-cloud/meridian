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

  // Dispatch #176: buildEomReport() received `targets` and used it for the narrative FOB line, but
  // never passed it into runDiagnosis()'s data — so the fob-components check's ctx.data.targets was
  // always {} and it never produced a structured Finding, for any store, ever. Called the same way
  // the real app (EOM share view) does — buildEomReport() end-to-end, not runDiagnosis() directly.
  it('dispatch #176: result.findings includes a fob-components Finding when a component is over its real target', () => {
    const r = buildEomReport({
      loc: '1', name: 'Tecumseh', period: '2026-07',
      // Raw Waste 1842/278785 = 0.66% vs 0.5% target → +0.16pp... too small; use a clearer overage.
      components: { sales: 278785, comp: 428, raw: 2800, cond: 5250, emp: 1068, statv: 3313, unex: 15 },
      targets: { tFOBTarget: 0.04, tCompWaste: 0.0015, tRawWaste: 0.005, tCondiment: 0.0185, tEmpFood: 0.004, tStatLoss: 0.011, tUnex: 0 },
    });
    const f = r.result.findings.find(x => x.checkId === 'fob-components' && x.data.component === 'rawWaste');
    expect(f).toBeTruthy(); // Raw Waste 2800/278785 = 1.00% vs 0.5% target → +0.50pp, over the 0.25pp band
    // The already-working narrative FOB driver line (fed by fobComponentDeltas, a different path)
    // must be unaffected by this fix — same component/target inputs, same rendered driver text.
    expect(r.fob.components.find(c => c.key === 'raw').deltaPp).toBeCloseTo(0.50, 1);
  });

  it('dispatch #176: no fob-components findings when every component is within target (matches the existing under-target scenario above)', () => {
    const r = buildEomReport({
      loc: '43701', name: 'Ponce de Leon', period: '2026-07',
      components: { sales: 281291, comp: 416, raw: 1158, cond: 4560, emp: 565, statv: 4297, unex: -17 },
      targets: { tFOBTarget: 0.0485, tCompWaste: 0.0015, tRawWaste: 0.008, tCondiment: 0.017, tEmpFood: 0.002, tStatLoss: 0.02, tUnex: 0 },
    });
    expect(r.result.findings.filter(f => f.checkId === 'fob-components')).toHaveLength(0);
    // Narrative FOB line still reads the same as before this fix (regression guard).
    expect(r.recapMd).toMatch(/FOB 3\.90%/);
  });

  // 2026-08-31 — Ada-Country Club (loc 6972) Fried Apple Pie [00076-126] reconciliation. Owner
  // reported the Share-view/MBI report still shows "counted early (last 2026-08-13)" for an item
  // QSRSoft's own UI now tags "(Deactivated)". Live service-role query confirmed our own qsr_onhand
  // row for this WRIN/period hasn't been touched since 2026-08-20T13:40:26Z (active still true in
  // OUR copy) while the store's freshest on-hand row is 2026-08-31T14:37:07Z -- an 11-day gap, the
  // exact droppedFromCurrentPull() shape v5.283 fixed for Durant. Root cause here: shapeOnHand()
  // (this file) was dropping `active`/`updatedAt` before calling diagnoseIncompleteCount(), so the
  // signal could never fire for the Share view even after v5.283's edge-function-side fix. The
  // in-app EOM Dashboard doesn't go through shapeOnHand() (it calls diagnoseIncompleteCount()
  // directly on the browser loader's rows), which is why this only showed up in the shared report.
  it('2026-08-31: shapeOnHand() carries active/updatedAt so droppedFromCurrentPull() fires for the Share view (real Ada numbers)', () => {
    const r = buildEomReport({
      loc: '6972', name: 'Ada-Country Club', period: '2026-08', asOf: new Date('2026-08-31T18:00:00Z'),
      onHand: [
        { wrin: '00076-126', cls: 'Food', descr: 'Fried Apple Pie', on_hand_amt: 30.58, last_counted: '2026-08-13', last_submitted: '2026-08-13', active: true, updated_at: '2026-08-20T13:40:26.723Z' },
        // Sibling item that kept refreshing today — sets the store's own freshest-pull anchor.
        { wrin: '99999-999', cls: 'Food', descr: 'Something Else', on_hand_amt: 10, last_counted: '2026-08-30', last_submitted: '2026-08-30', active: true, updated_at: '2026-08-31T14:37:07.117Z' },
      ],
    });
    const item = r.incomplete.uncounted.find(u => u.wrin === '00076-126');
    // Without the fix (shapeOnHand dropping active/updatedAt), this same input classifies 'early'
    // instead — verified directly against diagnoseIncompleteCount() with the pre-fix row shape.
    expect(item.state).toBe('stale');
    // Routed to the "verify & clear" framing, not "recount now" — the doNow action text is the
    // one place this reaches the rendered report at this fixture's size (the itemized
    // Obsolete/Discontinued table only renders once findings are non-trivial; state is the
    // ground truth diagnoseIncompleteCount() and every consumer — dashboard, digest, SAGE — reads).
    expect(r.fullMd).toMatch(/Verify & clear the 1 obsolete\/inactive Food\/Condiment item/);
    expect(r.fullMd).not.toMatch(/counted early|counted EARLY/i);
  });
});
