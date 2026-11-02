// @ts-nocheck
// ── Equipment Results Panel (owner request 2026-11-02) ──────────────────────────────────────────
// "Can we add a link to the equipment survey as well as build out a landing panel for the results
// in the app?" Both halves live in this one panel since the owner asked for them together:
//   - Header toolbar: the public crew-walkthrough survey link — copy the existing one, or manage
//     (create/list/revoke) the full set. All CRUD already existed in lib/supabase.js
//     (createEquipmentSurveyLink/loadEquipmentSurveyLinks/revokeEquipmentSurveyLink) with no UI —
//     this is the first UI consumer.
//   - Body: a cross-store rollup table (item count, PQRG settings-reviewed count, last activity)
//     via the new buildEquipmentStoreSummary() (engine/equipment-survey.js) + the new
//     loadAllEquipmentEntriesDirect() (lib/supabase.js) — LocationSelector-scoped, multi:true so an
//     owner/supervisor can check a custom set of stores at once (same pattern the 2026-11-02
//     multi-select rollout established for exactly this "reporting and viewing" use case).
// Authenticated, in-app — separate code path from equipment-survey-view.js (the public, no-login
// crew form) and equipment-layout.js (the single-store floor-plan editor), same posture note
// those two files each carry about not being each other.
import * as React from 'react';
import { RoutePanelShell, ModalShell } from '../components/ModalShell.js';
import { LocationSelector, locationSelectorLocs, buildLocationHierarchy } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { buildEquipmentStoreSummary } from '../engine/equipment-survey.js';
import {
  loadEquipmentCatalogDirect, loadAllEquipmentEntriesDirect,
  createEquipmentSurveyLink, loadEquipmentSurveyLinks, revokeEquipmentSurveyLink,
} from '../lib/supabase.js';

const h = React.createElement;
const { useState, useEffect, useMemo, useCallback } = React;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const table = (p, ...c) => h('table', p, ...c);
const thead = (p, ...c) => h('thead', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);
const th = (p, ...c) => h('th', p, ...c);
const td = (p, ...c) => h('td', p, ...c);

