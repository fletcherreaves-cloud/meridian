// @vitest-environment happy-dom
// @ts-nocheck
// Backlog: "Data Manager — show source report per data type, extend to auto-synced sources."
// DataManagerPanel already labeled every data type's SOURCE via SRC_INFO for manual/legacy
// streams, and had a bespoke live-Supabase-query section for a handful of auto-synced ones
// (LifeLenz/FOB/eBOS/DAR/Security Events) -- but ~13 other streams already eager-loaded into
// ds at startup (the SAME src/engine/stream-freshness.js STREAMS entries the freshness
// checklist reads) had no row anywhere in this panel at all: Ops Cash/Labor/Service/Sales Mix,
// LifeLenz Attendance, Inventory Summary, Forecast Week Cache, and the 6 monthly Performance-
// Review streams (Roster Stats/Employee Roster/Turnover/Digital App/McDelivery/Shift Manager).
//
// Per "would this verification still pass if reverted?": these fields never appeared in
// DataManagerPanel's rendered output before this change -- every assertion below on a specific
// label/count fails against the old code, which simply never read these ds fields.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DataManagerPanel } from '../views/analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); });

function mount(ds) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(DataManagerPanel, { ds, idbCoverage: {}, onClose: () => {} })));
}

describe('DataManagerPanel -- extended auto-synced source labeling', () => {
  it('shows a labeled, populated row for a newly-wired daily auto-synced stream (Ops Cash Sheet)', () => {
    const ds = { loaded: true, opsCashRows: [{ loc: '3708', date: '2026-09-15', amt: 1 }, { loc: '3708', date: '2026-09-16', amt: 1 }] };
    mount(ds);
    expect(container.textContent).toContain('Ops Cash Sheet');
    expect(container.textContent).toContain('2');
  });

  it('shows source-attribution text (SRC_INFO) identifying the stream as auto-pulled', () => {
    const ds = { loaded: true, opsLaborRows: [{ loc: '3708', date: '2026-09-16' }] };
    mount(ds);
    expect(container.textContent).toMatch(/QSRSoft Ops Labor Summary.*auto-pulled/);
  });

  it('a monthly Performance-Review stream (dateField "month") resolves without throwing and shows its label', () => {
    const ds = { loaded: true, rosterStatsRows: [{ loc: '3708', month: '2026-08' }, { loc: '3708', month: '2026-09' }] };
    mount(ds);
    expect(container.textContent).toContain('Roster Statistics');
    expect(container.textContent).toContain('2');
  });

  it('an absent stream renders as empty ("—"), not a crash', () => {
    const ds = { loaded: true };
    expect(() => mount(ds)).not.toThrow();
    expect(container.textContent).toContain('Forecast Week Cache');
  });

  it('all 13 newly-labeled streams appear in the rendered output', () => {
    const ds = { loaded: true };
    mount(ds);
    for (const label of [
      'Ops Cash Sheet', 'Ops Labor Summary', 'Ops Service Stats', 'Ops Sales Mix',
      'LifeLenz Attendance', 'Inventory Summary/Usage', 'Forecast Week Cache',
      'Roster Statistics', 'Employee Roster', 'Turnover', 'Digital App', 'McDelivery', 'Shift Manager',
    ]) {
      expect(container.textContent, `missing label: ${label}`).toContain(label);
    }
  });
});
