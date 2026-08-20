// @ts-nocheck
// PR #481 review (dispatch #42): a z-score rule's `min_value` materiality floor can be set ABOVE
// that rule's own achievable range, silently making the rule incapable of ever flagging while its
// `logic_type` conversion looks complete. INV-001's original `phase1c.sql` carried forward
// INV-002's OLD ratio threshold (10) as its new min_value without re-checking it against INV-002's
// own measured range (max ~0.09) -- the engine has no way to detect this itself, since a value
// that never clears a floor is indistinguishable from a value that's genuinely never large enough.
//
// This parses the REAL seed SQL (not a hand-transcribed copy, which could itself drift out of
// sync with the file) and asserts every min_value a z-score rule carries sits at or below a
// measured ceiling for that rule -- so a future migration that copies a threshold across rules,
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

// Extracts {rule_id -> logic_expression object} from every `update public.security_rules set
// logic_expression = '{...}' ... where ... rule_id = 'X'` statement in a file. Deliberately simple
// (this repo's migrations are hand-written in one consistent shape, not arbitrary SQL) -- splits
// on the statement-opening phrase so each chunk holds exactly one rule's own assignment before the
// next statement (or trailing comments) begins; the FIRST `logic_expression`/`rule_id` match
// within a chunk is that statement's own, since logic_expression JSON in this repo never contains
// an embedded apostrophe (unlike `description`, which does and uses '' escaping).
function extractLogicExpressions(sql) {
  const out = {};
  const chunks = sql.split(/update\s+public\.security_rules\s+set\b/i).slice(1);
  for (const chunk of chunks) {
    const exprMatch = chunk.match(/logic_expression\s*=\s*'([^']*)'/);
    const ruleIdMatch = chunk.match(/rule_id\s*=\s*'([^']+)'/);
    if (!exprMatch || !ruleIdMatch) continue;
    let expr;
    try { expr = JSON.parse(exprMatch[1]); } catch { continue; }
    out[ruleIdMatch[1]] = expr;
  }
  return out;
}

// Measured ceilings, live Supabase, 2026-08-20 -- same session, same query shape the batch job
// itself uses (non-condiment (loc,wrin) subjects, trailing 3-month window). These are NOT
// re-derived at test time (this suite has no DB access, by design -- every other fixture in this
// file family is hand-computed for the same reason) -- they are recorded facts, with their
// provenance, that a future re-measurement should update deliberately rather than this test
// silently going stale.
const MEASURED_MAX = {
  // INV-001: variance/exp_usage*100, subjects with exp_usage >= 10 (post min_denominator floor).
  // n=4,659, median=20 (min_value=20 clears exactly half -- the "roughly half" the migration
  // comment and dispatch #42 §4 both describe), max=7,569.
  'INV-001': 7569,
  // INV-002: |dol_diff| per $1,000 storeMonthSales (qsr_fob join). n=5,302, max=0.087. This is
  // WHY INV-002 carries no min_value at all (see schema-security-rules-phase1c.sql) -- any floor
  // in the old ratio-threshold's units (single digits or more) would be unreachable here.
  'INV-002': 0.087,
};

describe('security_rules seed SQL — a z-score rule\'s min_value must be inside its own measured range', () => {
  const expressions = extractLogicExpressions(readSql('schema-security-rules-phase1c.sql'));

  it('parses both INV-001 and INV-002\'s real logic_expression from the file', () => {
    expect(expressions['INV-001']).toBeTruthy();
    expect(expressions['INV-002']).toBeTruthy();
  });

  it.each(Object.keys(MEASURED_MAX))('%s: min_value (if present) does not exceed the measured ceiling', (ruleId) => {
    const expr = expressions[ruleId];
    if (expr.min_value == null) return; // no floor set -- nothing to check, a valid choice (see INV-002)
    expect(expr.min_value).toBeLessThanOrEqual(MEASURED_MAX[ruleId]);
  });

  it('INV-002 specifically carries NO min_value -- PR #481 review: the old ratio threshold (10) was unreachable here, and no independent materiality number has replaced it', () => {
    expect(expressions['INV-002'].min_value).toBeUndefined();
  });

  it('INV-001\'s min_value (20) is a real, non-trivial gate -- clears roughly half the floor-passing population, not ~0% or ~100%', () => {
    // Guards against the OTHER failure direction: a floor so low it gates nothing, or so high
    // it's unreachable like INV-002's was. 20 sits at this rule's measured median (post
    // min_denominator=10 floor) -- exactly the "roughly half" this build's own docs claim.
    expect(expressions['INV-001'].min_value).toBe(20);
  });
});
