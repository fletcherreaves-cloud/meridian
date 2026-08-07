import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FINDING_RULES, T_TO_SEVERITY, attachFindingMeta, splitFindingText } from '../engine/finding-rules.js';

const PIPELINE = readFileSync(new URL('../engine/pipeline.js', import.meta.url), 'utf8');

describe('rule coverage', () => {
  it('every rule id emitted by pipeline.js exists in FINDING_RULES', () => {
    const emitted = [...PIPELINE.matchAll(/\{rule:'([A-Za-z0-9]+)'/g)].map(m => m[1]);
    expect(emitted.length).toBeGreaterThanOrEqual(28);
    const missing = [...new Set(emitted)].filter(r => !FINDING_RULES[r]);
    expect(missing, `emitted but unknown: ${missing.join(', ')}`).toEqual([]);
  });

  it('every FINDING_RULES entry is actually emitted (no dead rules)', () => {
    const emitted = new Set([...PIPELINE.matchAll(/\{rule:'([A-Za-z0-9]+)'/g)].map(m => m[1]));
    // store-dash.js rebuilds the forecast finding, so it may be emitted there instead.
    const dead = Object.keys(FINDING_RULES).filter(r => !emitted.has(r));
    expect(dead, `defined but never emitted: ${dead.join(', ')}`).toEqual([]);
  });

  it('every finding pushed in pipeline.js carries a rule id', () => {
    // A push without one would get category 'Other' and no dollars, silently.
    const pushes = [...PIPELINE.matchAll(/push\(\{(?:rule:'[A-Za-z0-9]+',)?t:'(crit|watch|ok|fc)'/g)];
    const untagged = pushes.filter(m => !m[0].includes('rule:'));
    expect(untagged.map(m => m[0]), 'untagged finding push').toEqual([]);
  });
});

describe('dollars at stake', () => {
  // p.weeklySales/7 is the daily base; these assert real arithmetic, not just "not null".
  const p = { weeklySales: 70000, cashOSPct: 0.01, tRedAPct: 0.006, otHrs: 6, avgRate: 14,
              laborPct: 0.26, discPct: 0.085, actHrs: 200, tpph: 4.5, avgCheck: 10,
              oepe: 200, floorMgmtNeeded: 40, floorHrsSched: 30,
              depositBaseline: '20.00%', depositVsSalesRatio: 0.17 };
  const t = { tRedAPct: 0.003, tLabor: 0.22, tTpph: 6, tOepe: 140 };

  it('cash over/short prices the variance against daily sales', () => {
    expect(FINDING_RULES.cashOS.dollars(p, t)).toBeCloseTo(0.01 * 10000, 6);  // $100/day
  });

  it('overtime uses the same premium the message quotes', () => {
    expect(FINDING_RULES.overtime.dollars(p, t)).toBeCloseTo(6 * 1.5 * 14, 6); // $126/day
  });

  it('labor prices only the excess over target', () => {
    expect(FINDING_RULES.labor.dollars(p, t)).toBeCloseTo(0.04 * 10000, 6);   // $400/day
  });

  it('deposit parses the preformatted baseline string', () => {
    // '20.00%' → 0.20; shortfall 0.03 × $10k/day
    expect(FINDING_RULES.deposit.dollars(p, t)).toBeCloseTo(0.03 * 10000, 6);
  });

  it('OEPE prices the abandoned-car proxy quoted in the message', () => {
    expect(FINDING_RULES.oepe.dollars(p, t)).toBeCloseTo(((200 - 140) / 30 * 4) * 10, 6);
  });

  it('never returns a negative or NaN dollar figure', () => {
    // Metrics BETTER than target must not produce negative dollars — that would sort a
    // healthy store above a bleeding one.
    const good = { ...p, cashOSPct: 0, tRedAPct: 0.001, laborPct: 0.18, discPct: 0.01,
                   oepe: 120, tpph: 7, floorHrsSched: 40, depositVsSalesRatio: 0.25, otHrs: 0 };
    for (const [id, r] of Object.entries(FINDING_RULES)) {
      const d = r.dollars(good, t);
      expect(Number.isFinite(d), `${id} returned ${d}`).toBe(true);
      expect(d, `${id} went negative`).toBeGreaterThanOrEqual(0);
    }
  });

  it('tolerates a completely empty perf object', () => {
    for (const [id, r] of Object.entries(FINDING_RULES)) {
      const d = r.dollars({}, {});
      expect(Number.isFinite(d), `${id} returned ${d} on empty input`).toBe(true);
    }
  });
});

describe('splitFindingText', () => {
  it('splits on the em-dash buildBrief actually emits', () => {
    const { title, detail } = splitFindingText('CRITICAL — CASH INTEGRITY: Cash Over/Short averaging 1.20% of sales. Immediate audit.');
    expect(title).toBe('CRITICAL — CASH INTEGRITY');
    expect(detail).toBe('Cash Over/Short averaging 1.20% of sales. Immediate audit.');
  });

  it('handles a finding with no prefix at all', () => {
    const { title, detail } = splitFindingText('All monitored metrics are within normal ranges. No flags raised.');
    expect(title).toBe('All monitored metrics are within normal ranges.');
    expect(detail).toBe('No flags raised.');
  });

  it('is safe on empty and undefined input', () => {
    expect(splitFindingText('')).toEqual({ title: '', detail: '' });
    expect(splitFindingText(undefined)).toEqual({ title: '', detail: '' });
  });
});

describe('attachFindingMeta', () => {
  const p = { weeklySales: 70000, cashOSPct: 0.01 };
  const t = {};

  it('leaves t and m untouched so existing consumers keep working', () => {
    const f = [{ rule: 'cashOS', t: 'crit', m: 'CRITICAL — CASH INTEGRITY: over.' }];
    attachFindingMeta(f, p, t, '10422');
    expect(f[0].t).toBe('crit');
    expect(f[0].m).toBe('CRITICAL — CASH INTEGRITY: over.');
  });

  it('maps the t vocabulary onto attention-feed severities', () => {
    expect(T_TO_SEVERITY).toEqual({ crit: 'crit', watch: 'warn', ok: 'info', fc: 'info' });
    const f = [{ rule: 'cashOS', t: 'crit', m: 'a — b: c' }, { rule: 'labor', t: 'watch', m: 'a — b: c' },
               { rule: 'floorOk', t: 'ok', m: 'a — b: c' }, { rule: 'forecast', t: 'fc', m: 'a — b: c' }];
    attachFindingMeta(f, p, t, '1');
    expect(f.map(x => x.severity)).toEqual(['crit', 'warn', 'info', 'info']);
  });

  it('stamps loc, category, icon and dollars', () => {
    const f = [{ rule: 'cashOS', t: 'crit', m: 'CRITICAL — CASH: x.' }];
    attachFindingMeta(f, p, t, '10422');
    expect(f[0].loc).toBe('10422');
    expect(f[0].category).toBe('Controls');
    expect(f[0].icon).toBe('💵');
    expect(f[0].dollars).toBeCloseTo(100, 6);
  });

  it('handles findings injected without a rule (analytics.js synthesises one)', () => {
    const f = [{ t: 'watch', m: 'FORECAST ACCURACY — MAPE: 14% over the window.' }];
    attachFindingMeta(f, p, t, '10422');
    expect(f[0].severity).toBe('warn');
    expect(f[0].category).toBe('Other');
    expect(f[0].dollars).toBe(0);
    expect(f[0].title).toBe('FORECAST ACCURACY — MAPE');
  });

  it('is idempotent — running twice does not double-apply', () => {
    const f = [{ rule: 'cashOS', t: 'crit', m: 'CRITICAL — CASH: x.' }];
    attachFindingMeta(f, p, t, '10422');
    const first = { ...f[0] };
    attachFindingMeta(f, { ...p, weeklySales: 999999 }, t, 'other');
    expect(f[0]).toEqual(first);
  });

  it('never clobbers an explicit detail', () => {
    const f = [{ rule: 'cashOS', t: 'crit', m: 'CRITICAL — CASH: x.', detail: 'hand-written' }];
    attachFindingMeta(f, p, t, '1');
    expect(f[0].detail).toBe('hand-written');
  });
});
