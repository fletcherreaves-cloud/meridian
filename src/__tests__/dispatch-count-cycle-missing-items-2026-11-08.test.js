// Task #126 follow-on (2026-11-08) — memory/plan-count-cycle-classification-2026-11-08.md's
// open Q3, resolved by the owner's own request ("I'm good with widening the log! That sounds
// like a great idea!!"): name WHICH items a near-miss session didn't get to, not just a
// percentage. Live path: detectSessions() already has per-WRIN qsr_onhand rows in hand, so
// this needs no schema change to work TODAY for the current period. Durable-log path
// (sessionsFromLog, src/lib/supabase.js's loadInvCountSessions) needs the new
// `missing_items` column (supabase/schema-inv-count-sessions-missing-items-2026-11-08.sql)
// and scripts/qsrsoft-onhand-pull.mjs's deriveSessionRows() to populate it going forward --
// covered here only via the shape contract (null/absent handled gracefully), since the
// pull script itself isn't part of this vitest suite.
import { describe, it, expect } from 'vitest';
import { detectSessions, sessionsFromLog } from '../engine/count-cycle.js';

const mk = (loc, cls, n, date, from = 0, descrPrefix) =>
  Array.from({ length: n }, (_, i) => ({
    loc, cls, wrin: `${cls}-${from + i}`, descr: descrPrefix ? `${descrPrefix} ${from + i}` : undefined,
    last_counted: date,
  }));

describe('task #126 follow-on — named missing items, live path (detectSessions)', () => {
  it('Holdenville 2026-10-30: lists the real 2 missing Food, 1 missing Condiment, 12 missing Paper wrins', () => {
    const rows = [
      ...mk('13201', 'Food', 118, '2026-10-30', 0, 'Food Item'), ...mk('13201', 'Food', 2, null, 118, 'Food Item'),
      ...mk('13201', 'Condiment', 31, '2026-10-30', 0, 'Cond Item'), ...mk('13201', 'Condiment', 1, null, 31, 'Cond Item'),
      ...mk('13201', 'Paper', 84, '2026-10-30', 0, 'Paper Item'), ...mk('13201', 'Paper', 12, null, 84, 'Paper Item'),
    ];
    const { sessions } = detectSessions(rows);
    const s = sessions['13201'][0];
    expect(s.missingItems.Food).toHaveLength(2);
    expect(s.missingItems.Food.map(it => it.wrin).sort()).toEqual(['Food-118', 'Food-119']);
    expect(s.missingItems.Food[0].descr).toMatch(/^Food Item /);
    expect(s.missingItems.Condiment).toHaveLength(1);
    expect(s.missingItems.Condiment[0].wrin).toBe('Condiment-31');
    expect(s.missingItems.Paper).toHaveLength(12);
  });

  it('a session that covers every active item in a class has no missing entry for it', () => {
    const rows = mk('X', 'Food', 10, '2026-06-10'); // 10/10, fully covered
    const { sessions } = detectSessions(rows);
    const s = sessions['X'][0];
    expect(s.missingItems).toBeNull();
  });

  it('missing items stay symmetric with class_total -- counted + missing === the active universe', () => {
    const rows = [...mk('Y', 'Food', 70, '2026-06-10'), ...mk('Y', 'Food', 30, null, 70)];
    const { sessions, classTotals } = detectSessions(rows);
    const s = sessions['Y'][0];
    expect(s.counts.Food + s.missingItems.Food.length).toBe(classTotals['Y'].Food);
  });
});

describe('task #126 follow-on — named missing items, durable-log path (sessionsFromLog)', () => {
  it('surfaces missingItems when the log row carries missing_items (post-migration rows)', () => {
    const logRows = [
      { loc: '13201', countDate: '2026-10-30', cls: 'Paper', itemsCounted: 84, classTotal: 96, covered: false,
        missingItems: [{ wrin: 'Paper-84', descr: 'Paper Item 84' }, { wrin: 'Paper-85', descr: 'Paper Item 85' }] },
    ];
    const { sessions } = sessionsFromLog(logRows);
    const s = sessions['13201'][0];
    expect(s.missingItems.Paper).toHaveLength(2);
    expect(s.missingItems.Paper[0].wrin).toBe('Paper-84');
  });

  it('is null, not an error, for a pre-migration log row with no missing_items at all', () => {
    const logRows = [
      { loc: 'Z', countDate: '2026-06-10', cls: 'Food', itemsCounted: 50, classTotal: 118, covered: false },
    ];
    const { sessions } = sessionsFromLog(logRows);
    const s = sessions['Z'][0];
    expect(s.missingItems).toBeNull();
  });
});
