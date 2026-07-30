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
