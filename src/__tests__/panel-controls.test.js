import { describe, it, expect } from 'vitest';
import {
  DATE_RANGE_PRESETS, resolveDatePreset, isValidCustomRange,
  buildLocationHierarchy, locationSelectorLocs, nonEmptyActionGroups,
} from '../components/PanelControls.js';
import { PanelChrome } from '../components/PanelChrome.js';
import { ModalShell } from '../components/ModalShell.js';

// ── DateRangeControl logic ───────────────────────────────────────────────────

describe('resolveDatePreset', () => {
  const today = new Date('2026-08-10T12:00:00Z');

  it('resolves a trailing window ending YESTERDAY, never today', () => {
    const r = resolveDatePreset('7d', DATE_RANGE_PRESETS, today);
    expect(r.e).toBe('2026-08-09');
  });

  it('window length matches the preset day count exactly (inclusive)', () => {
    const r = resolveDatePreset('7d', DATE_RANGE_PRESETS, today);
    // 2026-08-03 .. 2026-08-09 inclusive = 7 days
    expect(r.s).toBe('2026-08-03');
  });

  it('90d preset spans 90 days ending yesterday', () => {
    const r = resolveDatePreset('90d', DATE_RANGE_PRESETS, today);
    const days = (new Date(r.e) - new Date(r.s)) / 86400000 + 1;
    expect(days).toBe(90);
  });

  it('returns null for an unknown preset id instead of throwing', () => {
    expect(resolveDatePreset('nope', DATE_RANGE_PRESETS, today)).toBeNull();
  });

  it('carries the preset id through so the control can highlight the active pill', () => {
    const r = resolveDatePreset('28d', DATE_RANGE_PRESETS, today);
    expect(r.id).toBe('28d');
  });

  it('a panel can subset the shared preset list (owner decision: shared list, per-panel default)', () => {
    const subset = [{ id: 'x', label: 'X', days: 3 }];
    const r = resolveDatePreset('x', subset, today);
    expect(r).toEqual({ id: 'x', s: '2026-08-07', e: '2026-08-09' });
  });
});

describe('isValidCustomRange', () => {
  it('rejects a missing endpoint', () => {
    expect(isValidCustomRange('2026-08-01', '')).toBe(false);
    expect(isValidCustomRange('', '2026-08-01')).toBe(false);
  });
  it('rejects an inverted range (end before start)', () => {
    expect(isValidCustomRange('2026-08-10', '2026-08-01')).toBe(false);
  });
  it('accepts a same-day range', () => {
    expect(isValidCustomRange('2026-08-05', '2026-08-05')).toBe(true);
  });
  it('accepts a normal forward range', () => {
    expect(isValidCustomRange('2026-08-01', '2026-08-10')).toBe(true);
  });
  it('rejects unparseable dates instead of throwing', () => {
    expect(isValidCustomRange('not-a-date', '2026-08-10')).toBe(false);
  });
});

// ── LocationSelector logic ───────────────────────────────────────────────────

const COORDS = {
  '100': { state: 'OK', sup: 'A' },
  '200': { state: 'OK', sup: 'B' },
  '300': { state: 'FL', sup: 'C' },
};
const NAMES = { '100': 'Store One', '200': 'Store Two', '300': 'Store Three' };
const STORES = [{ loc: '300' }, { loc: '100' }, { loc: '200' }];

describe('buildLocationHierarchy', () => {
  it('sorts store list numerically, not lexically', () => {
    const t = buildLocationHierarchy(STORES, COORDS, NAMES);
    expect(t.locs).toEqual(['100', '200', '300']);
  });

  it('groups by state from INV_ORG_COORDS', () => {
    const t = buildLocationHierarchy(STORES, COORDS, NAMES);
    const ok = t.states.find((s) => s.id === 'OK');
    expect(ok.locs.sort()).toEqual(['100', '200']);
  });

  it('groups by patch (sup) from INV_ORG_COORDS', () => {
    const t = buildLocationHierarchy(STORES, COORDS, NAMES);
    expect(t.patches.map((p) => p.id).sort()).toEqual(['A', 'B', 'C']);
  });

  it('excludes a store missing from INV_ORG_COORDS from state/patch tiers without crashing', () => {
    const t = buildLocationHierarchy([...STORES, { loc: '999' }], COORDS, NAMES);
    expect(t.locs).toContain('999');
    expect(t.states.flatMap((s) => s.locs)).not.toContain('999');
  });

  it('storeLabel includes the name when known, falls back to the bare loc otherwise', () => {
    const t = buildLocationHierarchy(STORES, COORDS, NAMES);
    expect(t.storeLabel('100')).toBe('100 — Store One');
    expect(t.storeLabel('999')).toBe('999');
  });

  it('filters out non-numeric loc values', () => {
    const t = buildLocationHierarchy([...STORES, { loc: 'not-a-loc' }], COORDS, NAMES);
    expect(t.locs).not.toContain('not-a-loc');
  });
});

