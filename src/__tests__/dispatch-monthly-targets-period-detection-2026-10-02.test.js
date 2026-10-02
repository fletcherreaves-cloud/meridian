// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported (2026-10-02): uploaded October's monthly-targets/projections workbook, the
// app said the upload succeeded, but the October numbers never showed up. Measured directly
// against live Supabase: zero rows for (year:2026, month:10) in monthly_targets, newest month
// on file was September -- the write genuinely never happened, this was not a stale-cache or
// scope-filter illusion.
//
// The REAL root cause, found by downloading the owner's actual uploaded file from the
// `reports` storage bucket (pending_reports -- every manual upload is archived there) and
// running it through the real parsers directly: year/month detection from the filename
// ("October 2026 - Restaurant Projections...") worked FINE, and parseMonthlyTargets()
// correctly extracted all 27 real stores' targets. The upsert to Supabase failed outright
// with PGRST204 "Could not find the 'fob_bonus_base_pct' column ... in the schema cache" --
// supabase/schema-monthly-targets-labor-fobbonus.sql (dispatch #164's labor_pct/
// fob_bonus_base_pct migration) was written but NEVER ACTUALLY RUN against production, the
// exact "SQL patch written, not run" pattern CLAUDE.md already documents for
// forecast_snapshots/qsr_daily_activity_rollup. Confirmed directly: a bare `select
// labor_pct` against the live table returns Postgres 42703 "column does not exist". Every
// saveMonthlyTargets() upsert since dispatch #164 shipped has been failing the same way --
// not just this one upload. That schema fix is DB-side (owner must run the ALTER TABLE; no
// exec_sql RPC or DATABASE_URL is available to this session, confirmed absent, same as every
// prior schema-*.sql in this repo's history) and is not something a test file can cover.
//
// What IS fixed and tested here, found along the way from the same real file:
// (1) mergeDS's year/month detection now ALSO tries the sheet's own title rows as a fallback
//     before giving up on a file whose name carries no date (a secondary robustness gap, not
//     what broke this specific upload, but a real one worth closing regardless -- see its own
//     describe block below). When detection still fails, mergeDS sets
//     ds._monthlyTargetsUndetected so App.js's handleFiles attaches a visible saveErr to the
//     upload summary modal instead of a silent miss reading as success.
// (2) The real uploaded workbook is a multi-operator "Multi Layout" export whose Restaurant
//     column also carries OTHER operators' store numbers (1291, 2010, 2370, 2510, 2920,
//     16392, 17750 -- not any of this org's 27 stores, parsed with no real target fields, just
//     column drift) -- these were landing in monthly_targets as junk rows. Scoped to
//     DEFAULT_TARGETS' own 27 stores before merging/saving, matching the precedent
//     applyProjectionsToTargets already sets a few lines up in the same file.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { ensureParsersXLSXReady } from '../parsers/index.js';

let _upsertedRows = null;
vi.stubEnv?.('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv?.('VITE_SUPABASE_ANON_KEY', 'fake-key');
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      upsert: (rows) => { _upsertedRows = rows; return Promise.resolve({ error: null }); },
    }),
  }),
}));

const { mergeDS, buildDS } = await import('../engine/pipeline.js');
await ensureParsersXLSXReady();

function wbFromAOA(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return wb;
}

// Minimal real monthly-targets sheet: header row parseMonthlyTargets() anchors on
// ('restaurant' + 'base food'), one data row with a real store number.
const TARGETS_AOA = [
  ['Restaurant', 'Base Food %', 'Crew Labor %'],
  ['3708 - ARDMORE-BROADWAY', '21.0%', '23.0%'],
];

beforeEach(() => { _upsertedRows = null; });

