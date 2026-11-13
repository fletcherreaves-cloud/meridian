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

describe('EVENT_TOKEN_FIELD — every SCORED EVENT_TOKENS value has a mapped column', () => {
  it('covers all 9 enumerated tokens (all_promo/t_red_before/t_red_after/cash_refund/cashless_refund '
    + 'are deliberately NOT scored by any RULE -- see schema-security-rules-events-phase1.sql -- but '
    + 'still need a count column so aggregateSecurityEventsBySubject can tally them if a future rule '
    + 'wants to; drawer_open IS scored, by EVENT-004, task #131)', () => {
    const EVENT_TOKENS = [
      'all_promo', 't_red_before', 't_red_after', 'cash_refund', 'cashless_refund',
      'employee_meal', 'manager_meal', 'pos_overring', 'drawer_open',
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
  it('drawer_open (EVENT-004, task #131) increments drawerOpenCnt, and -- MEASURED, see '
    + 'memory/finding-qsrsoft-security-events-drawer-open-2026-11-10.md -- its own row never '
    + 'carries a session (pos_session_start_dt/_tm are the "0000-00-00"/"00:00:00" sentinel, '
    + 'already nulled by security-events.js before this ever reaches the DB), so it must NOT add '
    + 'to sessionCnt on its own; the session for this bucket comes only from the subject\'s OTHER '
    + 'flagged events that same day', () => {
    const withDrawer = [
      ...raw,
      { loc: '0013113', event_dt: '2026-11-01', event_token: 'drawer_open', crew_token: 'crew-A', mgr_token: 'mgr-X', pos_session_start_dt: null, pos_session_start_tm: null },
      { loc: '0013113', event_dt: '2026-11-01', event_token: 'drawer_open', crew_token: 'crew-A', mgr_token: 'mgr-X', pos_session_start_dt: null, pos_session_start_tm: null },
    ];
    const out = aggregateSecurityEventsBySubject(withDrawer, 'crewToken');
    const row = out.find(r => r.empToken === 'crew-A' && r.date === '2026-11-01');
    // Still sessionCnt 2 (from employee_meal's 08:00 session + pos_overring's 14:00 session) --
    // the two sessionless drawer_open rows add 0 sessions, only +2 to drawerOpenCnt.
    expect(row).toMatchObject({ drawerOpenCnt: 2, employeeMealCnt: 2, posOverringCnt: 1, sessionCnt: 2 });
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
  // Phase 1b camera-hint fix (2026-11-12 follow-on) -- EVENT-* rules now get the same day-level
  // breakdown CASH-* rules got in Phase 1.
  it('a flagged subject gets dailyBreaches naming the specific day; a clear subject gets none', () => {
    const findings = computeSecurityEventFindingsForRule(rule, rows, { windowStart: '2026-11-01', windowEnd: '2026-11-09' });
    const a = findings.find(f => f.empToken === 'crew-A');
    const b = findings.find(f => f.empToken === 'crew-B');
    expect(a.dailyBreaches).toEqual([{ date: '2026-11-01', value: 1000, thresholdUsed: 50 }]);
    expect(b.dailyBreaches).toEqual([]);
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

describe('computeSecurityEventFindingsForRule() — EVENT-004-shaped (drawer_open, task #131), z-score peer baseline', () => {
  // EVENT-004's REAL shape, matching its live `security_rules` row
  // (supabase/schema-security-rules-events-drawer-open-2026-11-10.sql) -- z-score, NOT a flat
  // ratio threshold. ⚠️ Matches what EVENT-001/002/003 actually run as TODAY (confirmed via a
  // live REST read, 2026-11-10): all three were upgraded from the flat-ratio shape their own
  // phase1 SQL file still documents to z-score/threshold 2.5 sometime after that file was
  // written, and EVENT-004 is built to match its siblings' CURRENT shape, not the stale
  // phase1 file's. See memory/finding-qsrsoft-security-events-drawer-open-2026-11-10.md.
  // Same peer-baseline convention as EVENT-001/002 (store colleagues, not EVENT-003's store-vs-
  // store), min_denominator 5, scale 1000.
  const rule = {
    rule_id: 'EVENT-004', baseline_type: 'peer',
    logic_type: 'z-score',
    logic_expression: { numerator: { field: 'drawerOpenCnt', agg: 'sum' }, denominator: { field: 'sessionCnt', agg: 'sum' }, scale: 1000, comparator: 'gte', min_denominator: 5 },
    threshold: { default: 2.5 },
  };

  // Store S1: crew-A (subject) rate 50/1,000 sessions. Peers crew-B..crew-F (5 peers, same store,
  // same window): 8/9/11/12/10 per 1,000 -- same hand-computed peer stats as this repo's own
  // LABOR-003/INV-004 z-score fixtures (mean=10, stdev=sqrt(2)~=1.4142). sessionCnt=1000 for
  // every row so drawerOpenCnt IS the per-1,000 rate directly. z=(50-10)/1.4142~=28.3, far past
  // threshold 2.5.
  const rows = [
    { loc: 'S1', date: '2026-11-01', emp: 'crew-A', empToken: 'crew-A', drawerOpenCnt: 50, sessionCnt: 1000 },
    { loc: 'S1', date: '2026-11-01', emp: 'crew-B', empToken: 'crew-B', drawerOpenCnt: 8,  sessionCnt: 1000 },
    { loc: 'S1', date: '2026-11-01', emp: 'crew-C', empToken: 'crew-C', drawerOpenCnt: 9,  sessionCnt: 1000 },
    { loc: 'S1', date: '2026-11-01', emp: 'crew-D', empToken: 'crew-D', drawerOpenCnt: 11, sessionCnt: 1000 },
    { loc: 'S1', date: '2026-11-01', emp: 'crew-E', empToken: 'crew-E', drawerOpenCnt: 12, sessionCnt: 1000 },
    { loc: 'S1', date: '2026-11-01', emp: 'crew-F', empToken: 'crew-F', drawerOpenCnt: 10, sessionCnt: 1000 },
  ];

  it('flags the outlier crew member, z-scored against the other 5 crew at the same store', () => {
    const findings = computeSecurityEventFindingsForRule(rule, rows, { windowStart: '2026-11-01', windowEnd: '2026-11-09' });
    const a = findings.find(f => f.empToken === 'crew-A');
    expect(a.value).toBeCloseTo(50, 6);
    expect(a.pass).toBe(true);
    expect(a.baselineContext.mean).toBeCloseTo(10, 6);
    expect(a.baselineContext.stdev).toBeCloseTo(Math.sqrt(2), 4);
  });
  it('an in-range peer stays clear (a real, decided pass:false, not a null)', () => {
    const findings = computeSecurityEventFindingsForRule(rule, rows, { windowStart: '2026-11-01', windowEnd: '2026-11-09' });
    const b = findings.find(f => f.empToken === 'crew-B');
    expect(b.pass).toBe(false);
  });
});
