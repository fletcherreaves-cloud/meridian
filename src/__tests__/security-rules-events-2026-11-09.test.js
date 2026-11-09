// @ts-nocheck
// EVENT-001/002/003 (schema-security-rules-events-phase1.sql, scripts/security-rules-run.mjs's
// own "── EVENTS ──" section) -- same testing precedent as security-rules-run.test.js /
// security-rules-labor-2026-10-12.test.js: pure functions, no Supabase dependency, hand-computed
// expected values in each test's own comment. memory/design-security-events-risk-rules-2026-11-09.md.
import { describe, it, expect } from 'vitest';
import {
  mapSecurityEventRow, EVENT_TOKEN_FIELD,
  supportsSecurityEventsCrew, supportsSecurityEventsMgr,
  aggregateSecurityEventsBySubject, computeSecurityEventFindingsForRule,
} from '../../scripts/security-rules-run.mjs';

describe('mapSecurityEventRow() — snake_case qsr_security_events row -> camelCase, plus the session key', () => {
  it('maps every column this job reads', () => {
    const r = mapSecurityEventRow({
      loc: '0013113', event_dt: '2026-11-01', event_token: 'employee_meal',
      crew_token: 'crew-abc', mgr_token: 'mgr-xyz',
      pos_session_start_dt: '2026-11-01', pos_session_start_tm: '08:00:00',
    });
    expect(r).toEqual({
      loc: '0013113', eventDt: '2026-11-01', eventToken: 'employee_meal',
      crewToken: 'crew-abc', mgrToken: 'mgr-xyz', sessionKey: '2026-11-01|08:00:00',
    });
  });
  it('sessionKey is null when either session field is missing, never a partial key', () => {
    expect(mapSecurityEventRow({ loc: 'A', event_dt: 'd', event_token: 't', pos_session_start_dt: '2026-11-01', pos_session_start_tm: null }).sessionKey).toBe(null);
    expect(mapSecurityEventRow({ loc: 'A', event_dt: 'd', event_token: 't', pos_session_start_dt: null, pos_session_start_tm: '08:00:00' }).sessionKey).toBe(null);
  });
});

describe('EVENT_TOKEN_FIELD — every live EVENT_TOKENS value has a mapped column', () => {
  it('covers all 8 enumerated tokens', () => {
    const EVENT_TOKENS = [
      'all_promo', 't_red_before', 't_red_after', 'cash_refund', 'cashless_refund',
      'employee_meal', 'manager_meal', 'pos_overring',
    ];
    for (const token of EVENT_TOKENS) expect(EVENT_TOKEN_FIELD[token]).toBeTypeOf('string');
  });
});

describe('supportsSecurityEventsCrew() / supportsSecurityEventsMgr() — disambiguated by DATA_REQUIRED, same idiom as LABOR', () => {
  const crewRule = { data_required: ['qsr_security_events'] };
  const mgrRule = { data_required: ['qsr_security_events:manager'] };
  const cashRule = { data_required: ['audit_rows'] };

  it('each predicate is true for its own shape only', () => {
    expect(supportsSecurityEventsCrew(crewRule)).toBe(true);
    expect(supportsSecurityEventsMgr(crewRule)).toBe(false);

    expect(supportsSecurityEventsCrew(mgrRule)).toBe(false);
    expect(supportsSecurityEventsMgr(mgrRule)).toBe(true);
  });
  it('neither matches an unrelated CASH rule', () => {
    expect(supportsSecurityEventsCrew(cashRule)).toBe(false);
    expect(supportsSecurityEventsMgr(cashRule)).toBe(false);
  });
});

