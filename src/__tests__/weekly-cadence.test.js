import { describe, it, expect } from 'vitest';
import { analyzeCountCadence, itemVarianceWindows, weeklyExceptions } from '../engine/weekly-cadence.js';

// 8 Food + 2 Condiment = 10 items. Two "full weekly" days (all 10 counted) on 2026-07-13 and 07-20
// (both MONDAYS), plus a "spot" day 07-16 (Thu) where only 2 Food items were counted (2/8 = 25% → spot,
// not a full session). asOf 07-22.
function mkRaw() {
  const items = [];
  for (let i = 0; i < 8; i++) {
    const history = [
      { dt: '2026-07-13', tm: '10:00', isCount: true, difference: -5 },
      { dt: '2026-07-20', tm: '10:00', isCount: true, difference: -12 },
    ];
    if (i < 2) history.splice(1, 0, { dt: '2026-07-16', tm: '22:00', isCount: true, difference: -3 }); // spot: only f0,f1
    items.push({ wrin: 'f' + i, descr: 'Food ' + i, cls: 'Food', history });
  }
  for (let i = 0; i < 2; i++) items.push({ wrin: 'c' + i, descr: 'Cond ' + i, cls: 'Condiment', history: [
    { dt: '2026-07-13', tm: '10:00', isCount: true, difference: 0 },
    { dt: '2026-07-20', tm: '10:00', isCount: true, difference: -1 },
  ] });
  return items;
}

describe('analyzeCountCadence', () => {
  const c = analyzeCountCadence(mkRaw(), { asOf: new Date('2026-07-22T12:00:00') });
  it('separates full weekly sessions from daily spot counts', () => {
    expect(c.nWeekly).toBe(2);              // 07-13 and 07-20 (all 10 counted)
    expect(c.weeklySessions.map(s => s.day)).toEqual(['2026-07-13', '2026-07-20']);
    expect(c.spotSessions.map(s => s.day)).toContain('2026-07-16');   // only 2 Food items → spot
  });
  it('detects the weekly count weekday (Monday) + days since last full count', () => {
    expect(c.detectedWeekday).toBe(1);      // Monday
    expect(c.detectedWeekdayName).toBe('Mon');
    expect(c.lastWeekly).toBe('2026-07-20');
    expect(c.daysSinceWeekly).toBe(2);      // 07-22 − 07-20
  });
});

describe('itemVarianceWindows', () => {
  it('brackets the window where the variance moved most', () => {
    const w = itemVarianceWindows([
      { dt: '2026-07-01', isCount: true, difference: 0 },
      { dt: '2026-07-08', isCount: true, difference: -10 },   // −10 over this week
      { dt: '2026-07-15', isCount: true, difference: -120 },  // −110 over THIS week ← biggest
    ]);
    expect(w.points.length).toBe(3);
    expect(w.windows.length).toBe(2);
    expect(w.biggest.from).toBe('2026-07-08');
    expect(w.biggest.to).toBe('2026-07-15');
    expect(w.biggest.delta).toBe(-110);
  });
});

describe('weeklyExceptions', () => {
  it('flags overdue counts and off-day cadence vs the expected weekday', () => {
    const cadenceByLoc = {
      A: analyzeCountCadence(mkRaw(), { asOf: new Date('2026-07-22T12:00:00') }),   // Mon cadence, 2d ago → ok
      B: analyzeCountCadence(mkRaw(), { asOf: new Date('2026-07-30T12:00:00') }),   // 10d ago → overdue
    };
    // A expected Monday (1) → compliant; B expected Sunday (0) → off-day + overdue.
    const ex = weeklyExceptions(cadenceByLoc, { expectedWeekdayByLoc: { A: 1, B: 0 }, overdueDays: 8 });
    expect(ex.find(e => e.loc === 'A')).toBeUndefined();          // A is compliant
    const b = ex.find(e => e.loc === 'B');
    expect(b).toBeTruthy();
    expect(b.flags.some(f => /overdue/.test(f))).toBe(true);
    expect(b.flags.some(f => /expected Sun/.test(f))).toBe(true);
  });
});
