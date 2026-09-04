// @ts-nocheck
// saveGradedVisits() (src/lib/supabase.js) — EcoSure rows carry a reviewer's real name
// (reviewerName, from parseEcoSureVisit()) that must NEVER reach the graded_visits table as
// plaintext (memory/finding-ecosure-propel-api-2026-08-22.md's own PII note: "reviewedWithName is
// an employee name... routed through get_or_create_employee_token() like every other person
// field"). This drives the actual save function through a mocked Supabase client (matching
// dispatch #218's established pattern for src/lib/supabase.js tests) and inspects the exact
// payload sent to .upsert() — the only way to prove the plaintext name never left the client, not
// just that tokenizeRows() itself works (already covered in isolation by identity-vault.test.js).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const __upserted = { graded_visits: [] };
const __rpcCalls = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      return {
        upsert(rows) {
          __upserted[table] = rows;
          return Promise.resolve({ error: null });
        },
      };
    },
    rpc(fn, args) {
      __rpcCalls.push({ fn, args });
      // Opaque, name-independent fake token (a real get_or_create_employee_token() RPC returns a
      // uuid with no relation to the input name) -- deliberately NOT derived from p_employee_name,
      // so a test asserting the plaintext name is absent from the saved payload can't pass by
      // accident just because the fake token happens to embed it.
      const fakeTokenByName = { 'Jane Manager': 'a1b2c3d4-tok' };
      return Promise.resolve({ data: fakeTokenByName[args.p_employee_name] || 'unknown-tok', error: null });
    },
  }),
}));

let saveGradedVisits;
beforeEach(async () => {
  vi.resetModules();
  __upserted.graded_visits = [];
  __rpcCalls.length = 0;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ saveGradedVisits } = await import('../lib/supabase.js'));
});

function ecoSureRow(overrides = {}) {
  return {
    reportType: 'EcoSure', store: '3708', dateISO: '2026-08-11', score: 86, pass: true,
    reviewerName: 'Jane Manager', modules: { citedCount: 4 }, title: 'EcoSure Food Safety Visit',
    ...overrides,
  };
}

describe('saveGradedVisits — EcoSure reviewer-name tokenization', () => {
  it('tokenizes reviewerName via get_or_create_employee_token and writes ONLY the token into visit_by', async () => {
    await saveGradedVisits([ecoSureRow()]);
    expect(__rpcCalls).toEqual([{ fn: 'get_or_create_employee_token', args: { p_employee_name: 'Jane Manager' } }]);
    expect(__upserted.graded_visits).toHaveLength(1);
    expect(__upserted.graded_visits[0].visit_by).toBe('a1b2c3d4-tok');
  });

  it('the plaintext reviewer name never appears anywhere in the upserted payload', async () => {
    await saveGradedVisits([ecoSureRow()]);
    const payload = JSON.stringify(__upserted.graded_visits);
    expect(payload).not.toContain('Jane Manager');
  });

  it('calls the RPC once per distinct reviewer, not once per row', async () => {
    await saveGradedVisits([
      ecoSureRow({ dateISO: '2026-08-11' }),
      ecoSureRow({ dateISO: '2026-05-01' }), // same reviewer, different visit date
    ]);
    expect(__rpcCalls).toHaveLength(1);
    expect(__upserted.graded_visits).toHaveLength(2);
    expect(__upserted.graded_visits.every(r => r.visit_by === 'a1b2c3d4-tok')).toBe(true);
  });

  it('CFV/RGR rows (no reviewerName) are unaffected -- visitBy still flows through as before', async () => {
    await saveGradedVisits([{ reportType: 'CFV', store: '3708', dateISO: '2026-08-11', score: 90, pass: true, visitBy: 'Inspector Co' }]);
    expect(__rpcCalls).toHaveLength(0); // no reviewerName present -> tokenizeRows sees nothing to tokenize
    expect(__upserted.graded_visits[0].visit_by).toBe('Inspector Co');
  });

  it('a row with no reviewerName at all saves with visit_by: null, no RPC call for it', async () => {
    await saveGradedVisits([ecoSureRow({ reviewerName: null })]);
    expect(__rpcCalls).toHaveLength(0);
    expect(__upserted.graded_visits[0].visit_by).toBeNull();
  });
});
