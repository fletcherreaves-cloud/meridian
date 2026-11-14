// @ts-nocheck
// engine/metric-provenance.js had zero test coverage despite being live: provenanceFor/
// provenanceText are imported directly by engine/kpi-registry.js to power every KPI's ⓘ source
// tooltip, and METRIC_PROVENANCE itself is imported directly by views/metric-lineage.js's
// transparency panel. Covers the catalog's own structural contract (every entry carries the
// fields the consumers rely on) plus the three accessor functions' documented behavior.
import { describe, it, expect } from 'vitest';
import { METRIC_PROVENANCE, provenanceFor, composedMetrics, provenanceText, humanizeMetricKey } from '../engine/metric-provenance.js';
import { METRIC_SOURCES } from '../engine/metric-source.js';

describe('METRIC_PROVENANCE — catalog structural contract', () => {
  it('every entry carries label/system/report/table/composed/inputs/formula/grain', () => {
    for (const [key, p] of Object.entries(METRIC_PROVENANCE)) {
      expect(p.label, `${key}.label`).toBeTruthy();
      expect(p.system, `${key}.system`).toBeTruthy();
      expect(p.report, `${key}.report`).toBeTruthy();
      expect(p.table, `${key}.table`).toBeTruthy();
      expect(typeof p.composed, `${key}.composed`).toBe('boolean');
      expect(Array.isArray(p.inputs) && p.inputs.length > 0, `${key}.inputs`).toBe(true);
      expect(p.formula, `${key}.formula`).toBeTruthy();
      expect(p.grain, `${key}.grain`).toBeTruthy();
    }
  });

  it('is a non-trivial catalog (sanity check against accidental truncation)', () => {
    expect(Object.keys(METRIC_PROVENANCE).length).toBeGreaterThan(10);
  });
});

describe('provenanceFor', () => {
  it('returns the full entry for a known key', () => {
    expect(provenanceFor('oepe')).toBe(METRIC_PROVENANCE.oepe);
  });

  it('returns null for an unknown key', () => {
    expect(provenanceFor('not-a-real-metric')).toBeNull();
  });
});

describe('composedMetrics', () => {
  it('returns only entries flagged composed:true, as [key, entry] pairs', () => {
    const result = composedMetrics();
    const expectedKeys = Object.entries(METRIC_PROVENANCE).filter(([, p]) => p.composed).map(([k]) => k);
    expect(result.map(([k]) => k).sort()).toEqual(expectedKeys.sort());
    for (const [, entry] of result) expect(entry.composed).toBe(true);
  });

  it('excludes direct-read (composed:false) entries like headcount', () => {
    const keys = composedMetrics().map(([k]) => k);
    expect(keys).not.toContain('headcount');
  });
});

