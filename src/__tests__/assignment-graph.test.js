// @ts-nocheck
// Dispatch #150 (Performance Review continuity, Phase 3a) — the reports-to assignment graph
// resolution engine. Per the dispatch's own verification bar: a synthetic multi-level graph
// matching the plan doc's own "mixed levels" DO example (AS with 3 stores, OM over 2 AS's, DO
// over 1 OM + 1 standalone AS), cycle detection, and "latest start ≤ date wins" across a real
// historical reassignment — same shape org-assignments.test.js already proves for whoRan().
//
// Store targets use NUMERIC-STRING codes throughout (matching real loc codes, e.g. "3708") —
// never bare letters. unpadLoc() (src/constants.js) normalizes every store target through
// `parseInt`, so a non-numeric placeholder like "A" would silently collapse to "NaN" and alias
// every letter-coded store onto the SAME key — a real trap this file's first draft hit and had
// to fix, not a hypothetical one.
import { describe, it, expect } from 'vitest';
import {
  currentHolderOfTarget, directTargetsOf, resolveScope, whoOversees, personOversees,
  AssignmentCycleError,
} from '../engine/assignment-graph.js';

// ── Fixture: the plan doc's own "mixed levels" example ─────────────────────────────────────
// AS1 -> stores 101, 102, 103 (3 stores)
// AS2 -> stores 104, 105      (a second AS, folded under OM1)
// OM1 -> AS1, AS2             (an OM over 2 AS's patches combined)
// AS3 -> stores 106, 107      (a standalone AS, NOT under any OM)
// DO1 -> OM1, AS3             (a DO whose own direct assignments MIX levels: one OM + one standalone AS)
function mixedLevelGraph() {
  return [
    { person: 'AS1', role: 'area_supervisor', target_type: 'store', target: '101', start: '' },
    { person: 'AS1', role: 'area_supervisor', target_type: 'store', target: '102', start: '' },
    { person: 'AS1', role: 'area_supervisor', target_type: 'store', target: '103', start: '' },
    { person: 'AS2', role: 'area_supervisor', target_type: 'store', target: '104', start: '' },
    { person: 'AS2', role: 'area_supervisor', target_type: 'store', target: '105', start: '' },
    { person: 'OM1', role: 'om', target_type: 'person', target: 'AS1', start: '' },
    { person: 'OM1', role: 'om', target_type: 'person', target: 'AS2', start: '' },
    { person: 'AS3', role: 'area_supervisor', target_type: 'store', target: '106', start: '' },
    { person: 'AS3', role: 'area_supervisor', target_type: 'store', target: '107', start: '' },
    { person: 'DO1', role: 'do', target_type: 'person', target: 'OM1', start: '' },
    { person: 'DO1', role: 'do', target_type: 'person', target: 'AS3', start: '' },
  ];
}

describe('resolveScope — recursive person -> full store scope', () => {
  const rows = mixedLevelGraph();

  it('a leaf AS resolves to exactly their own directly-assigned stores', () => {
    expect(resolveScope('AS1', '2026-08-01', rows).sort()).toEqual(['101', '102', '103']);
    expect(resolveScope('AS3', '2026-08-01', rows).sort()).toEqual(['106', '107']);
  });

  it('an OM resolves to the UNION of its AS\'s resolved scopes', () => {
    expect(resolveScope('OM1', '2026-08-01', rows).sort()).toEqual(['101', '102', '103', '104', '105']);
  });

  it('a DO whose direct assignments MIX levels (1 OM + 1 standalone AS) resolves to the full union across both branches — the plan doc\'s own worked example', () => {
    expect(resolveScope('DO1', '2026-08-01', rows).sort()).toEqual(['101', '102', '103', '104', '105', '106', '107']);
  });

  it('an unknown person resolves to an empty scope, not an error', () => {
    expect(resolveScope('Nobody', '2026-08-01', rows)).toEqual([]);
  });

  it('store targets are normalized through unpadLoc — a zero-padded loc still resolves', () => {
    const padded = [{ person: 'AS9', role: 'area_supervisor', target_type: 'store', target: '0003708', start: '' }];
    expect(resolveScope('AS9', '2026-08-01', padded)).toEqual(['3708']);
  });
});

