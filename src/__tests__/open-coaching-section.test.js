// @vitest-environment happy-dom
// @ts-nocheck
// Owner, live, 2026-10-14: "why don't we include an area in the panel to check on progress of
// any and all open coaching issues. To see what is happening and be able to append new notes to
// it with time stamped and date stamped entries and by whom." This renders the actual
// OpenCoachingSection component (not just openCoachingCycles() in isolation, already covered in
// coaching-loop.test.js) — the real risk is the wiring: grouping notes by cycle, rendering the
// append-only history, and calling addCoachingCycleNote() on submit.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { OpenCoachingSection } from '../views/analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let addedNote = null;
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    addCoachingCycleNote: vi.fn(async (args) => { addedNote = args; return { id: 'note-1', createdAt: '2026-10-14T18:00:00Z', author: 'test@mcdok.com', error: null }; }),
  };
});

describe('OpenCoachingSection', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); addedNote = null; });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const ds = {
    coachingCycles: [
      { id: 'cycle-1', loc: '13113', metric: 'fob_total_pct', baseline: 0.0589, coachedAt: '2026-10-14', note: 'Held a training on 9/15', reviewAt: '2026-11-12', result: null, verdict: null },
      { id: 'cycle-2', loc: '10422', metric: 'labor_pct', baseline: 0.24, coachedAt: '2026-08-01', note: '', reviewAt: '2026-08-31', result: 0.22, verdict: 'improved' }, // closed -- excluded
    ],
    coachingCycleNotes: [
      { id: 'n1', cycleId: 'cycle-1', loc: '13113', note: 'Checked in with Chris, portioning looks better', author: 'fletcher.reaves@mcreaves.com', createdAt: '2026-10-15T14:30:00Z' },
    ],
  };

  // Leaf-element clicks throughout, not a raw querySelector('div') -- the component nests
  // clickable headers inside non-clickable wrapper divs (the collapsible section's own
  // container, each cycle card's outer border div), so a plain "first <div>" or "a <div>
  // containing this text" query can grab an ancestor with no onClick at all. A leaf (no child
  // elements) is unambiguous and the click still bubbles to the real handler.
  const clickLeaf = (text) => {
    const el = [...container.querySelectorAll('span,div')].find(e => e.children.length === 0 && e.textContent.includes(text));
    act(() => { el.click(); });
    return el;
  };

  it('shows only OPEN cycles (result==null), not closed ones, with their note count', () => {
    act(() => { root.render(React.createElement(OpenCoachingSection, { ds, onCoachingSaved: () => {}, onLogVerdict: () => {} })); });
    clickLeaf('🎯 Open Coaching'); // expand the collapsible header
    expect(container.textContent).toContain('Open Coaching (1)'); // cycle-2 is closed, excluded
    expect(container.textContent).not.toContain('Atoka'); // sNameC('10422') -- that cycle is closed
  });

  it('expanding a cycle shows the start note AND the appended note history with author/timestamp', () => {
    act(() => { root.render(React.createElement(OpenCoachingSection, { ds, onCoachingSaved: () => {}, onLogVerdict: () => {} })); });
    clickLeaf('🎯 Open Coaching'); // open the section
    const row = clickLeaf('Madill'); // expand the cycle card -- sNameC('13113') === 'Madill-Hwy 70'
    expect(row).toBeTruthy();
    expect(container.textContent).toContain('Held a training on 9/15'); // the original start note
    expect(container.textContent).toContain('Checked in with Chris, portioning looks better'); // appended note
    expect(container.textContent).toContain('fletcher.reaves@mcreaves.com'); // attribution
  });

  it('adding a note calls addCoachingCycleNote with the cycle/loc and refreshes via onCoachingSaved', async () => {
    let saved = false;
    act(() => { root.render(React.createElement(OpenCoachingSection, { ds, onCoachingSaved: () => { saved = true; }, onLogVerdict: () => {} })); });
    clickLeaf('🎯 Open Coaching');
    clickLeaf('Madill');

    const input = container.querySelector('input[type="text"]');
    expect(input).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Follow-up call scheduled for next week');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const addBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '+ Add');
    await act(async () => { addBtn.click(); await Promise.resolve(); await Promise.resolve(); });

    expect(addedNote).toEqual({ cycleId: 'cycle-1', loc: '13113', note: 'Follow-up call scheduled for next week' });
    expect(saved).toBe(true);
  });

  it('shows "No open coaching cycles" when none exist (regression guard)', () => {
    act(() => { root.render(React.createElement(OpenCoachingSection, { ds: { coachingCycles: [], coachingCycleNotes: [] }, onCoachingSaved: () => {}, onLogVerdict: () => {} })); });
    clickLeaf('🎯 Open Coaching');
    expect(container.textContent).toContain('No open coaching cycles');
  });
});
