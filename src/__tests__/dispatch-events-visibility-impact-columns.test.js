// @ts-nocheck
// Phase 2 of memory/project-events-calendar-redesign-2026-09-04.md — org_events' new visibility/
// relevance/expected_impact/impact_confidence/impact_n/lead_days/lag_days/rrule columns
// (supabase/schema-org-events-visibility-impact.sql), wired into loadOrgEvents/saveOrgEvents/
// updateOrgEvent (src/lib/supabase.js) and orgEventsToDayMap (src/engine/events-import.js).
//
// Per "would this verification still pass if reverted?": mocks the Supabase client (same pattern
// dispatch-170-pmix-loader-scope.test.js already uses) and asserts on the ACTUAL rows sent to
// upsert/update, not just that a function returns without throwing -- a revert of the column-name
// mapping or the visibility-default logic changes what these tests observe on the wire.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { orgEventsToDayMap } from '../engine/events-import.js';

const __calls = { upserts: [], updates: [] };
function mkBuilder(table) {
  const builder = {
    _selectCols: null,
    select(cols) { builder._selectCols = cols; return builder; },
    order() { return builder; },
    range(from, to) {
      const rows = (mkBuilder.rows || []).slice(from, to + 1);
      return Promise.resolve({ data: rows, error: null });
    },
    upsert(rows) {
      __calls.upserts.push(rows);
      const err = mkBuilder.nextUpsertError;
      if (err && !mkBuilder._upsertErrorConsumed) { mkBuilder._upsertErrorConsumed = true; return Promise.resolve({ error: err, count: null }); }
      return Promise.resolve({ error: null, count: rows.length });
    },
    update(row) {
      __calls.updates.push(row);
      return {
        eq() {
          const err = mkBuilder.nextUpdateError;
          if (err && !mkBuilder._updateErrorConsumed) { mkBuilder._updateErrorConsumed = true; return Promise.resolve({ error: err }); }
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return builder;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table) => mkBuilder(table) }),
}));

let loadOrgEvents, saveOrgEvents, updateOrgEvent;
beforeEach(async () => {
  vi.resetModules();
  __calls.upserts.length = 0; __calls.updates.length = 0;
  mkBuilder.rows = [];
  mkBuilder.nextUpsertError = null; mkBuilder._upsertErrorConsumed = false;
  mkBuilder.nextUpdateError = null; mkBuilder._updateErrorConsumed = false;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadOrgEvents, saveOrgEvents, updateOrgEvent } = await import('../lib/supabase.js'));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('loadOrgEvents — visibility/impact columns', () => {
  it('reads every new column, defaulting missing ones sensibly', async () => {
    mkBuilder.rows = [{
      id: 1, loc: '3708', date_start: '2026-11-26', date_end: '2026-11-26', span: false,
      category: 'Holiday', event_type: 'holiday', label: 'Thanksgiving',
      visibility: 'calendar', relevance: 72, expected_impact: { sales: 0.08 },
      impact_confidence: 'measured', impact_n: 14, lead_days: 1, lag_days: 0, rrule: null,
    }];
    const [row] = await loadOrgEvents();
    expect(row.visibility).toBe('calendar');
    expect(row.relevance).toBe(72);
    expect(row.expectedImpact).toEqual({ sales: 0.08 });
    expect(row.impactConfidence).toBe('measured');
    expect(row.impactN).toBe(14);
    expect(row.leadDays).toBe(1);
    expect(row.lagDays).toBe(0);
  });

  it('a row with no visibility set reads back null (not defaulted here — that is the consumer\'s job)', async () => {
    mkBuilder.rows = [{ id: 2, loc: '3708', date_start: '2026-07-04', date_end: '2026-07-04', span: false, event_type: 'holiday', label: 'Independence Day' }];
    const [row] = await loadOrgEvents();
    expect(row.visibility).toBeNull();
    expect(row.leadDays).toBe(0); // lead_days/lag_days DO default (they're NOT NULL DEFAULT 0 in the schema)
    expect(row.lagDays).toBe(0);
  });
});

