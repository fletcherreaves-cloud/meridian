// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  latestEntriesByInstance, describeEquipmentEntry, buildEquipmentRollupRows,
  buildEquipmentRollupText, resolveStoreGM, placementLabel, sideLabel, relativeLabel, fridgeSubtypeLabel,
  buildEquipmentStoreSummary, buildEquipmentStoreDetail, PLACEMENTS,
} from '../engine/equipment-survey.js';

const row = (instanceId, action, submittedAt, extra = {}) =>
  ({ instance_id: instanceId, action, submitted_at: submittedAt, ...extra });

describe('latestEntriesByInstance', () => {
  it('returns the single row for a single-entry instance', () => {
    const rows = [row('a', 'added', '2026-10-01T00:00:00Z')];
    expect(latestEntriesByInstance(rows)).toEqual(rows);
  });

  it('keeps only the newest row per instance when rows are already newest-first', () => {
    const rows = [
      row('a', 'corrected', '2026-10-05T00:00:00Z', { serial_number: 'NEW' }),
      row('a', 'added', '2026-10-01T00:00:00Z', { serial_number: 'OLD' }),
    ];
    const out = latestEntriesByInstance(rows);
    expect(out).toHaveLength(1);
    expect(out[0].serial_number).toBe('NEW');
  });

  it('excludes an instance whose latest action is removed, even though it has older non-removed history', () => {
    const rows = [
      row('a', 'removed', '2026-10-10T00:00:00Z'),
      row('a', 'added', '2026-10-01T00:00:00Z'),
      row('b', 'added', '2026-10-02T00:00:00Z'),
    ];
    const out = latestEntriesByInstance(rows);
    expect(out.map(r => r.instance_id)).toEqual(['b']);
  });

  it('a correction after a removal brings the instance back (re-added)', () => {
    const rows = [
      row('a', 'corrected', '2026-10-10T00:00:00Z'),
      row('a', 'removed', '2026-10-05T00:00:00Z'),
      row('a', 'added', '2026-10-01T00:00:00Z'),
    ];
    const out = latestEntriesByInstance(rows);
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('corrected');
  });

  it('handles multiple independent instances for the same store', () => {
    const rows = [
      row('a', 'added', '2026-10-03T00:00:00Z'),
      row('b', 'added', '2026-10-02T00:00:00Z'),
      row('c', 'removed', '2026-10-04T00:00:00Z'),
      row('c', 'added', '2026-10-01T00:00:00Z'),
    ];
    const out = latestEntriesByInstance(rows);
    expect(out.map(r => r.instance_id).sort()).toEqual(['a', 'b']);
  });

  it('returns an empty array for no rows or all-removed rows', () => {
    expect(latestEntriesByInstance([])).toEqual([]);
    expect(latestEntriesByInstance(null)).toEqual([]);
    expect(latestEntriesByInstance([row('a', 'removed', '2026-10-01T00:00:00Z')])).toEqual([]);
  });

  it('ignores a malformed row with no instance_id rather than throwing', () => {
    const rows = [{ action: 'added', submitted_at: '2026-10-01T00:00:00Z' }, row('a', 'added', '2026-10-02T00:00:00Z')];
    expect(latestEntriesByInstance(rows).map(r => r.instance_id)).toEqual(['a']);
  });
});

// ── Review & Share (owner request 2026-10-19) ─────────────────────────────────────────────────
describe('describeEquipmentEntry', () => {
  it('describes a catalog-matched entry as "Type — Manufacturer Model"', () => {
    const catalogById = { 'cat-1': { type: 'Grill', manufacturer: 'Frymaster', model: 'FPEG30' } };
    expect(describeEquipmentEntry({ catalog_item_id: 'cat-1' }, catalogById)).toBe('Grill — Frymaster FPEG30');
  });

  it('falls back to the raw manual entry text when there is no catalog match', () => {
    expect(describeEquipmentEntry({ manual_entry_text: 'Odd Grill / Acme / X1' }, {})).toBe('Odd Grill / Acme / X1');
  });

  it('falls back to a generic label when neither is present', () => {
    expect(describeEquipmentEntry({}, {})).toBe('Equipment');
  });
});

