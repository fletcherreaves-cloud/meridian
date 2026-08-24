// @ts-nocheck
// Dispatch27 Workstream E — URL-sync routing for panels that are DESTINATIONS, not
// interruptions (memory/dispatch-27.md's rule: "would I ever want to send someone a link to
// this?"). Confirmed before this file existed: zero history.pushState/window.location/router
// usage anywhere in App.js — "route" meant nothing more than a React `view` state variable with
// no URL sync, so refreshing the page or sending someone a link always landed on the default
// view regardless of what was open. This is new, dependency-free infrastructure (a single query
// param is all four currently-misclassified panels need — no router library), not a relabeling
// of an existing mechanism.
//
// Scope: ONLY the panels panel-registry.js marks `route:true` (originally: dicompare,
// fcst-accuracy, proj, report — the four the plan specifically flags as misclassified
// destinations; fcst-accuracy was later folded into forecast-reports by dispatch #106 Phase B,
// alongside lifelenz-bridge, which had separately grown route:true under dispatch #105). Every
// other panel stays exactly what it is: a modal, opened by state, with no URL footprint. Most
// current modals ARE correctly modals (confirm/pick/log/quick-edit) — this is not a mandate to
// route everything, and adding `route:true` to a panel is a real routing change, not a label.

import { PANEL_BY_ID } from './panel-registry.js';

const PARAM = 'panel';

// A route id is valid only if the registry marks it route:true — an unknown or non-route value
// in the URL (a stale link, a typo, someone hand-editing the query string) fails safe to "no
// route" rather than to whatever string happened to be there.
export function isRoutePanelId(id) {
  const p = id != null ? PANEL_BY_ID[id] : null;
  return !!(p && p.route);
}

// Reads the current route panel id from a location.search-shaped string (or an empty one).
export function parseRoute(search) {
  const id = new URLSearchParams(search || '').get(PARAM);
  return isRoutePanelId(id) ? id : null;
}

// Pushes (panelId set) or clears (panelId null) the route param via the standard History API —
// no external router. Always PUSHES a new entry (never replaces) for both directions, so the
// mental model stays simple and safe: real browser back/forward is the only thing that ever
// navigates to a PRIOR entry, driven entirely by onRouteChange's popstate listener below —
// closing a route panel never calls history.back() itself, which would leave the app entirely
// on a deep link with no prior in-app history (e.g. a freshly opened tab on a shared URL).
export function pushRoute(panelId) {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  const url = new URL(location.href);
  if (panelId) url.searchParams.set(PARAM, panelId);
  else url.searchParams.delete(PARAM);
  history.pushState({ [PARAM]: panelId || null }, '', url.toString());
}

// Subscribes to back/forward navigation. The URL is the single source of truth for route
// state — re-derive it from location.search on every popstate rather than trusting
// event.state, so this also recovers correctly on a page that was reloaded mid-route
// (event.state is null on first load, but location.search is always accurate).
export function onRouteChange(cb) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb(parseRoute(location.search));
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}

// Initial route on mount — same "fail safe to null" rule as parseRoute.
export function currentRoute() {
  return typeof location === 'undefined' ? null : parseRoute(location.search);
}
