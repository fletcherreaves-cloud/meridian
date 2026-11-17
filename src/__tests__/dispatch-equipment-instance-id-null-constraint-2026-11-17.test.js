// @ts-nocheck
// Fix: dragging a palette item (e.g. "Marinator") into a floor-plan zone in the Layout Planner
// failed with "Could not save: null value in column 'instance_id' of relation
// 'equipment_survey_entries' violates not-null constraint" (owner-reported, 2026-11-17).
//
// Root cause: supabase/schema-equipment-survey.sql's equipment_survey_entries.instance_id is
// `uuid not null` with NO column default (only `id` gets `default gen_random_uuid()`).
// saveEquipmentEntryDirect() (src/lib/supabase.js) wrongly assumed one existed --
// `instance_id: row.instance_id || undefined` sent no value at all for a NEW item (the
// equipment-layout.js palette-drop path explicitly passes `instanceId: null`), so Postgres had
// nothing to fall back on. The public equipment-survey edge function
// (supabase/functions/equipment-survey/index.ts) already generates a fresh crypto.randomUUID()
// client-side for exactly this reason -- this test drives saveEquipmentEntryDirect() through a
// mocked Supabase client (dispatch #218's established pattern) and asserts the real payload sent
// to .insert() always carries a real instance_id, matching the fix.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const __inserted = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1', email: 'gm@store.test' } } }) },
    from: (table) => ({
      insert: (row) => {
        __inserted.push({ table, row });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'row-1', ...row }, error: null }),
          }),
        };
      },
    }),
  }),
}));

let saveEquipmentEntryDirect;
beforeEach(async () => {
  vi.resetModules();
  __inserted.length = 0;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ saveEquipmentEntryDirect } = await import('../lib/supabase.js'));
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('saveEquipmentEntryDirect — instance_id null-constraint fix', () => {
  it('a fresh palette drop (no instance_id given, matching equipment-layout.js\'s commitPlacement) gets a real UUID, never null/undefined', async () => {
    const { error } = await saveEquipmentEntryDirect({
      instance_id: null, loc: '3708', catalog_item_id: 'cat-1', placement_zone: 'kitchen_line',
      position_detail: { side: 'side1_right', relative: '' }, action: 'added',
    });
    expect(error).toBeNull();
    expect(__inserted).toHaveLength(1);
    expect(__inserted[0].row.instance_id).not.toBeNull();
    expect(__inserted[0].row.instance_id).not.toBeUndefined();
    expect(__inserted[0].row.instance_id).toMatch(UUID_RE);
  });

  it('two separate new-item saves (no instance_id) each get their OWN distinct instance_id', async () => {
    await saveEquipmentEntryDirect({ instance_id: null, loc: '3708', catalog_item_id: 'cat-1', action: 'added' });
    await saveEquipmentEntryDirect({ instance_id: null, loc: '3708', catalog_item_id: 'cat-2', action: 'added' });
    expect(__inserted).toHaveLength(2);
    expect(__inserted[0].row.instance_id).not.toBe(__inserted[1].row.instance_id);
  });

  it('a correction/removal with a real instance_id passes it through UNCHANGED (never overwritten with a new one)', async () => {
    const existing = 'a1b2c3d4-e5f6-4789-a1b2-c3d4e5f67890';
    await saveEquipmentEntryDirect({ instance_id: existing, loc: '3708', catalog_item_id: 'cat-1', action: 'corrected' });
    expect(__inserted[0].row.instance_id).toBe(existing);
  });
});
