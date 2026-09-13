// @vitest-environment happy-dom
// @ts-nocheck
// GH #317 — rankCommentOpportunities() (csat-opportunities.js) was fully built and already fed
// the SMG VOICE panel's own Opportunities tab, but nothing fed its output into the cross-domain
// Needs Attention feed, so a store's worst guest-comment trend never surfaced alongside
// FOB/sales/speed issues in one place. Per the standing "would this verification still pass if
// reverted" rule, this renders the ACTUAL useAttentionFeed hook (not just the engine function)
// with a real ds.smgRows fixture, since the wiring itself lives in attention-now.js, not just
// attention-feed.js.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useAttentionFeed } from '../views/attention-now.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Host({ ds, stores, dateRange }) {
  const feed = useAttentionFeed({ ds, stores, dateRange, max: 50 });
  return React.createElement('pre', null, JSON.stringify(feed));
}

describe('useAttentionFeed surfaces a real CSAT opportunity (GH #317)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('a store with several real negative comments shows up in the feed under Guest Voice', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // 5 negative "speed" comments + 5 positive ones for store 3708 -- well above both MIN_N
    // (8) and csatOpportunityAlerts' default minDetractors (3), and a non-thin sample.
    const smgRows = [
      ...Array.from({ length: 5 }, () => ({ loc: '3708', satisfactionLabel: 'Dissatisfied', text: 'waited forever, the line was so slow' })),
      ...Array.from({ length: 5 }, () => ({ loc: '3708', satisfactionLabel: 'Satisfied', text: 'great service, fast!' })),
    ];
    const ds = { loaded: true, smgRows };
    const stores = [{ loc: '3708' }];
    const dateRange = { s: new Date(Date.now() - 10 * 864e5), e: new Date() };

    act(() => {
      root.render(React.createElement(Host, { ds, stores, dateRange }));
    });

    expect(container.textContent).toContain('Guest Voice');
    expect(container.textContent).toContain('"csat-3708"');
    expect(container.textContent).toContain('Speed');
  });

  it('a store with no SMG data at all is unaffected (regression guard)', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true };
    const stores = [{ loc: '3708' }];
    const dateRange = { s: new Date(Date.now() - 10 * 864e5), e: new Date() };

    act(() => {
      root.render(React.createElement(Host, { ds, stores, dateRange }));
    });

    expect(container.textContent).not.toContain('Guest Voice');
  });
});
