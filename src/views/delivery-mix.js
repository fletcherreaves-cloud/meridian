// @ts-nocheck
// ── 3PO Delivery / Channel Mix — merged panel (dispatch #201, 2026-08-28) ────────────────
// Folds `channel-intel` (ChannelIntelligencePanel, formerly src/views/analytics.js, the
// 5-channel Drive-Thru/Breakfast/Delivery/MOP/Kiosk overview) INTO this panel as its first
// tab. This file (3PO Delivery, kind:'nav') survives as the destination because it was already
// the established nav entry; Channel Intel was kind:'optional' (Panel Manager toggle, less
// prominent). The two were an overview + drill-down pairing on the same Delivery slice —
// Channel Intel's "Delivery" channel is one bar among five; this panel's platform breakdown
// (DoorDash/UberEats/Grubhub) is what that one bar is made of — so landing on the wide
// overview and clicking through to the platform drill-down is the natural flow, hence
// Overview is the default/first tab, not Delivery Platforms.
// Old 'channel-intel' deep links redirect here (App.js's onOpenModal), landing on this same
// default Overview tab. See panel-registry.js's channel-intel entry (kind:'internal', id kept
// for panel-registry.test.js's pairing check) and constants.js's OPTIONAL_PANELS (entry
// removed — no more Panel Manager toggle for it, matching the corr-explorer/calendar-manager
// retirement precedent).
// Delivery Platforms reads ds.cashRows (QSRSoft Cash Sheet, cloud auto-pulled) — unchanged.
// ⚠️ CORRECTED 2026-11-13 (owner-reported live bug, screenshots against the real QSRSoft
// Operations Report): Channel Overview used to read ds.laborByLoc directly — rows sourced ONLY
// from the manual Operations Report Excel upload — for BOTH the channel $ numerators and the
// total-sales denominator. That is exactly the manual-only sourcing bug CLAUDE.md's Dev Rules
// section names ("reading raw laborRows/ctrlRows/opsRows directly for a metric value
// re-introduces the manual-only bug" — worded here without the ds. prefix so this explanatory
// comment itself doesn't trip ratchet-raw-metric-rows.test.js's literal-match scanner) and it
// produced nonsense: the SAME "Drive-Thru % of total
// sales" read 0.00% (7d), 5.96% (14d), 38.24% (28d), 54.42% (60d) in the owner's own screenshots,
// against a real QSRSoft-reported 68.62%-77.05% daily (72.97% MTD) for the same store — each
// window was silently averaging over whichever manual rows happened to exist, not the real sales
// base. Now sourced through metric-source.js's existing auto-first `dtMixPct`/`bfMixPct`/
// `mopMixPct`/`kioskMixPct`/`delivMixPct` registry entries (emailed Sales Ledger / auto-pulled
// Sales Mix first, manual Operations Report last-resort fill only, per the standing
// "auto/emailed-first, freshest-wins" rule) — the manual upload is still IN the chain, just no
// longer the only rung. dtMixPct additionally has a real Σ$/Σ$ ratio derive (opsSalesMixRows),
// so it goes through `metricRate` (sum-ratio first, mean-of-daily only as fallback — never
// blends an in-progress day in at full weight); the other four have no decomposed $ chain yet,
// so they go through `metricAvg` (mean of already-computed daily %, same "never average an
// average" floor every other rate metric in this app already gets). Per-channel dollar figures
// are derived as pct × the store's own auto-first `sales` total for the window, since none of
// the four non-DT channels carry an independent $ leg in the registry today — not a new
// approximation, the same shape every other panel already uses when the raw channel-mix $ fields
// are what's actually missing from every current stream. See memory/finding-delivery-mix-manual-only-sourcing-2026-11-13.md.
import * as React from 'react';
import { f$, fPct } from '../utils/fmt.js';
import { STORE_NAMES } from '../constants.js';
import { RoutePanelShell } from '../components/ModalShell.js';
import { InfoIcon } from '../engine/forecast.js';
import { metricSeries, metricAvg, metricRate } from '../engine/metric-source.js';

