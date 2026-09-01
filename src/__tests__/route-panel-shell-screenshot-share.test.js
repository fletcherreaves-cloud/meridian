// @vitest-environment happy-dom
// @ts-nocheck
// App-wide "📸 Share" button (owner request 2026-09-01: "I want that expanded app wide though!
// ... include in the share menu the ability to share a screenshot"). Built directly into
// RoutePanelShell (src/components/ModalShell.js) rather than any per-panel headerExtra slot, so
// every route:true panel gets it with ZERO changes to that panel's own code — this test proves
// exactly that by mounting RoutePanelShell with plain, generic children (no panel-specific code
// at all) and confirming the button is there and wired, not by inspecting a real panel that
// happens to have opted in.
//
// html2canvas is mocked at the module boundary (real canvas rendering fidelity is verified
// separately, end-to-end, against a running dev server — see memory/project-share-screenshot.md
// — not something happy-dom's canvas stub can meaningfully assert on). This test's job is the
// WIRING: does the button exist on every RoutePanelShell consumer, does clicking it call
// html2canvas on the panel's own body node (not window, not some other element), and does the
// resulting blob reach shareFileOrSave.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

let capturedNode = null;
vi.mock('html2canvas', () => ({
  default: vi.fn((node) => {
    capturedNode = node;
    return Promise.resolve({
      toBlob: (cb) => cb({ type: 'image/png', size: 123 }),
    });
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { RoutePanelShell } = await import('../components/ModalShell.js');

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('RoutePanelShell — app-wide screenshot Share button', () => {
  afterEach(() => { capturedNode = null; vi.restoreAllMocks(); delete navigator.share; delete navigator.clipboard; });

  it('renders the Share button for ANY RoutePanelShell consumer, with no panel-specific wiring', async () => {
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(React.createElement(RoutePanelShell, {
        title: 'Plain Test Panel', onBack: () => {},
      }, React.createElement('div', null, 'hello world')));
    });
    const shareBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('📸 Share'));
    expect(shareBtn, 'Share button not found on a plain RoutePanelShell with zero panel-specific props').toBeTruthy();
    act(() => { root.unmount(); });
    container.remove();
  });

  it('clicking Share captures the panel BODY node (not window/document) via html2canvas, then hands the blob to navigator.share', async () => {
    const { container, root } = mountRoot();
    const share = vi.fn(async () => {});
    navigator.share = share;
    navigator.canShare = () => true;

    let bodyDiv;
    await act(async () => {
      root.render(React.createElement(RoutePanelShell, { title: 'DT Speed of Service' },
        React.createElement('div', { ref: (el) => { bodyDiv = el; } }, 'panel content that might scroll off screen')));
    });

    const shareBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('📸 Share'));
    await act(async () => { shareBtn.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    // capturedNode is whatever html2canvas was called with — must be the RoutePanelShell BODY
    // wrapper (an ancestor of the panel's own content div), not window/document/some other node.
    expect(capturedNode).toBeTruthy();
    expect(capturedNode.contains(bodyDiv)).toBe(true);

    expect(share).toHaveBeenCalledTimes(1);
    const [payload] = share.mock.calls[0];
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].type).toBe('image/png');
    expect(payload.files[0].name).toMatch(/^meridian-dt-speed-of-service-\d{4}-\d{2}-\d{2}\.png$/);
  });

  it('shows a status label after share completes, then clears it', async () => {
    vi.useFakeTimers();
    const { container, root } = mountRoot();
    navigator.share = vi.fn(async () => {});
    navigator.canShare = () => true;

    await act(async () => {
      root.render(React.createElement(RoutePanelShell, { title: 'X' }, React.createElement('div', null, 'y')));
    });
    const shareBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('📸 Share'));
    await act(async () => { shareBtn.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    expect(container.textContent).toMatch(/✓ Shared/);
    act(() => { vi.advanceTimersByTime(2600); });
    expect(container.textContent).not.toMatch(/✓ Shared/);
    expect(container.textContent).toContain('📸 Share');

    vi.useRealTimers();
    act(() => { root.unmount(); });
    container.remove();
  });
});
