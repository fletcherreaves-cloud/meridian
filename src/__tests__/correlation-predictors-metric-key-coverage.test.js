// @ts-nocheck
// TARGET_METRIC_KEY/PREDICTOR_METRIC_KEY (correlation-predictors.js) map every CORR_TARGETS/
// CORR_PREDICTORS id to a metric-source.js key, so analytics.js's computeAllCorrelations and
// signals.js's CorrelationsTab can source auto-first instead of reading a raw ds.laborRows/
// opsRows/ctrlRows-joined row. A missing entry silently drops that predictor/target from every
// correlation computed anywhere in the app -- exactly what happened to `fobPct` (CORR_PREDICTORS'
// 10th entry): PREDICTOR_METRIC_KEY only ever had 9 keys, so fobPct's average/correlation
// resolved to null/empty everywhere, with nothing to catch the gap. This test makes that
// structural: any future CORR_TARGETS/CORR_PREDICTORS entry without a matching key fails here,
// not silently.
import { describe, it, expect } from 'vitest';
import { CORR_TARGETS, CORR_PREDICTORS, TARGET_METRIC_KEY, PREDICTOR_METRIC_KEY } from '../engine/correlation-predictors.js';
import { METRIC_SOURCES } from '../engine/metric-source.js';

describe('TARGET_METRIC_KEY / PREDICTOR_METRIC_KEY coverage', () => {
  it('every CORR_TARGETS id has a TARGET_METRIC_KEY entry', () => {
    for (const t of CORR_TARGETS) expect(TARGET_METRIC_KEY[t.id], `missing TARGET_METRIC_KEY['${t.id}']`).toBeTruthy();
  });

  it('every CORR_PREDICTORS id has a PREDICTOR_METRIC_KEY entry (this is the fobPct regression guard)', () => {
    for (const p of CORR_PREDICTORS) expect(PREDICTOR_METRIC_KEY[p.id], `missing PREDICTOR_METRIC_KEY['${p.id}']`).toBeTruthy();
  });

  it('fobPct specifically is mapped (the gap found and fixed alongside the auto-first sourcing change)', () => {
    expect(PREDICTOR_METRIC_KEY.fobPct).toBe('fobPct');
  });

  it('every mapped value is a real METRIC_SOURCES key -- catches a typo, not just an omission', () => {
    for (const [id, key] of Object.entries(TARGET_METRIC_KEY)) expect(METRIC_SOURCES[key], `TARGET_METRIC_KEY['${id}'] -> '${key}' is not a real METRIC_SOURCES key`).toBeTruthy();
    for (const [id, key] of Object.entries(PREDICTOR_METRIC_KEY)) expect(METRIC_SOURCES[key], `PREDICTOR_METRIC_KEY['${id}'] -> '${key}' is not a real METRIC_SOURCES key`).toBeTruthy();
  });
});
