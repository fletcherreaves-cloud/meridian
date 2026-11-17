// @vitest-environment happy-dom
// @ts-nocheck
// QuickUploadView (task: "easiest for additional users on iPhone" — the pinned, low-chrome
// upload screen behind ?quickupload=1, since iOS Safari has no Web Share Target API at all).
// This file is presentation only — handleFiles/UploadSummaryModal (the real parsing/saving and
// confirmation UI) are App.js's own existing, already-tested machinery, passed in as props.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { QuickUploadView } from '../views/quick-upload-view.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

describe('QuickUploadView', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); container = null; root = null; });

  function mount(props) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(QuickUploadView, props)); });
  }

  it('calls onFiles with the picked file(s) when the hidden input changes', () => {
    const onFiles = vi.fn();
    mount({ loadMsg: null, onFiles, onExitToFullApp: vi.fn() });
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    const file = new File(['a,b,c'], 'labor.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toEqual([file]);
  });

  it('accepts a dropped file on the upload button (drag-and-drop)', () => {
    const onFiles = vi.fn();
    mount({ loadMsg: null, onFiles, onExitToFullApp: vi.fn() });
    const dropTarget = container.querySelector('button');
    const file = new File(['x'], 'ops.xlsx');
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } });
    act(() => { dropTarget.dispatchEvent(dropEvent); });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toEqual([file]);
  });

  it('shows the busy state and disables the picker while loadMsg is set', () => {
    mount({ loadMsg: '⏳ Parsing ops.xlsx…', onFiles: vi.fn(), onExitToFullApp: vi.fn() });
    expect(container.textContent).toContain('Working…');
    expect(container.textContent).toContain('⏳ Parsing ops.xlsx…');
    const button = container.querySelector('button[disabled]');
    expect(button).toBeTruthy();
  });

  it('shows the idle prompt when loadMsg is null', () => {
    mount({ loadMsg: null, onFiles: vi.fn(), onExitToFullApp: vi.fn() });
    expect(container.textContent).toContain('Tap to choose a file');
  });

  it('calls onExitToFullApp when the fallback link is tapped', () => {
    const onExit = vi.fn();
    mount({ loadMsg: null, onFiles: vi.fn(), onExitToFullApp: onExit });
    const exitBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Open full Meridian'));
    expect(exitBtn).toBeTruthy();
    act(() => { exitBtn.click(); });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
