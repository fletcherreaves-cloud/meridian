// @ts-nocheck
// supabase/functions/sage-chat/eom-recount-note.js's EOM_RECOUNT_NOTE constant is imported live
// by index.ts's query_eom_recount_impact tool (the same plain-JS pattern promo-roi-note.js uses,
// already tested by sage-promo-roi-warning.test.js). The file's own header comment claims it is
// "imported directly... and by its Vitest test in src/__tests__/, so the SAME text that ships to
// production is what the test exercises" -- but no such test existed. This file is that test,
// and also makes the header comment's claim true.
import { describe, it, expect } from 'vitest';
import { EOM_RECOUNT_NOTE } from '../../supabase/functions/sage-chat/eom-recount-note.js';

describe('SAGE query_eom_recount_impact note (dispatch-226.md)', () => {
  it('names the same-store, same-item, session-vs-final-count methodology', () => {
    expect(EOM_RECOUNT_NOTE).toMatch(/same-store, same-item/i);
    expect(EOM_RECOUNT_NOTE).toMatch(/SESSION count vs FINAL count/);
    expect(EOM_RECOUNT_NOTE).toMatch(/EOM close window/i);
  });

  it('states plainly this is NOT a between-store comparison, and why (self-selection)', () => {
    expect(EOM_RECOUNT_NOTE).toMatch(/NOT a between-store comparison/i);
    expect(EOM_RECOUNT_NOTE).toMatch(/self-selection/i);
  });

  it('documents all four engagement.verdict values', () => {
    expect(EOM_RECOUNT_NOTE).toMatch(/improving=/);
    expect(EOM_RECOUNT_NOTE).toMatch(/worsened=/);
    expect(EOM_RECOUNT_NOTE).toMatch(/mixed=/);
    expect(EOM_RECOUNT_NOTE).toMatch(/no-action=/);
  });

  it('explains moved_toward_zero_dollars sign convention and warns against just counting recounts', () => {
    expect(EOM_RECOUNT_NOTE).toContain('moved_toward_zero_dollars');
    expect(EOM_RECOUNT_NOTE).toMatch(/don't just count recounts/i);
  });

  it('flags the tool\'s FOB-only scope and the absence of a total food-cost % figure in the data model', () => {
    expect(EOM_RECOUNT_NOTE).toMatch(/FOB \(food\/beverage on-hand inventory variance\) impact ONLY/);
    expect(EOM_RECOUNT_NOTE).toMatch(/NOT present anywhere in Meridian's data model/);
    expect(EOM_RECOUNT_NOTE).toMatch(/cannot currently be measured here/i);
  });
});
