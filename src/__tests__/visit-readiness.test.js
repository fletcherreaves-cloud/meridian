import { describe, it, expect } from 'vitest';
import { computeVisitReadiness, READINESS_WEIGHTS, analyzeGradedVisits, READINESS_GAPS, srcMeta } from '../engine/visit-readiness.js';
import { readinessReportHTML, readinessAuditCSV, reportFileBase } from '../views/visit-readiness-report.js';
import { DEFAULT_TARGETS } from '../constants.js';

// Two real loc IDs that exist in DEFAULT_TARGETS.
const GOOD = '3708';
const BAD = '5183';
const recent = n => new Date(Date.now() - n * 864e5);

// A store comfortably beating its targets on every mapped metric.
function goodRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 0.85, kvst: t.tKvst * 0.8, laborPct: t.tCrewLabor * 0.92 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 0.7, r2p: t.tR2p * 0.85 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 1.15, laborPct: t.tCrewLabor * 0.92 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
    smg: [{ loc, year: 2026, month: 6, accuracyB2B: 98, overallProblem: 4, osatB2B: 94 }],
    ctrl: days.map(d => ({ loc, date: d, tRedAPct: t.tRedAPct * 0.6 })),
    fob: [{ loc, date: recent(10), compWaste: t.tCompWaste * 0.7, rawWaste: t.tRawWaste * 0.7, statVar: t.tStatLoss * 0.7 }],
  };
}
// A store badly missing its targets everywhere.
function badRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 1.6, kvst: t.tKvst * 1.7, laborPct: t.tCrewLabor * 1.4 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 2.5, r2p: t.tR2p * 1.6 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 0.6, laborPct: t.tCrewLabor * 1.4 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 20 })),
    smg: [{ loc, year: 2026, month: 6, accuracyB2B: 84, overallProblem: 22, osatB2B: 78 }],
    ctrl: days.map(d => ({ loc, date: d, tRedAPct: t.tRedAPct * 3 })),
    fob: [{ loc, date: recent(10), compWaste: t.tCompWaste * 4, rawWaste: t.tRawWaste * 4, statVar: t.tStatLoss * 4 }],
  };
}
function mkDs(...perStore) {
  const ds = { glimpseRows: [], opsRows: [], laborRows: [], schedRows: [], smgFullscale: [], ctrlRows: [], fobRows: [] };
  for (const s of perStore) {
    ds.glimpseRows.push(...s.glimpse); ds.opsRows.push(...s.ops); ds.laborRows.push(...s.labor);
    ds.schedRows.push(...s.sched); ds.smgFullscale.push(...s.smg); ds.ctrlRows.push(...s.ctrl); ds.fobRows.push(...s.fob);
  }
  return ds;
}

