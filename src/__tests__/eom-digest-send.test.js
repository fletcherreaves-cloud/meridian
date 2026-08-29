// @ts-nocheck
// Dispatch #215 Task 3 — unit tests for scripts/eom-digest-send.mjs's pure adapter,
// classStatusesFromStatusAndLog(). The rest of this script (bootstrapLiveOrg/buildStoreRows/
// main) queries Supabase through the supabase-js client directly, which this repo's existing
// tests do not mock (no test anywhere mocks fetchFobSnapshotForStore's own supabase.from() call
// either — see qsrsoft-onhand-pull.mjs) since faithfully simulating supabase-js's wire protocol
// is itself a source of false confidence. Those paths were instead verified with a REAL live run
// against production Supabase during this dispatch's own build (27/27 stores loaded, live org
// bootstrap confirmed, all 7 real patches + district rolled up correctly) — see the PR body for
// the full transcript. This file covers the one piece that's genuinely pure.
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

import { describe, it, expect } from 'vitest';
import { classStatusesFromStatusAndLog } from '../../scripts/eom-digest-send.mjs';

describe('classStatusesFromStatusAndLog', () => {
  it('a class marked done on eom_count_status reads complete regardless of the log pct', () => {
    const status = { food_done: true, condiment_done: false, paper_done: false, nonproduct_done: false };
    const log = { food_pct: 0.6, condiment_pct: 0.4, paper_pct: 0, nonproduct_pct: 0 };
    const out = classStatusesFromStatusAndLog(status, log);
    expect(out.food.status).toBe('complete');
    expect(out.condiment.status).toBe('in_progress'); // not done, but pct > 0
    expect(out.paper.status).toBe('not_started');
  });

  it('a class present only in the log (no status row) still reads its pct-derived status', () => {
    const out = classStatusesFromStatusAndLog(null, { food_pct: 0.3, condiment_pct: 0, paper_pct: null, nonproduct_pct: null });
    expect(out.food.status).toBe('in_progress');
    expect(out.food.pct).toBe(0.3);
    expect(out.condiment.status).toBe('not_started');
  });

  it('a class present only in status (no log row) still reads done/not-started from the boolean', () => {
    const out = classStatusesFromStatusAndLog({ food_done: true, condiment_done: false, paper_done: false, nonproduct_done: false }, null);
    expect(out.food.status).toBe('complete');
    expect(out.condiment.status).toBe('not_started');
  });

  it('a class absent from BOTH sources reads not_applicable, never fabricated as not_started', () => {
    const out = classStatusesFromStatusAndLog({}, {});
    expect(out.food.status).toBe('not_applicable');
    expect(out.nonproduct.status).toBe('not_applicable');
  });

  it('neither status nor log at all -> every class not_applicable, not a crash', () => {
    const out = classStatusesFromStatusAndLog(null, null);
    for (const k of ['food', 'condiment', 'paper', 'nonproduct']) expect(out[k].status).toBe('not_applicable');
  });
});