describe('directTargetsOf / currentHolderOfTarget — "latest start ≤ date wins", generalized from whoRan()', () => {
  // A real historical reassignment: store 3708 held by GM 'Old' since always, reassigned to GM
  // 'New' starting 2026-07-22 — the exact org-assignments.test.js shape, one axis up.
  const rows = [
    { person: 'Old', role: 'gm', target_type: 'store', target: '3708', start: '' },
    { person: 'New', role: 'gm', target_type: 'store', target: '3708', start: '2026-07-22' },
  ];

  it('the day before the reassignment, the OLD holder is still current', () => {
    expect(currentHolderOfTarget('store', '3708', '2026-07-21', rows).person).toBe('Old');
    expect(resolveScope('Old', '2026-07-21', rows)).toEqual(['3708']);
    expect(resolveScope('New', '2026-07-21', rows)).toEqual([]); // not yet effective
  });

  it('ON the reassignment date, the NEW holder is current', () => {
    expect(currentHolderOfTarget('store', '3708', '2026-07-22', rows).person).toBe('New');
    expect(resolveScope('New', '2026-07-22', rows)).toEqual(['3708']);
    expect(resolveScope('Old', '2026-07-22', rows)).toEqual([]); // superseded, not merely "also"
  });

  it('well after the reassignment, the NEW holder is still current', () => {
    expect(currentHolderOfTarget('store', '3708', '2026-08-01', rows).person).toBe('New');
  });

  it('directTargetsOf returns [] for a person with no CURRENTLY-winning target, even if they have an older row for it', () => {
    expect(directTargetsOf('Old', '2026-08-01', rows)).toEqual([]);
  });

  it('a target with no row effective yet resolves to null / not-yet-assigned', () => {
    const future = [{ person: 'Future', role: 'gm', target_type: 'store', target: '9999', start: '2099-01-01' }];
    expect(currentHolderOfTarget('store', '9999', '2026-08-01', future)).toBeNull();
  });
});

describe('cycle detection — must fail loudly, never infinite-loop or silently truncate', () => {
  it('resolveScope throws on a direct 2-cycle (A reports to B who reports to A)', () => {
    const rows = [
      { person: 'A', role: 'om', target_type: 'person', target: 'B', start: '' },
      { person: 'B', role: 'om', target_type: 'person', target: 'A', start: '' },
    ];
    expect(() => resolveScope('A', '2026-08-01', rows)).toThrow(AssignmentCycleError);
    expect(() => resolveScope('A', '2026-08-01', rows)).toThrow(/cycle/i);
  });

  it('resolveScope throws on a longer cycle (A -> B -> C -> A)', () => {
    const rows = [
      { person: 'A', role: 'do', target_type: 'person', target: 'B', start: '' },
      { person: 'B', role: 'om', target_type: 'person', target: 'C', start: '' },
      { person: 'C', role: 'area_supervisor', target_type: 'person', target: 'A', start: '' },
    ];
    expect(() => resolveScope('A', '2026-08-01', rows)).toThrow(AssignmentCycleError);
  });

  it('a self-cycle (A reports to A) throws immediately', () => {
    const rows = [{ person: 'A', role: 'om', target_type: 'person', target: 'A', start: '' }];
    expect(() => resolveScope('A', '2026-08-01', rows)).toThrow(AssignmentCycleError);
  });

  it('does NOT throw for a legitimately deep but acyclic graph (the mixed-level fixture)', () => {
    expect(() => resolveScope('DO1', '2026-08-01', mixedLevelGraph())).not.toThrow();
  });

  it('whoOversees also throws on a cycle rather than looping forever', () => {
    const rows = [
      { person: 'A', role: 'om', target_type: 'person', target: 'B', start: '' },
      { person: 'B', role: 'om', target_type: 'person', target: 'A', start: '' },
      { person: 'A', role: 'om', target_type: 'store', target: '203', start: '' },
    ];
    expect(() => whoOversees('203', '2026-08-01', rows)).toThrow(AssignmentCycleError);
  });
});