describe('locationSelectorLocs', () => {
  const tree = buildLocationHierarchy(STORES, COORDS, NAMES);

  it('"all" (or no value) returns every loc', () => {
    expect(locationSelectorLocs(null, tree)).toEqual(tree.locs);
    expect(locationSelectorLocs({ level: 'all' }, tree)).toEqual(tree.locs);
  });
  it('"state" returns just that state\'s locs', () => {
    expect(locationSelectorLocs({ level: 'state', id: 'FL' }, tree).sort()).toEqual(['300']);
  });
  it('"patch" returns just that patch\'s locs', () => {
    expect(locationSelectorLocs({ level: 'patch', id: 'A' }, tree)).toEqual(['100']);
  });
  it('"store" returns a single-element array', () => {
    expect(locationSelectorLocs({ level: 'store', id: '200' }, tree)).toEqual(['200']);
  });
  it('an unknown state/patch id returns empty, not every loc (fail closed)', () => {
    expect(locationSelectorLocs({ level: 'state', id: 'ZZ' }, tree)).toEqual([]);
  });
});

// ── ActionMenus logic ────────────────────────────────────────────────────────

describe('nonEmptyActionGroups', () => {
  it('drops a group with no items', () => {
    const groups = [{ label: 'Reports', items: [{ label: 'Summary' }] }, { label: 'Empty', items: [] }];
    expect(nonEmptyActionGroups(groups).map((g) => g.label)).toEqual(['Reports']);
  });
  it('drops a group whose items are all falsy (feature-flagged out)', () => {
    const groups = [{ label: 'Scans', items: [null, false, undefined] }];
    expect(nonEmptyActionGroups(groups)).toEqual([]);
  });
  it('handles a missing groups array without throwing', () => {
    expect(nonEmptyActionGroups(undefined)).toEqual([]);
  });
});

// ── PanelChrome band structure ───────────────────────────────────────────────

describe('PanelChrome', () => {
  it('renders nothing when no slot is passed (a panel that needs neither band)', () => {
    expect(PanelChrome({})).toBeNull();
  });

  it('renders only band 2 when only band-2 slots are passed', () => {
    const el = PanelChrome({ location: 'loc-el' });
    const bands = el.props.children.filter(Boolean);
    expect(bands.length).toBe(1);
  });

  it('renders only band 3 when only band-3 slots are passed', () => {
    const el = PanelChrome({ actions: 'actions-el' });
    const bands = el.props.children.filter(Boolean);
    expect(bands.length).toBe(1);
  });

  it('renders both bands when both are needed', () => {
    const el = PanelChrome({ location: 'loc-el', actions: 'actions-el' });
    const bands = el.props.children.filter(Boolean);
    expect(bands.length).toBe(2);
  });

  it('band 2 order is location, date, export left-to-right — never reordered', () => {
    const el = PanelChrome({ location: 'L', dateControl: 'D', exportSlot: 'E' });
    const band2 = el.props.children[0];
    const slots = band2.props.children.filter(Boolean);
    // Each slot is a wrapping div whose only child is the value passed in.
    expect(slots.map((s) => s.props.children)).toEqual(['L', 'D', 'E']);
  });

  it('export is pushed to the far right of band 2 via marginLeft:auto', () => {
    const el = PanelChrome({ location: 'L', exportSlot: 'E' });
    const band2 = el.props.children[0];
    const exportWrap = band2.props.children.filter(Boolean).find((s) => s.props.children === 'E');
    expect(exportWrap.props.style.marginLeft).toBe('auto');
  });

  it('band 3 tabs are pushed right via marginLeft:auto, actions stay left', () => {
    const el = PanelChrome({ actions: 'A', tabs: 'T' });
    const band3 = el.props.children.filter(Boolean)[0];
    const [actionsWrap, tabsWrap] = band3.props.children.filter(Boolean);
    expect(actionsWrap.props.style.marginLeft).toBeUndefined();
    expect(tabsWrap.props.style.marginLeft).toBe('auto');
  });
});

// ── ModalShell additions don't disturb existing call sites ──────────────────

describe('ModalShell — scroll and tintHeader additions default to unchanged behavior', () => {
  it('default (no scroll/tintHeader) keeps the original centered/capped/untinted layout', () => {
    const el = ModalShell({ title: 't', onClose: () => {} });
    const backdropStyle = el.props.style;
    expect(backdropStyle.alignItems).toBe('center');
    const card = el.props.children; // single child -> not wrapped in an array
    expect(card.props.style.maxHeight).toBe('88vh');
    const header = card.props.children[0];
    expect(header.props.style.background).toBeUndefined();
  });

  it('scroll:true switches to top-aligned, page-scrolling, uncapped height', () => {
    const el = ModalShell({ title: 't', onClose: () => {}, scroll: true });
    expect(el.props.style.alignItems).toBe('flex-start');
    expect(el.props.style.overflowY).toBe('auto');
    const card = el.props.children;
    expect(card.props.style.maxHeight).toBeUndefined();
  });

  it('tintHeader:true tints the header band var(--surf2)', () => {
    const el = ModalShell({ title: 't', onClose: () => {}, tintHeader: true });
    const card = el.props.children;
    const header = card.props.children[0];
    expect(header.props.style.background).toBe('var(--surf2)');
  });

  it('subHeader slot still renders between header and body, untouched by the new props', () => {
    const el = ModalShell({ title: 't', onClose: () => {}, subHeader: 'SUB', scroll: true, tintHeader: true });
    const card = el.props.children;
    expect(card.props.children[1]).toBe('SUB');
  });
});
