// @vitest-environment happy-dom
// @ts-nocheck
// Phase 0 (2/2) of memory/project-events-calendar-redesign-2026-09-04.md: AIBacktestScanner's
// ("Anomaly Scanner", analytics.js) auto-holiday-tagging used to write an org_events row for
// every holiday-flagged anomaly on every scan, purely so the review-queue filters would exclude
// it -- the same "holidays are a rule, not data" anti-pattern #197 Slice 1 already retired the
// automatic-on-load version of. isHoliday() is definitive on its own; the classification logic
// (tagCounts/tabRows/sortedRows' filters, renderRow's isT) now reads `row.isHoliday` directly
// instead of requiring a persisted tag.
//
// Per "would this verification still pass if reverted?": mounts the REAL AIBacktestScanner,
// runs a REAL scan (not a mocked results object) against a fixture with exactly one anomaly --
// a $0-sales day that lands on a real holiday (Independence Day) -- and asserts onTagEvent is
// NEVER called for it, while the UI still correctly classifies it as reviewed (Tagged count
// includes it, Needs Review count excludes it, isT-driven row affordances read as "already
// handled"). A revert to the old write-then-classify-off-the-write shape would either call
// onTagEvent (failing the "never called" assertion) or misclassify the row as needing review
// (failing the tab-count assertions) once that write path no longer exists.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { AIBacktestScanner } from '../views/analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708'; // Ardmore-Broadway, real STORE_NAMES entry (used elsewhere in this suite)

function isoDate(y, m, d) { return new Date(y, m - 1, d, 12, 0, 0); }

function buildQsrActSummaryRows() {
  const rows = [];
  // 70 consecutive days, 2026-06-01 .. 2026-08-09 -- entirely before the scanner's own
  // "skip last 2 weeks" cutoff (real system date is 2026-09-04, see date -u), giving every DOW
  // bucket ~10 candidate days (well above the 4-row minimum) and 70 positive-sales days (above
  // the 21-row minimum for a baseline at all). Every day is a steady $8,500 except 2026-07-04
  // (Independence Day, a fixed HOLIDAY_MAP date -- src/utils/holidays.js), dropped to $3,000 --
  // a ~65% deviation, well past the default 8% threshold. NOT $0: metric-source.js's 'sales'
  // chain drops a zero value as "no data" rather than a real reading (the same allowZero
  // convention CLAUDE.md documents for other metrics), so a $0 day here would silently vanish
  // from the scan entirely -- an unrelated quirk, not something this fix touches.
  const start = isoDate(2026, 6, 1);
  for (let i = 0; i < 70; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const isJuly4 = d.getMonth() === 6 && d.getDate() === 4;
    rows.push({ loc: LOC, date: d, sales: isJuly4 ? 3000 : 8500, gc: isJuly4 ? 300 : 850 });
  }
  return rows;
}

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('AIBacktestScanner -- holiday anomalies classify as reviewed without persisting a tag', () => {
  let container, root, onTagEvent;

  beforeEach(() => {
    localStorage.clear();
    ({ container, root } = mountRoot());
    onTagEvent = vi.fn();
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); });

  async function renderAndScan() {
    const ds = { loaded: true, storeIds: [LOC], qsrActSummaryRows: buildQsrActSummaryRows() };
    await act(async () => {
      root.render(React.createElement(AIBacktestScanner, {
        stores: [{ loc: LOC, name: 'Test Store' }], ds, settings: {}, userEvents: {}, onTagEvent,
      }));
    });
    const scanBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Run Scan'));
    expect(scanBtn, 'Run Scan button not found').toBeTruthy();
    await act(async () => {
      scanBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    });
  }

  it('never calls onTagEvent for the holiday anomaly (no row materialized)', async () => {
    await renderAndScan();
    expect(container.textContent).toContain('🎉 Holidays (1)');
    expect(onTagEvent).not.toHaveBeenCalled();
  });

  it('counts the holiday anomaly as Tagged and excludes it from Needs Review, with no persisted tag', async () => {
    await renderAndScan();
    expect(container.textContent).toContain('📋 All (1)');
    expect(container.textContent).toContain('✅ Tagged (1)');
    expect(container.textContent).toContain('❓ Needs Review (0)');
  });

  it("renders the holiday row's action button as already-handled (Edit, no AI-lookup offer)", async () => {
    await renderAndScan();
    // No persisted tag exists (onTagEvent was never called), yet the row must not offer the
    // "📌 Tag" affordance a genuinely-unreviewed anomaly would show.
    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(buttons).not.toContain('📌 Tag');
    expect(buttons.some(t => t.includes('✏ Edit'))).toBe(true);
  });
});
