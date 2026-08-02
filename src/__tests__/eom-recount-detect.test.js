import { describe, it, expect } from 'vitest';
import { storeDayWindows, itemRecounts } from '../engine/eom-recount-detect.js';

const ev = (dt, tm, dolVar, { src = 'MobileApp', qty = null, variance = null } = {}) =>
  ({ isCount: true, source: 'inventory', dt, tm, difference: dolVar, variance, qtyChange: qty, countSource: src, manager: 'Magali G' });

describe('storeDayWindows', () => {
  it('splits a day into a main count + a later recount pass by the store-wide gap', () => {
    // main count spread across the morning (<90min gaps), then a 6h gap, then an afternoon pass
    const items = [{ history: [ev('07/30/2026', '07:59', 1), ev('07/30/2026', '08:33', 1), ev('07/30/2026', '09:10', 1), ev('07/30/2026', '15:01', 1)] }];
    const w = storeDayWindows(items)['2026-07-30'];
    expect(w).toHaveLength(2);
    expect(w[0].n).toBe(3);         // morning main count
    expect(w[0].isMain).toBe(true);
    expect(w[1].n).toBe(1);         // afternoon recount pass
    expect(w[1].isMain).toBe(false);
  });
});

describe('itemRecounts', () => {
  it('ICE CREAM: morning walkthrough, afternoon recount (>4h), graded against officialVar', () => {
    // 07:59+08:33 = the walkthrough (main window); 15:01 = a re-verify 6.5h later. The recount RAISED the
    // on-hand 12 → 19 (found 7 units), which cuts the booked loss → HELPED (anchored to officialVar −100).
    const hist = [
      ev('07/30/2026', '07:59', -16, { qty: 2, variance: -2 }),   // variance-bearing → unit cost = $8
      ev('07/30/2026', '08:33', -96, { qty: 12 }),                // original binding (last main-window entry)
      ev('07/30/2026', '15:01', -152, { qty: 19 }),               // recount, binds the day
    ];
    const r = itemRecounts(hist, storeDayWindows([{ history: hist }]), { officialVar: -100 });
    const d = r.days[0];
    expect(d.original.tm).toBe('08:33');
    expect(d.recounts).toHaveLength(1);
    expect(d.recounts[0].tm).toBe('15:01');
    expect(d.recounts[0].confidence).toBe('likely');   // later-window signal
    expect(d.recounts[0].basis).toBe('anchored');
    expect(d.recounts[0].direction).toBe('helped');    // 12→19 units found = loss cut −156 → −100
    expect(r.nEomHelped).toBe(1);
  });

  it('SLOW WALKTHROUGH guard: two area entries 2h21m apart same day are NOT a recount (Lindsay COKE/BIB)', () => {
    // The two areas straddle the store gap (16:20, 18:41) — but 2h21m < the 4h recount threshold, so it is
    // one slow area-by-area count, not a recount. Binds at 18:41; no recount, no helped/hurt.
    const hist = [ev('07/30/2026', '16:20', 254, { qty: 7.5 }), ev('07/30/2026', '18:41', -106, { qty: 41.25 })];
    const r = itemRecounts(hist, storeDayWindows([{ history: hist }]), { officialVar: -106 });
    expect(r.nRecounts).toBe(0);
    expect(r.nEomRecounts).toBe(0);
    expect(r.days[0].binding.tm).toBe('18:41');   // last entry still binds
  });

  it('a back-office (non-MobileApp) entry is a CONFIRMED recount regardless of gap', () => {
    const hist = [
      ev('07/30/2026', '08:00', -300, { qty: 10, variance: -30 }),   // cost = $10
      ev('07/30/2026', '08:20', -300, { qty: 10 }),
      ev('07/30/2026', '08:40', -80, { src: 'BOS', qty: 14 }),        // back-office correction, 20min later
    ];
    const r = itemRecounts(hist, storeDayWindows([{ history: hist }]), { officialVar: -80 });
    const d = r.days[0];
    expect(d.recounts).toHaveLength(1);
    expect(d.recounts[0].countSource).toBe('BOS');
    expect(d.recounts[0].confidence).toBe('confirmed');
    expect(d.recounts[0].direction).toBe('helped');    // 10→14 units found = loss cut −120 → −80
  });

  it('direction-only when officialVar has not posted (no invented grade)', () => {
    const hist = [
      ev('07/30/2026', '08:00', -300, { qty: 20, variance: -30 }),
      ev('07/30/2026', '15:00', -80, { qty: 28 }),   // recount 7h later
    ];
    const r = itemRecounts(hist, storeDayWindows([{ history: hist }]));   // no officialVar
    const rec = r.days[0].recounts[0];
    expect(rec.basis).toBe('direction-only');
    expect(rec.direction).toBe('pending');
    expect(r.nEomHelped).toBe(0);   // not graded helped/hurt without the authoritative anchor
    expect(r.nEomHurt).toBe(0);
  });

  it('is PERIOD-SPECIFIC: only a recount on the FINAL (EOM) count day is graded as eom*', () => {
    const hist = [
      ev('07/02/2026', '08:00', -300), ev('07/02/2026', '15:00', -80),   // early-day recount (7h gap)
      ev('07/16/2026', '08:00', -50),
      ev('07/30/2026', '08:00', -40),                                     // EOM count day, single count
    ];
    const r = itemRecounts(hist, storeDayWindows([{ history: hist }]));
    expect(r.nRecounts).toBe(1);        // the early-day recount is still detected (informational)
    expect(r.eomDay).toBe('2026-07-30');
    expect(r.nEomRecounts).toBe(0);     // ...but the binding (EOM) day had no recount → nothing graded
  });

  it('grades a recount that lands ON the EOM count day', () => {
    const hist = [
      ev('07/16/2026', '08:00', -50),                                                  // earlier progression day
      ev('07/30/2026', '08:00', -300, { qty: 20, variance: -30 }),                      // EOM walkthrough (cost $10)
      ev('07/30/2026', '15:00', -80, { qty: 28 }),                                      // recount 7h later, binds
    ];
    const r = itemRecounts(hist, storeDayWindows([{ history: hist }]), { officialVar: -80 });
    expect(r.eomDay).toBe('2026-07-30');
    expect(r.nEomRecounts).toBe(1);
    expect(r.nEomHelped).toBe(1);       // 20→28 units found = loss cut −160 → −80
  });

  it('cross-day counts are NOT recounts (weekly cadence)', () => {
    const hist = [ev('07/02/2026', '08:00', -100), ev('07/09/2026', '08:00', -80), ev('07/16/2026', '08:00', -60)];
    const r = itemRecounts(hist, storeDayWindows([{ history: hist }]));
    expect(r.days).toHaveLength(3);                         // three separate count days
    expect(r.nRecounts).toBe(0);                            // none are recounts
  });
});
