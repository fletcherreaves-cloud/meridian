// @ts-nocheck
// Curated Home Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §2, task #92) -- pure
// engine logic: role -> altitude mapping, and the store/patch/district item builders. Fixtures
// mirror computeMorningBrief()'s real output shape (src/features/morning-brief.js) directly
// rather than importing the full engine, so these tests isolate the role-voice transform itself.
import { describe, it, expect } from 'vitest';
import { altitudeForRole, buildCuratedHomeItems, shouldDefaultToCuratedHome } from '../engine/curated-home.js';

function flag(id, over) {
  return { id, name: 'Cash Integrity Risk', icon: '💰', category: 'controls', severity: 'AMBER',
    headline: `${id} headline`, detail: `${id} generic detail`, action: `${id} generic action`, ...over };
}
function store(loc, name, hasData, flags) {
  return { loc, name, hasData, flags: flags || [] };
}

describe('altitudeForRole', () => {
  it('maps every real DEFAULT_ROLES id to its documented altitude', () => {
    expect(altitudeForRole('gm')).toBe('store');
    expect(altitudeForRole('sm_am_dm')).toBe('store');
    expect(altitudeForRole('manager')).toBe('store');
    expect(altitudeForRole('area_supervisor')).toBe('patch');
    expect(altitudeForRole('om')).toBe('patch');
    expect(altitudeForRole('do')).toBe('patch');
    expect(altitudeForRole('vp')).toBe('district');
    expect(altitudeForRole('owner')).toBe('district');
    expect(altitudeForRole('admin')).toBe('district');
  });
  it('fails toward the most tactical framing for an unrecognized role id', () => {
    expect(altitudeForRole('not_a_real_role')).toBe('store');
    expect(altitudeForRole(undefined)).toBe('store');
  });
});

describe('buildCuratedHomeItems — store altitude', () => {
  it('emits one item per flag, verbatim, for a GM (own store only)', () => {
    const brief = {
      stores: [
        store('3708', 'Ardmore-Broadway', true, [flag('DRAWER_OPENS', { severity: 'RED', headline: '19 drawer opens' })]),
        store('5183', 'Chickasha', false, []), // no data -- must never appear
      ],
      summary: { red: 1, amber: 0, green: 0, noData: 1, totalFlags: 1 },
    };
    const { altitude, items } = buildCuratedHomeItems(brief, 'gm');
    expect(altitude).toBe('store');
    expect(items).toHaveLength(1);
    expect(items[0].headline).toBe('19 drawer opens'); // reused VERBATIM, never resynthesized
    expect(items[0].storesAffected).toEqual(['Ardmore-Broadway']);
    expect(items[0].scope).toBe('store');
  });
  it('sorts RED above AMBER', () => {
    const brief = {
      stores: [store('3708', 'A', true, [flag('X', { severity: 'AMBER' }), flag('Y', { severity: 'RED' })])],
      summary: {},
    };
    const { items } = buildCuratedHomeItems(brief, 'manager');
    expect(items.map(i => i.id)).toEqual(['3708:Y', '3708:X']);
  });
});