describe('buildEquipmentRollupRows / buildEquipmentRollupText', () => {
  const catalogById = { 'cat-1': { type: 'Grill', manufacturer: 'Frymaster', model: 'FPEG30' } };

  it('resolves placement/side/relative codes to their display labels', () => {
    const entries = [{
      catalog_item_id: 'cat-1', placement_zone: 'production_area',
      position_detail: { side: 'side1_right', relative: null },
      serial_number: 'SN123', cert_date: '2026-01-01', submitted_by: 'Alex',
    }];
    const [row] = buildEquipmentRollupRows(entries, catalogById);
    expect(row.description).toBe('Grill — Frymaster FPEG30');
    expect(row.placement).toBe(placementLabel('production_area'));
    expect(row.side).toBe(sideLabel('side1_right'));
    expect(row.relative).toBe('');
    expect(row.serial).toBe('SN123');
    expect(row.certDate).toBe('2026-01-01');
  });

  it('resolves a relative-to-grill code the same way', () => {
    const entries = [{ manual_entry_text: 'Protein fryer', position_detail: { relative: 'opposite_of_grill' } }];
    const [row] = buildEquipmentRollupRows(entries, {});
    expect(row.relative).toBe(relativeLabel('opposite_of_grill'));
  });

  it('resolves refrigeration_subtype to its display label and includes it in the rollup text', () => {
    const entries = [{ manual_entry_text: 'Prep fridge', refrigeration_subtype: 'combo' }];
    const [row] = buildEquipmentRollupRows(entries, {});
    expect(row.fridgeSubtype).toBe(fridgeSubtypeLabel('combo'));
    const text = buildEquipmentRollupText('Test Store', [row]);
    expect(text).toContain(fridgeSubtypeLabel('combo'));
  });

  it('leaves fridgeSubtype blank when refrigeration_subtype is not set', () => {
    const [row] = buildEquipmentRollupRows([{ manual_entry_text: 'Grill' }], {});
    expect(row.fridgeSubtype).toBe('');
  });

  it('builds readable text including every resolved field, numbered', () => {
    const rows = buildEquipmentRollupRows([{
      catalog_item_id: 'cat-1', placement_zone: 'production_area', serial_number: 'SN123',
    }], catalogById);
    const text = buildEquipmentRollupText('Test Store', rows);
    expect(text).toContain('Equipment Survey — Test Store');
    expect(text).toContain('1. Grill — Frymaster FPEG30');
    expect(text).toContain(placementLabel('production_area'));
    expect(text).toContain('S/N SN123');
    expect(text).toContain('1 item(s) total.');
  });

  it('says plainly when nothing has been logged yet, rather than an empty list', () => {
    expect(buildEquipmentRollupText('Test Store', [])).toContain('No equipment logged for this store yet.');
  });
});

describe('resolveStoreGM', () => {
  const assignments = [
    { loc: '3708', gm: 'Zukarr Eaves', gmEmail: 'zukarr@mcdok.com', start: '' },
    { loc: '3708', gm: 'Sabrina Turner', gmEmail: 'sabrina@mcdok.com', start: '2026-10-05' },
    { loc: '5183', gm: 'Mukarram Norman', gmEmail: 'mukarram@mcdok.com', start: '' },
  ];

  it('resolves the current GM for a store as of today (no date given)', () => {
    expect(resolveStoreGM(assignments, '3708', '2026-10-19')).toEqual({ name: 'Sabrina Turner', email: 'sabrina@mcdok.com' });
  });

  it('resolves the GM who was effective as of a PAST date, not the current one', () => {
    expect(resolveStoreGM(assignments, '3708', '2026-09-01')).toEqual({ name: 'Zukarr Eaves', email: 'zukarr@mcdok.com' });
  });

  it('matches loc regardless of zero-padding', () => {
    expect(resolveStoreGM(assignments, '0003708', '2026-10-19')).toEqual({ name: 'Sabrina Turner', email: 'sabrina@mcdok.com' });
  });

  it('returns null for a store with no assignment on file', () => {
    expect(resolveStoreGM(assignments, '99999', '2026-10-19')).toBeNull();
  });

  it('returns null when given no assignments at all', () => {
    expect(resolveStoreGM([], '3708', '2026-10-19')).toBeNull();
    expect(resolveStoreGM(null, '3708', '2026-10-19')).toBeNull();
  });
});

