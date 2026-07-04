// @ts-nocheck
import * as React from 'react';
import { computeInsights, normLoc } from '../engine/insights.js';
import { STORE_NAMES } from '../constants.js';
const h = React.createElement;
const { useState: uSt, useMemo: uM } = React;

const amber = '#f59e0b', grn = '#10b981', red = '#ef4444', muted = '#6b7280', blue = '#60a5fa';

const DOMAINS = [
  { key: null,         label: 'All' },
  { key: 'service',   label: 'Service' },
  { key: 'sales',     label: 'Sales' },
  { key: 'labor',     label: 'Labor' },
  { key: 'food_cost', label: 'Food Cost' },
  { key: 'customer',  label: 'Customer' },
];

// Cascade chain signal IDs in order
const CASCADE_IDS = ['schedule_gap_oepe', 'oepe_kvs', 'oepe_sales', 'kvs_service_sales', 'schedule_gap_sales'];

function rColor(r, expectedDir) {
  if (r === null || r === undefined) return muted;
  const a = Math.abs(r);
  if (a < 0.20) return muted;
  const dirMatch = !expectedDir ||
    (expectedDir === 'negative' && r < 0) ||
    (expectedDir === 'positive' && r > 0) ||
    expectedDir === null;
  if (!dirMatch) return muted;
  if (a >= 0.50) return grn;
  if (a >= 0.30) return amber;
  return muted;
}

// Three-tier threshold label: No Effect / Within Tolerance / Out of Range
function thresholdLabel(sig) {
  const a = Math.abs(sig.r || 0);
  if (a < 0.20 || (sig.n || 0) < 8) return 'No effect';
  const dirMatch = !sig.expectedDir ||
    (sig.expectedDir === 'negative' && sig.r < 0) ||
    (sig.expectedDir === 'positive' && sig.r > 0) ||
    sig.expectedDir === null;
  if (!dirMatch) return 'No effect';
  if (a >= 0.50) return 'Out of range';
  if (a >= 0.30) return 'Within tolerance';
  return 'No effect';
}

function strengthLabel(sig) {
  if (!sig.r || Math.abs(sig.r) < 0.20) return 'No signal';
  if (sig.confirmed) {
    if (Math.abs(sig.r) >= 0.70) return 'Strong';
    if (Math.abs(sig.r) >= 0.50) return 'Moderate';
    return 'Plausible';
  }
  if (Math.abs(sig.r) >= 0.30) return 'Weak / needs more data';
  return 'No signal';
}

function statusChip(sig) {
  const thr = thresholdLabel(sig);
  if (thr === 'No effect')
    return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(107,114,128,.15)', color: muted } }, 'No effect');
  if (thr === 'Out of range')
    return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(16,185,129,.12)', color: grn } }, '↑ Out of range');
  // within tolerance — confirmed or plausible
  if (sig.confirmed)
    return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(245,158,11,.12)', color: amber } }, '~ Within tolerance');
  return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(245,158,11,.08)', color: amber } }, '~ Plausible');
}

function CorrelationBar({ r }) {
  const a = Math.abs(r || 0);
  const col = a >= 0.50 ? grn : a >= 0.30 ? amber : muted;
  const pct = Math.min(100, a * 100);
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
    h('div', { style: { flex: 1, height: '6px', background: 'rgba(255,255,255,.08)', borderRadius: '3px', overflow: 'hidden' } },
      h('div', { style: { width: pct + '%', height: '100%', background: col, borderRadius: '3px', transition: 'width .4s' } })
    ),
    h('span', { style: { fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: col, minWidth: '44px' } },
      r != null ? (r >= 0 ? '+' : '') + r.toFixed(3) : '—'
    ),
  );
}

