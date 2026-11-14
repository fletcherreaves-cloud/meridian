// @ts-nocheck
// Task #79 Phase 3 — Location Dossier: Layout/Equipment reference, Personnel summary (PII-gated
// per CLAUDE.md's 2026-11-11 resolved rule — see memory/finding-dossier-coaching-library-
// 2026-11-11.md §7), and broadened Important Findings (Visit Readiness/EcoSure + Guest Voice).
// See memory/plan-location-dossier-report-2026-11-04.md's "Phase 3 SHIPPED" section.
import { describe, it, expect } from 'vitest';
import {
  dossierEquipmentSummary, dossierLayoutZoneCounts, dossierPersonnelSummary, dossierSkillsSummary,
  dossierPayRateChanges, dossierVisitReadiness, dossierExtraFindings,
} from '../engine/location-dossier.js';
import { DEFAULT_TARGETS } from '../constants.js';

const recent = n => new Date(Date.now() - n * 864e5);

// ── Equipment / Layout ───────────────────────────────────────────────────────────────────────
describe('dossierEquipmentSummary', () => {
  it('reuses buildEquipmentStoreSummary verbatim -- counts the latest per-instance state only', () => {
    const entries = [
      { loc: '3708', instance_id: 'a', submitted_at: '2026-11-10T10:00:00Z', submitted_by: 'Jane', settings_reviewed: true, action: 'added' },
      { loc: '3708', instance_id: 'b', submitted_at: '2026-11-09T10:00:00Z', submitted_by: 'Jane', settings_reviewed: false, action: 'added' },
      // A later 'removed' row for instance 'b' -- should drop it from itemCount, same as the
      // real Equipment Results panel/Layout Planner editor (latestEntriesByInstance's own rule).
      { loc: '3708', instance_id: 'b', submitted_at: '2026-11-12T10:00:00Z', submitted_by: 'Mike', action: 'removed' },
    ];
    const s = dossierEquipmentSummary(entries);
    expect(s.itemCount).toBe(1); // only instance 'a' survives
    expect(s.reviewedCount).toBe(1);
    expect(s.lastSubmittedAt).toBe('2026-11-12T10:00:00Z'); // most recent row regardless of action
    expect(s.lastSubmittedBy).toBe('Mike');
  });

  it('no entries -> null, not a crash', () => {
    expect(dossierEquipmentSummary([])).toBeNull();
    expect(dossierEquipmentSummary(null)).toBeNull();
  });
});

describe('dossierLayoutZoneCounts', () => {
  it('groups current-state entries by placement zone, using PLACEMENTS\' own labels', () => {
    const entries = [
      { loc: '3708', instance_id: 'a', submitted_at: '2026-11-10T10:00:00Z', placement_zone: 'drive_thru' },
      { loc: '3708', instance_id: 'b', submitted_at: '2026-11-10T10:00:00Z', placement_zone: 'drive_thru' },
      { loc: '3708', instance_id: 'c', submitted_at: '2026-11-10T10:00:00Z', placement_zone: 'front_counter' },
      { loc: '3708', instance_id: 'd', submitted_at: '2026-11-10T10:00:00Z' }, // no zone -- excluded
    ];
    const zones = dossierLayoutZoneCounts(entries);
    expect(zones.find(z => z.zone === 'drive_thru')).toEqual({ zone: 'drive_thru', label: 'Drive Thru', count: 2 });
    expect(zones.find(z => z.zone === 'front_counter')).toEqual({ zone: 'front_counter', label: 'Front Counter', count: 1 });
    // Zero-count zones (every other PLACEMENTS entry) are filtered out, not padded with 0s.
    expect(zones.every(z => z.count > 0)).toBe(true);
  });

  it('no entries -> empty array', () => {
    expect(dossierLayoutZoneCounts([])).toEqual([]);
  });
});

