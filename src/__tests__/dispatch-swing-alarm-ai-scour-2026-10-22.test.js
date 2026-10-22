// @vitest-environment happy-dom
// @ts-nocheck
// Notes 58 #4, the 4th and last requirement for the swing alarm: "Use AI to scour for
// anything missed that could explain a sudden swing." Requirements 1-3 (detect, click-ack,
// local-news/metric context) were already shipped; swing-context.js's own 2026-09-22 comment
// flagged this piece as explicitly deferred. This proves the REAL SwingAlarm component wires
// a user-triggered AI scour (aiScourForSwing) into the critical-swing modal -- per "would this
// verification still pass if reverted?", a test that only imports aiScourForSwing in isolation
// can't tell "wired in" from "computed and never rendered".
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../engine/swing-context.js', async () => {
  const actual = await vi.importActual('../engine/swing-context.js');
  return { ...actual, aiScourForSwing: vi.fn() };
});

import { SwingAlarm } from '../components/SwingAlarm.js';
import { aiScourForSwing } from '../engine/swing-context.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CRIT_ITEM = {
  loc: '10422', title: 'Atoka — sales down 14.2%', icon: '📉', requiresAck: true,
  swing: { direction: 'down', pct: -14.2, guestPct: -12.1, dollars: 4200, run: 2,
           from: '2026-07-30', to: '2026-08-06', kind: 'traffic' },
};

let container, root;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  aiScourForSwing.mockReset();
});

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(SwingAlarm, props)));
}

function scourButton() {
  return [...container.querySelectorAll('button')].find(b => /AI Scour/.test(b.textContent));
}

describe('SwingAlarm -- AI scour (Notes 58 #4)', () => {
  it('renders the AI scour button on a critical swing', () => {
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => [], metricContextFor: () => [] });
    expect(scourButton()).toBeTruthy();
  });

  it('clicking the button calls aiScourForSwing with the item, its context, and a setResult callback', () => {
    const news = [{ title: 'Road closure', whenRelative: '10 days before the decline' }];
    const metrics = [{ key: 'laborPct', label: 'Labor %', beforeFmt: '20.0%', duringFmt: '30.0%', worse: true }];
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => news, metricContextFor: () => metrics });
    act(() => scourButton().click());
    expect(aiScourForSwing).toHaveBeenCalledTimes(1);
    const [item, opts, setResult] = aiScourForSwing.mock.calls[0];
    expect(item.loc).toBe('10422');
    expect(opts.context).toEqual(news);
    expect(opts.metricContext).toEqual(metrics);
    expect(typeof setResult).toBe('function');
  });

  it('renders a loading state once the callback reports loading:true', () => {
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => [], metricContextFor: () => [] });
    act(() => scourButton().click());
    const setResult = aiScourForSwing.mock.calls[0][2];
    act(() => setResult({ loading: true, text: '', error: null }));
    expect(container.textContent).toMatch(/Searching for what the local-news/);
    expect(scourButton()).toBeFalsy();
  });

  it('renders the AI result text, and a clear control that resets back to the button', () => {
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => [], metricContextFor: () => [] });
    act(() => scourButton().click());
    const setResult = aiScourForSwing.mock.calls[0][2];
    act(() => setResult({ loading: false, text: 'Worth checking: a county road closure two weeks prior.', error: null }));
    expect(container.textContent).toMatch(/county road closure/);

    const clearBtn = [...container.querySelectorAll('button')].find(b => /clear/i.test(b.textContent));
    expect(clearBtn).toBeTruthy();
    act(() => clearBtn.click());
    expect(container.textContent).not.toMatch(/county road closure/);
    expect(scourButton()).toBeTruthy();
  });

  it('renders an error message without crashing the modal', () => {
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => [], metricContextFor: () => [] });
    act(() => scourButton().click());
    const setResult = aiScourForSwing.mock.calls[0][2];
    act(() => setResult({ loading: false, text: '', error: 'AI scour failed: network error' }));
    expect(container.textContent).toMatch(/AI scour failed: network error/);
  });

  it('never phrases the result as a confirmed cause in the surrounding UI copy', () => {
    mount({ items: [CRIT_ITEM], acks: {}, onAck: () => {}, contextFor: () => [], metricContextFor: () => [] });
    act(() => scourButton().click());
    const setResult = aiScourForSwing.mock.calls[0][2];
    act(() => setResult({ loading: false, text: 'A county fair ran that same week.', error: null }));
    expect(container.textContent).not.toMatch(/caused by/i);
    expect(container.textContent).not.toMatch(/the cause is/i);
  });
});