function SignalCard({ sig, expanded, onToggle }) {
  const col = rColor(sig.r, sig.expectedDir);
  const isExp = expanded === sig.id;
  const thr = thresholdLabel(sig);
  const isOOR = thr === 'Out of range';

  return h('div', {
    style: {
      border: `1px solid ${isOOR ? 'rgba(16,185,129,.25)' : sig.confirmed ? 'rgba(245,158,11,.2)' : 'rgba(255,255,255,.1)'}`,
      borderRadius: '8px',
      background: isOOR ? 'rgba(16,185,129,.03)' : 'rgba(255,255,255,.02)',
      marginBottom: '10px',
      overflow: 'hidden',
    }
  },
    // Header
    h('div', {
      onClick: onToggle,
      style: { cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', userSelect: 'none' }
    },
      // r value circle
      h('div', {
        style: {
          width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0,
          background: `conic-gradient(${col} ${Math.abs(sig.r || 0) * 360}deg, rgba(255,255,255,.08) 0deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }
      },
        h('div', {
          style: {
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'var(--bg, #111827)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: col,
          }
        }, sig.r != null ? (sig.r >= 0 ? '+' : '') + sig.r.toFixed(2) : '—')
      ),
      // Info
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' } },
          h('span', { style: { fontWeight: 700, fontSize: '13px', color: 'var(--text, #111827)' } }, sig.name),
          statusChip(sig),
          sig.domain && h('span', { style: { fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', padding: '1px 6px', borderRadius: '99px', background: 'rgba(255,255,255,.06)', color: muted } }, sig.domain.replace('_', ' ')),
        ),
        h('div', { style: { fontSize: '11px', color: muted } }, sig.description),
        sig.note && h('div', { style: { fontSize: '10px', color: amber, marginTop: '2px' } }, '⚠ ' + sig.note),
      ),
      // Stats
      h('div', { style: { textAlign: 'right', flexShrink: 0 } },
        h('div', { style: { fontSize: '10px', color: muted } }, 'n = ' + (sig.n || 0) + ' pts'),
        h('div', { style: { fontSize: '10px', color: muted, marginTop: '1px' } }, strengthLabel(sig)),
      ),
      h('span', { style: { fontSize: '13px', color: muted, transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none' } }, '▾'),
    ),
    // Expanded detail
    isExp && h('div', { style: { padding: '0 14px 12px', borderTop: '1px solid rgba(255,255,255,.07)' } },
      h('div', { style: { display: 'flex', gap: '24px', marginTop: '10px', flexWrap: 'wrap' } },
        h('div', { style: { flex: 1, minWidth: '200px' } },
          h('div', { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: '6px' } }, 'Correlation Strength'),
          h(CorrelationBar, { r: sig.r }),
          h('div', { style: { marginTop: '6px', fontSize: '10px', color: muted } },
            'Direction: ',
            h('span', { style: { color: 'var(--text,#111827)' } },
              sig.direction === 'negative' ? '↓ negative (inverse)' : '↑ positive (direct)'
            ),
            sig.expectedDir && h('span', { style: { color: sig.direction === sig.expectedDir ? grn : red } },
              ' — ' + (sig.direction === sig.expectedDir ? '✓ as expected' : '✗ unexpected direction')
            )
          ),
        ),
        h('div', { style: { flex: 1, minWidth: '200px' } },
          h('div', { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: '6px' } }, 'Data Points'),
          h('div', { style: { fontSize: '12px', color: 'var(--text,#111827)' } },
            h('span', { style: { fontFamily: 'monospace', fontWeight: 700, color: blue } }, sig.n || 0), ' matched pairs',
          ),
          h('div', { style: { fontSize: '10px', color: muted, marginTop: '4px' } },
            'X: ', h('em', null, sig.xLabel),
          ),
          h('div', { style: { fontSize: '10px', color: muted } },
            'Y: ', h('em', null, sig.yLabel),
          ),
        ),
        h('div', { style: { flex: 1, minWidth: '200px' } },
          h('div', { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: '6px' } }, 'Threshold Assessment'),
          h('div', { style: { fontSize: '11px', color: 'var(--text,#111827)', lineHeight: 1.5 } },
            thr === 'Out of range'
              ? `Signal confirmed and significant (|r| = ${Math.abs(sig.r).toFixed(2)}). This relationship is strong enough to act on — investigate root cause.`
              : thr === 'Within tolerance'
              ? `Relationship detected but within an acceptable range (|r| = ${Math.abs(sig.r).toFixed(2)}). Monitor for strengthening. More data improves confidence.`
              : `No meaningful statistical relationship found yet (|r| = ${Math.abs(sig.r || 0).toFixed(2)}). These metrics may be independent, or more data is needed.`
          ),
        ),
      ),
    ),
  );
}

// ── Cascade chain banner ───────────────────────────────────────────────────────
function CascadeChain({ signals }) {
  const cascadeMap = {};
  for (const s of (signals || [])) {
    if (CASCADE_IDS.includes(s.id)) cascadeMap[s.id] = s;
  }
  const confirmedCascade = Object.values(cascadeMap).filter(s => s.confirmed).length;
  if (confirmedCascade < 2) return null;

  const nodes = [
    { id: 'schedule_gap_oepe', label: 'Scheduling Gap' },
    { id: 'oepe_kvs',          label: 'OEPE Speed' },
    { id: 'kvs_service_sales', label: 'KVS / Throughput' },
    { id: 'oepe_sales',        label: 'Daily Sales', alt: 'schedule_gap_sales' },
  ];

  return h('div', { style: { marginBottom: '16px', padding: '12px 14px', background: 'rgba(96,165,250,.05)', border: '1px solid rgba(96,165,250,.2)', borderRadius: '8px' } },
    h('div', { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: blue, marginBottom: '6px' } },
      '↳ Scheduling Cascade Active'
    ),
    h('div', { style: { fontSize: '11px', color: muted, marginBottom: '10px', lineHeight: 1.5 } },
      `${confirmedCascade} linked signal${confirmedCascade > 1 ? 's' : ''} confirmed. Under-staffing is cascading through service speed into sales outcomes.`
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
      nodes.flatMap((node, i) => {
        const sig = cascadeMap[node.id] || cascadeMap[node.alt];
        const active = sig?.confirmed;
        const parts = [];
        if (i > 0) parts.push(h('span', { key: `a${i}`, style: { color: active ? blue : 'rgba(96,165,250,.3)', fontWeight: 700, fontSize: '12px' } }, '→'));
        parts.push(h('div', { key: node.id, style: {
          padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
          background: active ? 'rgba(96,165,250,.15)' : 'rgba(255,255,255,.04)',
          border: `1px solid ${active ? 'rgba(96,165,250,.35)' : 'rgba(255,255,255,.08)'}`,
          color: active ? blue : 'rgba(107,114,128,.6)',
        } }, node.label));
        return parts;
      })
    ),
  );
}

// ── Data readiness indicator ───────────────────────────────────────────────────
function DataReadiness({ ds }) {
  const checks = [
    { label: 'Labor Analysis', ok: (ds.laborRows?.length || 0) >= 30, count: ds.laborRows?.length || 0, unit: 'rows' },
    { label: 'Operations Report', ok: (ds.opsRows?.length || 0) >= 10, count: ds.opsRows?.length || 0, unit: 'rows' },
    { label: 'FOB Reports', ok: (ds.fobRows?.length || 0) >= 5, count: ds.fobRows?.length || 0, unit: 'rows' },
    { label: 'LifeLenz Schedule', ok: (ds.schedRows?.length || 0) >= 20, count: ds.schedRows?.length || 0, unit: 'rows' },
    { label: 'SMG FullScale', ok: (ds.smgFullscale?.length || 0) >= 3, count: ds.smgFullscale?.length || 0, unit: 'stores' },
    { label: 'Labor Exceptions', ok: (ds.exceptionRows?.length || 0) >= 5, count: ds.exceptionRows?.length || 0, unit: 'rows' },
  ];
  return h('div', {
    style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 14px', background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '8px' }
  },
    h('div', { style: { width: '100%', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: '4px' } }, 'Data available for signal detection'),
    checks.map(c => h('div', { key: c.label, style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: c.ok ? grn : c.count > 0 ? amber : muted } },
      h('span', null, c.ok ? '✓' : c.count > 0 ? '~' : '○'),
      c.label,
      h('span', { style: { fontFamily: 'monospace', fontSize: '10px', color: muted } }, '(' + c.count + ' ' + c.unit + ')'),
    ))
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function SignalsPanel({ ds, signals }) {
  const [expanded, setExpanded] = uSt(null);
  const [filterDomain, setFilterDomain] = uSt(null);
  const [filterLoc, setFilterLoc] = uSt(null);

  // Collect unique locs from all data sources
  const availLocs = uM(() => {
    const locs = new Set();
    [...(ds?.laborRows || []), ...(ds?.schedRows || []), ...(ds?.opsRows || [])].forEach(r => {
      if (r.loc) locs.add(normLoc(r.loc));
    });
    return [...locs].sort((a, b) => {
      const na = STORE_NAMES?.[a] || a, nb = STORE_NAMES?.[b] || b;
      return na.localeCompare(nb);
    });
  }, [ds]);

  // Filter ds to a single location for per-store analysis
  const filteredDs = uM(() => {
    if (!filterLoc) return ds;
    const keep = r => normLoc(r?.loc) === filterLoc;
    return {
      ...ds,
      laborRows:    (ds?.laborRows    || []).filter(keep),
      schedRows:    (ds?.schedRows    || []).filter(keep),
      opsRows:      (ds?.opsRows      || []).filter(keep),
      fobRows:      (ds?.fobRows      || []).filter(keep),
      exceptionRows:(ds?.exceptionRows|| []).filter(keep),
      smgFullscale: (ds?.smgFullscale || []).filter(keep),
    };
  }, [ds, filterLoc]);

  // Recompute signals for the filtered loc, or use pre-computed all-stores signals
  const baseSignals = uM(() => {
    if (!filterLoc) return signals || [];
    try { return computeInsights(filteredDs); } catch { return []; }
  }, [filteredDs, filterLoc, signals]);

  // Apply domain filter
  const displaySignals = uM(() => {
    if (!filterDomain) return baseSignals;
    return baseSignals.filter(s => s.domain === filterDomain);
  }, [baseSignals, filterDomain]);

  const confirmedCount = displaySignals.filter(s => s.confirmed).length;
  const plausibleCount = displaySignals.filter(s => !s.confirmed && Math.abs(s.r || 0) >= 0.30).length;
  const hasData = (ds?.laborRows?.length || 0) >= 30 || (ds?.fobRows?.length || 0) >= 5 || (ds?.schedRows?.length || 0) >= 20;
  const storeName = filterLoc ? (STORE_NAMES?.[filterLoc] || `Store ${filterLoc}`) : null;

  const pillBtn = (active, onClick, label) => h('button', {
    onClick,
    style: {
      padding: '4px 12px', borderRadius: '99px', border: `1px solid ${active ? 'rgba(245,158,11,.4)' : 'rgba(255,255,255,.1)'}`,
      background: active ? 'rgba(245,158,11,.1)' : 'transparent', color: active ? amber : muted,
      fontSize: '11px', fontWeight: active ? 700 : 400, cursor: 'pointer',
    }
  }, label);

  return h('div', { style: { padding: '16px', maxWidth: '920px', margin: '0 auto' } },

    // Header
    h('div', { style: { marginBottom: '16px' } },
      h('div', { style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: amber, marginBottom: '4px' } }, 'Intelligence'),
      h('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: '22px', fontWeight: 900, letterSpacing: '-.03em', color: 'var(--text,#111827)' } }, 'Signals'),
      h('div', { style: { fontSize: '12px', color: muted, marginTop: '4px' } },
        'Cross-metric correlation analysis — runs automatically on every data upload. Finds statistical patterns between scheduling, labor, service, and financial outcomes.'
      ),
    ),

    // Filter row: domain pills + store selector
    h('div', { style: { display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' } },
      // Domain pills
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        DOMAINS.map(d => pillBtn(filterDomain === d.key, () => setFilterDomain(d.key), d.label))
      ),
      // Store selector
      availLocs.length > 1 && h('select', {
        value: filterLoc || '',
        onChange: e => setFilterLoc(e.target.value || null),
        style: {
          marginLeft: 'auto', padding: '4px 8px', borderRadius: '6px',
          background: '#1a1f2e', border: '1px solid rgba(255,255,255,.12)',
          color: filterLoc ? amber : muted, fontSize: '11px', cursor: 'pointer',
        }
      },
        h('option', { value: '' }, 'All stores'),
        availLocs.map(loc => h('option', { key: loc, value: loc }, STORE_NAMES?.[loc] || `Store ${loc}`))
      ),
    ),

    // Summary chips
    (baseSignals.length > 0) && h('div', { style: { display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' } },
      storeName && h('div', { style: { fontSize: '11px', color: blue, fontWeight: 600 } }, `📍 ${storeName} analysis`),
      h('div', { style: { padding: '5px 12px', borderRadius: '99px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', fontSize: '12px', fontWeight: 700, color: grn } },
        confirmedCount + ' out of range'
      ),
      h('div', { style: { padding: '5px 12px', borderRadius: '99px', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', fontSize: '12px', fontWeight: 700, color: amber } },
        plausibleCount + ' within tolerance'
      ),
      h('div', { style: { padding: '5px 12px', borderRadius: '99px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', fontSize: '12px', color: muted } },
        (displaySignals.length - confirmedCount - plausibleCount) + ' no effect'
      ),
    ),

    // Data readiness
    h(DataReadiness, { ds }),

    // Cascade chain banner (only shows when ≥2 cascade signals confirmed)
    h(CascadeChain, { signals: baseSignals }),

    // Empty state
    (!displaySignals || displaySignals.length === 0) && h('div', {
      style: { textAlign: 'center', padding: '48px', color: muted, fontSize: '13px', border: '1px dashed rgba(255,255,255,.1)', borderRadius: '8px' }
    },
      h('div', { style: { fontSize: '28px', marginBottom: '12px' } }, hasData ? '🔍' : '📡'),
      h('div', { style: { fontWeight: 700, marginBottom: '8px', fontSize: '14px', color: 'var(--text,#111827)' } },
        filterDomain ? `No ${filterDomain.replace('_',' ')} signals yet` : hasData ? 'No patterns detected yet' : 'No data loaded'
      ),
      hasData
        ? h('div', { style: { lineHeight: 1.7, maxWidth: '480px', margin: '0 auto' } },
            filterDomain
              ? `No signals in the "${filterDomain.replace('_', ' ')}" domain met the threshold. Try "All" or upload more data.`
              : 'Data is loaded but no statistical patterns crossed the threshold yet. Upload additional months of history — more data increases signal confidence.',
            h('br', null),
            h('span', { style: { fontSize: '11px', marginTop: '8px', display: 'block', color: muted } },
              'Check DevTools console for [signals] lines to see which correlations are being computed.'
            )
          )
        : 'Upload Labor Analysis, Operations Reports, and LifeLenz data to start detecting patterns.',
    ),

    // Signal cards
    displaySignals.map(sig =>
      h(SignalCard, {
        key: sig.id,
        sig,
        expanded,
        onToggle: () => setExpanded(expanded === sig.id ? null : sig.id),
      })
    ),

    // Footer
    h('div', { style: { marginTop: '16px', fontSize: '10px', color: muted, lineHeight: 1.6 } },
      '⚙ Signals use Pearson correlation (r). Threshold labels: Out of range = |r| ≥ 0.50 (confirmed), Within tolerance = |r| 0.30–0.49, No effect = |r| < 0.30. Min 8 matched data points per signal. Cascade chain shows the scheduling→OEPE→KVS→Sales path. Recomputes automatically after every upload.',
    ),
  );
}
