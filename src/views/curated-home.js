// @ts-nocheck
// ── Curated Home Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §2, task #92) ────────────
// Front door onto Morning Brief's already-proven correlation engine (computeMorningBrief(),
// src/features/morning-brief.js), with the two real additions the plan doc scopes for Phase 1:
// (a) role-cascaded VOICE (src/engine/curated-home.js's altitudeForRole()/buildCuratedHomeItems())
// -- same facts, different altitude of language, never a different data scope (RBAC already
// handles that); (b) a genuine per-user FORMAT preference (checklist/bullets/narrative), stored
// once in Supabase user_settings, respected by this panel's own render path.
//
// Deliberately shipped as its OWN panel (not a replacement of the app's literal Command/Home
// view) -- see this PR's own body for why that's a judgment call, not an oversight.
//
// ── Phase 2 (2026-11-07, task #106, owner ask) ──────────────────────────────────────────────
// "more graphical... instantly grabbing a user's attention... charts or graphs and tiles/mini
// tiles... clickable links back to relevant data." Three additions, all layered on the SAME
// `items`/`summary` from buildCuratedHomeItems() -- no new data source, no change to the role-
// voice engine (src/engine/curated-home.js is untouched by this phase):
//   1. A summary header: colored stat tiles (real store counts, never just icons) + a severity
//      distribution bar -- a real chart, not decoration, per the dataviz skill's "pick the form"
//      step (this is a magnitude-by-status read, so a stacked bar is the right form, not a donut
//      or a card wall of icons). Uses flex-width div segments rather than SVG arcs -- simpler,
//      and this codebase already prefers plain divs for a bar-shaped magnitude read (see
//      StatTile's own sibling panels); SVG is reserved for geometry a flex box can't express
//      (trend lines, angles), per the inline-SVG examples already in trends.js/signals.js/etc.
//   2. Checklist and Bullets both render the SAME `ItemCard` tile (icon badge, severity-tinted
//      border, store chips, drill-through link) -- the owner's "tiles/mini tiles" ask, applied to
//      both density levels rather than only one. Narrative stays prose (that's the point of
//      offering it as a third format) but gains a compact row of drill-through chips under the
//      text, so the "clickable links back to relevant data" bonus isn't format-gated.
//   3. `RULE_PANEL`/`RULE_PANEL_LABEL` maps all 12 real MORNING_RULES ids (src/features/
//      morning-brief.js) to a real panel-registry id (src/app/panel-registry.js) -- full
//      coverage, not partial: 5 controls rules (DRAWER_OPENS/REFUND_OVERRING/TRED_SPIKE/
//      GC_SALES_DIVERGE/CASH_OS) -> `security`; FOOD_COST_HIGH -> `fob-analysis`; 5 service
//      rules (STAFFED_SLOW/STAFFED_NO_PARK/TIMER_GAMING/KVS_USAGE_LOW/DAYPART_OEPE) -> `dt-sos`;
//      SMG_OSAT_LOW -> `smg-voice`. Every id checked directly against panel-registry.js, not
//      guessed. `onNav` reuses the exact mechanism At A Glance's own Action Checklist already
//      uses (`onNav(panelId)` -> App.js's `goRoute(id)`) -- App.js now passes the same
//      `onNav:v=>goRoute(v)` wiring into this panel. Fully optional: with no `onNav` prop, every
//      drill-through link simply doesn't render (no dead buttons), so this panel still works
//      standalone (e.g. in a test) without the App.js wiring.
import * as React from 'react';
import { sNameC, operatorGroups, supervisorGroups, unpadLoc } from '../constants.js';
import { withAlpha } from '../utils/fmt.js';
import { loadUserSetting, saveUserSetting } from '../lib/supabase.js';
import { computeMorningBrief, getLatestBriefDate, useBriefDarByLoc } from '../features/morning-brief.js';
import { altitudeForRole, buildCuratedHomeItems } from '../engine/curated-home.js';
import { GamePlanFormat } from './game-plan-view.js';
import { PatchPlanFormat } from './patch-plan-view.js';
import { OperatorLedgerFormat } from './operator-ledger-view.js';

