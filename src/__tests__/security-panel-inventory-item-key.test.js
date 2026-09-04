// @vitest-environment happy-dom
// @ts-nocheck
// security-panel.js's inventoryItemKey had zero direct test coverage despite being live: called
// internally (SubjectDrilldown's population-baseline fetch) to derive the (loc, wrin, period)
// join key for an inventory subject. Its own header comment notes a real prior bug: joining on
// (loc, wrin) alone without period inflated a match ~3.5x (658 rows vs the correct 188).
import { describe, it, expect } from 'vitest';
import { inventoryItemKey } from '../views/security-panel.js';

const RULE_A = 'ruleA', RULE_B = 'ruleB';
const domainRuleIds = new Set([RULE_A, RULE_B]);

describe('inventoryItemKey', () => {
  it('returns null for a non-wrin subject', () => {
    const group = { subjectType: 'employee', loc: '5985', wrin: '12345', verdicts: [] };
    expect(inventoryItemKey(group, domainRuleIds)).toBeNull();
  });

  it('returns null when no verdict has a windowEnd in the domain', () => {
    const group = { subjectType: 'wrin', loc: '5985', wrin: '12345', verdicts: [] };
    expect(inventoryItemKey(group, domainRuleIds)).toBeNull();
  });

  it('builds the (loc, wrin, period) key from the LATEST matching windowEnd, sliced to YYYY-MM', () => {
    const group = {
      subjectType: 'wrin', loc: '5985', wrin: '12345',
      verdicts: [
        { ruleId: RULE_A, windowEnd: '2026-06-15' },
        { ruleId: RULE_B, windowEnd: '2026-08-20' },
        { ruleId: RULE_A, windowEnd: '2026-07-01' },
      ],
    };
    expect(inventoryItemKey(group, domainRuleIds)).toEqual({ period: '2026-08', key: '5985|12345|2026-08' });
  });

  it('excludes a verdict whose ruleId is outside domainRuleIds', () => {
    const group = {
      subjectType: 'wrin', loc: '5985', wrin: '12345',
      verdicts: [{ ruleId: 'unrelatedRule', windowEnd: '2026-09-01' }],
    };
    expect(inventoryItemKey(group, domainRuleIds)).toBeNull();
  });

  it('excludes a verdict carrying a lifecycleCategory (not a real inventory match)', () => {
    const group = {
      subjectType: 'wrin', loc: '5985', wrin: '12345',
      verdicts: [{ ruleId: RULE_A, windowEnd: '2026-09-01', lifecycleCategory: 'new-item' }],
    };
    expect(inventoryItemKey(group, domainRuleIds)).toBeNull();
  });

  it('excludes a verdict with no windowEnd', () => {
    const group = {
      subjectType: 'wrin', loc: '5985', wrin: '12345',
      verdicts: [{ ruleId: RULE_A, windowEnd: null }],
    };
    expect(inventoryItemKey(group, domainRuleIds)).toBeNull();
  });

  it('never joins on (loc, wrin) alone -- period is always part of the key', () => {
    const group = {
      subjectType: 'wrin', loc: '0007', wrin: '99999',
      verdicts: [{ ruleId: RULE_A, windowEnd: '2026-01-31' }],
    };
    const result = inventoryItemKey(group, domainRuleIds);
    expect(result.key).toBe('0007|99999|2026-01');
    expect(result.key.split('|').length).toBe(3);
  });
});
