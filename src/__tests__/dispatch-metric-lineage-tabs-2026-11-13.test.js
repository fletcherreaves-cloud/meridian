// @vitest-environment happy-dom
// @ts-nocheck
// Metric Lineage panel — owner request 2026-11-13: "let's expound upon it and maybe create a
// separate tab for non calculation items." MetricLineagePanel (src/views/metric-lineage.js) used
// to have a single list + an "onlyComposed" toggle; this replaces that with two real tabs —
// Calculated (composed:true, shows Inputs/Formula) and Direct / Source Data (composed:false,
// shows an Automation badge instead). These tests prove: both tabs render with the right counts,
// switching tabs actually swaps which entries show, and a composed metric never appears in the
// Direct tab (and vice versa) — the exact mix-up this refactor could silently introduce.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MetricLineagePanel } from '../views/metric-lineage.js';
import { METRIC_PROVENANCE } from '../engine/metric-provenance.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(MetricLineagePanel, { onClose: () => {} }));
  });
  return { container, root };
}

function click(container, text) {
  const btn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith(text));
  expect(btn).toBeTruthy();
  act(() => { btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
}

describe('Metric Lineage — Calculated / Direct tabs (2026-11-13)', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('defaults to the Calculated tab, showing only composed metrics', async () => {
    ({ container, root } = await mount());
    const composedCount = Object.values(METRIC_PROVENANCE).filter(p => p.composed).length;
    expect(container.textContent).toContain(`Calculated (${composedCount})`);
    // A known composed metric's own math should be visible (TPPH is hand-curated with real math).
    expect(container.textContent).toContain('Σ transactions');
    // A known direct-only field should NOT be visible yet (Operating Supplies $ is composed:false).
    expect(container.textContent).not.toContain('Operating Supplies $');
  });

  it('switches to Direct / Source Data and shows only non-composed entries with an Automation badge, not a Formula/Inputs mix-up', async () => {
    ({ container, root } = await mount());
    click(container, 'Direct / Source Data');
    const directCount = Object.values(METRIC_PROVENANCE).filter(p => !p.composed).length;
    expect(container.textContent).toContain(`Direct / Source Data (${directCount})`);
    expect(container.textContent).toContain('Operating Supplies $');
    expect(container.textContent).toContain('Automation');
    expect(container.textContent).toContain('How it\'s sourced');
    // The composed-only TPPH formula text must not leak into this tab.
    expect(container.textContent).not.toContain('Σ transactions');
  });

  it('search filters within whichever tab is active', async () => {
    ({ container, root } = await mount());
    const input = container.querySelector('input');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'TPPH');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    const tbody = container.querySelector('tbody');
    expect(tbody.textContent).toContain('TPPH');
    expect(tbody.textContent).not.toContain('OEPE');
  });

  it('every METRIC_PROVENANCE entry lands in exactly one tab (no metric is both or neither)', () => {
    const composed = Object.values(METRIC_PROVENANCE).filter(p => p.composed === true).length;
    const direct = Object.values(METRIC_PROVENANCE).filter(p => p.composed === false).length;
    expect(composed + direct).toBe(Object.keys(METRIC_PROVENANCE).length);
  });
});
