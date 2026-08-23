// @ts-nocheck
// Dispatch #80 -- SAGE reads memory, gated by document classification. Verification bar (from
// memory/dispatch-80.md): a test proving a restricted document is not returned to a caller whose
// role should not see it, asserted against the TOOL'S ACTUAL RETURN VALUE rather than the
// prompt -- plus one proving an unclassified file is not returned at all, to anyone.
//
// Imports supabase/functions/sage-chat/memory-kb.js directly -- the same plain-JS module
// index.ts's search_project_memory tool calls and JSON.stringifies as its literal tool result.
// No Deno test infrastructure exists in this repo to boot the edge function itself, so this is
// the closest thing to the real call site: reverting the gating logic in memory-kb.js (not just
// its wiring into index.ts) makes these tests fail, since they exercise that exact code.
import { describe, it, expect } from 'vitest';
import { qualifiesForRestricted, rowVisible, buildMemorySearchResult } from '../../supabase/functions/sage-chat/memory-kb.js';

const OPEN_ROW = {
  filename: 'memory/finding-open-thing.md',
  title: 'Open Finding',
  sensitivity: 'open',
  chunk_index: 0,
  chunk_text: 'Some open business insight about padding controls at a store.',
};
const RESTRICTED_ROW = {
  filename: 'memory/finding-padding-and-cash-hunt-2026-08-13.md',
  title: 'Padding / cash-control hunt',
  sensitivity: 'restricted',
  chunk_index: 0,
  chunk_text: 'Named GM padding investigation details, termination dates, personnel timeline.',
};
const UNCLASSIFIED_ROW = {
  filename: 'memory/finding-unclassified-thing.md',
  title: 'Unclassified',
  sensitivity: undefined,
  chunk_index: 0,
  chunk_text: 'Content with no sensitivity classification at all, mentions padding too.',
};

describe('sage-chat memory-kb gating (dispatch #80)', () => {
  it('qualifiesForRestricted is admin-only, per the real profiles.role constraint', () => {
    expect(qualifiesForRestricted('admin')).toBe(true);
    expect(qualifiesForRestricted('supervisor')).toBe(false);
    expect(qualifiesForRestricted('manager')).toBe(false);
    expect(qualifiesForRestricted(undefined)).toBe(false);
  });

  it('does not return a restricted document to a caller whose role should not see it -- on the tool return value', () => {
    const rows = [OPEN_ROW, RESTRICTED_ROW];

    const managerResult = buildMemorySearchResult(rows, 'manager', 'padding', 5);
    expect(managerResult.results.some(r => r.filename === RESTRICTED_ROW.filename)).toBe(false);
    expect(managerResult.results.some(r => r.sensitivity === 'restricted')).toBe(false);

    const supervisorResult = buildMemorySearchResult(rows, 'supervisor', 'padding', 5);
    expect(supervisorResult.results.some(r => r.filename === RESTRICTED_ROW.filename)).toBe(false);

    // Admin DOES qualify -- proves the restricted row was withheld from manager/supervisor by
    // the gate itself, not because it never matched the query in the first place.
    const adminResult = buildMemorySearchResult(rows, 'admin', 'padding', 5);
    expect(adminResult.results.some(r => r.filename === RESTRICTED_ROW.filename)).toBe(true);
  });

  it('does not return an unclassified document to anyone, including admin', () => {
    const rows = [OPEN_ROW, UNCLASSIFIED_ROW];
    for (const role of ['admin', 'supervisor', 'manager', undefined]) {
      const result = buildMemorySearchResult(rows, role, 'padding', 5);
      expect(result.results.some(r => r.filename === UNCLASSIFIED_ROW.filename)).toBe(false);
    }
    expect(rowVisible(undefined, 'admin')).toBe(false);
    expect(rowVisible('excluded', 'admin')).toBe(false);
    expect(rowVisible(null, 'admin')).toBe(false);
  });

  it('rowVisible gates by document classification, not only caller role', () => {
    expect(rowVisible('open', 'manager')).toBe(true);
    expect(rowVisible('restricted', 'manager')).toBe(false);
    expect(rowVisible('restricted', 'admin')).toBe(true);
  });

  it('still surfaces the open document to a restricted caller alongside a withheld restricted one', () => {
    const rows = [OPEN_ROW, RESTRICTED_ROW];
    const managerResult = buildMemorySearchResult(rows, 'manager', 'padding', 5);
    expect(managerResult.results.some(r => r.filename === OPEN_ROW.filename)).toBe(true);
    expect(managerResult.count).toBe(1);
  });
});
