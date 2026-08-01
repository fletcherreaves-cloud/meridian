import { describe, it, expect } from 'vitest';
import { storeDayWindows, itemRecounts } from '../engine/eom-recount-detect.js';

const ev = (dt, tm, dolVar, { src = 'MobileApp', qty = null } = {}) =>
  ({ isCount: true, source: 'inventory', dt, tm, difference: dolVar, qtyChange: qty, countSource: src, manager: 'Magali G' });

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
  it('ICE CREAM case: first two = original (one session), the later afternoon entry = a graded recount', () => {
    const hist = [ev('07/30/2026', '07:59', 518, { qty: 2 }), ev('07/30/2026', '08:33', -183, { qty: 12 }), ev('07/30/2026', '15:01', -211, { qty: 19 })];
    const windows = storeDayWindows([{ history: hist }]);
    const r = itemRecounts(hist, windows);
    expect(r.days).toHaveLength(1);
    const d = r.days[0];
    expect(d.original.tm).toBe('08:33');   // last morning entry binds the original count
    expect(d.recounts).toHaveLength(1);
    expect(d.recounts[0].tm).toBe('15:01');
    expect(d.recounts[0].confidence).toBe('likely');       // later-window signal
    // 08:33 var −183 → 15:01 var −211: |211| > |183| → moved AWAY from zero → hurt
    expect(d.recounts[0].direction).toBe('hurt');
    expect(r.nRecounts).toBe(1);
  });

  it('a back-office (non-MobileApp) entry is a CONFIRMED recount regardless of window', () => {
    const hist = [ev('07/30/2026', '08:00', -300, { qty: 10 }), ev('07/30/2026', '08:20', -300, { qty: 10 }), ev('07/30/2026', '08:40', -80, { src: 'BOS', qty: 14 })];
    const windows = storeDayWindows([{ history: hist }]);   // all same window (20min apart)
    const r = itemRecounts(hist, windows);
    const d = r.days[0];
    expect(d.recounts).toHaveLength(1);
    expect(d.recounts[0].countSource).toBe('BOS');
    expect(d.recounts[0].confidence).toBe('confirmed');
    expect(d.recounts[0].direction).toBe('helped');        // −300 → −80 = toward zero
  });

  it('is PERIOD-SPECIFIC: only a recount on the FINAL (EOM) count day is graded as eom*', () => {
    // A same-day recount on an EARLY count-day (07/02), then clean single counts on later days incl. the
    // EOM day (07/30). The early recount is informational; the EOM day has no recount → nEomRecounts 0.
    const hist = [
      ev('07/02/2026', '08:00', -300), ev('07/02/2026', '15:00', -80),   // early-day same-day recount
      ev('07/16/2026', '08:00', -50),
      ev('07/30/2026', '08:00', -40),                                     // EOM count day, single count
    ];
    const windows = storeDayWindows([{ history: hist }]);
    const r = itemRecounts(hist, windows);
    expect(r.nRecounts).toBe(1);        // the early-day recount is still detected (informational)
    expect(r.eomDay).toBe('2026-07-30');
    expect(r.nEomRecounts).toBe(0);     // ...but the binding (EOM) day had no recount → nothing graded
  });

  it('grades a recount that lands ON the EOM count day', () => {
    const hist = [
      ev('07/16/2026', '08:00', -50),                                    // earlier progression day
      ev('07/30/2026', '08:00', -300), ev('07/30/2026', '15:00', -80),   // EOM day walkthrough + afternoon recount
    ];
    const windows = storeDayWindows([{ history: hist }]);
    const r = itemRecounts(hist, windows);
    expect(r.eomDay).toBe('2026-07-30');
    expect(r.nEomRecounts).toBe(1);
    expect(r.nEomHelped).toBe(1);       // -300 -> -80 = toward zero
  });

  it('cross-day counts are NOT recounts (weekly cadence)', () => {
    const hist = [ev('07/02/2026', '08:00', -100), ev('07/09/2026', '08:00', -80), ev('07/16/2026', '08:00', -60)];
    const windows = storeDayWindows([{ history: hist }]);
    const r = itemRecounts(hist, windows);
    expect(r.days).toHaveLength(3);                         // three separate count days
    expect(r.nRecounts).toBe(0);                            // none are recounts
  });
});
