// @ts-nocheck
import * as React from 'react';
import { computeInsights, normLoc } from '../engine/insights.js';
import { METRIC_CATEGORIES, findMetric, computeCustomSignal, shouldRetire, getConditionLabel } from '../engine/signal-registry.js';
import { saveCustomSignal, updateCustomSignal, loadDailyActivity, triggerDarSync } from '../lib/supabase.js';
import { STORE_NAMES } from '../constants.js';

const h = React.createElement;
const { useState: uSt, useMemo: uM, useEffect: uE, useCallback: uCB } = React;

const amber = '#f59e0b', grn = '#10b981', red = '#ef4444', muted = '#6b7280', blue = '#60a5fa';
const surf2 = 'rgba(255,255,255,.04)', bdr = 'rgba(255,255,255,.1)';

const DOMAINS = [
  { key: null, label: 'All' }, { key: 'service', label: 'Service' }, { key: 'sales', label: 'Sales' },
  { key: 'labor', label: 'Labor' }, { key: 'food_cost', label: 'Food Cost' }, { key: 'customer', label: 'Customer' },
];
const CASCADE_IDS = ['schedule_gap_oepe', 'oepe_kvs', 'oepe_sales', 'kvs_service_sales', 'schedule_gap_sales'];

// ── Shared helpers ────────────────────────────────────────────────────────────
function rColor(r, expectedDir) {
  if (r == null) return muted;
  const a = Math.abs(r);
  if (a < 0.20) return muted;
  const dirMatch = !expectedDir ||
    (expectedDir === 'negative' && r < 0) || (expectedDir === 'positive' && r > 0) || expectedDir === null;
  if (!dirMatch) return muted;
  if (a >= 0.50) return grn;
  if (a >= 0.30) return amber;
  return muted;
}

function rColorSimple(r) {
  if (r == null) return muted;
  const a = Math.abs(r);
  if (a >= 0.50) return grn;
  if (a >= 0.30) return amber;
  return muted;
}

function thresholdLabel(r, n, expectedDir) {
  const a = Math.abs(r || 0);
  if (a < 0.20 || (n || 0) < 8) return 'No effect';
  if (expectedDir) {
    const dirMatch = (expectedDir === 'negative' && r < 0) || (expectedDir === 'positive' && r > 0);
    if (!dirMatch) return 'No effect';
  }
  if (a >= 0.50) return 'Out of range';
  if (a >= 0.30) return 'Within tolerance';
  return 'No effect';
}

function StatusChip({ r, n, confirmed, expectedDir }) {
  const thr = thresholdLabel(r, n, expectedDir);
  if (thr === 'No effect')
    return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(107,114,128,.15)', color: muted } }, 'No effect');
  if (thr === 'Out of range')
    return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(16,185,129,.12)', color: grn } }, '↑ Out of range');
  if (confirmed)
    return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(245,158,11,.12)', color: amber } }, '~ Within tolerance');
  return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(245,158,11,.08)', color: amber } }, '~ Plausible');
}

