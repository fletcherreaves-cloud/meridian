import { describe, it, expect } from 'vitest';
import { ledgerBaselineDiff, storeEngagement } from '../engine/eom-ledger-baseline.js';

const item = (wrin, hist) => ({ wrin, descr: wrin, cls: 'food', history: hist });
const cnt = (dt, tm, dolVar, { variance = null } = {}) => ({ isCount: true, source: 'inventory', dt, tm, difference: dolVar, variance });

describe('ledgerBaselineDiff', () => {
  it('NO $0 GHOST: baseline reads the real count-complete variance, not a lock-time $0 (the Freeport bug)', () => {
    // The item was first counted on the count-complete day itself. A frozen snapshot taken earlier would
    // have recorded $0 → the count later "landing" reads as a fake helping move. The ledger baseline reads
    // the actual −$300 at count-completion → correctly flat, no phantom helped.
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300)])];
    const d = ledgerBaselineDiff(rawItems, { countCompleteDate: '2026-07-30' });
    expect(d.items[0].baseVar).toBe(-300);
    expect(d.items[0].curVar).toBe(-300);
    expect(d.items[0].verdict).toBe('flat');
    expect(d.nHelped).toBe(0);          // NOT 1 (would have been the snapshot ghost)
    expect(d.nHurt).toBe(0);
  });

  it('post-close recount that FOUND inventory grades helping + flags recounted', () => {
    // Counted −$300 at close (07/30), then re-counted 08/01 and found inventory → −$80 (loss cut).
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -80)])];
    const d = ledgerBaselineDiff(rawItems, { countCompleteDate: '2026-07-30' });
    expect(d.items[0].baseVar).toBe(-300);   // the 08/01 count is AFTER count-completion → excluded from baseline
    expect(d.items[0].curVar).toBe(-80);
    expect(d.items[0].verdict).toBe('helping');
    expect(d.items[0].recounted).toBe(true);
    expect(d.items[0].dMag).toBe(-220);      // |cur|−|base| = 80−300, − = toward zero
    expect(d.nHelped).toBe(1);
    expect(Math.round(d.helpedDol)).toBe(220);
  });

  it('a post-close recount that grew the loss grades hurting', () => {
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -360)])];
    const d = ledgerBaselineDiff(rawItems, { countCompleteDate: '2026-07-30' });
    expect(d.items[0].verdict).toBe('hurting');
    expect(d.nHurt).toBe(1);
    expect(Math.round(d.hurtDol)).toBe(60);
  });

  it('respects the $25 materiality floor — a small settle reads flat', () => {
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -312)])];
    const d = ledgerBaselineDiff(rawItems, { countCompleteDate: '2026-07-30' });
    expect(d.items[0].verdict).toBe('flat');   // $12 drift < $25
    expect(d.nHurt).toBe(0);
  });

  it('no post-close activity → nothing moved (all flat, none recounted)', () => {
    const rawItems = [
      item('a', [cnt('2026-07-28', '10:00', -300), cnt('2026-07-30', '11:00', -300)]),   // weekly + EOM, same value
      item('b', [cnt('2026-07-30', '10:00', 40)]),
    ];
    const d = ledgerBaselineDiff(rawItems, { countCompleteDate: '2026-07-30' });
    expect(d.nHelped).toBe(0);
    expect(d.nHurt).toBe(0);
    expect(d.nRecounted).toBe(0);
    expect(d.anyMove).toBe(false);
  });

  it('ranks the biggest movers first', () => {
    const rawItems = [
      item('small', [cnt('2026-07-30', '10:00', -100), cnt('2026-08-01', '09:00', -160)]),   // +60
      item('big', [cnt('2026-07-30', '10:00', -100), cnt('2026-08-01', '09:00', -400)]),      // +300
    ];
    const d = ledgerBaselineDiff(rawItems, { countCompleteDate: '2026-07-30' });
    expect(d.items[0].wrin).toBe('big');
    expect(d.items[1].wrin).toBe('small');
  });
});

describe('storeEngagement', () => {
  const diffFrom = (rawItems) => ledgerBaselineDiff(rawItems, { countCompleteDate: '2026-07-30' });

  it('recounted a flagged item and cut the loss → improving / good', () => {
    const d = diffFrom([item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -80)])]);
    const e = storeEngagement(d, { flaggedWrins: ['a'] });
    expect(e.verdict).toBe('improving');
    expect(e.read).toBe('good');
    expect(e.recountedFlagged).toBe(1);
  });

  it('flagged items left untouched → no-action / will (follow-through gap)', () => {
    const d = diffFrom([item('a', [cnt('2026-07-30', '10:00', -300)])]);   // never recounted
    const e = storeEngagement(d, { flaggedWrins: ['a'] });
    expect(e.verdict).toBe('no-action');
    expect(e.read).toBe('will');
  });

  it('recounted but made it worse → worsened / training (technique gap)', () => {
    const d = diffFrom([item('a', [cnt('2026-07-30', '10:00', -100), cnt('2026-08-01', '09:00', -400)])]);
    const e = storeEngagement(d, { flaggedWrins: ['a'] });
    expect(e.verdict).toBe('worsened');
    expect(e.read).toBe('training');
  });

  it('FOB direction can drive the verdict when item $ is a wash', () => {
    const d = diffFrom([item('a', [cnt('2026-07-30', '10:00', -50), cnt('2026-08-01', '09:00', -60)])]);   // $10 < floor
    const e = storeEngagement(d, { flaggedWrins: ['a'], fobDeltaPct: -0.001 });   // FOB improved
    expect(e.verdict).toBe('improving');
  });

  it('nothing flagged and no action → none (nothing to judge)', () => {
    const d = diffFrom([item('a', [cnt('2026-07-30', '10:00', -300)])]);
    const e = storeEngagement(d, { flaggedWrins: [] });
    expect(e.read).toBe('none');
  });
});