describe('whoOversees — the inverse direction (store -> who is responsible for it, and above)', () => {
  const rows = mixedLevelGraph();

  it('walks the full chain up from a leaf store to the top', () => {
    const chain = whoOversees('104', '2026-08-01', rows).map(r => r.person);
    expect(chain).toEqual(['AS2', 'OM1', 'DO1']);
  });

  it('a standalone AS store\'s chain stops at the DO directly (no OM in between)', () => {
    const chain = whoOversees('106', '2026-08-01', rows).map(r => r.person);
    expect(chain).toEqual(['AS3', 'DO1']);
  });

  it('an unassigned store resolves to an empty chain', () => {
    expect(whoOversees('999999', '2026-08-01', rows)).toEqual([]);
  });

  it('unpads a zero-padded loc the same way resolveScope does', () => {
    const chain = whoOversees('0003708', '2026-08-01', [
      { person: 'AS1', role: 'area_supervisor', target_type: 'store', target: '3708', start: '' },
    ]).map(r => r.person);
    expect(chain).toEqual(['AS1']);
  });
});

// ── personOversees — the JS-side sibling of SQL's person_oversees_loc() (dispatch #151) ────────
describe('personOversees — client-side UI-gating wrapper around whoOversees()', () => {
  const rows = mixedLevelGraph();

  it('the store\'s own AS oversees it', () => {
    expect(personOversees('AS1', '101', '2026-08-01', rows)).toBe(true);
  });

  it('an OM oversees every store under its AS\'s (a rung further up the chain)', () => {
    expect(personOversees('OM1', '104', '2026-08-01', rows)).toBe(true);
    expect(personOversees('OM1', '101', '2026-08-01', rows)).toBe(true); // not just AS2's stores
  });

  it('a DO oversees stores reached through EITHER branch of a mixed-level assignment', () => {
    expect(personOversees('DO1', '104', '2026-08-01', rows)).toBe(true); // via OM1 -> AS2
    expect(personOversees('DO1', '106', '2026-08-01', rows)).toBe(true); // via standalone AS3
  });

  it('a person with no oversight relationship to the store returns false', () => {
    expect(personOversees('AS3', '101', '2026-08-01', rows)).toBe(false); // AS3 doesn't oversee AS1's stores
    expect(personOversees('AS1', '106', '2026-08-01', rows)).toBe(false);
  });

  it('an unknown/unmapped person returns false, not an error', () => {
    expect(personOversees('Nobody', '101', '2026-08-01', rows)).toBe(false);
  });

  it('empty/null person returns false without touching the graph', () => {
    expect(personOversees('', '101', '2026-08-01', rows)).toBe(false);
    expect(personOversees(null, '101', '2026-08-01', rows)).toBe(false);
  });

  it('an unassigned store returns false for anyone', () => {
    expect(personOversees('AS1', '999999', '2026-08-01', rows)).toBe(false);
  });

  it('returns false (not a throw) on a cyclic graph — diverges from whoOversees() itself, which throws', () => {
    const cyclic = [
      { person: 'A', role: 'om', target_type: 'person', target: 'B', start: '' },
      { person: 'B', role: 'om', target_type: 'person', target: 'A', start: '' },
      { person: 'A', role: 'om', target_type: 'store', target: '203', start: '' },
    ];
    expect(() => whoOversees('203', '2026-08-01', cyclic)).toThrow(AssignmentCycleError);
    expect(personOversees('C', '203', '2026-08-01', cyclic)).toBe(false);
  });

  it('respects "latest start ≤ date wins" the same as whoOversees()', () => {
    const reassign = [
      { person: 'Old', role: 'gm', target_type: 'store', target: '3708', start: '' },
      { person: 'New', role: 'gm', target_type: 'store', target: '3708', start: '2026-07-22' },
    ];
    expect(personOversees('Old', '3708', '2026-07-21', reassign)).toBe(true);
    expect(personOversees('New', '3708', '2026-07-21', reassign)).toBe(false);
    expect(personOversees('New', '3708', '2026-07-22', reassign)).toBe(true);
    expect(personOversees('Old', '3708', '2026-07-22', reassign)).toBe(false);
  });
});
