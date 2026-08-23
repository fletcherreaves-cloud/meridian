// @vitest-environment happy-dom
// @ts-nocheck
// SMG VOICE Performance tab: the period dropdown offered periods that had no rows for the
// report_type currently selected.
//
// SMG publishes three report types from the same PDFs -- 'monthly', 'trailing90', 'ytd'
// (src/parsers/index.js:2071) -- and they do not cover the same periods. The period list was
// built from every row regardless of type, while the table body filters on BOTH period and
// report_type. So selecting a trailing90-only period while on 'monthly' rendered an empty table
// with no explanation, and because periods[0] is the default selection, the tab could open blank
// even with monthly data present.
//
// Owner-reported 2026-08-23: "guest voice either not populating or not letting me select past
// July." This covers the not-populating half.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SMGVoicePanel } from '../views/smg-voice.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const row = (period, report_type, loc, dt_sat) =>
  ({ period, report_type, loc, loc_name: 'Store ' + loc, dt_sat, ir_sat: 80, operator_name: 'X' });

// trailing90 reaches a LATER period than monthly -- the exact shape that made the tab open blank.
const VOICE_PERF = [
  row('2026-07', 'monthly', '03708', 76),
  row('2026-07', 'monthly', '05183', 71),
  row('2026-06', 'monthly', '03708', 74),
  row('2026-08', 'trailing90', '03708', 79),
  row('2026-08', 'trailing90', '05183', 72),
];

function renderVoice() {
  act(() => root.render(React.createElement(SMGVoicePanel, {
    ds: { smgVoicePerf: VOICE_PERF }, stores: ['03708', '05183'],
    voicePerf: VOICE_PERF, voiceDaypart: [], onClose: () => {},
  })));
}

const periodOptions = () => [...host.querySelectorAll('option')].map(o => o.value).filter(v => /^\d{4}-\d{2}$/.test(v));

describe('SMG VOICE period list is scoped to the selected report type', () => {
  it('says on screen that the newest available period is behind the current month', () => {
    // The other half of the owner's report -- "not letting me select past July" -- was the picker
    // behaving correctly with no way to tell. A dropdown whose newest entry is months old looks
    // identical to one that has gone stale, so the panel now states which it is.
    renderVoice();
    expect(host.textContent).toContain('newest available');
    expect(host.textContent).toMatch(/Jul.*2026/);
  });

  it('does not offer a period that only exists under a different report type', () => {
    renderVoice();
    const opts = periodOptions();
    // Default type is 'monthly'. 2026-08 exists ONLY as trailing90 -- offering it would render
    // an empty table, which is exactly what the owner saw.
    expect(opts).not.toContain('2026-08');
    expect(opts).toContain('2026-07');
  });

  it('the default selection resolves to a period that actually has rows', () => {
    renderVoice();
    // periods[0] drives the default. Under the bug it was 2026-08 (trailing90) and the monthly
    // table rendered nothing; the store names below only appear if rows resolved.
    expect(host.textContent).toContain('Store 03708');
  });
});
