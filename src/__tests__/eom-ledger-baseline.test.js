import { describe, it, expect } from 'vitest';
import { ledgerBaselineDiff, storeEngagement, ledgerScopeDiff, recountVerdictText, formatRecountReport } from '../engine/eom-ledger-baseline.js';

const item = (wrin, hist) => ({ wrin, descr: wrin, cls: 'food', history: hist });
const cnt = (dt, tm, dolVar, { variance = null } = {}) => ({ isCount: true, source: 'inventory', dt, tm, difference: dolVar, variance });

describe('ledgerBaselineDiff', () => {
  it('NO $0 GHOST: baseline reads the real count-complete variance, not a lock-time $0 (the Freeport bug)', () => {
    // The item was first counted on the count-complete day itself. A frozen snapshot taken earlier would
    // have recorded $0 → the count later "landing" reads as a fake helping move. The ledger baseline reads
    // the actual −$300 at count-completion → correctly flat, no phantom helped.
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300)])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
    expect(d.items[0].baseVar).toBe(-300);
    expect(d.items[0].curVar).toBe(-300);
    expect(d.items[0].verdict).toBe('flat');
    expect(d.nHelped).toBe(0);          // NOT 1 (would have been the snapshot ghost)
    expect(d.nHurt).toBe(0);
  });

  it('post-close recount that FOUND inventory grades helping + flags recounted', () => {
    // Counted −$300 at close (07/30), then re-counted 08/01 and found inventory → −$80 (loss cut).
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -80)])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
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
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
    expect(d.items[0].verdict).toBe('hurting');
    expect(d.nHurt).toBe(1);
    expect(Math.round(d.hurtDol)).toBe(60);
  });

  it('respects the $25 materiality floor — a small settle reads flat', () => {
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -312)])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
    expect(d.items[0].verdict).toBe('flat');   // $12 drift < $25
    expect(d.nHurt).toBe(0);
  });

  it('no post-close activity → nothing moved (all flat, none recounted)', () => {
    const rawItems = [
      item('a', [cnt('2026-07-28', '10:00', -300), cnt('2026-07-30', '11:00', -300)]),   // weekly + EOM, same value
      item('b', [cnt('2026-07-30', '10:00', 40)]),
    ];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
    expect(d.nHelped).toBe(0);
    expect(d.nHurt).toBe(0);
    expect(d.nRecounted).toBe(0);
    expect(d.anyMove).toBe(false);
  });

  it('CLOSE WINDOW: session count is the baseline; weekly counts BEFORE the window are excluded', () => {
    // Weekly progression (07/09, 07/16, 07/23) then the EOM session 07/30, recounted 07/31 toward zero.
    const rawItems = [item('a', [
      cnt('2026-07-09', '10:00', 200), cnt('2026-07-16', '10:00', 150), cnt('2026-07-23', '10:00', 129),
      cnt('2026-07-30', '15:00', 129),   // session count (first in the close window)
      cnt('2026-07-31', '09:00', 22),    // recount before EOD → helped
    ])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-29' });
    expect(d.items[0].baseVar).toBe(129);        // session, NOT the 07/09 weekly count
    expect(d.items[0].curVar).toBe(22);
    expect(d.items[0].baseCounted).toBe('2026-07-30');
    expect(d.items[0].curCounted).toBe('2026-07-31');
    expect(d.items[0].verdict).toBe('helping');
    expect(d.items[0].recounted).toBe(true);
    expect(d.nRecounted).toBe(1);
  });

  it('CLOSE WINDOW: a single late count in the window is NOT a recount (Lindsay McCrispy case)', () => {
    // Counted weekly, then once on 07/31 — never in the session → one window count → flat, not recounted.
    const rawItems = [item('a', [cnt('2026-07-23', '10:00', 159), cnt('2026-07-31', '10:00', 159)])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-29' });
    expect(d.items[0].recounted).toBe(false);
    expect(d.items[0].verdict).toBe('flat');
  });

  it('CLOSE WINDOW: grades MULTIPLE recounts as a chain (owner: multiple recounts can happen)', () => {
    const rawItems = [item('a', [cnt('2026-07-29', '10:00', 300), cnt('2026-07-30', '10:00', 120), cnt('2026-07-31', '10:00', 20)])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-29' });
    expect(d.items[0].nRecounts).toBe(2);          // two recounts after the session
    expect(d.items[0].nRecHelped).toBe(2);         // 300→120 and 120→20 both toward zero
    expect(d.items[0].baseVar).toBe(300);
    expect(d.items[0].curVar).toBe(20);
  });

  it('issue #141: each recount carries its own qty (unitVar), not just the dollar delta', () => {
    // Session counted 40 units short; recount found 10 more units (30 short); final recount found
    // the rest (0 short). The per-submission QTY must be readable off each recounts[] entry, matching
    // baseQtyVar/curQtyVar's own field name (unitVar) rather than being dropped on the floor.
    const rawItems = [item('a', [
      cnt('2026-07-29', '10:00', 300, { variance: -40 }),
      cnt('2026-07-30', '10:00', 120, { variance: -30 }),
      cnt('2026-07-31', '10:00', 20, { variance: 0 }),
    ])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-29' });
    const [item0] = d.items;
    expect(item0.baseQtyVar).toBe(-40);   // session — already worked before this fix
    expect(item0.curQtyVar).toBe(0);      // final — already worked before this fix
    expect(item0.recounts).toHaveLength(2);
    expect(item0.recounts[0].unitVar).toBe(-30);   // the first recount's own qty
    expect(item0.recounts[1].unitVar).toBe(0);     // the second recount's own qty
  });

  it('McNuggets #32525 real numbers: two area entries in one session NET, not just the raw last entry (2026-08-31 fix)', () => {
    // Session count area-by-area: 08:39:45 (-$1,941.05) then 09:01:20 (+$1,988.18), 21min apart, same
    // day — a normal two-area build-up. baseVar/curVar must read the net (~+$47), not the raw final
    // entry's own -$1,988.18 (which read as a real -$1,988 swing before this fix — the owner-reported
    // live example).
    const rawItems = [item('00407-958', [
      cnt('2026-08-29', '08:39:45', -1941.05, { variance: -21088 }),
      cnt('2026-08-29', '09:01:20', 1988.18, { variance: 21600 }),
    ])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-08-29' });
    expect(d.items[0].baseVar).toBeCloseTo(47.13, 2);
    expect(d.items[0].curVar).toBeCloseTo(47.13, 2);
    expect(d.items[0].baseQtyVar).toBe(512);
    expect(d.items[0].recounted).toBe(false);   // one session day, not a cross-day recount
    expect(d.items[0].verdict).toBe('flat');
  });

  it('ranks the biggest movers first', () => {
    const rawItems = [
      item('small', [cnt('2026-07-30', '10:00', -100), cnt('2026-08-01', '09:00', -160)]),   // +60
      item('big', [cnt('2026-07-30', '10:00', -100), cnt('2026-08-01', '09:00', -400)]),      // +300
    ];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
    expect(d.items[0].wrin).toBe('big');
    expect(d.items[1].wrin).toBe('small');
  });
});

describe('recountVerdictText (dispatch #227 — Recount-Impact report)', () => {
  it('helping + undercount at session (baseVar<0) → "corrected a $X undercount"', () => {
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -80)])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
    expect(recountVerdictText(d.items[0])).toBe('Helped: corrected a $220 undercount.');
  });

  it('helping + overcount at session (baseVar>=0) → "corrected a $X overcount"', () => {
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', 300), cnt('2026-08-01', '09:00', 80)])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
    expect(recountVerdictText(d.items[0])).toBe('Helped: corrected a $220 overcount.');
  });

  it('hurting → plain "moved further from expected usage" wording, not just a raw dollar direction', () => {
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -360)])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
    expect(recountVerdictText(d.items[0])).toBe('Hurt: recount moved this further from expected usage (variance grew $60).');
  });

  it('flat → material-change-free wording (within the $25 floor)', () => {
    const rawItems = [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -312)])];
    const d = ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });
    expect(recountVerdictText(d.items[0])).toMatch(/No material change/);
  });

  it('unknown/missing item → safe fallback, never throws', () => {
    expect(recountVerdictText(null)).toBe('Recount data incomplete for this item.');
    expect(recountVerdictText({})).toBe('Recount data incomplete for this item.');
  });
});

