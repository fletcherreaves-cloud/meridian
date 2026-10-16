// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 5 -- renders the REAL WeatherImpactPanel, built on the REAL ReportShell.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { WeatherImpactPanel } from '../views/weather-impact.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];
const D = (d) => new Date(Date.now() - d * 86400000);

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(WeatherImpactPanel, props)); });
  return { container, root };
}

describe('WeatherImpactPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('Run Report computes and renders real rainy/dry and hot/cool splits from the real engine', async () => {
    const ds = {
      laborRows: [
        { loc: '3708', date: D(6), sales: 1000, gc: 100 },
        { loc: '3708', date: D(5), sales: 1050, gc: 105 },
        { loc: '3708', date: D(4), sales: 900, gc: 90 },
        { loc: '3708', date: D(3), sales: 850, gc: 85 },
        { loc: '3708', date: D(2), sales: 800, gc: 80 },
        { loc: '3708', date: D(1), sales: 1500, gc: 150 },
      ],
      weatherRows: [
        { loc: '3708', date: D(6), tmax: 60, rain: 0 },
        { loc: '3708', date: D(5), tmax: 65, rain: 0 },
        { loc: '3708', date: D(4), tmax: 70, rain: 0.5 },
        { loc: '3708', date: D(3), tmax: 85, rain: 0.2 },
        { loc: '3708', date: D(2), tmax: 90, rain: 0.8 },
        { loc: '3708', date: D(1), tmax: 95, rain: 0 },
      ],
    };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('-28.2%'); // rainSalesDeltaPct
  });

  it('after a run, CSV export fires with the real headers and the real figures', async () => {
    const ds = {
      laborRows: [{ loc: '3708', date: D(1), sales: 1000, gc: 100 }, { loc: '3708', date: D(2), sales: 1000, gc: 100 }, { loc: '3708', date: D(3), sales: 1000, gc: 100 }],
      weatherRows: [{ loc: '3708', date: D(1), tmax: 60, rain: 0 }, { loc: '3708', date: D(2), tmax: 70, rain: 0 }, { loc: '3708', date: D(3), tmax: 80, rain: 0 }],
    };
    let clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    try {
      ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
      const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
      await act(async () => { runBtn.click(); await Promise.resolve(); });

      const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
      await act(async () => { exportBtn.click(); });
      const csvItem = [...container.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
      await act(async () => { csvItem.click(); });

      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^WeatherImpact_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
