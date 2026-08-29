// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #217 — "⚙️ Scheduled send" row inside the EOM Digest modal (src/views/eom-dashboard.js).
//
// Per this repo's "would this verification still pass if reverted?" standing rule (CLAUDE.md),
// this renders the REAL EOMDashboardPanel -> real "📧 Generate Report" click -> real EOM Digest
// ModalShell chain, not an isolated helper. Reverting the Task 3 wiring (deleting the settings
// row's JSX, or its openDigest()/saveSched() calls into loadEomDigestConfig/saveEomDigestConfig)
// would break the assertions below; a test that only imports a helper function could not tell
// "wired into the real modal" from "written but never rendered."
//
// Supabase is mocked (same technique as dispatch-202-eom-supervisor-rollup.test.js, which this
// file's mock module list is copied from) — EOMDashboardPanel's body is gated on several load*
// promises settling. loadQsrOnHand returns ONE minimal row so `rows.length > 0` and the
// "📧 Generate Report" action isn't disabled (dispatch-98's own minimal on-hand row shape).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadEomDigestConfig = vi.fn(async () => ({ levels: ['district', 'patch'], sendHourUtc: 23 }));
const saveEomDigestConfig = vi.fn(async () => ({ saved: true }));

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'F1', descr: 'Food Item', cls: 'Food', onHandAmt: 10, active: true, lastCounted: null },
  ]),
  loadQsrFob: async () => [],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadQsrVarianceStat: async () => [],
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  saveEomItemDisposition: async () => ({}),
  loadEomItemDisposition: async () => [],
  loadSelfServeTowerLocs: async () => [],
  saveEomSnapshots: async () => ({}),
  loadEomSnapshots: async () => [],
  saveEomSecondaryReview: async () => ({}),
  loadEomSecondaryReview: async () => [],
  saveEomCountException: async () => ({}),
  deleteEomCountException: async () => ({}),
  loadEomCountExceptions: async () => ({}),
  createEomShareLink: async () => ({}),
  loadEbosMonthlyByStore: async () => ({}),
  loadEomDigestConfig,
  saveEomDigestConfig,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');

const STORES = [{ loc: '3708' }, { loc: '3709' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {} }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

// Reports▾ is a grouped ActionMenu dropdown (src/components/PanelControls.js's ActionMenu) —
// click it open, then click the "📧 Generate Report" item inside it.
async function openDigestModal(container) {
  const reportsBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Reports'));
  expect(reportsBtn, 'Reports▾ action menu button not found').toBeTruthy();
  await act(async () => { reportsBtn.click(); });
  const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '📧 Generate Report');
  expect(genBtn, '📧 Generate Report item not found (rows.length was probably 0 — check the loadQsrOnHand fixture)').toBeTruthy();
  await act(async () => { genBtn.click(); await Promise.resolve(); await Promise.resolve(); });
}

describe('dispatch #217 — EOM Digest modal "⚙️ Scheduled send" row', () => {
  let container, root;
  beforeEach(() => { loadEomDigestConfig.mockClear(); saveEomDigestConfig.mockClear(); ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('opening the digest modal loads the real stored config (not silently defaulting) and renders the settings row with District/Patch/Market checkboxes + an hour picker', async () => {
    loadEomDigestConfig.mockResolvedValueOnce({ levels: ['district', 'org'], sendHourUtc: 14 });
    await renderPanel(root);
    await openDigestModal(container);
    expect(loadEomDigestConfig).toHaveBeenCalledTimes(1);

    const text = container.textContent;
    expect(text).toMatch(/⚙️ Scheduled send/);
    expect(text).toMatch(/District/);
    expect(text).toMatch(/Patch/);
    expect(text).toMatch(/Market/);
    expect(text).toMatch(/Send at/);
    expect(text).toMatch(/Save schedule/);

    // The loaded config's checked state actually reflects the real stored row — District and
    // Market checked, Patch unchecked (proves it isn't silently reset to the ['district','patch']
    // default while a real row exists).
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
    expect(boxes.length).toBe(3);
    const checkedLabels = boxes.filter(b => b.checked).map(b => b.closest('label').textContent);
    expect(checkedLabels).toEqual(['District', 'Market']);
  });

  it('a fresh install (no saved row — loadEomDigestConfig\'s own default) shows district+patch checked, hour = the #215 original 6pm CT default', async () => {
    loadEomDigestConfig.mockResolvedValueOnce({ levels: ['district', 'patch'], sendHourUtc: 23 });
    await renderPanel(root);
    await openDigestModal(container);
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
    const checkedLabels = boxes.filter(b => b.checked).map(b => b.closest('label').textContent);
    expect(checkedLabels).toEqual(['District', 'Patch']);
    // Several <select>s exist elsewhere in this panel (period/date/patch pickers) — the hour
    // picker is the one with all 24 hour options.
    const hourSelect = [...container.querySelectorAll('select')].find(s => s.options.length === 24);
    expect(hourSelect, 'hour-picker <select> (24 options) not found').toBeTruthy();
    expect(Number(hourSelect.value)).toBe(23);
  });

  it('toggling a level checkbox then clicking Save schedule calls saveEomDigestConfig with the updated levels + the (unchanged) hour', async () => {
    loadEomDigestConfig.mockResolvedValueOnce({ levels: ['district', 'patch'], sendHourUtc: 23 });
    await renderPanel(root);
    await openDigestModal(container);

    const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
    const orgBox = boxes.find(b => b.closest('label').textContent === 'Market');
    await act(async () => { orgBox.click(); }); // check Market on, in addition to district+patch

    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save schedule');
    expect(saveBtn).toBeTruthy();
    await act(async () => { saveBtn.click(); await Promise.resolve(); });

    expect(saveEomDigestConfig).toHaveBeenCalledTimes(1);
    const arg = saveEomDigestConfig.mock.calls[0][0];
    expect(arg.sendHourUtc).toBe(23);
    expect(new Set(arg.levels)).toEqual(new Set(['district', 'patch', 'org']));
  });

  it('this "which levels the daily email includes" control is independent of the level TABS above it (viewing district doesn\'t force district into the schedule, and vice versa)', async () => {
    loadEomDigestConfig.mockResolvedValueOnce({ levels: ['org'], sendHourUtc: 23 }); // schedule = Market only
    await renderPanel(root);
    await openDigestModal(container);
    // The view tabs (District/Patch/Market as plain toggle buttons, not checkboxes) still default
    // to showing SOMETHING regardless of what the schedule below is configured to — the two
    // controls don't share state. Confirm the schedule checkboxes reflect ONLY the loaded
    // schedule config (Market checked, District/Patch unchecked) even though a view tab reads
    // "District" highlighted elsewhere on the same screen.
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
    const checkedLabels = boxes.filter(b => b.checked).map(b => b.closest('label').textContent);
    expect(checkedLabels).toEqual(['Market']);
  });

  it('unchecking every level disables Save and shows a "pick at least one" hint, so a save can never persist zero levels', async () => {
    loadEomDigestConfig.mockResolvedValueOnce({ levels: ['district'], sendHourUtc: 23 });
    await renderPanel(root);
    await openDigestModal(container);
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
    const districtBox = boxes.find(b => b.closest('label').textContent === 'District');
    await act(async () => { districtBox.click(); }); // uncheck the only checked level
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save schedule');
    expect(saveBtn.disabled).toBe(true);
    expect(container.textContent).toMatch(/Pick at least one level/);
  });
});