// ── Personnel ────────────────────────────────────────────────────────────────────────────────
describe('dossierPersonnelSummary', () => {
  it('buckets active rows by classified role; never surfaces a name (none selected)', () => {
    const rows = [
      { loc: '3708', employment_status: 'Active', job_title_code: 45 },   // GM
      { loc: '3708', employment_status: 'Active', job_title_code: 647 },  // SM
      { loc: '3708', employment_status: 'Active', job_title_code: 845, hourly_pay_rate: 22 }, // DM (hourly)
      { loc: '3708', employment_status: 'Active', job_title_code: 845, hourly_pay_rate: 0 },  // AM (salaried)
      { loc: '3708', employment_status: 'Active', job_title_code: null }, // crew (no review-role code)
      { loc: '3708', employment_status: 'Inactive', job_title_code: 45 }, // excluded -- not active
      { loc: '3708', employment_status: 'Active', termination_entry_date: '2026-10-01', job_title_code: 45 }, // excluded -- terminated
      { loc: '9999', employment_status: 'Active', job_title_code: 45 },   // excluded -- different store
    ];
    const s = dossierPersonnelSummary(rows, '3708');
    expect(s).toEqual({ total: 5, gm: 1, am: 1, dm: 1, sm: 1, crew: 1 });
    expect(s).not.toHaveProperty('name');
  });

  it('no rows for this store -> null', () => {
    expect(dossierPersonnelSummary([{ loc: '9999', employment_status: 'Active', job_title_code: 45 }], '3708')).toBeNull();
    expect(dossierPersonnelSummary(null, '3708')).toBeNull();
  });
});

describe('dossierSkillsSummary', () => {
  it('counts crew + jobs covered at proficient (>=3), same threshold skills-matrix.js uses', () => {
    const rows = [
      { loc: '3708', employee: 'A', skills: { GRILL: 4, FRIES: 2 } },
      { loc: '3708', employee: 'B', skills: { GRILL: 1 } },
      { loc: '9999', employee: 'C', skills: { GRILL: 5 } }, // different store -- excluded
    ];
    const s = dossierSkillsSummary(rows, '3708');
    expect(s.crewCount).toBe(2);
    expect(s.jobCount).toBe(2); // GRILL, FRIES
    expect(s.coveredJobCount).toBe(1); // only GRILL has anyone >= 3 (A's 4)
  });

  it('no rows for this store -> null', () => {
    expect(dossierSkillsSummary([], '3708')).toBeNull();
  });
});

describe('dossierPayRateChanges', () => {
  it('merges management (qsr_tenure) + crew (lifelenz_roster) populations for one store', () => {
    const rows = [
      { source: 'qsr_tenure', personKey: 'p1', loc: '3708', employeeName: 'GM One', jobTitle: 'GM',
        effectiveDate: '2026-10-15', priorRate: 20, newRate: 22 },
      { source: 'lifelenz_roster', personKey: 'p2', loc: '3708', employeeName: 'Crew One', jobTitle: 'Crew',
        effectiveDate: '2026-09-01', priorRate: 10, newRate: 10.5 },
      { source: 'qsr_tenure', personKey: 'p3', loc: '9999', employeeName: 'Other Store', jobTitle: 'GM',
        effectiveDate: '2026-10-20', priorRate: 20, newRate: 21 },
    ];
    const all = dossierPayRateChanges(rows, '3708');
    expect(all.length).toBe(2);
    expect(all.map(r => r.name).sort()).toEqual(['Crew One', 'GM One']);
  });

  it('filters to a window when one is given', () => {
    const rows = [
      { source: 'qsr_tenure', personKey: 'p1', loc: '3708', employeeName: 'In Window',
        effectiveDate: '2026-10-15', priorRate: 20, newRate: 22 },
      { source: 'qsr_tenure', personKey: 'p2', loc: '3708', employeeName: 'Out Of Window',
        effectiveDate: '2026-01-01', priorRate: 20, newRate: 21 },
    ];
    const windowed = dossierPayRateChanges(rows, '3708', { s: '2026-10-01', e: '2026-10-31' });
    expect(windowed.map(r => r.name)).toEqual(['In Window']);
  });

  it('no rows -> empty array, not a crash', () => {
    expect(dossierPayRateChanges([], '3708')).toEqual([]);
    expect(dossierPayRateChanges(null, '3708')).toEqual([]);
  });
});