const SURVEY_BASE_URL = (typeof window !== 'undefined' ? window.location.origin : '') + '/';
export function equipmentSurveyUrl(token) { return `${SURVEY_BASE_URL}?equip=${token}`; }

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(+d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Manage Links modal (create / list / copy / revoke) ──────────────────────────────────────────
function ManageLinksModal({ onClose, onLinksChanged }) {
  const [links, setLinks] = useState(null); // null = loading
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyToken, setBusyToken] = useState(null);
  const [msg, setMsg] = useState('');
  const [copiedToken, setCopiedToken] = useState(null);

  const refresh = useCallback(async () => {
    const rows = await loadEquipmentSurveyLinks();
    setLinks(rows);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const create = async () => {
    setCreating(true); setMsg('');
    const { token, error } = await createEquipmentSurveyLink(newLabel.trim() || null);
    setCreating(false);
    if (error) { setMsg(error); return; }
    setNewLabel('');
    onLinksChanged?.();
    await refresh();
  };

  const revoke = async (token) => {
    if (!confirm('Revoke this link? It will stop working immediately — anyone with the URL will see "This link has been turned off."')) return;
    setBusyToken(token);
    const { error } = await revokeEquipmentSurveyLink(token, true);
    setBusyToken(null);
    if (error) { setMsg(error); return; }
    onLinksChanged?.();
    await refresh();
  };

  const copy = async (token) => {
    try { await navigator.clipboard.writeText(equipmentSurveyUrl(token)); setCopiedToken(token); setTimeout(() => setCopiedToken(null), 1800); }
    catch { /* clipboard permission denied -- the URL is still visible to select manually */ }
  };

  return h(ModalShell, {
    title: '🔗 Manage Equipment Survey Links', onClose, maxWidth: 820, closeOnBackdrop: true,
  },
    div({ style: { fontSize: 11.5, color: 'var(--text3)', marginBottom: 12 } },
      'One link works for every store — whoever opens it picks their store on the page. Create a new one for a specific push (e.g. a named rollout), or reuse an existing one.'),
    div({ style: { display: 'flex', gap: 8, marginBottom: 14 } },
      h('input', {
        value: newLabel, onChange: e => setNewLabel(e.target.value), placeholder: 'Label (optional) — e.g. "Fleet walkthrough — Phase 3"',
        style: { flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--bdr2)', background: 'var(--surf2)', color: 'var(--text)', fontSize: 12.5 },
      }),
      btn({ className: 'btn btn-sm', disabled: creating, onClick: create }, creating ? 'Creating…' : '+ New Link'),
    ),
    msg && div({ style: { color: 'var(--bad)', fontSize: 12, marginBottom: 10 } }, msg),
    links == null
      ? div({ style: { color: 'var(--text3)', fontSize: 12, textAlign: 'center', padding: 20 } }, 'Loading…')
      : !links.length
        ? div({ style: { color: 'var(--text3)', fontSize: 12, textAlign: 'center', padding: 20 } }, 'No links created yet.')
        : div({ style: { overflowX: 'auto' } },
          table({ style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 } },
            thead({}, tr({},
              th({ style: _thStyle }, 'Label'), th({ style: _thStyle }, 'Created'),
              th({ style: _thStyle }, 'Views'), th({ style: _thStyle }, 'Last Viewed'),
              th({ style: _thStyle }, 'Status'), th({ style: _thStyle }, ''))),
            h('tbody', {},
              ...links.map(l => tr({ key: l.token, style: { borderTop: '1px solid var(--bdr)' } },
                td({ style: _tdStyle }, l.label || span({ style: { color: 'var(--text3)' } }, '(unlabeled)')),
                td({ style: _tdStyle }, fmtDate(l.createdAt)),
                td({ style: _tdStyle }, l.viewCount ?? 0),
                td({ style: _tdStyle }, l.lastViewedAt ? fmtDate(l.lastViewedAt) : '—'),
                td({ style: _tdStyle }, l.revoked
                  ? span({ style: { color: 'var(--bad)', fontWeight: 700 } }, 'Revoked')
                  : span({ style: { color: 'var(--good,#4ade80)', fontWeight: 700 } }, 'Active')),
                td({ style: { ..._tdStyle, display: 'flex', gap: 6 } },
                  btn({ className: 'btn btn-sm', onClick: () => copy(l.token) }, copiedToken === l.token ? 'Copied ✓' : '📋 Copy'),
                  !l.revoked && btn({ className: 'btn btn-sm', style: { color: 'var(--bad)' }, disabled: busyToken === l.token, onClick: () => revoke(l.token) }, 'Revoke'),
                ),
              )),
            ),
          ),
        ),
  );
}
const _thStyle = { textAlign: 'left', padding: '5px 10px', color: 'var(--text3)', fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.03em' };
const _tdStyle = { padding: '7px 10px', verticalAlign: 'middle' };

// ── Main panel ───────────────────────────────────────────────────────────────────────────────
export function EquipmentResultsPanel({ stores, onClose }) {
  const [locValue, setLocValue] = useState({ level: 'all', id: null });
  const [catalog, setCatalog] = useState(null);
  const [entries, setEntries] = useState(null);
  const [links, setLinks] = useState([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshEntries = useCallback(() => {
    loadAllEquipmentEntriesDirect().then(setEntries).catch(() => setEntries([]));
  }, []);
  useEffect(() => { loadEquipmentCatalogDirect().then(setCatalog).catch(() => setCatalog([])); }, []);
  useEffect(() => { refreshEntries(); }, [refreshEntries]);
  useEffect(() => { loadEquipmentSurveyLinks().then(setLinks).catch(() => setLinks([])); }, [manageOpen]);

  const storeList = (stores && stores.length) ? stores : Object.keys(STORE_NAMES).map(l => ({ loc: l }));
  const tree = useMemo(() => buildLocationHierarchy(storeList, INV_ORG_COORDS, STORE_NAMES), [storeList]);
  const inScope = useMemo(() => new Set(locationSelectorLocs(locValue, tree).map(String)), [locValue, tree]);

  const summary = useMemo(() => buildEquipmentStoreSummary(entries || []), [entries]);
  const rows = useMemo(() => summary.filter(r => inScope.has(String(r.loc))), [summary, inScope]);
  const totals = useMemo(() => rows.reduce((a, r) => ({ items: a.items + r.itemCount, reviewed: a.reviewed + r.reviewedCount }), { items: 0, reviewed: 0 }), [rows]);
  const coveredLocs = useMemo(() => new Set(rows.map(r => String(r.loc))), [rows]);
  const noDataLocs = useMemo(() => [...inScope].filter(l => !coveredLocs.has(l)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [inScope, coveredLocs]);

  const activeLink = links.find(l => !l.revoked) || null;
  const copyActive = async () => {
    if (!activeLink) { setManageOpen(true); return; }
    try { await navigator.clipboard.writeText(equipmentSurveyUrl(activeLink.token)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard permission denied */ }
  };

  const loading = catalog == null || entries == null;

  return h(RoutePanelShell, {
    title: 'Equipment Results', icon: '📋', onBack: onClose,
    subtitle: 'Equipment Profile survey — what\'s been logged per store, and the crew walkthrough link itself',
    headerExtra: div({ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
      h(LocationSelector, {
        stores: storeList, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
        value: locValue, onChange: setLocValue, mode: 'full', variant: 'dropdown', multi: true,
      }),
      btn({ className: 'btn btn-sm', onClick: copyActive }, copied ? 'Copied ✓' : activeLink ? '📋 Copy Survey Link' : '🔗 Create Survey Link'),
      btn({ className: 'btn btn-sm', onClick: () => setManageOpen(true) }, '⚙️ Manage Links'),
    ),
  },
    manageOpen && h(ManageLinksModal, { onClose: () => setManageOpen(false), onLinksChanged: refreshEntries }),

    loading
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: 11 } }, 'Loading…')
      : div({},
        div({ style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
          _statTile('Stores with equipment logged', `${rows.length} of ${inScope.size}`),
          _statTile('Total items logged', String(totals.items)),
          _statTile('PQRG settings reviewed', totals.items ? `${totals.reviewed} of ${totals.items}` : '—'),
        ),
        noDataLocs.length > 0 && div({ style: { fontSize: 11.5, color: 'var(--warn,#fb923c)', marginBottom: 12, background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 7, padding: '8px 10px' } },
          `No equipment logged yet: ${noDataLocs.map(l => sNameC(l) || l).join(', ')}`),
        div({ style: { overflowX: 'auto' } },
          table({ style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12.5 } },
            thead({}, tr({},
              th({ style: _thStyle }, 'Store'), th({ style: _thStyle }, 'Items Logged'),
              th({ style: _thStyle }, 'PQRG Reviewed'), th({ style: _thStyle }, 'Last Activity'), th({ style: _thStyle }, 'By'))),
            h('tbody', {},
              ...rows.map(r => tr({ key: r.loc, style: { borderTop: '1px solid var(--bdr)' } },
                td({ style: _tdStyle }, sNameC(r.loc) || r.loc),
                td({ style: _tdStyle }, r.itemCount),
                td({ style: _tdStyle }, r.itemCount ? `${r.reviewedCount} / ${r.itemCount}` : '—'),
                td({ style: _tdStyle }, fmtDate(r.lastSubmittedAt)),
                td({ style: _tdStyle }, r.lastSubmittedBy || '—'),
              )),
            ),
          ),
        ),
        !rows.length && !noDataLocs.length && div({ style: { textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: 20 } }, 'No stores in the current scope.'),
      ),
  );
}

function _statTile(label, value) {
  return div({ style: { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: '8px 14px', minWidth: 140 } },
    div({ style: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text3)', fontWeight: 700, marginBottom: 3 } }, label),
    div({ style: { fontSize: 17, fontWeight: 800, color: 'var(--text)' } }, value));
}
