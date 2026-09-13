// @vitest-environment happy-dom
// @ts-nocheck
// crewHrs auto-first (2026-09-13) — closes the one gap dispatch #324's own comment in
// labor-tools.js left open: "crewHrs has NO metric-source.js entry anywhere (no auto source
// registered, opsLaborRows included)". opsLaborRows (qsr_labor_summary, via
// loadOpsLaborSummary) already carried the raw crew_labor_hours figure — measured live before
// trusting it (the pull script's own COLS_LABOR_SUM constant spells it camelCase
// 'crewLaborHours', but the real JSONB key stored is snake_case 'crew_labor_hours' — a wrong
// assumption this session caught before shipping, not after). loadOpsLaborSummary now aliases
// it to camelCase `crewHrs`, matching every sibling chain off the same loader (otHrs/otDollar).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { METRIC_SOURCES, metricAvg } from '../engine/metric-source.js';
import { LaborAnalyticsPanel } from '../views/labor-tools.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';
const days = [1, 3, 6].map(n => new Date(Date.now() - n * 864e5));
const range = { s: new Date(Date.now() - 10 * 864e5), e: new Date() };

describe('crewHrs METRIC_SOURCES chain', () => {
  it('is registered, positive-only, opsLaborRows auto-first then ctrlRows manual fallback', () => {
    expect(METRIC_SOURCES.crewHrs).toBeTruthy();
    expect(METRIC_SOURCES.crewHrs.mode).toBe('pos');
    expect(METRIC_SOURCES.crewHrs.srcs).toEqual([['opsLaborRows', 'crewHrs'], ['ctrlRows', 'crewHrs']]);
  });

  it('resolves from opsLaborRows (the auto QSRSoft labor-summary stream) with no manual upload present', () => {
    const ds = { opsLaborRows: days.map(d => ({ loc: LOC, date: d, crewHrs: 186.5 })) };
    expect(metricAvg(ds, LOC, range, 'crewHrs')).toBeCloseTo(186.5, 5);
  });

  it('falls back to manual ctrlRows when opsLaborRows has nothing for that loc/range', () => {
    const ds = { ctrlRows: days.map(d => ({ loc: LOC, date: d, crewHrs: 150 })) };
    expect(metricAvg(ds, LOC, range, 'crewHrs')).toBeCloseTo(150, 5);
  });

  it('opsLaborRows wins over ctrlRows when both cover the same day (auto-first, not auto-only)', () => {
    const ds = {
      opsLaborRows: days.map(d => ({ loc: LOC, date: d, crewHrs: 186.5 })),
      ctrlRows: days.map(d => ({ loc: LOC, date: d, crewHrs: 999 })),
    };
    expect(metricAvg(ds, LOC, range, 'crewHrs')).toBeCloseTo(186.5, 5);
  });
});

describe('LaborAnalyticsPanel — a store resolving ONLY crewHrs (no other metric, no manual rows) is not dropped', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('renders the store instead of hitting the empty-state screen', () => {
    // Deliberately isolates crewHrs: no sales/tpph/otHrs/actHrs/etc anywhere, so before this
    // dispatch's hasAnyMetric update the store would have been dropped by the inclusion gate
    // even though its one resolvable metric is real, auto-sourced data.
    const ds = { opsLaborRows: days.map(d => ({ loc: LOC, date: d, crewHrs: 186.5 })) };
    act(() => {
      root.render(React.createElement(LaborAnalyticsPanel, {
        stores: [{ loc: LOC }], ds, settings: {}, onClose: () => {}, embedded: true,
      }));
    });
    const text = container.textContent;
    expect(text).not.toContain('No Labor Data Loaded');
    expect(text).not.toContain('No labor data for this period and location');
    expect(text).toContain('3708');
  });
});
