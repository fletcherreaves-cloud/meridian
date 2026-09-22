// @vitest-environment happy-dom
// @ts-nocheck
// Notes 33 #9 ("Operator→DO pulse" survey follow-on, 2026-09-22 backlog firing): the swing
// alarm's news-based context (`newsContextFor`/`swing-context.js`) explained the outside world
// but never looked at the store's OWN other operational metrics (labor%, OEPE) during the same
// window. `metricContextFor` (swing-context.js) computes that; this proves the REAL SwingAlarm
// component actually renders it in the critical-swing modal, not just that the engine function
// exists in isolation -- per "would this verification still pass if reverted?", a test that only
// imports metricContextFor can't tell "wired in" from "computed and never rendered".
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SwingAlarm } from '../components/SwingAlarm.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CRIT_ITEM = {
  loc: '10422', title: 'Atoka — sales down 14.2%', icon: '📉', requiresAck: true,
  swing: { direction: 'down', pct: -14.2, guestPct: -12.1, dollars: 4200, run: 2,
           from: '2026-07-30', to: '2026-08-06', kind: 'traffic' },
};
const METRIC_CONTEXT = [
  { key: 'laborPct', label: 'Labor %', before: 0.20, during: 0.30, delta: 0.10, worse: true,
    beforeFmt: '20.0%', duringFmt: '30.0%' },
];

let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); });

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(SwingAlarm, props)));
}

describe('SwingAlarm -- store metric context (Notes 33 #9)', () => {
  it('renders the metricContextFor result inside the critical-swing modal', () => {
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => [],
            metricContextFor: () => METRIC_CONTEXT });
    expect(container.textContent).toMatch(/Worth checking — this store's own metrics/);
    expect(container.textContent).toMatch(/Labor %/);
    expect(container.textContent).toMatch(/20\.0%/);
    expect(container.textContent).toMatch(/30\.0%/);
  });

  it('omits the section entirely when metricContextFor returns nothing', () => {
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => [],
            metricContextFor: () => [] });
    expect(container.textContent).not.toMatch(/this store's own metrics/);
  });

  it('omits the section entirely when metricContextFor is not supplied at all', () => {
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => [] });
    expect(container.textContent).not.toMatch(/this store's own metrics/);
  });

  it('never asserts causation in the metric-context heading', () => {
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => [],
            metricContextFor: () => METRIC_CONTEXT });
    expect(container.textContent).not.toMatch(/caused|because|due to|explains/i);
  });
});
