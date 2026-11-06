// @ts-nocheck
// Curated Home Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §2, task #92) -- pure
// engine logic: role -> altitude mapping, and the store/patch/district item builders. Fixtures
// mirror computeMorningBrief()'s real output shape (src/features/morning-brief.js) directly
// rather than importing the full engine, so these tests isolate the role-voice transform itself.
import { describe, it, expect } from 'vitest';
import { altitudeForRole, buildCuratedHomeItems } from '../engine/curated-home.js';

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
    const { items } = buildCuratedHomeItems(twoOfThree, 'do');
    expect(items[0].headline).toContain('2 of 3');
    expect(items[0].headline).toContain('patch');
    // Never a verbatim copy of either store's own live-number headline:
    expect(items[0].headline).not.toBe('A headline');
    expect(items[0].headline).not.toBe('Different headline');
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
