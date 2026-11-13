// @ts-nocheck
// GM Daily Review — Notes 75 (owner, 2026-11-12 night, memory/notes-75-queue.md). "Figure out
// how to incorporate this into what we have already built to see if we can answer the questions
// up front each day." Reuses buildDailyReview()/buildServiceDaypartBreakdown()
// (engine/daily-review.js) over data every other panel already has — no new pull, no new table.
//
// GM-only for now (Supervisor/OM notes are still pending from the owner); store-grain today,
// designed so a later patch/district rollup can reuse the same engine rather than a rewrite.
import * as React from 'react';
import { buildDailyReview, buildServiceDaypartBreakdown, findDailyWin, buildPatchDailyReview, buildPatchHotspots } from '../engine/daily-review.js';
import { getTargetsForDate } from './store-dash.js';
import { DEFAULT_TARGETS, STORE_NAMES, supervisorGroups } from '../constants.js';
import { lastClosedBusinessDay, addD, dFmt, dKey, weekStartOf } from '../utils/date.js';
import { loadDtHistory } from '../lib/supabase.js';
import { RoutePanelShell } from '../components/ModalShell.js';
import { withAlpha, f$ } from '../utils/fmt.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const SEV_COLOR = { bad: '#ef4444', watch: '#f59e0b', good: '#10b981' };
const SEV_ICON = { bad: '!', watch: '~', good: '✓' };

function pct(v, digits = 1) { return v == null ? '—' : (v * 100).toFixed(digits) + '%'; }
function sec(v) { return v == null ? '—' : Math.round(v) + 's'; }
function hrs(v) { return v == null ? '—' : v.toFixed(1) + 'h'; }
function dollar(v) { return v == null ? '—' : f$(v); }
function rate(v) { return v == null ? '—' : v.toFixed(1); }

const UNIT_FMT = { pct, sec, hours: hrs, dollar, rate, count: v => (v == null ? '—' : Math.round(v).toLocaleString()) };

