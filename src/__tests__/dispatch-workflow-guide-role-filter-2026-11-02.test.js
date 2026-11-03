// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-02: "role-based interactive Getting Started tool," decided as
// "different content per role" (not a new checklist/progress-tracking build). Renders the REAL
// exported WorkflowGuidePanel from src/app/App.js -- the same pattern this file already uses for
// PanelManagerPanel/TroubleshootingPanel -- not a duplicated stand-in, per this repo's "would
// this verification still pass if reverted" rule.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { WorkflowGuidePanel } from '../app/App.js';
import { DEFAULT_ROLES } from '../engine/permissions.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(WorkflowGuidePanel, props)); });
  return { container, root };
}

describe('WorkflowGuidePanel -- role-filtered content (owner request 2026-11-02)', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('a top-level role (owner, level 1) sees every section, including WEEKLY/MONTHLY/AS NEEDED', () => {
    ({ container, root } = mount({ userRole: 'owner', orgRoles: DEFAULT_ROLES, onClose: () => {}, onStartTour: () => {} }));
    expect(container.textContent).toMatch(/DAILY/);
    expect(container.textContent).toMatch(/WEEKLY/);
    expect(container.textContent).toMatch(/MONTHLY/);
    expect(container.textContent).toMatch(/KEY FEATURES/);
    expect(container.textContent).toMatch(/AS NEEDED/);
    // No "tailored" subtitle when nothing was filtered out.
    expect(container.textContent).not.toContain('tailored to your role');
  });

  it('a GM (level 6) sees only the sections relevant at the store level, not the district-wide lock cadence', () => {
    ({ container, root } = mount({ userRole: 'gm', orgRoles: DEFAULT_ROLES, onClose: () => {}, onStartTour: () => {} }));
    expect(container.textContent).toMatch(/DAILY/);
    expect(container.textContent).toMatch(/KEY FEATURES/);
    expect(container.textContent).not.toMatch(/WEEKLY \(/);
    expect(container.textContent).not.toMatch(/MONTHLY \(/);
    expect(container.textContent).not.toMatch(/AS NEEDED/);
    expect(container.textContent).toContain('tailored to your role');
  });

  it('an OM (level 4) sees the district-wide cadence too -- the cutoff is level<=4, not just the top tier', () => {
    ({ container, root } = mount({ userRole: 'om', orgRoles: DEFAULT_ROLES, onClose: () => {}, onStartTour: () => {} }));
    expect(container.textContent).toMatch(/WEEKLY \(/);
    expect(container.textContent).toMatch(/MONTHLY \(/);
  });

  it('fails open (shows everything) when the role cannot be resolved -- an onboarding guide should never go blank over a data hiccup', () => {
    ({ container, root } = mount({ userRole: 'not-a-real-role', orgRoles: DEFAULT_ROLES, onClose: () => {}, onStartTour: () => {} }));
    expect(container.textContent).toMatch(/WEEKLY \(/);
    expect(container.textContent).toMatch(/MONTHLY \(/);
    expect(container.textContent).toMatch(/AS NEEDED/);
  });

  it('the Start Tour button calls onStartTour', () => {
    const onStartTour = vi.fn();
    ({ container, root } = mount({ userRole: 'owner', orgRoles: DEFAULT_ROLES, onClose: () => {}, onStartTour }));
    const tourBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Start Tour'));
    expect(tourBtn).toBeTruthy();
    act(() => { tourBtn.click(); });
    expect(onStartTour).toHaveBeenCalled();
  });
});
