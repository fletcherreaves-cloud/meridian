// @ts-nocheck
// Tests for the PEAK per-visit-detail parser (parsePeakRoipVisit, src/parsers/graded-visits.js)
// and the enrichment-only import script (scripts/import-peak-visit-detail.mjs).
//
// peak.mcd.com's RoipSurvey/<visitId> endpoint is a SEPARATE McDonald's system from Propel that
// runs the actual visit-scoring survey -- confirmed live 2026-09-05 (real HAR capture, see
// memory/finding-peak-visit-detail-api-2026-09-05.md) to return EVERY question on a visit (not
// just cited/failed ones), each with full text, score, possible score, critical flag, and a
// per-question comment field populated with real inspector comments. The fixture below reproduces
// that real capture's shape (category tree, question codes CU1-US/CU8-US/CU9-US, VisitTypeId 3801
// = Customer First Visit) with fabricated names/comments in place of the real captured ones.
//
// This is an ENRICHMENT-only path: PEAK's own VisitId is a different id space than Propel's
// (never confirmed to coincide), so it never creates a graded_visits row -- it only updates an
// EXISTING row's peak_detail column, matched by (loc, visit_date, report_type), and reports (never
// inserts) a visit with no matching row.
import { describe, it, expect } from 'vitest';
import { parsePeakRoipVisit } from '../parsers/graded-visits.js';
import { buildPeakDetailPayload, enrichExistingVisits } from '../../scripts/import-peak-visit-detail.mjs';

function roipSurveyFixture(overrides = {}) {
  return {
    Success: true,
    RestaurantInfo: { Name: 'ADA-COUNTRY CLUB', ID: 195500301143, LocalCode: '06972' },
    SurveyType: { TypeId: 3801, Description: 'Customer First Visit' },
    VisitId: 8721634,
    VisitDetails: {
      Id: 8721634, VisitDate: '8/19/2026', Comment: 'CFV meets Standards',
      AuditorsName: 'Test Auditor', VisitDoneByName: 'Test Auditor', VisitTypeId: 3801,
    },
    RootCategories: [
      {
        Name: 'Curbside',
        SubCategories: [
          {
            Name: 'Cleanliness',
            Questions: [
              { ShortCode: 'CU1-US', Text: 'Cleanliness: Is the exterior of restaurant clean and free of litter?', Comment: null, Score: 3, PossibleScore: 3, IsCritical: false },
            ],
            SubCategories: [],
          },
          {
            Name: 'Quality',
            Questions: [
              { ShortCode: 'CU8-US', Text: 'Quality: Was your sandwich served fresh and did it taste good?', Comment: 'Assembly was off-center.', Score: 0, PossibleScore: 6, IsCritical: false },
              { ShortCode: 'CU9-US', Text: 'Quality: Were the french fries hot and crisp?', Comment: 'Fries were soggy.', Score: 0, PossibleScore: 4, IsCritical: false },
            ],
            SubCategories: [],
          },
        ],
        Questions: [],
      },
    ],
    ...overrides,
  };
}

describe('parsePeakRoipVisit', () => {
  it('parses a real-shaped CFV visit: store, date, report type, and every question', () => {
    const v = parsePeakRoipVisit(roipSurveyFixture());
    expect(v.reportType).toBe('CFV');
    expect(v.store).toBe('06972');
    expect(v.dateISO).toBe('2026-08-19');
    expect(v.peakVisitId).toBe(8721634);
    expect(v.auditorName).toBe('Test Auditor');
    expect(v.visitComment).toBe('CFV meets Standards');
    expect(v.questionCount).toBe(3);
  });

  it('flattens the nested category tree and carries the category path per question', () => {
    const v = parsePeakRoipVisit(roipSurveyFixture());
    const cu8 = v.questions.find(q => q.code === 'CU8-US');
    expect(cu8.category).toBe('Curbside > Quality');
    expect(cu8.text).toContain('sandwich');
  });

  it('THE POINT: every question is captured, not just the commented/cited ones', () => {
    const v = parsePeakRoipVisit(roipSurveyFixture());
    // CU1-US has no comment and passed cleanly -- still present, unlike EcoSure's citedItems-only shape.
    const cu1 = v.questions.find(q => q.code === 'CU1-US');
    expect(cu1).toBeDefined();
    expect(cu1.comment).toBeNull();
    expect(cu1.score).toBe(3);
  });

  it('real inspector comments come through per-question, and the count matches', () => {
    const v = parsePeakRoipVisit(roipSurveyFixture());
    expect(v.commentedCount).toBe(2);
    const commented = v.questions.filter(q => q.comment);
    expect(commented.map(q => q.code).sort()).toEqual(['CU8-US', 'CU9-US']);
  });

  it('maps VisitTypeId 3781 (Running Great Restaurants Visit) to RGR', () => {
    const v = parsePeakRoipVisit(roipSurveyFixture({
      SurveyType: { TypeId: 3781, Description: 'Running Great Restaurants Visit' },
      VisitDetails: { ...roipSurveyFixture().VisitDetails, VisitTypeId: 3781 },
    }));
    expect(v.reportType).toBe('RGR');
  });

  it('an unmapped VisitTypeId (e.g. Execution Shop Visit) yields reportType:null so the caller skips it', () => {
    const v = parsePeakRoipVisit(roipSurveyFixture({
      VisitDetails: { ...roipSurveyFixture().VisitDetails, VisitTypeId: 321 },
    }));
    expect(v.reportType).toBeNull();
  });

  it('respects RoipSurvey\'s own Success:false rather than guessing at a partial parse', () => {
    expect(parsePeakRoipVisit({ Success: false })).toBeNull();
  });

  it('an unparseable VisitDate is a skip (null), not a guess', () => {
    const v = parsePeakRoipVisit(roipSurveyFixture({
      VisitDetails: { ...roipSurveyFixture().VisitDetails, VisitDate: 'not a date' },
    }));
    expect(v.dateISO).toBeNull();
  });
});