describe('mergeDS — monthly-targets period detection (real October 2026 incident)', () => {
  it('regression: a dated filename still detects correctly and saves', async () => {
    const wb = wbFromAOA([['Sheet1', TARGETS_AOA]]);
    const ds = mergeDS(buildDS([]), wb, 'projections', 'October 2026 - Restaurant Projections.xlsx');
    expect(ds.monthlyTargetsMeta).toEqual(expect.objectContaining({ year: 2026, month: 10 }));
    expect(ds.allMonthlyTargets['2026-10']).toBeTruthy();
    expect(ds._monthlyTargetsUndetected).toBeUndefined();
    await Promise.resolve(); await Promise.resolve(); // let the fire-and-forget upsert land
    expect(_upsertedRows).toBeTruthy();
    expect(_upsertedRows[0]).toEqual(expect.objectContaining({ loc: '3708', year: 2026, month: 10 }));
  });

  it('new: a "." separator in a numeric filename (e.g. Windows-style "10.2026") now detects', async () => {
    const wb = wbFromAOA([['Sheet1', TARGETS_AOA]]);
    const ds = mergeDS(buildDS([]), wb, 'projections', 'Projections.10.2026.xlsx');
    expect(ds.monthlyTargetsMeta).toEqual(expect.objectContaining({ year: 2026, month: 10 }));
  });

  it('new: filename carries no date, but the sheet TITLE row does -- detected via fallback', async () => {
    const aoa = [
      ['Restaurant Projections - October 2026', null, null],
      ...TARGETS_AOA,
    ];
    const wb = wbFromAOA([['Sheet1', aoa]]);
    // A real re-download rename -- no date anywhere in the filename itself.
    const ds = mergeDS(buildDS([]), wb, 'projections', 'Restaurant Projections (1).xlsx');
    expect(ds.monthlyTargetsMeta).toEqual(expect.objectContaining({ year: 2026, month: 10 }));
    expect(ds._monthlyTargetsUndetected).toBeUndefined();
  });

  it('the exact incident: neither filename nor sheet title carries a date -- flagged, not silently dropped', async () => {
    const wb = wbFromAOA([['Sheet1', TARGETS_AOA]]);
    const ds = mergeDS(buildDS([]), wb, 'projections', 'Projections.xlsx');
    expect(ds.monthlyTargetsMeta).toBeFalsy();
    expect(ds.allMonthlyTargets?.['2026-10']).toBeUndefined();
    expect(ds._monthlyTargetsUndetected).toEqual({ filename: 'Projections.xlsx', storeCount: 1 });
    await Promise.resolve(); await Promise.resolve();
    expect(_upsertedRows).toBeNull(); // never attempted -- this is the actual bug being fixed
  });

  it('does not raise the undetected flag when the file carried no real target rows at all (nothing to warn about)', () => {
    const emptyAoa = [['Restaurant', 'Base Food %'], ['not-a-store-row', '']];
    const wb = wbFromAOA([['Sheet1', emptyAoa]]);
    const ds = mergeDS(buildDS([]), wb, 'projections', 'Projections.xlsx');
    expect(ds._monthlyTargetsUndetected).toBeUndefined();
  });
});

describe('mergeDS — monthly-targets scoped to this org\'s own stores (real multi-operator workbook)', () => {
  // Shape of the real file: a "Restaurant" column that also carries OTHER operators' store
  // numbers alongside this org's own -- '9999' is not in DEFAULT_TARGETS (standing in for the
  // real file's 1291/2010/2370/2510/2920/16392/17750), '3708' is.
  const MULTI_OP_AOA = [
    ['Restaurant', 'Base Food %', 'Crew Labor %'],
    ['9999 - SOME OTHER OPERATOR', '', ''],
    ['3708 - ARDMORE-BROADWAY', '21.0%', '23.0%'],
  ];

  it('drops a store number this org does not own, keeps a real one, from ds.monthlyTargets', () => {
    const wb = wbFromAOA([['Sheet1', MULTI_OP_AOA]]);
    const ds = mergeDS(buildDS([]), wb, 'projections', 'October 2026 - Restaurant Projections.xlsx');
    expect(Object.keys(ds.monthlyTargets)).toEqual(['3708']);
    expect(ds.monthlyTargets['9999']).toBeUndefined();
  });

  it('does not count the foreign store toward storeCount in monthlyTargetsMeta', () => {
    const wb = wbFromAOA([['Sheet1', MULTI_OP_AOA]]);
    const ds = mergeDS(buildDS([]), wb, 'projections', 'October 2026 - Restaurant Projections.xlsx');
    expect(ds.monthlyTargetsMeta.storeCount).toBe(1);
  });

  it('never sends the foreign store\'s row to Supabase', async () => {
    const wb = wbFromAOA([['Sheet1', MULTI_OP_AOA]]);
    mergeDS(buildDS([]), wb, 'projections', 'October 2026 - Restaurant Projections.xlsx');
    await Promise.resolve(); await Promise.resolve();
    expect(_upsertedRows.map(r => r.loc)).toEqual(['3708']);
  });
});
