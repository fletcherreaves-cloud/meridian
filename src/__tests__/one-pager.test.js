// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { suggestActions, reconcileFollowUps, buildOnePager, METRIC_DIRECTION } from '../engine/one-pager.js';
import { computeOpportunity } from '../engine/opportunity.js';

const NAMES = { A: 'Store A', B: 'Store B' };
const nm = l => NAMES[l] || l;

const OPP = computeOpportunity([
  // A: big labor gap ($4k). B: big food gap ($3k).
  { loc: 'A', netSales: 200000, prodSales: 200000, days: 30, avgCheck: 10,
    laborPctActual: 0.24, laborPctTarget: 0.22, fobPctActual: 0.040, fobPctTarget: 0.040, gcPerDayActual: 400 },
  { loc: 'B', netSales: 100000, prodSales: 100000, days: 30, avgCheck: 10,
    laborPctActual: 0.22, laborPctTarget: 0.22, fobPctActual: 0.070, fobPctTarget: 0.040, gcPerDayActual: 400 },
], { mode: 'target' });

describe('suggestActions', () => {
  it('emits the top $ pillar per store, biggest first, deduped', () => {
    const acts = suggestActions(OPP, [], { storeName: nm, minDollar: 250 });
    expect(acts.length).toBeGreaterThan(0);
    // B's food gap (0.03×100k = $3000) vs A's labor gap (0.02×200k = $4000) → A first.
    expect(acts[0].loc).toBe('A');
    expect(acts[0].metricKey).toBe('laborPct');
    const bAct = acts.find(a => a.loc === 'B');
    expect(bAct.metricKey).toBe('fobPct');
    // carries baseline + target for the follow-up loop
    expect(acts[0].baselineValue).toBeCloseTo(0.24, 6);
    expect(acts[0].targetValue).toBeCloseTo(0.22, 6);
  });

  it('fills remaining slots from attention concerns without duplicating a covered loc/metric', () => {
    const attn = [{ loc: 'C', metricKey: 'oepe', title: 'Slow DT at C', sev: 3, detail: 'OEPE 200s' }];
    const acts = suggestActions(OPP, attn, { storeName: nm, max: 6 });
    expect(acts.some(a => a.loc === 'C' && a.source === 'attention')).toBe(true);
  });

  it('respects max', () => {
    expect(suggestActions(OPP, [], { storeName: nm, max: 1 }).length).toBe(1);
  });
});

describe('reconcileFollowUps (did the metric move?)', () => {
  const items = [
    { title: 'Tighten labor at A', loc: 'A', metricKey: 'laborPct', baselineValue: 0.24, targetValue: 0.22 },
    { title: 'Grow GC at B', loc: 'B', metricKey: 'gcPerDay', baselineValue: 400, targetValue: 480 },
  ];

  it('flags improvement for a cost metric that fell', () => {
    const [labor] = reconcileFollowUps(items, { A: { laborPct: 0.225 }, B: { gcPerDay: 400 } });
    expect(labor.follow.improved).toBe(true);       // 0.225 < 0.24
    expect(labor.follow.status).toBe('improving');
  });

  it('marks achieved when the target is crossed', () => {
    const [labor] = reconcileFollowUps(items, { A: { laborPct: 0.21 } });
    expect(labor.follow.status).toBe('achieved');   // 0.21 <= 0.22 target
  });

  it('marks worsening when a cost metric rose', () => {
    const [labor] = reconcileFollowUps(items, { A: { laborPct: 0.27 } });
    expect(labor.follow.status).toBe('worsening');
  });

  it('respects direction for a higher-is-better metric (GC)', () => {
    const res = reconcileFollowUps(items, { B: { gcPerDay: 500 } });
    const gc = res.find(r => r.metricKey === 'gcPerDay');
    expect(gc.follow.status).toBe('achieved');      // 500 >= 480 target
  });

  it('stalls when flat and no-data when missing', () => {
    const [flat] = reconcileFollowUps(items, { A: { laborPct: 0.2401 } });
    expect(flat.follow.status).toBe('stalled');
    const [nd] = reconcileFollowUps(items, {});
    expect(nd.follow.status).toBe('no-data');
  });

  it('direction map has the core metrics', () => {
    expect(METRIC_DIRECTION.laborPct).toBe('lower');
    expect(METRIC_DIRECTION.gcPerDay).toBe('higher');
  });
});

describe('buildOnePager', () => {
  it('assembles a complete page model', () => {
    const page = buildOnePager({
      level: 'supervisor', locs: ['A', 'B'], period: '2026-W30', author: 'Fletcher',
      currentState: [{ key: 'sales', label: 'Sales', actual: 300000, target: 310000 }],
      opportunity: OPP,
      attention: [{ loc: 'A', title: 'FOB spike', sev: 3 }, { loc: 'B', title: 'nice win', win: true }],
      priorActionItems: [{ title: 'Tighten labor at A', loc: 'A', metricKey: 'laborPct', baselineValue: 0.24, targetValue: 0.22 }],
      metricNow: { A: { laborPct: 0.225 } },
      storeName: nm,
    });
    expect(page.opportunityTotal).toBeCloseTo(OPP.district.total$, 4);
    expect(page.concerns.length).toBe(1);              // sev>=2
    expect(page.wins.length).toBe(1);                  // win:true
    expect(page.followUps[0].follow.status).toBe('improving');
    expect(page.suggestedActions.length).toBeGreaterThan(0);
    expect(page.scopeLabel).toBe('2 stores');
  });
});