describe('saveOrgEvents — visibility defaulting + write', () => {
  it("defaults visibility from the event's own type when not explicitly set (power -> log)", async () => {
    await saveOrgEvents([{ loc: '3708', dateStart: '2026-08-01', dateEnd: '2026-08-01', type: 'power', label: 'Power Outage' }]);
    expect(__calls.upserts[0][0].visibility).toBe('log');
  });

  it('sports defaults to calendar', async () => {
    await saveOrgEvents([{ loc: '3708', dateStart: '2026-09-12', dateEnd: '2026-09-12', type: 'sports', label: 'Rival Game' }]);
    expect(__calls.upserts[0][0].visibility).toBe('calendar');
  });

  it('an explicit visibility override wins over the type default', async () => {
    await saveOrgEvents([{ loc: '3708', dateStart: '2026-09-12', dateEnd: '2026-09-12', type: 'sports', label: 'Rival Game', visibility: 'log' }]);
    expect(__calls.upserts[0][0].visibility).toBe('log');
  });

  it('writes relevance/expectedImpact/impactConfidence/impactN/leadDays/lagDays/rrule to their DB columns', async () => {
    await saveOrgEvents([{
      loc: '3708', dateStart: '2026-09-12', dateEnd: '2026-09-12', type: 'sports', label: 'Rival Game',
      relevance: 55, expectedImpact: { sales: 0.1 }, impactConfidence: 'estimated', impactN: 3,
      leadDays: 1, lagDays: 1, rrule: 'FREQ=YEARLY',
    }]);
    const row = __calls.upserts[0][0];
    expect(row.relevance).toBe(55);
    expect(row.expected_impact).toEqual({ sales: 0.1 });
    expect(row.impact_confidence).toBe('estimated');
    expect(row.impact_n).toBe(3);
    expect(row.lead_days).toBe(1);
    expect(row.lag_days).toBe(1);
    expect(row.rrule).toBe('FREQ=YEARLY');
  });

  // Real Supabase error text, confirmed live 2026-09-04 against production org_events (the
  // Phase 1 collapse script's first run hit exactly this on the `status` column) -- PostgREST's
  // schema-cache-miss message for an upsert with an unrecognized JSON key, NOT the raw Postgres
  // `column "x" does not exist` (42703) shape a SELECT-path error would use. A self-heal check
  // written only for the "does not exist" phrasing never fires against a real upsert failure.
  const REAL_SCHEMA_CACHE_ERROR = "Could not find the 'visibility' column of 'org_events' in the schema cache";

  it('self-heals (strips the new columns and retries) when the DB has not run the migration yet', async () => {
    mkBuilder.nextUpsertError = { message: REAL_SCHEMA_CACHE_ERROR };
    const { saved, errors } = await saveOrgEvents([{ loc: '3708', dateStart: '2026-09-12', dateEnd: '2026-09-12', type: 'sports', label: 'Rival Game' }]);
    expect(errors).toEqual([]);
    expect(saved).toBe(1);
    // Second (retried) upsert call must not carry any of the Phase 2 columns.
    const retried = __calls.upserts[1][0];
    expect(retried).not.toHaveProperty('visibility');
    expect(retried).not.toHaveProperty('relevance');
    expect(retried).not.toHaveProperty('rrule');
    // But it must still carry everything else (this wasn't a total wipeout of the row).
    expect(retried.label).toBe('Rival Game');
  });

  it('does NOT self-heal on the real error text with the old narrow "does not exist"-only pattern (regression guard)', () => {
    const oldNarrowPattern = /column .*(visibility|relevance).* does not exist/i;
    expect(oldNarrowPattern.test(REAL_SCHEMA_CACHE_ERROR)).toBe(false);
  });

  // The scope/status self-heals pre-date this dispatch and had the identical narrow-pattern bug
  // (only ever matched a raw "does not exist" 42703 text, never PostgREST's real schema-cache-
  // miss shape) -- fixed here alongside the new Phase 2 checks since it's the same helper.
  it('the pre-existing scope self-heal also fires on the real schema-cache-miss text now', async () => {
    mkBuilder.nextUpsertError = { message: "Could not find the 'scope' column of 'org_events' in the schema cache" };
    const { saved, errors } = await saveOrgEvents([{ loc: '3708', dateStart: '2026-09-12', dateEnd: '2026-09-12', type: 'sports', label: 'Rival Game' }]);
    expect(errors).toEqual([]);
    expect(saved).toBe(1);
    expect(__calls.upserts[1][0]).not.toHaveProperty('scope');
  });
});

describe('updateOrgEvent — visibility/impact patch fields', () => {
  it('patches visibility to its own column', async () => {
    await updateOrgEvent(42, { visibility: 'log' });
    expect(__calls.updates[0].visibility).toBe('log');
  });

  it('self-heals when the DB has not run the migration yet (real PostgREST schema-cache-miss text)', async () => {
    mkBuilder.nextUpdateError = { message: "Could not find the 'visibility' column of 'org_events' in the schema cache" };
    const { error } = await updateOrgEvent(42, { visibility: 'log', note: 'still updates this' });
    expect(error).toBeNull();
    const retried = __calls.updates[1];
    expect(retried).not.toHaveProperty('visibility');
    expect(retried.note).toBe('still updates this');
  });

  it('the pre-existing status self-heal also fires on the real schema-cache-miss text now', async () => {
    mkBuilder.nextUpdateError = { message: "Could not find the 'status' column of 'org_events' in the schema cache" };
    const { error } = await updateOrgEvent(42, { status: 'canceled', note: 'still updates this' });
    expect(error).toBeNull();
    const retried = __calls.updates[1];
    expect(retried).not.toHaveProperty('status');
    expect(retried.note).toBe('still updates this');
  });
});

describe('orgEventsToDayMap — carries the new fields through to day-map entries', () => {
  it('passes visibility/relevance/expectedImpact/impactConfidence/impactN/leadDays/lagDays/rrule through unchanged', () => {
    const events = [{
      loc: '3708', dateStart: '2026-11-26', dateEnd: '2026-11-26', label: 'Thanksgiving', type: 'holiday',
      visibility: 'calendar', relevance: 80, expectedImpact: { sales: 0.1 }, impactConfidence: 'measured',
      impactN: 20, leadDays: 1, lagDays: 0, rrule: null,
    }];
    const map = orgEventsToDayMap(events);
    const entry = map['3708']['2026-11-26'];
    expect(entry.visibility).toBe('calendar');
    expect(entry.relevance).toBe(80);
    expect(entry.expectedImpact).toEqual({ sales: 0.1 });
    expect(entry.impactConfidence).toBe('measured');
    expect(entry.impactN).toBe(20);
    expect(entry.leadDays).toBe(1);
    expect(entry.lagDays).toBe(0);
  });

  it('a row with none of the Phase 2 fields set (old data) still expands cleanly, with null visibility/relevance and 0 lead/lag', () => {
    const events = [{ loc: '3708', dateStart: '2026-07-04', dateEnd: '2026-07-04', label: 'Independence Day', type: 'holiday' }];
    const map = orgEventsToDayMap(events);
    const entry = map['3708']['2026-07-04'];
    expect(entry.visibility).toBeNull();
    expect(entry.relevance).toBeNull();
    expect(entry.leadDays).toBe(0);
    expect(entry.lagDays).toBe(0);
  });
});
