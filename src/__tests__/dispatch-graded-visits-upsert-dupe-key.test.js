// @ts-nocheck
// Live import crash (2026-09-05): running scripts/import-graded-visits-bulk.mjs against a real
// capture threw "ON CONFLICT DO UPDATE command cannot affect row a second time" at the Supabase
// upsert. Root cause: chunkedUpsertGradedVisits() (scripts/lib/graded-visits-upsert.mjs) passes
// each 100-row chunk straight to a single upsert() call, and Postgres rejects a single upsert
// statement that names the same (loc, visit_date, report_type) conflict key twice -- regardless of
// chunk size, since it's a per-statement rule, not a per-chunk-boundary one. The real seed had one
// genuine collision: store 33222 had two separate RGR visits both dated 2025-05-21 (scores 100 and
// 94) -- a true same-day double-visit, not a capture bug, but the table's key can only hold one row
// for that (loc, visit_date, report_type). This same latent bug exists in the older
// import-ecosure-history.mjs (identical unguarded rows.map()+upsert(chunk) shape) -- it just never
// happened to capture a same-day double visit before. Fixed once in the shared helper so all three
// importers are protected.
import { describe, it, expect, vi } from 'vitest';
import { chunkedUpsertGradedVisits } from '../../scripts/lib/graded-visits-upsert.mjs';

function mockSupabase() {
  const upserted = [];
  return {
    upserted,
    from: () => ({
      upsert: (chunk) => { upserted.push(chunk); return Promise.resolve({ error: null }); },
    }),
  };
}

describe('chunkedUpsertGradedVisits dedupe (dispatch, 2026-09-05)', () => {
  it('THE CRASH: two rows sharing a conflict key in the same chunk must not both reach one upsert call', async () => {
    const supabase = mockSupabase();
    const rows = [
      { loc: '33222', visit_date: '2025-05-21', report_type: 'RGR', score: 100 },
      { loc: '33222', visit_date: '2025-05-21', report_type: 'RGR', score: 94 }, // same key, real 2nd visit
      { loc: '11657', visit_date: '2026-04-22', report_type: 'RGR', score: 90.8 },
    ];
    const saved = await chunkedUpsertGradedVisits(supabase, rows, 100);
    expect(saved).toBe(2); // deduped: 2 unique keys, not 3 rows
    expect(supabase.upserted).toHaveLength(1); // one chunk, no crash
    const sentKeys = supabase.upserted[0].map(r => `${r.loc}|${r.visit_date}|${r.report_type}`);
    expect(new Set(sentKeys).size).toBe(sentKeys.length); // no duplicate keys reach Supabase
  });

  it('keeps the LAST row per key (matches sequential single-row upsert semantics)', async () => {
    const supabase = mockSupabase();
    const rows = [
      { loc: '33222', visit_date: '2025-05-21', report_type: 'RGR', score: 100 },
      { loc: '33222', visit_date: '2025-05-21', report_type: 'RGR', score: 94 },
    ];
    await chunkedUpsertGradedVisits(supabase, rows, 100);
    expect(supabase.upserted[0]).toHaveLength(1);
    expect(supabase.upserted[0][0].score).toBe(94);
  });

  it('warns when a collision occurs, so a real second-visit-same-day case is visible, not silent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = mockSupabase();
    const rows = [
      { loc: '33222', visit_date: '2025-05-21', report_type: 'RGR', score: 100 },
      { loc: '33222', visit_date: '2025-05-21', report_type: 'RGR', score: 94 },
    ];
    await chunkedUpsertGradedVisits(supabase, rows, 100);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('shared a (loc, visit_date, report_type) key'));
    warn.mockRestore();
  });

  it('no collision, no warning, and row order/content is otherwise untouched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = mockSupabase();
    const rows = [
      { loc: '11657', visit_date: '2026-04-22', report_type: 'RGR', score: 90.8 },
      { loc: '11657', visit_date: '2026-04-23', report_type: 'RGR', score: 85.0 },
    ];
    const saved = await chunkedUpsertGradedVisits(supabase, rows, 100);
    expect(saved).toBe(2);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('dedupe runs across chunk boundaries, not just within one chunk', async () => {
    const supabase = mockSupabase();
    // chunkSize=1 forces each row into its own chunk if dedup were per-chunk instead of global --
    // this proves dedup happens before chunking, since a per-chunk dedupe would let both through.
    const rows = [
      { loc: '33222', visit_date: '2025-05-21', report_type: 'RGR', score: 100 },
      { loc: '33222', visit_date: '2025-05-21', report_type: 'RGR', score: 94 },
    ];
    const saved = await chunkedUpsertGradedVisits(supabase, rows, 1);
    expect(saved).toBe(1);
    expect(supabase.upserted.flat()).toHaveLength(1);
  });
});
