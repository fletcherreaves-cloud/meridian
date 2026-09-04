// @vitest-environment happy-dom
// @ts-nocheck
// StoreControlsTab (src/views/signals.js) shipped with a real React error #310 -- "Rendered fewer
// hooks than expected" -- caught live in production (owner screenshot, Signals panel error
// boundary). Root cause: the `modes` useMemo was called AFTER three early `return h(...)`
// statements. `raw` starts null on every mount, so the FIRST render always hit the "Loading…"
// early return before ever reaching that hook; once loadQsrStoreControls() resolved and `raw`/
// `rows` were populated, the SECOND render sailed past all three early returns and called the
// hook -- a different hook count between renders, which React refuses to reconcile.
// A static-markup test of either state alone cannot catch this: each render in isolation is
// perfectly valid JSX. Only mounting the REAL component (react-dom/client, not
// renderToStaticMarkup) and actually crossing the loading->loaded transition exercises both
// hook counts back to back, the same way the live crash did.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fakeRows = [
  { loc: '3708', updatedAt: '2026-09-01T00:00:00Z', config: { RFMControls: { tred_before_total_amount: 100 } } },
  { loc: '5183', updatedAt: '2026-09-01T00:00:00Z', config: {} },
];

vi.mock('../lib/supabase.js', () => ({
  loadQsrStoreControls: async () => fakeRows,
  // StoreControlsTab renders DistrictStandardCheck as a child, which independently fetches its
  // own audit window -- unrelated to the hook-order bug, but must resolve or mounting throws.
  loadAuditRowsWindow: async () => [],
}));

const { StoreControlsTab } = await import('../views/signals.js');

describe('StoreControlsTab hook order across the loading -> loaded transition (dispatch, 2026-09-04)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('mounts in the loading state, then resolves to the loaded table without throwing (regression for React error #310)', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Mount -- first render is the `raw === null` "Loading…" state, exercising whatever hook
    // count that branch calls.
    act(() => { root.render(React.createElement(StoreControlsTab)); });
    expect(container.textContent).toContain('Loading store controls…');

    // Flush the mocked loadQsrStoreControls() promise and the resulting re-render -- the second
    // render sails past all three early returns into the full table body. If `modes` (or any
    // other hook) were still declared after those returns, this is exactly where React would
    // throw "Rendered fewer hooks than expected."
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(container.textContent).not.toContain('Loading store controls…');
    expect(container.textContent).toContain('Real per-store configuration');
  });
});