// ── Equipment Results Panel (owner request 2026-11-02) ────────────────────────────────────────
describe('buildEquipmentStoreSummary', () => {
  it('groups by loc and reports itemCount/reviewedCount from current (non-removed) state only', () => {
    const rows = [
      row('a', 'added', '2026-10-01T00:00:00Z', { loc: '3708', settings_reviewed: true }),
      row('b', 'added', '2026-10-02T00:00:00Z', { loc: '3708', settings_reviewed: false }),
      row('c', 'added', '2026-10-01T00:00:00Z', { loc: '5183', settings_reviewed: false }),
    ];
    const out = buildEquipmentStoreSummary(rows);
    expect(out).toEqual([
      { loc: '3708', itemCount: 2, reviewedCount: 1, lastSubmittedAt: '2026-10-02T00:00:00Z', lastSubmittedBy: null },
      { loc: '5183', itemCount: 1, reviewedCount: 0, lastSubmittedAt: '2026-10-01T00:00:00Z', lastSubmittedBy: null },
    ]);
  });

  it('accepts rows in any order (not pre-sorted newest-first) and still resolves current state per store', () => {
    const rows = [
      row('a', 'added', '2026-10-01T00:00:00Z', { loc: '3708', serial_number: 'OLD' }),
      row('a', 'corrected', '2026-10-05T00:00:00Z', { loc: '3708', serial_number: 'NEW' }),
    ];
    const out = buildEquipmentStoreSummary(rows);
    expect(out).toEqual([{ loc: '3708', itemCount: 1, reviewedCount: 0, lastSubmittedAt: '2026-10-05T00:00:00Z', lastSubmittedBy: null }]);
  });

  it('lastSubmittedAt/lastSubmittedBy reflect the most recent row regardless of action, even a removal', () => {
    const rows = [
      row('a', 'added', '2026-10-01T00:00:00Z', { loc: '3708', submitted_by: 'A. Lopez' }),
      row('a', 'removed', '2026-10-10T00:00:00Z', { loc: '3708', submitted_by: 'B. Reyes' }),
    ];
    const out = buildEquipmentStoreSummary(rows);
    expect(out).toEqual([{ loc: '3708', itemCount: 0, reviewedCount: 0, lastSubmittedAt: '2026-10-10T00:00:00Z', lastSubmittedBy: 'B. Reyes' }]);
  });

  it('sorts stores numerically by loc, not lexicographically', () => {
    const rows = [
      row('a', 'added', '2026-10-01T00:00:00Z', { loc: '20' }),
      row('b', 'added', '2026-10-01T00:00:00Z', { loc: '3' }),
      row('c', 'added', '2026-10-01T00:00:00Z', { loc: '100' }),
    ];
    const out = buildEquipmentStoreSummary(rows);
    expect(out.map(r => r.loc)).toEqual(['3', '20', '100']);
  });

  it('ignores a malformed row with no loc rather than throwing', () => {
    const rows = [{ instance_id: 'a', action: 'added', submitted_at: '2026-10-01T00:00:00Z' }];
    expect(buildEquipmentStoreSummary(rows)).toEqual([]);
  });

  it('returns an empty array for no rows', () => {
    expect(buildEquipmentStoreSummary([])).toEqual([]);
    expect(buildEquipmentStoreSummary(null)).toEqual([]);
  });
});

describe('buildEquipmentStoreDetail', () => {
  const catalogById = { cat1: { id: 'cat1', type: 'grill', manufacturer: 'Taylor', model: 'C602' } };

  it('filters to the one requested store, ignoring other stores\' rows', () => {
    const rows = [
      row('a', 'added', '2026-10-01T00:00:00Z', { loc: '3708', catalog_item_id: 'cat1', placement_zone: 'production_area' }),
      row('b', 'added', '2026-10-01T00:00:00Z', { loc: '5183', catalog_item_id: 'cat1', placement_zone: 'production_area' }),
    ];
    const { rows: out } = buildEquipmentStoreDetail(rows, '3708', catalogById);
    expect(out).toHaveLength(1);
  });

  it('groups by area in PLACEMENTS order, with a trailing group for items with no area set', () => {
    const rows = [
      row('a', 'added', '2026-10-01T00:00:00Z', { loc: '3708', catalog_item_id: 'cat1', placement_zone: 'back_of_house' }),
      row('b', 'added', '2026-10-01T00:00:00Z', { loc: '3708', catalog_item_id: 'cat1', placement_zone: 'front_counter' }),
      row('c', 'added', '2026-10-01T00:00:00Z', { loc: '3708', catalog_item_id: 'cat1' }), // no placement_zone
    ];
    const { groups } = buildEquipmentStoreDetail(rows, '3708', catalogById);
    expect(groups.map(g => g.label)).toEqual(['Front Counter', 'Back of House', 'Area not yet set']);
    expect(groups.every(g => g.rows.length > 0)).toBe(true);
  });

  it('only includes current (non-removed, latest-per-instance) state, same as every other consumer', () => {
    const rows = [
      row('a', 'added', '2026-10-01T00:00:00Z', { loc: '3708', catalog_item_id: 'cat1', placement_zone: 'rooftop' }),
      row('a', 'removed', '2026-10-10T00:00:00Z', { loc: '3708', placement_zone: 'rooftop' }),
    ];
    const { rows: out } = buildEquipmentStoreDetail(rows, '3708', catalogById);
    expect(out).toEqual([]);
  });

  it('includes the rooftop area (2026-11-17) in PLACEMENTS and groups it correctly', () => {
    expect(PLACEMENTS.find(p => p.value === 'rooftop')?.label).toBe('Rooftop');
    const rows = [row('a', 'added', '2026-10-01T00:00:00Z', { loc: '3708', catalog_item_id: 'cat1', placement_zone: 'rooftop' })];
    const { groups } = buildEquipmentStoreDetail(rows, '3708', catalogById);
    expect(groups).toEqual([{ label: 'Rooftop', rows: expect.any(Array) }]);
    expect(groups[0].rows).toHaveLength(1);
  });

  it('returns empty rows/groups for a store with nothing logged', () => {
    expect(buildEquipmentStoreDetail([], '3708', catalogById)).toEqual({ rows: [], groups: [] });
  });
});