describe('buildCuratedHomeItems — patch/district altitude', () => {
  const twoOfThree = {
    stores: [
      store('1', 'Store One', true, [flag('DRAWER_OPENS', { headline: 'A headline' })]),
      store('2', 'Store Two', true, [flag('DRAWER_OPENS', { headline: 'Different headline' })]),
      store('3', 'Store Three', true, []),
    ],
    summary: { totalFlags: 2 },
  };

  it('groups the same rule id across stores into ONE pattern item, not one per store', () => {
    const { altitude, items } = buildCuratedHomeItems(twoOfThree, 'area_supervisor');
    expect(altitude).toBe('patch');
    expect(items).toHaveLength(1);
    expect(items[0].storesAffected.sort()).toEqual(['Store One', 'Store Two']);
  });

  it('regenerates the headline at pattern altitude instead of reusing one store\'s own number', () => {
    const { items } = buildCuratedHomeItems(twoOfThree, 'area_supervisor');
    expect(items[0].headline).toContain('2 of 3');
    expect(items[0].headline).toContain('patch');
    // Never a verbatim copy of either store's own live-number headline:
    expect(items[0].headline).not.toBe('A headline');
    expect(items[0].headline).not.toBe('Different headline');
  });

  // Owner-corrected 2026-11-11 (fresh-eyes role audit) -- `do` groups at 'patch' ALTITUDE
  // (unchanged, same aggregation as area_supervisor/om, re-asserted in the 'altitudeForRole'
  // describe block above), but CLAUDE.md documents DO as "District-level" scope, and the old
  // code derived the narration WORD straight from altitude, so a DO's own home screen literally
  // called their district a "patch" -- a mismatch the person being addressed would notice. Only
  // the word changed; this test's sibling two rows up (role 'area_supervisor') still gets "patch".
  it('says "district" (not "patch") for a DO, even though DO still groups at patch altitude', () => {
    const { altitude, items } = buildCuratedHomeItems(twoOfThree, 'do');
    expect(altitude).toBe('patch'); // grouping/aggregation unchanged
    expect(items[0].headline).toContain('district'); // narration word corrected
    expect(items[0].headline).not.toContain('patch');
  });

  it('reuses detail/action verbatim from a representative flag (those fields are generic per severity tier, not number-specific)', () => {
    const { items } = buildCuratedHomeItems(twoOfThree, 'do');
    expect(items[0].detail).toBe('DRAWER_OPENS generic detail');
    expect(items[0].action).toBe('DRAWER_OPENS generic action');
  });

  it('says "district" instead of "patch" for a district-altitude role', () => {
    const { altitude, items } = buildCuratedHomeItems(twoOfThree, 'vp');
    expect(altitude).toBe('district');
    expect(items[0].headline).toContain('district');
    expect(items[0].headline).not.toContain('patch');
  });

  it('uses "across all N stores" phrasing when every store with data shares the hit', () => {
    const allHit = {
      stores: [
        store('1', 'S1', true, [flag('R')]),
        store('2', 'S2', true, [flag('R')]),
      ],
      summary: {},
    };
    const { items } = buildCuratedHomeItems(allHit, 'om');
    expect(items[0].headline).toMatch(/across all 2 stores/);
  });

  it('a RED hit anywhere makes the pattern item RED even if other hits are AMBER', () => {
    const mixed = {
      stores: [
        store('1', 'S1', true, [flag('R', { severity: 'AMBER' })]),
        store('2', 'S2', true, [flag('R', { severity: 'RED' })]),
      ],
      summary: {},
    };
    const { items } = buildCuratedHomeItems(mixed, 'do');
    expect(items[0].severity).toBe('RED');
  });

  it('excludes no-data stores from the total used in "N of M" phrasing', () => {
    const withNoData = {
      stores: [
        store('1', 'S1', true, [flag('R')]),
        store('2', 'S2', false, []),
        store('3', 'S3', false, []),
      ],
      summary: {},
    };
    const { items } = buildCuratedHomeItems(withNoData, 'do');
    expect(items[0].headline).toContain('1 of 1');
  });
});

// Altitude-aware default landing (fresh-eyes role audit, 2026-11-11 --
// memory/finding-fresh-eyes-role-audit-2026-11-11.md §4). Extracted as a pure predicate from
// App.js's mount effect specifically so this is unit-testable without mounting the full App
// component (no existing test in this repo does that).
describe('shouldDefaultToCuratedHome', () => {
  const base = { routePanel: null, view: 'command', hasBriefPerm: true };

  it('true for a store-altitude role with nothing else claiming the landing slot', () => {
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'gm' })).toBe(true);
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'sm_am_dm' })).toBe(true);
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'manager' })).toBe(true);
  });

  it('true for a patch-altitude role too', () => {
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'area_supervisor' })).toBe(true);
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'om' })).toBe(true);
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'do' })).toBe(true);
  });

  it('false for district altitude -- AtAGlance stays the unchanged default there', () => {
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'vp' })).toBe(false);
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'owner' })).toBe(false);
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'admin' })).toBe(false);
  });

  it('false when a route panel already claimed the slot (URL route, legacy redirect, or an explicit route:true defaultLandingPanel)', () => {
    expect(shouldDefaultToCuratedHome({ ...base, routePanel: 'proj', roleId: 'gm' })).toBe(false);
  });

  it('false when view is already "district" (an explicit defaultLandingPanel:"district" already resolved it)', () => {
    expect(shouldDefaultToCuratedHome({ ...base, view: 'district', roleId: 'gm' })).toBe(false);
  });

  it('false when the role lacks analytics.brief (Curated Home\'s own registry gate), even at store altitude', () => {
    expect(shouldDefaultToCuratedHome({ ...base, roleId: 'gm', hasBriefPerm: false })).toBe(false);
  });
});