describe('aggregateSecurityEventsBySubject() — raw per-event rows -> one row per (loc, date, token)', () => {
  const raw = [
    { loc: '0013113', event_dt: '2026-11-01', event_token: 'employee_meal', crew_token: 'crew-A', mgr_token: 'mgr-X', pos_session_start_dt: '2026-11-01', pos_session_start_tm: '08:00:00' },
    { loc: '0013113', event_dt: '2026-11-01', event_token: 'employee_meal', crew_token: 'crew-A', mgr_token: 'mgr-X', pos_session_start_dt: '2026-11-01', pos_session_start_tm: '08:00:00' },
    { loc: '0013113', event_dt: '2026-11-01', event_token: 'pos_overring',  crew_token: 'crew-A', mgr_token: 'mgr-X', pos_session_start_dt: '2026-11-01', pos_session_start_tm: '14:00:00' },
    { loc: '0013113', event_dt: '2026-11-01', event_token: 'manager_meal', crew_token: 'crew-B', mgr_token: 'mgr-X', pos_session_start_dt: '2026-11-01', pos_session_start_tm: '08:00:00' },
    { loc: '0013113', event_dt: '2026-11-02', event_token: 'employee_meal', crew_token: 'crew-A', mgr_token: 'mgr-X', pos_session_start_dt: '2026-11-02', pos_session_start_tm: '09:00:00' },
  ];

  it('crew subject: two employee_meal + one pos_overring on 11-01, across TWO sessions (08:00 and 14:00) -> sessionCnt 2', () => {
    const out = aggregateSecurityEventsBySubject(raw, 'crewToken');
    const row = out.find(r => r.empToken === 'crew-A' && r.date === '2026-11-01');
    expect(row).toMatchObject({ loc: '0013113', emp: 'crew-A', employeeMealCnt: 2, posOverringCnt: 1, managerMealCnt: 0, sessionCnt: 2 });
  });
  it('a second subject on the same day/loc gets its own bucket', () => {
    const out = aggregateSecurityEventsBySubject(raw, 'crewToken');
    const row = out.find(r => r.empToken === 'crew-B' && r.date === '2026-11-01');
    expect(row).toMatchObject({ managerMealCnt: 1, employeeMealCnt: 0, sessionCnt: 1 });
  });
  it('the same subject on a different day gets a SEPARATE bucket, not accumulated', () => {
    const out = aggregateSecurityEventsBySubject(raw, 'crewToken');
    const row = out.find(r => r.empToken === 'crew-A' && r.date === '2026-11-02');
    expect(row).toMatchObject({ employeeMealCnt: 1, sessionCnt: 1 });
  });
  it('manager subject: every row shares mgr-X, so one bucket per day aggregates across crew members', () => {
    const out = aggregateSecurityEventsBySubject(raw, 'mgrToken');
    const day1 = out.find(r => r.empToken === 'mgr-X' && r.date === '2026-11-01');
    expect(day1).toMatchObject({ employeeMealCnt: 2, managerMealCnt: 1, posOverringCnt: 1, sessionCnt: 2 });
  });
  it('a row with no token for the requested subjectField is dropped, not crashed on', () => {
    const withNull = [...raw, { loc: 'A', event_dt: '2026-11-01', event_token: 'employee_meal', crew_token: null, mgr_token: null, pos_session_start_dt: '2026-11-01', pos_session_start_tm: '10:00:00' }];
    expect(() => aggregateSecurityEventsBySubject(withNull, 'crewToken')).not.toThrow();
    expect(aggregateSecurityEventsBySubject(withNull, 'crewToken').some(r => r.loc === 'A')).toBe(false);
  });
  it('an unmapped event_token (future/unknown) is silently dropped from the counts, never crashes', () => {
    const weird = [{ loc: 'A', event_dt: '2026-11-01', event_token: 'something_new', crew_token: 'crew-Z', pos_session_start_dt: '2026-11-01', pos_session_start_tm: '10:00:00' }];
    const out = aggregateSecurityEventsBySubject(weird, 'crewToken');
    expect(out).toHaveLength(1);
    expect(out[0].sessionCnt).toBe(1);
  });
});

