// @vitest-environment happy-dom
// @ts-nocheck
// 2026-09-01 — Native OS Share sheet (Web Share API) wired into the Count Cycle "🔗 Share"
// button via src/utils/share.js's shareOrCopy(). Companion to dispatch-count-cycle-share.test.js
// (which covers the createEomShareLink() call itself and the plain-clipboard-fallback path,
// still green after this change — happy-dom has no navigator.share by default, so it exercises
// exactly the same "no Web Share API" branch a desktop browser would). This file covers the NEW
// branch: a device that DOES support navigator.share.
//
// Per this repo's "would this verification still pass if reverted?" standing rule, this drives
// the actual CountCycleSection -> real "🔗 Share" button click, not an isolated call to
// shareOrCopy() — a revert of the wiring (call site still calling navigator.clipboard.writeText
// directly) would fail these.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const createEomShareLink = vi.fn(async () => ({ token: '66666666-6666-6666-6666-666666666666', error: null }));

vi.mock('../lib/supabase.js', () => ({ createEomShareLink }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CountCycleSection } = await import('../views/count-cycle-panel.js');

const mk = (loc, cls, n, date) => Array.from({ length: n }, (_, i) => ({ loc, cls, wrin: `${cls}-${i}`, last_counted: date }));
const ROWS = [
  ...mk('3708', 'Food', 118, '2026-08-25'),
  ...mk('3708', 'Condiment', 36, '2026-08-25'),
];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(CountCycleSection, { rows: ROWS, period: '2026-08' }));
    await Promise.resolve(); await Promise.resolve();
  });
}

async function expandCleanCard(container) {
  const showCleanBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Show') && b.textContent.includes('stores on cycle'));
  expect(showCleanBtn, '"Show N stores on cycle" toggle not found').toBeTruthy();
  await act(async () => { showCleanBtn.click(); });
  const numberSpan = [...container.querySelectorAll('span')].find(s => s.textContent.trim() === '#3708');
  expect(numberSpan, 'store-number span (#3708) not found').toBeTruthy();
  await act(async () => { numberSpan.click(); });
}

async function clickShare(container) {
  const shareBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('🔗 Share'));
  expect(shareBtn, '🔗 Share button not found on the expanded card').toBeTruthy();
  await act(async () => { shareBtn.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

describe('Count Cycle "🔗 Share" — native OS Share sheet, real button click', () => {
  // happy-dom's `navigator.clipboard` is a real (getter-only) Clipboard implementation, so it
  // can't be replaced wholesale like `navigator.share` (undefined there, freely assignable) —
  // spy on its writeText method instead and restore it after each test.
  const origShare = navigator.share;
  // cycleCompliance() grades the fixture's last_counted:'2026-08-25' against `new Date()`
  // ("today") using a 9-day WEEKLY_DUE_DAYS cutoff (count-cycle.js) -- with no pinned clock this
  // test silently flips from "on cycle" to "overdue" (and the "Show N stores on cycle" toggle
  // this test depends on stops rendering at all) the moment wall-clock today passes 2026-09-03.
  // Pin the clock well inside the compliant window so the fixture's story stays true regardless
  // of when the suite actually runs.
  beforeEach(() => { createEomShareLink.mockClear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-28T12:00:00')); });
  afterEach(() => {
    document.body.innerHTML = '';
    navigator.share = origShare;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('when navigator.share exists, the click opens the OS sheet with the link and does NOT touch clipboard', async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    navigator.share = share;

    const { container, root } = mountRoot();
    await renderPanel(root);
    await expandCleanCard(container);
    await clickShare(container);

    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0][0];
    expect(payload.url).toMatch(/\?share=66666666-6666-6666-6666-666666666666$/);
    expect(payload.title).toMatch(/Count Cycle/);
    expect(payload.title).toMatch(/Ardmore-Broadway/);
    expect(writeText).not.toHaveBeenCalled();
    // Status text reads "Shared", not "copied", when the OS sheet was actually used.
    expect(container.textContent).toMatch(/✓ Shared.*Ardmore-Broadway/);

    root.unmount();
  });

  it('user cancelling the OS share sheet (AbortError) shows no error and does not silently copy the link', async () => {
    const abortErr = Object.assign(new Error('cancel'), { name: 'AbortError' });
    const share = vi.fn(async () => { throw abortErr; });
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    navigator.share = share;

    const { container, root } = mountRoot();
    await renderPanel(root);
    await expandCleanCard(container);
    await clickShare(container);

    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    // No error surfaced, and no "Shared"/"link copied" confirmation either — a cancelled OS
    // sheet is not a success message any more than it's a failure one.
    expect(container.textContent).not.toMatch(/Share failed/);
    expect(container.textContent).not.toMatch(/✓ Shared/);
    expect(container.textContent).not.toMatch(/✓ Read-only link copied/);

    root.unmount();
  });

  it('without navigator.share (desktop), the click falls back to clipboard-copy exactly as before', async () => {
    navigator.share = undefined;
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    const { container, root } = mountRoot();
    await renderPanel(root);
    await expandCleanCard(container);
    await clickShare(container);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toMatch(/\?share=66666666-6666-6666-6666-666666666666$/);
    expect(container.textContent).toMatch(/✓ Read-only link copied.*Ardmore-Broadway/);

    root.unmount();
  });
});
