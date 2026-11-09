// @ts-nocheck
// Shift Scoreboard — the new SM/AM/DM-facing store format (task #122, owner-confirmed metric
// list 2026-11-08). Pure render layer; src/engine/shift-scoreboard.js owns all computation.
//
// Configurable metrics (the task's own requirement): which tiles show is a per-user preference,
// persisted the SAME local-first/cloud-confirm way curated-home.js's own format/operator-group
// prefs already are (localStorage for the instant read, loadUserSetting/saveUserSetting for the
// cross-device cloud copy) — never a second, bespoke persistence mechanism.
import * as React from 'react';
import { fP, f$ } from '../utils/fmt.js';
import { loadUserSetting, saveUserSetting } from '../lib/supabase.js';
import {
  SCOREBOARD_METRICS, DEFAULT_VISIBLE_METRIC_IDS, computeShiftScoreboardTiles,
  computeShiftPaceVsPlan, shiftDivergenceFlag, shiftCashIntegrityFlag,
} from '../engine/shift-scoreboard.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const VISIBLE_METRICS_KEY = 'curated_home_scoreboard_metrics';
const VISIBLE_METRICS_LS_KEY = 'mf_curated_home_scoreboard_metrics';

function fmtTileValue(unit, value) {
  if (value == null) return '—';
  if (unit === 'sec') return Math.round(value) + 's';
  if (unit === 'pct') return fP(value);
  if (unit === 'usd') return f$(value);
  if (unit === 'hrs') return (value >= 0 ? '+' : '') + value.toFixed(1) + ' hrs';
  return value.toFixed(1);
}

// A tile is "on target" when it has both a real value and a real target, and the metric's own
// direction (lower/higher-is-better, metric-source.js) says it's at or beating that target.
// A metric with no direction (e.g. the signed-gap hour chains) or no target never renders a
// color verdict — grey, not a fabricated pass/fail.
function tileStatus(tile) {
  if (tile.value == null || tile.target == null || !tile.direction) return 'neutral';
  const onTarget = tile.direction === 'lower' ? tile.value <= tile.target : tile.value >= tile.target;
  return onTarget ? 'good' : 'watch';
}
const STATUS_COLOR = { good: 'var(--good,#10b981)', watch: 'var(--amber,#f59e0b)', neutral: 'var(--text3,#6b7280)' };

function MetricTile({ tile }) {
  const status = tileStatus(tile);
  return div({ style: {
    background: 'var(--surf2,#f3f4f6)', border: '1px solid var(--bdr,#e5e7eb)',
    borderLeft: '3px solid ' + STATUS_COLOR[status], borderRadius: 10, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
  } },
    span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
      color: 'var(--text3,#6b7280)' } }, tile.label),
    span({ style: { fontSize: 22, fontWeight: 800, color: 'var(--text,#111827)', fontVariantNumeric: 'tabular-nums' } },
      fmtTileValue(tile.unit, tile.value)),
    tile.target != null && span({ style: { fontSize: 11, color: 'var(--text3,#6b7280)' } },
      'Target ' + fmtTileValue(tile.unit, tile.target)),
  );
}

