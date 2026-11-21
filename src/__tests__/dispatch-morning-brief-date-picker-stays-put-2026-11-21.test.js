// @vitest-environment happy-dom
// @ts-nocheck
// Owner report (2026-11-21): "viewing yesterday's results [in the Morning Intelligence Brief]
// is still showing 2 days ago actuals." Root cause: MorningBriefPanel's "re-sync date if ds
// changes" effect called `setBriefDate(getLatestBriefDate(ds))` UNCONDITIONALLY on every `ds`
// reference change — not just the first time real data arrives after mount. `ds` is a brand-new
// object reference on nearly every setDs(prev=>({...prev,...})) call anywhere in App.js
// (background lazy-fills, auto-pull merges, other panels' writes), so ANY one of those firing
// while the user had the date picker manually set to "yesterday" would silently snap the date
// (header included) back to getLatestBriefDate(ds) — whichever date is the LATEST one with any
// real data, which lags behind "yesterday" whenever yesterday's own sync hasn't landed yet. The
// user never touched anything; the panel reverted their own pick out from under them.
//
// Fixed by only letting the auto-resync run until the user makes an explicit pick (a
// `userPickedDate` ref) — same one-time "sync once data arrives" behavior for the pre-hydration
// case, never overriding a choice the user actually made afterward.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MorningBriefPanel } from '../features/morning-brief.js';
import { lastClosedBusinessDay } from '../engine/swing-feed.js';

const LOC = '3708'; // real seed store (constants.js STORE_NAMES)

function isoOf(d) { return d.toISOString().slice(0, 10); }

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(MorningBriefPanel, props)); });
  return { container, root };
}

function dateInput(container) {
  return container.querySelector('input[type="date"]');
}

const setNativeInputValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

async function pickDate(container, isoStr) {
  const input = dateInput(container);
  await act(async () => {
    setNativeInputValue.call(input, isoStr);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

let mounted = [];
afterEach(() => {
  mounted.forEach(({ root, container }) => { act(() => { root.unmount(); }); container.remove(); });
  mounted = [];
  vi.useRealTimers();
});

describe('MorningBriefPanel — a manually picked date survives a later ds refresh (2026-11-21)', () => {
  it('does NOT snap back to a different date when `ds` gets a new reference after the user picks one', async () => {
    const dsV1 = {};
    const r = await mount({ ds: dsV1 });
    mounted.push(r);
    const { container } = r;

    // User explicitly picks a specific date — e.g. "yesterday" — well clear of
    // lastClosedBusinessDay() so getLatestBriefDate's own clamp can't coincidentally land on
    // the same date as the "later data" below and mask a real regression.
    const closed = lastClosedBusinessDay();
    const picked = new Date(closed); picked.setDate(picked.getDate() - 20);
    const pickedIso = isoOf(picked);
    await pickDate(container, pickedIso);
    expect(dateInput(container).value).toBe(pickedIso);

    // Simulate a later, unrelated background sync replacing `ds` with a NEW object reference
    // that now has real data for lastClosedBusinessDay() itself — exactly what an auto-pull
    // merge or lazy-fill completion does elsewhere in App.js, and unambiguously a DIFFERENT
    // date than the one the user picked.
    const dsV2 = { laborRows: [{ loc: LOC, date: closed, sales: 10000 }] };
    await act(async () => { r.root.render(React.createElement(MorningBriefPanel, { ds: dsV2 })); });

    // The user's pick must survive — the panel must not silently revert it.
    expect(dateInput(container).value).toBe(pickedIso);
  });

  it('DOES still auto-sync to the latest available date on the FIRST ds hydration (before any manual pick)', async () => {
    const dsEmpty = {};
    const r = await mount({ ds: dsEmpty });
    mounted.push(r);
    const { container } = r;

    const initialValue = dateInput(container).value;

    // First real hydration — ds goes from empty to having real data, with no user interaction
    // in between. This is the legitimate case the effect exists for.
    const target = new Date();
    target.setDate(target.getDate() - 10); // some date well in the past, unambiguous
    const dsHydrated = { laborRows: [{ loc: LOC, date: target, sales: 7777 }] };
    await act(async () => { r.root.render(React.createElement(MorningBriefPanel, { ds: dsHydrated })); });

    // getLatestBriefDate clamps to lastClosedBusinessDay(), and `target` is 10 days in the
    // past, safely before that clamp — so the panel should now show `target`, not whatever the
    // pre-hydration empty-ds default was.
    expect(dateInput(container).value).toBe(isoOf(target));
    expect(dateInput(container).value).not.toBe(initialValue);
  });
});