const h = React.createElement;
const div  = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const FORMAT_KEY = 'curated_home_format';
const FORMAT_LS_KEY = 'mf_curated_home_format';
// Which real operator group (src/constants.js's operatorGroups() keys) this account identifies
// as -- self-service, not a role (owner request 2026-11-08: "Operator" stays a view on top of an
// existing owner/VP/admin account rather than a new RBAC tier needing a DB CHECK-constraint
// change; see memory/plan-operator-ledger-mockup-2026-11-08.md). Same load/save pattern as the
// format preference just below.
const OPERATOR_GROUP_KEY = 'curated_home_operator_group';
const OPERATOR_GROUP_LS_KEY = 'mf_curated_home_operator_group';
// 'gameplan'/'patch' (owner request 2026-11-07, following the "Four Decks" mockup exploration)
// are the new FRONT-FACING defaults, one per altitude -- Game Plan is the GM/SM/AM/DM day (no
// meaning for a multi-store pattern), The Patch is the DO/OM/Area Supervisor territory view (no
// meaning for a single store or a whole district). Owner's own framing: "create a new set of
// main overlay. Keep the other intact and make it optional for users, but make this the front
// facing version." Checklist/Bullets/Narrative stay fully intact and reachable at every altitude
// -- never removed, never the thing being replaced, just no longer the first thing a fresh login
// sees. FORMAT_ALTITUDE says which single altitude a format is meaningful at; a format absent
// from this map (Checklist/Bullets/Narrative) is meaningful at every altitude, as before.
// 'ledger' (owner request 2026-11-07/08) is NOT keyed in FORMAT_ALTITUDE like gameplan/patch --
// it's meaningful at 'district' altitude, same as Checklist/Bullets/Narrative, but ALSO needs a
// real operator_group set on this account (an owner/VP/admin with no operator identity gets no
// change in behavior at all). See formatFitsAltitude below for the combined gate.
const FORMATS = [
  { id: 'gameplan', label: 'Game Plan' },
  { id: 'patch', label: 'The Patch' },
  { id: 'ledger', label: 'The Ledger' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'bullets', label: 'Bullets' },
  { id: 'narrative', label: 'Narrative' },
];
const FORMAT_ALTITUDE = { gameplan: 'store', patch: 'patch' };
const DEFAULT_FORMAT_BY_ALTITUDE = { store: 'gameplan', patch: 'patch', district: 'checklist' };

const SEV_COLOR = { RED: '#ef4444', AMBER: '#f59e0b', GREEN: '#10b981' };
const SEV_DOT   = { RED: '!', AMBER: '~', GREEN: '✓' };

// ruleId -> real panel-registry id (src/app/panel-registry.js). Every one of MORNING_RULES' 12
// rule ids (src/features/morning-brief.js) is covered -- checked against the real registry, not
// guessed; see the Phase 2 header comment above for the per-rule reasoning.
const RULE_PANEL = {
  DRAWER_OPENS: 'security', REFUND_OVERRING: 'security', TRED_SPIKE: 'security',
  GC_SALES_DIVERGE: 'security', CASH_OS: 'security',
  FOOD_COST_HIGH: 'fob-analysis',
  STAFFED_SLOW: 'dt-sos', STAFFED_NO_PARK: 'dt-sos', TIMER_GAMING: 'dt-sos',
  KVS_USAGE_LOW: 'dt-sos', DAYPART_OEPE: 'dt-sos',
  SMG_OSAT_LOW: 'smg-voice',
};
const RULE_PANEL_LABEL = {
  security: 'Security', 'fob-analysis': 'Food Cost', 'dt-sos': 'DT Speed of Service', 'smg-voice': 'Guest Voice',
};

// ── Phase 2 shared pieces: summary header + item tile ───────────────────────────────────────

