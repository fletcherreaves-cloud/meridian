// @vitest-environment happy-dom
// @ts-nocheck
// Task #70 punch-list #7 (memory/plan-legal-ip-protection-2026-11-04.md §2.2/§7) --
// "Add an in-app disclaimer on SAGE/forecast/recommendation outputs that they're advisory...
// this one's cheap, low-risk, and worth doing regardless." §2.2's own reasoning singles SAGE
// out specifically: it's an LLM, it can be wrong, and nothing disclaimed that to the end user
// inside the app itself before this. Scoped to SAGE's own header for this pass -- the
// Recommendation Ledger has no UI panel yet (Phase 1 is pure helpers only, schema not yet live),
// and "forecast outputs" spans dozens of panels that would need their own separate scoping pass
// rather than being folded silently into this cheap, narrow fix.
//
// Renders the REAL exported SagePanel (not a hand-rolled header snippet), per this repo's "would
// this verification still pass if reverted?" rule -- a test that only checks a JSX literal in
// isolation could pass unchanged with the disclaimer line deleted from the real component.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

describe('SAGE advisory disclaimer (task #70 punch-list #7)', () => {
  it('shows a visible AI-advisory disclaimer in the SAGE header', async () => {
    const { SagePanel } = await import('../views/sage.js');
    mountEl(h(SagePanel, {
      ds: { loaded: false }, signals: [], customSignalDefs: [], onBusy: () => {},
      userRole: 'owner', userName: 'Test', activeContext: {},
    }));
    expect(container.textContent).toContain('AI-generated — advisory, not a guarantee. Verify before acting.');
  });
});
