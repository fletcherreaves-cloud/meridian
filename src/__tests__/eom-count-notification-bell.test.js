// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #209 -- renders the REAL NotificationBell (src/app/shell.js), not just the data
// functions, per this repo's "would this verification still pass if the change were reverted?"
// standing rule: a test that only imports detectCountNotifications()/buildNotificationRow()
// can't tell "the bell is wired up" from "the bell was never mounted at all". Data functions
// (loadEomCountNotifications/countUnreadEomCountNotifications/markEomCountNotificationRead) are
// mocked -- this sandbox can't reach live Supabase -- with synthetic rows shaped exactly like a
// real eom_count_notifications row (see supabase/schema-eom-count-notifications.sql).
//
// 2026-10-12 -- extended for the general notification framework (src/engine/app-notifications.js,
// supabase/schema-app-notifications.sql): the bell now merges the pre-existing EOM-specific source
// (unchanged rendering) with a new, type-agnostic `app_notifications` source, plus a delete button
// on both. Same "render the real component" rule applies to the new behavior too.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// loc arrives from loadEomCountNotifications() already unpadded (String(parseInt(r.loc,10))) --
// the mock below stands in for that loader, so fixtures use the SAME normalized shape it returns
// (matches STORE_NAMES/sNameC's key format; see that function's own comment for why).
const ROW_FOOD_CONDIMENT = {
  id: 'n1', loc: '3708', period: '2026-08', trigger_kind: 'food_condiment',
  class_statuses: {
    food: { status: 'complete', pct: 1, total: 10, counted: 10 },
    condiment: { status: 'complete', pct: 0.99, total: 8, counted: 8 },
    paper: { status: 'not_started', pct: 0, total: 4, counted: 0 },
    nonproduct: { status: 'not_applicable', pct: null, total: 0, counted: 0 },
    lateBulk: false, lateBulkDay: null,
  },
  uncounted_items: { items: [], totalCount: 2, totalValue: 340, truncated: false },
  kb_links: [{ title: 'What are the Best Counting Practices Using the Mobile Inventory App', url: 'https://support.qsrsoft.com/hc/en-us/articles/360046512394' }],
  created_at: new Date(Date.now() - 5 * 60000).toISOString(),
  read_at: null,
};

// Rule 3 fixture: one class at ZERO counted (not_started) and another PARTIALLY counted
// (in_progress) on the same row -- must render both, distinctly.
const ROW_MIXED_STATUS = {
  id: 'n2', loc: '5183', period: '2026-08', trigger_kind: 'paper',
  class_statuses: {
    food: { status: 'not_started', pct: 0, total: 6, counted: 0 },
    condiment: { status: 'in_progress', pct: 0.4, total: 5, counted: 2 },
    paper: { status: 'complete', pct: 1, total: 3, counted: 3 },
    nonproduct: { status: 'not_started', pct: 0, total: 2, counted: 0 },
  },
  uncounted_items: { items: [], totalCount: 0, totalValue: 0, truncated: false },
  kb_links: [],
  created_at: new Date(Date.now() - 60 * 60000).toISOString(),
  read_at: '2026-08-29T10:00:00Z', // already read
};

// A generic app_notifications row -- a synthetic, non-EOM type, proving the bell doesn't
// special-case 'eom_count' anywhere in its generic rendering path.
const ROW_GENERIC = {
  id: 'g1', type: 'sync_failure', loc: null, period: null, severity: 'crit',
  title: 'LifeLenz pull failing', detail: '3 days stale — token likely expired',
  link: 'data-manager', resolve_key: 'sync_failure:lifelenz', payload: null,
  created_at: new Date(Date.now() - 2 * 60000).toISOString(),
  read_at: null,
};

const loadEomCountNotifications = vi.fn(() => Promise.resolve([ROW_FOOD_CONDIMENT, ROW_MIXED_STATUS]));
const countUnreadEomCountNotifications = vi.fn(() => Promise.resolve(1));
const markEomCountNotificationRead = vi.fn(() => Promise.resolve({ saved: 1 }));
const dismissEomCountNotification = vi.fn(() => Promise.resolve({ saved: 1 }));
const loadAppNotifications = vi.fn(() => Promise.resolve([ROW_GENERIC]));
const countUnreadAppNotifications = vi.fn(() => Promise.resolve(1));
const markAppNotificationRead = vi.fn(() => Promise.resolve({ saved: 1 }));
const dismissAppNotification = vi.fn(() => Promise.resolve({ saved: 1 }));

