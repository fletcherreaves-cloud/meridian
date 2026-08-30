// @ts-nocheck
// Dispatch #215 Task 1 — FOB targets alongside components.
// Covers scripts/qsrsoft-onhand-pull.mjs's resolveFobTargets()/buildFobTargetReport() and
// scripts/lib/resend-notify.mjs's target-vs-actual rendering. No live Supabase/network — this
// sandbox has no SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_URL, so the module's `supabase` client
// is null and resolveFobTargets() exercises its DEFAULT_TARGETS-only fallback path (asserted
// explicitly below, not silently assumed); buildFobTargetReport() is tested directly against a
// synthetic target object either way, which is the piece this dispatch actually adds.
import { describe, it, expect } from 'vitest';
import { resolveFobTargets, buildFobTargetReport, buildNotificationRow } from '../../scripts/qsrsoft-onhand-pull.mjs';
import { buildEmailContent } from '../../scripts/lib/resend-notify.mjs';
import { buildEomDigest } from '../engine/eom-digest.js';
import { DEFAULT_TARGETS } from '../constants.js';

describe('resolveFobTargets — v1 scope (DEFAULT_TARGETS, live monthly_targets override when reachable)', () => {
  it('a store with no DEFAULT_TARGETS entry AND no live monthly_targets row resolves to an empty object, not a throw', async () => {
    const t = await resolveFobTargets('9999999', '2026-08');
    expect(t).toEqual({});
  });

  it('accepts both padded and unpadded loc the same way unpadLoc does elsewhere in this file', async () => {
    const padded = await resolveFobTargets('0003708', '2026-08');
    const unpadded = await resolveFobTargets('3708', '2026-08');
    expect(padded.tFOBTarget).toBe(unpadded.tFOBTarget);
  });

  // dispatch #215 live measurement (per this repo's "a live-data claim must name the credential
  // and the observation" rule): this sandbox's SUPABASE_SERVICE_ROLE_KEY genuinely reads
  // tenant data — measured directly with a service-role fetch against
  // {VITE_SUPABASE_URL}/rest/v1/monthly_targets?loc=eq.3708, 2026-08-29:
  // `content-range: 0-4/5` (5 real rows, not */0), including
  // {loc:'3708', year:2026, month:8, fob_target_pct:0.0415} — which differs from
  // DEFAULT_TARGETS['3708'].tFOBTarget (0.0385), proving the live override genuinely wins over
  // the seed, not a coincidental match. Conditioned on the credential actually being present
  // (CI's test job — .github/workflows/ci.yml — does not set SUPABASE_SERVICE_ROLE_KEY, so this
  // stays skipped there; it ran for real in this dispatch's own verification pass).
  (process.env.SUPABASE_SERVICE_ROLE_KEY ? it : it.skip)(
    'live: store 3708, August 2026 resolves the monthly_targets override over the DEFAULT_TARGETS seed',
    async () => {
      const t = await resolveFobTargets('3708', '2026-08');
      expect(t.tFOBTarget).toBeCloseTo(0.0415, 6);
      expect(t.tFOBTarget).not.toBe(DEFAULT_TARGETS['3708'].tFOBTarget);
    },
  );
});

describe('buildFobTargetReport — reuses fob-report.js math, never re-derives it', () => {
  const FOB_SNAP = { sales: 100000, comp: 400, raw: 300, cond: 150, emp: 100, statv: 800, unex: 250, fob: 2000, fobPct: 0.02, asOf: '2026-08-28' };
  const TARGET = { tFOBTarget: 0.0385, tStatLoss: 0.0105, tCompWaste: 0.002, tRawWaste: 0.0035, tCondiment: 0.0205, tEmpFood: 0.002, tUnex: 0.0 };

  it('returns null with no fobSnap (target math is meaningless without a fresh actual)', () => {
    expect(buildFobTargetReport('3708', '2026-08', null, TARGET)).toBeNull();
  });

  it('returns null when no FOB target is resolvable', () => {
    expect(buildFobTargetReport('3708', '2026-08', FOB_SNAP, {})).toBeNull();
    expect(buildFobTargetReport('3708', '2026-08', FOB_SNAP, null)).toBeNull();
  });

  it('a store UNDER its FOB target (2% actual vs 3.85% target): overTarget false, gapPP negative', () => {
    const r = buildFobTargetReport('3708', '2026-08', FOB_SNAP, TARGET);
    expect(r).not.toBeNull();
    expect(r.fobPct).toBeCloseTo(0.0385, 6); // the TARGET fraction — see eom-digest.js's field-naming note
    expect(r.overTarget).toBe(false);
    expect(r.gapPP).toBeCloseTo(2 - 3.85, 2); // fobPct(2%) - target(3.85%) in pp
    expect(r.comps.find(c => c.key === 'statv').tgtPP).toBeCloseTo(1.05, 5); // tStatLoss 0.0105 -> 1.05pp
  });

  it('a store OVER its FOB target: overTarget true, gapPP positive, topDriver set to the worst component', () => {
    const overSnap = { ...FOB_SNAP, statv: 8000, fobPct: 0.10, fob: 10000 }; // statv alone -> 8% of sales, way over its 1.05% target
    const r = buildFobTargetReport('3708', '2026-08', overSnap, TARGET);
    expect(r.overTarget).toBe(true);
    expect(r.gapPP).toBeGreaterThan(0);
    expect(r.topDriver).toBeTruthy();
    expect(r.topDriver.key).toBe('statv');
  });
});