describe('buildPeakDetailPayload', () => {
  it('writes the TOKEN, never the plaintext auditor name', () => {
    const v = parsePeakRoipVisit(roipSurveyFixture());
    const payload = buildPeakDetailPayload(v, 'tok-xyz789');
    expect(payload.auditor).toBe('tok-xyz789');
    expect(JSON.stringify(payload)).not.toContain('Test Auditor');
    expect(payload.questions.length).toBe(3);
    expect(payload.peakVisitId).toBe(8721634);
  });

  it('a null token (no tokenizer match) stays null, not the raw name', () => {
    const v = parsePeakRoipVisit(roipSurveyFixture());
    const payload = buildPeakDetailPayload(v, null);
    expect(payload.auditor).toBeNull();
  });
});

function mockSupabase({ existingRows = [] } = {}) {
  const updates = [];
  return {
    updates,
    from: () => ({
      select: () => {
        const filters = {};
        const builder = {
          eq: (f, val) => { filters[f] = val; return builder; },
          maybeSingle: () => {
            const row = existingRows.find(r => r.loc === filters.loc && r.visit_date === filters.visit_date && r.report_type === filters.report_type);
            return Promise.resolve({ data: row ? { id: row.id } : null, error: null });
          },
        };
        return builder;
      },
      update: (payload) => ({
        eq: (idField, idVal) => { updates.push({ id: idVal, payload }); return Promise.resolve({ error: null }); },
      }),
    }),
  };
}

describe('enrichExistingVisits (PEAK enrichment-only import)', () => {
  it('enriches a matching existing row via a targeted UPDATE, never an upsert', async () => {
    const supabase = mockSupabase({ existingRows: [{ id: 'row-1', loc: '06972', visit_date: '2026-08-19', report_type: 'CFV' }] });
    const v = parsePeakRoipVisit(roipSurveyFixture());
    const { enriched, noMatch } = await enrichExistingVisits(supabase, [v], new Map());
    expect(enriched).toBe(1);
    expect(noMatch).toEqual([]);
    expect(supabase.updates).toHaveLength(1);
    expect(supabase.updates[0].id).toBe('row-1');
    expect(supabase.updates[0].payload.peak_detail.questionCount).toBe(3);
  });

  it('THE TRAP: a PEAK visit with no matching existing row is reported, never inserted', async () => {
    const supabase = mockSupabase({ existingRows: [] });
    const v = parsePeakRoipVisit(roipSurveyFixture());
    const { enriched, noMatch } = await enrichExistingVisits(supabase, [v], new Map());
    expect(enriched).toBe(0);
    expect(noMatch).toHaveLength(1);
    expect(noMatch[0]).toContain('loc=06972');
    expect(supabase.updates).toHaveLength(0); // never falls back to an insert
  });

  it('resolves the auditor name through the token map before writing', async () => {
    const supabase = mockSupabase({ existingRows: [{ id: 'row-1', loc: '06972', visit_date: '2026-08-19', report_type: 'CFV' }] });
    const v = parsePeakRoipVisit(roipSurveyFixture());
    const map = new Map([['Test Auditor', 'tok-abc']]);
    await enrichExistingVisits(supabase, [v], map);
    expect(supabase.updates[0].payload.peak_detail.auditor).toBe('tok-abc');
    expect(JSON.stringify(supabase.updates[0].payload)).not.toContain('Test Auditor');
  });
});
