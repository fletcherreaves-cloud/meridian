import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PANELS, SECTIONS, PANEL_BY_ID, panelsForSection, testKitchenPanels, canOpen,
         ORPHANS, VESTIGIAL_STATE } from '../app/panel-registry.js';

// ── Registry integrity ───────────────────────────────────────────────────────
// The registry is only useful if it can't silently drift from the code it describes.
// These tests read App.js and shell.js and assert the registry still matches them, so
// adding a panel without registering it FAILS rather than quietly working in one place
// and not the other — which is exactly how DevDashboard, AIInsightsLog, AnomalyPanel and
// ForecastAudit ended up with render lines nothing could reach.

const APP   = readFileSync(new URL('../app/App.js', import.meta.url), 'utf8');
const SHELL = readFileSync(new URL('../app/shell.js', import.meta.url), 'utf8');

const dispatchIds = () => {
  const i = APP.indexOf('onOpenModal: (modal) => {');
  const seg = APP.slice(i, i + 14000);
  return new Set([...seg.matchAll(/modal\s*===\s*'([a-z0-9:_-]+)'/g)].map(m => m[1]));
};
// Dispatch #54 Job A moved most nav items from literal onOpenModal('id') call sites to
// navP('id')/navPBeta('id') lookups against PANEL_BY_ID -- both forms are real nav entries,
// so both are counted here or this check silently loses its teeth for every migrated item.
const navIds = () =>
  new Set([...SHELL.matchAll(/(?:onOpenModal|navPBeta|navP)\('([a-z0-9:_-]+)'/g)].map(m => m[1]));

describe('registry shape', () => {
  it('has no duplicate ids', () => {
    expect(PANELS.length).toBe(new Set(PANELS.map(p => p.id)).size);
  });

  it('every panel has a label and a known kind and section', () => {
    const kinds = new Set(['nav', 'hub-tab', 'optional', 'test-kitchen', 'internal']);
    const sects = new Set(SECTIONS.map(s => s.id));
    for (const p of PANELS) {
      expect(p.label, p.id).toBeTruthy();
      expect(kinds.has(p.kind), `${p.id} kind=${p.kind}`).toBe(true);
      expect(sects.has(p.section), `${p.id} section=${p.section}`).toBe(true);
    }
  });
});

describe('registry matches the live code', () => {
  it('every nav item in shell.js is registered', () => {
    const missing = [...navIds()].filter(id => !PANEL_BY_ID[id]);
    expect(missing, `nav ids not in the registry: ${missing.join(', ')}`).toEqual([]);
  });

  it('every onOpenModal handler is registered', () => {
    // A handler with no registry entry means a panel that can be opened but that the
    // registry — and therefore the v2 nav — knows nothing about.
    const missing = [...dispatchIds()].filter(id => !PANEL_BY_ID[id] && !id.includes(':'));
    expect(missing, `dispatch ids not in the registry: ${missing.join(', ')}`).toEqual([]);
  });

  it('every registered panel has a dispatch handler', () => {
    // The reverse: a registry entry nothing can open is a dead menu item.
    const d = dispatchIds();
    const orphans = PANELS.filter(p => !d.has(p.id)).map(p => p.id);
    expect(orphans, `registered but unopenable: ${orphans.join(', ')}`).toEqual([]);
  });

  it('optional panels use the labels and icons Panel Manager shows', () => {
    // OPTIONAL_PANELS is what the Panel Manager renders. If the registry disagrees, the
    // same panel is called two different things in two places. (The first cut of this
    // registry titleized the ids — "Pmix", "Aiscan" — and dropped the real labels.)
    const CONST = readFileSync(new URL('../constants.js', import.meta.url), 'utf8');
    const seg = CONST.slice(CONST.indexOf('const OPTIONAL_PANELS'));
    const body = seg.slice(0, seg.indexOf('\n]'));
    const bad = [];
    for (const m of body.matchAll(/id:'([^']+)',\s*label:'([^']+)',\s*icon:'([^']*)'/g)) {
      const [, id, label, icon] = m;
      const p = PANEL_BY_ID[id];
      if (!p) { bad.push(`${id}: missing from registry`); continue; }
      if (p.label !== label) bad.push(`${id}: label registry='${p.label}' constants='${label}'`);
      if (p.icon !== icon) bad.push(`${id}: icon registry='${p.icon}' constants='${icon}'`);
    }
    expect(bad).toEqual([]);
  });

  it('nav items read label/icon/perm from the registry, not a duplicated literal', () => {
    // Dispatch #54 Job A replaced per-item pis('perm','Label','icon', ()=>onOpenModal('id'))
    // literals with navP('id')/navPBeta('id') lookups against PANEL_BY_ID specifically so
    // label/icon/perm can't drift between shell.js and the registry again -- there's only one
    // copy now. This is a ratchet against backsliding: a new hardcoded pis/pi literal for an id
    // already in the registry means the drift this refactor eliminated is creeping back.
    const migrated = new Set([...SHELL.matchAll(/navPBeta?\('([a-z0-9:_-]+)'/g)].map(m => m[1]));
    const relapsed = [...SHELL.matchAll(/pis?\('[a-z.]*',\s*'[^']+',\s*'[^']*',\s*\(\)\s*=>\s*onOpenModal\('([a-z0-9:_-]+)'\)/g)]
      .map(m => m[1]).filter(id => migrated.has(id) || PANEL_BY_ID[id]);
    expect(relapsed, `id(s) re-hardcoded instead of using navP/navPBeta: ${relapsed.join(', ')}`).toEqual([]);
  });

  it('navPBeta has no re-hardcoded literal id call sites (dispatch #61)', () => {
    // Before dispatch #61, ⚗ TEST KITCHEN was a hand-maintained list of literal navPBeta('id')
    // calls in shell.js, and this test asserted every one of them was kind:'test-kitchen' (or a
    // named beta-gated exception outside it: Forecast Brief/Market Intelligence/Store One-Pager,
    // an ordinary kind:'nav' panel hidden under betaMode via renderSection's BETA_HIDDEN_EXTRAS).
    // Derivation removed the literal calls entirely -- shell.js now calls navPBeta(p.id, ...)
    // dynamically inside a .map() over testKitchenPanels(), so "nothing sneaks into Test Kitchen
    // that isn't kind:'test-kitchen'" is true by construction (see the membership test below).
    // What can still regress is a NEW hardcoded navPBeta('literal-id') call reappearing outside
    // that derivation -- exactly how the original list started -- so this guard now just watches
    // for that pattern's return.
    const literalCalls = [...SHELL.matchAll(/navPBeta\('([a-z0-9:_-]+)'/g)].map(m => m[1]);
    expect(literalCalls, `hardcoded navPBeta('id') call(s): ${literalCalls.join(', ')}`).toEqual([]);
    expect(SHELL).toMatch(/testKitchenPanels\(/);
  });

  it('testKitchenPanels() returns exactly the registry\'s kind:\'test-kitchen\' panels, ordered by tkOrder', () => {
    const registryIds = PANELS.filter(p => p.kind === 'test-kitchen').map(p => p.id).sort();
    const derivedIds = testKitchenPanels(() => true).map(p => p.id).sort();
    expect(derivedIds).toEqual(registryIds);

    const orders = testKitchenPanels(() => true).map(p => p.tkOrder);
    expect(orders, 'every test-kitchen panel needs a distinct tkOrder').toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe('every showX has exactly one owner', () => {
  // Panel visibility lives in ~85 `useState` booleans. Each should be openable AND
  // rendered. The two ways that breaks are pinned below so they cannot grow: a new
  // orphan or a new vestigial state fails this suite instead of accumulating quietly.

  const declared = new Set([...APP.matchAll(/const \[(show[A-Za-z0-9]+),\s*set/g)].map(m => m[1]));
  const rendered = new Set([...APP.matchAll(/(show[A-Za-z0-9]+)\s*&&/g)].map(m => m[1]));
  const opened = new Set(
    [...APP.matchAll(/set(Show[A-Za-z0-9]+)\(\s*([^)]*)/g)]
      .filter(m => m[2].trim() !== 'false' && m[2].trim() !== '')
      .map(m => 'show' + m[1].slice(4)));

  it('the set of unreachable panels has not grown', () => {
    const unreachable = [...declared].filter(s => rendered.has(s) && !opened.has(s)).sort();
    expect(unreachable).toEqual(ORPHANS.map(o => o.state).sort());
  });

  it('the set of vestigial state has not grown', () => {
    const vestigial = [...declared].filter(s => !rendered.has(s)).sort();
    expect(vestigial).toEqual([...VESTIGIAL_STATE].sort());
  });

  const live = [...declared].filter(s => rendered.has(s) && opened.has(s));

  it('every openable panel is counted in anyModalOpen', () => {
    // anyModalOpen pauses AtAGlance's recomputation while a panel covers it. A panel
    // missing here means the dashboard keeps recomputing behind it — the exact bug the
    // flag was added to fix. Fifteen panels had drifted out by v4.855.
    const i = APP.indexOf('const anyModalOpen');
    const chain = new Set([...APP.slice(i, i + 2200).matchAll(/(show[A-Za-z0-9]+)/g)].map(m => m[1]));
    const missing = live.filter(s => !chain.has(s)).sort();
    expect(missing, `not in anyModalOpen: ${missing.join(', ')}`).toEqual([]);
  });

  it('AtAGlance/StoreDash/OrgView actually check anyModalOpen, not just define it', () => {
    // v4.212 added anyModalOpen specifically to stop AtAGlance (and StoreDash/OrgView) from
    // fully re-rendering while hidden behind a modal — confirmed via profiler as the dominant
    // cost in a 177-second interaction. The OR-chain itself is guarded by the test above, but
    // that only proves the variable is comprehensive, not that anything reads it. It silently
    // regressed to unused (2026-08-09, found via a real ?clicktrace=1 capture showing the App
    // tree render again dominating interaction time) while the chain-completeness test kept
    // passing the whole time. Anchor on the actual render call sites so "defined but unused"
    // fails loudly instead of quietly reintroducing the original bug.
    const mustGate = [
      /view===['"]command['"]\s*&&\s*!anyModalOpen\s*&&\s*!routePanel\s*&&\s*h\(AtAGlance/,
      /view===['"]store['"]&&selStore&&!anyModalOpen&&!routePanel&&h\(StoreDash/,
      /view===['"]patch['"]&&!anyModalOpen&&!routePanel&&h\(OrgView/,
      /view===['"]org['"]&&!anyModalOpen&&!routePanel&&h\(OrgView/,
    ];
    const missing = mustGate.filter(re => !re.test(APP)).map(re => re.source);
    expect(missing, `render call sites not gated on !anyModalOpen: ${missing.join(', ')}`).toEqual([]);
  });

  it('every openable panel is closed by the Escape hatch', () => {
    // v4.215 added Escape as a universal way out of a stuck modal. That only holds if
    // every panel is listed; sixteen were not by v4.855.
    const j = APP.indexOf("if(e.key!=='Escape') return;");
    const esc = new Set([...APP.slice(j, j + 4000).matchAll(/setShow([A-Za-z0-9]+)\(false\)/g)]
      .map(m => 'show' + m[1]));
    const missing = live.filter(s => !esc.has(s)).sort();
    expect(missing, `not closed by Escape: ${missing.join(', ')}`).toEqual([]);
  });

  it('every other showX is both openable and rendered', () => {
    const known = new Set([...ORPHANS.map(o => o.state), ...VESTIGIAL_STATE]);
    const broken = [...declared].filter(s => !known.has(s) && !(opened.has(s) && rendered.has(s)));
    expect(broken).toEqual([]);
  });
});

describe('route panels (Dispatch27 Workstream E)', () => {
  // route:true panels are URL-synced via src/app/routing.js and render as a full-page view
  // (App.js's routePanel state) instead of a showX-gated modal — see panel-registry.js's field
  // comment and memory/dispatch-27.md for the "would I ever want to send someone a link to
  // this?" rule this implements.
  const ROUTE_IDS = PANELS.filter(p => p.route).map(p => p.id);

  it('is exactly the eleven panels converted so far (Dispatch27 + Dispatch #55 Part B + #106 + #121)', () => {
    // Ratchet, not a ceiling: adding a twelfth route panel is a real routing change (a new
    // App.js render-gate wire-up via goRoute, not a label flip) -- fails loudly so the next
    // one is a deliberate choice, not route:true copy-pasted onto an ordinary modal. The
    // original four (dicompare/fcst-accuracy/proj/report) were Dispatch27 Workstream E;
    // Dispatch #55 Part B (Job C Batch 1) added the other six as the first overlay-to-page
    // conversion batch. Dispatch #105's correction (2026-08-24) briefly grew this to eleven by
    // adding lifelenz-bridge ("MBI vs LifeLenz Accuracy") as its own route:true entry; dispatch
    // #106 Phase B (same day) merged it AND fcst-accuracy into one new route:true entry,
    // 'forecast-reports' (ForecastReportsPanel, an internal-tab shell over both), converting
    // both former entries to kind:'hub-tab' -- net eleven -> ten. Dispatch #121 (2026-08-25)
    // converted 'fcst-ref' (Forecasting Reference) from a small ModalShell+iframe to a real
    // route -- ten -> eleven.
    expect(ROUTE_IDS.slice().sort()).toEqual([
      'count-cycle', 'dicompare', 'eom-dashboard', 'fcst-ref', 'fob-analysis', 'fob-eom',
      'forecast-reports', 'perf-reviews', 'proj', 'report', 'sched-hub',
    ]);
  });

  it('every route panel is opened via goRoute(...), not a showX(true) call', () => {
    for (const id of ROUTE_IDS) {
      const re = new RegExp(`goRoute\\('${id}'\\)`);
      expect(re.test(APP), `${id}: no goRoute('${id}') call site found in App.js`).toBe(true);
    }
  });

  it('every route panel renders under a routePanel===id gate, not a showX one', () => {
    for (const id of ROUTE_IDS) {
      const re = new RegExp(`routePanel===['"]${id}['"]`);
      expect(re.test(APP), `${id}: no routePanel==='${id}' render gate found in App.js`).toBe(true);
    }
  });

  it('every route panel\'s DEEP LINK reaches its route -- modal===id and goRoute(id) in the same branch', () => {
    // The gap the two tests above cannot see, and the exact failure mode dispatch #55 Part B
    // named as primary: "a conversion that renders the panel but breaks its deep link."
    // Those tests only prove goRoute('id') and routePanel==='id' exist SOMEWHERE in App.js.
    // Delete the `modal==='id'` branch entirely and both still pass -- the panel opens fine
    // from the nav while every saved link, bookmark and in-app deep link to it silently does
    // nothing. This asserts the two halves are actually connected: the modal-dispatch branch
    // for an id calls goRoute for THAT SAME id.
    //
    // Verified 2026-08-21 against all ten route panels, the original four (Dispatch27) as well
    // as Part B's six -- every one already pairs correctly, so this is a ratchet on working
    // behaviour rather than a fix. App.js has no render-level test harness (nothing in
    // src/__tests__ mounts it, checked), so this source-level pairing is the strongest
    // available check short of building one; it is strictly more than the existence tests
    // above, not a substitute for a real render.
    const unpaired = ROUTE_IDS.filter(id => {
      const re = new RegExp(`modal===['"]${id}['"][^\\n]*goRoute\\('${id}'\\)`);
      return !re.test(APP);
    });
    expect(unpaired, `deep link broken -- modal===<id> branch does not call goRoute(<id>): ${unpaired.join(', ')}`).toEqual([]);
  });

  it('Dispatch #55 Part B: no setShowX(true) call site survives for the six converted booleans', () => {
    // The exact regression class the dispatch calls out: a panel that renders fine via its new
    // routePanel gate while a stale setShowX(true) call site sits unnoticed elsewhere (the #366
    // shape -- engine right, call site unwired, just inverted). A working render is not proof the
    // old modal-open path was actually removed; grep for it directly.
    const REMOVED_SETTERS = [
      'setShowSchedHub', 'setShowPerfReviews', 'setShowFOB', 'setShowFOBEOM',
      'setShowEOMDash', 'setShowCountCycle',
    ];
    const stillCalledTrue = REMOVED_SETTERS.filter(fn => new RegExp(`${fn}\\(\\s*true\\s*\\)`).test(APP));
    expect(stillCalledTrue, `stale setX(true) call site(s): ${stillCalledTrue.join(', ')}`).toEqual([]);
    // And the state itself should be gone entirely -- not just unused -- since nothing else in
    // this batch needs the modal-visibility boolean once the panel is routed.
    const stillDeclared = REMOVED_SETTERS.filter(fn => new RegExp(`const \\[show${fn.slice(7)},\\s*${fn}\\]`).test(APP));
    expect(stillDeclared, `stale useState declaration(s): ${stillDeclared.join(', ')}`).toEqual([]);
  });
});

describe('helpers', () => {
  it('panelsForSection returns only nav panels the caller may see', () => {
    const admin = panelsForSection('operations', () => true);
    const none  = panelsForSection('operations', () => false);
    expect(admin.length).toBeGreaterThan(0);
    expect(admin.every(p => p.kind === 'nav')).toBe(true);
    // Every Operations panel is permission-gated, so a caller with no perms sees none.
    expect(none.length).toBe(0);
  });

  it('test-kitchen panels are excluded unless asked for', () => {
    const off = PANELS.filter(p => p.kind === 'test-kitchen')
      .every(p => !panelsForSection(p.section, () => true).includes(p));
    expect(off).toBe(true);
  });

  it('canOpen is false for an unknown id rather than permissive', () => {
    // Failing open here would let a typo bypass permissions entirely.
    expect(canOpen('definitely-not-a-panel', () => true)).toBe(false);
  });

  it('canOpen honours the permission', () => {
    const gatedPanel = PANELS.find(p => p.perm);
    expect(canOpen(gatedPanel.id, () => false)).toBe(false);
    expect(canOpen(gatedPanel.id, () => true)).toBe(true);
  });
});
