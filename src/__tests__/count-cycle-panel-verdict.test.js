// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch28 Workstream F ("voice by role", CLAUDE.md's standing rule, owner principle
// 2026-08-17): the dispatch's own cited evidence was this exact panel -- "Count Cycle said
// 'No complete weekly count on record' to a store that had counted." buildCycleVerdict()
// (count-cycle.js) now answers "so what do I do" in one line; this test proves it actually
// reaches the real StoreCard, not just the engine function in isolation.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CountCycleSection } = await import('../views/count-cycle-panel.js');

const mk = (loc, cls, n, date) => Array.from({ length: n }, (_, i) => ({ loc, cls, wrin: `${cls}-${i}`, last_counted: date }));

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('Count Cycle panel — the verdict line reaches the real StoreCard', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('an overdue store shows the imperative verdict as its headline, with the diagnostic detail still visible underneath', async () => {
    // Only a stale count on record, well past WEEKLY_DUE_DAYS -- real STORE_NAMES entry.
    const ROWS = [...mk('3708', 'Food', 118, '2020-01-01'), ...mk('3708', 'Condiment', 36, '2020-01-01')];
    const { container, root } = mountRoot();
    await act(async () => { root.render(React.createElement(CountCycleSection, { rows: ROWS, period: '2020-01' })); });

    // "so what do I do" — the decision — is on screen without expanding anything.
    expect(container.textContent).toMatch(/Count Food and Condiment today —/);
    // The supporting metric/evidence stays visible alongside it, not replaced (standing rule's
    // explicit both/and).
    expect(container.textContent).toMatch(/days since the last complete Food \+ Condiment count/);

    root.unmount();
  });
});
