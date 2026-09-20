// @ts-nocheck
// Backlog survey (2026-09-20): SAGE's own stated ask ("Document/forms access -- the eBOS form
// library ... exposed as a queryable source; currently none of it reaches SAGE"). Verified live:
// supabase/functions/sage-chat/index.ts had exactly 10 query_*/search_* tools, none touching
// qsr_forms_completion, even though src/views/forms-panel.js's in-app dashboard already reads it
// live and src/engine/forms-completion.js already has the rollup logic (computeFormStoreDayRollup/
// computeFormSummary) that dashboard uses.
//
// This is the new query_forms tool's aggregation logic (forms-agg.js) -- reuses those two real
// engine functions rather than re-deriving the pass/fail math, and only adds the DB-row-shaping +
// response-shaping glue. Imports supabase/functions/sage-chat/forms-agg.js directly -- the same
// plain-JS module index.ts's query_forms tool calls and JSON.stringifies as its literal tool
// result, same "closest thing to the real call site" pattern as sage-labor-summary-agg.test.js
// (no Deno test infrastructure exists in this repo to boot the edge function itself).
import { describe, it, expect } from 'vitest';
import { aggregateFormsCompletion, FORMS_NOTE, mapFormsRow } from '../../supabase/functions/sage-chat/forms-agg.js';

const STORE_NAMES = { '3708': 'Ardmore-Broadway', '5183': 'Chickasha-So 4th' };

// Raw qsr_forms_completion DB rows (snake_case, padded loc) -- 3708 has 8 resolved Closing
// Checklist occurrences, 6 completed (75% -- below the 80% default threshold, a miss); 5183 has
// 4 resolved, 4 completed (100%, a clean pass). One 'open' row per store should be excluded from
// both numerator and denominator entirely.
function row(loc, formId, formTitle, day, statusState) {
  return { loc, form_id: formId, form_title: formTitle, occurrence_key: `2026-09-${day}T06:00:00Z`, status_state: statusState };
}

describe('forms-agg -- query_forms tool aggregation (SAGE forms/document access, backlog survey 2026-09-20)', () => {
  it('mapFormsRow converts one raw DB row into computeFormStoreDayRollup\'s camelCase input shape', () => {
    const mapped = mapFormsRow(row('0003708', 'f1', 'Closing Checklist', '01', 'completed'));
    expect(mapped).toEqual({ loc: '3708', formId: 'f1', formTitle: 'Closing Checklist', occurrenceKey: '2026-09-01T06:00:00Z', statusState: 'completed' });
  });

  it('per-store pass_rate_pct is completed÷resolved and excludes open occurrences, worst store first', () => {
    const rows = [
      ...['01', '02', '03', '04', '05', '06'].map(d => row('0003708', 'f1', 'Closing Checklist', d, 'completed')),
      ...['07', '08'].map(d => row('0003708', 'f1', 'Closing Checklist', d, 'missed')),
      row('0003708', 'f1', 'Closing Checklist', '09', 'open'), // excluded entirely
      ...['01', '02', '03', '04'].map(d => row('0005183', 'f1', 'Closing Checklist', d, 'completed')),
    ];
    const { stores } = aggregateFormsCompletion(rows, STORE_NAMES);

    expect(stores).toEqual([
      { loc: '3708', name: 'Ardmore-Broadway', resolved: 8, completed: 6, missed: 2, pass_rate_pct: 75 },
      { loc: '5183', name: 'Chickasha-So 4th', resolved: 4, completed: 4, missed: 0, pass_rate_pct: 100 },
    ]);
  });

  it('per-form summary reads worst-performing form first (computeFormSummary\'s own sort) and reports both pass-rate readings', () => {
    const rows = [
      ...['01', '02', '03', '04', '05'].map(d => row('0003708', 'f1', 'Pre-Shift', d, 'completed')),
      row('0003708', 'f1', 'Pre-Shift', '06', 'missed'), // 5/6 = 83.3% -- passes its own 80% threshold
      ...['01', '02', '03'].map(d => row('0003708', 'f2', 'Opening', d, 'missed')), // 0/3 -- fails
    ];
    const { forms } = aggregateFormsCompletion(rows, STORE_NAMES);

    expect(forms[0]).toMatchObject({ form_title: 'Opening', resolved: 3, completed: 0, pass_rate_pct: 0, store_days_pass_rate_pct: 0 });
    // Each occurrence lands on its own day, so computeFormStoreDayRollup treats this as 6
    // separate single-occurrence store-days (5 pass at 100% each, 1 fails at 0%) -- 5/6 store-days
    // passed, which happens to equal the aggregate rate here since every group has n=1.
    expect(forms[1]).toMatchObject({ form_title: 'Pre-Shift', resolved: 6, completed: 5, pass_rate_pct: 83.3, store_days_pass_rate_pct: 83.3 });
  });

  it('FORMS_NOTE names the completed÷resolved convention and that open occurrences are excluded', () => {
    expect(FORMS_NOTE).toMatch(/resolved/);
    expect(FORMS_NOTE).toMatch(/open/);
  });
});