// Real store counts, not just a colored icon -- CLAUDE.md's "Voice by role" rule requires the
// exact number to stay visible next to any plain-language/graphical framing.
function StatTile({ sev, count, label }) {
  return div({ style: {
    flex: '1 1 110px', minWidth: 100, borderRadius: 10, padding: '10px 14px',
    background: withAlpha(SEV_COLOR[sev], '14'), border: '1px solid ' + withAlpha(SEV_COLOR[sev], '40'),
    display: 'flex', flexDirection: 'column', gap: 2,
  } },
    div({ style: { display: 'flex', alignItems: 'center', gap: 6 } },
      span({ style: { width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[sev], flexShrink: 0 } }),
      span({ style: { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: SEV_COLOR[sev] } }, label)),
    span({ style: { fontSize: 26, fontWeight: 800, color: 'var(--text,#111827)', lineHeight: 1.1 } }, String(count)),
  );
}

// A real chart: store-count magnitude by status, as a stacked bar (dataviz skill's mark spec --
// 2px gap between stacked segments, status colors reserved/never reused for identity). Renders
// nothing when every count is zero (no data yet) rather than an empty/misleading bar.
function SeverityBar({ summary }) {
  const segs = [
    { sev: 'RED', n: summary.red || 0 },
    { sev: 'AMBER', n: summary.amber || 0 },
    { sev: 'GREEN', n: summary.green || 0 },
  ].filter(s => s.n > 0);
  const total = segs.reduce((a, s) => a + s.n, 0);
  if (!total) return null;
  return div({ role: 'img', 'aria-label': 'Store status distribution: ' + segs.map(s => s.n + ' ' + s.sev.toLowerCase()).join(', '),
    style: { display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 2, marginTop: 10 } },
    segs.map(s => div({ key: s.sev, title: s.sev + ': ' + s.n + ' store' + (s.n !== 1 ? 's' : ''),
      style: { flex: s.n, background: SEV_COLOR[s.sev] } })),
  );
}

function DrillLink({ ruleId, onNav }) {
  const panelId = RULE_PANEL[ruleId];
  if (!panelId || !onNav) return null;
  return h('button', {
    type: 'button',
    onClick: (e) => { e.stopPropagation(); onNav(panelId); },
    style: {
      marginTop: 2, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--bdr,#e5e7eb)',
      background: 'var(--surf2,#f3f4f6)', color: 'var(--text2,#4b5563)', fontSize: 11, fontWeight: 700,
      cursor: 'pointer', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4,
    },
  }, 'Go to ' + RULE_PANEL_LABEL[panelId] + ' →');
}

// One tile, reused by both Checklist and Bullets (the owner's "tiles/mini tiles" ask) -- severity
// color as a left accent + tinted background, icon badge, store chips, optional drill-through.
function ItemCard({ it, onNav, compact }) {
  return div({ key: it.id, className: 'ch-item', style: {
    display: 'flex', flexDirection: 'column', gap: 6, padding: compact ? '10px 12px' : '14px 16px',
    borderRadius: 10, border: '1px solid ' + withAlpha(SEV_COLOR[it.severity], '35'),
    borderLeft: '4px solid ' + SEV_COLOR[it.severity], background: withAlpha(SEV_COLOR[it.severity], '08'),
  } },
    div({ style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
      div({ style: {
        width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 14, background: withAlpha(SEV_COLOR[it.severity], '22'),
      } }, it.icon || SEV_DOT[it.severity]),
      div({ style: { flex: 1, minWidth: 0 } },
        div({ style: { fontWeight: 700, fontSize: 13.5, color: 'var(--text,#111827)' } }, it.headline),
        !compact && div({ style: { fontSize: 12, color: 'var(--text2,#4b5563)', marginTop: 2 } }, it.detail),
      ),
    ),
    div({ style: { display: 'flex', flexWrap: 'wrap', gap: 5 } },
      it.storesAffected.map(s => span({ key: s, style: {
        fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
        background: 'var(--surf2,#f3f4f6)', color: 'var(--text3,#6b7280)',
      } }, s))),
    !compact && it.action && div({ style: { fontSize: 11.5, color: 'var(--text3,#6b7280)' } }, it.action),
    h(DrillLink, { ruleId: it.ruleId, onNav }),
  );
}

function EmptyState() {
  return div({ style: { fontSize: 13, color: 'var(--text3,#6b7280)', padding: '20px 0', textAlign: 'center' } }, 'Nothing flagged right now.');
}

// ── Format renderers ──────────────────────────────────────────────────────────
// All three take the SAME `items` (src/engine/curated-home.js's buildCuratedHomeItems() output)
// -- the facts and the action never change between formats, only how densely/how prose-like
// they're presented. Per CLAUDE.md's "Voice by role" rule: the number and the decision stay
// visible and exact in every one of these, never replaced by the plain-language framing.

function ChecklistFormat({ items, onNav }) {
  if (!items.length) return EmptyState();
  return div({ style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    items.map(it => h(ItemCard, { key: it.id, it, onNav })));
}

function BulletsFormat({ items, onNav }) {
  if (!items.length) return EmptyState();
  return div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 } },
    items.map(it => h(ItemCard, { key: it.id, it, onNav, compact: true })));
}

