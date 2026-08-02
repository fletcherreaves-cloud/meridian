// @ts-nocheck
// ── Above-Store One-Pager (Notes 47) — roll results across all panels for a group + period ────────
// Scheduling · Labor · FOB · Sales/GC · Controls · Voice, for a selected scope (All/OK/FL/store) and
// period (MTD / Last week / Last month). Reuses the proven one-pager-data builders + metric-source +
// vs-LY, plus the Event Impact registry's upcoming events. v1: quantified rollup (read-only) + print.
import * as React from 'react';
import { buildCurrentState, buildReviewActuals, fobByRange, buildPerLocationRows } from '../engine/one-pager-data.js';
import { metricAvg } from '../engine/metric-source.js';
import { matchedVsLY } from '../engine/vs-ly.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC, EVENT_TYPES, supervisorGroups } from '../constants.js';
import { supabase } from '../lib/supabase.js';

// Stream a SAGE analysis (same edge-function contract as sage.js callSageStream).
async function askSageStream(prompt, systemPrompt, onChunk) {
  const sbUrl = import.meta.env.VITE_SUPABASE_URL || '';
  if (!sbUrl) throw new Error('Supabase not configured.');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sign in to use AI analysis.');
  const res = await fetch(`${sbUrl}/functions/v1/sage-chat`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemPrompt }) });
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || ('SAGE error ' + res.status));
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) { const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || '';
    for (const line of lines) { if (!line.startsWith('data: ')) continue; const dt = line.slice(6).trim();
      if (dt === '[DONE]') return; try { const p = JSON.parse(dt); if (p.text) onChunk(p.text); if (p.error) throw new Error(p.error); } catch (e) { if (e.message && !e.message.startsWith('data:')) throw e; } } }
}

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const iso = d => d.toISOString().slice(0, 10);
const fmtV = (v, fmt) => {
  if (v == null || isNaN(v)) return '—';
  if (fmt === '$') return '$' + Math.round(v).toLocaleString();
  if (fmt === '%') return (v * 100).toFixed(1) + '%';
  if (fmt === 's') return Math.round(v) + 's';
  if (fmt === 'n') return (Math.round(v * 10) / 10).toString();
  return String(v);
};
const pct = v => v == null || isNaN(v) ? '—' : ((v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%');

// The six selectable panels (Notes 49 "build your own"). Order = display order.
export const ONEPAGER_PANELS = [
  { key: 'sales',    label: 'Sales / GC' },
  { key: 'fob',      label: 'FOB / Food Cost' },
  { key: 'labor',    label: 'Labor' },
  { key: 'service',  label: 'Service' },
  { key: 'controls', label: 'Controls' },
  { key: 'voice',    label: 'Guest Voice' },
];
const ALL_PANEL_KEYS = ONEPAGER_PANELS.map(p => p.key);

export function AboveStoreOnePager({ ds, settings, userEvents, onClose, initialScope, initialPeriod, initialPanels }) {
  const { useState, useMemo } = React;
  const [scope, setScope] = useState(initialScope || 'all');
  const [period, setPeriod] = useState(initialPeriod || 'mtd');
  // Which panels are visible ("build your own"). A subscription can pin a subset.
  const [panels, setPanels] = useState(() => new Set(
    Array.isArray(initialPanels) && initialPanels.length ? initialPanels.filter(k => ALL_PANEL_KEYS.includes(k)) : ALL_PANEL_KEYS));
  const showP = k => panels.has(k);
  const togglePanel = k => setPanels(prev => { const n = new Set(prev); if (n.has(k)) { if (n.size > 1) n.delete(k); } else n.add(k); return n; });
  const [ai, setAi] = useState('');            // AI narrative (streamed)
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const fobRows = (ds && ds.fobRows) || [];

  const groups = useMemo(() => { try { return supervisorGroups() || {}; } catch { return {}; } }, []);
  const locs = useMemo(() => {
    if (scope.startsWith('grp:')) return (groups[scope.slice(4)] || []).map(l => String(l).replace(/^0+/, ''));
    return Object.keys(STORE_NAMES).filter(l =>
      scope === 'all' ? true : scope === 'ok' ? (INV_ORG_COORDS[l] || {}).state === 'OK'
        : scope === 'fl' ? (INV_ORG_COORDS[l] || {}).state === 'FL' : l === scope);
  }, [scope, groups]);
  const scopeLabel = scope === 'all' ? 'All 27 stores' : scope === 'ok' ? 'Oklahoma' : scope === 'fl' ? 'Florida'
    : scope.startsWith('grp:') ? ('Patch: ' + scope.slice(4) + ' (' + locs.length + ')') : (sNameC(scope) || scope);

  const range = useMemo(() => {
    const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
    if (period === 'mtd') return { s: iso(new Date(y, m, 1)), e: iso(now), label: 'Month-to-date' };
    if (period === 'lastweek') { const e = new Date(now); e.setDate(e.getDate() - 1); const s = new Date(e); s.setDate(s.getDate() - 6); return { s: iso(s), e: iso(e), label: 'Last 7 days' }; }
    const ls = new Date(y, m - 1, 1), le = new Date(y, m, 0); return { s: iso(ls), e: iso(le), label: 'Last month' };
  }, [period]);

  const data = useMemo(() => {
    try {
      const cs = buildCurrentState(ds, fobRows, locs, range);      // [{key,label,actual,target,fmt,lowerBetter}]
      const rv = buildReviewActuals(ds, locs, range);              // {gcVsLY, osat, osatB2B, accB2B, kvsPerGc, kvsHealthy, projSales, ...}
      const salesVsLY = matchedVsLY(ds, locs, range, 'sales');
      const byKey = {}; for (const r of cs) byKey[r.key] = r;
      const controls = {
        cashOS: metricAvg(ds, locs, range, 'cashOSPct'),
        tRedA: metricAvg(ds, locs, range, 'tRedAPct'),
        disc: metricAvg(ds, locs, range, 'discPct'),
      };
      const fobAgg = Object.values(fobByRange(fobRows, range));
      const fob$ = fobAgg.reduce((s, a) => s + (a.fob$ || 0), 0);
      const fobProd = fobAgg.reduce((s, a) => s + (a.prodSales || 0), 0);
      const projSales = rv.projSales;
      const pace = (projSales && byKey.sales?.actual) ? byKey.sales.actual / projSales : null;
      const perStore = locs.length > 1 ? buildPerLocationRows(ds, fobRows, locs, range, null) : [];
      return { byKey, rv, salesVsLY, controls, fob$, fobProd, projSales, pace, perStore, err: null };
    } catch (e) { return { err: String(e?.message || e) }; }
  }, [ds, fobRows, locs, range]);

  // Upcoming events (next 21 days) for the scope, deduped by label.
  const upcoming = useMemo(() => {
    const start = new Date(); const end = new Date(); end.setDate(end.getDate() + 21);
    const seen = new Set(), out = [];
    for (const l of locs) { const m = (userEvents || {})[l]; if (!m) continue;
      for (const dk of Object.keys(m)) { const d = new Date(dk + 'T12:00:00'); if (d < start || d > end) continue;
        const e = m[dk]; const key = dk + '|' + (e.label || e.type); if (seen.has(key)) continue; seen.add(key);
        out.push({ dk, ...e }); } }
    return out.sort((a, b) => a.dk.localeCompare(b.dk)).slice(0, 24);
  }, [locs, userEvents]);

  // Build a compact numeric brief of the rollup for the AI + print.
  const briefLines = () => {
    const d = data; if (d.err) return [];
    const L = [];
    if (showP('sales')) L.push(`Sales: ${fmtV(d.byKey.sales?.actual, '$')}; vs LY ${pct(d.salesVsLY?.pct)}; GC vs LY ${pct(d.rv.gcVsLY)}${d.projSales ? `; pace to projection ${d.pace ? (d.pace * 100).toFixed(0) + '%' : '—'}` : ''}`);
    if (showP('fob')) L.push(`FOB %: ${fmtV(d.byKey.fobPct?.actual, '%')} (target ${fmtV(d.byKey.fobPct?.target, '%')})`);
    if (showP('labor')) L.push(`Labor %: ${fmtV(d.byKey.laborPct?.actual, '%')} (target ${fmtV(d.byKey.laborPct?.target, '%')}); TPPH ${fmtV(d.byKey.tpph?.actual, 'n')}`);
    if (showP('service')) L.push(`Service: OEPE ${fmtV(d.byKey.oepe?.actual, 's')} (tgt ${fmtV(d.byKey.oepe?.target, 's')}); R2P ${fmtV(d.byKey.r2p?.actual, 's')}; KVS/GC ${fmtV(d.rv.kvsPerGc, 's')}`);
    if (showP('controls')) L.push(`Controls: Cash O/S ${fmtV(d.controls.cashOS, '%')}; T-Reds After ${fmtV(d.controls.tRedA, '%')}; Discount ${fmtV(d.controls.disc, '%')}`);
    if (showP('voice')) L.push(`Voice: OSAT 5★ ${fmtV(d.rv.osat, '%')} (tgt ${fmtV(d.rv.osatTarget, '%')}); OSAT B2B ${fmtV(d.rv.osatB2B, '%')}`);
    if (upcoming.length) L.push(`Upcoming (21d): ${upcoming.slice(0, 8).map(e => e.dk.slice(5) + ' ' + (e.label || e.type)).join('; ')}`);
    return L;
  };
  const runAI = async () => {
    setAiBusy(true); setAiErr(''); setAi('');
    const sys = `You are SAGE, an above-store operations analyst for a McDonald's franchise. Given a period rollup for a store group, write a SHORT executive read (120-180 words): 2-3 sentences on what's driving results (positive AND negative), citing the specific metrics; call out the biggest risk and the biggest win; end with one concrete focus. Be direct, no fluff, no restating every number.`;
    const prompt = `Scope: ${scopeLabel}. Period: ${range.label} (${range.s} to ${range.e}).\n\n${briefLines().join('\n')}\n\nWrite the executive read.`;
    try { await askSageStream(prompt, sys, chunk => setAi(a => a + chunk)); }
    catch (e) { setAiErr(String(e?.message || e)); }
    setAiBusy(false);
  };
  const printOnePager = () => {
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const lines = briefLines().map(l => `<li>${esc(l)}</li>`).join('');
    const aiHtml = ai ? `<h2>Analysis</h2><p>${esc(ai).replace(/\n/g, '<br>')}</p>` : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Above-Store One-Pager — ${esc(scopeLabel)}</title>
      <style>body{font:12px -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:28px;max-width:720px}h1{font-size:17px;margin:0 0 2px}h2{font-size:12px;text-transform:uppercase;color:#666;margin:16px 0 4px}.sub{color:#666;font-size:11px;margin-bottom:10px}ul{margin:0;padding-left:18px}li{margin:3px 0}@media print{body{margin:0}}</style></head>
      <body><h1>Above-Store One-Pager — ${esc(scopeLabel)}</h1><div class="sub">${esc(range.label)} (${range.s} → ${range.e}) · printed ${new Date().toLocaleDateString()}</div>
      <h2>Rollup</h2><ul>${lines}</ul>${aiHtml}</body></html>`;
    const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  const badge = (actual, target, lowerBetter) => {
    if (actual == null || target == null) return 'var(--text3)';
    const good = lowerBetter ? actual <= target : actual >= target;
    return good ? '#4ade80' : '#f87171';
  };
  const Row = (label, actual, target, fmt, lowerBetter, extra) => div({ key: label, style: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0', borderTop: '1px solid var(--bdr)' } },
    span({ style: { flex: 1, fontSize: '11px', color: 'var(--text2)' } }, label),
    extra ? span({ style: { fontSize: '10px', color: 'var(--text3)' } }, extra) : null,
    span({ style: { fontSize: '12px', fontWeight: 700, color: badge(actual, target, lowerBetter), fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' } }, fmtV(actual, fmt)),
    span({ style: { fontSize: '9px', color: 'var(--text3)', minWidth: 54, textAlign: 'right' } }, target != null ? 'tgt ' + fmtV(target, fmt) : ''));
  const Section = (title, icon, ...kids) => div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '10px 12px' } },
    div({ style: { fontSize: '11px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 } }, (icon ? icon + ' ' : '') + title), ...kids);

  const d = data;
  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 462, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 24 } },
    div({ style: { background: 'var(--surf)', border: '.5px solid var(--bdr2)', borderRadius: 'var(--rl)', width: '100%', maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' } },
      // header
      div({ style: { padding: '12px 16px', borderBottom: '.5px solid var(--bdr)', background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '📄'),
        div({ style: { flex: 1, minWidth: 160 } },
          div({ style: { fontSize: '13px', fontWeight: 800, color: 'var(--text)' } }, 'Above-Store One-Pager'),
          div({ style: { fontSize: '9px', color: 'var(--text3)' } }, scopeLabel + ' · ' + range.label + ' (' + range.s + ' → ' + range.e + ')')),
        div({ style: { display: 'flex', gap: 2, border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden' } },
          ...[['mtd', 'MTD'], ['lastweek', 'Last wk'], ['lastmonth', 'Last mo']].map(([v, l]) => btn({ key: v, onClick: () => setPeriod(v), style: { padding: '3px 8px', border: 'none', fontSize: '9px', cursor: 'pointer', background: period === v ? 'var(--amber)' : 'transparent', color: period === v ? '#000' : 'var(--text3)' } }, l))),
        div({ style: { display: 'flex', gap: 2, border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden' } },
          ...[['all', 'All'], ['ok', 'OK'], ['fl', 'FL']].map(([v, l]) => btn({ key: v, onClick: () => setScope(v), style: { padding: '3px 8px', border: 'none', fontSize: '9px', cursor: 'pointer', background: scope === v ? 'var(--adim)' : 'transparent', color: scope === v ? 'var(--amber)' : 'var(--text3)' } }, l))),
        Object.keys(groups).length ? h('select', { value: scope.startsWith('grp:') ? scope : '', onChange: e => e.target.value && setScope(e.target.value), title: 'Supervisor patch', style: { fontSize: '9px', padding: '3px 5px', background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)' } },
          h('option', { value: '' }, '— patch —'), Object.keys(groups).sort().map(g => h('option', { key: g, value: 'grp:' + g }, g))) : null,
        h('select', { value: STORE_NAMES[scope] ? scope : '', onChange: e => e.target.value && setScope(e.target.value), style: { fontSize: '9px', padding: '3px 5px', background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)' } },
          h('option', { value: '' }, '— store —'), Object.keys(STORE_NAMES).sort((a, b) => (STORE_NAMES[a] || a).localeCompare(STORE_NAMES[b] || b)).map(l => h('option', { key: l, value: l }, sNameC(l)))),
        btn({ className: 'btn btn-sm', disabled: aiBusy, style: { fontSize: '9px', background: 'rgba(129,140,248,.1)', borderColor: 'rgba(129,140,248,.35)', color: '#a5b4fc' }, onClick: runAI }, aiBusy ? '🧠 …' : '🧠 Analyze'),
        btn({ className: 'btn btn-sm', style: { fontSize: '9px' }, onClick: printOnePager, title: 'Print this rollup' }, '🖨'),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),
      // panel toggles ("build your own" — Notes 49)
      div({ style: { padding: '6px 16px', borderBottom: '.5px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'var(--surf)' } },
        span({ style: { fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 } }, 'Panels'),
        ...ONEPAGER_PANELS.map(p => btn({ key: p.key, onClick: () => togglePanel(p.key),
          title: showP(p.key) ? 'Hide ' + p.label : 'Show ' + p.label,
          style: { padding: '2px 8px', fontSize: '9px', borderRadius: 999, cursor: 'pointer', border: '.5px solid ' + (showP(p.key) ? 'var(--amber)' : 'var(--bdr)'),
            background: showP(p.key) ? 'var(--adim)' : 'transparent', color: showP(p.key) ? 'var(--amber)' : 'var(--text3)', fontWeight: showP(p.key) ? 700 : 400 } },
          (showP(p.key) ? '✓ ' : '') + p.label)),
        panels.size < ALL_PANEL_KEYS.length ? btn({ onClick: () => setPanels(new Set(ALL_PANEL_KEYS)), style: { padding: '2px 8px', fontSize: '9px', borderRadius: 999, cursor: 'pointer', border: '.5px solid var(--bdr)', background: 'transparent', color: 'var(--text2)' } }, 'All') : null),
      // body
      d.err ? div({ style: { padding: 30, color: '#fca5a5', fontSize: '12px' } }, 'Could not build rollup: ' + d.err)
      : div({ style: { flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 } },
        // AI narrative
        (ai || aiBusy || aiErr) ? div({ style: { border: '.5px solid rgba(129,140,248,.35)', background: 'rgba(129,140,248,.06)', borderRadius: 8, padding: '10px 12px' } },
          div({ style: { fontSize: '10px', fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 } }, '🧠 Analysis'),
          aiErr ? div({ style: { fontSize: '11px', color: '#fca5a5' } }, aiErr)
          : div({ style: { fontSize: '11.5px', color: 'var(--text2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' } }, ai || 'Thinking…')) : null,
        div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(400px,100%),1fr))', gap: 12 } },
        // Sales / GC
        showP('sales') && Section('Sales / GC', '💵',
          Row('Product Sales', d.byKey.sales?.actual, null, '$'),
          div({ key: 'svly', style: { display: 'flex', padding: '4px 0', borderTop: '1px solid var(--bdr)', fontSize: '11px' } }, span({ style: { flex: 1, color: 'var(--text2)' } }, 'Sales vs LY (matched)'), span({ style: { fontWeight: 700, color: (d.salesVsLY?.pct || 0) >= 0 ? '#4ade80' : '#f87171' } }, pct(d.salesVsLY?.pct))),
          div({ key: 'gcly', style: { display: 'flex', padding: '4px 0', borderTop: '1px solid var(--bdr)', fontSize: '11px' } }, span({ style: { flex: 1, color: 'var(--text2)' } }, 'Guest Counts vs LY'), span({ style: { fontWeight: 700, color: (d.rv.gcVsLY || 0) >= 0 ? '#4ade80' : '#f87171' } }, pct(d.rv.gcVsLY))),
          d.projSales ? div({ key: 'pace', style: { display: 'flex', padding: '4px 0', borderTop: '1px solid var(--bdr)', fontSize: '11px' } }, span({ style: { flex: 1, color: 'var(--text2)' } }, 'Pace to projection'), span({ style: { fontWeight: 700, color: (d.pace || 0) >= 1 ? '#4ade80' : '#f5bc00' } }, d.pace ? (d.pace * 100).toFixed(0) + '%' : '—')) : null),
        // FOB
        showP('fob') && Section('FOB / Food Cost', '🥗',
          Row('FOB %', d.byKey.fobPct?.actual, d.byKey.fobPct?.target, '%', true),
          div({ key: 'fobd', style: { fontSize: '9px', color: 'var(--text3)', paddingTop: 3 } }, 'Σ$ ' + fmtV(d.fob$, '$') + ' ÷ Σ prod-sales ' + fmtV(d.fobProd, '$') + ' (dollar-weighted)')),
        // Labor
        showP('labor') && Section('Labor', '👥',
          Row('Labor %', d.byKey.laborPct?.actual, d.byKey.laborPct?.target, '%', true),
          Row('TPPH', d.byKey.tpph?.actual, d.byKey.tpph?.target, 'n', false)),
        // Service / Speed
        showP('service') && Section('Service', '🚗',
          Row('OEPE', d.byKey.oepe?.actual, d.byKey.oepe?.target, 's', true),
          Row('R2P', d.byKey.r2p?.actual, d.byKey.r2p?.target, 's', true),
          Row('KVS Time / GC', d.rv.kvsPerGc, d.rv.kvsTimeTarget, 's', true)),
        // Controls
        showP('controls') && Section('Controls', '🎛',
          Row('Cash Over/Short %', d.controls.cashOS, null, '%'),
          Row('T-Reds After %', d.controls.tRedA, null, '%'),
          Row('Discount %', d.controls.disc, null, '%')),
        // Voice
        showP('voice') && Section('Guest Voice', '💬',
          Row('OSAT 5★', d.rv.osat, d.rv.osatTarget, '%', false),
          Row('OSAT B2B (1★)', d.rv.osatB2B, d.rv.osatB2BTarget, '%', true),
          d.rv.smgMonth ? div({ key: 'sm', style: { fontSize: '9px', color: 'var(--text3)', paddingTop: 3 } }, 'SMG month ' + d.rv.smgMonth + ' · n-weighted') : null),
        // Upcoming impacts
        Section('Upcoming Impacts (21 days)', '📅',
          upcoming.length === 0 ? div({ style: { fontSize: '10px', color: 'var(--text3)', padding: '4px 0' } }, 'No tagged events in the next 3 weeks for this scope.')
          : div({ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            ...upcoming.map((e, i) => { const et = EVENT_TYPES[e.type] || EVENT_TYPES.other;
              return div({ key: i, style: { display: 'flex', gap: 6, fontSize: '10px', alignItems: 'baseline', borderTop: i ? '1px solid var(--bdr)' : 'none', padding: '2px 0' } },
                span({ style: { color: 'var(--text3)', minWidth: 42 } }, e.dk.slice(5)),
                span(null, e.icon || et.icon),
                span({ style: { color: 'var(--text2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, e.label || et.label)); }))),
        (d.perStore && d.perStore.length) ? h('div', { key: 'ps', style: { gridColumn: '1/-1', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '10px 12px', overflowX: 'auto' } }, [
          h('div', { key: 't', style: { fontSize: '11px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 } }, '🏬 Per-store · worst sales vs LY first'),
          h('table', { key: 'tbl', style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' } }, [
            h('thead', { key: 'h' }, h('tr', null, ['Store', 'Sales', 'vs LY', 'FOB %', 'Labor %', 'OEPE'].map((t, i) => h('th', { key: i, style: { textAlign: i === 0 ? 'left' : 'right', fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text3)', padding: '3px 6px', borderBottom: '1px solid var(--bdr2)' } }, t)))),
            h('tbody', { key: 'b' }, d.perStore.map((r, i) => h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, [
              h('td', { key: 'a', style: { padding: '3px 6px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, sNameC(r.loc) || r.loc),
              h('td', { key: 's', style: { padding: '3px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, fmtV(r.netSales, '$')),
              h('td', { key: 'v', style: { padding: '3px 6px', textAlign: 'right', fontWeight: 700, color: (r.salesVsLYPct || 0) >= 0 ? '#4ade80' : '#f87171' } }, r.salesVsLYPct == null ? '—' : (r.salesVsLYPct >= 0 ? '+' : '') + r.salesVsLYPct.toFixed(1) + '%'),
              h('td', { key: 'f', style: { padding: '3px 6px', textAlign: 'right', color: badge(r.fobPct, r.fobTarget, true) } }, fmtV(r.fobPct, '%')),
              h('td', { key: 'l', style: { padding: '3px 6px', textAlign: 'right', color: badge(r.laborPct, r.laborTarget, true) } }, fmtV(r.laborPct, '%')),
              h('td', { key: 'o', style: { padding: '3px 6px', textAlign: 'right' } }, fmtV(r.oepe, 's')),
            ])))
          ])
        ]) : null)),
      // footer
      div({ style: { padding: '8px 16px', borderTop: '.5px solid var(--bdr)', background: 'var(--surf2)', fontSize: '9px', color: 'var(--text3)' } },
        'v1 rollup — Scheduling depth + AI narrative + per-panel drilldown next. Green = at/better than target, red = worse.')));
}
