// @vitest-environment happy-dom
// @ts-nocheck
// Backlog survey (2026-09-21) §14: "data_completeness_incidents ... no UI/SAGE consumer
// anywhere in src/." Verified live: the table (supabase/schema-data-completeness.sql) is real,
// populated by scripts/check-data-completeness.mjs, but zero references existed in src/ before
// this change (grep). Data Manager gains a new "Incidents" tab, the first consumer.
//
// `notes` (the table's own RESTRICTED column, per its schema header) is deliberately excluded
// from both the loader and this display -- surfacing it needs the SAGE knowledge-grounding
// handling-notice convention ported to a UI surface, a separate, not-yet-built piece.
//
// loadDataCompletenessIncidents is mocked (not left real) because this sandbox has real
// VITE_SUPABASE_URL/ANON_KEY set (dispatch-208-tab-digest.test.js's own precedent/reasoning) --
// leaving it real would fire a genuine network call and make the tab's populated state
// non-deterministic to assert on.
//
// Per "would this verification still pass if reverted?": the Incidents tab, its row count badge,
// and every cell asserted below did not exist in DataManagerPanel before this change.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const INCIDENTS = [
  { id: 'i1', loc: '3708', stream: 'qsr_service_stats', dateStart: '2026-08-12', dateEnd: '2026-08-19', classification: 'outage', cause: 'upstream_provider_hole', recoveryStatus: 'open', detectedAt: new Date(Date.now() - 10 * 86400000).toISOString() },
  { id: 'i2', loc: '5183', stream: 'qsr_daily_activity', dateStart: '2026-09-01', dateEnd: '2026-09-01', classification: 'unclassified', cause: 'unknown', recoveryStatus: 'open', detectedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
];

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadDataCompletenessIncidents: vi.fn(async () => INCIDENTS) };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { DataManagerPanel } = await import('../views/analytics.js');

let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function mount(ds = { loaded: true }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(DataManagerPanel, { ds, idbCoverage: {}, onClose: () => {} }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

function clickTab(label) {
  const tab = [...container.querySelectorAll('.tab')].find(t => t.textContent.startsWith(label));
  expect(tab, `"${label}" tab not found`).toBeTruthy();
  act(() => { tab.click(); });
}

describe('DataManagerPanel -- Incidents tab (data_completeness_incidents, backlog survey 2026-09-21)', () => {
  it('the tab label shows the open-incident count', async () => {
    await mount();
    expect(container.textContent).toMatch(/Incidents \(2\)/);
  });

  it('lists each open incident with store name, stream, gap dates, cause, and classification', async () => {
    await mount();
    clickTab('Incidents');
    expect(container.textContent).toMatch(/qsr_service_stats/);
    expect(container.textContent).toMatch(/2026-08-12 → 2026-08-19/);
    expect(container.textContent).toMatch(/upstream provider hole/);
    expect(container.textContent).toMatch(/outage/);
    expect(container.textContent).toMatch(/qsr_daily_activity/);
    // single-day gap renders one date, not a "X → X" range
    expect(container.textContent).toMatch(/2026-09-01(?!\s*→)/);
  });

  it('never renders the restricted notes column (not fetched, not displayed)', async () => {
    await mount();
    clickTab('Incidents');
    expect(container.textContent).not.toMatch(/notes/i);
  });

  it('shows the empty state (not an error) when there are no open incidents', async () => {
    const { loadDataCompletenessIncidents } = await import('../lib/supabase.js');
    loadDataCompletenessIncidents.mockResolvedValueOnce([]);
    await mount();
    clickTab('Incidents');
    expect(container.textContent).toMatch(/No open data-completeness incidents/);
  });
});
