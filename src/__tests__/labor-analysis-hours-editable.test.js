// @vitest-environment happy-dom
// @ts-nocheck
// backlog-open-2026-09-06.md: "Labor Analysis Config tab's hours-of-operation editor is still
// read-only (only the maint/prep/lobby fixed-hours inputs are editable)." The per-day hours
// figure (Mon-Sun) was rendered as a plain joined string; now editable per day, matching the
// existing maint/prep/lobby inputs' pattern (edit state -> saveStoreLaborConfig on Save).
//
// Renders the REAL LaborAnalysisPanel -> Config tab call site (this repo's "verification must
// touch the call site" rule), not just a helper function in isolation.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let savedRows = null;
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadLifeLenzSchedule: () => Promise.resolve([]),
    loadLifeLenzLaborWeek: () => Promise.resolve({ weekStart: null, rows: {} }),
    // Store 3708 already has a deciphered hours-of-operation blob -- Mon=10, the rest null
    // (undeciphered/not open), matching a real partially-filled sheet.
    loadStoreLaborConfig: () => Promise.resolve({
      3708: {
        loc: '3708', is24hr: false, maintHours: 4, maintPeople: 1, maintDaysOff: 'Mon',
        prepHours: 2, lobbyHours: 1,
        hours: { mon: { open: 0.25, close: 0.6667, hours: 10 }, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
      },
    }),
    saveStoreLaborConfig: (configs) => { savedRows = configs; return Promise.resolve({ saved: configs.length, errors: [] }); },
  };
});

const { LaborAnalysisPanel } = await import('../views/labor-analysis.js');
const h = React.createElement;

describe('Labor Analysis Config tab — hours-of-operation is editable (2026-09-08)', () => {
  let container, root;
  beforeEach(() => {
    savedRows = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  async function renderConfigTab() {
    await act(async () => {
      root.render(h(LaborAnalysisPanel, { ds: {}, settings: {}, onClose: () => {}, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const configBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Config');
    await act(async () => { configBtn.click(); });
  }

  // Rows are sorted (FL/OK then alphabetically) — 3708 isn't necessarily first, so find its
  // own <tr> by the store-number badge rather than assuming row order.
  function row3708() {
    return Array.from(container.querySelectorAll('tbody tr')).find(tr => tr.textContent.includes('#3708'));
  }

  it('renders the Monday hours-of-operation figure in an editable input, not plain text', async () => {
    await renderConfigTab();
    const monInput = row3708().querySelector('input[title="Mon"]');
    expect(monInput).toBeTruthy();
    expect(monInput.value).toBe('10');
  });

  it('editing one day and saving preserves the OTHER days already on file, not just the changed one', async () => {
    await renderConfigTab();
    const monInput = row3708().querySelector('input[title="Mon"]');
    await act(async () => {
      monInput.dispatchEvent(new Event('focusin', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(monInput, '11');
      monInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Save config');
    await act(async () => { saveBtn.click(); });

    expect(savedRows).not.toBeNull();
    const row = savedRows.find(r => String(r.loc) === '3708');
    expect(row).toBeTruthy();
    // The edited day changed...
    expect(row.hours.mon.hours).toBe(11);
    // ...but Monday's own open/close (untouched by this edit) and the OTHER 6 days survive —
    // the exact bug a naive "only send the changed day" implementation would produce.
    expect(row.hours.mon.open).toBeCloseTo(0.25);
    expect(row.hours.mon.close).toBeCloseTo(0.6667);
    expect(Object.keys(row.hours)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });

  it('a store with no deciphered hours yet renders empty editable boxes, not a crash', async () => {
    await renderConfigTab();
    // Any other real store (not 3708, which the mock seeds) has no `hours` on file at all.
    const inputs = Array.from(container.querySelectorAll('input[title="Tue"]'));
    expect(inputs.length).toBeGreaterThan(1);
    // 3708's own Tuesday (undeciphered in the fixture) reads empty, not a stray "null" string.
    for (const inp of inputs) expect(inp.value === '' || /^\d+(\.\d+)?$/.test(inp.value)).toBe(true);
  });
});
