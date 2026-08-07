import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PANELS, SECTIONS, PANEL_BY_ID, panelsForSection, canOpen,
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
const navIds = () =>
  new Set([...SHELL.matchAll(/onOpenModal\('([a-z0-9:_-]+)'\)/g)].map(m => m[1]));

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

  it('permissions agree with what shell.js gates on', () => {
    // Guards against the registry granting access the current nav withholds.
    const gated = [...SHELL.matchAll(/pis?\('([a-z.]+)',\s*'[^']+',\s*'[^']*',\s*\(\)\s*=>\s*onOpenModal\('([a-z0-9:_-]+)'\)/g)];
    const bad = [];
    for (const [, perm, id] of gated) {
      const p = PANEL_BY_ID[id];
      if (p && p.perm !== perm) bad.push(`${id}: registry=${p.perm} shell=${perm}`);
    }
    expect(bad).toEqual([]);
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