const h = React.createElement;
const { useState, useMemo } = React;

// ── Platform brand colors (Delivery Platforms tab) ───────────────────────────
const DD_COLOR = '#ef4444';   // DoorDash red
const UE_COLOR = '#06b6d4';   // UberEats teal (readable on dark bg)
const GH_COLOR = '#f97316';   // Grubhub orange

// ── Aggregate cashRows into per-store totals for a given lookback window ─────
export function aggregate(cashRows, days) {
  if (!cashRows?.length) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const byLoc = {};
  for (const r of cashRows) {
    if (!r.loc || !r.date) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (d < cutoff) continue;
    if (!byLoc[r.loc]) byLoc[r.loc] = {
      loc: r.loc, days: 0,
      doorDashSales: 0, doorDashGC: 0,
      uberEatsSales: 0, uberEatsGC: 0,
      grubhubSales:  0, grubhubGC:  0,
      total3poSales: 0, allNetSales: 0,
      cashOS: 0, cashOSPct: 0,
      mopEatIn: 0, mopTakeout: 0, kioskEatIn: 0, kioskTakeout: 0,
    };
    const s = byLoc[r.loc];
    s.doorDashSales += r.doorDashSales || 0;
    s.doorDashGC    += r.doorDashGC    || 0;
    s.uberEatsSales += r.uberEatsSales || 0;
    s.uberEatsGC    += r.uberEatsGC    || 0;
    s.grubhubSales  += r.grubhubSales  || 0;
    s.grubhubGC     += r.grubhubGC     || 0;
    s.total3poSales += r.total3poSales || (r.doorDashSales + r.uberEatsSales + r.grubhubSales) || 0;
    s.allNetSales   += r.allNetSales   || 0;
    s.cashOS        += r.cashOS        || 0;
    s.mopEatIn      += r.mopEatIn      || 0;
    s.mopTakeout    += r.mopTakeout    || 0;
    s.kioskEatIn    += r.kioskEatIn    || 0;
    s.kioskTakeout  += r.kioskTakeout  || 0;
    s.days++;
  }
  return Object.values(byLoc).map(s => {
    const tpo = s.total3poSales || (s.doorDashSales + s.uberEatsSales + s.grubhubSales);
    const leader = s.doorDashSales >= s.uberEatsSales && s.doorDashSales >= s.grubhubSales ? 'DoorDash'
                 : s.uberEatsSales >= s.grubhubSales ? 'UberEats' : 'Grubhub';
    return {
      ...s,
      total3poSales: tpo,
      total3poPct: s.allNetSales > 0 ? tpo / s.allNetSales : 0,
      doorDashPct: tpo > 0 ? s.doorDashSales / tpo : 0,
      uberEatsPct: tpo > 0 ? s.uberEatsSales / tpo : 0,
      grubhubPct:  tpo > 0 ? s.grubhubSales  / tpo : 0,
      leader,
    };
  }).sort((a, b) => b.total3poPct - a.total3poPct);
}

