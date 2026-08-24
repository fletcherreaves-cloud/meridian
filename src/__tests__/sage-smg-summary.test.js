// @ts-nocheck
// Dispatch #85 #3 -- osatTop2/dtProblem are parsed as 0-1 FRACTIONS (src/parsers/index.js's
// `_num01` guard), same convention smg-voice.js already renders correctly (`(p*100).toFixed(2)+
// '%'`) and morning-brief.js defends against with an explicit `>1` scale guard. buildSmgSummary
// compared the raw fraction against a PERCENT threshold (`< 90`, true for any real 0-1 value) and
// printed it bare with a literal '%' appended (e.g. "0.91%" instead of "91.00%"), so every store
// -- including ones well above target -- rendered with the ⚠ warning flag. SAGE flagged this on
// three separate runs: "the flags are meaningless."
//
// Verification bar: 0.91 (91%, a PASS against the ≥90% target) must render as "91.00%" with no
// warning flag; a genuine failure (e.g. 0.79, 79%) must still flag.
import { describe, it, expect } from 'vitest';
import { buildSmgSummary } from '../views/sage.js';

function smgRow(loc, osatTop2, dtProblem = 0.05) {
  return { loc, year: 2026, month: 8, osatTop2, osatB2B: 0.97, dtProblem };
}

describe('buildSmgSummary -- OSAT fraction vs percent (dispatch #85 #3)', () => {
  it('a passing store (0.91 = 91%, target >=90%) renders as 91.00% with NO warning flag', () => {
    const out = buildSmgSummary({ smgFullscale: [smgRow('3708', 0.91)] });
    expect(out).toContain('91.00%');
    expect(out).not.toContain('0.91%');
    // No ⚠ next to this store's row.
    const line = out.split('\n').find(l => l.includes('3708'));
    expect(line).toBeTruthy();
    expect(line).not.toContain('⚠');
  });

  it('a genuinely failing store (0.79 = 79%, below target) still renders as 79.00% WITH the warning flag', () => {
    const out = buildSmgSummary({ smgFullscale: [smgRow('6972', 0.79)] });
    expect(out).toContain('79.00%');
    const line = out.split('\n').find(l => l.includes('6972'));
    expect(line).toContain('⚠');
  });

  it('an estate that is mostly passing does not read as universally failing', () => {
    // The reported symptom: values 0.79-0.97 across the estate, most of them passing, but every
    // one showed the warning flag because the comparison was against the wrong scale.
    const rows = [
      smgRow('3708', 0.97), smgRow('6972', 0.91), smgRow('13113', 0.88),
      smgRow('35064', 0.79), smgRow('10422', 0.93),
    ];
    const out = buildSmgSummary({ smgFullscale: rows });
    const flaggedCount = (out.match(/⚠/g) || []).length;
    // Only the two genuinely-below-90% stores (0.88, 0.79) should flag, not all 5.
    expect(flaggedCount).toBe(2);
  });

  it('district avg OSAT renders as a real percent (e.g. ~89.6%), not a bare fraction', () => {
    const rows = [smgRow('3708', 0.97), smgRow('6972', 0.91), smgRow('13113', 0.81)];
    const out = buildSmgSummary({ smgFullscale: rows });
    expect(out).toMatch(/District avg OSAT top-2: 89\.6\d%/);
  });

  it('dtProblem also renders as a percent, same bug class', () => {
    const out = buildSmgSummary({ smgFullscale: [smgRow('3708', 0.91, 0.12)] });
    expect(out).toContain('12.00%');
  });

  it('returns null with no SMG data', () => {
    expect(buildSmgSummary({ smgFullscale: [] })).toBeNull();
    expect(buildSmgSummary({})).toBeNull();
  });
});
