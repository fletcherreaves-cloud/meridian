// @ts-nocheck
// Owner feedback on Game Plan (2026-11-11, live): "For supervisor view, lets add the locations
// when calling out 1 of 3 stores and so on" + "Your Week So Far ... If that is due to it being
// Wednesday (1st day of work week), then we need to rethink what to put here for this instance."
//
// The real root cause of the second report (reproduced here, not guessed): CuratedHomePanel's
// `format` state is initialized once from localStorage and only ever OVERWRITTEN -- never reset
// -- by a later effect keyed on [altitude, operatorGroup]. Switching View As Role from a
// store-altitude role (where a prior session had chosen the 'gameplan' format) to a
// patch-altitude role (Area Supervisor/OM/DO) re-renders the SAME component instance with a new
// `altitude`, but never remounts it, so the stale 'gameplan' format survived. GamePlanFormat's
// "Your Week So Far" needs a single store (`loc`), which only ever resolves at store altitude
// (`myStore`) -- at patch altitude it's always undefined, so the week card was PERMANENTLY stuck
// on "Not enough closed days", regardless of what day of the week it was. Fixed by deriving
// `effectiveFormat` fresh on every render (falls back to the altitude's own default the instant
// the stale one no longer fits), rather than trusting carried-over state.
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadUserSettingMock = vi.fn();
const saveUserSettingMock = vi.fn();
vi.mock('../lib/supabase.js', () => ({
  loadUserSetting: (...args) => loadUserSettingMock(...args),
  saveUserSetting: (...args) => saveUserSettingMock(...args),
  loadInvCountSessions: async () => [],
  saveRecommendation: async () => ({ saved: 0, errors: [] }),
}));

function flag(id, over) {
  return { id, name: id, icon: '💰', category: 'controls', severity: 'RED',
    headline: `${id} headline`, detail: `${id} detail`, action: `${id} action`, ...over };
}
let BRIEF_FIXTURE;
function freshBrief() {
  return {
    stores: [
      { loc: '3708', name: 'Ardmore-Broadway', hasData: true,
        flags: [flag('CASH_OS', { severity: 'RED', headline: 'Cash O/S short by $105.84' })] },
      { loc: '5183', name: 'Chickasha', hasData: true,
        flags: [flag('CASH_OS', { severity: 'RED', headline: 'Cash O/S short by $12.00' })] },
      { loc: '9999', name: 'Durant-US Hwy 70/22', hasData: true, flags: [] },
    ],
    summary: { red: 2, amber: 0, green: 1, noData: 0, totalFlags: 2 },
  };
}
vi.mock('../features/morning-brief.js', () => ({
  computeMorningBrief: () => BRIEF_FIXTURE,
  getLatestBriefDate: () => new Date('2026-11-06T12:00:00'),
  useBriefDarByLoc: () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CuratedHomePanel } = await import('../views/curated-home.js');
const { GamePlanFormat } = await import('../views/game-plan-view.js');

let container, root;
beforeEach(() => {
  BRIEF_FIXTURE = freshBrief();
  loadUserSettingMock.mockReset().mockResolvedValue(null);
  saveUserSettingMock.mockReset().mockResolvedValue(undefined);
  try { localStorage.clear(); } catch {}
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('View As Role altitude switch no longer strands a stale Game Plan format (owner bug report 2026-11-11)', () => {
  it('a GM-altitude session that had picked Game Plan, then switched to a patch-altitude role WITHOUT remounting, lands on The Patch (not a permanently empty Game Plan week)', async () => {
    localStorage.setItem('mf_curated_home_format', 'gameplan');
    await act(async () => {
      root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'gm', darRows: [] }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    // Confirms Game Plan really was active at store altitude (the stale value this bug relies on).
    expect(container.textContent).toContain("Today's one thing");

    // area_supervisor, not 'do'/'om' -- those two cascading-scope roles (2026-11-12) now default
    // to The Ledger instead of The Patch (see curated-home-operator-ledger.test.js), so this
    // regression test uses the one patch-altitude role that still lands on The Patch.
    await act(async () => {
      root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'area_supervisor', darRows: [] }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).toContain('Your Patch');
    expect(container.textContent).not.toContain('Not enough closed days');
    expect(container.textContent).not.toContain("Today's one thing");
  });

  it('the same stale-format switch to a cascading-scope role (do/om/vp) lands on The Ledger instead, never the stranded Game Plan', async () => {
    localStorage.setItem('mf_curated_home_format', 'gameplan');
    await act(async () => {
      root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'gm', darRows: [] }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).toContain("Today's one thing");

    await act(async () => {
      root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'do', darRows: [] }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).not.toContain("Today's one thing");
    expect(container.textContent).not.toContain('Your Patch');
    expect(container.textContent).toContain('Your restaurants, right now'); // The Ledger's own section heading
  });
});

describe('"N of M stores" items name the actual stores (owner feedback 2026-11-11)', () => {
  it('a multi-store pattern item in the "things worth a few minutes" list shows its real store-name pills, not just a bare count', async () => {
    const items = [{
      id: 'CASH_OS', ruleId: 'CASH_OS', severity: 'RED', category: 'controls', icon: '💰',
      headline: '2 of 3 stores in your patch are flagging Cash Over/Short Variance',
      detail: 'Reconcile drawer counts.', action: 'Investigate.',
      scope: 'patch', storesAffected: ['Ardmore-Broadway', 'Chickasha'],
    }];
    await act(async () => {
      root.render(React.createElement(GamePlanFormat, {
        ds: {}, loc: null, storeName: null, items, summary: { totalFlags: 1 }, userName: 'Ashley',
      }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Chickasha');
  });
});