// Narrative groups items by severity into short, flowing paragraphs -- same facts as the other
// two formats, prose instead of itemization. Deliberately data-driven (never hardcodes wording
// for a specific category) since any of MORNING_RULES' 12 rules can produce the items here.
// Phase 2: gains a compact row of drill-through chips under the prose (distinct rules only) so
// the "clickable links" addition isn't format-gated to Checklist/Bullets.
function NarrativeFormat({ items, summary, onNav }) {
  if (!items.length) {
    return div({ style: { fontSize: 13.5, color: 'var(--text2,#4b5563)', lineHeight: 1.7 } },
      'Nothing worth a call today — all clear across the board.');
  }
  const red = items.filter(i => i.severity === 'RED');
  const amber = items.filter(i => i.severity === 'AMBER');
  const paragraphs = [];
  if (red.length) {
    paragraphs.push(red.map(it =>
      `${it.headline}, at ${it.storesAffected.join(', ')}. ${it.detail} ${it.action || ''}`.trim()
    ).join(' '));
  }
  if (amber.length) {
    paragraphs.push(amber.map(it =>
      `${it.headline}, at ${it.storesAffected.join(', ')}. ${it.detail} ${it.action || ''}`.trim()
    ).join(' '));
  }
  const distinctRuleIds = [...new Set(items.map(i => i.ruleId))].filter(r => RULE_PANEL[r]);
  return div({ style: { display: 'flex', flexDirection: 'column', gap: 12 } },
    paragraphs.map((p, i) => h('p', { key: i, style: { margin: 0, fontSize: 13.5, color: 'var(--text2,#4b5563)', lineHeight: 1.75 } }, p)),
    distinctRuleIds.length > 0 && div({ style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 } },
      distinctRuleIds.map(r => h(DrillLink, { key: r, ruleId: r, onNav }))),
  );
}

const RENDERERS = { checklist: ChecklistFormat, bullets: BulletsFormat, narrative: NarrativeFormat };

// ── Panel ──────────────────────────────────────────────────────────────────────
// `onNav` (Phase 2, optional): App.js passes `v=>goRoute(v)` -- the exact mechanism At A
// Glance's own Action Checklist uses for its "Go to Dialed-In →" links. With no `onNav`, every
// drill-through link in this panel simply doesn't render -- no dead buttons.
// Same red/amber/green/noData/totalFlags formula computeMorningBrief() itself uses
// (src/features/morning-brief.js) -- re-derived here for a scoped SUBSET of stores, since
// brief.summary is always computed over the full `ds` the caller's RLS already returned (correct
// for a real GM/DO, whose own ds is already scoped that narrowly; wrong for an admin/owner
// simulating one via viewAsScope, whose own ds covers everything).
function summarizeStores(stores) {
  return {
    red: stores.filter(s => s.severity === 'RED').length,
    amber: stores.filter(s => s.severity === 'AMBER').length,
    green: stores.filter(s => s.severity === 'GREEN').length,
    noData: stores.filter(s => s.severity === 'NODATA').length,
    totalFlags: stores.reduce((a, s) => a + (s.flags?.length || 0), 0),
  };
}

