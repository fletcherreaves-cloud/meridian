// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #140 item 1 — "It could move into the Schedule Dashboard as a logical home"
// (owner-confirmed). Training Retention (dispatch #134's ScheduleRetentionPanel) moved from a
// standalone panel-registry.js nav entry into a new 'retention' tab inside App.js's Scheduling &
// Labor hub (SchedulingHubPanel/SCHED_TABS) — same architectural shape dispatch #135 used for
// TargetsEditorSection -> Performance Review > Customize > Targets.
//
// Renders the REAL SchedulingHubPanel (exported from App.js for exactly this reason) -> its
// 'retention' tab -> the real ScheduleRetentionSection content, per this repo's "would this
// verification still pass if reverted?" standing rule — a test that only imported
// ScheduleRetentionSection directly could pass unchanged with the SCHED_TABS wiring deleted.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SchedulingHubPanel } from '../app/App.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Longer budget than the dispatch-134 fixture's flush() — this render also has to wait on the
// lazyPanel()-wrapped ScheduleRetentionSection's dynamic import to resolve (a real chunk load,
// not just a state settle), which can take more than a handful of 0ms ticks under vitest's
// module transform.
async function flush(container, maxTicks = 40) {
  let last = null;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    if (container.textContent === last && !container.textContent.includes('Loading')) return;
    last = container.textContent;
  }
}

describe('#140 item 1: Training Retention renders inside the Scheduling & Labor hub, not standalone', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('panel-registry: sched-retention is kind:\'hub-tab\' (no longer nav+route:true)', () => {
    const p = PANEL_BY_ID['sched-retention'];
    expect(p).toBeTruthy();
    expect(p.kind).toBe('hub-tab');
    expect(p.route).toBeFalsy();
    expect(p.section).toBe('scheduling'); // truthful section per CLAUDE.md's kind/section rule
  });

  it('the hub tab bar has a Training Retention tab, and clicking it shows the real report content', async () => {
    await act(async () => {
      root.render(React.createElement(SchedulingHubPanel, {
        ds: { schedRows: [], jobHours: [] }, stores: [{ loc: '6838' }], settings: {},
        perm: () => true, onClose: () => {},
      }));
    });
    await flush(container);

    const tabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Training Retention'));
    expect(tabBtn, 'Training Retention tab button not found in the hub tab bar').toBeTruthy();
    await act(async () => { tabBtn.click(); });
    await flush(container);

    // Real ScheduleRetentionSection content — its own info strip + LocationSelector, not a
    // placeholder or a different tab's leftover content.
    expect(container.textContent).toMatch(/Compare one store.s LifeLenz schedule weeks/);
    expect(container.textContent).toMatch(/pick a location above/i);
  });

  it('a redirect deep-link (initialTab) lands directly on the Training Retention tab', async () => {
    await act(async () => {
      root.render(React.createElement(SchedulingHubPanel, {
        ds: { schedRows: [], jobHours: [] }, stores: [{ loc: '6838' }], settings: {},
        perm: () => true, onClose: () => {}, initialTab: 'retention',
      }));
    });
    await flush(container);
    // No extra clicks needed — the old standalone 'sched-retention' route's replacement
    // (App.js's modal==='sched-retention' handler: setSchedTab('retention') + goRoute('sched-hub'))
    // lands here directly, same as #135's targets-editor redirect.
    expect(container.textContent).toMatch(/Compare one store.s LifeLenz schedule weeks/);
  });
});