describe('visit-readiness', () => {
  it('ranks a target-beating store far above a target-missing store', () => {
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    const res = computeVisitReadiness(ds);
    const g = res.stores.find(s => s.loc === GOOD);
    const b = res.stores.find(s => s.loc === BAD);
    expect(g).toBeTruthy(); expect(b).toBeTruthy();
    expect(g.readiness).toBeGreaterThan(b.readiness);
    expect(g.readiness).toBeGreaterThan(80);
    expect(b.readiness).toBeLessThan(55);
    expect(g.band).toBe('ready');
    expect(b.band).toBe('at-risk');
  });

  it('most at-risk store sorts first', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD), badRows(BAD)));
    expect(res.stores[0].loc).toBe(BAD);
  });

  it('flags food-safety risk from elevated waste proxies', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD), badRows(BAD)));
    expect(res.stores.find(s => s.loc === GOOD).fsFlag).toBe('low');
    expect(res.stores.find(s => s.loc === BAD).fsFlag).toBe('elevated');
  });

  it('surfaces per-store top risk drivers (worst metrics first)', () => {
    const res = computeVisitReadiness(mkDs(badRows(BAD)));
    const b = res.stores.find(s => s.loc === BAD);
    expect(b.topDrivers.length).toBeGreaterThan(0);
    expect(b.topDrivers[0].score).toBeLessThanOrEqual(b.topDrivers[b.topDrivers.length - 1].score);
    expect(b.topDrivers[0]).toHaveProperty('actual');
    expect(b.topDrivers[0]).toHaveProperty('target');
  });

  it('renormalizes weights when a sub-score has no data (speed only)', () => {
    // Only glimpse speed data present → composite = speed sub-score, coverage < 1.
    const t = DEFAULT_TARGETS[GOOD];
    const ds = { glimpseRows: [{ loc: GOOD, date: recent(1), oepe: t.tOepe * 0.8, kvst: t.tKvst * 0.8 }] };
    const res = computeVisitReadiness(ds);
    const g = res.stores.find(s => s.loc === GOOD);
    expect(g).toBeTruthy();
    expect(g.coverage).toBeLessThan(1);
    expect(g.subs.speed.score).not.toBeNull();
    expect(g.subs.accuracy.score).toBeNull();
  });

  it('attaches the last actual graded visit when present', () => {
    const ds = mkDs(goodRows(GOOD));
    ds.gradedVisits = [{ store: GOOD, dateISO: '2026-06-15', reportType: 'CFV', score: 88, pass: true }];
    const res = computeVisitReadiness(ds);
    const g = res.stores.find(s => s.loc === GOOD);
    expect(g.lastVisit).toBeTruthy();
    expect(g.lastVisit.score).toBe(88);
  });

  it('produces a district rollup', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD), badRows(BAD)));
    expect(res.district.nStores).toBe(2);
    expect(res.district.readiness).toBeGreaterThan(0);
    expect(res.district.atRisk).toBeGreaterThanOrEqual(1);
    expect(res.weights).toEqual(READINESS_WEIGHTS);
  });

  it('writes a plain-language "why" that names the worst drivers for an at-risk store', () => {
    const res = computeVisitReadiness(mkDs(badRows(BAD)));
    const b = res.stores.find(s => s.loc === BAD);
    expect(typeof b.why).toBe('string');
    expect(b.why).toMatch(/At risk/i);
    // Should reference a driver label + "vs" + "target"
    expect(b.why).toMatch(/vs .* target/i);
  });

  it('a ready store\'s why reads clean (no big gaps)', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD)));
    const g = res.stores.find(s => s.loc === GOOD);
    expect(g.why).toMatch(/Ready/i);
  });

  // Dispatch28 Workstream F ("say the number AND the decision" -- CLAUDE.md's standing UI
  // rule). why (above) is diagnostic; verdict is the decision built from the SAME topDrivers
  // computation those `why` tests already exercise -- these prove it's a real instruction
  // (names an action verb + the specific driver + its number), not a relabeled metric string.
  it('an at-risk store\'s verdict names an action, the worst driver, and its number vs target', () => {
    // badRows() also trips the food-safety flag (separately tested below, and correctly
    // prioritized) -- isolate the plain at-risk-on-readiness case by keeping waste/variance
    // on target while everything else misses, so only the band drives the verdict here.
    const t = DEFAULT_TARGETS[BAD];
    const ds = mkDs(badRows(BAD));
    ds.fobRows = [{ loc: BAD, date: recent(10), compWaste: t.tCompWaste * 0.7, rawWaste: t.tRawWaste * 0.7, statVar: t.tStatLoss * 0.7 }];
    const res = computeVisitReadiness(ds);
    const b = res.stores.find(s => s.loc === BAD);
    expect(b.fsFlag).not.toBe('elevated'); // precondition -- isolating the readiness-band path
    expect(b.band).toBe('at-risk');
    expect(typeof b.verdict).toBe('string');
    expect(b.verdict).toMatch(/^Coach /);
    expect(b.verdict).toMatch(/vs .* target/i);
    // The verdict must reference the SAME worst driver topDrivers already identified, not an
    // independently-picked one -- "which gap matters" stays a single source of truth.
    const worst = b.topDrivers.find(d => d.score < 0.85);
    expect(b.verdict).toContain(worst.label);
  });

  it('a ready store\'s verdict says no action needed, not a copy of the diagnostic "why"', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD)));
    const g = res.stores.find(s => s.loc === GOOD);
    expect(g.verdict).toMatch(/no action needed/i);
    expect(g.verdict).not.toBe(g.why);
  });

  it('an elevated food-safety flag takes priority over the readiness band in the verdict', () => {
    // Food safety is the more severe PACE consequence (criticals, not just a re-visit clock) --
    // the verdict must lead with it even when the store is also at-risk on readiness, rather
    // than picking one risk category arbitrarily.
    const res = computeVisitReadiness(mkDs(badRows(BAD)));
    const b = res.stores.find(s => s.loc === BAD);
    expect(b.fsFlag).toBe('elevated'); // precondition, from the existing fs-flag test above
    expect(b.verdict).toMatch(/food-safety risk/i);
  });

  it('calibration: needs >=3 visits, else reports n and null r', () => {
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    ds.gradedVisits = [{ store: GOOD, dateISO: '2026-06-15', reportType: 'CFV', score: 90, pass: true }];
    const res = computeVisitReadiness(ds);
    expect(res.calibration.n).toBe(1);
    expect(res.calibration.r).toBeNull();
  });

  it('analyzeGradedVisits: buckets outcomes by known variables + per-store frequency', () => {
    const visits = [
      { store: '3708', dateISO: '2026-06-05', reportType: 'CFV', score: 92, pass: true,  daypart: 'Breakfast', weekpart: 'Weekday', channel: 'Drive Thru' }, // Fri
      { store: '3708', dateISO: '2026-06-19', reportType: 'CFV', score: 70, pass: false, daypart: 'Lunch',     weekpart: 'Weekday', channel: 'In-Store' },  // Fri
      { store: '5183', dateISO: '2026-06-06', reportType: 'CFV', score: 88, pass: true,  daypart: 'Breakfast', weekpart: 'Weekend', channel: 'Drive Thru' }, // Sat
      { store: '5183', dateISO: '2026-06-13', reportType: 'RGR', score: 95, pass: true,  daypart: 'Dinner',    weekpart: 'Weekday', channel: 'In-Store' },  // Sat
    ];
    const all = analyzeGradedVisits(visits);
    expect(all.overall.n).toBe(4);
    expect(all.overall.passRate).toBeCloseTo(0.75, 2);
    expect(all.channel.find(c => c.key === 'Drive Thru').n).toBe(2);
    expect(all.byType.find(t => t.key === 'CFV').n).toBe(3);
    // Per-store cadence: 3708 has two visits 14 days apart.
    const s = all.freq.find(f => f.store === '3708');
    expect(s.n).toBe(2);
    expect(s.avgGapDays).toBe(14);
    // Type filter narrows to CFV only.
    const cfv = analyzeGradedVisits(visits, { type: 'CFV' });
    expect(cfv.overall.n).toBe(3);
  });

  it('analyzeGradedVisits: empty input is safe', () => {
    const r = analyzeGradedVisits([]);
    expect(r.overall.n).toBe(0);
    expect(r.dow).toEqual([]);
    expect(r.freq).toEqual([]);
  });

  // ── Calibration / audit trail (Notes 56 #2) ────────────────────────────────
  it('audit: area contributions sum to the reported readiness', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD), badRows(BAD)));
    for (const s of res.stores) {
      const sum = s.audit.reduce((t, a) => t + (a.contribution || 0), 0);
      expect(sum).toBeCloseTo(s.readiness, 1);
    }
  });

  it('audit: effective weights renormalize to 1 over the areas that had data', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD)));
    const s = res.stores.find(x => x.loc === GOOD);
    const eff = s.audit.filter(a => !a.excluded).reduce((t, a) => t + a.effWeight, 0);
    expect(eff).toBeCloseTo(1, 6);
    // Excluded areas contribute nothing and carry a zero effective weight.
    for (const a of s.audit.filter(x => x.excluded)) {
      expect(a.effWeight).toBe(0);
      expect(a.contribution).toBeNull();
    }
    // Nominal weights are untouched — the audit reports both.
    expect(s.audit.find(a => a.key === 'speed').weight).toBe(READINESS_WEIGHTS.speed);
  });

  it('audit: renormalization holds when whole areas are missing (speed-only store)', () => {
    const t = DEFAULT_TARGETS[GOOD];
    const ds = { glimpseRows: [{ loc: GOOD, date: recent(1), oepe: t.tOepe * 0.8, kvst: t.tKvst * 0.8 }] };
    const s = computeVisitReadiness(ds).stores.find(x => x.loc === GOOD);
    const speed = s.audit.find(a => a.key === 'speed');
    expect(speed.effWeight).toBeCloseTo(1, 6);           // speed carries the whole score
    expect(speed.contribution).toBeCloseTo(s.readiness, 1);
    expect(s.audit.filter(a => a.excluded).length).toBe(3);
  });

  it('provenance: every scored metric carries source, target basis, tolerance and as-of', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD)));
    const s = res.stores.find(x => x.loc === GOOD);
    const drivers = s.audit.flatMap(a => a.drivers);
    expect(drivers.length).toBeGreaterThan(0);
    for (const d of drivers) {
      expect(d.source).toBeTruthy();
      expect(d.field).toBeTruthy();
      expect(srcMeta(d.source).system).toBeTruthy();
      expect(['store', 'standard']).toContain(d.basis.kind);
      expect(d.basis.ref).toBeTruthy();
      expect(d.toleranceLabel).toBeTruthy();
      expect(d.zeroAt).not.toBeNull();
      expect(d.obs).toBeGreaterThan(0);
      expect(d.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // A per-store target traces to that store's own DEFAULT_TARGETS entry…
    const oepe = drivers.find(d => d.key === 'oepe');
    expect(oepe.basis.kind).toBe('store');
    expect(oepe.basis.ref).toBe(`DEFAULT_TARGETS[${GOOD}].tOepe`);
    expect(oepe.target).toBe(DEFAULT_TARGETS[GOOD].tOepe);
    // …while a fixed McDonald's standard is labelled as such.
    const acc = drivers.find(d => d.key === 'accB2B');
    expect(acc.basis.kind).toBe('standard');
    expect(acc.target).toBe(95);
  });

  it('gaps: unmeasured metrics are listed honestly, never filled with a placeholder', () => {
    const t = DEFAULT_TARGETS[GOOD];
    const ds = { glimpseRows: [{ loc: GOOD, date: recent(1), oepe: t.tOepe * 0.8, kvst: t.tKvst * 0.8 }] };
    const s = computeVisitReadiness(ds).stores.find(x => x.loc === GOOD);
    const labels = s.notMeasured.map(m => m.label);
    expect(labels).toContain('DT park rate');            // speed metric with no source row
    expect(labels).toContain('SMG accuracy (B2B) %');    // whole accuracy area absent
    for (const m of s.notMeasured) expect(m.reason).toBeTruthy();
    // Nothing was invented to fill them.
    const scored = s.audit.flatMap(a => a.drivers).map(d => d.key);
    expect(scored).not.toContain('park');
  });

  it('scope: opts.locs restricts stores, district and the model check', () => {
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    const res = computeVisitReadiness(ds, { locs: [GOOD] });
    expect(res.stores.length).toBe(1);
    expect(res.stores[0].loc).toBe(GOOD);
    expect(res.district.nStores).toBe(1);
    // Zero-padded locs resolve the same way the qsr_* streams store them.
    expect(computeVisitReadiness(ds, { locs: ['0' + GOOD] }).stores.length).toBe(1);
  });

  it('declares its coverage gaps and whether an EcoSure sample exists', () => {
    const ds = mkDs(goodRows(GOOD));
    ds.gradedVisits = [{ store: GOOD, dateISO: '2026-06-15', reportType: 'CFV', score: 88, pass: true }];
    const res = computeVisitReadiness(ds);
    expect(res.gaps).toBe(READINESS_GAPS);
    expect(res.gaps.map(g => g.area)).toContain('Cleanliness');
    expect(res.hasEcoSure).toBe(false);      // only a CFV on record
    expect(res.visitTypes).toEqual(['CFV']);
    expect(res.sourcesUsed).toContain('glimpseRows');
  });

  it('report: CSV explodes the composite and carries its own provenance preamble', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD), badRows(BAD)));
    const csv = readinessAuditCSV(res, { scopeLabel: 'Oklahoma' });
    expect(csv).toContain('Visit Readiness (PACE) calibration audit');
    expect(csv).toContain('Oklahoma');
    expect(csv).toContain('Area contribution (pts)');
    expect(csv).toContain('Target basis');
    expect(csv).toContain('Declared coverage gaps');
    expect(csv).toContain('Cleanliness');
    // One row per scored metric, plus header/preamble lines.
    const metricCount = res.stores.reduce((t, s) => t + s.audit.reduce((u, a) => u + a.drivers.length, 0), 0);
    expect(metricCount).toBeGreaterThan(0);
    expect(csv.split('\n').length).toBeGreaterThan(metricCount);
  });

  it('report: HTML shows the composite math, the gaps and the model check', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD), badRows(BAD)));
    const html = readinessReportHTML(res, { scopeLabel: 'All stores', detail: 'full' });
    expect(html).toContain('Visit Readiness (PACE) — All stores');
    expect(html).toContain('Σ contributions');
    expect(html).toContain('Effective weight');
    expect(html).toContain('Declared coverage gaps');
    expect(html).toContain('Model check');
    expect(html).toContain('No EcoSure / third-party food-safety result is loaded.');
    // Summary mode drops the per-store audit but keeps the scope summary.
    const summary = readinessReportHTML(res, { scopeLabel: 'All stores', detail: 'summary' });
    expect(summary).not.toContain('Per-store calibration audit');
    expect(summary).toContain('Scope summary');
  });

  it('report: export filename carries content + scope + date', () => {
    const name = reportFileBase('Patch Brad Denley', 'audit');
    expect(name).toMatch(/^visit-readiness-audit-patch-brad-denley-\d{4}-\d{2}-\d{2}$/);
  });

  // ── Dispatch #64 — routes through metric-source.js's shared auto-first chains ─────────
  // Revert-sensitive: every source below is one the OLD local `srcs` chains never read at
  // all (qsrActSummaryRows/opsCashRows/qsrFobRows), so if the wiring were reverted to the
  // pre-dispatch local resolver, every driver asserted here would fall into `notMeasured`
  // instead of scoring. Values deliberately beat target so a store lands in a state where
  // "not measured" and "measured, on target" are distinguishable failure vs. pass.
  it('resolves migrated metrics from auto-only sources the old local chains never read, with correct key remapping', () => {
    const t = DEFAULT_TARGETS[GOOD];
    const days = [recent(1), recent(3), recent(6)];
    const ds = {
      // Auto DAR fallback for oepe/r2p/tpph — old chains only knew opsRows/laborRows.
      qsrActSummaryRows: days.map(d => ({ loc: GOOD, date: d, oepe: t.tOepe * 0.85, r2p: t.tR2p * 0.85, tpph: t.tTpph * 1.15 })),
      // Auto Ops-cash-sheet fallback for T-Reds after % — old chain only knew ctrlRows.
      opsCashRows: days.map(d => ({ loc: GOOD, date: d, tRedAPct: t.tRedAPct * 0.5 })),
      // Auto emailed Glimpse for park (field name trap: park -> glimpseRows.parkedPct) and
      // labor (key trap: VR's `labor` -> metric-source.js's `laborPct`) — old chains only
      // knew opsRows/laborRows for these.
      glimpseRows: days.map(d => ({ loc: GOOD, date: d, parkedPct: t.tPark * 0.5, laborPct: t.tCrewLabor * 0.5 })),
      // Auto qsr_fob $ amounts, derived into %'s — old chain only knew the manual fobRows %.
      // loc intentionally zero-padded: qsrFobRows is the one source metric-source.js indexes
      // under a normalized key precisely because its own loader emits it padded.
      qsrFobRows: [{ loc: '000' + GOOD, date: recent(1), prodSalesAmt: 100000,
        compWasteAmt: t.tCompWaste * 0.5 * 100000, rawWasteAmt: t.tRawWaste * 0.5 * 100000, statVarianceAmt: t.tStatLoss * 0.5 * 100000 }],
    };
    const res = computeVisitReadiness(ds);
    const s = res.stores.find(x => x.loc === GOOD);
    expect(s).toBeTruthy();
    const drivers = s.audit.flatMap(a => a.drivers);
    const byKey = k => drivers.find(d => d.key === k);

    expect(byKey('oepe')?.source).toBe('qsrActSummaryRows');
    expect(byKey('r2p')?.source).toBe('qsrActSummaryRows');
    expect(byKey('tpph')?.source).toBe('qsrActSummaryRows');
    expect(byKey('tRedA')?.source).toBe('opsCashRows');
    expect(byKey('park')?.source).toBe('glimpseRows');
    expect(byKey('park')?.field).toBe('parkedPct');       // field-name trap
    expect(byKey('labor')?.source).toBe('glimpseRows');    // key-name trap (labor -> laborPct)
    expect(byKey('comp')?.source).toBe('derived');          // key-name trap (comp -> compWaste)
    expect(byKey('raw')?.source).toBe('derived');
    const statVar = s.fsDrivers.find(d => d.key === 'statVar');
    expect(statVar?.source).toBe('derived');

    // None of these fell into "not measured" — the whole point of the migration.
    const notMeasuredKeys = s.notMeasured.map(m => m.key);
    for (const k of ['oepe', 'r2p', 'tpph', 'tRedA', 'park', 'labor', 'comp', 'raw']) {
      expect(notMeasuredKeys).not.toContain(k);
    }
  });

  it('a genuine 0 from an auto source (park) is not silently discarded as missing data', () => {
    // #150/#178's zero-discarding bug class, reproduced at the msValueForLoc layer this
    // dispatch added: a store that legitimately never parks cars (0%) must still score,
    // not fall through to "not measured" because 0 was mistaken for "no value".
    const t = DEFAULT_TARGETS[GOOD];
    const days = [recent(1), recent(3), recent(6)];
    const ds = { glimpseRows: days.map(d => ({ loc: GOOD, date: d, parkedPct: 0 })) };
    const res = computeVisitReadiness(ds);
    const s = res.stores.find(x => x.loc === GOOD);
    const park = s.audit.flatMap(a => a.drivers).find(d => d.key === 'park');
    expect(park).toBeTruthy();
    expect(park.actual).toBe(0);
    expect(park.source).toBe('glimpseRows');
    expect(s.notMeasured.map(m => m.key)).not.toContain('park');
  });

  it('a store with no DAR/cloud coverage still falls back to the manual opsRows chain, and still reports it as manual', () => {
    const t = DEFAULT_TARGETS[GOOD];
    const days = [recent(1), recent(3), recent(6)];
    // No glimpseRows, no qsrActSummaryRows, no opsCashRows, no qsrFobRows — the auto tiers
    // are entirely absent for this store, exactly like a store the cloud pulls haven't
    // covered yet. Only the manual Ops Report upload has data.
    const ds = { opsRows: days.map(d => ({ loc: GOOD, date: d, oepe: t.tOepe * 0.85, r2p: t.tR2p * 0.85, park: t.tPark * 0.5 })) };
    const res = computeVisitReadiness(ds);
    const s = res.stores.find(x => x.loc === GOOD);
    const drivers = s.audit.flatMap(a => a.drivers);
    for (const k of ['oepe', 'r2p', 'park']) {
      const d = drivers.find(x => x.key === k);
      expect(d?.source).toBe('opsRows');
      expect(srcMeta(d.source).feed).toBe('manual');
    }
  });

  it('the "not measured" reason for a migrated metric names the LIVE metric-source.js chain, not a stale local one', () => {
    // No data anywhere for GOOD -> oepe should resolve to 0 sources. The reason string
    // must list metric-source.js's actual chain (which includes qsrActSummaryRows, a
    // source the pre-dispatch local `srcs` array never knew about) rather than the
    // deleted local array — otherwise the message itself re-drifts stale exactly like the
    // bug this dispatch closes.
    // smgFullscale keeps the store from being dropped entirely (wSum===0 skips a store with
    // NO data anywhere) while leaving every speed source absent, so oepe itself has nothing.
    const ds = { smgFullscale: [{ loc: GOOD, year: 2026, month: 6, accuracyB2B: 98 }] };
    const res = computeVisitReadiness(ds, { locs: [GOOD] });
    const s = res.stores.find(x => x.loc === GOOD);
    const missing = (s?.notMeasured || []).find(m => m.key === 'oepe');
    expect(missing).toBeTruthy();
    expect(missing.reason).toContain('qsrActSummaryRows');
  });

  // ── Report rendering — the standing revert rule requires exercising the ACTUAL consumer,
  // not just the engine, so a revert of either half (the engine wiring OR the report's own
  // read of it) fails this test.
  it('report: HTML and CSV surface a migrated driver\'s real auto source, not a generic label', () => {
    const t = DEFAULT_TARGETS[GOOD];
    const days = [recent(1), recent(3), recent(6)];
    const ds = { qsrActSummaryRows: days.map(d => ({ loc: GOOD, date: d, r2p: t.tR2p * 0.85 })) };
    const res = computeVisitReadiness(ds, { locs: [GOOD] });
    const html = readinessReportHTML(res, { scopeLabel: 'All stores', detail: 'full' });
    const csv = readinessAuditCSV(res, { scopeLabel: 'All stores' });
    expect(html).toContain('Daily Activity Report');   // srcMeta(qsrActSummaryRows).report
    expect(csv).toContain('qsrActSummaryRows.r2p');
  });

  it('calibration: positive rank correlation when predictions track actual visit scores', () => {
    // Three stores whose actual visit scores mirror their (good→bad) predicted order.
    const A = '3708', B = '5183', C = Object.keys(DEFAULT_TARGETS).filter(l => /^\d+$/.test(l) && l !== A && l !== B)[0];
    const ds = mkDs(goodRows(A), badRows(B), goodRows(C));
    ds.gradedVisits = [
      { store: A, dateISO: '2026-06-10', reportType: 'CFV', score: 92, pass: true },   // good pred, high actual
      { store: C, dateISO: '2026-06-11', reportType: 'CFV', score: 85, pass: true },   // good pred, high actual
      { store: B, dateISO: '2026-06-12', reportType: 'CFV', score: 60, pass: false },  // bad pred, low actual
    ];
    const res = computeVisitReadiness(ds);
    expect(res.calibration.n).toBe(3);
    expect(res.calibration.r).toBeGreaterThan(0);
  });
});