describe('storeEngagement', () => {
  const diffFrom = (rawItems) => ledgerBaselineDiff(rawItems, { closeWindowStart: '2026-07-30' });

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

describe('ledgerScopeDiff', () => {
  it('rolls per-store engagement + ranks worst-engagement first', () => {
    const rawByLoc = {
      '18213': [item('a', [cnt('2026-07-30', '10:00', -300)])],                                  // no recount → no-action
      '6972': [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -80)])],   // recount helped → improving
    };
    const perLoc = {
      '18213': { name: 'Lindsay', closeWindowStart: '2026-07-30', statVar: { a: -300 } },
      '6972': { name: 'Ada', closeWindowStart: '2026-07-30', statVar: { a: -80 } },
    };
    const scope = ledgerScopeDiff(rawByLoc, perLoc);
    expect(scope.nStores).toBe(2);
    expect(scope.improved).toBe(1);
    expect(scope.noAction).toBe(1);
    const ada = scope.stores.find(s => s.name === 'Ada');
    expect(ada.engagement.verdict).toBe('improving');
    expect(ada.nRecounted).toBe(1);
  });
});

// dispatch-226.md Task 4 (optional) -- "Copy report" markdown export, a pure function of the SAME
// ledgerScopeDiff() output the Change Monitor panel and SAGE's query_eom_recount_impact tool both
// already compute, so it can't disagree with either surface.
describe('formatRecountReport', () => {
  it('names the district totals, honesty caveat, and per-store table -- not just item dumps', () => {
    const rawByLoc = {
      '18213': [item('a', [cnt('2026-07-30', '10:00', -300)])],
      '6972': [item('a', [cnt('2026-07-30', '10:00', -300), cnt('2026-08-01', '09:00', -80)])],
    };
    const perLoc = {
      '18213': { name: 'Lindsay', closeWindowStart: '2026-07-30' },
      '6972': { name: 'Ada', closeWindowStart: '2026-07-30' },
    };
    const scope = ledgerScopeDiff(rawByLoc, perLoc);
    const md = formatRecountReport(scope, { period: '2026-07' });
    expect(md).toMatch(/2026-07/);
    expect(md).toMatch(/1 of 2 stores improved/);
    expect(md).toMatch(/total food cost %/i);         // the FOB-vs-total-food-cost honesty caveat travels with the report
    expect(md).toMatch(/not a between-store comparison/i);
    expect(md).toMatch(/\| Ada \|/);
    expect(md).toMatch(/\| Lindsay \|/);
    expect(md).toMatch(/Biggest movers/);
  });

  it('returns an empty string for a missing/malformed diff rather than throwing', () => {
    expect(formatRecountReport(null)).toBe('');
    expect(formatRecountReport({})).toBe('');
  });
});
