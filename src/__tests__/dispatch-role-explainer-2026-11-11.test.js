// @vitest-environment happy-dom
// @ts-nocheck
// Fresh-eyes role audit (2026-11-11, memory/finding-fresh-eyes-role-audit-2026-11-11.md §4
// Q11a): "no in-app way for a user to SEE which panels their own role has access to without
// opening Settings -> Roles & Permissions and reading a table meant for an admin." Renders the
// REAL RoleExplainerPanel, and asserts it reads from the SAME PANELS/PERMISSION_GROUPS data the
// admin table and real sidebar use (no second, hand-written description to drift).
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { RoleExplainerPanel } from '../views/role-explainer.js';
import { PERMISSION_GROUPS, hasPermission } from '../engine/permissions.js';
import { PANELS } from '../app/panel-registry.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(RoleExplainerPanel, props)); });
  return { container, root };
}

describe('RoleExplainerPanel — "What You Can Do"', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('a GM sees their real granted permission labels and real visible nav panels, both pulled live from the shared registries', async () => {
    ({ container, root } = await mount({ userRole: 'gm', accessibleLocs: ['3708'], onClose: () => {} }));
    const text = container.textContent;
    expect(text).toContain('What You Can Do');
    expect(text).toContain('GM (General Manager)');
    expect(text).toContain('one store');

    // Every permission GM actually has, by the real hasPermission() check, must be named.
    const grantedLabels = PERMISSION_GROUPS.flatMap(g => g.items).filter(it => hasPermission('gm', it.key)).map(it => it.label);
    expect(grantedLabels.length).toBeGreaterThan(0);
    for (const label of grantedLabels) expect(text).toContain(label);

    // A permission GM does NOT have must not be falsely claimed as granted.
    const deniedLabels = PERMISSION_GROUPS.flatMap(g => g.items).filter(it => !hasPermission('gm', it.key)).map(it => it.label);
    const deniedButUnique = deniedLabels.filter(l => !grantedLabels.includes(l));
    for (const label of deniedButUnique.slice(0, 5)) expect(text).not.toContain(label);
  });

  it('a GM\'s own disabledPanels (role.disabledPanels, e.g. Pricing Engine) never appear as something they can do', async () => {
    ({ container, root } = await mount({ userRole: 'gm', accessibleLocs: null, onClose: () => {} }));
    const pricingEngine = PANELS.find(p => p.id === 'pricing-engine');
    expect(pricingEngine, 'pricing-engine panel not found in registry').toBeTruthy();
    expect(container.textContent).not.toContain(pricingEngine.label);
  });

  it('an admin sees "All N stores" and the altitude blurb for district scope', async () => {
    ({ container, root } = await mount({ userRole: 'admin', accessibleLocs: null, onClose: () => {} }));
    expect(container.textContent).toMatch(/All \d+ stores/);
    expect(container.textContent).toContain('district-wide visibility');
  });

  it('back button calls onClose', async () => {
    let closed = false;
    ({ container, root } = await mount({ userRole: 'gm', accessibleLocs: null, onClose: () => { closed = true; } }));
    const backBtn = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Back');
    expect(backBtn, 'back button not found').toBeTruthy();
    act(() => { backBtn.click(); });
    expect(closed).toBe(true);
  });
});