describe('buildFobTargetReport output feeds directly into buildEomDigest (Task 1 -> Task 2 contract)', () => {
  // Regression guard: an earlier draft of this dispatch returned buildFobTargetReport()'s target
  // fraction under the key `target`, while eom-digest.js's rollupGroup() reads `s.fobTarget.fobPct`
  // — a real shape mismatch caught during this dispatch's own build (silently empties every
  // group's FOB-vs-target aggregate, no error, no crash). This test wires Task 1's real output
  // straight into Task 2's real engine so a future field-name drift fails loudly here instead of
  // silently producing an empty `fob.worstStores` in production.
  it('a store over target rolls up into buildEomDigest\'s fob.overTargetCount, not silently excluded', () => {
    const overSnap = { sales: 100000, comp: 400, raw: 300, cond: 150, emp: 100, statv: 8000, unex: 250, fob: 9200, fobPct: 0.092, asOf: '2026-08-28' };
    const target = { tFOBTarget: 0.0385, tStatLoss: 0.0105, tCompWaste: 0.002, tRawWaste: 0.0035, tCondiment: 0.0205, tEmpFood: 0.002, tUnex: 0.0 };
    const fobTarget = buildFobTargetReport('3708', '2026-08', overSnap, target);
    expect(fobTarget.overTarget).toBe(true);

    const storeRows = [{ loc: '3708', name: 'Ardmore', patch: 'Robert Spencer', classStatuses: {
      food: { status: 'complete', pct: 1 }, condiment: { status: 'complete', pct: 1 },
      paper: { status: 'complete', pct: 1 }, nonproduct: { status: 'complete', pct: 1 },
    }, uncountedValue: 0, fob: overSnap, fobTarget }];
    const digest = buildEomDigest(storeRows, { level: 'district', period: '2026-08' });
    expect(digest.groups[0].fob.nWithFobData).toBe(1); // would be 0 if the field names disagreed
    expect(digest.groups[0].fob.overTargetCount).toBe(1);
    expect(digest.groups[0].fob.worstStores[0].loc).toBe('3708');
  });
});

describe('buildNotificationRow — fob_target passthrough (dispatch #215 Task 1)', () => {
  const detection = { triggerKinds: ['food_condiment'], triggerClasses: ['food', 'condiment'], classStatuses: {} };
  const diag = { uncounted: [], lateBulk: false, lateBulkDay: null };
  const fobSnap = { sales: 100000, comp: 400, raw: 300, cond: 150, emp: 100, statv: 800, unex: 250, fob: 2000, fobPct: 0.02, asOf: '2026-08-28' };
  const targetReport = { fobPct: 0.0385, gapPP: -1.85, overTarget: false, comps: [{ key: 'statv', label: 'Variance Stat', actualPP: 0.8, tgtPP: 1.05, deltaPP: -0.25 }], topDriver: null };

  it('carries fob_target through when given', () => {
    const row = buildNotificationRow('0003708', '2026-08', detection, diag, fobSnap, '2026-08-29', targetReport);
    expect(row.fob_target).toEqual(targetReport);
  });

  it('defaults fob_target to null when omitted (backward compatible with #213 call sites)', () => {
    const row = buildNotificationRow('0003708', '2026-08', detection, diag, fobSnap, '2026-08-29');
    expect(row.fob_target).toBeNull();
  });
});

describe('buildEmailContent — FOB section renders target-vs-actual when fob_target is present', () => {
  const ROW = {
    loc: '0011657', period: '2026-08', trigger_kind: 'food_condiment',
    class_statuses: { food: { status: 'complete', pct: 1 }, condiment: { status: 'complete', pct: 1 }, paper: { status: 'not_started', pct: 0 }, nonproduct: { status: 'not_started', pct: 0 } },
    uncounted_items: { items: [], totalCount: 0, totalValue: 0, truncated: false },
    kb_links: [],
    fob_snapshot: { sales: 100000, comp: 400, raw: 300, cond: 150, emp: 100, statv: 800, unex: 250, fob: 2000, fobPct: 0.02, asOf: '2026-08-28' },
    fob_target: {
      fobPct: 0.0385, gapPP: -1.85, overTarget: false,
      comps: [
        { key: 'statv', label: 'Variance Stat', actualPP: 0.8, tgtPP: 1.05, deltaPP: -0.25 },
        { key: 'comp', label: 'Completed Waste', actualPP: 0.4, tgtPP: 0.2, deltaPP: 0.2 },
      ],
      topDriver: null,
    },
  };
  const STORE_INFO = { loc: '0011657', name: 'Purcell' };

  it('renders the headline gap and per-component target/delta', () => {
    const { html } = buildEmailContent(ROW, STORE_INFO);
    expect(html).toContain('target 3.85%'); // headline stays prose (dispatch #219 Task 2 untouched)
    expect(html).toContain('-1.85pp');
    expect(html).toContain('under');
    expect(html).toContain('Variance Stat');
    // dispatch #219 Task 2 — per-component target/delta now live in their own table columns
    // rather than an inline "(target X%, +Ypp)" annotation, so assert the values, not the phrase.
    expect(html).toContain('1.05%'); // Variance Stat's Target % cell
    expect(html).toMatch(/-0\.25pp/);
    expect(html).toMatch(/\+0\.2pp/); // comp's positive delta keeps its sign
  });

  it('falls back to actual-only rendering (no target text) when fob_target is absent — #213 behavior unchanged', () => {
    const { fob_target, ...rowNoTarget } = ROW;
    const { html } = buildEmailContent(rowNoTarget, STORE_INFO);
    expect(html).toContain('FOB (Food Over Base)');
    expect(html).not.toContain('target');
  });
});