vi.mock('../lib/supabase.js', () => ({
  supabase: null,
  loadEomCountNotifications: (...a) => loadEomCountNotifications(...a),
  countUnreadEomCountNotifications: (...a) => countUnreadEomCountNotifications(...a),
  markEomCountNotificationRead: (...a) => markEomCountNotificationRead(...a),
  dismissEomCountNotification: (...a) => dismissEomCountNotification(...a),
  loadAppNotifications: (...a) => loadAppNotifications(...a),
  countUnreadAppNotifications: (...a) => countUnreadAppNotifications(...a),
  markAppNotificationRead: (...a) => markAppNotificationRead(...a),
  dismissAppNotification: (...a) => dismissAppNotification(...a),
}));

const { NotificationBell } = await import('../app/shell.js');

let container, root;
beforeEach(() => {
  vi.clearAllMocks();
  loadEomCountNotifications.mockResolvedValue([ROW_FOOD_CONDIMENT, ROW_MIXED_STATUS]);
  countUnreadEomCountNotifications.mockResolvedValue(1);
  loadAppNotifications.mockResolvedValue([ROW_GENERIC]);
  countUnreadAppNotifications.mockResolvedValue(1);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

async function mount(props) {
  await act(async () => { root.render(React.createElement(NotificationBell, props)); });
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
async function openBell() {
  await act(async () => { container.querySelector('button').click(); });
  await flush();
}

describe('NotificationBell — bell + unread badge', () => {
  it('renders the bell and polls BOTH sources\' unread counts, summed, on mount', async () => {
    await mount({ onOpenModal: vi.fn(), perm: () => true });
    await flush();
    expect(countUnreadEomCountNotifications).toHaveBeenCalled();
    expect(countUnreadAppNotifications).toHaveBeenCalled();
    expect(container.textContent).toContain('🔔');
    // 1 (EOM) + 1 (generic) = 2.
    expect(container.textContent).toContain('2');
  });

  it('renders nothing when the caller lacks analytics.district (same perm as the panel it deep-links into)', async () => {
    await mount({ onOpenModal: vi.fn(), perm: () => false });
    await flush();
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('NotificationBell — dropdown', () => {
  it('clicking the bell opens the dropdown and loads + merges BOTH sources newest-first', async () => {
    await mount({ onOpenModal: vi.fn(), perm: () => true });
    await flush();
    await openBell();
    expect(loadEomCountNotifications).toHaveBeenCalled();
    expect(loadAppNotifications).toHaveBeenCalled();
    expect(container.textContent).toContain('Notifications');
    expect(container.textContent).not.toContain('EOM Count Notifications'); // header is generic now
    // Store names resolved via sNameC (real Meridian store names for 3708/5183), not blank.
    expect(container.querySelector('[data-notif-row="n1"]').textContent).not.toContain('3708');
    expect(container.textContent).toContain('Food + Condiment complete');
    expect(container.textContent).toContain('Paper complete');
    // The generic, non-EOM row renders too, with its own title/detail.
    expect(container.textContent).toContain('LifeLenz pull failing');
    expect(container.textContent).toContain('3 days stale — token likely expired');
  });

  it('rule 3: a not_started class and an in_progress class on the SAME row render distinctly', async () => {
    await mount({ onOpenModal: vi.fn(), perm: () => true });
    await flush();
    await openBell();
    expect(container.textContent).toContain('Food: Not started');
    expect(container.textContent).toContain('Condiment: In progress (40%)');
    expect(container.textContent).toContain('Paper: Complete');
    // not_applicable must never render (rule 3 -- no fake reading for a class with zero items).
    expect(container.textContent).not.toContain('N/A');
  });

  it('shows uncounted-item count + $ at risk, collapsed (not the full item list inline)', async () => {
    await mount({ onOpenModal: vi.fn(), perm: () => true });
    await flush();
    await openBell();
    expect(container.textContent).toContain('2 uncounted items (~$340 at risk)');
  });

  it('shows the real KB link title/url, not a placeholder', async () => {
    await mount({ onOpenModal: vi.fn(), perm: () => true });
    await flush();
    await openBell();
    const link = container.querySelector('a[href^="https://support.qsrsoft.com/"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Best Counting Practices');
  });

  it('clicking an unread EOM row marks it read and deep-links into that store\'s EOM Dashboard scoreboard', async () => {
    const onOpenModal = vi.fn();
    await mount({ onOpenModal, perm: () => true });
    await flush();
    await openBell();
    const unreadRowEl = container.querySelector('[data-notif-row="n1"]');
    expect(unreadRowEl).toBeTruthy();
    await act(async () => { unreadRowEl.click(); });
    expect(markEomCountNotificationRead).toHaveBeenCalledWith('n1');
    expect(onOpenModal).toHaveBeenCalledWith('eom-dashboard:3708');
  });

  it('clicking an ALREADY-read EOM row does not call markEomCountNotificationRead again, but still deep-links', async () => {
    const onOpenModal = vi.fn();
    await mount({ onOpenModal, perm: () => true });
    await flush();
    await openBell();
    const readRowEl = container.querySelector('[data-notif-row="n2"]');
    expect(readRowEl).toBeTruthy();
    await act(async () => { readRowEl.click(); });
    expect(markEomCountNotificationRead).not.toHaveBeenCalled();
    expect(onOpenModal).toHaveBeenCalledWith('eom-dashboard:5183');
  });

  it('clicking an unread GENERIC row marks it read (via the generic function) and deep-links to its own `link`', async () => {
    const onOpenModal = vi.fn();
    await mount({ onOpenModal, perm: () => true });
    await flush();
    await openBell();
    const rowEl = container.querySelector('[data-notif-row="g1"]');
    expect(rowEl).toBeTruthy();
    await act(async () => { rowEl.click(); });
    expect(markAppNotificationRead).toHaveBeenCalledWith('g1');
    expect(markEomCountNotificationRead).not.toHaveBeenCalled();
    expect(onOpenModal).toHaveBeenCalledWith('data-manager');
  });

  it('deleting an EOM row calls dismissEomCountNotification, removes it from the list, and decrements unread', async () => {
    await mount({ onOpenModal: vi.fn(), perm: () => true });
    await flush();
    await openBell();
    const rowEl = container.querySelector('[data-notif-row="n1"]');
    const dismissBtn = rowEl.querySelector('button[title="Delete this notification"]');
    expect(dismissBtn).toBeTruthy();
    await act(async () => { dismissBtn.click(); });
    expect(dismissEomCountNotification).toHaveBeenCalledWith('n1');
    expect(dismissAppNotification).not.toHaveBeenCalled();
    expect(container.querySelector('[data-notif-row="n1"]')).toBeNull();
    // n1 was unread (badge was 2 from the beforeEach mocks) -- deleting it drops the badge by 1.
    expect(container.textContent).toContain('1');
  });

  it('deleting a GENERIC row calls dismissAppNotification and removes it from the list, without navigating', async () => {
    const onOpenModal = vi.fn();
    await mount({ onOpenModal, perm: () => true });
    await flush();
    await openBell();
    const rowEl = container.querySelector('[data-notif-row="g1"]');
    const dismissBtn = rowEl.querySelector('button[title="Delete this notification"]');
    await act(async () => { dismissBtn.click(); });
    expect(dismissAppNotification).toHaveBeenCalledWith('g1');
    expect(dismissEomCountNotification).not.toHaveBeenCalled();
    expect(container.querySelector('[data-notif-row="g1"]')).toBeNull();
    expect(onOpenModal).not.toHaveBeenCalled(); // delete must never also navigate
  });

  it('deleting a row never also triggers its own row-click (mark-read/navigate)', async () => {
    const onOpenModal = vi.fn();
    await mount({ onOpenModal, perm: () => true });
    await flush();
    await openBell();
    const rowEl = container.querySelector('[data-notif-row="n2"]'); // already-read row
    const dismissBtn = rowEl.querySelector('button[title="Delete this notification"]');
    await act(async () => { dismissBtn.click(); });
    expect(onOpenModal).not.toHaveBeenCalled();
  });
});