// Notes 61: "complete listing of every metric we have access to... generated from the
// registry, not hand-written." The whole point is that METRIC_PROVENANCE can never again
// silently fall behind METRIC_SOURCES the way it did (16 of 92 real chains) — so this test
// cross-checks against the REAL resolver, not a fixture, per "would this verification still
// pass if reverted": a test that only imports metric-provenance.js in isolation can't tell
// "every metric is covered" from "every metric I bothered to hand-write is covered".
describe('METRIC_PROVENANCE — auto-generated from METRIC_SOURCES (Notes 61)', () => {
  it('every real METRIC_SOURCES key resolves to a provenance entry', () => {
    const missing = Object.keys(METRIC_SOURCES).filter(k => !METRIC_PROVENANCE[k]);
    expect(missing).toEqual([]);
  });

  it('is actually a non-trivial superset of the resolver, not a coincidental equal-size list', () => {
    // Guards against a future refactor that replaces the merge with just METRIC_SOURCES'
    // own keys (losing the hand-curated-only entries like oppTotal/osat/headcount).
    expect(Object.keys(METRIC_PROVENANCE).length).toBeGreaterThan(Object.keys(METRIC_SOURCES).length);
  });

  it('a hand-curated entry wins over the auto-generated one for the same key', () => {
    // 'oepe' exists in both METRIC_SOURCES (a real resolver chain) and the hand-written
    // CURATED_PROVENANCE block above (the field-reconciled formula) -- the curated prose,
    // not the mechanical one, must be what ships.
    expect(METRIC_SOURCES.oepe).toBeTruthy();
    expect(METRIC_PROVENANCE.oepe.formula).toContain('dt_untilserve');
    expect(METRIC_PROVENANCE.oepe.auto).not.toBe(true);
  });

  it('flags a mechanically-generated entry with auto:true, distinct from curated prose', () => {
    // 'schedHrs' has no hand-written entry -- confirm it's really auto, not an untracked gap.
    expect(METRIC_PROVENANCE.schedHrs.auto).toBe(true);
    expect(METRIC_PROVENANCE.oepe.auto).not.toBe(true);
  });

  it('a composed (derive:) chain is marked composed and lists its real inputs', () => {
    const p = METRIC_PROVENANCE.avgRate; // derive-only, no raw srcs -- auto-generated
    expect(p.auto).toBe(true);
    expect(p.composed).toBe(true);
    expect(p.system).toBe('Meridian-derived');
    for (const inputKey of METRIC_SOURCES.avgRate.derive.inputs) {
      expect(p.inputs.some(i => i.includes(inputKey))).toBe(true);
    }
  });

  it('a direct (srcs-only) chain is marked composed:false with a real table/system', () => {
    const p = METRIC_PROVENANCE.schedHrs;
    expect(p.composed).toBe(false);
    expect(p.system).toBe('LifeLenz');
    expect(p.table).toBe('lifelenz_schedule');
  });

  it('a chain with BOTH a fallback derive and raw srcs stays composed, naming both paths', () => {
    const p = METRIC_PROVENANCE.cashOSPct;
    expect(p.composed).toBe(true);
    expect(p.formula).toMatch(/priority order/);
    expect(p.formula).toMatch(/If none of those cover the day/);
  });
});

describe('humanizeMetricKey', () => {
  it('splits camelCase into Title Case words', () => {
    expect(humanizeMetricKey('crewHrs')).toBe('Crew Hours');
  });

  it('applies the known QSR-abbreviation dictionary', () => {
    expect(humanizeMetricKey('oepe')).toBe('OEPE');
    expect(humanizeMetricKey('dtMixPct')).toBe('DT Mix %');
  });

  it('never returns an empty string for a real metric key', () => {
    for (const key of Object.keys(METRIC_SOURCES)) {
      expect(humanizeMetricKey(key).length).toBeGreaterThan(0);
    }
  });
});

// Task #152 (2026-11-14) — app-wide metric/formula reconciliation. These 6 keys are composed
// from MULTIPLE already-resolved metric-source.js values (sumMs lines, Visit Readiness
// sub-scores) rather than naming a single METRIC_SOURCES chain, so autoProvenanceFor() never
// generates them — they must stay hand-curated, and this test is what catches it if one is
// ever accidentally dropped during a future edit to CURATED_PROVENANCE.
describe('METRIC_PROVENANCE — task #152 curated additions (2026-11-14)', () => {
  const keys = ['visitReadinessSpeed', 'visitReadinessAccuracy', 'visitReadinessQuality',
    'visitReadinessLeadership', 'dailyReviewRefundAmt', 'dailyReviewEmplMgrMeal'];

  it('all 6 are present, composed, and Meridian-derived', () => {
    for (const key of keys) {
      const p = METRIC_PROVENANCE[key];
      expect(p, key).toBeTruthy();
      expect(p.composed, `${key}.composed`).toBe(true);
      expect(p.system, `${key}.system`).toBe('Meridian-derived');
    }
  });

  it('the two sumMs daily-review lines name their real metric-source.js legs', () => {
    expect(METRIC_PROVENANCE.dailyReviewRefundAmt.inputs.join(' ')).toMatch(/cashRefAmt/);
    expect(METRIC_PROVENANCE.dailyReviewRefundAmt.inputs.join(' ')).toMatch(/cashlessRefAmt/);
    expect(METRIC_PROVENANCE.dailyReviewEmplMgrMeal.inputs.join(' ')).toMatch(/empMealAmt/);
    expect(METRIC_PROVENANCE.dailyReviewEmplMgrMeal.inputs.join(' ')).toMatch(/mgrMealAmt/);
  });

  it('the 4 visit-readiness sub-scores are a disjoint, real subset of METRIC_PROVENANCE', () => {
    // None of these 4 keys collide with a real METRIC_SOURCES chain or the pre-existing
    // composite entry -- confirms they're additive, not accidentally shadowing anything.
    for (const key of keys.filter(k => k.startsWith('visitReadiness') && k !== 'visitReadiness')) {
      expect(METRIC_SOURCES[key]).toBeUndefined();
    }
    expect(METRIC_PROVENANCE.visitReadiness).toBeTruthy(); // the composite itself, untouched
  });
});

