import { describe, it, expect } from 'vitest';
import { parseExternalFob, reconcileFob } from '../engine/fob-crosscheck.js';

const OUR = ['3708', '6972', '37566', '43380'];

// Real CoachQ rows reconcile to themselves; fabricated ones don't (components != stated FOB$).
const REAL = '3708 $307,503.52 $13,252.22 4.31% $944.88 $878.93 $6,477.45 $650.28 $1,440.48 $4,323.90 -$23.22';
const FAB  = '37566 $338,618.55 $14,044.73 4.15% $1,001.55 $2,028.07 $6,671.44 $1,028.72 $1,618.55 $3,697.44 -$1.57';

describe('parseExternalFob', () => {
  it('parses a store row and extracts FOB$ + the 6 components', () => {
    const [r] = parseExternalFob(REAL, OUR);
    expect(r.store).toBe('3708');
    expect(r.extFob).toBeCloseTo(13252.22, 2);
    expect(r.extFobPct).toBeCloseTo(4.31, 2);
    expect(r.comps.cond).toBeCloseTo(6477.45, 2);
    expect(r.sumOk).toBe(true);          // 6 components sum to the stated FOB$
  });
  it('flags a fabricated row whose components do NOT sum to its stated FOB$', () => {
    const [r] = parseExternalFob(FAB, OUR);
    expect(r.store).toBe('37566');
    expect(r.sumOk).toBe(false);          // CoachQ hallucination — off by ~$381
  });
  it('skips lines that are not one of our stores', () => {
    expect(parseExternalFob('Total 99 $1 $2', OUR)).toEqual([]);
  });
  it('parses the LABELED CoachQ format — FOB$ from "FOB: $X (Y%)", components by label (owner 2026-07-31 bug)', () => {
    const line = '3708\tFOB: $14,589.13 (4.58%) | +$1,009.42 vs median · Comp Waste: $1,003.98 | +$571.14 OVER · Raw Waste: $899.29 | -$942.42 UNDER · Emp Meal: $669.89 | -$173.24 UNDER · Stat Var: $5,544.58 | +$1,192.21 OVER';
    const [r] = parseExternalFob(line, OUR);
    expect(r.labeled).toBe(true);
    expect(r.extFob).toBeCloseTo(14589.13, 2);       // NOT the median-delta 1009.42
    expect(r.extFobPct).toBeCloseTo(4.58, 2);        // NOT 1009 or 571
    expect(r.comps.comp).toBeCloseTo(1003.98, 2);
    expect(r.comps.statv).toBeCloseTo(5544.58, 2);
    expect(r.nComps).toBe(4);                         // only the flagged ones listed
    expect(r.sumOk).toBe(null);                       // can't sum-check with <6 components
  });
  it('labeled format: full 6-component row reconciles to itself (sumOk true), negatives handled', () => {
    const line = '5183\tFOB: $20,307.12 (4.55%) · Comp Waste: $270.30 · Raw Waste: $1,077.45 · Condiment: $9,363.10 · Emp Meal: $1,410.18 · Disc Coupon: $2,844.43 · Stat Var: $9,123.35 · Unexplained: -$937.26';
    const [r] = parseExternalFob(line, ['5183']);
    expect(r.extFob).toBeCloseTo(20307.12, 2);
    expect(r.comps.unex).toBeCloseTo(-937.26, 2);    // -$ handled
    expect(r.comps.disc).toBeCloseTo(2844.43, 2);    // disc parsed but excluded from sum6
    expect(r.sumOk).toBe(true);                       // 6 sum to FOB$
  });
});

describe('reconcileFob', () => {
  it('matches when external FOB$ is within tolerance of Meridian', () => {
    const parsed = parseExternalFob(REAL, OUR);
    const mer = { '3708': { fob: 13260, fobPct: 0.0431, sales: 307503 } };
    const { rows, tally } = reconcileFob(parsed, mer);
    expect(rows[0].status).toBe('match');   // |13252 - 13260| <= 50
    expect(tally.match).toBe(1);
  });
  it('marks a self-inconsistent external row as fabricated regardless of Meridian', () => {
    const parsed = parseExternalFob(FAB, OUR);
    const { rows } = reconcileFob(parsed, { '37566': { fob: 14044.73, fobPct: 0.0415 } });
    expect(rows[0].status).toBe('fabricated');
  });
  it('flags a real-but-divergent row', () => {
    const parsed = parseExternalFob(REAL, OUR);
    const { rows } = reconcileFob(parsed, { '3708': { fob: 11000, fobPct: 0.036 } });
    expect(rows[0].status).toBe('diverge'); // 13252 vs 11000 = >$50 apart
    expect(Math.round(rows[0].dFob)).toBe(2252);
  });
});
