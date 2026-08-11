// @ts-nocheck
// #174: the round-trip must be symmetric — parse -> save -> load returns the same field set.
// This is the deliverable the issue's decision comment called for, not an extra: a test that
// would have caught the original tOepe/tPark-parsed-then-dropped gap.
import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';

// In-memory fake table so saveMonthlyTargets's upsert is actually visible to loadMonthlyTargets
// afterward — a real round-trip, not two independently-mocked halves.
let _table = [];

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          then: (resolve) => resolve({ data: _table, error: null }),
        };
        return chain;
      },
      upsert: (rows) => Promise.resolve().then(() => {
        for (const row of rows) {
          const i = _table.findIndex(r => r.loc === row.loc && r.year === row.year && r.month === row.month);
          if (i >= 0) _table[i] = { ..._table[i], ...row }; else _table.push(row);
        }
        return { error: null };
      }),
    }),
  }),
}));

const { saveMonthlyTargets, loadMonthlyTargets } = await import('../lib/supabase.js');
const { parseMonthlyTargets } = await import('../parsers/index.js');

function wbFromAOA(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Table 1 (2)');
  return wb;
}

describe('#174 — parse -> save -> load round-trip for tPark/tOepe', () => {
  it('a value parsed from the workbook survives save and load unchanged', async () => {
    _table = [];
    const parsed = parseMonthlyTargets(wbFromAOA([
      ['Restaurant', 'Base Food\n%', 'Crew Labor %', 'Park %', 'OEPE\nPACE'],
      ['3708 - ARDMORE', 0.335, 0.24, 0.15, 140],
    ]));
    expect(parsed['3708'].tPark).toBeCloseTo(0.15, 5);
    expect(parsed['3708'].tOepe).toBe(140);

    await saveMonthlyTargets(parsed, 2026, 8);
    const loaded = await loadMonthlyTargets(2026, 8);

    expect(loaded['3708'].tPark).toBeCloseTo(0.15, 5);
    expect(loaded['3708'].tOepe).toBe(140);
    // and the pre-existing fields still round-trip too
    expect(loaded['3708'].tCrewLabor).toBeCloseTo(0.24, 5);
    expect(loaded['3708'].tFOBBase).toBeCloseTo(0.335, 5);
  });

  it('a store with no Park/OEPE data does not round-trip a null that erases DEFAULT_TARGETS (#166 interaction)', async () => {
    _table = [];
    const parsed = parseMonthlyTargets(wbFromAOA([
      ['Restaurant', 'Base Food\n%', 'Crew Labor %'],
      ['3708 - ARDMORE', 0.335, 0.24],
    ]));
    expect('tPark' in parsed['3708']).toBe(false);

    await saveMonthlyTargets(parsed, 2026, 8);
    const loaded = await loadMonthlyTargets(2026, 8);

    expect('tPark' in loaded['3708']).toBe(false);
    expect('tOepe' in loaded['3708']).toBe(false);
  });

  it('tLabor is parsed but deliberately NOT persisted — held for #164', async () => {
    _table = [];
    const parsed = parseMonthlyTargets(wbFromAOA([
      ['Restaurant', 'Base Food\n%', 'Combined Labor %'],
      ['3708 - ARDMORE', 0.335, 0.22],
    ]));
    expect(parsed['3708'].tLabor).toBeCloseTo(0.22, 5);

    await saveMonthlyTargets(parsed, 2026, 8);
    const loaded = await loadMonthlyTargets(2026, 8);

    expect('tLabor' in loaded['3708']).toBe(false);
  });
});
