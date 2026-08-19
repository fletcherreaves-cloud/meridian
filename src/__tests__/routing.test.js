// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch27 Workstream E — URL-sync routing for the four panels panel-registry.js marks
// route:true. Before this file existed, App.js had zero history.pushState/window.location/
// router usage anywhere — "route" meant a React state variable with no URL sync at all, so
// refreshing the page or sharing a link always landed on the default view. These tests exercise
// the pure query-param logic directly (parseRoute/isRoutePanelId/pushRoute/onRouteChange), same
// pattern as the rest of src/app/ — dependency-free, testable without mounting React.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isRoutePanelId, parseRoute, pushRoute, onRouteChange, currentRoute } from '../app/routing.js';

describe('isRoutePanelId', () => {
  it('is true for each of the four registered route panels', () => {
    for (const id of ['dicompare', 'fcst-accuracy', 'proj', 'report']) {
      expect(isRoutePanelId(id), id).toBe(true);
    }
  });

  it('is false for an ordinary modal panel, an unknown id, and null/undefined', () => {
    expect(isRoutePanelId('settings')).toBe(false);   // a real panel, but not route:true
    expect(isRoutePanelId('not-a-real-panel')).toBe(false);
    expect(isRoutePanelId(null)).toBe(false);
    expect(isRoutePanelId(undefined)).toBe(false);
  });
});

describe('parseRoute', () => {
  it('reads a valid route panel id out of a query string', () => {
    expect(parseRoute('?panel=dicompare')).toBe('dicompare');
    expect(parseRoute('panel=report')).toBe('report'); // URLSearchParams tolerates a missing leading "?"
  });

  it('fails safe to null for a missing, unknown, or non-route panel id', () => {
    // A stale link, a typo, or someone hand-editing the query string must never resolve to
    // "whatever string happened to be there" -- only a value the registry actually marks
    // route:true is trusted.
    expect(parseRoute('')).toBeNull();
    expect(parseRoute('?other=1')).toBeNull();
    expect(parseRoute('?panel=not-a-real-panel')).toBeNull();
    expect(parseRoute('?panel=settings')).toBeNull(); // a real panel, but a modal, not a route
  });

  it('ignores unrelated query params alongside a valid one', () => {
    expect(parseRoute('?debug=1&panel=proj&x=2')).toBe('proj');
  });
});

describe('pushRoute + onRouteChange (jsdom/happy-dom History API)', () => {
  const originalUrl = location.href;
  beforeEach(() => { history.replaceState(null, '', originalUrl); });
  afterEach(() => { history.replaceState(null, '', originalUrl); });

  it('pushRoute sets the panel query param and currentRoute reflects it', () => {
    expect(currentRoute()).toBeNull();
    pushRoute('dicompare');
    expect(currentRoute()).toBe('dicompare');
    expect(location.search).toContain('panel=dicompare');
  });

  it('pushRoute(null) clears the panel query param', () => {
    pushRoute('report');
    expect(currentRoute()).toBe('report');
    pushRoute(null);
    expect(currentRoute()).toBeNull();
    expect(location.search).not.toContain('panel=');
  });

  it('pushRoute never calls history.back() -- every navigation (open AND close) is a new pushed entry', () => {
    // The real reason this matters: closing a route panel that was reached via a deep link
    // (no prior in-app history entry in this tab) must never navigate the user OUT of the app.
    // Asserting on history.length is the only externally-observable proof pushRoute always
    // PUSHES rather than sometimes going back.
    const before = history.length;
    pushRoute('proj');
    pushRoute(null);
    expect(history.length).toBe(before + 2);
  });

  it('onRouteChange re-derives state from location.search on popstate, not from event.state', () => {
    pushRoute('fcst-accuracy');
    let seen = null;
    const unsub = onRouteChange(id => { seen = id; });
    // Simulate a real back-navigation: the URL changes first (as the browser would do),
    // THEN popstate fires -- the listener must read the NEW location, not stale state.
    history.replaceState(null, '', originalUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(seen).toBeNull();
    unsub();
  });

  it('onRouteChange returns an unsubscribe function that actually stops listening', () => {
    let calls = 0;
    const unsub = onRouteChange(() => { calls++; });
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(calls).toBe(1);
    unsub();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(calls).toBe(1);
  });
});
