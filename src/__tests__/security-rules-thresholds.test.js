// @ts-nocheck
// PR #481 review (dispatch #42): a z-score rule's `min_value` materiality floor can be set ABOVE
// that rule's own achievable range, silently making the rule incapable of ever flagging while its
// `logic_type` conversion looks complete. `phase1c.sql` originally carried
// INV-002's OLD ratio threshold (10) forward as INV-002's new min_value, without re-checking it
// against that rule's own measured range (max ~0.09) -- the engine has no way to detect this itself, since a value
// that never clears a floor is indistinguishable from a value that's genuinely never large enough.
//
// Dispatch #44 widens this from phase1c.sql's z-score pair to EVERY rule in the seed/migration
// family that sets an absolute comparator value: a plain `ratio`/`threshold` rule's own
// `threshold.default` is exactly the same failure mode (CASH-003's `phase1.sql` threshold of 8 was
// unreachable against a measured max of 0.7702 -- PR #481's merge commit named this as the SAME
// defect class INV-002 had, on a different rule shape) -- so this file now guards `min_value`
// wherever a z-score rule sets it AND `threshold.default` wherever ANY rule sets it, across every
// seed/migration file this repo ships, not just the one file that first surfaced the bug.
//
// This parses the REAL seed SQL (not a hand-transcribed copy, which could itself drift out of
// sync with the file) and asserts every absolute comparator value a rule carries sits at or below
// a measured ceiling for that rule -- so a future migration that copies a threshold across rules,
// or bumps one without re-measuring, fails the suite instead of shipping silently inert.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPABASE_DIR = join(__dirname, '../../supabase');

function readSql(file) {
  return readFileSync(join(SUPABASE_DIR, file), 'utf8');
}

// Extracts {rule_id -> {logic_expression, threshold}} from every `update public.security_rules
// set logic_expression = '{...}' ... threshold = '{...}' ... where ... rule_id = 'X'` statement in
// a file. Deliberately simple (this repo's migrations are hand-written in one consistent shape,
// not arbitrary SQL) -- splits on the statement-opening phrase so each chunk holds exactly one
// rule's own assignment before the next statement (or trailing comments) begins; the FIRST
// `logic_expression`/`threshold`/`rule_id` match within a chunk is that statement's own, since
// logic_expression/threshold JSON in this repo never contains an embedded apostrophe (unlike
// `description`, which does and uses '' escaping).
function extractUpdateRules(sql) {
  const out = {};
  const chunks = sql.split(/update\s+public\.security_rules\s+set\b/i).slice(1);
  for (const chunk of chunks) {
    const ruleIdMatch = chunk.match(/rule_id\s*=\s*'([^']+)'/);
    if (!ruleIdMatch) continue;
    const exprMatch = chunk.match(/logic_expression\s*=\s*'([^']*)'/);
    const threshMatch = chunk.match(/threshold\s*=\s*'([^']*)'/);
    const entry = out[ruleIdMatch[1]] || {};
    if (exprMatch) { try { entry.logic_expression = JSON.parse(exprMatch[1]); } catch {} }
    if (threshMatch) { try { entry.threshold = JSON.parse(threshMatch[1]); } catch {} }
    out[ruleIdMatch[1]] = entry;
  }
  return out;
}

