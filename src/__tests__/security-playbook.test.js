// @vitest-environment happy-dom
// @ts-nocheck
// dispatch 2026-11-09 -- src/engine/security-playbook.js is pure data + one pure lookup;
// these are the direct unit tests for playbookForRule(). The render-level tests (does the
// content actually surface inside RuleDirectoryRow) live in src/__tests__/security-panel.test.js
// alongside the rest of that panel's render-test family.
import { describe, it, expect } from 'vitest';
import { SECURITY_PLAYBOOK, playbookForRule } from '../engine/security-playbook.js';

describe('playbookForRule()', () => {
  it('returns null for a falsy ruleId, never throws', () => {
    expect(playbookForRule(null)).toBeNull();
    expect(playbookForRule(undefined)).toBeNull();
    expect(playbookForRule('')).toBeNull();
  });

  it('returns null for a ruleId with no matching playbook entry -- honest-null, not a default entry', () => {
    expect(playbookForRule('ZZZ-999')).toBeNull();
  });

  it('finds the entry that lists the ruleId, for a rule family with a single member', () => {
    const p = playbookForRule('CASH-001');
    expect(p).toBeTruthy();
    expect(p.key).toBe('cash');
    expect(p.ruleIds).toContain('CASH-001');
  });

  it('finds the entry for a ruleId that shares a family with a different-domain rule (EVENT-003 + CASH-002 both map to "override")', () => {
    expect(playbookForRule('EVENT-003').key).toBe('override');
    expect(playbookForRule('CASH-002').key).toBe('override');
  });

  it('finds the entry for a ruleId that is one of several members (INV-003 -> the "inventory" family)', () => {
    const p = playbookForRule('INV-003');
    expect(p.key).toBe('inventory');
    expect(p.ruleIds).toEqual(['INV-001', 'INV-002', 'INV-003', 'INV-004', 'INV-005']);
  });

  it('every entry has the four narrative fields non-empty, and ruleIds is a non-empty array -- a blank field would silently render as an empty line', () => {
    for (const p of SECURITY_PLAYBOOK) {
      expect(p.key, `${p.key}: key`).toBeTruthy();
      expect(p.title, `${p.key}: title`).toBeTruthy();
      expect(p.what, `${p.key}: what`).toBeTruthy();
      expect(p.tell, `${p.key}: tell`).toBeTruthy();
      expect(p.floor, `${p.key}: floor`).toBeTruthy();
      expect(Array.isArray(p.ruleIds) && p.ruleIds.length > 0, `${p.key}: ruleIds`).toBe(true);
    }
  });

  it('ruleIds are disjoint across entries -- one rule_id belongs to at most one playbook family, per the module\'s own comment', () => {
    const seen = new Map();
    for (const p of SECURITY_PLAYBOOK) {
      for (const id of p.ruleIds) {
        expect(seen.has(id), `${id} appears in both ${seen.get(id)} and ${p.key}`).toBe(false);
        seen.set(id, p.key);
      }
    }
  });
});
