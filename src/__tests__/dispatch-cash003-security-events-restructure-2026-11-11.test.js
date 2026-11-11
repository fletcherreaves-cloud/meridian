// @ts-nocheck
// CASH-003 restructure (2026-11-11): audit_rows (the Register Audit pull) has been dead
// company-wide since 2026-09-19 -- a QSRSoft-side 403 "explicit deny" on that one report,
// confirmed from the real job log, unrelated to token expiry (memory/finding-register-audit-
// pull-403-explicit-deny-2026-11-11.md). CASH-003's own rule definition (manual/self-authorized
// refund $, personal baseline, $5 threshold) is unchanged -- only its DATA SOURCE moves, from
// the dead audit_rows to the already-live qsr_security_events pull, which carries the same
// underlying cash_refund/cashless_refund events at individual-transaction grain, with a real
// dollar amount (event_amt) and both the ringing employee (crew_token) and the authorizing
// manager (mgr_token) on every row -- self-authorization is crew_token === mgr_token, confirmed
// as a real, present pattern against live data before this restructure was written (not a
// theoretical filter that would zero everything out).
//
// Per this repo's "would this verification still pass if reverted" rule, these tests exercise
// the real dispatch (supportsManualRefundEvents) and the real aggregator
// (aggregateManualRefundEvents) feeding the SAME computeFindingsForRule every audit_rows-sourced
// CASH rule already uses -- not a parallel compute path invented just for this test.
import { describe, it, expect } from 'vitest';
import {
  supportsManualRefundEvents, aggregateManualRefundEvents, computeFindingsForRule, fieldsFromExpr,
} from '../../scripts/security-rules-run.mjs';

// data_required keeps 'audit_rows' FIRST (computeFindingsForRule's own evaluateRule() call
// hardcodes the dataContext key as 'audit_rows', not rule.data_required[0] -- confirmed by
// reading the real call site, not assumed) -- 'qsr_security_events:manual_refund' is a SECOND,
// additive entry read only by supportsManualRefundEvents()'s dispatch check in main().
const CASH_003_RULE = {
  rule_id: 'CASH-003', logic_type: 'threshold',
  logic_expression: { agg: 'sum', field: 'manualRefAmt', comparator: 'gte' },
  baseline_type: 'personal', threshold: { default: 5 }, window_days: 28,
  data_required: ['audit_rows', 'qsr_security_events:manual_refund'],
};

describe('supportsManualRefundEvents()', () => {
  it('matches a rule carrying the qualified qsr_security_events:manual_refund entry, alongside audit_rows or alone', () => {
    expect(supportsManualRefundEvents({ data_required: ['audit_rows', 'qsr_security_events:manual_refund'] })).toBe(true);
    expect(supportsManualRefundEvents({ data_required: ['qsr_security_events:manual_refund'] })).toBe(true);
    expect(supportsManualRefundEvents({ data_required: ['qsr_security_events'] })).toBe(false);
    expect(supportsManualRefundEvents({ data_required: ['audit_rows'] })).toBe(false);
  });
});

describe('aggregateManualRefundEvents() — self-authorization filter + dollar sum', () => {
  const ev = (over = {}) => ({
    loc: '0003708', event_dt: '2026-11-01', event_token: 'cash_refund',
    crew_token: 'crew-a', mgr_token: 'crew-a', event_amt: '3.50',
    ...over,
  });

  it('sums self-authorized (crew_token === mgr_token) cash_refund/cashless_refund events into manualRefAmt/manualRefCnt', () => {
    const rows = aggregateManualRefundEvents([
      ev({ event_amt: '3.50' }),
      ev({ event_amt: '2.10', event_token: 'cashless_refund' }),
    ]);
    expect(rows).toEqual([
      { loc: '0003708', date: '2026-11-01', emp: 'crew-a', empToken: 'crew-a', manualRefAmt: 5.6, manualRefCnt: 2 },
    ]);
  });

  it('excludes a manager-authorized refund (different crew_token and mgr_token) -- not self-authorized', () => {
    const rows = aggregateManualRefundEvents([ev({ crew_token: 'crew-a', mgr_token: 'crew-b' })]);
    expect(rows).toEqual([]);
  });

  it('excludes event types other than cash_refund/cashless_refund (e.g. pos_overring, t_red_before)', () => {
    const rows = aggregateManualRefundEvents([
      ev({ event_token: 'pos_overring' }),
      ev({ event_token: 't_red_before' }),
    ]);
    expect(rows).toEqual([]);
  });

  it('excludes rows missing crew_token or mgr_token entirely (unkeyable or no manager code at all)', () => {
    const rows = aggregateManualRefundEvents([
      ev({ crew_token: null }),
      ev({ mgr_token: null }),
    ]);
    expect(rows).toEqual([]);
  });

  it('keeps distinct subjects/stores/dates as separate buckets', () => {
    const rows = aggregateManualRefundEvents([
      ev({ crew_token: 'crew-a', mgr_token: 'crew-a' }),
      ev({ crew_token: 'crew-b', mgr_token: 'crew-b' }),
      ev({ loc: '0005183', crew_token: 'crew-a', mgr_token: 'crew-a' }),
      ev({ event_dt: '2026-11-02', crew_token: 'crew-a', mgr_token: 'crew-a' }),
    ]);
    expect(rows).toHaveLength(4);
  });
});

describe('CASH-003 through the real call site — computeFindingsForRule on aggregateManualRefundEvents output', () => {
  it('flags a subject whose self-authorized refund $ sum clears the $5 threshold', () => {
    const raw = [
      { loc: '0003708', event_dt: '2026-11-01', event_token: 'cash_refund', crew_token: 'tok-lauren', mgr_token: 'tok-lauren', event_amt: '8.47' },
    ];
    const rows = aggregateManualRefundEvents(raw);
    const findings = computeFindingsForRule(CASH_003_RULE, rows, { windowStart: '2026-10-04', windowEnd: '2026-11-01' });
    const f = findings.find(x => x.empToken === 'tok-lauren');
    expect(f).toBeTruthy();
    expect(f.pass).toBe(true);
    expect(f.value).toBeCloseTo(8.47, 2);
  });

  it('does not flag a subject under the threshold', () => {
    const raw = [
      { loc: '0003708', event_dt: '2026-11-01', event_token: 'cash_refund', crew_token: 'tok-jordan', mgr_token: 'tok-jordan', event_amt: '3.00' },
    ];
    const rows = aggregateManualRefundEvents(raw);
    const findings = computeFindingsForRule(CASH_003_RULE, rows, { windowStart: '2026-10-04', windowEnd: '2026-11-01' });
    const f = findings.find(x => x.empToken === 'tok-jordan');
    expect(f.pass).toBe(false);
  });

  it('fieldsFromExpr still resolves manualRefAmt unchanged (the rule definition itself was never touched)', () => {
    expect(fieldsFromExpr(CASH_003_RULE)).toEqual({ numField: 'manualRefAmt', denField: undefined, scale: 1, abs: false });
  });
});