// Extracts {rule_id -> {logic_expression, threshold}} from every `insert into
// public.security_rules (...) values ('RULE_ID', ...)` statement -- the seed-file shape
// (schema-security-rules-phase1.sql), positional rather than named-SET. The column order is fixed
// across every INSERT this file family uses (schema-security-rules.sql, phase1.sql, phase1b.sql
// all declare the identical column list) -- data_required is always a `[...]` JSON ARRAY (skipped,
// since the value-extraction regex below only matches `{`-opening JSON OBJECTS), so the first
// `{...}` object in a values tuple is always logic_expression and the second is always threshold,
// regardless of what comes after (corroboration_rules/exoneration_rules are Postgres `{...}` ARRAY
// literals, not JSON, but they're positioned AFTER threshold so they never become a false 3rd/4th
// match here -- only the first two matches are read).
function extractInsertRules(sql) {
  const out = {};
  const chunks = sql.split(/insert\s+into\s+public\.security_rules\s*\(/i).slice(1);
  for (const chunk of chunks) {
    const valuesIdx = chunk.search(/\)\s*values\s*\(/i);
    if (valuesIdx === -1) continue;
    const tuple = chunk.slice(valuesIdx);
    const ruleIdMatch = tuple.match(/values\s*\(\s*'([^']+)'/i);
    if (!ruleIdMatch) continue;
    const objects = [...tuple.matchAll(/'(\{[^']*\})'/g)];
    const entry = {};
    if (objects[0]) { try { entry.logic_expression = JSON.parse(objects[0][1]); } catch {} }
    if (objects[1]) { try { entry.threshold = JSON.parse(objects[1][1]); } catch {} }
    out[ruleIdMatch[1]] = entry;
  }
  return out;
}

// Returns the single absolute comparator value a rule's SQL state carries: `min_value` for a
// z-score rule (the materiality floor, optional), `threshold.default` for a ratio/threshold rule
// (the actual comparator) -- whichever this rule's logic_type uses. undefined if neither is set.
function comparatorValue(entry, logicType) {
  if (logicType === 'z-score') return entry.logic_expression?.min_value;
  return entry.threshold?.default;
}

// Measured ceilings, live Supabase, 2026-08-20 -- same session, same query shape the batch job
// itself uses (non-condiment (loc,wrin) subjects / tokenized audit_rows subjects, trailing 3-month
// or 28-day rolling window matching each rule's own window_days). These are NOT re-derived at test
// time (this suite has no DB access, by design -- every other fixture in this file family is
// hand-computed for the same reason) -- they are recorded facts, with their provenance, that a
// future re-measurement should update deliberately rather than this test silently going stale.
const MEASURED_MAX = {
  // INV-001: variance/exp_usage*100, subjects with exp_usage >= 10 (post min_denominator floor).
  // n=4,659, median=20 (min_value=20 clears exactly half -- the "roughly half" the migration
  // comment and dispatch #42 §4 both describe), max=7,569.
  'INV-001': 7569,
  // INV-002: |dol_diff| per $1,000 storeMonthSales (qsr_fob join). n=5,302, max=0.087. This is
  // WHY INV-002 carries no min_value at all (see schema-security-rules-phase1c.sql) -- any floor
  // in the old ratio-threshold's units (single digits or more) would be unreachable here.
  'INV-002': 0.087,
  // Dispatch #44: measured live from security_findings (post min_denominator floor, 2026-08-20).
  // CASH-001/002/004 sit comfortably inside their own ranges already -- included here to close the
  // defect class (any rule that sets an absolute value, not just the two that were already known
  // broken), not because either needed a fix.
  'CASH-001': 38.887,  // cashOSDollar/drawerSales*1000, threshold 5 (well below median 0.59 -- reachable)
  'CASH-002': 80,      // posOverCnt/drawerGC*1000, threshold 15 (below median 2.39 -- reachable)
  'CASH-004': 162.1527, // promoAmt/drawerSales*1000, threshold 100 (below median 25.9 -- reachable)
  // CASH-003, schema-security-rules-phase1g.sql -- rebuilt from a rate/count to an ABSOLUTE dollar
  // sum (dispatch #48 lineage, "CASH-003 RESOLVED AND LIVE"). Measured live 2026-08-20, 80-day
  // backfill, 19,985 employee-days, 27 stores: 6 occurrences, 4 employees, $7/$10-median/$26 largest.
  // This is a SUM ceiling, not a rate -- units match threshold.default (dollars) directly.
  'CASH-003': 26, // manualRefAmt sum, threshold 5 (below the smallest real occurrence, $7 -- reachable)
  // Dispatch #48, schema-security-rules-inv003-inv005.sql -- both min_value floors (15 each) are
  // z-score materiality floors, not raw ceilings, so this entry only needs to sit above 15; both
  // re-measured live 2026-08-20 second pass (see that file's own header for the correction on the
  // "only one period" claim), non-condiment/exp_usage>0, period 2026-08:
  'INV-003': 36134.38, // unexplainedVariance/expUsage*100, n=4,221, median=14.98
  'INV-005': 36234.38, // positiveVariance/expUsage*100 among variance>0 subjects, n=1,243, median=15.22
  // Dispatch #48/#50 lineage, schema-security-rules-inv004.sql. wasteAmt/daypartSales*1000, live
  // qsr_waste x qsr_daily_activity join, 2026-05-01 through 2026-08-20, post min_denominator=250
  // floor: n=636, median=12.99. This is the third subject grain (loc,empToken,daypart) -- measured
  // using the raw eID as a grouping key since qsr_waste.emp_token did not exist on the live table
  // at measurement time (PR #498's vault-extension migration had not yet been applied) -- the
  // dollar distributions themselves don't depend on which identity column labels each bucket.
  'INV-004': 1274.79,
};