// ── Broadened Important Findings (Visit Readiness/EcoSure + Guest Voice) ───────────────────────
// Same goodRows/badRows/mkDs fixture shape visit-readiness.test.js already established for
// computeVisitReadiness -- reused here rather than re-derived, per this repo's own "check
// whether a helper exists" rule (these aren't exported, so inlined the same minimal shape).
const GOOD = '3708', BAD = '5183';
function badRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 1.6, kvst: t.tKvst * 1.7, laborPct: t.tCrewLabor * 1.4 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 2.5, r2p: t.tR2p * 1.6 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 0.6, laborPct: t.tCrewLabor * 1.4 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 20 })),
    smg: [{ loc, year: 2026, month: 6, accuracyB2B: 84, overallProblem: 22, osatB2B: 78 }],
    ctrl: days.map(d => ({ loc, date: d, tRedAPct: t.tRedAPct * 3 })),
    fob: [{ loc, date: recent(10), compWaste: t.tCompWaste * 4, rawWaste: t.tRawWaste * 4, statVar: t.tStatLoss * 4 }],
  };
}
function mkDs(...perStore) {
  const ds = { glimpseRows: [], opsRows: [], laborRows: [], schedRows: [], smgFullscale: [], ctrlRows: [], fobRows: [] };
  for (const s of perStore) {
    ds.glimpseRows.push(...s.glimpse); ds.opsRows.push(...s.ops); ds.laborRows.push(...s.labor);
    ds.schedRows.push(...s.sched); ds.smgFullscale.push(...s.smg); ds.ctrlRows.push(...s.ctrl); ds.fobRows.push(...s.fob);
  }
  return ds;
}

describe('dossierVisitReadiness', () => {
  it('returns this store\'s own computeVisitReadiness() object, scoped to just this loc', () => {
    const ds = mkDs(badRows(BAD));
    const mine = dossierVisitReadiness(ds, BAD);
    expect(mine).toBeTruthy();
    expect(mine.loc).toBe(BAD);
    expect(mine.band).toBe('at-risk');
    expect(mine.fsFlag).toBe('elevated');
  });

  it('no data for this store -> null, not a crash', () => {
    expect(dossierVisitReadiness({}, '0000000')).toBeNull();
  });
});

describe('dossierExtraFindings', () => {
  it('surfaces a food-safety + visit-readiness finding for an at-risk store, in topFindings() shape', () => {
    const ds = mkDs(badRows(BAD));
    const findings = dossierExtraFindings(ds, BAD);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    for (const f of findings) {
      expect(['crit', 'watch']).toContain(f.t);
      expect(typeof f.m).toBe('string');
      // The store name is deliberately blanked (the dossier is already scoped to one store) --
      // visitRisk()'s own title format is "<name> — <text>"; blanking leaves no stray leading
      // separator once stripped.
      expect(f.m.startsWith('—')).toBe(false);
    }
  });

  it('a clean store with no SMG rows surfaces no extra findings, not an error', () => {
    expect(dossierExtraFindings({}, '0000000')).toEqual([]);
  });

  it('surfaces a Guest Voice finding when a store has enough negative comments', () => {
    const smgRows = [];
    for (let i = 0; i < 5; i++) {
      smgRows.push({ loc: GOOD, satisfactionLabel: 'Dissatisfied', text: 'slow service ' + i });
    }
    const ds = { smgRows };
    const findings = dossierExtraFindings(ds, GOOD);
    expect(findings.some(f => f.m.toLowerCase().includes('unhappy guest comment'))).toBe(true);
  });
});
