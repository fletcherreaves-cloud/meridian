// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion) — InfoIcon rollout, ReportShell batch (2026-11-08).
//
// Re-measured the real gap before picking this batch: of 117 real `KB_ARTICLES` keys, grepping
// `articleKey:\s*'...'` across src/app/App.js, src/views/*.js and src/features/*.js found only
// 43 wired — 74 keys exist with no clickable "?" anywhere. 12 of those 74 turned out to share one
// real mechanical cause: `src/components/ReportShell.js` (the shared date-range + LocationSelector
// + Run/export chrome behind every "Reports Hub deep-dive" panel) had no `articleKey` prop at all,
// so none of its 12 real consumers (confirmed via `grep -rl "h(ReportShell" src/views/*.js`) could
// ever surface an InfoIcon no matter what the calling panel passed — a shared-component gap, not
// 12 separate per-file oversights. Added an optional `articleKey` prop to `ReportShell` itself
// (renders `InfoIcon` next to the existing subtitle text when provided, same visual convention
// every other RoutePanelShell-based wiring in this backlog already uses) and wired it on all 12
// real call sites, each verified against its own already-existing, title-matching `KB_ARTICLES`
// entry (confirmed via a direct regex pull of each key's `title:` field) before wiring — not
// guessed from the key name alone, same bar every prior phase in this backlog holds itself to:
// cash_variance_pattern_guide, channel_mix_guide, controls_food_cost_link_guide,
// conversion_efficiency_guide, custom_report_builder_guide, fob_reference_table_guide,
// item_velocity_guide, labor_opportunity_cost_guide, loss_prevention_summary_guide,
// oil_efficiency_guide, price_change_impact_guide, weather_impact_guide.
//
// Per CLAUDE.md's "would this verification still pass if the change were reverted?" rule: each
// test renders the ACTUAL panel component (not a stand-in), clicks the real "?" InfoIcon control,
// and asserts the real article title appears — reverting either the ReportShell prop or any one
// call site's `articleKey` would make that panel's "?" control vanish (or render the wrong
// article) and the matching test would fail.
import { describe, it, expect, vi, afterEach } from 'vitest';
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
  vi.doUnmock('../lib/supabase.js');
  vi.resetModules();
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

// The InfoIcon's clickable "?" control carries a distinctive title attribute
// ("Click for details: <article title>") — query on that rather than on text content, since the
// visible glyph is just "?".
function clickInfoIcon() {
  const icon = container.querySelector('span[title^="Click for details"]');
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout — ReportShell batch (2026-11-08)', () => {
  it('Cash Variance Pattern (cash_variance_pattern_guide)', async () => {
    const { CashVariancePatternPanel } = await import('../views/cash-variance-pattern.js');
    await act(async () => {
      mountEl(h(CashVariancePatternPanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Cash Variance Pattern — Panel Guide');
  });

  it('Channel Mix (channel_mix_guide)', async () => {
    const { ChannelMixPanel } = await import('../views/channel-mix.js');
    await act(async () => {
      mountEl(h(ChannelMixPanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Channel Mix — Panel Guide');
  });

  it('Controls ↔ Food Cost Linkage (controls_food_cost_link_guide)', async () => {
    const { ControlsFoodCostLinkPanel } = await import('../views/controls-food-cost-link.js');
    await act(async () => {
      mountEl(h(ControlsFoodCostLinkPanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Controls ↔ Food Cost Linkage — Panel Guide');
  });

  it('Conversion Efficiency Ratio (conversion_efficiency_guide)', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadConversionEfficiency: async () => [] };
    });
    const { ConversionEfficiencyPanel } = await import('../views/conversion-efficiency.js');
    await act(async () => {
      mountEl(h(ConversionEfficiencyPanel, { stores: [], onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Conversion Efficiency Ratio — Panel Guide');
  });

  it('Custom Report Builder (custom_report_builder_guide)', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadCustomReports: async () => [] };
    });
    const { CustomReportBuilderPanel } = await import('../views/custom-report-builder.js');
    await act(async () => {
      mountEl(h(CustomReportBuilderPanel, { ds: {}, stores: [], can: () => true, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Custom Report Builder — Panel Guide');
  });

  it('FOB Reference Table (fob_reference_table_guide)', async () => {
    const { FobReferenceTablePanel } = await import('../views/fob-reference-table.js');
    await act(async () => {
      mountEl(h(FobReferenceTablePanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('FOB Reference Table — Panel Guide');
  });

  it('Item Velocity (item_velocity_guide)', async () => {
    const { ItemVelocityPanel } = await import('../views/item-velocity.js');
    await act(async () => {
      mountEl(h(ItemVelocityPanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Item Velocity — Panel Guide');
  });

  it('Labor Opportunity Cost (labor_opportunity_cost_guide)', async () => {
    const { LaborOpportunityCostPanel } = await import('../views/labor-opportunity-cost.js');
    await act(async () => {
      mountEl(h(LaborOpportunityCostPanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Labor Opportunity Cost — Panel Guide');
  });

  it('Loss Prevention Summary (loss_prevention_summary_guide)', async () => {
    const { LossPreventionReportPanel } = await import('../views/loss-prevention-report.js');
    await act(async () => {
      mountEl(h(LossPreventionReportPanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Loss Prevention Summary — Panel Guide');
  });

  it('Oil Efficiency (oil_efficiency_guide)', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadOilEfficiency: async () => [] };
    });
    const { OilEfficiencyPanel } = await import('../views/oil-efficiency.js');
    await act(async () => {
      mountEl(h(OilEfficiencyPanel, { stores: [], onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Oil Efficiency — Panel Guide');
  });

  it('Price Change Impact (price_change_impact_guide)', async () => {
    const { PriceChangeImpactPanel } = await import('../views/price-change-impact.js');
    await act(async () => {
      mountEl(h(PriceChangeImpactPanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Price Change Impact — Panel Guide');
  });

  it('Weather Impact (weather_impact_guide)', async () => {
    const { WeatherImpactPanel } = await import('../views/weather-impact.js');
    await act(async () => {
      mountEl(h(WeatherImpactPanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Weather Impact — Panel Guide');
  });
});
