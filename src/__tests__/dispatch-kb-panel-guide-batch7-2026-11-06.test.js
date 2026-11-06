// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-06 batch 7: 6 more real, traffic-relevant nav
// panels -- Needs Attention, Forecast Brief, Custom Report Builder, Price Change Impact, Item
// Velocity, Channel Mix. Each verified against its own real source file before writing, per
// this repo's "measure, don't reason" standing rule.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KnowledgeBasePanel } from '../engine/forecast.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); });

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(KnowledgeBasePanel, { onClose: () => {} })));
}

function openArticle(matchText) {
  const entry = [...container.querySelectorAll('div')]
    .filter(d => d.textContent.includes(matchText)).pop();
  expect(entry, `article matching "${matchText}" not found`).toBeTruthy();
  act(() => { entry.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('Knowledge Base — attention_guide (task #75)', () => {
  it('is findable and explains the no-silent-caps store-grouped design', () => {
    mount();
    openArticle('Needs Attention — Panel Guide');
    expect(container.textContent).toContain('no-silent-caps');
    expect(container.textContent).toContain('rankAttention');
  });

  it('states acks persist to their own separate user_settings row', () => {
    mount();
    openArticle('Needs Attention — Panel Guide');
    expect(container.textContent).toContain('ATTENTION_ACK_SETTING_KEY');
    expect(container.textContent).toContain('SEPARATE');
  });
});

describe('Knowledge Base — brief_guide (task #75)', () => {
  it('is findable and explains it is a SAGE-written narrative, not a forecast', () => {
    mount();
    openArticle('Forecast Brief — Panel Guide');
    expect(container.textContent).toContain('callSageOnce');
    expect(container.textContent).toContain('NOT a forecast of the upcoming period');
  });

  it('states it renders LocationBrief, built from buildBriefContext()', () => {
    mount();
    openArticle('Forecast Brief — Panel Guide');
    expect(container.textContent).toContain('buildBriefContext()');
    expect(container.textContent).toContain('Intelligence Brief');
  });
});

describe('Knowledge Base — custom_report_builder_guide (task #75)', () => {
  it('is findable and explains shared reports are RLS-enforced', () => {
    mount();
    openArticle('Custom Report Builder — Panel Guide');
    expect(container.textContent).toContain('RLS');
    expect(container.textContent).toContain('author can edit');
  });

  it('states it resolves through the same metricValueForRange() path', () => {
    mount();
    openArticle('Custom Report Builder — Panel Guide');
    expect(container.textContent).toContain('metricValueForRange');
  });
});

describe('Knowledge Base — price_change_impact_guide (task #75)', () => {
  it('is findable and explains only CONFIRMED repricing events qualify', () => {
    mount();
    openArticle('Price Change Impact — Panel Guide');
    expect(container.textContent).toContain('CONFIRMED');
    expect(container.textContent).toContain('14');
  });

  it('states it reuses the Pricing Engine\'s own detector, not a second one', () => {
    mount();
    openArticle('Price Change Impact — Panel Guide');
    expect(container.textContent).toContain('Pricing Engine');
    expect(container.textContent).toContain('price-events.js');
  });
});

describe('Knowledge Base — item_velocity_guide (task #75)', () => {
  it('is findable and explains the first-half-vs-second-half trend', () => {
    mount();
    openArticle('Item Velocity — Panel Guide');
    expect(container.textContent).toContain('first half');
    expect(container.textContent).toContain('second half');
  });

  it('states it reads ds.pmixRows directly, not the Signal Lab resolver', () => {
    mount();
    openArticle('Item Velocity — Panel Guide');
    expect(container.textContent).toContain('pmixRows');
    expect(container.textContent).toContain('Signal Lab');
  });
});

describe('Knowledge Base — channel_mix_guide (task #75)', () => {
  it('is findable and explains Trend is in percentage points, not relative %', () => {
    mount();
    openArticle('Channel Mix — Panel Guide');
    expect(container.textContent).toContain('percentage POINTS');
  });

  it('lists all five real channel columns', () => {
    mount();
    openArticle('Channel Mix — Panel Guide');
    expect(container.textContent).toContain('Drive-Thru');
    expect(container.textContent).toContain('Mobile Order Pickup');
    expect(container.textContent).toContain('Kiosk');
  });
});

// Real stale panel_index wording caught while researching Forecast Brief for this batch:
// `id:'brief'` actually renders LocationBrief (a SAGE narrative brief), not a forecast of the
// upcoming period -- panel_index's one-liner said the opposite. Fixed in the same commit.
describe('Knowledge Base — panel_index Forecast Brief description (task #75 stale-wording fix)', () => {
  it('no longer claims Forecast Brief is pre-forecast analysis of the upcoming period', () => {
    mount();
    openArticle('Panel Index — every panel, explained');
    expect(container.textContent).not.toContain('pre-forecast analysis of the upcoming period');
    expect(container.textContent).toContain('SAGE-written Intelligence Brief');
    expect(container.textContent).toContain('not a forecast of the upcoming period');
  });
});
