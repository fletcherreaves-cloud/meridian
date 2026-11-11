// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 15 — 2026-11-11.
//
// Re-measured the next 12 named candidates from batch 14's "still open" list (grepped
// `articleKey:\s*'<key>'` across src/) -- all 12 were still genuinely unwired. This batch wires
// 3 of them, each matched to its real mount point by reading the component, not guessed:
//
// - metric_lineage_guide -> MetricLineagePanel (src/views/metric-lineage.js)'s ModalShell.
// - pay_rate_history_guide -> PayRateHistoryPanel (src/views/pay-rate-history.js)'s ModalShell.
// - email_digests_guide -> EmailDigestSubscriptionsPanel (src/views/email-digest-subscriptions-
//   panel.js)'s ModalShell.
//
// All three already used a plain-string `subtitle`, converted here to a `<span>` node carrying
// the string text plus the InfoIcon -- same subtitle-not-title placement established in the
// previous batch (ModalShell forwards `title`, never `subtitle`, into ScreenshotShareButton's
// slugify(title)/native-share title, both string-only).
//
// `panel_index` (the 13th remaining named candidate) was re-confirmed as the one genuine
// App-Guide exception in this group -- a live map of every panel, with no single panel of its
// own to attach an icon to -- left unwired, same judgment as file_import_guide/locked_projections.
//
// PayRateHistoryPanel and EmailDigestSubscriptionsPanel both call real `src/lib/supabase.js`
// loaders on mount (loadLifeLenzShiftPay/loadLifeLenzShiftAssignments/logAppAccess/
// loadMyEmailDigestSubscriptions) -- each is guarded `if (!supabase) return [...]`/`return
// new Set()`, and this sandbox has no VITE_SUPABASE_URL configured, so they resolve safely
// without a mock (confirmed by reading each loader before relying on it, not assumed).
//
// Each wiring gets a real render-level test per CLAUDE.md's "would this verification still pass
// if reverted?" rule -- mounts the ACTUAL component, clicks the real "?" InfoIcon control, and
// asserts the real article title appears.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

function clickInfoIcon() {
  const icon = container.querySelector('span[title^="Click for details"]');
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout batch 15 (2026-11-11)', () => {
  it('Metric Lineage panel (metric_lineage_guide)', async () => {
    const { MetricLineagePanel } = await import('../views/metric-lineage.js');
    mountEl(h(MetricLineagePanel, { onClose: () => {} }));
    expect(container.textContent).toContain('Metric Lineage');
    clickInfoIcon();
    expect(container.textContent).toContain('Metric Lineage — Panel Guide');
  });

  it('Pay Rate History panel (pay_rate_history_guide)', async () => {
    const { PayRateHistoryPanel } = await import('../views/pay-rate-history.js');
    mountEl(h(PayRateHistoryPanel, { ds: {}, stores: [], onClose: () => {} }));
    await act(async () => { await Promise.resolve(); });
    clickInfoIcon();
    expect(container.textContent).toContain('Pay Rate History — Panel Guide');
  });

  it('Email Digests subscriptions panel (email_digests_guide)', async () => {
    const { EmailDigestSubscriptionsPanel } = await import('../views/email-digest-subscriptions-panel.js');
    mountEl(h(EmailDigestSubscriptionsPanel, { onClose: () => {} }));
    await act(async () => { await Promise.resolve(); });
    clickInfoIcon();
    expect(container.textContent).toContain('Email Digests — Panel Guide');
  });
});
