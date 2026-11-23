// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 1 delta-sync pilot #4 (2026-11-22) — watermark delta-sync for
// lifelenz_compliance_audit. Same shape as pilots #1-#3, now that
// loadLifeLenzComplianceAudit's mapped return shape actually exposes `seq` — fixed in the SAME
// commit as this pilot (the loader previously had no `seq` field, even though it's part of the
// table's real primary key `(loc, compliance_warning_id, seq)` —
// supabase/schema-lifelenz-compliance-audit.sql:22-44).
//
// _stComplianceAudit now asks Supabase for only rows whose `updated_at` moved since the last
// sync (loadLifeLenzComplianceAudit's `since` param) instead of re-fetching the whole `daysBack`
// window every login, then MERGES the delta into the cached array by
// (loc, complianceWarningId, seq) instead of replacing it. maxUpdatedAt itself is already
// covered by the lifelenz_schedule pilot's own test file — not re-tested here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeLifelenzComplianceAuditDelta } = await import('../app/App.js');

const row = (loc, complianceWarningId, seq, extra = {}) => ({ loc, complianceWarningId, seq, ...extra });

describe('mergeLifelenzComplianceAuditDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,complianceWarningId,seq) key, not a duplicate', () => {
    const prev = [row('3708', 'cw-001', 0, { shiftDate: '2026-11-10', costPenalty: 10 })];
    const delta = [row('3708', 'cw-001', 0, { shiftDate: '2026-11-10', costPenalty: 15 })];
    const merged = mergeLifelenzComplianceAuditDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].costPenalty).toBe(15);
  });

  it('two violations sharing an id are distinct keys via seq, not collapsed (the defensive tie-breaker case)', () => {
    const prev = [
      row('3708', 'cw-001', 0, { shiftDate: '2026-11-10', costPenalty: 10 }),
      row('3708', 'cw-001', 1, { shiftDate: '2026-11-10', costPenalty: 20 }),
    ];
    const merged = mergeLifelenzComplianceAuditDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.some(r => r.seq === 0 && r.costPenalty === 10)).toBe(true);
    expect(merged.some(r => r.seq === 1 && r.costPenalty === 20)).toBe(true);
  });

  it('a delta row for a NEW key is added alongside the untouched cached rows', () => {
    const prev = [row('3708', 'cw-001', 0, { shiftDate: '2026-11-10', costPenalty: 10 })];
    const delta = [row('5183', 'cw-002', 0, { shiftDate: '2026-11-11', costPenalty: 30 })];
    const merged = mergeLifelenzComplianceAuditDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').costPenalty).toBe(10);
    expect(merged.find(r => r.loc === '5183').costPenalty).toBe(30);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [
      row('3708', 'cw-001', 0, { shiftDate: '2026-11-10', costPenalty: 10 }),
      row('3708', 'cw-002', 0, { shiftDate: '2026-11-11', costPenalty: 20 }),
    ];
    const merged = mergeLifelenzComplianceAuditDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    // `recent` must stay well inside the 45-day window on every run — see
    // memory/plan-egress-reduction-2026-11-20.md's standing warning against hardcoded fixture
    // dates in these window-prune tests. Compute it relative to now.
    const d = new Date(); d.setDate(d.getDate() - 5);
    const recentShiftDate = d.toISOString().slice(0, 10);
    const farPast = row('3708', 'cw-001', 0, { shiftDate: '2020-01-01', costPenalty: 1 }); // >45 days back
    const recent  = row('3708', 'cw-002', 0, { shiftDate: recentShiftDate, costPenalty: 2 });
    const merged = mergeLifelenzComplianceAuditDelta([farPast, recent], [], { daysBack: 45 });
    expect(merged.some(r => r.costPenalty === 1)).toBe(false);
    expect(merged.some(r => r.costPenalty === 2)).toBe(true);
  });

  it('different stores at the identical (complianceWarningId,seq) are distinct keys, not collapsed into one row', () => {
    const prev = [
      row('3708', 'cw-001', 0, { shiftDate: '2026-11-10', costPenalty: 10 }),
      row('5183', 'cw-001', 0, { shiftDate: '2026-11-10', costPenalty: 20 }),
    ];
    const merged = mergeLifelenzComplianceAuditDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });
});
