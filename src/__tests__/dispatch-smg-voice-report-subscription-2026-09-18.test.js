// @vitest-environment happy-dom
// @ts-nocheck
// Backlog: "Custom reports for non-QSRSoft panels (SMG/Voice, LifeLenz, calendars) — PACE done
// as first slice, rest open." This is the SMG VOICE slice: a saved report-subscription launch
// (My Reports) needs to land SMGVoicePanel pre-scoped to whatever the saved report says, the
// same way it already does for Calendar (setCalInitScope) and Visit Readiness (initialScope).
// SMGVoicePanel previously had no `initialScope` prop at all -- a saved SMG VOICE report would
// always open unscoped ("All"), silently dropping the whole point of saving one.
//
// Per "would this verification still pass if reverted?": SMGVoicePanel ignored a prop named
// initialScope before this change (there was nothing reading it), so the 'fl'-scoped assertion
// below fails against the old code -- both stores would render regardless of the prop.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SMGVoicePanel } from '../views/smg-voice.js';
import { REPORTS } from '../views/report-subscriptions.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

// 6178 = Chipley-St Rd 77 (FL), 3708 = Ardmore-Broadway (OK) -- real INV_ORG_COORDS entries.
const row = (loc, loc_name) => ({ period: '2026-07', report_type: 'monthly', loc, loc_name, dt_sat: 80, ir_sat: 80, operator_name: 'X' });
const VOICE_PERF = [row('6178', 'Chipley-St Rd 77'), row('3708', 'Ardmore-Broadway')];

function renderVoice(initialScope) {
  act(() => root.render(React.createElement(SMGVoicePanel, {
    ds: { smgVoicePerf: VOICE_PERF }, stores: ['6178', '3708'],
    voicePerf: VOICE_PERF, voiceDaypart: [], initialScope, onClose: () => {},
  })));
}

describe('SMGVoicePanel initialScope (My Reports saved subscription)', () => {
  it('with no initialScope, both stores are visible (unscoped default, unchanged behavior)', () => {
    renderVoice(undefined);
    expect(host.textContent).toContain('Chipley-St Rd 77');
    expect(host.textContent).toContain('Ardmore-Broadway');
  });

  it("with initialScope:'fl', only the FL store renders", () => {
    renderVoice('fl');
    expect(host.textContent).toContain('Chipley-St Rd 77');
    expect(host.textContent).not.toContain('Ardmore-Broadway');
  });

  it("with initialScope:'ok', only the OK store renders", () => {
    renderVoice('ok');
    expect(host.textContent).not.toContain('Chipley-St Rd 77');
    expect(host.textContent).toContain('Ardmore-Broadway');
  });

  it("with a store-level initialScope (a loc, not 'all'/'ok'/'fl'/'grp:'), only that store renders", () => {
    renderVoice('6178');
    expect(host.textContent).toContain('Chipley-St Rd 77');
    expect(host.textContent).not.toContain('Ardmore-Broadway');
  });
});

describe('report-subscriptions.js REPORTS registry', () => {
  it('lists SMG VOICE alongside the already-shipped Calendar and Visit Readiness (PACE) reports', () => {
    expect(REPORTS.map(r => r.key)).toEqual(expect.arrayContaining(['above-store', 'calendar', 'visit-readiness', 'smg-voice']));
    const smg = REPORTS.find(r => r.key === 'smg-voice');
    expect(smg.label).toMatch(/SMG/i);
  });
});
