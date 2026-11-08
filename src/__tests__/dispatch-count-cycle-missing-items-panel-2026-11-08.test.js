// @vitest-environment happy-dom
// @ts-nocheck
// Task #126 follow-on (2026-11-08) — the real on-screen consumer (CountCycleSection's
// SessionRow, src/views/count-cycle-panel.js) shows the named missing-item list in the class
// chip's tooltip, not just a count, once detectSessions() can supply it (live path, no schema
// change needed for the CURRENT period). Renders the REAL panel per CLAUDE.md's "would this
// verification still pass if reverted" rule -- reverting missingItemsTitle()'s use of
// s.missingItems would make this tooltip read the old count-only text and this test would fail.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CountCycleSection } = await import('../views/count-cycle-panel.js');

const mk = (loc, cls, n, date, from = 0, descrPrefix) =>
  Array.from({ length: n }, (_, i) => ({
    loc, cls, wrin: `${cls}-${from + i}`, descr: descrPrefix ? `${descrPrefix} ${from + i}` : undefined,
    last_counted: date,
  }));

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('Count Cycle panel — named missing items reach the real SessionRow tooltip', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('a near-miss Paper count names its real missing items in the chip tooltip', async () => {
    // 3 of 5 Paper items counted today -- 2 real, named misses.
    const ROWS = [
      ...mk('3708', 'Paper', 3, '2026-06-10', 0, 'Paper Widget'),
      ...mk('3708', 'Paper', 2, null, 3, 'Paper Widget'),
    ];
    const { container, root } = mountRoot();
    await act(async () => { root.render(React.createElement(CountCycleSection, { rows: ROWS, period: '2026-06' })); });

    // Expand the store card (click its header) to reveal the session timeline.
    const header = container.querySelector('div[style*="cursor: pointer"]');
    expect(header, 'store card header not found').toBeTruthy();
    await act(async () => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const chip = [...container.querySelectorAll('span')].find(s => /^Pape 3/.test(s.textContent));
    expect(chip, 'Paper class chip not found').toBeTruthy();
    expect(chip.title).toMatch(/Not counted: Paper Widget 3, Paper Widget 4/);

    root.unmount();
  });
});
