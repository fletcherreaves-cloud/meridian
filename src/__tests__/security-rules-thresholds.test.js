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
  // CASH-003 is deliberately ABSENT: manual_ref_cnt has never been pulled (dispatch #44), so no
  // measured range exists for the count-based rate that replaces the old, unreachable dollar rate.
  // The "no threshold set" test below guards this directly, the same way INV-002's own test does.
};

describe('security_rules seed/migration SQL — an absolute comparator value must sit inside its own measured range', () => {
  const seedRules = extractInsertRules(readSql('schema-security-rules.sql'));
  const phase1Rules = extractInsertRules(readSql('schema-security-rules-phase1.sql'));
  const phase1cRules = extractUpdateRules(readSql('schema-security-rules-phase1c.sql'));
  const phase1eRules = extractUpdateRules(readSql('schema-security-rules-phase1e.sql'));

  // rule_id -> {entry, logicType}. logicType is read from THIS test file's own knowledge of each
  // rule's real logic_type (phase1.sql's rule inserts don't repeat it in a name=value pair this
  // parser captures separately from logic_expression/threshold) -- CASH-001/002/004 stay 'ratio'
  // (schema-security-rules.sql / phase1.sql never convert them), INV-001/INV-002 are 'z-score' as
  // of phase1c.sql, CASH-003 is 'ratio' both before AND after phase1e.sql (only its fields changed).
  const CASES = [
    { ruleId: 'INV-001', logicType: 'z-score', entry: phase1cRules['INV-001'] },
    { ruleId: 'INV-002', logicType: 'z-score', entry: phase1cRules['INV-002'] },
    { ruleId: 'CASH-001', logicType: 'ratio', entry: seedRules['CASH-001'] },
    { ruleId: 'CASH-002', logicType: 'ratio', entry: seedRules['CASH-002'] },
    { ruleId: 'CASH-003', logicType: 'ratio', entry: phase1eRules['CASH-003'] },
    { ruleId: 'CASH-004', logicType: 'ratio', entry: phase1Rules['CASH-004'] },
  ];

  it('parses every rule this suite guards from its real source file', () => {
    expect(phase1cRules['INV-001']).toBeTruthy();
    expect(phase1cRules['INV-002']).toBeTruthy();
    expect(seedRules['CASH-001']).toBeTruthy();
    expect(seedRules['CASH-002']).toBeTruthy();
    expect(phase1eRules['CASH-003']).toBeTruthy();
    expect(phase1Rules['CASH-004']).toBeTruthy();
  });

  it.each(CASES)('$ruleId: comparator value (if present) does not exceed the measured ceiling', ({ ruleId, logicType, entry }) => {
    const value = comparatorValue(entry, logicType);
    if (value == null) return; // no floor/threshold set -- nothing to check, a valid choice
    expect(value).toBeLessThanOrEqual(MEASURED_MAX[ruleId]);
  });

  it('INV-002 specifically carries NO min_value -- PR #481 review: the old ratio threshold (10) was unreachable here, and no independent materiality number has replaced it', () => {
    expect(phase1cRules['INV-002'].logic_expression.min_value).toBeUndefined();
  });

  it('INV-001\'s min_value (20) is a real, non-trivial gate -- clears roughly half the floor-passing population, not ~0% or ~100%', () => {
    // Guards against the OTHER failure direction: a floor so low it gates nothing, or so high
    // it's unreachable like INV-002's was. 20 sits at this rule's measured median (post
    // min_denominator=10 floor) -- exactly the "roughly half" this build's own docs claim.
    expect(phase1cRules['INV-001'].logic_expression.min_value).toBe(20);
  });

  it('CASH-003 specifically carries NO threshold post-fix (dispatch #44) -- manual_ref_cnt has never been pulled, so no measured range exists yet; setting a number now would repeat the exact defect this file exists to catch', () => {
    expect(phase1eRules['CASH-003'].threshold).toEqual({});
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
});