// One line item — status pill (the decision) + the real actual/target numbers (CLAUDE.md's
// "say the number AND the decision" standing rule), never one without the other.
function LineRow({ line }) {
  const fmt = UNIT_FMT[line.unit] || (v => v ?? '—');
  const color = line.status ? SEV_COLOR[line.status] : 'var(--text3,#6b7280)';
  return div({ style: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: line.status ? withAlpha(SEV_COLOR[line.status], '08') : 'transparent' } },
    div({ style: { width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color, background: line.status ? withAlpha(SEV_COLOR[line.status], '20') : 'var(--surf2,#f3f4f6)' } },
      line.status ? SEV_ICON[line.status] : '·'),
    div({ style: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text,#111827)' } }, line.label),
    line.vsLYPct !== undefined && line.ly != null && span({ style: { fontSize: 10, fontFamily: 'var(--mono)', color: line.vsLYPct >= 0 ? '#10b981' : '#ef4444', flexShrink: 0 } },
      (line.vsLYPct >= 0 ? '+' : '') + (line.vsLYPct * 100).toFixed(1) + '% vs LY'),
    div({ style: { fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--text,#111827)', flexShrink: 0, minWidth: 54, textAlign: 'right' } }, fmt(line.actual)),
    line.target != null && span({ style: { fontSize: 10, color: 'var(--text3,#6b7280)', flexShrink: 0, minWidth: 70, textAlign: 'right' } }, 'target ' + fmt(line.target)),
  );
}

function SectionCard({ section, daypartNote }) {
  const color = section.severity ? SEV_COLOR[section.severity] : 'var(--bdr,#2a2f3a)';
  return div({ style: { border: '1px solid ' + (section.severity ? withAlpha(color, '35') : 'var(--bdr,#2a2f3a)'), borderLeft: '4px solid ' + color, borderRadius: 10, background: 'var(--surf2,#151821)', overflow: 'hidden' } },
    div({ style: { padding: '10px 14px', borderBottom: '.5px solid var(--bdr,#2a2f3a)', display: 'flex', alignItems: 'center', gap: 8 } },
      span({ style: { fontSize: 13, fontWeight: 800, color: 'var(--text,#e8eaed)' } }, section.label),
      section.severity && span({ style: { marginLeft: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color } }, section.severity)),
    div({ style: { padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 } },
      section.lines.map(l => h(LineRow, { key: l.key, line: l }))),
    daypartNote,
  );
}

// "Literally point out the times of day" — one line per daypart-capable Service metric naming
// its best and worst daypart, called out in BOTH directions (owner: "Equally call out the
// positives along with times of day").
function DaypartNote({ breakdown }) {
  if (!breakdown || !breakdown.length) return null;
  const LABEL = { oepe: 'OEPE', r2p: 'R2P', kvst: 'KVS Time' };
  return div({ style: { padding: '8px 14px', borderTop: '.5px solid var(--bdr,#2a2f3a)', background: 'var(--surf,#111822)', display: 'flex', flexDirection: 'column', gap: 4 } },
    breakdown.map(b => div({ key: b.key, style: { fontSize: 11, color: 'var(--text2,#9aa0aa)' } },
      span({ style: { fontWeight: 700, color: 'var(--text,#e8eaed)' } }, LABEL[b.key] + ': '),
      'slowest in ', span({ style: { color: '#ef4444', fontWeight: 700 } }, b.worst.label), ' (', Math.round(b.worst.avgSec), 's) · best in ',
      span({ style: { color: '#10b981', fontWeight: 700 } }, b.best.label), ' (', Math.round(b.best.avgSec), 's)')));
}

// "At least one positive thing to call out, every day" (owner, 2026-11-13). Deliberately NOT
// styled like a status card — gold ribbon, not red/amber/green — so a win reads as its own kind
// of thing, not just another metric row. `kind` lets a "clean day"/"no standout" read stay
// honest (muted tone) instead of forcing fake enthusiasm onto an unremarkable day.
const WIN_TONE = {
  win: { bg: 'rgba(255,188,13,.10)', bdr: 'rgba(255,188,13,.4)', text: '#FFBC0D' },
  clean: { bg: 'rgba(16,185,129,.08)', bdr: 'rgba(16,185,129,.3)', text: '#34d399' },
  none: { bg: 'var(--surf2,#151821)', bdr: 'var(--bdr,#2a2f3a)', text: 'var(--text3,#6b7280)' },
};
function WinBanner({ win }) {
  if (!win) return null;
  const tone = WIN_TONE[win.kind] || WIN_TONE.none;
  return div({ style: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 12, background: tone.bg, border: '1px solid ' + tone.bdr } },
    span({ style: { fontSize: 22, flexShrink: 0 } }, win.icon),
    div({ style: { flex: 1, minWidth: 0 } },
      div({ style: { fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: tone.text, marginBottom: 2 } },
        win.kind === 'win' ? "Today's Win" : win.kind === 'clean' ? 'Steady Day' : 'Nothing Standout Yet'),
      div({ style: { fontSize: 14, fontWeight: 700, color: 'var(--text,#e8eaed)' } }, win.headline),
      div({ style: { fontSize: 11, color: 'var(--text2,#9aa0aa)', marginTop: 2 } }, win.detail)));
}

function Scorecard({ sections }) {
  return div({ style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
    sections.map(s => {
      const color = s.severity ? SEV_COLOR[s.severity] : 'var(--text3,#6b7280)';
      return div({ key: s.key, style: { flex: '1 1 90px', minWidth: 80, padding: '8px 10px', borderRadius: 8, textAlign: 'center', background: s.severity ? withAlpha(color, '14') : 'var(--surf2,#151821)', border: '1px solid ' + (s.severity ? withAlpha(color, '40') : 'var(--bdr,#2a2f3a)') } },
        div({ style: { fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text3,#6b7280)' } }, s.label),
        div({ style: { fontSize: 16, marginTop: 2 } }, s.severity ? SEV_ICON[s.severity] : '–'));
    }));
}

// ── Patch mode (Area Supervisor / OM) ───────────────────────────────────────────────────────────
const WINDOWS = [
  { id: 'day', label: 'Today' },
  { id: 'wtd', label: 'WTD' },
  { id: 'mtd', label: 'MTD' },
];

function rangeFor(windowId, date) {
  if (windowId === 'wtd') return { s: weekStartOf(date), e: date };
  if (windowId === 'mtd') return { s: new Date(date.getFullYear(), date.getMonth(), 1), e: date };
  return { s: date, e: date };
}

const SEV_LABEL = { bad: 'Needs attention', watch: 'Watch', good: 'On track' };

function HotspotTable({ hotspots, onPick }) {
  if (!hotspots.length) return null;
  return div({ style: { border: '1px solid var(--bdr,#2a2f3a)', borderRadius: 10, overflow: 'hidden' } },
    div({ style: { padding: '8px 12px', fontSize: 11, fontWeight: 800, color: 'var(--text2,#9aa0aa)', textTransform: 'uppercase', letterSpacing: '.04em', background: 'var(--surf2,#151821)', borderBottom: '.5px solid var(--bdr,#2a2f3a)' } },
      'Stores — worst first (today)'),
    div({ style: { display: 'flex', flexDirection: 'column' } },
      hotspots.map(hs => {
        const color = SEV_COLOR[hs.worst] || 'var(--text3,#6b7280)';
        return div({ key: hs.loc, onClick: () => onPick(hs.loc), style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '.5px solid var(--bdr,#2a2f3a)', cursor: 'pointer' } },
          div({ style: { width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 } }),
          div({ style: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text,#e8eaed)' } }, STORE_NAMES[hs.loc] || hs.loc),
          span({ style: { fontSize: 10, fontWeight: 700, color } }, SEV_LABEL[hs.worst] || '—'),
          (hs.bad + hs.watch) > 0 && span({ style: { fontSize: 10, color: 'var(--text3,#6b7280)' } }, hs.bad + ' bad · ' + hs.watch + ' watch'));
      })));
}

function PatchDailyReview({ ds, locs, date, onPickStore }) {
  const [windowId, setWindowId] = React.useState('day');
  const range = React.useMemo(() => rangeFor(windowId, date), [windowId, date]);

  const targetsByLoc = React.useMemo(() => {
    const m = {};
    for (const loc of locs) m[loc] = getTargetsForDate(date, loc, DEFAULT_TARGETS[loc]);
    return m;
  }, [locs, date]);

  const review = React.useMemo(() => (ds?.loaded ? buildPatchDailyReview(ds, locs, range, targetsByLoc) : null), [ds, locs, range, targetsByLoc]);
  const hotspots = React.useMemo(() => (ds?.loaded ? buildPatchHotspots(ds, locs, date, targetsByLoc) : []), [ds, locs, date, targetsByLoc]);

  return div({ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    div({ style: { display: 'flex', gap: 6 } },
      WINDOWS.map(w => h('button', {
        key: w.id, className: 'btn btn-sm',
        style: { background: windowId === w.id ? 'var(--accent,#f5bc00)' : undefined, color: windowId === w.id ? '#111' : undefined, fontWeight: windowId === w.id ? 800 : 600 },
        onClick: () => setWindowId(w.id),
      }, w.label))),
    !review ? div({ style: { padding: 24, textAlign: 'center', color: 'var(--text3,#6b7280)', fontSize: 12 } }, 'Loading…') :
      div({ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h(Scorecard, { sections: review.sections }),
        review.sections.map(s => h(SectionCard, { key: s.key, section: s, daypartNote: null })),
      ),
    h(HotspotTable, { hotspots, onPick: onPickStore }),
    div({ style: { fontSize: 10, color: 'var(--text3,#6b7280)', textAlign: 'center' } },
      locs.length + ' store' + (locs.length === 1 ? '' : 's') + ' in this patch · dollar/hours lines are a true sum, rate/% lines a true Σ/Σ ratio — never a mean of store percentages.'),
  );
}

// Patches whose stores actually appear in this caller's own `stores` scope (never offer a
// supervisor group that reaches past accessible_locs/whatever store list the panel was handed) —
// same "scope to what was actually passed in" caution every other patch-aware panel in this app
// already follows.
function patchesWithin(storeOpts) {
  const known = new Set(storeOpts.map(s => s.loc));
  const groups = supervisorGroups();
  const out = {};
  for (const name in groups) {
    const locs = (groups[name] || []).filter(l => known.has(String(l))).map(String);
    if (locs.length) out[name] = locs;
  }
  return out;
}

export function DailyReviewPanel({ ds, stores, selStore, onClose }) {
  const storeOpts = React.useMemo(() => (stores || []).map(s => ({ loc: String(s.loc), name: STORE_NAMES[String(s.loc)] || s.loc })), [stores]);
  const patches = React.useMemo(() => patchesWithin(storeOpts), [storeOpts]);
  const patchNames = Object.keys(patches);

  const [scope, setScope] = React.useState('store');
  const [loc, setLoc] = React.useState(() => String(selStore?.loc || stores?.[0]?.loc || storeOpts[0]?.loc || ''));
  const [patchName, setPatchName] = React.useState(() => patchNames[0] || '');
  const [date, setDate] = React.useState(() => lastClosedBusinessDay());
  const [dtRows, setDtRows] = React.useState([]);

  React.useEffect(() => {
    const dk = dKey(date);
    loadDtHistory({ s: dk, e: dk }).then(rows => setDtRows(rows || [])).catch(() => setDtRows([]));
  }, [date]);

  const targets = React.useMemo(() => getTargetsForDate(date, loc, DEFAULT_TARGETS[loc]), [date, loc]);
  const review = React.useMemo(() => (ds?.loaded && scope === 'store' ? buildDailyReview(ds, loc, date, targets) : null), [ds, loc, date, targets, scope]);
  const win = React.useMemo(() => (review ? findDailyWin(review) : null), [review]);
  const daypart = React.useMemo(() => buildServiceDaypartBreakdown(dtRows, loc, date), [dtRows, loc, date]);

  const storeName = STORE_NAMES[loc] || loc;
  const subtitle = scope === 'patch' ? (patchName || 'Patch') + ' · ' + dFmt(date) : storeName + ' · ' + dFmt(date);

  return h(RoutePanelShell, { title: 'Daily Review', subtitle, icon: '🧭', onBack: onClose },
    div({ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        patchNames.length > 0 && div({ style: { display: 'flex', gap: 4 } },
          h('button', { className: 'btn btn-sm', style: { background: scope === 'store' ? 'var(--accent,#f5bc00)' : undefined, color: scope === 'store' ? '#111' : undefined, fontWeight: scope === 'store' ? 800 : 600 }, onClick: () => setScope('store') }, 'Store'),
          h('button', { className: 'btn btn-sm', style: { background: scope === 'patch' ? 'var(--accent,#f5bc00)' : undefined, color: scope === 'patch' ? '#111' : undefined, fontWeight: scope === 'patch' ? 800 : 600 }, onClick: () => setScope('patch') }, 'Patch')),
        scope === 'store' && storeOpts.length > 1 && h('select', { value: loc, onChange: e => setLoc(e.target.value), style: { fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '.5px solid var(--bdr,#2a2f3a)', background: 'var(--surf2,#151821)', color: 'var(--text,#e8eaed)' } },
          storeOpts.map(o => h('option', { key: o.loc, value: o.loc }, o.name))),
        scope === 'patch' && patchNames.length > 1 && h('select', { value: patchName, onChange: e => setPatchName(e.target.value), style: { fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '.5px solid var(--bdr,#2a2f3a)', background: 'var(--surf2,#151821)', color: 'var(--text,#e8eaed)' } },
          patchNames.map(n => h('option', { key: n, value: n }, n + ' (' + patches[n].length + ')'))),
        h('button', { className: 'btn btn-sm', onClick: () => setDate(d => addD(d, -1)) }, '← Prior Day'),
        span({ style: { fontSize: 11, color: 'var(--text3,#6b7280)' } }, dFmt(date)),
        h('button', { className: 'btn btn-sm', onClick: () => setDate(d => addD(d, 1)) }, 'Next Day →'),
      ),
      scope === 'patch'
        ? (patchNames.length === 0
            ? div({ style: { padding: 24, textAlign: 'center', color: 'var(--text3,#6b7280)', fontSize: 12 } }, 'No patch assignments found for the stores in scope.')
            : h(PatchDailyReview, { ds, locs: patches[patchName] || [], date, onPickStore: pickedLoc => { setLoc(pickedLoc); setScope('store'); } }))
        : (!review ? div({ style: { padding: 24, textAlign: 'center', color: 'var(--text3,#6b7280)', fontSize: 12 } }, 'Loading…') :
          div({ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
            h(WinBanner, { win }),
            h(Scorecard, { sections: review.sections }),
            review.sections.map(s => h(SectionCard, {
              key: s.key, section: s,
              daypartNote: s.key === 'service' ? h(DaypartNote, { breakdown: daypart }) : null,
            })),
            div({ style: { fontSize: 10, color: 'var(--text3,#6b7280)', textAlign: 'center', padding: '4px 0 0' } },
              'Sales mix %s and Service dayparts are informational — no formal target exists for them yet. Paper Cost % has a target but no live source (flagged gap, see memory/notes-75-queue.md).'),
          )),
    ),
  );
}
