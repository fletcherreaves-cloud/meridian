// @vitest-environment happy-dom
// @ts-nocheck
// Task #137 — "Add visibility badges for On Hand / Variance pull freshness."
//
// stream-freshness.js's STREAMS array (CLAUDE.md's "make its staleness visible per-stream, not
// pooled" rule) previously excluded qsr_onhand/qsr_variance_stat entirely, by that file's own
// header comment — neither stream had an eager ds load to check. This closes that gap with the
// same lightweight {date}-only probe pattern already proven for qsr_inventory_summary
// (loadQsrOnHandFreshness/loadQsrVarianceStatFreshness, App.js's _stOnHandFreshness/
// _stVarianceFreshness), then surfaces a stale-dot badge off the real STREAMS entries wherever
// an operator looks at On-Hand or Variance numbers:
//   - at-a-glance.js: CountFobPulseTile (always-on) + EOMScoreboardTile (EOM window) — covered
//     by src/__tests__/at-a-glance-count-fob-pulse-tile.test.js's own task #137 describe block.
//   - fob-eom.js: FOBEOMPanel (On-Hand + Variance) — covered by
//     src/__tests__/dispatch-136-fob-eom-automated-pulls.test.js's own task #137 describe block.
//   - eom-dashboard.js: the Change Monitor modal's subtitle (Variance) — exercised here directly
//     against the exported freshBadge() helper, the same function the modal's ModalShell call
//     wires in as `subtitle: freshBadge(ds, 'variance', ...)`.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { freshBadge } from '../views/eom-dashboard.js';
import { STREAMS } from '../engine/stream-freshness.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderInto(el) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(el); });
  return { container, root };
}

describe('STREAMS registry carries real On-Hand / Variance entries (task #137)', () => {
  it('onHand and variance are present with daily cadence, off their own lightweight-probe ds fields', () => {
    expect(STREAMS.find(s => s.key === 'onHand')).toMatchObject({ dsField: 'qsrOnHandFreshnessRows', cadenceDays: 1 });
    expect(STREAMS.find(s => s.key === 'variance')).toMatchObject({ dsField: 'qsrVarianceFreshnessRows', cadenceDays: 1 });
  });
});

describe('eom-dashboard.js freshBadge() — Change Monitor\'s Variance subtitle (task #137)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('renders nothing when the stream has not resolved into ds this session', () => {
    expect(freshBadge({}, 'variance', 'Variance Stat pull')).toBeNull();
  });

  it('a fresh probe renders the label + "today" with the ok (green) dot color', () => {
    const el = freshBadge({ qsrVarianceFreshnessRows: [{ date: new Date().toISOString() }] }, 'variance', 'Variance Stat pull');
    expect(el).toBeTruthy();
    ({ container, root } = renderInto(el));
    expect(container.textContent).toContain('Variance Stat pull: today');
    const dot = container.querySelector('span span');
    expect(dot.style.background).toBe('#10b981');
  });

  it('a stale probe (5 days behind) surfaces its real age and the crit (red) dot color', () => {
    const stale = new Date(); stale.setDate(stale.getDate() - 5);
    const el = freshBadge({ qsrVarianceFreshnessRows: [{ date: stale.toISOString() }] }, 'variance', 'Variance Stat pull');
    ({ container, root } = renderInto(el));
    expect(container.textContent).toContain('Variance Stat pull: 5d ago');
    const dot = container.querySelector('span span');
    expect(dot.style.background).toBe('#ef4444');
  });

  it('an empty-but-loaded probe reads as "no usable date", not silently blank', () => {
    const el = freshBadge({ qsrVarianceFreshnessRows: [] }, 'variance', 'Variance Stat pull');
    ({ container, root } = renderInto(el));
    expect(container.textContent).toContain('Variance Stat pull: no usable date');
  });
});
