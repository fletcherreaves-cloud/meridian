// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-10-30): "can you make the pre determined email group selectable? ...if I want
// to disclude someone from the list I could just unselect that person?"
//
// Exercises the fix through the REAL EOMDashboardPanel -> "📧 Generate Report" -> EOM Digest
// modal chain (this repo's "would this verification still pass if reverted?" rule), same harness
// dispatch-eom-store-level-digest-2026-10-29.test.js already established: the modal's new "📬
// Recipients" checklist (resolveDigestRecipients(), src/engine/contact-directory.js) and
// sendDigest()'s new `exclude` input both have to be wired correctly for these assertions to pass.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CONTACTS, STORE_STAFF } from '../engine/contact-directory.js';

const triggerSync = vi.fn(async () => ({ ok: true }));

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'F1', descr: 'Food Item Never Counted', cls: 'Food', onHandAmt: 10, active: true, lastCounted: null },
  ]),
  loadQsrFob: async () => [],
  loadEomPeriods: async () => [],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadQsrVarianceStat: async () => [],
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => [],
  loadQsrRawItemInfo: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync,
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
  loadEomDigestConfig: async () => ({ levels: ['district', 'patch'], sendHourUtc: 23 }),
  saveEomDigestConfig: async () => ({ saved: true }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');

// '3708' = Ardmore-Broadway (MCDOK).
const STORES = [{ loc: '3708' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root, props = {}) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {}, ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

async function openDigestModal(container) {
  const reportsBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Reports'));
  expect(reportsBtn, 'Reports▾ action menu button not found').toBeTruthy();
  await act(async () => { reportsBtn.click(); });
  const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '📧 Generate Report');
  expect(genBtn, '📧 Generate Report item not found').toBeTruthy();
  await act(async () => { genBtn.click(); await Promise.resolve(); await Promise.resolve(); });
}

// The "📬 Recipients" heading div is a text-only LEAF (its count is dynamic, so it can't be
// matched by exact equality the way "⚙️ Scheduled send" is elsewhere) -- querySelectorAll visits
// in document order, so a bare startsWith() match would find the OUTER wrapping box first (its
// own textContent also starts with the heading, since the heading renders first inside it), not
// the leaf. Restrict to childless divs to get the actual leaf, then its parent is the whole box.
function recipientsSection(container) {
  const heading = [...container.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.trim().startsWith('📬 Recipients'));
  expect(heading, '📬 Recipients heading not found').toBeTruthy();
  return heading.parentElement;
}

describe('EOM Digest modal — Recipients checklist (owner req 2026-10-30: unselect a person)', () => {
  let container, root;
  beforeEach(() => { triggerSync.mockClear(); ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows a checkbox per resolved recipient, all checked by default, the GM\'s own email among them', async () => {
    await renderPanel(root, { initialStore: '3708' });
    await openDigestModal(container);
    const section = recipientsSection(container);
    const boxes = [...section.querySelectorAll('input[type="checkbox"]')];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every(b => b.checked)).toBe(true);
    const labels = boxes.map(b => b.closest('label').textContent);
    expect(labels).toContain(STORE_STAFF['3708'].gmEmail);
    expect(labels).toContain(CONTACTS.aboveStore[0].email);
  });

  it('the heading count reflects checked/total, and unchecking one person strikes it through and decrements the count', async () => {
    await renderPanel(root, { initialStore: '3708' });
    await openDigestModal(container);
    const section = recipientsSection(container);
    const total = section.querySelectorAll('input[type="checkbox"]').length;
    expect(section.textContent).toContain(`📬 Recipients (${total}/${total})`);

    const gmBox = [...section.querySelectorAll('input[type="checkbox"]')]
      .find(b => b.closest('label').textContent === STORE_STAFF['3708'].gmEmail);
    await act(async () => { gmBox.click(); });

    expect(section.textContent).toContain(`📬 Recipients (${total - 1}/${total})`);
    expect(gmBox.checked).toBe(false);
    expect(gmBox.closest('label').style.textDecoration).toBe('line-through');
  });

  it('clicking Email after unchecking one person passes exactly that address as the exclude input', async () => {
    await renderPanel(root, { initialStore: '3708' });
    await openDigestModal(container);
    const section = recipientsSection(container);
    const gmEmail = STORE_STAFF['3708'].gmEmail;
    const gmBox = [...section.querySelectorAll('input[type="checkbox"]')].find(b => b.closest('label').textContent === gmEmail);
    await act(async () => { gmBox.click(); });

    const sendBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('📧 Email'));
    await act(async () => { sendBtn.click(); await Promise.resolve(); });

    expect(triggerSync).toHaveBeenCalledTimes(1);
    const [, inputs] = triggerSync.mock.calls[0];
    expect(inputs.exclude).toBe(gmEmail);
  });

  it('sending with nobody unchecked never includes an exclude input at all — the normal path is unaffected', async () => {
    await renderPanel(root, { initialStore: '3708' });
    await openDigestModal(container);
    const sendBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('📧 Email'));
    await act(async () => { sendBtn.click(); await Promise.resolve(); });
    const [, inputs] = triggerSync.mock.calls[0];
    expect(inputs.exclude).toBeUndefined();
  });

  it('switching level tabs resets the exclusion — a stale uncheck never silently carries into a different group', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const section1 = recipientsSection(container);
    const firstBox = section1.querySelector('input[type="checkbox"]');
    await act(async () => { firstBox.click(); });
    expect(firstBox.checked).toBe(false);

    const patchTab = [...container.querySelectorAll('button')].find(b => b.textContent === 'Patch');
    await act(async () => { patchTab.click(); });

    const section2 = recipientsSection(container);
    const boxesAfter = [...section2.querySelectorAll('input[type="checkbox"]')];
    expect(boxesAfter.every(b => b.checked)).toBe(true);
  });

  it('the ⚙️ Scheduled send checkboxes are untouched by anything checked/unchecked in the Recipients list', async () => {
    await renderPanel(root, { initialStore: '3708' });
    await openDigestModal(container);
    const gmBox = [...recipientsSection(container).querySelectorAll('input[type="checkbox"]')]
      .find(b => b.closest('label').textContent === STORE_STAFF['3708'].gmEmail);
    await act(async () => { gmBox.click(); });

    const schedHeading = [...container.querySelectorAll('div')].find(d => d.textContent.trim() === '⚙️ Scheduled send');
    const schedLabels = [...schedHeading.parentElement.querySelectorAll('input[type="checkbox"]')].map(b => b.closest('label').textContent);
    expect(schedLabels).toEqual(['District', 'Patch', 'Market', 'Operator']);
  });
});
