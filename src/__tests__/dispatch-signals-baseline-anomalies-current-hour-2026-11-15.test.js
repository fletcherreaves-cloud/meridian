// @vitest-environment happy-dom
// @ts-nocheck
// Owner report, live, with a Signals screenshot showing multiple stores all flagging the SAME
// "2p-3p" hour slot at once: "not urgent, but on signals, let's not report current hour being
// reported in baseline anomalies. if we do, they will always flag. not an apples to apples
// comparison." LiveOpsTab's `anomalies` memo (src/views/signals.js) compared every hour's actual
// sales against its full-hour historical mean, including the CURRENT, still-filling hour -- which
// already has partial sales (so it clears the `sales <= 0` filter) but is nowhere near a full
// hour's worth yet, so it reads as a huge "cold" miss purely because the hour isn't over. Fixed by
// excluding the in-progress hour_slot whenever the viewed date is TODAY's business date.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { LiveOpsTab } from '../views/signals.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(LiveOpsTab, props)); });
  return { container, root };
}

describe('LiveOpsTab Baseline Anomalies — current in-progress hour', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('excludes the still-filling CURRENT hour from anomalies, but keeps flagging a real completed-hour miss', async () => {
    // "Now" is 2:37pm -- the business day's current hour_slot is wall-clock-hour(14)+1 = 15,
    // the 2pm-3pm block (the same slot the owner's screenshot showed every store flagging at once).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T14:37:00'));

    const darRows = [
      // A real, COMPLETED hour (1pm-2pm, hour_slot 14) -- a genuine cold miss. Must still flag.
      { loc: '1111', hour_slot: 14, mean_sales: 1000, product_sales: 200 },
      // The CURRENT, still-filling hour (2pm-3pm, hour_slot 15) -- partial sales read far below
      // the full-hour mean purely because the hour isn't over yet. Must NOT flag.
      { loc: '2222', hour_slot: 15, mean_sales: 1000, product_sales: 150 },
    ];

    const { container, root } = mount({ darRows, refreshDar: () => {}, onExportReady: () => {} });
    await act(async () => { await Promise.resolve(); });

    // Scope the assertion to the Baseline Anomalies banner itself, not the page as a whole --
    // Store 2222 legitimately still appears in the full per-store breakdown table below (its
    // own current numbers are real and should show there); it's only the ANOMALY banner that
    // must not flag its still-filling hour.
    const heading = [...container.querySelectorAll('div')].find(d => d.textContent === '⚡ Baseline Anomalies — hours off historical normal');
    expect(heading, 'Baseline Anomalies banner not found').toBeTruthy();
    const banner = heading.parentElement;
    expect(banner.textContent).toContain('Store 1111'); // the real, completed-hour miss
    expect(banner.textContent).not.toContain('Store 2222'); // the in-progress hour, excluded

    act(() => { root.unmount(); });
    container.remove();
  });
});
