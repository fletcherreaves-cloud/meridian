// @vitest-environment happy-dom
// @ts-nocheck
// Decisions Panel Inventory salvage #7 ("This Week's Focus") -- DistrictPriorityBrief's
// district-wide pulse used to count "issue types" via f.m.includes('OEPE') substring
// matching on finding prose. That also matched oepeOk ("STRENGTH — OEPE...", a POSITIVE
// finding), oepeRecord (a record-achievement callout), and oepeTrend (a leading trend
// warning, not "currently slow") -- inflating the oepe bucket with non-issues, a real bug
// that was live in production. Rebuilt against the structured f.rule field (finer-grained
// than f.category, which pools cashOS/tRedAfter/deposit under one 'Controls' bucket).
// This test locks in the corrected mapping directly, without standing up the full
// DistrictPriorityBrief React component (matching the proportionate-testing precedent
// used for the other pure-logic pieces salvaged this session).
import { describe, it, expect } from 'vitest';
import { ISSUE_RULE_MAP } from '../views/analytics.js';

describe('#7 District Pulse ISSUE_RULE_MAP (Decisions Panel Inventory salvage, "This Week\'s Focus")', () => {
  it('maps the real issue-driving rules to their district-pulse bucket', () => {
    expect(ISSUE_RULE_MAP.cashOS).toBe('cash');
    expect(ISSUE_RULE_MAP.tRedAfter).toBe('tred');
    expect(ISSUE_RULE_MAP.compound).toBe('tred');
    expect(ISSUE_RULE_MAP.deposit).toBe('deposit');
    expect(ISSUE_RULE_MAP.overtime).toBe('overtime');
    expect(ISSUE_RULE_MAP.labor).toBe('labor');
    expect(ISSUE_RULE_MAP.oepe).toBe('oepe');
    expect(ISSUE_RULE_MAP.floorCrit).toBe('scheduling');
    expect(ISSUE_RULE_MAP.floorWatch).toBe('scheduling');
  });

  it('does NOT bucket the non-issue OEPE rules the old substring match used to catch', () => {
    // oepeOk is a positive "STRENGTH — OEPE..." finding (t:'ok'); oepeRecord is a record
    // achievement callout; oepeTrend is a leading trend warning, not a current problem.
    // The old f.m.includes('OEPE') check matched all three; none should map to a bucket.
    expect(ISSUE_RULE_MAP.oepeOk).toBeUndefined();
    expect(ISSUE_RULE_MAP.oepeRecord).toBeUndefined();
    expect(ISSUE_RULE_MAP.oepeTrend).toBeUndefined();
  });

  it('does NOT bucket tpph under labor (its message says THROUGHPUT, never LABOR)', () => {
    expect(ISSUE_RULE_MAP.tpph).toBeUndefined();
  });

  it('does NOT bucket laborTrend (a projection, not a current labor problem)', () => {
    expect(ISSUE_RULE_MAP.laborTrend).toBeUndefined();
  });

  it('an unrecognized rule id resolves to undefined, not a false bucket', () => {
    expect(ISSUE_RULE_MAP.notARealRule).toBeUndefined();
  });
});
