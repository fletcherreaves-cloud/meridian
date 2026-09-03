// @ts-nocheck
// engine/metric-provenance.js had zero test coverage despite being live: provenanceFor/
// provenanceText are imported directly by engine/kpi-registry.js to power every KPI's ⓘ source
// tooltip, and METRIC_PROVENANCE itself is imported directly by views/metric-lineage.js's
// transparency panel. Covers the catalog's own structural contract (every entry carries the
// fields the consumers rely on) plus the three accessor functions' documented behavior.
import { describe, it, expect } from 'vitest';
import { METRIC_PROVENANCE, provenanceFor, composedMetrics, provenanceText } from '../engine/metric-provenance.js';

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
