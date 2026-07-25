// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { extractMetricValues, findMetric } from '../engine/signal-registry.js';
import { CSAT_OUTCOME_KEYS } from '../engine/csat-signals.js';

const ds = {
  smgVoicePerf: [
    { loc: '03708', period: '2026-06', report_type: 'monthly',    dt_sat: 71, ir_sat: 95, quality_b2b: 3 },
    { loc: '03708', period: '2026-06', report_type: 'trailing90', dt_sat: 65 }, // rolling → excluded
    { loc: '03708', period: '2026-06', report_type: 'ytd',        dt_sat: 60 }, // rolling → excluded
    { loc: '03708', period: '2026-05', report_type: 'monthly',    dt_sat: 68 },
    { loc: '05183', period: '2026-06', report_type: 'monthly',    dt_sat: 80 },
  ],
};

describe('VOICE Performance registry metrics', () => {
  it('registers the new CSAT outcomes', () => {
    expect(findMetric('vpDtSat')).toBeTruthy();
    expect(findMetric('vpQualityB2B')).toBeTruthy();
    expect(CSAT_OUTCOME_KEYS).toContain('vpDtSat');
    expect(CSAT_OUTCOME_KEYS).toContain('vpQualityB2B');
  });

  it('extractMetricValues keeps only monthly rows and maps period→date', () => {
    const vals = extractMetricValues('vpDtSat', ds, 'monthly');
    expect(vals.length).toBe(3); // 3 monthly rows; trailing90 + ytd excluded
    expect(vals.every(v => v.date instanceof Date && !isNaN(+v.date))).toBe(true);
    const jun = vals.find(v => v.loc === '3708' && v.date.getMonth() === 5);
    expect(jun.value).toBe(71);
    expect(vals.some(v => v.value === 65 || v.value === 60)).toBe(false); // rolling values gone
  });
});