// Separate map, deliberately: `min_numerator` (dispatch #45 §A) gates the RAW numerator sum, a
// different quantity on a different scale than the RATE `min_value`/`threshold.default` gate above
// -- INV-002's rate ceiling is 0.087 (per $1,000 sales) while its raw-dollar ceiling is $604.49.
// Conflating the two maps would silently compare a dollar amount against a rate ceiling.
const MEASURED_NUMERATOR_MAX = {
  // INV-002: sum(|dol_diff|), non-condiment, live qsr_variance_stat, period 2026-08 (the only
  // period this table currently holds), n=4,474. min=0.00 median=13.66 max=604.49. See
  // schema-security-rules-phase1f.sql's own header for the full decile table.
  'INV-002': 604.49,
};

// Third map, deliberately separate again: `min_stdev` (dispatch #45 §A, second cause) gates the
// BASELINE's own stdev, not a subject's value/rate/numerator -- a fourth independent quantity on
// its own scale. See schema-security-rules-min-stdev.sql's own header for the measured deciles.
const MEASURED_STDEV_P10 = {
  'INV-001': 3.309,
  'INV-002': 0.000861,
  // Dispatch #48, schema-security-rules-inv003-inv005.sql. Both re-measured live 2026-08-20,
  // second pass (the table grew between the two measurements that session -- see that file's own
  // header for the correction). Peer-baseline stdev, per-(loc,wrin) leave-one-out, n>=5 peers,
  // n=4,200 baselines each: INV-003 (unexplainedVariance/expUsage) p10=3.736; INV-005
  // (positiveVariance/expUsage) p10=0.679 -- a measurably degenerate tail (5.0% exact-zero
  // baselines vs INV-003's 0.05%), the reason INV-005 needed the same min_stdev guard built in
  // from the start rather than discovered live, per dispatch #45b's own lesson.
  'INV-003': 3.736,
  'INV-005': 0.679,
  // Dispatch #48/#50 lineage, schema-security-rules-inv004.sql. Peer-baseline stdev, per-daypart
  // leave-one-out across stores, n>=5 peers, n=128 baselines: p5=5.83, p10=5.96, median=7.40 -- a
  // well-behaved distribution (zero exact-zero, zero below 1), unlike INV-005's own metric.
  'INV-004': 5.96,
};

