// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-11-09), on the ⏱ Count Timing Report: "can we add how many items were
// counted as well? Show as xxx/xxx and specify classes too, please. Useful troubleshooting
// information." Renders the REAL CountTimingReportModal -- same "render the real component"
// standard this repo's other dispatch tests use (weekly-count-status-report.test.js), not an
// isolated helper -- against a real `rawDetail` shape (loadQsrRawItemDetail's own
// {loc, period, wrin, descr, itemClass, history, updatedAt}).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../utils/print-html.js', () => ({ printHtml: vi.fn() }));
vi.mock('../lib/supabase.js', () => ({
  loadQsrRawItemDetail: vi.fn(() => Promise.resolve([])),
}));

const { CountTimingReportModal } = await import('../views/count-timing-report.js');
const { printHtml } = await import('../utils/print-html.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Padded loc (qsr_raw_item_detail's real on-the-wire shape) + wrin/itemClass/history, matching
// loadQsrRawItemDetail's own mapped return shape exactly.
const row = (loc, wrin, itemClass, history) => ({ loc, period: '2026-07', wrin, descr: wrin, itemClass, history });
const cnt = (dt, tm) => ({ isCount: true, dt, tm });

// React's controlled <select> ignores a plain `select.value = x` assignment (its internal value
// tracker still reads the old value) — same native-setter pattern compliance-audit-panel.test.js
// already uses to flip a controlled dropdown in a test.
function setSelect(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

// LocationSelector (variant 'dropdown') renders its own <select>(s) ahead of the mode picker in
// document order, so "the first select" is the wrong one -- find the mode <select> by its real
// option values instead of by position.
function modeSelect(container) {
  return [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'sessions'));
}

describe('CountTimingReportModal', () => {
  let container, root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const render = async (props = {}) => {
    await act(async () => {
      root.render(React.createElement(CountTimingReportModal, {
        stores: [], period: '2026-07', rawDetail: [], onClose: () => {}, ...props,
      }));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  };

  const rawDetail3708 = [
    row('0003708', 'a', 'Food', [cnt('2026-07-31', '9:00 AM'), cnt('2026-07-31', '9:05 AM')]), // corrected twice -> 1 item
    row('0003708', 'b', 'Food', [cnt('2026-07-31', '9:10 AM')]),
    row('0003708', 'c', 'Paper', [cnt('2026-07-31', '9:15 AM')]),
    row('0003708', 'd', 'Food', []), // universe only, never counted
  ];

  it('Latest mode shows the overall items-counted figure and a per-class breakdown', async () => {
    await render({ rawDetail: rawDetail3708 });
    // Food: a,b counted of a,b,d total = 2/3; Paper: c counted of c total = 1/1; overall 3/4.
    expect(container.textContent).toContain('3/4');
    expect(container.textContent).toContain('Food 2/3');
    expect(container.textContent).toContain('Paper 1/1');
  });

  it('Sessions mode scopes the class breakdown to items touched on that session only', async () => {
    const rows = [
      row('0003708', 'a', 'Food', [cnt('2026-07-08', '6:00 AM')]),
      row('0003708', 'b', 'Food', [cnt('2026-07-08', '6:05 AM')]),
      row('0003708', 'c', 'Paper', [cnt('2026-07-15', '7:00 AM')]),
      row('0003708', 'd', 'Food', []),
    ];
    await render({ rawDetail: rows, initialScope: undefined });
    await act(async () => { setSelect(modeSelect(container), 'sessions'); });
    // Session 1 (07-08): Food 2/3 touched, Paper untouched -> not shown on that row. Session 2
    // (07-15): Paper 1/1. Both class strings appear somewhere in the rendered table.
    expect(container.textContent).toContain('Food 2/3');
    expect(container.textContent).toContain('Paper 1/1');
    expect(container.textContent).toContain('2/4'); // session 1's overall items-counted figure
    expect(container.textContent).toContain('1/4'); // session 2's overall items-counted figure
  });

  it('Monthly mode shows the overall items-counted figure without a per-class breakdown column', async () => {
    await render({ rawDetail: rawDetail3708, period: '2026-07' });
    await act(async () => { setSelect(modeSelect(container), 'monthly'); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('Items counted');
    expect(container.textContent).not.toContain('By class');
  });

  it('Print export includes the Items counted/By class columns in the printed HTML', async () => {
    await render({ rawDetail: rawDetail3708 });
    const printBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Print'));
    expect(printBtn).toBeTruthy();
    await act(async () => { printBtn.click(); });
    expect(printHtml).toHaveBeenCalledTimes(1);
    const html = printHtml.mock.calls[0][0];
    expect(html).toContain('Items counted');
    expect(html).toContain('By class');
    expect(html).toContain('Food 2/3');
  });

  it('CSV export includes the real distinct-item "Items counted"/"By class" columns, not just raw count events', async () => {
    // Capture the Blob's real text content -- same "verify via the actual exported artifact,
    // not just a DOM side effect" standard, achieved here by intercepting the Blob constructor
    // since this repo's own export tests otherwise only check the <a download> side effect.
    let captured = null;
    const OrigBlob = global.Blob;
    global.Blob = class extends OrigBlob {
      constructor(parts, opts) { super(parts, opts); captured = parts.join(''); }
    };
    if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:mock';
    if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => {};
    try {
      await render({ rawDetail: rawDetail3708 });
      const csvBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
      expect(csvBtn).toBeTruthy();
      await act(async () => { csvBtn.click(); });
      expect(captured).toBeTruthy();
      expect(captured).toContain('"Items counted"');
      expect(captured).toContain('"By class"');
      // Row for store 3708: real distinct-item figure, not nCounts' raw-event count (which would
      // read "4" for Food — a+a-correction+b, i.e. event count, not the 2 distinct items).
      expect(captured).toContain('"3/4"');
      expect(captured).toContain('"Food 2/3');
    } finally {
      global.Blob = OrigBlob;
    }
  });
});