describe('computeSecurityEventFindingsForRule() — EVENT-001-shaped ratio rule, peer baseline', () => {
  // EVENT-001 shape: numerator employeeMealCnt, denominator sessionCnt, scale 1000, threshold 50,
  // peer baseline (same store colleagues). min_denominator 5 (schema-security-rules-events-phase1.sql).
  const rule = {
    rule_id: 'EVENT-001', baseline_type: 'peer',
    logic_type: 'ratio',
    logic_expression: { numerator: { field: 'employeeMealCnt', agg: 'sum' }, denominator: { field: 'sessionCnt', agg: 'sum' }, scale: 1000, comparator: 'gte', min_denominator: 5 },
    threshold: { default: 50 },
  };

  // crew-A: 10 employeeMealCnt over 10 sessions -> rate (10/10)*1000 = 1000, well above 50 -> flagged.
  // crew-B (peer): 1 employeeMealCnt over 25 sessions -> rate (1/25)*1000 = 40, strictly below 50 -> clear, forms the peer population.
  const rows = [
    { loc: 'S1', date: '2026-11-01', emp: 'crew-A', empToken: 'crew-A', employeeMealCnt: 10, sessionCnt: 10 },
    { loc: 'S1', date: '2026-11-02', emp: 'crew-B', empToken: 'crew-B', employeeMealCnt: 1, sessionCnt: 25 },
  ];

  it('flags the subject whose rate crosses the flat threshold', () => {
    const findings = computeSecurityEventFindingsForRule(rule, rows, { windowStart: '2026-11-01', windowEnd: '2026-11-09' });
    const a = findings.find(f => f.empToken === 'crew-A');
    expect(a.pass).toBe(true);
    expect(a.value).toBeCloseTo(1000, 5);
    expect(a.loc).toBe('S1');
  });
  it('clears a subject below threshold, and carries peer baseline context', () => {
    const findings = computeSecurityEventFindingsForRule(rule, rows, { windowStart: '2026-11-01', windowEnd: '2026-11-09' });
    const b = findings.find(f => f.empToken === 'crew-B');
    expect(b.pass).toBe(false);
    expect(b.baselineContext).toHaveProperty('mean');
  });
  it('a subject below min_denominator (too few sessions to mean anything) gets an honest null, not a fabricated verdict', () => {
    const thin = [{ loc: 'S1', date: '2026-11-01', emp: 'crew-C', empToken: 'crew-C', employeeMealCnt: 3, sessionCnt: 2 }];
    const findings = computeSecurityEventFindingsForRule(rule, thin, { windowStart: '2026-11-01', windowEnd: '2026-11-09' });
    expect(findings[0].pass).toBe(null);
    expect(findings[0].value).toBe(null);
  });
});

describe('computeSecurityEventFindingsForRule() — EVENT-003-shaped manager subject, store baseline', () => {
  const rule = {
    rule_id: 'EVENT-003', baseline_type: 'store',
    logic_type: 'ratio',
    logic_expression: { numerator: { field: 'posOverringCnt', agg: 'sum' }, denominator: { field: 'sessionCnt', agg: 'sum' }, scale: 1000, comparator: 'gte', min_denominator: 5 },
    threshold: { default: 100 },
  };

  // mgr-X at store S1: rate 200. mgr-Y at store S2 (the OTHER store, forms the store baseline): rate 10.
  const rows = [
    { loc: 'S1', date: '2026-11-01', emp: 'mgr-X', empToken: 'mgr-X', posOverringCnt: 4, sessionCnt: 20 },
    { loc: 'S2', date: '2026-11-01', emp: 'mgr-Y', empToken: 'mgr-Y', posOverringCnt: 1, sessionCnt: 100 },
  ];

  it('each manager is scored against the OTHER store, never pooled with their own', () => {
    const findings = computeSecurityEventFindingsForRule(rule, rows, { windowStart: '2026-11-01', windowEnd: '2026-11-09' });
    const x = findings.find(f => f.empToken === 'mgr-X');
    expect(x.loc).toBe('S1');
    expect(x.value).toBeCloseTo(200, 5);
    expect(x.pass).toBe(true);
  });
});