describe('security_rules seed/migration SQL — an absolute comparator value must sit inside its own measured range', () => {
  const seedRules = extractInsertRules(readSql('schema-security-rules.sql'));
  const phase1Rules = extractInsertRules(readSql('schema-security-rules-phase1.sql'));
  const phase1bRules = extractInsertRules(readSql('schema-security-rules-phase1b.sql'));
  const phase1cRules = extractUpdateRules(readSql('schema-security-rules-phase1c.sql'));
  const phase1eRules = extractUpdateRules(readSql('schema-security-rules-phase1e.sql'));
  const phase1fRules = extractUpdateRules(readSql('schema-security-rules-phase1f.sql'));
  const phase1gRules = extractUpdateRules(readSql('schema-security-rules-phase1g.sql'));
  const minStdevRules = extractUpdateRules(readSql('schema-security-rules-min-stdev.sql'));
  const inv003inv005Rules = extractInsertRules(readSql('schema-security-rules-inv003-inv005.sql'));
  const inv004Rules = extractInsertRules(readSql('schema-security-rules-inv004.sql'));

  // rule_id -> {entry, logicType}. logicType is read from THIS test file's own knowledge of each
  // rule's real logic_type (phase1.sql's rule inserts don't repeat it in a name=value pair this
  // parser captures separately from logic_expression/threshold) -- CASH-001/002/004 stay 'ratio'
  // (schema-security-rules.sql / phase1.sql never convert them), INV-001/INV-002 are 'z-score' as
  // of phase1c.sql. CASH-003 was 'ratio' from phase1.sql through phase1e.sql (only its fields
  // changed there); phase1g.sql (dispatch #48 lineage) converts it again, this time to
  // 'threshold' -- an absolute sum, no denominator. comparatorValue() branches only on
  // logicType === 'z-score', so labeling this 'threshold' rather than 'ratio' changes nothing about
  // which field it reads (still threshold.default) -- it's here for the reader, not the parser.
  const CASES = [
    { ruleId: 'INV-001', logicType: 'z-score', entry: phase1cRules['INV-001'] },
    { ruleId: 'INV-002', logicType: 'z-score', entry: phase1cRules['INV-002'] },
    { ruleId: 'CASH-001', logicType: 'ratio', entry: seedRules['CASH-001'] },
    { ruleId: 'CASH-002', logicType: 'ratio', entry: seedRules['CASH-002'] },
    { ruleId: 'CASH-003', logicType: 'threshold', entry: phase1gRules['CASH-003'] },
    { ruleId: 'CASH-004', logicType: 'ratio', entry: phase1Rules['CASH-004'] },
    { ruleId: 'INV-003', logicType: 'z-score', entry: inv003inv005Rules['INV-003'] },
    { ruleId: 'INV-005', logicType: 'z-score', entry: inv003inv005Rules['INV-005'] },
    { ruleId: 'INV-004', logicType: 'z-score', entry: inv004Rules['INV-004'] },
  ];

  it('parses every rule this suite guards from its real source file', () => {
    expect(phase1cRules['INV-001']).toBeTruthy();
    expect(phase1cRules['INV-002']).toBeTruthy();
    expect(seedRules['CASH-001']).toBeTruthy();
    expect(seedRules['CASH-002']).toBeTruthy();
    expect(phase1eRules['CASH-003']).toBeTruthy();
    expect(phase1gRules['CASH-003']).toBeTruthy();
    expect(phase1Rules['CASH-004']).toBeTruthy();
    expect(inv003inv005Rules['INV-003']).toBeTruthy();
    expect(inv003inv005Rules['INV-005']).toBeTruthy();
    expect(inv004Rules['INV-004']).toBeTruthy();
  });

  it.each(CASES)('$ruleId: comparator value (if present) does not exceed the measured ceiling', ({ ruleId, logicType, entry }) => {
    const value = comparatorValue(entry, logicType);
    if (value == null) return; // no floor/threshold set -- nothing to check, a valid choice
    expect(value).toBeLessThanOrEqual(MEASURED_MAX[ruleId]);
  });

  it('INV-002 specifically carries NO min_value -- PR #481 review: the old ratio threshold (10) was unreachable here, and no independent materiality number has replaced it', () => {
    expect(phase1cRules['INV-002'].logic_expression.min_value).toBeUndefined();
  });

  it('INV-002\'s min_numerator (dispatch #45 §A, phase1f.sql) sits inside its own measured RAW-dollar range -- a materiality floor min_value structurally could not provide, since the rate is tiny precisely because the denominator is large', () => {
    const minNumerator = phase1fRules['INV-002'].logic_expression.min_numerator;
    expect(minNumerator).toBeDefined();
    expect(minNumerator).toBeLessThanOrEqual(MEASURED_NUMERATOR_MAX['INV-002']);
  });

  it('INV-002\'s min_numerator (15) is a real, non-trivial gate -- sits at this rule\'s own measured median (13.66, rounded), the same "clears roughly half" methodology INV-001\'s min_value used, not an invented number', () => {
    expect(phase1fRules['INV-002'].logic_expression.min_numerator).toBe(15);
  });

  // dispatch #45 §A, second cause -- min_stdev (schema-security-rules-min-stdev.sql). Both floors
  // are set NEAR each rule's own measured p10, not chosen from intuition -- see that file's header
  // for the full measurement (a CV floor was tried first and rejected: the real |z|>10 offenders'
  // CVs sat inside the population's normal range, so only raw stdev separates the failure).
  it('INV-001/INV-002 both carry a real, measured min_stdev -- sits near this rule\'s own p10, not invented', () => {
    expect(minStdevRules['INV-001'].logic_expression.min_stdev).toBe(1);
    expect(minStdevRules['INV-001'].logic_expression.min_stdev).toBeLessThanOrEqual(MEASURED_STDEV_P10['INV-001']);
    expect(minStdevRules['INV-002'].logic_expression.min_stdev).toBe(0.001);
    expect(minStdevRules['INV-002'].logic_expression.min_stdev).toBeLessThanOrEqual(MEASURED_STDEV_P10['INV-002'] * 2); // 0.001 vs p10 0.000861 -- same order of magnitude, not wildly off
  });

  it('the min-stdev migration preserves each rule\'s OTHER logic_expression keys -- a full-literal replacement must not silently drop min_value/min_denominator/min_numerator', () => {
    expect(minStdevRules['INV-001'].logic_expression.min_value).toBe(20);
    expect(minStdevRules['INV-001'].logic_expression.min_denominator).toBe(10);
    expect(minStdevRules['INV-002'].logic_expression.min_numerator).toBe(15);
  });

  it('INV-001\'s min_value (20) is a real, non-trivial gate -- clears roughly half the floor-passing population, not ~0% or ~100%', () => {
    // Guards against the OTHER failure direction: a floor so low it gates nothing, or so high
    // it's unreachable like INV-002's was. 20 sits at this rule's measured median (post
    // min_denominator=10 floor) -- exactly the "roughly half" this build's own docs claim.
    expect(phase1cRules['INV-001'].logic_expression.min_value).toBe(20);
  });

  it('CASH-003 carried NO threshold immediately after phase1e.sql (dispatch #44) -- manual_ref_cnt had never been pulled at that point, so no measured range existed yet. HISTORICAL: phase1g.sql (dispatch #48 lineage) supersedes this state -- manual_ref_cnt turned out not to exist at all, and CASH-003 is rebuilt as an absolute dollar threshold below, not a count rate', () => {
    expect(phase1eRules['CASH-003'].threshold).toEqual({});
  });

  it('CASH-003\'s current, LIVE threshold (phase1g.sql, dispatch #48 lineage) sits inside its own measured range and is active -- rebuilt as an absolute manualRefAmt dollar sum after the count field it would have needed (manual_ref_cnt) was confirmed to not exist in the API response at all', () => {
    expect(phase1gRules['CASH-003'].logic_expression.field).toBe('manualRefAmt');
    expect(phase1gRules['CASH-003'].logic_expression.denominator).toBeUndefined();
    expect(phase1gRules['CASH-003'].threshold.default).toBe(5);
    expect(phase1gRules['CASH-003'].threshold.default).toBeLessThanOrEqual(MEASURED_MAX['CASH-003']);
    const sql = readSql('schema-security-rules-phase1g.sql');
    expect(sql).toMatch(/active\s*=\s*true/);
  });

  it('CASH-003\'s OLD phase1.sql threshold (8) really was unreachable -- the regression this migration fixes, confirmed against phase1.sql\'s own real seed text', () => {
    // Not asserted against MEASURED_MAX (CASH-003 is deliberately excluded from that map, see
    // above) -- this documents the specific historical value phase1e.sql supersedes, read from
    // phase1.sql itself so a revert of phase1e.sql without reverting this comment can't drift.
    expect(phase1Rules['CASH-003'].threshold.default).toBe(8);
    expect(phase1Rules['CASH-003'].logic_expression.numerator.field).toBe('manualRefAmt');
  });

  it('CASH-004\'s threshold (100) sits well inside its own measured range, and CASH-001/002 (unchanged by this dispatch) do too -- the guard now covers phase1.sql\'s ratio rules, not just phase1c.sql\'s z-score pair', () => {
    expect(phase1Rules['CASH-004'].threshold.default).toBe(100);
    expect(phase1Rules['CASH-004'].threshold.default).toBeLessThanOrEqual(MEASURED_MAX['CASH-004']);
  });

  // phase1b.sql's own INV-001/INV-002 seed thresholds (dispatch #40) are HISTORICAL, superseded by
  // phase1c.sql's z-score conversion (already guarded above via phase1cRules) -- the rules these
  // values would gate no longer exist as 'ratio' type in production. Documented, not asserted
  // against MEASURED_MAX: INV-002's original 10 genuinely WAS unreachable at the time (this is the
  // exact "INV-002: 10 vs 0.0868, 115x" instance memory/finding-unreachable-threshold-class-2026-
  // 08-20.md records), and re-litigating it against a live ceiling here would fail the suite over a
  // migration file nobody re-runs standalone -- the same reasoning CASH-003's own historical
  // phase1.sql value gets above. If a future migration ever reintroduces phase1b.sql's shape as the
  // CURRENT effective rule, the CASES loop (which reads phase1cRules, the actual production state)
  // is what would catch it going forward.
  it('phase1b.sql\'s original seed values are read correctly (historical record, not a live gate)', () => {
    expect(phase1bRules['INV-001'].threshold.default).toBe(20);
    expect(phase1bRules['INV-002'].threshold.default).toBe(10);
  });

  // Dispatch #48 -- INV-003 (variance unmatched by logged waste) and INV-005 (phantom gains).
  // Both built min_stdev in FROM THE START (not discovered live, per dispatch #45b's own lesson
  // -- INV-005's peer-baseline stdev distribution is measurably degenerate, same defect class as
  // INV-001/INV-002 originally shipped without a guard for). Both carry the SAME min_value (15)
  // since it's each rule's own population median, not a copied number -- see that file's header.
  it('INV-003/INV-005 both carry a real, measured min_stdev, at or below this rule\'s own p10', () => {
    expect(inv003inv005Rules['INV-003'].logic_expression.min_stdev).toBe(1);
    expect(inv003inv005Rules['INV-003'].logic_expression.min_stdev).toBeLessThanOrEqual(MEASURED_STDEV_P10['INV-003']);
    expect(inv003inv005Rules['INV-005'].logic_expression.min_stdev).toBe(1);
    // INV-005's min_stdev (1) sits ABOVE its own p10 (0.679) -- unlike every other rule in this
    // suite -- by design: dispatch #48's own header explains this is deliberately sized to clear
    // the degenerate exact-zero/near-zero cluster (14.0% of baselines sit below 1), not to sit
    // beneath the p10 the way a normal materiality floor would. Asserted directly against the
    // measured value, not the <=p10 pattern the other rules use.
    expect(inv003inv005Rules['INV-005'].logic_expression.min_stdev).toBeGreaterThan(MEASURED_STDEV_P10['INV-005']);
  });

  it('INV-003/INV-005 both carry the same measured min_value (15) and min_denominator (10) -- not copied blindly, each is that rule\'s own population median / INV-001\'s established exp_usage floor', () => {
    expect(inv003inv005Rules['INV-003'].logic_expression.min_value).toBe(15);
    expect(inv003inv005Rules['INV-003'].logic_expression.min_denominator).toBe(10);
    expect(inv003inv005Rules['INV-005'].logic_expression.min_value).toBe(15);
    expect(inv003inv005Rules['INV-005'].logic_expression.min_denominator).toBe(10);
  });

  it('INV-003/INV-005 read the sign-verified derived fields, not raw variance -- a reversed rule would silently detect the opposite of what it claims (dispatch #48\'s own warning)', () => {
    expect(inv003inv005Rules['INV-003'].logic_expression.numerator.field).toBe('unexplainedVariance');
    expect(inv003inv005Rules['INV-005'].logic_expression.numerator.field).toBe('positiveVariance');
    expect(inv003inv005Rules['INV-003'].logic_expression.denominator.field).toBe('expUsage');
    expect(inv003inv005Rules['INV-005'].logic_expression.denominator.field).toBe('expUsage');
  });

  // Dispatch #48's own explicit instruction: "all three [rules] land inactive with measured
  // thresholds." Directly guards a mistake made and caught mid-build this same session (an earlier
  // draft of this migration shipped both rules `active: true`) -- a plain string check against the
  // real SQL text, since `active` is a bare boolean literal in the VALUES tuple, not a `{...}` JSON
  // object extractInsertRules() parses out.
  it('INV-003/INV-005 both land active=false -- a first live run, not a live-panel debut, per dispatch #48', () => {
    const sql = readSql('schema-security-rules-inv003-inv005.sql');
    const inv003Tuple = sql.slice(sql.indexOf("'INV-003'"), sql.indexOf("on conflict", sql.indexOf("'INV-003'")));
    const inv005Tuple = sql.slice(sql.indexOf("'INV-005'"), sql.indexOf("on conflict", sql.indexOf("'INV-005'")));
    expect(inv003Tuple).toMatch(/,\s*false\s*\)\s*$/);
    expect(inv005Tuple).toMatch(/,\s*false\s*\)\s*$/);
  });

  // Dispatch #48/#50 lineage -- INV-004 (waste-log padding, manager x day-part x store), the third
  // subject grain. "No day-part sales denominator" was the original brief's wrong premise
  // (dispatch #50's own correction); qsr_daily_activity already carries the hourly figure.
  it('INV-004 carries a real, measured min_stdev at or below this rule\'s own p10 (built in from the start, per dispatch #45b\'s standing lesson)', () => {
    expect(inv004Rules['INV-004'].logic_expression.min_stdev).toBe(1);
    expect(inv004Rules['INV-004'].logic_expression.min_stdev).toBeLessThanOrEqual(MEASURED_STDEV_P10['INV-004']);
  });

  it('INV-004\'s min_value (13, this rule\'s own population median) and min_denominator (250, a sales-exposure floor clearing the 23 of 687 subjects with a non-positive daypartSales) are real, measured floors', () => {
    expect(inv004Rules['INV-004'].logic_expression.min_value).toBe(13);
    expect(inv004Rules['INV-004'].logic_expression.min_denominator).toBe(250);
  });

  it('INV-004 reads wasteAmt/daypartSales -- the derived join fields, never the raw qsr_waste.manager eID or a plaintext identifier', () => {
    expect(inv004Rules['INV-004'].logic_expression.numerator.field).toBe('wasteAmt');
    expect(inv004Rules['INV-004'].logic_expression.denominator.field).toBe('daypartSales');
  });

  it('INV-004 requires BOTH qsr_waste and qsr_daily_activity -- the pair supportsWasteDaypart() checks for, not either name alone', () => {
    const sql = readSql('schema-security-rules-inv004.sql');
    expect(sql).toMatch(/'\["qsr_waste",\s*"qsr_daily_activity"\]'/);
  });

  it('INV-004 lands active=false -- a first live run, not a live-panel debut', () => {
    const sql = readSql('schema-security-rules-inv004.sql');
    const tuple = sql.slice(sql.indexOf("'INV-004'"), sql.indexOf('on conflict', sql.indexOf("'INV-004'")));
    expect(tuple).toMatch(/,\s*false\s*\)\s*$/);
  });
});