// ── Stacked horizontal platform bar ─────────────────────────────────────────
function PlatformBar({ dd = 0, ue = 0, gh = 0 }) {
  const total = dd + ue + gh;
  if (!total) return h('div', {
    style: { height: 10, background: 'var(--surf2)', borderRadius: 5, width: '100%' }
  });
  return h('div', {
    style: { display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', width: '100%', gap: 1 }
  },
    dd > 0 && h('div', {
      title: `DoorDash ${(dd/total*100).toFixed(2)}%`,
      style: { width: (dd/total*100)+'%', background: DD_COLOR, minWidth: 2 }
    }),
    ue > 0 && h('div', {
      title: `UberEats ${(ue/total*100).toFixed(2)}%`,
      style: { width: (ue/total*100)+'%', background: UE_COLOR, minWidth: 2 }
    }),
    gh > 0 && h('div', {
      title: `Grubhub ${(gh/total*100).toFixed(2)}%`,
      style: { width: (gh/total*100)+'%', background: GH_COLOR, minWidth: 2 }
    }),
  );
}

// ── Summary card ─────────────────────────────────────────────────────────────
function Card({ label, value, sub, color }) {
  return h('div', {
    style: {
      background: 'var(--surf)', border: '1px solid var(--bdr)',
      borderRadius: 10, padding: '14px 18px', minWidth: 140,
    }
  },
    h('div', { style: { fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' } }, label),
    h('div', { style: { fontSize: 22, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1.1 } }, value),
    sub && h('div', { style: { fontSize: 11, color: 'var(--text3)', marginTop: 3 } }, sub),
  );
}

// ── Small pill-style toggle button, shared by both tabs' period/range selectors ──────────
function Pill({ active, onClick, children }) {
  return h('button', {
    onClick,
    style: {
      padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
      background: active ? 'var(--amber)' : 'var(--surf)',
      color: active ? '#000' : 'var(--text2)',
      border: `1px solid ${active ? 'var(--amber)' : 'var(--bdr)'}`,
      fontWeight: active ? 700 : 400,
    }
  }, children);
}

// ── Tab 1: Channel Overview (ported from ChannelIntelligencePanel) ──────────────────────
// `key` is the short id used for focus/sort state; `metricKey` is the metric-source.js
// registry entry that actually resolves the daily value, auto-first. `rate:true` (DT only)
// means the registry entry has a real Σ$/Σ$ derive, so it goes through metricRate (sum-ratio
// first); the other four have no decomposed $ chain yet, so metricAvg (mean of daily %) is the
// correct — and best currently possible — aggregator for them.
const CHANNELS = [
  {key:'dt',    metricKey:'dtMixPct',    label:'Drive-Thru',  color:'#60a5fa', emoji:'🚗', rate:true},
  {key:'bf',    metricKey:'bfMixPct',    label:'Breakfast',   color:'#fbbf24', emoji:'☀️'},
  {key:'deliv', metricKey:'delivMixPct', label:'Delivery',    color:'#34d399', emoji:'🛵'},
  {key:'mop',   metricKey:'mopMixPct',   label:'MOP',         color:'#a78bfa', emoji:'📱'},
  {key:'kiosk', metricKey:'kioskMixPct', label:'Kiosk',       color:'var(--crit)', emoji:'🖥'},
];

function ChannelOverviewTab({ stores, ds }) {
  const [focus, setFocus] = useState('dt');
  const [sortBy, setSortBy] = useState('pct');
  const [range, setRange] = useState(28);

  const window = useMemo(() => ({ s: new Date(Date.now() - range * 86400000), e: new Date() }), [range]);

  // Aggregate channel data per store for the chosen date range — auto-first per metric-source.js,
  // never the manual-only ds.laborByLoc read this replaced (see file header).
  const storeData = useMemo(() => {
    if (!ds || !ds.loaded) return [];
    return (stores || []).map(s => {
      const dailySales = metricSeries(ds, s.loc, window, 'sales');
      const totSales = Object.values(dailySales).reduce((a, v) => a + (v || 0), 0);
      if (totSales <= 0) return null;
      const chans = {};
      for (const ch of CHANNELS) {
        const pct = ch.rate ? metricRate(ds, s.loc, window, ch.metricKey) : metricAvg(ds, s.loc, window, ch.metricKey);
        chans[ch.key] = { pct: pct ?? 0, sales: pct != null ? pct * totSales : 0, hasData: pct != null };
      }
      return { loc: s.loc, name: s.name, totSales, chans };
    }).filter(Boolean);
  }, [stores, ds, window]);

  // District totals — dollar-weighted rollup (sum each store's own channel $, divide by
  // district total sales), never a mean of per-store percentages (CLAUDE.md: never average an
  // average, dollar-weight aggregates).
  const distTotals = useMemo(() => {
    if (!storeData.length) return null;
    const tot = storeData.reduce((a, s) => a + s.totSales, 0);
    const chans = {};
    for (const ch of CHANNELS) {
      const known = storeData.filter(s => s.chans[ch.key].hasData);
      const s = known.reduce((a, r) => a + r.chans[ch.key].sales, 0);
      const pct = tot > 0 ? s / tot : 0;
      chans[ch.key] = { sales: s, pct, hasData: known.length > 0 };
    }
    return { totSales: tot, chans };
  }, [storeData]);

  if (!ds || !ds.loaded) return h('div', {
    style: { padding: '60px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }
  }, 'Load Labor Analysis data to view channel intelligence.');

  const fmtS = v => v >= 1000000 ? '$' + (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v);
  const fmtP = v => (v * 100).toFixed(2) + '%';

  const focusCh = CHANNELS.find(c => c.key === focus) || CHANNELS[0];

  // Non-DT channels have no decomposed $ chain today, so a store that genuinely runs 0% of a
  // channel is indistinguishable from "no source answered" by value alone — use the explicit
  // hasData flag (never a `pct > 0` threshold, which would also hide a real, legitimate 0%).
  const hasExtendedChannels = distTotals && CHANNELS.slice(1).some(ch => distTotals.chans[ch.key].hasData);

  // Sort stores by focused channel
  const sortedStores = useMemo(() => [...storeData].sort((a, b) => {
    if (sortBy === 'pct') return b.chans[focus].pct - a.chans[focus].pct;
    if (sortBy === 'sales') return b.chans[focus].sales - a.chans[focus].sales;
    return b.totSales - a.totSales;
  }), [storeData, focus, sortBy]);

  // Channel divergence from district avg (which stores are outliers)
  const distAvgPct = distTotals ? distTotals.chans[focus].pct : 0;

  return h('div', { style: { padding: 20, display: 'flex', flexDirection: 'column', gap: 12 } },

    // Range selector
    h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 6 } },
      [7, 14, 28, 60].map(d => h(Pill, { key: d, active: range === d, onClick: () => setRange(d) }, d + 'd')),
    ),

    // District channel overview
    distTotals && h('div', { style: { background: 'var(--surf)', borderRadius: 'var(--rl)', padding: '12px 16px', border: '1px solid var(--bdr)' } },
      h('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '.5px', marginBottom: 10 } }, 'DISTRICT MIX · ' + fmtS(distTotals.totSales) + ' TOTAL SALES'),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        CHANNELS.map(ch => h('div', {
          key: ch.key,
          onClick: () => setFocus(ch.key),
          style: {
            flex: 1, minWidth: 100, cursor: 'pointer', padding: '10px 12px', borderRadius: 'var(--rl)',
            background: focus === ch.key ? ch.color + '22' : 'var(--surf2)',
            border: '1px solid ' + (focus === ch.key ? ch.color : 'var(--bdr)'),
            transition: 'all .15s'
          }
        },
          h('div', { style: { fontSize: 11, marginBottom: 2 } }, ch.emoji + ' ' + ch.label),
          h('div', { style: { fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: distTotals.chans[ch.key].hasData ? ch.color : 'var(--text3)' } },
            distTotals.chans[ch.key].hasData ? fmtP(distTotals.chans[ch.key].pct) : '–'),
          h('div', { style: { fontSize: 9, color: 'var(--text3)', marginTop: 1 } }, distTotals.chans[ch.key].hasData ? fmtS(distTotals.chans[ch.key].sales) : 'no data this window'),
        ))
      )
    ),

    // Data availability note — non-DT channels need Operations Report Sales sheet
    !hasExtendedChannels && distTotals && h('div', { style: { background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 'var(--rl)', padding: '10px 14px' } },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 } },
        h('div', { style: { fontSize: 14, flexShrink: 0 } }, '⚠️'),
        h('div', null,
          h('div', { style: { fontSize: 10, fontWeight: 700, color: '#fbbf24', marginBottom: 2 } }, 'Breakfast, Delivery, MOP & Kiosk have no data for this window'),
          h('div', { style: { fontSize: 10, color: 'var(--text3)', lineHeight: 1.6 } }, 'Meridian checks the QSRSoft Sales Ledger and Sales Mix streams first, then a manual Operations Report upload as a last resort — none of those have these four channels for the selected range yet. Drive-Thru has its own chain and is unaffected.'),
        )
      ),
      h('div', { style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.7, paddingLeft: 24 } },
        h('div', { style: { fontWeight: 700, color: 'var(--text2)', marginBottom: 3 } }, 'If uploading an Operations Report manually as a fallback, Meridian looks for these columns in its Sales sheet:'),
        [
          ['Breakfast', 'BF All Net Sales / Breakfast All Net Sales / BF Net Sales / BF Sales'],
          ['MOP', 'MOP Sales / MOP Net Sales / Mobile Order and Pay Net Sales / MOB Sales'],
          ['Kiosk', 'Kiosk All Net Sales / Kiosk Net Sales / KSK Net Sales / Kiosk Sales'],
          ['Delivery', 'McDelivery Net Sales / 3PD Net Sales / Delivery Net Sales / 3PD Sales'],
        ].map((r, i) => h('div', { key: i },
          h('span', { style: { fontWeight: 700, color: 'var(--text2)' } }, '• ' + r[0] + ': '),
          h('span', { style: { fontFamily: 'var(--mono)', fontSize: 8.5 } }, r[1]),
        )),
        h('div', { style: { marginTop: 6, color: 'var(--text2)' } }, 'If your file uses different names, contact support with your actual column headers.'),
      )
    ),

    // Per-store breakdown for focused channel
    h('div', { style: { background: 'var(--surf)', borderRadius: 'var(--rl)', border: '1px solid var(--bdr)', overflow: 'hidden' } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--bdr)' } },
        h('div', { style: { fontSize: 11, fontWeight: 700 } }, focusCh.emoji + ' ' + focusCh.label + ' — Store Comparison'),
        h('div', { style: { display: 'flex', gap: 4 } },
          ['pct', 'sales'].map(s => h(Pill, { key: s, active: sortBy === s, onClick: () => setSortBy(s) }, { pct: '% Mix', sales: '$ Sales' }[s])),
        )
      ),
      h('div', { style: { padding: '8px 14px 12px', overflowX: 'auto' } },
        sortedStores.length === 0
          ? h('div', { style: { color: 'var(--text3)', fontSize: 11, padding: 8 } }, 'No data for this range.')
          : sortedStores.map((s, i) => {
            const v = s.chans[focus];
            const deviation = v.pct - distAvgPct;
            const barPct = Math.max(0, Math.min(1, v.pct));
            const devCol = Math.abs(deviation) < 0.01 ? 'var(--text3)' : deviation > 0 ? '#10b981' : 'var(--crit)';
            return h('div', { key: s.loc, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < sortedStores.length - 1 ? '1px solid var(--bdr)' : 'none', minWidth: 460 } },
              h('div', { style: { width: 20, textAlign: 'right', color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', flexShrink: 0 } }, i + 1),
              h('div', { style: { width: 140, flexShrink: 0, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
              h('div', { style: { flex: 1, height: 8, background: 'var(--surf2)', borderRadius: 4, overflow: 'hidden', position: 'relative' } },
                h('div', { style: { position: 'absolute', left: 0, top: 0, height: '100%', width: (barPct * 100) + '%', background: focusCh.color, borderRadius: 4, opacity: .8 } }),
              ),
              h('div', { style: { width: 40, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, color: focusCh.color, fontWeight: 600, flexShrink: 0 } }, fmtP(v.pct)),
              h('div', { style: { width: 55, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', flexShrink: 0 } }, fmtS(v.sales)),
              h('div', { style: { width: 45, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: devCol, flexShrink: 0 } },
                (deviation >= 0 ? '+' : '') + fmtP(Math.abs(deviation)) + ' avg'),
            );
          })
      )
    ),

    // Mix outlier callout
    distTotals && (() => {
      const high = sortedStores.filter(s => s.chans[focus].pct > distAvgPct + 0.05);
      const low = sortedStores.filter(s => s.chans[focus].pct < distAvgPct - 0.05);
      if (!high.length && !low.length) return null;
      return h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
        high.length > 0 ? h('div', { style: { background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 'var(--rl)', padding: '10px 14px' } },
          h('div', { style: { fontSize: 10, fontWeight: 700, color: '#10b981', marginBottom: 6 } }, '↑ Above-Avg ' + focusCh.label + ' Mix (5%+ over district)'),
          high.map((s, i) => h('div', { key: s.loc, style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '2px 0', borderBottom: i < high.length - 1 ? '1px solid var(--bdr)' : 'none' } },
            h('div', { style: { color: 'var(--text2)' } }, (i + 1) + '. ' + s.name.slice(0, 20)),
            h('div', { style: { fontFamily: 'var(--mono)', color: '#10b981', fontWeight: 600 } }, fmtP(s.chans[focus].pct)),
          )),
        ) : h('div', null),
        low.length > 0 ? h('div', { style: { background: 'rgba(244,63,94,.06)', border: '1px solid rgba(244,63,94,.2)', borderRadius: 'var(--rl)', padding: '10px 14px' } },
          h('div', { style: { fontSize: 10, fontWeight: 700, color: 'var(--crit)', marginBottom: 6 } }, '↓ Below-Avg ' + focusCh.label + ' Mix (5%+ under district)'),
          low.slice().reverse().map((s, i) => h('div', { key: s.loc, style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '2px 0', borderBottom: i < low.length - 1 ? '1px solid var(--bdr)' : 'none' } },
            h('div', { style: { color: 'var(--text2)' } }, (i + 1) + '. ' + s.name.slice(0, 20)),
            h('div', { style: { fontFamily: 'var(--mono)', color: 'var(--crit)', fontWeight: 600 } }, fmtP(s.chans[focus].pct)),
          )),
        ) : h('div', null),
      );
    })(),
  );
}

// ── Tab 2: Delivery Platforms (the original DeliveryMixPanel body, unchanged computation) ──
function DeliveryPlatformsTab({ ds }) {
  const [period, setPeriod] = useState(28);
  const [sort, setSort]     = useState('pct');  // 'pct' | 'sales' | 'dd' | 'ue' | 'gh'

  const cashRows = ds?.cashRows || [];
  const stores   = useMemo(() => aggregate(cashRows, period), [cashRows, period]);

  const sorted = useMemo(() => {
    const rows = [...stores];
    if (sort === 'sales') rows.sort((a, b) => b.total3poSales - a.total3poSales);
    else if (sort === 'dd') rows.sort((a, b) => b.doorDashPct - a.doorDashPct);
    else if (sort === 'ue') rows.sort((a, b) => b.uberEatsPct - a.uberEatsPct);
    else if (sort === 'gh') rows.sort((a, b) => b.grubhubPct  - a.grubhubPct);
    else rows.sort((a, b) => b.total3poPct - a.total3poPct);
    return rows;
  }, [stores, sort]);

  // District totals
  const dist = useMemo(() => {
    const d = { doorDashSales: 0, uberEatsSales: 0, grubhubSales: 0, total3poSales: 0, allNetSales: 0 };
    for (const s of stores) {
      d.doorDashSales  += s.doorDashSales;
      d.uberEatsSales  += s.uberEatsSales;
      d.grubhubSales   += s.grubhubSales;
      d.total3poSales  += s.total3poSales;
      d.allNetSales    += s.allNetSales;
    }
    const tpo = d.total3poSales;
    return {
      ...d,
      total3poPct:  d.allNetSales > 0 ? d.total3poSales / d.allNetSales : 0,
      doorDashPct:  tpo > 0 ? d.doorDashSales / tpo : 0,
      uberEatsPct:  tpo > 0 ? d.uberEatsSales / tpo : 0,
      grubhubPct:   tpo > 0 ? d.grubhubSales  / tpo : 0,
    };
  }, [stores]);

  const isEmpty = !cashRows.length;

  return h('div', { style: { padding: 20 } },

    // Period selector
    h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 } },
      ['7', '28', '90'].map(d => h(Pill, { key: d, active: period === +d, onClick: () => setPeriod(+d) }, d === '7' ? '7d' : d === '28' ? '28d' : '90d')),
    ),

    isEmpty
      // ── Empty state ─────────────────────────────────────────────────
      ? h('div', {
          style: {
            textAlign: 'center', padding: '60px 20px',
            color: 'var(--text3)',
          }
        },
          h('div', { style: { fontSize: 40, marginBottom: 12 } }, '🛵'),
          h('div', { style: { fontSize: 16, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 } },
            'No Cash Sheet data yet'
          ),
          h('div', { style: { fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.6 } },
            'QSRSoft Cash Sheet reports start arriving daily at 10:30 AM. ' +
            'You can also drag-drop a Cash Sheet file to load it now.'
          ),
        )

      // ── Data view ───────────────────────────────────────────────────
      : h(React.Fragment, null,

          // Summary cards
          h('div', {
            style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }
          },
            h(Card, {
              label: `Total 3PO Sales (${period}d)`,
              value: f$(dist.total3poSales),
              sub: `${fPct(dist.total3poPct)} of all sales`,
            }),
            h(Card, {
              label: 'DoorDash',
              value: fPct(dist.doorDashPct),
              sub: f$(dist.doorDashSales),
              color: DD_COLOR,
            }),
            h(Card, {
              label: 'UberEats',
              value: fPct(dist.uberEatsPct),
              sub: f$(dist.uberEatsSales),
              color: UE_COLOR,
            }),
            h(Card, {
              label: 'Grubhub',
              value: fPct(dist.grubhubPct),
              sub: f$(dist.grubhubSales),
              color: GH_COLOR,
            }),
          ),

          // District platform bar
          h('div', { style: { marginBottom: 20 } },
            h('div', { style: { fontSize: 11, color: 'var(--text3)', marginBottom: 6 } }, 'DISTRICT PLATFORM MIX'),
            h(PlatformBar, { dd: dist.doorDashPct, ue: dist.uberEatsPct, gh: dist.grubhubPct }),
            h('div', { style: { display: 'flex', gap: 16, marginTop: 6 } },
              h('span', { style: { fontSize: 11, color: DD_COLOR } }, `● DoorDash ${fPct(dist.doorDashPct)}`),
              h('span', { style: { fontSize: 11, color: UE_COLOR } }, `● UberEats ${fPct(dist.uberEatsPct)}`),
              h('span', { style: { fontSize: 11, color: GH_COLOR } }, `● Grubhub ${fPct(dist.grubhubPct)}`),
            ),
          ),

          // Store table — horizontal scroll container so the wide table doesn't clip on
          // mobile (panel-contract.md's mobile-scroll check, opportunistic while already
          // touching this render path for the tab merge).
          h('div', { style: { overflowX: 'auto' } },
            h('table', {
              style: {
                width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640,
              }
            },
              h('thead', null,
                h('tr', { style: { borderBottom: '1px solid var(--bdr)' } },
                  ['Store', '3PO Sales', '% of Sales', 'DoorDash', 'UberEats', 'Grubhub', 'Platform Mix'].map((col, i) => {
                    const sortKey = ['', 'sales', 'pct', 'dd', 'ue', 'gh', ''][i];
                    return h('th', {
                      key: col,
                      onClick: sortKey ? () => setSort(sortKey) : undefined,
                      style: {
                        padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right',
                        color: sort === sortKey ? 'var(--amber)' : 'var(--text3)',
                        fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
                        letterSpacing: '0.05em', whiteSpace: 'nowrap',
                        cursor: sortKey ? 'pointer' : 'default',
                        userSelect: 'none',
                      }
                    }, col + (sort === sortKey ? ' ↓' : ''));
                  })
                ),
              ),
              h('tbody', null,
                sorted.map((s, i) => {
                  const name = STORE_NAMES?.[s.loc] || s.loc;
                  const leaderColor = s.leader === 'DoorDash' ? DD_COLOR
                                    : s.leader === 'UberEats' ? UE_COLOR : GH_COLOR;
                  return h('tr', {
                    key: s.loc,
                    style: {
                      borderBottom: '1px solid var(--bdr)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--surf2)',
                    }
                  },
                    h('td', { style: { padding: '10px 10px', fontWeight: 600 } },
                      h('div', null, name),
                      h('div', { style: { fontSize: 11, color: 'var(--text3)' } },
                        s.days, ' day', s.days !== 1 ? 's' : '', ' · ',
                        h('span', { style: { color: leaderColor } }, s.leader, ' leads')
                      ),
                    ),
                    h('td', { style: { padding: '10px 10px', textAlign: 'right', fontWeight: 600 } }, f$(s.total3poSales)),
                    h('td', {
                      style: {
                        padding: '10px 10px', textAlign: 'right', fontWeight: 700,
                        color: s.total3poPct > 0.12 ? 'var(--amber)' : 'var(--text)',
                      }
                    }, fPct(s.total3poPct)),
                    h('td', { style: { padding: '10px 10px', textAlign: 'right', color: DD_COLOR, fontWeight: 600 } },
                      fPct(s.doorDashPct)
                    ),
                    h('td', { style: { padding: '10px 10px', textAlign: 'right', color: UE_COLOR, fontWeight: 600 } },
                      fPct(s.uberEatsPct)
                    ),
                    h('td', { style: { padding: '10px 10px', textAlign: 'right', color: GH_COLOR, fontWeight: 600 } },
                      fPct(s.grubhubPct)
                    ),
                    h('td', { style: { padding: '10px 10px', minWidth: 120 } },
                      h(PlatformBar, {
                        dd: s.doorDashSales, ue: s.uberEatsSales, gh: s.grubhubSales
                      }),
                    ),
                  );
                })
              ),
            ),
          ),
        ),
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
// route:true (dispatch #205, URL migration batch 2) — swapped ModalShell for RoutePanelShell.
// Confirmed lower-risk than this batch's other five: this panel never hand-rolled its own
// backdrop (it was already ModalShell-based), so there's no ratchet-modal-backdrop-bypass.js
// interaction here, just the shell swap + onClose->onBack rename.
export function DeliveryMixPanel({ ds, stores, onClose }) {
  const [tab, setTab] = useState('overview');  // 'overview' | 'delivery' — Overview first (see file header)

  return h(RoutePanelShell, {
    title: 'Delivery & Channel Mix',
    subtitle: h('span', null, 'District channel-mix overview, drill into 3rd-party delivery platforms', h(InfoIcon, { articleKey: 'delivery_3po' })),
    icon: '🛵',
    onBack: onClose,
    headerExtra: h('div', { style: { display: 'flex', gap: 6 } },
      h(Pill, { active: tab === 'overview', onClick: () => setTab('overview') }, '📊 Channel Overview'),
      h(Pill, { active: tab === 'delivery', onClick: () => setTab('delivery') }, '🛵 Delivery Platforms'),
    ),
  },
    tab === 'overview' ? h(ChannelOverviewTab, { stores, ds }) : h(DeliveryPlatformsTab, { ds }),
  );
}
