// @ts-nocheck
// Layout Planner (owner request 2026-10-21) — buildPlacedItems() pure-logic tests, same scope
// precedent as conversion-efficiency.test.js / oil-efficiency.test.js: the VIEW component here
// loads live from Supabase on mount (loadEquipmentCatalogDirect/loadEquipmentEntriesDirect), so
// per this repo's established pattern for that shape of panel, tests cover the pure engine logic
// directly rather than rendering the network-loading component.
import { describe, it, expect } from 'vitest';
import { buildPlacedItems, CATALOG_TYPE_GROUPS } from '../views/equipment-layout.js';

const mkEntry = (over = {}) => ({
  instance_id: 'i1', loc: '3708', catalog_item_id: null, manual_entry_text: null,
  placement_zone: null, serial_number: null, cert_date: null, action: 'added',
  submitted_by: null, submitted_at: '2026-10-21T09:00:00Z', position_detail: null,
  ...over,
});

describe('CATALOG_TYPE_GROUPS', () => {
  it('covers exactly the 15 real equipment_catalog types, no duplicates', () => {
    const ids = CATALOG_TYPE_GROUPS.flatMap(g => g.types.map(t => t.id));
    expect(ids.length).toBe(15);
    expect(new Set(ids).size).toBe(15);
  });
});

describe('buildPlacedItems', () => {
  it('only includes entries with a placement_zone set', () => {
    const entries = [mkEntry({ instance_id: 'a', placement_zone: 'front_counter' }), mkEntry({ instance_id: 'b', placement_zone: null })];
    const out = buildPlacedItems(entries, {});
    expect(out.map(p => p.instanceId)).toEqual(['a']);
  });

  it('resolves typeId from catalogById via catalog_item_id, and the description reads "type — manufacturer model"', () => {
    const catalogById = { 'cat-1': { id: 'cat-1', type: 'fryer', manufacturer: 'Frymaster', model: 'BIELA' } };
    const entries = [mkEntry({ placement_zone: 'production_area', catalog_item_id: 'cat-1' })];
    const out = buildPlacedItems(entries, catalogById);
    expect(out[0].typeId).toBe('fryer');
    expect(out[0].catalogItemId).toBe('cat-1');
    expect(out[0].description).toBe('fryer — Frymaster BIELA');
  });

  it('falls back to manual_entry_text when there is no catalog_item_id, typeId stays null', () => {
    const entries = [mkEntry({ placement_zone: 'drive_thru', manual_entry_text: 'Some off-catalog unit' })];
    const out = buildPlacedItems(entries, {});
    expect(out[0].typeId).toBeNull();
    expect(out[0].description).toBe('Some off-catalog unit');
    expect(out[0].manualText).toBe('Some off-catalog unit');
  });

  it('maps side/relative from position_detail and serial/cert/submitted fields straight through', () => {
    const entries = [mkEntry({
      placement_zone: 'mccafe_cell', serial_number: 'SN-1', cert_date: '2026-05-01',
      submitted_by: 'A. Lopez', position_detail: { side: 'side2_left', relative: 'opposite_of_grill' },
    })];
    const out = buildPlacedItems(entries, {});
    expect(out[0]).toMatchObject({
      zone: 'mccafe_cell', side: 'side2_left', relative: 'opposite_of_grill',
      serial: 'SN-1', certDate: '2026-05-01', submittedBy: 'A. Lopez', submittedAt: '2026-10-21T09:00:00Z',
    });
  });

  it('missing position_detail / serial / cert / submittedBy resolve to empty string, not null/undefined', () => {
    const entries = [mkEntry({ placement_zone: 'back_of_house' })];
    const out = buildPlacedItems(entries, {});
    expect(out[0].side).toBe('');
    expect(out[0].relative).toBe('');
    expect(out[0].serial).toBe('');
    expect(out[0].certDate).toBe('');
    expect(out[0].submittedBy).toBe('');
  });
});
