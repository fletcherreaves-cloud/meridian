// @ts-nocheck
// #164 — the invariant this whole migration exists for: for a store where tLabor ≠ tCrewLabor,
// the Ops Score, every displayed labor target/finding text, AND the dollar figure on the labor
// finding must all cite the SAME number (tCrewLabor, via resolveLaborTarget). Before this
// migration, computeOpsScore graded on tCrewLabor (once #163's resolver landed) while
// buildBrief's WATCH-LABOR text and finding-rules.js's dollar figure still read t.tLabor
// directly — a live contradiction: a store could score full labor credit while simultaneously
// emitting a WATCH-LABOR finding quoting a DIFFERENT, unapproved target.
//
// Fixture: Ponce de Leon 43701, the sharpest real case found in issue #164's triage —
// graded 26.00% (tLabor) vs approved 24.00% (tCrewLabor), a 2.00pp gap on a metric whose full
// tolerance band (laborT1gap) is only 0.5pp.
import { describe, it, expect } from 'vitest';
globalThis.window = globalThis.window || {};
const { computeOpsScore, buildBrief } = await import('../engine/pipeline.js');
const { FINDING_RULES } = await import('../engine/finding-rules.js');
const { DEF_SETTINGS } = await import('../constants.js');

const sc = DEF_SETTINGS.scoring;
// tLabor and tCrewLabor deliberately far apart (26% vs 24%) so a bug that reads the wrong one
// produces a visibly different result, not a coincidentally-matching one.
const t = { tLabor: 0.26, tCrewLabor: 0.24, tRedAPct: 0.003, tOepe: 140 };
// 27.0% actual: within 1pp of tLabor (WATCH's +2pp gate would NOT fire against tLabor) but
// 3pp over tCrewLabor (WATCH's +2pp gate DOES fire against tCrewLabor) — the exact shape of
// contradiction #164 reproduced against real fixture data.
const p = { laborPct: 0.27, weeklySales: 70000, otHrs: 1 };

describe('#164 invariant — score, WATCH-LABOR text, and dollar figure all cite tCrewLabor', () => {
  it('computeOpsScore grades against tCrewLabor (24.00%), not tLabor (26.00%)', () => {
    const scoreAgainstCrewLabor = computeOpsScore(p, t, sc);
    const scoreAgainstLegacyOnly = computeOpsScore(p, { ...t, tCrewLabor: undefined }, sc);
    // If the score were still reading tLabor, these would be identical — they must differ,
    // proving the resolver's basis actually changes what gets graded.
    expect(scoreAgainstCrewLabor).not.toBe(scoreAgainstLegacyOnly);
  });

  it('buildBrief\'s WATCH-LABOR finding fires against tCrewLabor and quotes it, not tLabor', () => {
    const findings = buildBrief(p, t, 80, 80, 700000, 650000, null, '43701');
    const laborFinding = findings.find(f => f.rule === 'labor');
    expect(laborFinding).toBeDefined(); // fires: 27% > 24%+2pp=26%, would NOT fire vs 26%+2pp=28%
    expect(laborFinding.m).toContain('24.00%'); // quotes tCrewLabor
    expect(laborFinding.m).not.toContain('26.00%'); // never quotes tLabor
  });

  it('the labor finding\'s dollar figure prices the excess over tCrewLabor, not tLabor', () => {
    const dollarsVsCrewLabor = FINDING_RULES.labor.dollars(p, t);
    const dollarsVsLegacyOnly = FINDING_RULES.labor.dollars(p, { tLabor: t.tLabor });
    // vs tCrewLabor (24%): pos(0.27-0.24) * daily = 0.03 * (70000/7) = 300
    expect(dollarsVsCrewLabor).toBeCloseTo(0.03 * (70000 / 7), 6);
    // Must differ from what it would have priced against the legacy field alone
    // (pos(0.27-0.26) * daily = 0.01 * 10000 = 100) — proves the dollar figure moved with the basis.
    expect(dollarsVsCrewLabor).not.toBeCloseTo(dollarsVsLegacyOnly, 0);
  });

  it('all three surfaces agree on the SAME number (24.00%) — the actual point of #164', () => {
    const findings = buildBrief(p, t, 80, 80, 700000, 650000, null, '43701');
    const laborFinding = findings.find(f => f.rule === 'labor');
    // Score used 24% (proven above); the finding text quotes 24.00%; the dollar amount below
    // is derived from the same 24% gap (0.03) that the finding text's "+3.00%" implies.
    expect(laborFinding.m).toMatch(/24\.00%.*\+3%/);
    expect(FINDING_RULES.labor.dollars(p, t)).toBeCloseTo(0.03 * (70000 / 7), 6);
  });
});
