// @ts-nocheck
// Owner report, live, Elgin screenshot: R2P and KVS (and DT Parked%/Labor %/TPPH) read "—" for
// EVERY hour shown, including hours long complete with real OEPE/sales data next to them.
//
// Root cause (confirmed via live Supabase curl, 2026-11-15): `src/views/signals.js`'s
// `HourlyDetail` reads today's rows from the `darRows` PROP (App.js's shared `refreshDar`), not
// from this file's own `loadDailyActivity()` -- that second path only runs for a non-today date.
// App.js's `refreshDar` had its own hand-rolled `.select(...)` on `qsr_daily_activity` that was
// never updated when R2P/KVS/DT Parked%/Labor $%/TPPH were added to the Live Ops hourly table
// (2026-11-13) -- `loadDailyActivity()` in src/lib/supabase.js got the new columns, but the
// SEPARATE query actually wired to Signals via darRows/refreshDar did not. So `fc_trans_cnt`,
// `mfy1_trans_cnt`, etc. came back `undefined` for every row App.js fetched -- not because the
// underlying qsr_daily_activity data was missing anything, but because nobody asked Supabase for
// those columns on this path. The row-level math (`r.fc_trans_cnt > 0 ? ... : null`) then always
// took the `null` branch.
//
// This test can't render a live Supabase round trip, so it guards the thing that actually broke:
// the two `qsr_daily_activity` column lists living in App.js and supabase.js must never drift
// apart on the fields HourlyDetail's station-level formulas read. A metric-chains-style
// field-map test (CLAUDE.md: "regenerate the loader field map after touching a loader") --
// written by hand here since these two selects aren't in the generated map.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

function selectColumns(source, anchor) {
  const idx = source.indexOf(anchor);
  expect(idx, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  const selectIdx = source.indexOf(".select('", idx);
  expect(selectIdx, `.select(...) not found after anchor: ${anchor}`).toBeGreaterThan(-1);
  const start = selectIdx + ".select('".length;
  const end = source.indexOf("'", start);
  return source.slice(start, end).split(',').map(s => s.trim());
}

// Every field HourlyDetail (src/views/signals.js) reads off a raw qsr_daily_activity row to
// compute R2P, KVS, DT Parked%, Labor % (cost-based), and TPPH -- i.e. exactly the columns that
// silently went missing on the App.js path while OEPE/Punch-Need kept working.
const HOURLY_DETAIL_STATION_FIELDS = [
  'fc_trans_cnt', 'fc_untilserve', 'fc_untilclosedrawer',
  'mfy1_trans_cnt', 'mfy1_untilserve', 'mfy2_trans_cnt', 'mfy2_untilserve',
  'dt_carsheld',
  'actual_punched_dollars', 'prod_sales_scrubbed', 'trans_scrubbed',
];

describe('qsr_daily_activity column parity -- App.js refreshDar vs. supabase.js loadDailyActivity', () => {
  const appJs = fs.readFileSync(path.join(ROOT, 'src/app/App.js'), 'utf8');
  const supabaseJs = fs.readFileSync(path.join(ROOT, 'src/lib/supabase.js'), 'utf8');

  const appCols = selectColumns(appJs, 'const refreshDar = useCallback');
  const loaderCols = selectColumns(supabaseJs, 'export async function loadDailyActivity(');

  it.each(HOURLY_DETAIL_STATION_FIELDS)(
    "App.js's refreshDar select includes '%s' (HourlyDetail's today-view data source)",
    (field) => { expect(appCols).toContain(field); }
  );

  it.each(HOURLY_DETAIL_STATION_FIELDS)(
    "supabase.js's loadDailyActivity select includes '%s' (HourlyDetail's historical-view data source)",
    (field) => { expect(loaderCols).toContain(field); }
  );
});
