// @ts-nocheck
// Real bug, caught live (owner testing in the app, 2026-09-05): loadGradedVisits()
// (src/lib/supabase.js) does `select('*')` against Supabase -- so the raw row DOES carry
// peak_detail -- but then remaps every row into a hand-picked camelCase object literal that
// never included it. The DB write, the RLS read, and PeakDetailBlock's render logic were all
// correct in isolation; the field was silently dropped in the one place that translates the raw
// DB row into what the rest of the app actually sees. `dispatch-peak-detail-block.test.js`'s own
// fixtures used the WRONG field name (peak_detail, matching the bug) and so never caught this --
// a textbook case of a test mirroring the bug instead of the real call site (CLAUDE.md's "would
// this verification still pass if the change were reverted?").
//
// This is a source-inspection test, not a live-Supabase one (supabase.js instantiates its client
// at module load from env vars this test suite doesn't set) -- same pattern
// sage-paginate.test.js's fetchAllRowsCalls scan already uses for the same reason. It reads the
// actual loadGradedVisits() function body, so a future edit that drops the peakDetail mapping (or
// changes the DB column it reads from) fails this test rather than silently regressing again.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../lib/supabase.js', import.meta.url), 'utf8');

function loadGradedVisitsBody() {
  const start = src.indexOf('export async function loadGradedVisits');
  expect(start, 'loadGradedVisits not found in supabase.js').toBeGreaterThan(-1);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end);
}

describe('loadGradedVisits() carries peak_detail through as peakDetail', () => {
  const body = loadGradedVisitsBody();

  it('selects peak_detail from Supabase (select(\'*\') or an explicit column list)', () => {
    const selectsStar = /\.select\(\s*['"]\*['"]\s*\)/.test(body);
    const selectsExplicitly = /\.select\([^)]*peak_detail/.test(body);
    expect(selectsStar || selectsExplicitly, 'query must select(\'*\') or explicitly include peak_detail').toBe(true);
  });

  it('maps the raw row\'s peak_detail column onto the returned object as peakDetail', () => {
    // The exact assignment the bug was missing -- revert-sensitive: removing this line, or
    // renaming either side, fails this test.
    expect(body).toMatch(/peakDetail:\s*r\.peak_detail/);
  });

  it('every other already-shipped field is still mapped (this fix did not remove anything)', () => {
    // A spot check of fields loadGradedVisits has carried since before this fix -- proves the
    // peakDetail addition was additive, not a rewrite that could have dropped something else.
    for (const field of ['id: r.id', 'reportType: r.report_type', 'score: r.score', 'pass: r.pass', "modules: r.modules"]) {
      expect(body).toContain(field);
    }
  });
});