function PaceRow({ pace }) {
  if (!pace || (pace.salesPacePct == null && pace.gcPacePct == null)) return null;
  const item = (label, pct, raw, plan, fmt) => div({ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
    span({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text3,#6b7280)', textTransform: 'uppercase', letterSpacing: '.05em' } }, label),
    span({ style: { fontSize: 18, fontWeight: 700, color: pct == null ? 'var(--text3,#6b7280)' : pct >= 0 ? 'var(--good,#10b981)' : 'var(--crit,#f43f5e)' } },
      pct == null ? '—' : (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'),
    raw != null && plan != null && span({ style: { fontSize: 11, color: 'var(--text3,#6b7280)' } },
      fmt(raw) + ' vs ' + fmt(plan) + ' plan'),
  );
  return div({ style: {
    display: 'flex', gap: 24, background: 'var(--surf2,#f3f4f6)', border: '1px solid var(--bdr,#e5e7eb)',
    borderRadius: 10, padding: '12px 16px', marginBottom: 14,
  } },
    item('Sales pace vs plan', pace.salesPacePct, pace.sales, pace.projSales, f$),
    item('Guest-count pace vs plan', pace.gcPacePct, pace.gc, pace.projGC, v => Math.round(v).toLocaleString()),
  );
}

function FlagBadge({ flag }) {
  if (!flag) return null;
  return div({ style: {
    display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(245,158,11,.1)',
    border: '1px solid var(--amber,#f59e0b)', borderRadius: 10, padding: '10px 14px', marginBottom: 10,
  } },
    span({ style: { fontSize: 15 } }, '⚠️'),
    div(null,
      div({ style: { fontSize: 13, fontWeight: 700, color: 'var(--text,#111827)' } }, flag.headline),
      div({ style: { fontSize: 12, color: 'var(--text2,#4b5563)', marginTop: 2 } }, flag.detail),
    ),
  );
}

function CustomizePanel({ visibleIds, onChange, onClose }) {
  return div({ style: {
    position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 20,
    background: 'var(--surf,#fff)', border: '1px solid var(--bdr,#e5e7eb)', borderRadius: 10,
    padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)', width: 260,
  } },
    div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text3,#6b7280)', textTransform: 'uppercase',
      letterSpacing: '.05em', marginBottom: 8 } }, 'Metrics shown'),
    div({ style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' } },
      SCOREBOARD_METRICS.map(m => {
        const checked = visibleIds.includes(m.id);
        return h('label', { key: m.id, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text,#111827)', cursor: 'pointer' } },
          h('input', {
            type: 'checkbox', checked,
            onChange: () => onChange(checked ? visibleIds.filter(id => id !== m.id) : [...visibleIds, m.id]),
          }),
          m.label,
        );
      }),
    ),
    btn({
      onClick: onClose,
      style: { marginTop: 10, width: '100%', padding: '6px 0', fontSize: 12, fontWeight: 700,
        background: 'var(--surf2,#f3f4f6)', border: '1px solid var(--bdr,#e5e7eb)', borderRadius: 8, cursor: 'pointer' },
    }, 'Done'),
  );
}

export function ShiftScoreboardFormat({ ds, loc, storeName }) {
  const [visibleIds, setVisibleIdsState] = React.useState(() => {
    try {
      const raw = localStorage.getItem(VISIBLE_METRICS_LS_KEY);
      if (raw) { const v = JSON.parse(raw); if (Array.isArray(v) && v.length) return v; }
    } catch {}
    return DEFAULT_VISIBLE_METRIC_IDS;
  });
  React.useEffect(() => {
    let live = true;
    loadUserSetting(VISIBLE_METRICS_KEY).then(v => {
      if (live && Array.isArray(v) && v.length) setVisibleIdsState(v);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const [customizeOpen, setCustomizeOpen] = React.useState(false);
  const setVisibleIds = (ids) => {
    setVisibleIdsState(ids);
    try { localStorage.setItem(VISIBLE_METRICS_LS_KEY, JSON.stringify(ids)); } catch {}
    saveUserSetting(VISIBLE_METRICS_KEY, ids).catch(() => {});
  };

  const now = new Date();
  const tiles = React.useMemo(() => loc ? computeShiftScoreboardTiles(ds, loc, now, visibleIds) : [],
    [ds, loc, visibleIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const pace = React.useMemo(() => loc ? computeShiftPaceVsPlan(ds, loc, now) : null,
    [ds, loc]); // eslint-disable-line react-hooks/exhaustive-deps
  const divergenceFlag = React.useMemo(() => shiftDivergenceFlag(pace), [pace]);
  const cashFlag = React.useMemo(() => loc ? shiftCashIntegrityFlag(ds, loc, now) : null,
    [ds, loc]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loc) {
    return div({ style: { fontSize: 13.5, color: 'var(--text2,#4b5563)', padding: '12px 0' } },
      'No store resolved for this account yet.');
  }

  const asOfLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' · ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' });

  return div(null,
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, position: 'relative' } },
      div(null,
        div({ style: { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3,#6b7280)' } }, 'Shift Scoreboard'),
        div({ style: { fontSize: 18, fontWeight: 800, color: 'var(--text,#111827)', marginTop: 2 } }, storeName || loc),
        div({ style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 } },
          span({ style: {
            width: 6, height: 6, borderRadius: '50%', background: 'var(--good,#10b981)', flex: '0 0 auto',
          } }),
          span({ style: { fontSize: 11.5, fontWeight: 600, color: 'var(--text2,#4b5563)' } }, 'As of ' + asOfLabel),
          span({ style: { fontSize: 11, color: 'var(--text3,#6b7280)' } }, '— today so far, running'),
        ),
      ),
      btn({
        onClick: () => setCustomizeOpen(v => !v),
        style: { fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
          border: '1px solid var(--bdr,#e5e7eb)', background: 'var(--surf2,#f3f4f6)', cursor: 'pointer' },
      }, '⚙ Customize'),
      customizeOpen && h(CustomizePanel, { visibleIds, onChange: setVisibleIds, onClose: () => setCustomizeOpen(false) }),
    ),
    h(FlagBadge, { flag: divergenceFlag }),
    h(FlagBadge, { flag: cashFlag }),
    h(PaceRow, { pace }),
    div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 } },
      tiles.map(t => h(MetricTile, { key: t.id, tile: t })),
    ),
    tiles.length === 0 && div({ style: { fontSize: 13, color: 'var(--text3,#6b7280)', marginTop: 10 } },
      'No metrics selected — use Customize to choose what shows here.'),
  );
}