// Task #152 (2026-11-14, pass 2) — engine/signal-registry.js's METRIC_CATEGORIES feeds the
// Signals panel's Scanner/Signal Lab. Most of its keys already bridge to a real METRIC_SOURCES
// chain (auto-covered); these 20 are the confirmed exception -- no METRIC_SOURCES chain at all
// (verified by grep against metric-source.js before writing), so autoProvenanceFor() never
// generates them. None collide with a real METRIC_SOURCES key (this would shadow, not add).
describe('METRIC_PROVENANCE — task #152 signal-registry.js additions (2026-11-14)', () => {
  const directKeys = ['baseFoodPct', 'discCoupon', 'pLFoodPct', 'pLPaperPct',
    'osat5', 'osatB2B', 'accuracyB2B', 'dtProblem', 'overallProblem',
    'vpDtSat', 'vpIrSat', 'vpQualityB2B', 'vpFriesB2B', 'vpSnackB2B'];
  const composedKeys = ['osatTop2', 'schedGap', 'scheduleEditCount', 'scheduleCostVariance',
    'complianceViolationCount', 'complianceCostPenalty'];

  it('all 14 direct-read entries are present, non-composed, and real', () => {
    for (const key of directKeys) {
      const p = METRIC_PROVENANCE[key];
      expect(p, key).toBeTruthy();
      expect(p.composed, `${key}.composed`).toBe(false);
      expect(METRIC_SOURCES[key], `${key} should not collide with a real METRIC_SOURCES chain`).toBeUndefined();
    }
  });

  it('all 6 composed entries are present and real', () => {
    for (const key of composedKeys) {
      const p = METRIC_PROVENANCE[key];
      expect(p, key).toBeTruthy();
      expect(p.composed, `${key}.composed`).toBe(true);
      expect(METRIC_SOURCES[key], `${key} should not collide with a real METRIC_SOURCES chain`).toBeUndefined();
    }
  });

  it('the LifeLenz-sourced entries name their real Supabase tables', () => {
    expect(METRIC_PROVENANCE.schedGap.table).toBe('lifelenz_schedule');
    expect(METRIC_PROVENANCE.scheduleEditCount.table).toBe('lifelenz_schedule_variance');
    expect(METRIC_PROVENANCE.scheduleCostVariance.table).toBe('lifelenz_schedule_variance');
    expect(METRIC_PROVENANCE.complianceViolationCount.table).toBe('lifelenz_compliance_audit');
    expect(METRIC_PROVENANCE.complianceCostPenalty.table).toBe('lifelenz_compliance_audit');
  });

  it('the VOICE Performance entries name their real Supabase table', () => {
    for (const key of ['vpDtSat', 'vpIrSat', 'vpQualityB2B', 'vpFriesB2B', 'vpSnackB2B']) {
      expect(METRIC_PROVENANCE[key].table).toBe('smg_voice_performance');
    }
  });
});

describe('provenanceText', () => {
  it('formats system, report, table, formula, and grain into one readable string', () => {
    const text = provenanceText('tpph');
    const p = METRIC_PROVENANCE.tpph;
    expect(text).toContain(p.system);
    expect(text).toContain(p.report);
    expect(text).toContain(p.table);
    expect(text).toContain(p.formula);
    expect(text).toContain(p.grain);
  });

  it('returns an empty string for an unknown key', () => {
    expect(provenanceText('not-a-real-metric')).toBe('');
  });
});