function CorrelationBar({ r }) {
  const a = Math.abs(r || 0), col = rColorSimple(r);
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
    h('div', { style: { flex: 1, height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' } },
      h('div', { style: { width: Math.min(100, a * 100) + '%', height: '100%', background: col, borderRadius: 3, transition: 'width .4s' } })
    ),
    h('span', { style: { fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: col, minWidth: 44 } },
      r != null ? (r >= 0 ? '+' : '') + r.toFixed(3) : '—'),
  );
}

function pillBtn(active, onClick, label) {
  return h('button', { onClick, style: {
    padding: '4px 12px', borderRadius: '99px',
    border: `1px solid ${active ? 'rgba(245,158,11,.4)' : bdr}`,
    background: active ? 'rgba(245,158,11,.1)' : 'transparent',
    color: active ? amber : muted, fontSize: 11, fontWeight: active ? 700 : 400, cursor: 'pointer',
  } }, label);
}

// ── Built-in Signal Card ──────────────────────────────────────────────────────
function SignalCard({ sig, expanded, onToggle }) {
  const col = rColor(sig.r, sig.expectedDir);
  const isExp = expanded === sig.id;
  const thr = thresholdLabel(sig.r, sig.n, sig.expectedDir);

  return h('div', { style: {
    border: `1px solid ${thr === 'Out of range' ? 'rgba(16,185,129,.25)' : sig.confirmed ? 'rgba(245,158,11,.2)' : bdr}`,
    borderRadius: 8, background: thr === 'Out of range' ? 'rgba(16,185,129,.03)' : surf2, marginBottom: 10, overflow: 'hidden',
  } },
    h('div', { onClick: onToggle, style: { cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, userSelect: 'none' } },
      h('div', { style: {
        width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
        background: `conic-gradient(${col} ${Math.abs(sig.r || 0) * 360}deg, rgba(255,255,255,.08) 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      } },
        h('div', { style: {
          width: 36, height: 36, borderRadius: '50%', background: 'var(--bg,#111827)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: col,
        } }, sig.r != null ? (sig.r >= 0 ? '+' : '') + sig.r.toFixed(2) : '—')
      ),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 } },
          h('span', { style: { fontWeight: 700, fontSize: 13 } }, sig.name),
          h(StatusChip, { r: sig.r, n: sig.n, confirmed: sig.confirmed, expectedDir: sig.expectedDir }),
          sig.domain && h('span', { style: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', padding: '1px 6px', borderRadius: '99px', background: 'rgba(255,255,255,.06)', color: muted } }, sig.domain.replace('_', ' ')),
        ),
        h('div', { style: { fontSize: 11, color: muted } }, sig.description),
        sig.note && h('div', { style: { fontSize: 10, color: amber, marginTop: 2 } }, '⚠ ' + sig.note),
      ),
      h('div', { style: { textAlign: 'right', flexShrink: 0 } },
        h('div', { style: { fontSize: 10, color: muted } }, 'n = ' + (sig.n || 0)),
        h('div', { style: { fontSize: 10, color: muted, marginTop: 1 } }, !sig.r || Math.abs(sig.r) < 0.20 ? 'No signal' : sig.confirmed ? Math.abs(sig.r) >= 0.70 ? 'Strong' : 'Moderate' : 'Plausible'),
      ),
      h('span', { style: { fontSize: 13, color: muted, transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none' } }, '▾'),
    ),
    isExp && h('div', { style: { padding: '0 14px 12px', borderTop: `1px solid ${bdr}` } },
      h('div', { style: { display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap' } },
        h('div', { style: { flex: 1, minWidth: 200 } },
          h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: 6 } }, 'Correlation Strength'),
          h(CorrelationBar, { r: sig.r }),
          h('div', { style: { marginTop: 6, fontSize: 10, color: muted } },
            'Direction: ',
            h('span', null, sig.direction === 'negative' ? '↓ negative (inverse)' : '↑ positive (direct)'),
            sig.expectedDir && h('span', { style: { color: sig.direction === sig.expectedDir ? grn : red } },
              ' — ' + (sig.direction === sig.expectedDir ? '✓ as expected' : '✗ unexpected direction')),
          ),
        ),
        h('div', { style: { flex: 1, minWidth: 200 } },
          h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: 6 } }, 'Data Points'),
          h('div', { style: { fontSize: 12 } },
            h('span', { style: { fontFamily: 'monospace', fontWeight: 700, color: blue } }, sig.n || 0), ' matched pairs',
          ),
          h('div', { style: { fontSize: 10, color: muted, marginTop: 4 } }, 'X: ', h('em', null, sig.xLabel)),
          h('div', { style: { fontSize: 10, color: muted } }, 'Y: ', h('em', null, sig.yLabel)),
        ),
        h('div', { style: { flex: 1, minWidth: 200 } },
          h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: 6 } }, 'Assessment'),
          h('div', { style: { fontSize: 11, lineHeight: 1.5 } },
            thr === 'Out of range'
              ? `Signal confirmed and significant (|r| = ${Math.abs(sig.r).toFixed(2)}). This relationship is strong enough to act on — investigate root cause.`
              : thr === 'Within tolerance'
              ? `Relationship detected but within acceptable range (|r| = ${Math.abs(sig.r).toFixed(2)}). Monitor for strengthening. More data improves confidence.`
              : `No meaningful statistical relationship found yet (|r| = ${Math.abs(sig.r || 0).toFixed(2)}). These metrics may be independent, or more data is needed.`),
        ),
      ),
    ),
  );
}

// ── Cascade Chain ─────────────────────────────────────────────────────────────
function CascadeChain({ signals }) {
  const cascadeMap = {};
  for (const s of (signals || [])) { if (CASCADE_IDS.includes(s.id)) cascadeMap[s.id] = s; }
  const confirmedCascade = Object.values(cascadeMap).filter(s => s.confirmed).length;
  if (confirmedCascade < 2) return null;
  const nodes = [
    { id: 'schedule_gap_oepe', label: 'Scheduling Gap' }, { id: 'oepe_kvs', label: 'OEPE Speed' },
    { id: 'kvs_service_sales', label: 'KVS / Throughput' }, { id: 'oepe_sales', label: 'Daily Sales', alt: 'schedule_gap_sales' },
  ];
  return h('div', { style: { marginBottom: 16, padding: '12px 14px', background: 'rgba(96,165,250,.05)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 8 } },
    h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: blue, marginBottom: 6 } }, '↳ Scheduling Cascade Active'),
    h('div', { style: { fontSize: 11, color: muted, marginBottom: 10, lineHeight: 1.5 } },
      `${confirmedCascade} linked signal${confirmedCascade > 1 ? 's' : ''} confirmed. Under-staffing is cascading through service speed into sales outcomes.`),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
      nodes.flatMap((node, i) => {
        const sig = cascadeMap[node.id] || cascadeMap[node.alt];
        const active = sig?.confirmed;
        const parts = [];
        if (i > 0) parts.push(h('span', { key: `a${i}`, style: { color: active ? blue : 'rgba(96,165,250,.3)', fontWeight: 700, fontSize: 12 } }, '→'));
        parts.push(h('div', { key: node.id, style: {
          padding: '3px 10px', borderRadius: '99px', fontSize: 11, fontWeight: 600,
          background: active ? 'rgba(96,165,250,.15)' : 'rgba(255,255,255,.04)',
          border: `1px solid ${active ? 'rgba(96,165,250,.35)' : 'rgba(255,255,255,.08)'}`,
          color: active ? blue : 'rgba(107,114,128,.6)',
        } }, node.label));
        return parts;
      })
    ),
  );
}

// ── Data Readiness ────────────────────────────────────────────────────────────
function DataReadiness({ ds }) {
  const checks = [
    { label: 'Labor Analysis', ok: (ds.laborRows?.length || 0) >= 30, count: ds.laborRows?.length || 0 },
    { label: 'Operations Report', ok: (ds.opsRows?.length || 0) >= 10, count: ds.opsRows?.length || 0 },
    { label: 'FOB Reports', ok: (ds.fobRows?.length || 0) >= 5, count: ds.fobRows?.length || 0 },
    { label: 'LifeLenz Schedule', ok: (ds.schedRows?.length || 0) >= 20, count: ds.schedRows?.length || 0 },
    { label: 'SMG FullScale', ok: (ds.smgFullscale?.length || 0) >= 3, count: ds.smgFullscale?.length || 0 },
    { label: 'Controls', ok: (ds.ctrlRows?.length || 0) >= 5, count: ds.ctrlRows?.length || 0 },
  ];
  return h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, padding: '10px 14px', background: surf2, border: `1px solid ${bdr}`, borderRadius: 8 } },
    h('div', { style: { width: '100%', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: 4 } }, 'Data available for signal detection'),
    checks.map(c => h('div', { key: c.label, style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: c.ok ? grn : c.count > 0 ? amber : muted } },
      h('span', null, c.ok ? '✓' : c.count > 0 ? '~' : '○'), c.label,
      h('span', { style: { fontFamily: 'monospace', fontSize: 10, color: muted } }, '(' + c.count + ')'),
    )),
  );
}

// ── Metric Selector ───────────────────────────────────────────────────────────
function MetricSelect({ value, onChange, label, excludeKey }) {
  const optStyle = { color: '#f1f5f9', background: '#1a1f2e' };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 } },
    h('label', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: muted } }, label),
    h('select', {
      value: value || '',
      onChange: e => onChange(e.target.value || null),
      style: { padding: '7px 10px', borderRadius: 6, background: '#1a1f2e', border: `1px solid ${bdr}`, color: '#f1f5f9', fontSize: 12, cursor: 'pointer' },
    },
      h('option', { value: '', style: optStyle }, '— select metric —'),
      METRIC_CATEGORIES.map(cat =>
        h('optgroup', { key: cat.key, label: cat.label },
          cat.metrics
            .filter(m => m.key !== excludeKey)
            .map(m => h('option', { key: m.key, value: m.key, style: optStyle }, m.label))
        )
      )
    ),
  );
}

// ── Condition Selector ────────────────────────────────────────────────────────
function ConditionSelect({ metaMeta, axisLabel, value, onChange, reference, onReferenceChange }) {
  const needsRef = value === 'high' || value === 'low';
  const condLabel = cond => {
    if (cond === 'all') return 'All';
    if (cond === 'high') return metaMeta?.better === 'lower' ? `High (worse)` : 'High';
    if (cond === 'low')  return metaMeta?.better === 'higher' ? `Low (worse)` : 'Low';
    if (cond === 'positive') return '> 0';
    if (cond === 'negative') return '< 0';
    return cond;
  };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
    h('label', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: muted } }, axisLabel + ' condition'),
    h('div', { style: { display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' } },
      ['all', 'high', 'low', 'positive', 'negative'].map(cond =>
        h('button', {
          key: cond, onClick: () => onChange(cond),
          style: {
            padding: '3px 9px', borderRadius: 6, fontSize: 10, cursor: 'pointer',
            border: `1px solid ${value === cond ? 'rgba(245,158,11,.5)' : bdr}`,
            background: value === cond ? 'rgba(245,158,11,.1)' : 'transparent',
            color: value === cond ? amber : muted, fontWeight: value === cond ? 700 : 400,
          }
        }, condLabel(cond))
      ),
      needsRef && h('select', {
        value: reference, onChange: e => onReferenceChange(e.target.value),
        style: { padding: '3px 8px', borderRadius: 6, background: '#1a1f2e', border: `1px solid ${bdr}`, color: '#f1f5f9', fontSize: 10 }
      },
        h('option', { value: 'median', style: { color: '#f1f5f9', background: '#1a1f2e' } }, 'split at median'),
        h('option', { value: 'average', style: { color: '#f1f5f9', background: '#1a1f2e' } }, 'split at average'),
      ),
    ),
  );
}

// ── Mini r sparkline ──────────────────────────────────────────────────────────
function MiniSparkline({ history }) {
  if (!history?.length) return null;
  const pts = history.slice(-20);
  const W = 160, H = 32, pad = 4;
  const ys = pts.map(p => Math.abs(p.r || 0));
  const maxY = Math.max(0.1, ...ys);
  const xStep = pts.length > 1 ? (W - pad * 2) / (pts.length - 1) : 0;
  const xs = pts.map((_, i) => pad + i * xStep);
  const yCoord = v => H - pad - (v / maxY) * (H - pad * 2);
  const polyPts = pts.map((p, i) => `${xs[i].toFixed(1)},${yCoord(Math.abs(p.r || 0)).toFixed(1)}`).join(' ');
  const lastR = pts[pts.length - 1]?.r || 0;
  const col = rColorSimple(lastR);
  return h('div', null,
    h('svg', { width: W, height: H, style: { display: 'block' } },
      h('polyline', { points: polyPts, fill: 'none', stroke: col, strokeWidth: 1.5, strokeLinejoin: 'round' }),
      h('circle', { cx: xs[pts.length - 1], cy: yCoord(ys[ys.length - 1]), r: 3, fill: col }),
    ),
    h('div', { style: { fontSize: 9, color: muted, marginTop: 2 } }, pts.length + ' data points · r trend'),
  );
}

// ── Signal Builder ────────────────────────────────────────────────────────────
function SignalBuilder({ ds, onSave, existingDefs }) {
  const [xMetric, setXMetric] = uSt(null);
  const [yMetric, setYMetric] = uSt(null);
  const [granularity, setGranularity] = uSt('daily');
  const [scope, setScope] = uSt('district');
  const [name, setName] = uSt('');
  const [preview, setPreview] = uSt(null);
  const [running, setRunning] = uSt(false);
  const [saving, setSaving] = uSt(false);
  const [error, setError] = uSt(null);
  const [xCondition, setXCondition] = uSt('all');
  const [xReference, setXReference] = uSt('median');
  const [yCondition, setYCondition] = uSt('all');
  const [yReference, setYReference] = uSt('median');

  const availLocs = uM(() => {
    const locs = new Set();
    [...(ds?.laborRows || []), ...(ds?.opsRows || [])].forEach(r => { if (r.loc) locs.add(String(parseInt(r.loc))); });
    return [...locs].sort((a, b) => (STORE_NAMES?.[a] || a).localeCompare(STORE_NAMES?.[b] || b));
  }, [ds]);

  const xMeta = xMetric ? findMetric(xMetric) : null;
  const yMeta = yMetric ? findMetric(yMetric) : null;

  // Auto-restrict granularity when a monthly-only metric is chosen
  uE(() => {
    if (xMeta && !xMeta.granularity.includes(granularity)) setGranularity('monthly');
    if (yMeta && !yMeta.granularity.includes(granularity)) setGranularity('monthly');
  }, [xMetric, yMetric]);

  const canRun = xMetric && yMetric && xMetric !== yMetric;
  const canSave = preview && preview.r != null && preview.n >= 5;
  const autoName = xMeta && yMeta ? `${xMeta.label} → ${yMeta.label}` : '';

  const alreadyExists = uM(() => {
    if (!xMetric || !yMetric) return false;
    return existingDefs.some(d => d.xMetric === xMetric && d.yMetric === yMetric && d.granularity === granularity);
  }, [existingDefs, xMetric, yMetric, granularity]);

  const runPreview = () => {
    if (!canRun) return;
    setRunning(true); setError(null); setPreview(null);
    try {
      const result = computeCustomSignal({ xMetric, yMetric, granularity, scope, xCondition, xReference, yCondition, yReference }, ds);
      setPreview(result);
    } catch (e) {
      setError('Computation error: ' + e.message);
    }
    setRunning(false);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const def = {
      name: (name.trim() || autoName).slice(0, 120),
      xMetric, yMetric, granularity, scope,
      xCondition, xReference, yCondition, yReference,
      latest_r: preview.r, latest_n: preview.n,
      history: [{ date: new Date().toISOString().slice(0, 10), r: preview.r, n: preview.n }],
      status: 'active', promoted_to: [],
    };
    const saved = await saveCustomSignal(def);
    if (saved) {
      onSave({ ...def, id: saved.id, votes: 0 });
      setXMetric(null); setYMetric(null); setName(''); setPreview(null); setScope('district'); setError(null);
      setXCondition('all'); setXReference('median'); setYCondition('all'); setYReference('median');
    } else {
      setError('Failed to save — check Supabase connection. (Run the custom_signals table SQL first if this is the first time.)');
    }
    setSaving(false);
  };

  return h('div', { style: { padding: 16, background: surf2, border: `1px solid ${bdr}`, borderRadius: 10, marginBottom: 20 } },
    h('div', { style: { fontSize: 13, fontWeight: 700, marginBottom: 14, color: amber } }, '+ Define New Signal'),
    // Metric selectors
    h('div', { style: { display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap', alignItems: 'flex-end' } },
      h(MetricSelect, { label: 'X Metric (cause / input)', value: xMetric, onChange: setXMetric, excludeKey: yMetric }),
      h('div', { style: { display: 'flex', alignItems: 'center', color: muted, fontSize: 18, paddingBottom: 2 } }, '→'),
      h(MetricSelect, { label: 'Y Metric (outcome / output)', value: yMetric, onChange: setYMetric, excludeKey: xMetric }),
    ),
    // Condition filters — only shown when metrics are selected
    (xMetric || yMetric) && h('div', { style: { display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap', padding: '10px 12px', background: 'rgba(245,158,11,.04)', border: '1px solid rgba(245,158,11,.12)', borderRadius: 8 } },
      h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: amber, letterSpacing: '.07em', width: '100%', marginBottom: 4 } }, 'Conditional filter (optional — narrows data before computing correlation)'),
      xMetric && h(ConditionSelect, { metaMeta: xMeta, axisLabel: 'X', value: xCondition, onChange: setXCondition, reference: xReference, onReferenceChange: setXReference }),
      yMetric && h(ConditionSelect, { metaMeta: yMeta, axisLabel: 'Y', value: yCondition, onChange: setYCondition, reference: yReference, onReferenceChange: setYReference }),
    ),
    // Options
    h('div', { style: { display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('label', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: muted } }, 'Granularity'),
        h('div', { style: { display: 'flex', gap: 6 } },
          ['daily', 'monthly'].map(g => {
            const supported = (!xMeta || xMeta.granularity.includes(g)) && (!yMeta || yMeta.granularity.includes(g));
            return h('button', { key: g, onClick: () => supported && setGranularity(g), style: {
              padding: '5px 12px', borderRadius: 6,
              border: `1px solid ${granularity === g ? 'rgba(245,158,11,.5)' : bdr}`,
              background: granularity === g ? 'rgba(245,158,11,.12)' : 'transparent',
              color: granularity === g ? amber : supported ? muted : 'rgba(107,114,128,.35)',
              fontSize: 11, cursor: supported ? 'pointer' : 'not-allowed', fontWeight: granularity === g ? 700 : 400,
            } }, g + (supported ? '' : ' (n/a)'));
          })
        ),
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('label', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: muted } }, 'Scope'),
        h('select', { value: scope, onChange: e => setScope(e.target.value), style: { padding: '6px 10px', borderRadius: 6, background: '#1a1f2e', border: `1px solid ${bdr}`, color: 'var(--text)', fontSize: 11, cursor: 'pointer' } },
          h('option', { value: 'district' }, 'All stores (district)'),
          availLocs.map(loc => h('option', { key: loc, value: loc }, STORE_NAMES?.[loc] ? `${STORE_NAMES[loc]} (${loc})` : `Store ${loc}`)),
        ),
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 } },
        h('label', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: muted } }, 'Signal Name (optional)'),
        h('input', { value: name, onChange: e => setName(e.target.value), placeholder: autoName || 'Auto-generated from metrics', style: { padding: '6px 10px', borderRadius: 6, background: '#1a1f2e', border: `1px solid ${bdr}`, color: 'var(--text)', fontSize: 11, outline: 'none' } }),
      ),
    ),
    alreadyExists && h('div', { style: { fontSize: 11, color: amber, marginBottom: 10, padding: '6px 10px', background: 'rgba(245,158,11,.08)', borderRadius: 6 } },
      '⚠ A signal with this X/Y/granularity combination already exists.'),
    // Actions
    h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
      h('button', { onClick: runPreview, disabled: !canRun || running, style: {
        padding: '7px 18px', borderRadius: 6, border: 'none',
        background: canRun ? amber : 'rgba(245,158,11,.2)',
        color: canRun ? '#000' : muted, fontSize: 12, fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed',
      } }, running ? 'Computing…' : '▶ Preview Correlation'),
      preview && canSave && h('button', { onClick: handleSave, disabled: saving, style: { padding: '7px 18px', borderRadius: 6, border: 'none', background: grn, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' } },
        saving ? 'Saving…' : '✓ Save Signal'),
      error && h('span', { style: { fontSize: 11, color: red } }, error),
    ),
    // Preview result
    preview && h('div', { style: { marginTop: 14, padding: '12px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 8, border: `1px solid ${bdr}` } },
      h('div', { style: { fontSize: 11, fontWeight: 700, color: muted, marginBottom: 8 } }, 'Preview result'),
      h('div', { style: { display: 'flex', gap: 24, flexWrap: 'wrap' } },
        h('div', { style: { flex: 1, minWidth: 160 } },
          h(CorrelationBar, { r: preview.r }),
          h('div', { style: { fontSize: 10, color: muted, marginTop: 4 } }, 'n = ' + preview.n + ' matched pairs'),
        ),
        h('div', { style: { flex: 1, minWidth: 160, fontSize: 11, color: muted, lineHeight: 1.6 } },
          preview.r != null
            ? h('div', null,
                h(StatusChip, { r: preview.r, n: preview.n, confirmed: preview.confirmed }),
                h('div', { style: { marginTop: 6 } },
                  Math.abs(preview.r) >= 0.50 ? 'Strong relationship — worth saving and promoting once confirmed.' :
                  Math.abs(preview.r) >= 0.30 ? 'Moderate relationship. Save it and let it accumulate more data.' :
                  'Weak or no signal. Try different metrics or adjust scope.'))
            : preview.n < 5
            ? 'Not enough matched pairs (' + preview.n + '). Upload more data or switch to monthly granularity.'
            : 'Could not compute — check that both metrics have uploaded data.',
        ),
      ),
    ),
  );
}

// ── Custom Signal Card ────────────────────────────────────────────────────────
function CustomSignalCard({ sig, def, expanded, onToggle, onPromote, onRetire, onVote, onDelete }) {
  const col = rColorSimple(sig?.r);
  const isExp = expanded === def.id;
  const thr = thresholdLabel(sig?.r, sig?.n);
  const canPromote = sig?.confirmed && def.status !== 'promoted';
  const retireProposed = shouldRetire(def, sig?.r, sig?.n);
  const xMeta = findMetric(def.xMetric);
  const yMeta = findMetric(def.yMetric);

  return h('div', { style: {
    border: `1px solid ${thr === 'Out of range' ? 'rgba(16,185,129,.3)' : canPromote ? 'rgba(245,158,11,.3)' : retireProposed ? 'rgba(239,68,68,.25)' : bdr}`,
    borderRadius: 8, background: surf2, marginBottom: 10, overflow: 'hidden',
  } },
    h('div', { onClick: onToggle, style: { cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, userSelect: 'none' } },
      // r circle
      h('div', { style: { width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(${col} ${Math.abs(sig?.r || 0) * 360}deg, rgba(255,255,255,.08) 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        h('div', { style: { width: 34, height: 34, borderRadius: '50%', background: 'var(--bg,#111827)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: col } },
          sig?.r != null ? (sig.r >= 0 ? '+' : '') + sig.r.toFixed(2) : '—'),
      ),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 } },
          h('span', { style: { fontWeight: 700, fontSize: 13 } }, def.name),
          h(StatusChip, { r: sig?.r, n: sig?.n, confirmed: sig?.confirmed }),
          def.status === 'promoted' && h('span', { style: { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: '99px', background: 'rgba(96,165,250,.15)', color: blue, border: '1px solid rgba(96,165,250,.3)' } }, '▲ PROMOTED'),
          retireProposed && h('span', { style: { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: '99px', background: 'rgba(239,68,68,.12)', color: red } }, 'Retire?'),
          h('span', { style: { fontSize: 9, padding: '1px 5px', borderRadius: '99px', background: 'rgba(255,255,255,.06)', color: muted } }, def.granularity),
        ),
        h('div', { style: { fontSize: 10, color: muted } },
          (xMeta?.label || def.xMetric) + ' → ' + (yMeta?.label || def.yMetric),
          def.scope !== 'district' && (STORE_NAMES?.[def.scope] ? ` · ${STORE_NAMES[def.scope]}` : ` · Store ${def.scope}`),
        ),
        (() => {
          const xCond = getConditionLabel(def.xCondition, def.xReference, xMeta);
          const yCond = getConditionLabel(def.yCondition, def.yReference, yMeta);
          if (!xCond && !yCond) return null;
          return h('div', { style: { fontSize: 10, color: amber, marginTop: 2 } },
            '⟁ when ' + [xCond ? `X ${xCond}` : null, yCond ? `Y ${yCond}` : null].filter(Boolean).join(' & '));
        })(),
      ),
      h('div', { style: { textAlign: 'right', flexShrink: 0, fontSize: 10, color: muted } },
        h('div', null, 'n = ' + (sig?.n || 0)),
        h('div', { style: { marginTop: 1 } }, (def.votes || 0) + ' votes'),
      ),
      h('span', { style: { fontSize: 13, color: muted, transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none' } }, '▾'),
    ),
    isExp && h('div', { style: { padding: '0 14px 14px', borderTop: `1px solid ${bdr}` } },
      h('div', { style: { display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap', marginBottom: 12 } },
        h('div', { style: { flex: 1, minWidth: 180 } },
          h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: 6 } }, 'Correlation'),
          h(CorrelationBar, { r: sig?.r }),
          h('div', { style: { marginTop: 6, fontSize: 10, color: muted } }, 'X: ', h('em', null, xMeta?.label || def.xMetric)),
          h('div', { style: { fontSize: 10, color: muted } }, 'Y: ', h('em', null, yMeta?.label || def.yMetric)),
        ),
        def.history?.length > 0 && h('div', { style: { flex: 1, minWidth: 180 } },
          h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: 6 } }, 'History'),
          h(MiniSparkline, { history: def.history }),
        ),
        sig?.regression && h('div', { style: { flex: 1, minWidth: 180 } },
          h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: 6 } }, 'Regression'),
          h('div', { style: { fontSize: 11, color: muted } }, 'Slope: ', h('span', { style: { fontFamily: 'monospace', color: col } }, sig.regression.slope.toFixed(4))),
          h('div', { style: { fontSize: 10, color: muted, marginTop: 2 } }, 'Each unit increase in X → Y changes by ', h('strong', null, sig.regression.slope.toFixed(4))),
        ),
      ),
      def.note && h('div', { style: { fontSize: 11, color: amber, marginBottom: 8, padding: '6px 10px', background: 'rgba(245,158,11,.08)', borderRadius: 6 } }, def.note),
      // Action buttons
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { onClick: () => onVote(def), style: { padding: '5px 12px', borderRadius: 6, border: `1px solid ${bdr}`, background: 'transparent', color: muted, fontSize: 11, cursor: 'pointer' } },
          '👍 ' + (def.votes || 0)),
        canPromote && h('button', { onClick: () => onPromote(def, sig), style: { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(96,165,250,.4)', background: 'rgba(96,165,250,.1)', color: blue, fontSize: 11, fontWeight: 700, cursor: 'pointer' } },
          '▲ Promote Signal'),
        def.status === 'promoted' && h('button', { onClick: () => onPromote(def, sig, true), style: { padding: '5px 12px', borderRadius: 6, border: `1px solid ${bdr}`, background: 'transparent', color: muted, fontSize: 11, cursor: 'pointer' } },
          'Demote'),
        retireProposed && h('button', { onClick: () => onRetire(def), style: { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.08)', color: red, fontSize: 11, cursor: 'pointer' } },
          '⚰ Send to Graveyard'),
        h('button', { onClick: () => onDelete(def), style: { padding: '5px 12px', borderRadius: 6, border: `1px solid ${bdr}`, background: 'transparent', color: muted, fontSize: 11, cursor: 'pointer', marginLeft: 'auto' } },
          '✕ Delete'),
      ),
    ),
  );
}

// ── Graveyard Tab ─────────────────────────────────────────────────────────────
function GraveyardTab({ defs, onRestore }) {
  const graveyardDefs = defs.filter(d => d.status === 'graveyard');
  if (!graveyardDefs.length)
    return h('div', { style: { textAlign: 'center', padding: '48px 24px', color: muted, fontSize: 12, border: `1px dashed ${bdr}`, borderRadius: 8 } },
      h('div', { style: { fontSize: 28, marginBottom: 10 } }, '⚰'),
      h('div', { style: { fontWeight: 700, color: 'var(--text)', marginBottom: 6 } }, 'Graveyard is empty'),
      'Signals with n ≥ 50 and |r| < 0.15 for 3 consecutive runs will be proposed for retirement.',
    );

  return h('div', null,
    h('div', { style: { fontSize: 11, color: muted, marginBottom: 16, lineHeight: 1.6, padding: '10px 14px', background: surf2, borderRadius: 8, border: `1px solid ${bdr}` } },
      '⚰ Retired signals — statistically no meaningful relationship was found. ',
      'This is valuable knowledge: these metric pairs are likely independent in your operation. ',
      'Archived for reference and never deleted.'),
    graveyardDefs.map(def => {
      const xMeta = findMetric(def.xMetric);
      const yMeta = findMetric(def.yMetric);
      return h('div', { key: def.id, style: { padding: '12px 14px', border: '1px solid rgba(107,114,128,.2)', borderRadius: 8, marginBottom: 8, background: 'rgba(107,114,128,.04)', display: 'flex', alignItems: 'center', gap: 12 } },
        h('div', { style: { flex: 1 } },
          h('div', { style: { fontWeight: 600, fontSize: 12, color: muted, marginBottom: 3 } }, def.name),
          h('div', { style: { fontSize: 10, color: 'rgba(107,114,128,.6)' } },
            (xMeta?.label || def.xMetric) + ' → ' + (yMeta?.label || def.yMetric),
            ' · final |r| = ' + (Math.abs(def.latest_r || 0)).toFixed(3) + ' (n = ' + (def.latest_n || 0) + ')'),
        ),
        h('button', { onClick: () => onRestore(def), style: { padding: '4px 12px', borderRadius: 6, border: `1px solid ${bdr}`, background: 'transparent', color: muted, fontSize: 11, cursor: 'pointer' } }, 'Restore'),
      );
    })
  );
}

// ── Promote Modal ─────────────────────────────────────────────────────────────
function PromoteModal({ def, sig, onConfirm, onCancel }) {
  const [selected, setSelected] = uSt(def.promoted_to || []);
  const toggle = key => setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  const options = [
    { key: 'projections', label: '▦ Projections', desc: 'Show a signal influence callout when this X metric is in range' },
    { key: 'morning_brief', label: '🌅 Morning Brief', desc: 'Flag this relationship in the daily store summary' },
    { key: 'sage', label: '🧠 SAGE', desc: 'Include this correlation in SAGE AI context when relevant' },
  ];
  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
    h('div', { style: { width: 420, background: 'var(--surf,#1a1f2e)', borderRadius: 12, padding: 24, border: `1px solid ${bdr}`, boxShadow: '0 20px 60px rgba(0,0,0,.5)' } },
      h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 6 } }, '▲ Promote Signal'),
      h('div', { style: { fontSize: 11, color: muted, marginBottom: 16, lineHeight: 1.5 } },
        `"${def.name}" has a confirmed correlation (r = ${sig?.r?.toFixed(3) || '?'}). Promoting integrates it into Meridian's intelligence layer.`),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 } },
        options.map(opt => h('div', { key: opt.key, onClick: () => toggle(opt.key), style: {
          padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${selected.includes(opt.key) ? blue : bdr}`,
          background: selected.includes(opt.key) ? 'rgba(96,165,250,.08)' : surf2,
        } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('input', { type: 'checkbox', checked: selected.includes(opt.key), readOnly: true, style: { accentColor: blue } }),
            h('span', { style: { fontWeight: 600, fontSize: 12, color: selected.includes(opt.key) ? blue : 'var(--text)' } }, opt.label),
          ),
          h('div', { style: { fontSize: 10, color: muted, marginTop: 3, marginLeft: 20 } }, opt.desc),
        ))
      ),
      h('div', { style: { display: 'flex', gap: 10, justifyContent: 'flex-end' } },
        h('button', { onClick: onCancel, style: { padding: '7px 16px', borderRadius: 6, border: `1px solid ${bdr}`, background: 'transparent', color: muted, fontSize: 12, cursor: 'pointer' } }, 'Cancel'),
        h('button', { onClick: () => onConfirm(selected), style: { padding: '7px 16px', borderRadius: 6, border: 'none', background: blue, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' } }, 'Promote'),
      ),
    ),
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
// ── Live Ops Tab ──────────────────────────────────────────────────────────────

const DT_RED = 240, DT_AMB = 200; // seconds
const PACE_AMB = 90, PACE_RED = 80; // % of mean
const LABOR_AMB = 110, LABOR_RED = 120; // % of needed
const ACC_AMB = 92, ACC_RED = 85; // % healthy (below = bad)

function fmtSecs(s) {
  if (s == null || isNaN(s)) return '—';
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(0) + '%';
}

function metricDot(col) {
  return h('span', { style: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 } });
}

function speedColor(s) {
  if (s == null) return muted;
  if (s > DT_RED) return red;
  if (s > DT_AMB) return amber;
  return grn;
}
function paceColor(pct) {
  if (pct == null) return muted;
  if (pct < PACE_RED) return red;
  if (pct < PACE_AMB) return amber;
  return grn;
}
function laborColor(pct) {
  if (pct == null) return muted;
  if (pct > LABOR_RED) return red;
  if (pct > LABOR_AMB) return amber;
  if (pct < 70) return red;
  if (pct < 80) return amber;
  return grn;
}
function accColor(pct) {
  if (pct == null) return muted;
  if (pct < ACC_RED) return red;
  if (pct < ACC_AMB) return amber;
  return grn;
}

function storeLocKey(loc7) {
  return String(parseInt(loc7, 10));
}

function aggregateByStore(rows) {
  const map = {};
  for (const r of rows) {
    if (!map[r.loc]) map[r.loc] = { loc: r.loc, sales: 0, meanSales: 0, dtTime: 0, dtCnt: 0, punched: 0, needed: 0, healthy: 0, unhealthy: 0, slots: [] };
    const s = map[r.loc];
    s.sales     += r.product_sales || 0;
    s.meanSales += r.mean_sales    || 0;
    s.dtTime    += r.dt_untilserve || 0;
    s.dtCnt     += r.dt_trans_cnt  || 0;
    s.punched   += r.actual_punched_hours || 0;
    s.needed    += r.total_needed_hours   || 0;
    s.healthy   += r.healthy_count   || 0;
    s.unhealthy += r.unhealthy_count || 0;
    s.slots.push(r);
  }
  return Object.values(map).map(s => {
    const key = storeLocKey(s.loc);
    return {
      ...s,
      key,
      storeName: STORE_NAMES?.[key] || `Store ${key}`,
      salesPct:  s.meanSales > 0 ? (s.sales / s.meanSales * 100) : null,
      dtAvgSec:  s.dtCnt > 0     ? (s.dtTime / s.dtCnt / 1000)   : null,
      laborPct:  s.needed > 0    ? (s.punched / s.needed * 100)  : null,
      accRate:   (s.healthy + s.unhealthy) > 0
                   ? (s.healthy / (s.healthy + s.unhealthy) * 100)
                   : null,
    };
  }).sort((a, b) => a.storeName.localeCompare(b.storeName));
}

function alertCount(store) {
  let n = 0;
  if (store.salesPct != null && store.salesPct < PACE_AMB) n++;
  if (store.dtAvgSec != null && store.dtAvgSec > DT_AMB)   n++;
  if (store.laborPct != null && store.laborPct > LABOR_AMB) n++;
  if (store.accRate  != null && store.accRate  < ACC_AMB)   n++;
  return n;
}

function HourlyDetail({ slots }) {
  const sorted = [...slots].sort((a, b) => a.hour_slot.localeCompare(b.hour_slot));
  const cellStyle = { padding: '5px 10px', fontSize: 11, textAlign: 'right' };
  const hdr = { ...cellStyle, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: muted, textAlign: 'right' };
  const lbl = { ...cellStyle, textAlign: 'left', color: muted };
  return h('div', { style: { padding: '10px 14px 14px', borderTop: `1px solid ${bdr}` } },
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
      h('thead', null,
        h('tr', null,
          h('th', { style: { ...hdr, textAlign: 'left' } }, 'Hour'),
          h('th', { style: hdr }, 'Sales'),
          h('th', { style: hdr }, 'vs Mean'),
          h('th', { style: hdr }, 'DT Speed'),
          h('th', { style: hdr }, 'Labor'),
          h('th', { style: hdr }, 'Accuracy'),
        )
      ),
      h('tbody', null,
        sorted.map(r => {
          const pace = r.mean_sales > 0 ? (r.product_sales / r.mean_sales * 100) : null;
          const dt   = r.dt_trans_cnt > 0 ? (r.dt_untilserve / r.dt_trans_cnt / 1000) : null;
          const lab  = r.total_needed_hours > 0 ? (r.actual_punched_hours / r.total_needed_hours * 100) : null;
          const acc  = (r.healthy_count + r.unhealthy_count) > 0
                         ? (r.healthy_count / (r.healthy_count + r.unhealthy_count) * 100) : null;
          // hour_slot "06:00" = ends at 6am → show as "5am"
          const end = parseInt(r.hour_slot, 10);
          const start = (end - 1 + 24) % 24;
          const fmt = h => h === 0 ? '12am' : h <= 11 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`;
          return h('tr', { key: r.hour_slot, style: { borderTop: `1px solid rgba(255,255,255,.04)` } },
            h('td', { style: lbl }, `${fmt(start)}–${fmt(end)}`),
            h('td', { style: cellStyle }, r.product_sales != null ? `$${r.product_sales.toLocaleString('en-US', {maximumFractionDigits:0})}` : '—'),
            h('td', { style: { ...cellStyle, color: paceColor(pace), fontWeight: 700 } }, pace != null ? `${pace > 100 ? '+' : ''}${(pace-100).toFixed(0)}%` : '—'),
            h('td', { style: { ...cellStyle, color: speedColor(dt), fontWeight: dt != null && dt > DT_AMB ? 700 : 400 } }, dt != null ? fmtSecs(dt) : '—'),
            h('td', { style: { ...cellStyle, color: laborColor(lab), fontWeight: lab != null && lab > LABOR_AMB ? 700 : 400 } }, lab != null ? fmtPct(lab) : '—'),
            h('td', { style: { ...cellStyle, color: accColor(acc) } }, acc != null ? fmtPct(acc) : '—'),
          );
        })
      )
    )
  );
}

function StoreRow({ store, expanded, onToggle }) {
  const alerts = alertCount(store);
  const isExp = expanded === store.loc;
  return h('div', { style: { border: `1px solid ${alerts >= 2 ? 'rgba(239,68,68,.25)' : alerts === 1 ? 'rgba(245,158,11,.2)' : bdr}`, borderRadius: 8, marginBottom: 6, overflow: 'hidden', background: alerts >= 2 ? 'rgba(239,68,68,.02)' : surf2 } },
    h('div', {
      onClick: onToggle,
      style: { cursor: 'pointer', padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 100px 28px', alignItems: 'center', gap: 8, userSelect: 'none' },
    },
      // Store name + alert badge
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        alerts > 0 && h('span', { style: { fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: '99px', background: alerts >= 2 ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.12)', color: alerts >= 2 ? red : amber, flexShrink: 0 } }, `${alerts} alert${alerts > 1 ? 's' : ''}`),
        h('span', { style: { fontWeight: 600, fontSize: 13 } }, store.storeName),
      ),
      // Sales pace
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' } },
        metricDot(paceColor(store.salesPct)),
        h('span', { style: { fontFamily: 'monospace', fontSize: 12, color: paceColor(store.salesPct), fontWeight: store.salesPct != null && store.salesPct < PACE_AMB ? 700 : 400 } },
          store.salesPct != null ? `${store.salesPct.toFixed(0)}%` : '—'),
      ),
      // DT speed
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' } },
        store.dtAvgSec != null ? metricDot(speedColor(store.dtAvgSec)) : null,
        h('span', { style: { fontFamily: 'monospace', fontSize: 12, color: speedColor(store.dtAvgSec), fontWeight: store.dtAvgSec != null && store.dtAvgSec > DT_AMB ? 700 : 400 } },
          store.dtAvgSec != null ? fmtSecs(store.dtAvgSec) : '—'),
      ),
      // Labor %
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' } },
        store.laborPct != null ? metricDot(laborColor(store.laborPct)) : null,
        h('span', { style: { fontFamily: 'monospace', fontSize: 12, color: laborColor(store.laborPct), fontWeight: store.laborPct != null && store.laborPct > LABOR_AMB ? 700 : 400 } },
          store.laborPct != null ? fmtPct(store.laborPct) : '—'),
      ),
      // Accuracy
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' } },
        store.accRate != null ? metricDot(accColor(store.accRate)) : null,
        h('span', { style: { fontFamily: 'monospace', fontSize: 12, color: accColor(store.accRate) } },
          store.accRate != null ? fmtPct(store.accRate) : '—'),
      ),
      h('span', { style: { fontSize: 12, color: muted, transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none', justifySelf: 'end' } }, '▾'),
    ),
    isExp && h(HourlyDetail, { slots: store.slots }),
  );
}

function LiveOpsTab() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = uSt(todayStr);
  const [rows, setRows] = uSt([]);
  const [loading, setLoading] = uSt(false);
  const [error, setError] = uSt(null);
  const [expanded, setExpanded] = uSt(null);
  const [syncing, setSyncing] = uSt(false);
  const [syncMsg, setSyncMsg] = uSt(null); // {type:'ok'|'err', text}

  const fetchRows = async (d) => {
    setLoading(true); setError(null);
    const data = await loadDailyActivity({ date: d });
    if (!data.length && d === todayStr) {
      const yd = new Date(); yd.setDate(yd.getDate() - 1);
      const yStr = yd.toISOString().slice(0, 10);
      const fallback = await loadDailyActivity({ date: yStr });
      if (fallback.length) { setDate(yStr); setRows(fallback); }
      else setRows([]);
    } else {
      setRows(data);
    }
    setLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null);
    const result = await triggerDarSync({ daysRecent: 1 });
    setSyncing(false);
    if (result?.error) {
      setSyncMsg({ type: 'err', text: result.error });
    } else {
      setSyncMsg({ type: 'ok', text: 'Sync started — fresh data arrives in ~10 min. Reload this tab when ready.' });
    }
  };

  uE(() => { fetchRows(date); }, [date]);

  const stores = uM(() => aggregateByStore(rows), [rows]);
  const alertStores = stores.filter(s => alertCount(s) > 0);
  const critStores  = stores.filter(s => alertCount(s) >= 2);

  const colHdr = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: muted, textAlign: 'right' };

  return h('div', null,
    // Toolbar
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: syncMsg ? 8 : 16, flexWrap: 'wrap' } },
      h('input', { type: 'date', value: date, max: todayStr,
        onChange: e => { setDate(e.target.value); setSyncMsg(null); },
        style: { padding: '5px 10px', borderRadius: 6, background: '#1a1f2e', border: `1px solid ${bdr}`, color: '#e5e7eb', fontSize: 12, cursor: 'pointer' },
      }),
      h('button', {
        onClick: handleSync, disabled: syncing || loading,
        style: { padding: '5px 12px', borderRadius: 6, border: `1px solid ${syncing ? bdr : 'rgba(245,158,11,.4)'}`, background: syncing ? 'transparent' : 'rgba(245,158,11,.08)', color: syncing ? muted : amber, fontSize: 12, fontWeight: 600, cursor: syncing ? 'default' : 'pointer' },
      }, syncing ? '⟳ Syncing…' : '⟳ Sync Now'),
      !loading && rows.length > 0 && h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginLeft: 4 } },
        critStores.length > 0 && h('div', { style: { padding: '4px 10px', borderRadius: '99px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', fontSize: 11, fontWeight: 700, color: red } }, `${critStores.length} critical`),
        h('div', { style: { padding: '4px 10px', borderRadius: '99px', background: alertStores.length ? 'rgba(245,158,11,.1)' : 'rgba(16,185,129,.08)', border: `1px solid ${alertStores.length ? 'rgba(245,158,11,.25)' : 'rgba(16,185,129,.2)'}`, fontSize: 11, fontWeight: 700, color: alertStores.length ? amber : grn } },
          alertStores.length ? `${alertStores.length} stores with alerts` : `All ${stores.length} stores nominal`),
        h('span', { style: { fontSize: 11, color: muted } }, `${stores.length} stores · ${rows.length} hour-slots`),
      ),
      loading && h('span', { style: { fontSize: 11, color: muted } }, 'Loading…'),
    ),
    syncMsg && h('div', { style: { marginBottom: 12, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: syncMsg.type === 'ok' ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)', border: `1px solid ${syncMsg.type === 'ok' ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'}`, color: syncMsg.type === 'ok' ? grn : red, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
      h('span', null, syncMsg.text),
      syncMsg.type === 'ok' && h('button', { onClick: () => { setSyncMsg(null); fetchRows(date); }, style: { padding: '3px 10px', borderRadius: 4, border: `1px solid rgba(16,185,129,.4)`, background: 'rgba(16,185,129,.1)', color: grn, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' } }, 'Reload'),
    ),

    !loading && rows.length > 0 && h('div', null,
      // Column headers
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 100px 28px', gap: 8, padding: '4px 14px', marginBottom: 4 } },
        h('div', { style: { ...colHdr, textAlign: 'left' } }, 'Store'),
        h('div', { style: colHdr }, 'Sales Pace'),
        h('div', { style: colHdr }, 'DT Speed'),
        h('div', { style: colHdr }, 'Labor vs Need'),
        h('div', { style: colHdr }, 'Accuracy'),
        h('div', null),
      ),
      // Sort: alerts-first, then alpha
      [...stores].sort((a, b) => alertCount(b) - alertCount(a) || a.storeName.localeCompare(b.storeName))
        .map(store => h(StoreRow, { key: store.loc, store, expanded, onToggle: () => setExpanded(expanded === store.loc ? null : store.loc) })),
    ),

    !loading && rows.length === 0 && h('div', { style: { textAlign: 'center', padding: '48px 24px', color: muted, fontSize: 13, border: `1px dashed ${bdr}`, borderRadius: 8 } },
      h('div', { style: { fontSize: 28, marginBottom: 12 } }, '📡'),
      h('div', { style: { fontWeight: 700, marginBottom: 8 } }, 'No data for this date'),
      'Daily activity syncs automatically at 5am CDT. Try selecting a recent date.',
    ),

    !loading && rows.length > 0 && h('div', { style: { marginTop: 14, fontSize: 10, color: muted, lineHeight: 1.7 } },
      `Pace = actual sales ÷ QSRSoft mean sales for the day. `,
      `DT speed = avg seconds from order to serve (🔴 > 4:00, 🟡 3:20–4:00, 🟢 < 3:20). `,
      `Labor = punched hours ÷ needed hours (🔴 > 120%, 🟡 110–120%). `,
      `Accuracy = healthy orders ÷ total (🔴 < ${ACC_RED}%, 🟡 ${ACC_RED}–${ACC_AMB}%). Click any store to see hourly breakdown.`,
    ),
  );
}

export function SignalsPanel({ ds, signals, customSignalDefs, customSignals, onCustomDefsChange }) {
  const [tab, setTab] = uSt('liveops');
  const [expanded, setExpanded] = uSt(null);
  const [filterDomain, setFilterDomain] = uSt(null);
  const [filterLoc, setFilterLoc] = uSt(null);
  const [localDefs, setLocalDefs] = uSt(customSignalDefs || []);
  const [promoteTarget, setPromoteTarget] = uSt(null);

  uE(() => { setLocalDefs(customSignalDefs || []); }, [customSignalDefs]);

  const activeDefs = uM(() => localDefs.filter(d => d.status !== 'graveyard'), [localDefs]);
  const graveyardCount = uM(() => localDefs.filter(d => d.status === 'graveyard').length, [localDefs]);

  const availLocs = uM(() => {
    const locs = new Set();
    [...(ds?.laborRows || []), ...(ds?.schedRows || []), ...(ds?.opsRows || [])].forEach(r => { if (r.loc) locs.add(normLoc(r.loc)); });
    return [...locs].sort((a, b) => (STORE_NAMES?.[a] || a).localeCompare(STORE_NAMES?.[b] || b));
  }, [ds]);

  const filteredDs = uM(() => {
    if (!filterLoc) return ds;
    const keep = r => normLoc(r?.loc) === filterLoc;
    return { ...ds, laborRows: (ds?.laborRows || []).filter(keep), schedRows: (ds?.schedRows || []).filter(keep), opsRows: (ds?.opsRows || []).filter(keep), fobRows: (ds?.fobRows || []).filter(keep), exceptionRows: (ds?.exceptionRows || []).filter(keep), smgFullscale: (ds?.smgFullscale || []).filter(keep) };
  }, [ds, filterLoc]);

  const baseSignals = uM(() => {
    if (!filterLoc) return signals || [];
    try { return computeInsights(filteredDs); } catch { return []; }
  }, [filteredDs, filterLoc, signals]);

  const displaySignals = uM(() => !filterDomain ? baseSignals : baseSignals.filter(s => s.domain === filterDomain), [baseSignals, filterDomain]);
  const confirmedCount = displaySignals.filter(s => s.confirmed).length;
  const plausibleCount = displaySignals.filter(s => !s.confirmed && Math.abs(s.r || 0) >= 0.30).length;
  const hasData = (ds?.laborRows?.length || 0) >= 30 || (ds?.fobRows?.length || 0) >= 5 || (ds?.schedRows?.length || 0) >= 20;

  // Compute custom signals live for Signal Lab display
  const labSignals = uM(() => {
    if (!activeDefs.length || !ds) return {};
    const out = {};
    for (const def of activeDefs) {
      try { out[def.id] = computeCustomSignal(def, ds); } catch {}
    }
    return out;
  }, [activeDefs, ds]);

  const mutateLocalDefs = uCB((next) => {
    setLocalDefs(next);
    onCustomDefsChange?.(next);
  }, [onCustomDefsChange]);

  const handleNewSignal = uCB(def => {
    mutateLocalDefs([...localDefs, def]);
    setTab('lab');
    setExpanded(null);
  }, [localDefs, mutateLocalDefs]);

  const handlePromote = uCB(async (def, sig, demote) => {
    if (demote) {
      const updated = await updateCustomSignal(def.id, { status: 'active', promoted_to: [] });
      if (updated) mutateLocalDefs(localDefs.map(d => d.id === def.id ? { ...d, status: 'active', promoted_to: [] } : d));
      return;
    }
    setPromoteTarget({ def, sig });
  }, [localDefs, mutateLocalDefs]);

  const confirmPromote = uCB(async (selectedModules) => {
    const { def } = promoteTarget;
    const updated = await updateCustomSignal(def.id, { status: 'promoted', promoted_to: selectedModules });
    if (updated) mutateLocalDefs(localDefs.map(d => d.id === def.id ? { ...d, status: 'promoted', promoted_to: selectedModules } : d));
    setPromoteTarget(null);
  }, [promoteTarget, localDefs, mutateLocalDefs]);

  const handleRetire = uCB(async (def) => {
    const sig = labSignals[def.id];
    const updated = await updateCustomSignal(def.id, { status: 'graveyard', latest_r: sig?.r, latest_n: sig?.n });
    if (updated) mutateLocalDefs(localDefs.map(d => d.id === def.id ? { ...d, status: 'graveyard', latest_r: sig?.r, latest_n: sig?.n } : d));
  }, [localDefs, labSignals, mutateLocalDefs]);

  const handleRestore = uCB(async (def) => {
    const updated = await updateCustomSignal(def.id, { status: 'active' });
    if (updated) mutateLocalDefs(localDefs.map(d => d.id === def.id ? { ...d, status: 'active' } : d));
  }, [localDefs, mutateLocalDefs]);

  const handleVote = uCB(async (def) => {
    const updated = await updateCustomSignal(def.id, { votes: (def.votes || 0) + 1 });
    if (updated) mutateLocalDefs(localDefs.map(d => d.id === def.id ? { ...d, votes: (d.votes || 0) + 1 } : d));
  }, [localDefs, mutateLocalDefs]);

  const handleDelete = uCB(async (def) => {
    if (!confirm(`Delete signal "${def.name}"? This cannot be undone.`)) return;
    const updated = await updateCustomSignal(def.id, { status: 'graveyard' });
    if (updated) mutateLocalDefs(localDefs.map(d => d.id === def.id ? { ...d, status: 'graveyard' } : d));
  }, [localDefs, mutateLocalDefs]);

  const TAB_STYLE = (active, danger) => ({
    padding: '6px 16px', borderRadius: '99px', fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer',
    border: `1px solid ${active ? (danger ? 'rgba(239,68,68,.4)' : 'rgba(245,158,11,.45)') : bdr}`,
    background: active ? (danger ? 'rgba(239,68,68,.08)' : 'rgba(245,158,11,.1)') : 'transparent',
    color: active ? (danger ? red : amber) : muted,
  });

  return h('div', { style: { padding: 16, maxWidth: 920, margin: '0 auto' } },
    promoteTarget && h(PromoteModal, { def: promoteTarget.def, sig: promoteTarget.sig, onConfirm: confirmPromote, onCancel: () => setPromoteTarget(null) }),

    // Header
    h('div', { style: { marginBottom: 16 } },
      h('div', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: amber, marginBottom: 4 } }, 'Intelligence'),
      h('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: '-.03em' } }, 'Signals'),
      h('div', { style: { fontSize: 12, color: muted, marginTop: 4 } }, 'Cross-metric correlation analysis. Built-in signals run automatically; define your own in Signal Lab.'),
    ),

    // Tab bar
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' } },
      h('button', { onClick: () => setTab('liveops'), style: TAB_STYLE(tab === 'liveops') }, '⚡ Live Ops'),
      h('button', { onClick: () => setTab('builtin'), style: TAB_STYLE(tab === 'builtin') }, `Built-in (${(signals || []).length})`),
      h('button', { onClick: () => setTab('lab'), style: TAB_STYLE(tab === 'lab') }, `Signal Lab${activeDefs.length ? ` (${activeDefs.length})` : ''}`),
      h('button', { onClick: () => setTab('graveyard'), style: TAB_STYLE(tab === 'graveyard', true) }, `⚰ Graveyard${graveyardCount ? ` (${graveyardCount})` : ''}`),
    ),

    // ── LIVE OPS TAB ─────────────────────────────────────────────────────────
    tab === 'liveops' && h(LiveOpsTab, null),

    // ── BUILT-IN TAB ──────────────────────────────────────────────────────────
    tab === 'builtin' && h('div', null,
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' } },
        h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          DOMAINS.map(d => pillBtn(filterDomain === d.key, () => setFilterDomain(d.key), d.label))
        ),
        availLocs.length > 1 && h('select', {
          value: filterLoc || '', onChange: e => setFilterLoc(e.target.value || null),
          style: { marginLeft: 'auto', padding: '4px 8px', borderRadius: 6, background: '#1a1f2e', border: `1px solid ${bdr}`, color: filterLoc ? amber : muted, fontSize: 11, cursor: 'pointer' },
        },
          h('option', { value: '' }, 'All stores'),
          availLocs.map(loc => h('option', { key: loc, value: loc }, STORE_NAMES?.[loc] || `Store ${loc}`))
        ),
      ),
      baseSignals.length > 0 && h('div', { style: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
        filterLoc && h('div', { style: { fontSize: 11, color: blue, fontWeight: 600 } }, `📍 ${STORE_NAMES?.[filterLoc] || `Store ${filterLoc}`} analysis`),
        h('div', { style: { padding: '5px 12px', borderRadius: '99px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', fontSize: 12, fontWeight: 700, color: grn } }, confirmedCount + ' out of range'),
        h('div', { style: { padding: '5px 12px', borderRadius: '99px', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', fontSize: 12, fontWeight: 700, color: amber } }, plausibleCount + ' within tolerance'),
        h('div', { style: { padding: '5px 12px', borderRadius: '99px', background: surf2, border: `1px solid ${bdr}`, fontSize: 12, color: muted } }, (displaySignals.length - confirmedCount - plausibleCount) + ' no effect'),
      ),
      h(DataReadiness, { ds }),
      h(CascadeChain, { signals: baseSignals }),
      !displaySignals.length && h('div', { style: { textAlign: 'center', padding: 48, color: muted, fontSize: 13, border: `1px dashed ${bdr}`, borderRadius: 8 } },
        h('div', { style: { fontSize: 28, marginBottom: 12 } }, hasData ? '🔍' : '📡'),
        h('div', { style: { fontWeight: 700, marginBottom: 8, fontSize: 14 } }, filterDomain ? `No ${filterDomain.replace('_', ' ')} signals yet` : hasData ? 'No patterns detected yet' : 'No data loaded'),
        hasData
          ? h('div', { style: { lineHeight: 1.7, maxWidth: 480, margin: '0 auto' } }, filterDomain ? 'Try "All" or upload more data.' : 'Upload additional months of history — more data increases signal confidence.')
          : 'Upload Labor Analysis, Operations Reports, and LifeLenz data to start detecting patterns.',
      ),
      displaySignals.map(sig => h(SignalCard, { key: sig.id, sig, expanded, onToggle: () => setExpanded(expanded === sig.id ? null : sig.id) })),
      h('div', { style: { marginTop: 16, fontSize: 10, color: muted, lineHeight: 1.6 } },
        '⚙ Signals use Pearson r. Out of range = |r| ≥ 0.50 (n ≥ 20), Within tolerance = |r| 0.30–0.49, No effect = |r| < 0.30. Recomputes after every upload.',
      ),
    ),

    // ── SIGNAL LAB TAB ────────────────────────────────────────────────────────
    tab === 'lab' && h('div', null,
      h('div', { style: { fontSize: 11, color: muted, lineHeight: 1.6, marginBottom: 16, padding: '10px 14px', background: surf2, border: `1px solid ${bdr}`, borderRadius: 8 } },
        '🧪 Signal Lab — define custom correlations between any two metrics in your data. ',
        'Saved signals recompute automatically after every upload and accumulate history over time. ',
        'Strong signals (|r| ≥ 0.50, n ≥ 20) can be promoted to Projections, Morning Brief, and SAGE.'),
      h(SignalBuilder, { ds, onSave: handleNewSignal, existingDefs: localDefs }),
      activeDefs.length === 0 && h('div', { style: { textAlign: 'center', padding: '32px 24px', color: muted, fontSize: 12, border: `1px dashed ${bdr}`, borderRadius: 8 } },
        h('div', { style: { fontSize: 24, marginBottom: 10 } }, '🔬'),
        h('div', { style: { fontWeight: 700, marginBottom: 6 } }, 'No custom signals yet'),
        'Use the builder above to define your first custom correlation.',
      ),
      activeDefs.length > 0 && h('div', { style: { marginBottom: 12, fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '.07em' } }, `Your signals (${activeDefs.length})`),
      activeDefs.map(def => h(CustomSignalCard, {
        key: def.id, def, sig: labSignals[def.id] || null, expanded,
        onToggle: () => setExpanded(expanded === def.id ? null : def.id),
        onPromote: handlePromote, onRetire: handleRetire, onVote: handleVote, onDelete: handleDelete,
      })),
    ),

    // ── GRAVEYARD TAB ─────────────────────────────────────────────────────────
    tab === 'graveyard' && h(GraveyardTab, { defs: localDefs, onRestore: handleRestore }),
  );
}