export function CuratedHomePanel({ ds, settings, role, darRows, onNav, userName, viewAsScope }) {
  const [briefDate] = React.useState(() => getLatestBriefDate(ds));
  const darByLoc = useBriefDarByLoc(briefDate, darRows);
  const brief = React.useMemo(() => computeMorningBrief(ds, briefDate, darByLoc), [ds, briefDate, darByLoc]);

  const altitude = altitudeForRole(role);

  // View As Role sandbox scoping (owner request 2026-11-08): an admin/owner simulating a GM
  // sees ALL stores in their own unrestricted `ds` -- picking one deterministically (rather than
  // storeItems()'s arbitrary "first with data") needs narrowing down to just that store; same
  // idea for a simulated DO/OM/AS narrowed to one real supervisor's patch. A real GM/DO's own
  // `ds` is already RLS-scoped this narrowly, so `viewAsScope` is simply absent/no-op there --
  // this never changes behavior for a real, non-simulated login.
  const scopedBrief = React.useMemo(() => {
    if (!viewAsScope || !brief.stores?.length) return brief;
    let scopedStores;
    if (altitude === 'store') {
      scopedStores = brief.stores.filter(s => unpadLoc(s.loc) === unpadLoc(viewAsScope));
    } else if (altitude === 'patch') {
      const locs = new Set((supervisorGroups()[viewAsScope] || []).map(unpadLoc));
      scopedStores = brief.stores.filter(s => locs.has(unpadLoc(s.loc)));
    } else {
      return brief;
    }
    return { ...brief, stores: scopedStores, summary: summarizeStores(scopedStores) };
  }, [brief, altitude, viewAsScope]);

  const { items, summary } = React.useMemo(() => buildCuratedHomeItems(scopedBrief, role), [scopedBrief, role]);

  // The GM/SM/AM/DM's own store -- the SAME hasData filter storeItems() already applies, so
  // this always resolves to whichever store(s) this caller's RLS-scoped `ds` actually covers (or,
  // under the View As Role sandbox, whichever one store viewAsScope narrowed scopedBrief to).
  const myStore = altitude === 'store' ? (scopedBrief.stores || []).find(s => s.hasData) : null;

  // Which real operator group (if any) this account identifies as -- self-service, loaded the
  // same local-first/cloud-confirm way as the format preference below. `null` (the common case
  // for every owner/VP/admin account that isn't one of the real operators) changes nothing
  // about this panel's default behavior at all.
  const [operatorGroup, setOperatorGroupState] = React.useState(() => {
    try {
      const v = localStorage.getItem(OPERATOR_GROUP_LS_KEY);
      if (v && operatorGroups()[v]) return v;
    } catch {}
    return null;
  });
  React.useEffect(() => {
    let live = true;
    loadUserSetting(OPERATOR_GROUP_KEY).then(v => {
      if (live && v && operatorGroups()[v]) setOperatorGroupState(v);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const setOperatorGroup = (v) => {
    setOperatorGroupState(v || null);
    try { v ? localStorage.setItem(OPERATOR_GROUP_LS_KEY, v) : localStorage.removeItem(OPERATOR_GROUP_LS_KEY); } catch {}
    saveUserSetting(OPERATOR_GROUP_KEY, v || null).catch(() => {});
  };

  // The Patch/The Ledger (owner requests 2026-11-07/08) both need PER-STORE items for their
  // drill-down into a specific store's own Game Plan -- buildCuratedHomeItems() at patch/
  // district altitude deliberately collapses those into multi-store pattern items, so this
  // forces the SAME store-altitude grouping buildCuratedHomeItems() already uses for a GM,
  // independent of the viewer's own role, computed only when it's actually needed.
  const storeLevelItems = React.useMemo(
    () => (altitude === 'patch' || operatorGroup ? buildCuratedHomeItems(scopedBrief, 'gm').items : null),
    [scopedBrief, altitude, operatorGroup]);

  // Default format (owner request 2026-11-07, extended 2026-11-08 for The Ledger): one real
  // front door per altitude, for anyone who has never set a preference. An existing saved
  // preference is NEVER overridden (same "don't retroactively change existing users' settings"
  // convention this app already uses for the notification-consent screen/onboarding tour) --
  // Checklist/Bullets/Narrative stay exactly as reachable as they always were, just not the
  // first thing a FRESH login sees. A format tied to one altitude (FORMAT_ALTITUDE) never
  // becomes the fallback at a different one. The Ledger additionally requires operatorGroup to
  // be set -- an owner/VP/admin account with no operator identity gets the SAME 'checklist'
  // default it always has, never a surprise new front door it never asked for.
  const defaultFormat = (altitude === 'district' && operatorGroup) ? 'ledger' : (DEFAULT_FORMAT_BY_ALTITUDE[altitude] || 'checklist');
  const formatFitsAltitude = (id) => {
    if (id === 'ledger') return altitude === 'district' && !!operatorGroup;
    return !FORMAT_ALTITUDE[id] || FORMAT_ALTITUDE[id] === altitude;
  };
  const [format, setFormat] = React.useState(() => {
    try {
      const v = localStorage.getItem(FORMAT_LS_KEY);
      if (FORMATS.some(f => f.id === v) && formatFitsAltitude(v)) return v;
    } catch {}
    return defaultFormat;
  });
  React.useEffect(() => {
    let live = true;
    loadUserSetting(FORMAT_KEY).then(v => {
      if (live && FORMATS.some(f => f.id === v) && formatFitsAltitude(v)) setFormat(v);
    }).catch(() => {});
    return () => { live = false; };
  }, [altitude, operatorGroup]);
  const pickFormat = (id) => {
    setFormat(id);
    try { localStorage.setItem(FORMAT_LS_KEY, id); } catch {}
    saveUserSetting(FORMAT_KEY, id).catch(() => {});
  };

  const visibleFormats = FORMATS.filter(f => formatFitsAltitude(f.id));
  const formatPicker = div({ style: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surf2,#f3f4f6)', border: '1px solid var(--bdr,#e5e7eb)', borderRadius: 999, padding: '4px 4px 4px 10px' } },
    span({ style: { fontSize: 11, color: 'var(--text3,#6b7280)', fontWeight: 600 } }, 'Format'),
    ...visibleFormats.map(f => h('button', {
      key: f.id, type: 'button', onClick: () => pickFormat(f.id),
      style: {
        padding: '5px 10px', borderRadius: 999, border: 'none', fontSize: 11, fontWeight: 700,
        cursor: 'pointer',
        background: format === f.id ? 'var(--gold,#f5bc00)' : 'transparent',
        color: format === f.id ? '#1a1200' : 'var(--text3,#6b7280)',
      },
    }, f.label)),
  );

  // Self-service "which operator are you" picker (owner request 2026-11-08) -- visible only at
  // district altitude, where The Ledger could ever apply. Deliberately always offered (not
  // hidden once set) so an account can change or clear it later; the real 4 names come straight
  // from operatorGroups(), never hardcoded, so this stays correct if the org config changes.
  const operatorPicker = altitude === 'district' && div({ style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text3,#6b7280)' } },
    span(null, 'Operator:'),
    h('select', {
      value: operatorGroup || '', onChange: (e) => setOperatorGroup(e.target.value || null),
      style: { fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--bdr,#e5e7eb)', background: 'var(--surf,#fff)', color: 'var(--text2,#4b5563)' },
    },
      h('option', { value: '' }, '— not set —'),
      ...Object.keys(operatorGroups()).map(op => h('option', { key: op, value: op }, op)),
    ),
  );

  // View As Role sandbox scope tag (owner request 2026-11-08: "a way for me to select what
  // patch or operator or store to mimic... Tag @ would be awesome") -- a visible "@<name>" badge
  // confirming exactly which real store/patch this view has been narrowed to, alongside the
  // global ViewAsBanner (shell.js) that already names the simulated ROLE. Renders nothing when
  // viewAsScope isn't set (every real, non-simulated login).
  const scopeTag = viewAsScope && (altitude === 'store' || altitude === 'patch') && span({
    style: { fontSize: 11, fontWeight: 700, color: 'var(--amber,#f5bc00)', background: 'var(--surf2,#f3f4f6)',
      border: '1px solid var(--amber,#f5bc00)', borderRadius: 999, padding: '3px 10px' },
  }, '@ ' + (altitude === 'store' ? sNameC(viewAsScope) : viewAsScope));

  // Game Plan / The Patch / The Ledger are each their OWN full screen, not a renderer slotted
  // into the generic stat-tiles/severity-bar/card shell every other format shares -- they're the
  // things the owner asked to make "the front facing version," not a peer inside the old one.
  // The format picker stays visible (small, top-right) so switching back to Checklist/Bullets/
  // Narrative is always one click, per "keep the other intact and make it optional for users."
  if (format === 'gameplan') {
    return div({ style: { padding: '16px', maxWidth: 860, margin: '0 auto' } },
      div({ style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 14 } }, scopeTag, operatorPicker, formatPicker),
      h(GamePlanFormat, {
        ds, loc: myStore?.loc, storeName: myStore?.name, items, summary, userName, onNav,
        onShowEverything: () => pickFormat('checklist'),
      }),
    );
  }
  if (format === 'patch') {
    return div({ style: { padding: '16px', maxWidth: 860, margin: '0 auto' } },
      div({ style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 14 } }, scopeTag, operatorPicker, formatPicker),
      h(PatchPlanFormat, { ds, stores: scopedBrief.stores, items: storeLevelItems, userName, onNav }),
    );
  }
  if (format === 'ledger') {
    return div({ style: { padding: '16px', maxWidth: 860, margin: '0 auto' } },
      div({ style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 14 } }, scopeTag, operatorPicker, formatPicker),
      h(OperatorLedgerFormat, { ds, stores: scopedBrief.stores, items: storeLevelItems, userName, operatorGroup, onNav }),
    );
  }

  const Renderer = RENDERERS[format] || ChecklistFormat;
  const altitudeLabel = altitude === 'store' ? 'Store' : altitude === 'patch' ? 'Patch' : 'District';

  return div({ style: { padding: '16px', maxWidth: 860, margin: '0 auto' } },
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 } },
      div(null,
        div({ style: { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3,#6b7280)' } },
          altitudeLabel + ' view'),
        div({ style: { fontSize: 20, fontWeight: 800, color: 'var(--text,#111827)', marginTop: 2 } }, 'Today’s focus'),
        div({ style: { fontSize: 12, color: 'var(--text3,#6b7280)', marginTop: 3 } },
          summary.totalFlags + ' flag' + (summary.totalFlags !== 1 ? 's' : '') + ' · ' + items.length + ' item' + (items.length !== 1 ? 's' : '') + ' at ' + altitudeLabel.toLowerCase() + ' altitude'),
      ),
      div({ style: { display: 'flex', alignItems: 'center', gap: 10 } }, scopeTag, operatorPicker, formatPicker),
    ),
    div({ style: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 4 } },
      h(StatTile, { sev: 'RED', count: summary.red || 0, label: 'Red stores' }),
      h(StatTile, { sev: 'AMBER', count: summary.amber || 0, label: 'Amber stores' }),
      h(StatTile, { sev: 'GREEN', count: summary.green || 0, label: 'Green stores' }),
    ),
    h(SeverityBar, { summary }),
    div({ style: { background: 'var(--surf,#fff)', border: '1px solid var(--bdr,#e5e7eb)', borderRadius: 14, padding: format === 'checklist' ? '14px 20px' : '20px 22px', marginTop: 16 } },
      h(Renderer, { items, summary, onNav }),
    ),
  );
}
