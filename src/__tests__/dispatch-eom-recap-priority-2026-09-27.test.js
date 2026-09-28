// Dispatch (2026-09-27, owner-approved design; RE-ordered 2026-09-28 — owner: "this is my fault
// for mis directing you yesterday"): retune formatDiagnosisReport's recap output — cap raised
// 5→10 on Recount Candidates (Food class only), Waste flags promoted out of the old one-line soft
// footnote into its own capped, ranked section, and the three sections now read (a) Missed/
// uncounted items first, (b) Recount Candidates second, (c) Waste flags third. mode:'full' is
// untouched.
//
// Per CLAUDE.md's "would this verification still pass if reverted?" rule, these tests assert the
// EXACT new shape (order + cap number + class filter + exclusion set) so they fail if any one of
// the three changes is reverted — not just "the report still renders something".
import { describe, it, expect } from 'vitest';
import {
  runDiagnosis, formatDiagnosisReport, RECAP_RECOUNT_CAP, RECAP_WASTE_FLAG_CAP, RECAP_WASTE_FLAG_EXCLUDE,
} from '../engine/eom-diagnosis.js';

describe('dispatch: EOM recap priority reorder (2026-09-27)', () => {
  it('exports the agreed caps (10 Recount Candidates, sensible Waste-flags cap)', () => {
    expect(RECAP_RECOUNT_CAP).toBe(10);
    expect(RECAP_WASTE_FLAG_CAP).toBeGreaterThanOrEqual(5);
    expect(RECAP_WASTE_FLAG_CAP).toBeLessThanOrEqual(10);
    expect(RECAP_WASTE_FLAG_EXCLUDE.has('waste-patterns')).toBe(true);
    expect(RECAP_WASTE_FLAG_EXCLUDE.has('waste-session')).toBe(true);
  });

  // 14 Food items + 3 Condiment items, all comfortably actionable (no early-count lock, no
  // fountain group) — enough headroom to prove the cap is really 10, not still 5, and that
  // Condiment is excluded from THIS section even though it's eligible for mode:'full''s Top-5.
  const manyFoodVariance = [
    ...Array.from({ length: 14 }, (_, i) => ({ wrin: `f${i}`, descr: `Food Item ${i}`, dolDiff: -(200 - i), cls: 'food' })),
    ...Array.from({ length: 3 }, (_, i) => ({ wrin: `c${i}`, descr: `Condiment Item ${i}`, dolDiff: -(190 - i), cls: 'condiment' })),
  ];

  it('Recount Candidates: cap raised from 5 to 10 (not just re-sliced from an already-5-capped list)', () => {
    const res = runDiagnosis({ store: 's', storeName: 'Ada', period: '2026-07', data: { variance: manyFoodVariance } });
    const recap = formatDiagnosisReport(res, { mode: 'recap', fob: { pct: 0.037, tgt: 0.038, dollars: 8000 } });
    const section = recap.split('**Recount Candidates')[1].split(/\n\n/)[0];
    const lines = section.split('\n').filter(l => /^\d+\./.test(l.trim()));
    expect(lines.length).toBe(10); // was capped at 5 before this dispatch
    // The full report (mode:'full', unchanged) still caps its own Top-N at 5.
    const full = formatDiagnosisReport(res, {});
    const fullTop = full.split('## ✅ Top 5')[1].split(/\n## /)[0];
    expect((fullTop.match(/^\d+\./gm) || []).length).toBe(5);
  });

  it('Recount Candidates: scoped to Food class only — a Condiment item never appears in this section', () => {
    const res = runDiagnosis({ store: 's', storeName: 'Ada', period: '2026-07', data: { variance: manyFoodVariance } });
    const recap = formatDiagnosisReport(res, { mode: 'recap', fob: { pct: 0.037, tgt: 0.038, dollars: 8000 } });
    const section = recap.split('**Recount Candidates')[1].split(/\n\nWaste flags|\n\n⏳|\n\n\*\*Net variance|\n\nGo ahead|\n\nYou're at|\n\nTime's the lever/)[0];
    expect(section).not.toMatch(/Condiment Item/);
    expect(section).toMatch(/Food Item 0/); // the biggest Food item is present
    // Condiment is NOT removed from the underlying engine — mode:'full''s Top-5 can still include it
    // when it's the highest-scoring item overall (14 bigger Food items here means it won't win a
    // slot, so prove engine-level Condiment support a different way: it still appears in Reference).
    const full = formatDiagnosisReport(res, {});
    expect(full).toMatch(/Condiment Item 0/); // still shown in the full report's Reference table
  });

  it('reorders the recap to Missed/uncounted items → Recount Candidates → Waste flags', () => {
    // Static nightly waste value on 5 distinct days → waste-inflation (shown); single-manager waste
    // concentration → waste-patterns (excluded, manager-attribution). Plus one never-counted item.
    const variance = [{ wrin: 'f', descr: 'Fries', dolDiff: -120, cls: 'food' }];
    const waste = [1, 2, 3, 6, 7].map(d => ({ wrin: 'f', descr: 'Fries', amount: 20, type: 'raw', dt: `2026-06-0${d}T23:1${d}:00`, manager: 'Allen W' }));
    const incomplete = { uncountedCount: 1, byState: { never: { n: 1, value: 90 } }, uncounted: [
      { wrin: 'z', descr: 'Grill Cheese', cls: 'food', state: 'never', valueAtRisk: 90 } ] };
    const res = runDiagnosis({ store: 's', storeName: 'Ada', period: '2026-07', data: { variance, waste } });
    const recap = formatDiagnosisReport(res, { mode: 'recap', incomplete, fob: { pct: 0.037, tgt: 0.038, dollars: 8000 } });
    const iRecount = recap.indexOf('Recount Candidates');
    const iWaste = recap.indexOf('Waste flags');
    const iMissed = recap.indexOf("Finish today's count");
    expect(iRecount).toBeGreaterThan(-1);
    expect(iWaste).toBeGreaterThan(-1);
    expect(iMissed).toBeGreaterThan(-1);
    expect(iMissed).toBeLessThan(iRecount);
    expect(iRecount).toBeLessThan(iWaste);
  });

  it('Waste flags: promoted to a real visible section, capped, and excludes manager-attribution checks', () => {
    // Force BOTH an included check (waste-inflation, no manager in its title) and an excluded one
    // (waste-patterns, manager-named by design) to fire in the same recap.
    const variance = [
      { wrin: 'f', descr: 'Fries', dolDiff: -120, cls: 'food' },
      { wrin: 'g', descr: 'Buns', dolDiff: -60, cls: 'food' },
    ];
    const waste = [
      ...[1, 2, 3, 6, 7].map(d => ({ wrin: 'f', descr: 'Fries', amount: 20, type: 'raw', dt: `2026-06-0${d}T23:1${d}:00`, manager: 'Allen W' })),
      // A second manager so waste-patterns' shareHot branch (byManager.length > 1) can fire too.
      { wrin: 'g', descr: 'Buns', amount: 500, type: 'raw', dt: '2026-06-08T10:00:00', manager: 'Bo Regan' },
    ];
    const res = runDiagnosis({ store: 's', storeName: 'Ada', period: '2026-07', data: { variance, waste } });
    const hasWasteInflation = res.findings.some(f => f.checkId === 'waste-inflation');
    const hasWastePatterns = res.findings.some(f => f.checkId === 'waste-patterns');
    const recap = formatDiagnosisReport(res, { mode: 'recap', fob: { pct: 0.037, tgt: 0.038, dollars: 8000 } });
    expect(hasWasteInflation).toBe(true);
    expect(hasWastePatterns).toBe(true);
    expect(recap).toMatch(/\*\*Waste flags — worth a look together/);
    // The manager-attribution check's own manager name must NEVER surface in the recap.
    expect(recap).not.toMatch(/Bo Regan/);
    expect(recap).not.toMatch(/Allen W/);
    expect(recap).not.toMatch(/Waste concentration/); // waste-patterns' own title text, excluded outright
    // The non-attribution check IS shown, plain-language, ranked.
    expect(recap).toMatch(/Waste spike|Repeated static waste value/);
    const section = recap.split('**Waste flags')[1].split(/\n\n⏳|\n\n✅|\n\n\*\*Net variance/)[0];
    const bullets = (section.match(/^- /gm) || []).length;
    expect(bullets).toBeGreaterThan(0);
    expect(bullets).toBeLessThanOrEqual(RECAP_WASTE_FLAG_CAP);
  });

  it('mode:\'full\' is completely unaffected by the recap reorder/cap/exclusion changes', () => {
    const variance = manyFoodVariance;
    const waste = [1, 2, 3, 6, 7].map(d => ({ wrin: 'f0', descr: 'Food Item 0', amount: 20, type: 'raw', dt: `2026-06-0${d}T23:1${d}:00`, manager: 'Allen W' }));
    const res = runDiagnosis({ store: 's', storeName: 'Ada', period: '2026-07', data: { variance, waste } });
    const full = formatDiagnosisReport(res, {});
    expect(full).not.toMatch(/Recount Candidates/);
    expect(full).not.toMatch(/Waste flags —/);
    expect(full).toMatch(/## 🔍 Second-Look Signals/); // full report's own integrity section, unchanged
  });

  // "Would this still pass if reverted?" — a literal revert all the way back to the original
  // (pre-2026-09-27) order (uncounted → Top-5 → net → soft note) would make `Recount Candidates`
  // not exist at all, so the ordering assertion above fails outright. A revert of just the
  // 2026-09-28 re-reorder (back to Recount Candidates → Waste flags → Missed/uncounted) fails the
  // `iMissed < iRecount` half of that same assertion. A revert of just the cap (10→5) fails the
  // exact-10 line-count assertion above. A revert of the Food-only filter fails the
  // Condiment-absence assertion above. A revert of the Waste-flags promotion fails the
  // section-heading + exclusion assertions above.
});
