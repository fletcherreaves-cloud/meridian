// @ts-nocheck
// ── Store Cockpit — Food Cost + Labor & Scheduling tabs (dispatch #204) ──────────────────────
// Owner-approved concept ("I am a fan of the store cockpit"). Design reference:
// memory/design-refs/store-cockpit-mockup.html — dark-first, McDonald's-gold accent, hero
// verdict band + driver bars + a flagship visual per tab. This file wires every number on that
// mockup to the REAL engines named in memory/dispatch-204.md, for the store actually selected
// in Store Analytics' District View. Content-only components (no ModalShell/own backdrop) —
// they render inside store-analytics.js's existing RoutePanelShell, matching dispatch #200's
// embedded LocationIntelligence pattern.
//
// Every number here is sourced through the named engines / metric-source.js — never a raw
// filter over labor/controls/FOB rows in ds, per CLAUDE.md's standing "source through the
// shared helpers" rule.
import * as React from 'react';
import { f$, fP, fPct } from '../utils/fmt.js';
import {
  loadQsrFob, loadQsrVarianceHistory, loadDailyActivityRangeForStore, loadStoreLaborConfig,
} from '../lib/supabase.js';
import { buildStoreFobReport } from '../engine/fob-report.js';
import { fobSnapshotByStore } from '../engine/eom-inventory.js';
import { fobDailyTrace, biggestJumpDay } from '../engine/variance-trace.js';
import { computeStoreDataDiscipline } from '../engine/waste-discipline.js';
import { scanAllPairs } from '../engine/signal-registry.js';
import { resolveLaborTarget } from '../engine/labor-basis.js';
import { computeLaborGapSplit } from '../engine/labor-gap-split.js';
import { overnightOpenness, overnightExcessByStore } from '../engine/labor-standard.js';
import {
  metricSeries, metricRate, ensureLazyFill, isLazyFillPending, isLazyFillError,
} from '../engine/metric-source.js';
import { addD, dKey, lastClosedBusinessDay, dowOf } from '../utils/date.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const { useState, useEffect, useMemo } = React;

// ── Shared visual primitives — mirrors the mockup's card/pill/driver-bar shapes using this
// app's own CSS custom-property ladder (--surf/--surf2/--surf3/--bdr/--bdr2/--text/--text2/
// --text3/--good/--warn/--crit/--amber/--blue/--orange), never a hardcoded rgba(255,255,255,x)
// (CLAUDE.md's standing white-alpha rule) — color-mix(in srgb, var(--x) N%, transparent) tints
// the token itself, so it stays correct in both themes automatically. ──────────────────────────
const tint = (v, pct) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;
const mixBg = (v, pct, base = '--surf3') => `color-mix(in srgb, var(${v}) ${pct}%, var(${base}))`;

const STATUS_COLOR = { good: 'var(--good)', warn: 'var(--warn)', crit: 'var(--crit)', flat: 'var(--text3)' };

function Card({ title, sub, accent, style }, ...children) {
  return div({ style: {
    background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--rl)',
    padding: '16px 18px', borderLeft: accent ? '3px solid ' + accent : undefined, ...style,
  } },
    title && div({ style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' } },
      span({ style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: accent || 'var(--text2)' } }, title),
      sub && span({ style: { fontSize: 10, color: 'var(--text3)' } }, sub)),
    ...children);
}

function VerdictBand(label, textNode, whyNode) {
  return div({ style: {
    display: 'flex', gap: 10, padding: '11px 14px', background: 'var(--surf2)',
    border: '.5px solid var(--bdr)', borderLeft: '3px solid var(--amber)', borderRadius: 8, marginTop: 12,
  } },
    div({ style: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--amber)', flexShrink: 0, paddingTop: 1 } }, 'Coach'),
    div({ style: { flex: 1 } },
      div({ style: { fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: 'var(--text)' } }, textNode),
      whyNode && div({ style: { fontSize: 10.5, color: 'var(--text2)', marginTop: 7, paddingTop: 7, borderTop: '.5px solid var(--bdr)', lineHeight: 1.5 } }, whyNode)));
}

// One driver-bar row (Food Cost components, ranked).
function DriverRow({ rank, label, actualTxt, gapTxt, actualPct, targetPct, status }) {
  return div({ style: { display: 'grid', gridTemplateColumns: '128px 1fr 84px', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '.5px solid var(--bdr)' } },
    div({ style: { fontSize: 11.5, fontWeight: 600 } }, span({ style: { color: 'var(--text3)', fontWeight: 400, marginRight: 5 } }, rank + '.'), label),
    div({ style: { position: 'relative', height: 16, background: 'var(--surf3)', borderRadius: 4 } },
      div({ style: { position: 'absolute', top: 0, left: 0, height: '100%', width: Math.max(2, Math.min(100, actualPct)) + '%', borderRadius: 4, background: STATUS_COLOR[status] } }),
      targetPct != null && div({ style: { position: 'absolute', top: -2, bottom: -2, width: 2, background: 'var(--text)', opacity: .5, left: Math.max(0, Math.min(100, targetPct)) + '%' } })),
    div({ style: { fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, textAlign: 'right' } }, actualTxt,
      div({ style: { fontSize: 9.5, fontWeight: 500, color: 'var(--text3)' } }, gapTxt)));
}

function CorrRow({ a, b, r, sig }) {
  const mag = Math.min(Math.abs(r), 1) * 100;
  const pos = r >= 0;
  return div({ style: { display: 'grid', gridTemplateColumns: '1fr 120px 58px', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '.5px solid var(--bdr)', fontSize: 11.5 } },
    div(null, span({ style: { fontWeight: 700 } }, a), ' ↔ ', span({ style: { color: 'var(--text2)' } }, b)),
    div({ style: { position: 'relative', height: 12, background: 'var(--surf3)', borderRadius: 3 } },
      div({ style: { position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1, background: 'var(--bdr2)' } }),
      div({ style: { position: 'absolute', top: 1, bottom: 1, borderRadius: 3, background: pos ? 'var(--blue)' : 'var(--orange)', left: pos ? '50%' : (50 - mag / 2) + '%', width: (mag / 2) + '%' } })),
    div({ style: { fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, textAlign: 'right' } },
      (r >= 0 ? '+' : '') + r.toFixed(2), sig && span({ style: { display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--amber)', marginLeft: 5 }, title: 'Statistically significant, FDR-guarded' })));
}

function CorrelationStrip({ results, emptyText }) {
  if (!results || !results.length) return div({ style: { fontSize: 11, color: 'var(--text3)', padding: '6px 0' } }, emptyText || 'No correlations surfaced yet for this store — needs more history.');
  return div(null, results.map((r, i) => h(CorrRow, { key: i, a: r.xLabel, b: r.yLabel, r: r.r, sig: r.fdrSig })));
}

function HeroNumber({ label, value, valueColor, delta, deltaColor, sub, oppLabel, oppValue }) {
  return div({ style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' } },
    div(null,
      div({ style: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 5 } }, label),
      div({ style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 40, lineHeight: 1, color: valueColor || 'var(--text)' } }, value),
        delta != null && span({ style: { fontSize: 13, fontWeight: 600, color: deltaColor } }, delta)),
      sub && div({ style: { fontSize: 11, color: 'var(--text3)', marginTop: 4 } }, sub)),
    oppValue != null && div({ style: { textAlign: 'right' } },
      div({ style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 21, color: 'var(--amber)' } }, oppValue),
      div({ style: { fontSize: 9.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } }, oppLabel)));
}

const gridStyle = (cols) => ({ display: 'grid', gridTemplateColumns: cols, gap: 12, marginBottom: 12 });

// ── Small date helpers, local to this file ───────────────────────────────────────────────────
function lastPeriods(period, n = 6) {
  const m = /^(\d{4})-(\d{2})$/.exec(period || '');
  if (!m) return period ? [period] : [];
  let y = +m[1], mo = +m[2] - 1;
  const out = [];
  for (let i = 0; i < n; i++) { const d = new Date(y, mo - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  return out.reverse();
}
const statusOf = (deltaPP) => deltaPP == null ? 'flat' : deltaPP <= 0 ? 'good' : deltaPP <= 0.1 ? 'warn' : 'crit';

// ── Shared FOB rows loader — dispatch #208: same "read the copy App.js already loaded, fetch
// only if it genuinely isn't there yet" pattern eom-dashboard.js uses for ds.qsrFobRows
// (dispatch #211's perf fix), factored out so BOTH FoodCostCockpitTab and Overview's Tab Digest
// Food Cost tile share the one fallback-fetch effect instead of two copies of it. ──────────────
export function useFobRowsWithFallback(ds) {
  const dsFob = (ds && ds.qsrFobRows) || null;
  const [fobFallback, setFobFallback] = useState(null);
  useEffect(() => {
    if (dsFob && dsFob.length) return;
    let live = true;
    loadQsrFob().then(r => { if (live) setFobFallback(r || []); }).catch(() => { if (live) setFobFallback([]); });
    return () => { live = false; };
  }, [dsFob]);
  const fobRows = (dsFob && dsFob.length) ? dsFob : (fobFallback || []);
  const pending = !(dsFob && dsFob.length) && fobFallback === null;
  return { fobRows, pending };
}

// ── Shared period-resolution/report-assembly — dispatch #208: this used to live INLINE inside
// FoodCostCockpitTab only (nowPeriod, lastPeriods(), monthlyByLoc, curSnap selection, the
// compActual/compTarget build, buildStoreFobReport call). Factored into one exported helper so
// Overview's Tab Digest Food Cost tile can get the same FOB %/gap/top-driver read without a
// second copy of this ~40-line assembly (CLAUDE.md's "check whether a helper exists before
// writing one" / never-duplicate-a-computation rule). `varRows` is OPTIONAL and defaults to
// none — the full cockpit tab passes its own self-loaded item-level variance (masking/topItems
// detail); a lighter caller (the Overview headline tile) can omit it entirely and still gets a
// correct fobPct/gapPP/topDriver/actions[0] (buildStoreFobReport handles varRows:[] gracefully —
// only the masking check and the statv action's example-item list go empty, never wrong).
export function computeFoodCostHeadline(loc, fobRows, t, opts = {}) {
  const { name, org, varRows } = opts;
  const locS = String(loc);
  const storeFobRows = (fobRows || []).filter(r => String(parseInt(r.loc, 10)) === locS);
  if (!storeFobRows.length) return null;
  const nowPeriod = new Date().toISOString().slice(0, 7);
  const months = lastPeriods(nowPeriod, 6);
  const byMonth = {};
  for (const mo of months) byMonth[mo] = fobSnapshotByStore(storeFobRows, mo);
  let reportPeriod = nowPeriod;
  for (let i = months.length - 1; i >= 0; i--) { const f = byMonth[months[i]] || {}; if (Object.values(f).some(x => x && x.fobPct != null)) { reportPeriod = months[i]; break; } }
  const monthlyByLoc = {};
  for (const mo of months) { if (mo > reportPeriod) continue; const f = byMonth[mo] || {}; const row = f[locS] || Object.values(f)[0]; if (row && row.fobPct != null) monthlyByLoc[mo] = row.fobPct; }
  const snap = byMonth[reportPeriod] || {};
  const curSnap = snap[locS] || Object.values(snap)[0] || null;
  if (!curSnap) return null;
  const compActual = curSnap.sales ? {
    statv: curSnap.statv / curSnap.sales, comp: curSnap.comp / curSnap.sales, raw: curSnap.raw / curSnap.sales,
    cond: curSnap.cond / curSnap.sales, emp: curSnap.emp / curSnap.sales, unex: curSnap.unex / curSnap.sales,
  } : null;
  const compTarget = { statv: t.tStatLoss, comp: t.tCompWaste, raw: t.tRawWaste, cond: t.tCondiment, emp: t.tEmpFood, unex: t.tUnex };
  const report = buildStoreFobReport(locS, {
    name, org, patch: null, fob: curSnap, target: t.tFOBTarget != null ? Number(t.tFOBTarget) : null,
    monthly: monthlyByLoc, varRows: (varRows || []).map(v => ({ descr: v.descr, wrin: v.wrin, dolDiff: v.dolDiff })),
    compActual, compTarget,
  });
  return { ...report, reportPeriod };
}

// ════════════════════════════════════════ FOOD COST TAB ═══════════════════════════════════════
export function FoodCostCockpitTab({ store, ds }) {
  const loc = String(store.loc), t = store.t || {};

  // FOB rows — shared hook (see useFobRowsWithFallback above).
  const { fobRows, pending: fobPending } = useFobRowsWithFallback(ds);
  const storeFobRows = useMemo(() => fobRows.filter(r => String(parseInt(r.loc, 10)) === loc), [fobRows, loc]);

  // Report period — MTD if it has real (non-zero) FOB yet, else fall back to the latest
  // completed month, exactly like eom-dashboard.js's own FOB Report (owner's own review habit).
  // (computeFoodCostHeadline resolves this the same way; recomputed here too so `reportPeriod`
  // is available before varRows — which depends on it — can be fetched below.)
  const nowPeriod = new Date().toISOString().slice(0, 7);
  const { reportPeriod } = useMemo(() => {
    const months = lastPeriods(nowPeriod, 6);
    const byMonth = {};
    for (const mo of months) byMonth[mo] = fobSnapshotByStore(storeFobRows, mo);
    let rp = nowPeriod;
    for (let i = months.length - 1; i >= 0; i--) { const f = byMonth[months[i]] || {}; if (Object.values(f).some(x => x && x.fobPct != null)) { rp = months[i]; break; } }
    return { reportPeriod: rp };
  }, [storeFobRows, nowPeriod]);

  // Item-level variance — self-loaded, scoped to this one store + period (loadQsrVarianceHistory
  // is the scoped reader; never the district-wide loadQsrVarianceStat this tab has no use for).
  const [varRows, setVarRows] = useState(null);
  useEffect(() => {
    let live = true;
    setVarRows(null);
    loadQsrVarianceHistory({ loc, periods: [reportPeriod] })
      .then(r => { if (live) setVarRows((r || []).filter(v => v.dolDiff != null && v.dolDiff !== 0)); })
      .catch(() => { if (live) setVarRows([]); });
    return () => { live = false; };
  }, [loc, reportPeriod]);

  const report = useMemo(() => computeFoodCostHeadline(loc, storeFobRows, t, { name: store.name, org: store.org, varRows }),
    [storeFobRows, varRows, t, loc, store.name, store.org]);

  // Day-by-day variance trace + biggest-jump callout — the flagship visual, zero new data.
  // annotateTouchpoints (real-count bracketing) is DEFERRED here — it needs
  // analyzeCountCadence's session data (weekly-cadence.js), a separate load this tab doesn't
  // otherwise need; biggestJumpDay still works standalone (falls back to period-start as the
  // window bracket), so the callout is real, just less precise than the district FOB Report's
  // count-anchored version.
  const trace = useMemo(() => fobDailyTrace(storeFobRows, { loc, period: reportPeriod }), [storeFobRows, loc, reportPeriod]);
  const jump = useMemo(() => biggestJumpDay(trace), [trace]);

  // Data-discipline (waste-logging cadence) — lazy-fill, load-on-open, same shape as
  // analytics.js's FOBAnalysisPanel.
  const [wastePending, setWastePending] = useState(true);
  const [wasteFailed, setWasteFailed] = useState(false);
  useEffect(() => {
    const pending = ensureLazyFill('wasteRows');
    setWastePending(pending);
    if (!pending) { setWasteFailed(isLazyFillError('wasteRows')); return; }
    const id = setInterval(() => { if (!isLazyFillPending('wasteRows')) { setWastePending(false); setWasteFailed(isLazyFillError('wasteRows')); clearInterval(id); } }, 300);
    return () => clearInterval(id);
  }, []);
  const discipline = useMemo(() => {
    if (wastePending || wasteFailed || !ds) return null;
    const rows = (ds.wasteRows || []).filter(r => r && String(parseInt(r.loc, 10)) === loc);
    const d = computeStoreDataDiscipline(rows, { asOf: new Date().toISOString().slice(0, 10) });
    return d.find(x => x.loc === loc) || null;
  }, [ds, wastePending, wasteFailed, loc]);

  // Correlation strip — same scanAllPairs Scanner uses, scoped to this one store, monthly
  // (food_cost metrics are monthly-only) against everything (weather/calendar/controls/etc.).
  const scan = useMemo(() => (ds ? scanAllPairs(ds, { granularity: 'monthly', scopeLoc: loc }) : null), [ds, loc]);
  const foodCorr = useMemo(() => (scan ? scan.results.filter(r => r.xCat === 'Food Cost' || r.yCat === 'Food Cost').slice(0, 6) : []), [scan]);

  if (fobPending && !report) return div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 12 } }, 'Loading Food Cost data…');
  if (!report) return div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 12 } }, 'No FOB data resolved yet for this store — check the auto QSRSoft pull or upload a Food Cost report.');

  const gapPP = report.gapPP;
  const comps = [...report.comps].sort((a, b) => (b.deltaPP ?? -999) - (a.deltaPP ?? -999));
  const maxComp = Math.max(1, ...comps.map(c => Math.max(c.actualPP || 0, c.tgtPP || 0))) * 1.15;

  const verdictText = report.actions[0]
    ? span(null, report.actions[0])
    : span(null, 'No action items — FOB is at or under target.');
  const whyText = report.topDriver
    ? `Why: unexplained shrink and waste usually trace to a small set of high-variance items or one component, not a store-wide issue — ${report.topDriver.label} is currently ${report.topDriver.deltaPP > 0 ? report.topDriver.deltaPP.toFixed(2) + 'pp over' : Math.abs(report.topDriver.deltaPP).toFixed(2) + 'pp under'} its own target.`
    : null;

  return div(null,
    div(gridStyle('1.3fr 1fr'),
      Card({ accent: 'var(--amber)' },
        HeroNumber({
          label: 'FOB % — Food Over Base · ' + reportPeriod,
          value: report.fobPct != null ? fP(report.fobPct) : '—',
          valueColor: report.overTarget ? 'var(--crit)' : report.underTarget ? 'var(--good)' : 'var(--text)',
          delta: gapPP != null ? (gapPP >= 0 ? '+' : '') + gapPP.toFixed(2) + 'pp' : null,
          deltaColor: gapPP != null ? (gapPP >= 0 ? 'var(--crit)' : 'var(--good)') : 'var(--text3)',
          sub: 'vs target ' + (report.target != null ? fP(report.target) : '—') + ' · ' + (report.sales ? f$(Math.round(report.sales)) + ' product sales' : ''),
          oppLabel: report.overTarget ? 'Monthly opportunity' : report.underTarget ? 'Monthly savings' : null,
          oppValue: report.overTarget ? f$(report.oppDollars) : report.underTarget ? f$(report.savingsDollars) : null,
        }),
        VerdictBand('Coach', verdictText, whyText)),
      Card({ title: 'Component Drivers', sub: 'actual vs. target, ranked worst→best' },
        div(null, comps.map((c, i) => h(DriverRow, {
          key: c.key, rank: i + 1, label: c.label,
          actualTxt: c.actualPP != null ? c.actualPP.toFixed(2) + '%' : '—',
          gapTxt: c.deltaPP != null ? (c.deltaPP >= 0 ? '+' : '') + c.deltaPP.toFixed(2) + 'pp' : '',
          actualPct: c.actualPP != null ? (c.actualPP / maxComp) * 100 : 0,
          targetPct: c.tgtPP != null ? (c.tgtPP / maxComp) * 100 : null,
          status: statusOf(c.deltaPP),
        })))),
    ),
    div(gridStyle('1fr 1fr'),
      Card({ title: 'Day-by-Day Variance', sub: '$ swing vs. prior day, ' + reportPeriod },
        trace.length ? h(VarianceTrace, { trace }) : div({ style: { fontSize: 11, color: 'var(--text3)', padding: 20, textAlign: 'center' } }, 'No daily FOB snapshots yet for this period.'),
        jump && div({ style: { display: 'flex', gap: 10, marginTop: 12, padding: '9px 11px', background: tint('--crit', 8), border: '1px solid ' + tint('--crit', 30), borderRadius: 8 } },
          span({ style: { fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--crit)', flexShrink: 0 } }, 'Biggest jump'),
          span({ style: { fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 } },
            h('b', { style: { color: 'var(--text)' } }, jump.date + ' · ' + (jump.delta >= 0 ? '+' : '') + f$(Math.round(jump.delta))),
            ' single-day swing in total FOB. Window since ', h('b', { style: { color: 'var(--text)' } }, jump.windowStart || reportPeriod + '-01'), '.'))),
      Card({ title: 'Masking Check', sub: 'gross losses vs. gross gains', accent: report.masking ? 'var(--warn)' : undefined },
        (varRows == null) ? div({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Loading item-level variance…')
        : div(null,
          div({ style: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' } },
            div({ style: { textAlign: 'center' } }, div({ style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 20, color: 'var(--crit)' } }, f$(Math.round(Math.abs(report.grossLoss)))), div({ style: { fontSize: 9.5, color: 'var(--text3)', textTransform: 'uppercase' } }, 'Gross losses')),
            div({ style: { color: 'var(--text3)', fontSize: 16, textAlign: 'center' } }, '−'),
            div({ style: { textAlign: 'center' } }, div({ style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 20, color: 'var(--good)' } }, f$(Math.round(report.grossGain))), div({ style: { fontSize: 9.5, color: 'var(--text3)', textTransform: 'uppercase' } }, 'Gross gains'))),
          div({ style: { fontSize: 11.5, color: 'var(--text2)', marginTop: 12, lineHeight: 1.5 } },
            report.masking
              ? span(null, 'Net variance (', h('b', { style: { color: 'var(--text)' } }, f$(Math.round(report.net))), ') looks moderate, but it hides ', h('b', { style: { color: 'var(--text)' } }, f$(Math.round(Math.abs(report.grossLoss) + report.grossGain)) + ' in gross movement'), ' — verify the offsetting counts are real, not over-counts masking a true shortage.')
              : span(null, 'No material masking detected this period — gross gains do not meaningfully offset gross losses.')),
          discipline && div({ style: { display: 'flex', alignItems: 'center', gap: 9, marginTop: 13, paddingTop: 13, borderTop: '.5px solid var(--bdr)' } },
            span({ style: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: discipline.totalMissing > 0 ? 'var(--warn)' : 'var(--good)' } }),
            span({ style: { fontSize: 11, color: 'var(--text2)' } }, 'Waste-logging cadence: ',
              h('b', { style: { color: 'var(--text)' } }, discipline.totalMissing + ' missing in last 14 expected days'),
              discipline.estImpact ? span(null, ' · est. impact ', h('b', { style: { color: 'var(--text)' } }, '+' + f$(Math.round(discipline.estImpact)))) : null)),
          (!discipline && !wastePending) && div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 12 } }, wasteFailed ? 'Waste data failed to load.' : 'No submission pattern derivable yet for this store.'))),
    ),
    Card({ title: 'What Moves With Food Cost', sub: 'Pearson r · Benjamini–Hochberg FDR-guarded · dot = significant' },
      scan ? h(CorrelationStrip, { results: foodCorr }) : div({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Scanning…')));
}

// SVG day-by-day variance trace (mirrors the mockup's inline SVG line chart).
function VarianceTrace({ trace }) {
  const W = 560, H = 130, padL = 6, padR = 6, padT = 10, padB = 18;
  const vals = trace.map(p => p.delta.fob || 0);
  const minV = Math.min(0, ...vals), maxV = Math.max(0, ...vals);
  const range = (maxV - minV) || 1;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const zeroY = padT + innerH - ((0 - minV) / range) * innerH;
  const pts = trace.map((p, i) => ({
    x: padL + (trace.length > 1 ? (i / (trace.length - 1)) * innerW : innerW / 2),
    y: padT + innerH - (((p.delta.fob || 0) - minV) / range) * innerH,
    v: p.delta.fob || 0, date: p.date,
  }));
  const pathD = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const maxIdx = vals.indexOf(vals.reduce((best, v) => Math.abs(v) > Math.abs(best) ? v : best, 0));
  return h('svg', { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto', display: 'block', overflow: 'visible' } },
    h('line', { x1: padL, y1: zeroY, x2: W - padR, y2: zeroY, stroke: 'var(--bdr2)', strokeWidth: 1, strokeDasharray: '2,3' }),
    h('path', { d: pathD, fill: 'none', stroke: 'var(--amber)', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }),
    ...pts.map((p, i) => h('circle', { key: i, cx: p.x, cy: p.y, r: i === maxIdx ? 4 : 2.2, fill: i === maxIdx ? 'var(--crit)' : 'var(--amber)', stroke: 'var(--surf)', strokeWidth: 1 },
      h('title', null, p.date + ': ' + (p.v >= 0 ? '+' : '') + '$' + Math.round(p.v)))));
}

// ═════════════════════════════════════ LABOR & SCHEDULING TAB ═════════════════════════════════
const DAYS_BACK_HEAT = 42; // trailing 6 weeks, matching the mockup

function completeDayKeys(rows) {
  const byDay = new Map();
  for (const r of rows) {
    if (!r || !r.dt || !r.hour_slot) continue;
    const k = String(r.dt).slice(0, 10);
    if (!byDay.has(k)) byDay.set(k, new Set());
    byDay.get(k).add(r.hour_slot);
  }
  const complete = new Set();
  for (const [k, slots] of byDay) if (slots.size === 24) complete.add(k);
  return complete;
}
// Block label from hour_slot (the END of the hour, per CLAUDE.md) — displayed as the block's
// START clock hour ("05:00" -> the 4-5am block -> "4a"), so the 24 columns read left-to-right
// as the real 4am-4am business day, matching labor-standard.js's own hour_slot parsing.
function slotStartLabel(hourSlot) {
  const hEnd = parseInt(String(hourSlot).slice(0, 2), 10);
  const d = (hEnd - 1 + 24) % 24;
  const ampm = d < 12 ? 'a' : 'p';
  let hh = d % 12; if (hh === 0) hh = 12;
  return hh + ampm;
}

export function LaborCockpitTab({ store, ds }) {
  const loc = String(store.loc), t = store.t || {};

  // Planning-vs-execution split (labor-gap-split.js) — Wed-Tue PAY week, the engine's own
  // required boundary, distinct from the 4am business day used elsewhere in this tab.
  const splitWeeks = useMemo(() => {
    if (!ds) return [];
    const rows = (ds.qsrActSummaryRows || []).filter(r => String(r.loc) === loc);
    return computeLaborGapSplit(rows).filter(w => w.loc === loc || String(w.loc) === loc);
  }, [ds, loc]);
  const completeWeeks = useMemo(() => splitWeeks.filter(w => w.complete).sort((a, b) => b.weekKey.localeCompare(a.weekKey)), [splitWeeks]);
  const curWeek = completeWeeks[0] || null;
  const prevWeek = completeWeeks[1] || null;

  // Hero: current pay-week labor % (metricRate — sum/sum, never mean-of-daily, so an
  // in-progress day can't skew it) vs the resolved Crew Labor target.
  const target = resolveLaborTarget(t);
  const weekRange = curWeek ? { s: new Date(curWeek.weekStart + 'T00:00:00'), e: addD(new Date(curWeek.weekStart + 'T00:00:00'), 6) } : null;
  const actualPct = useMemo(() => (ds && weekRange) ? metricRate(ds, loc, weekRange, 'laborPct') : null, [ds, loc, weekRange]);
  const weekSales = useMemo(() => {
    if (!ds || !weekRange) return null;
    const s = metricSeries(ds, loc, weekRange, 'sales');
    return Object.values(s).reduce((a, b) => a + b, 0);
  }, [ds, loc, weekRange]);
  const gapPP = (actualPct != null && target != null) ? (actualPct - target) * 100 : null;
  const oppWeek = (gapPP != null && gapPP > 0 && weekSales) ? (actualPct - target) * weekSales : 0;

  // Rate/hours/sales decomposition — the three metric-source.js inputs, week-over-week.
  const decomp = useMemo(() => {
    if (!ds || !curWeek || !prevWeek) return null;
    const curR = { s: new Date(curWeek.weekStart + 'T00:00:00'), e: addD(new Date(curWeek.weekStart + 'T00:00:00'), 6) };
    const prevR = { s: new Date(prevWeek.weekStart + 'T00:00:00'), e: addD(new Date(prevWeek.weekStart + 'T00:00:00'), 6) };
    const sumOf = (range, key) => Object.values(metricSeries(ds, loc, range, key)).reduce((a, b) => a + b, 0);
    const avgOf = (range, key) => { const s = metricSeries(ds, loc, range, key); const v = Object.values(s); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const rateCur = avgOf(curR, 'avgRate'), ratePrev = avgOf(prevR, 'avgRate');
    const hrsCur = sumOf(curR, 'actHrs'), hrsPrev = sumOf(prevR, 'actHrs');
    const salCur = sumOf(curR, 'sales'), salPrev = sumOf(prevR, 'sales');
    return {
      rate: { cur: rateCur, prev: ratePrev, delta: (rateCur != null && ratePrev != null) ? rateCur - ratePrev : null },
      hrs: { cur: hrsCur, prev: hrsPrev, pct: hrsPrev ? (hrsCur - hrsPrev) / hrsPrev : null },
      sales: { cur: salCur, prev: salPrev, pct: salPrev ? (salCur - salPrev) / salPrev : null },
    };
  }, [ds, loc, curWeek, prevWeek]);

  // Intraday heat map + overnight excess — self-loaded, scoped to this one store's hourly rows
  // (loadDailyActivityRangeForStore, added this dispatch, so this doesn't pull all 27 stores).
  const [hourly, setHourly] = useState(null);
  const [storeLaborConfig, setStoreLaborConfig] = useState(null);
  useEffect(() => {
    let live = true;
    setHourly(null);
    const end = dKey(lastClosedBusinessDay());
    const start = dKey(addD(new Date(end + 'T00:00:00'), -DAYS_BACK_HEAT));
    Promise.all([loadDailyActivityRangeForStore(loc, start, end), loadStoreLaborConfig()])
      .then(([rows, cfg]) => { if (live) { setHourly(rows || []); setStoreLaborConfig(cfg || {}); } })
      .catch(() => { if (live) { setHourly([]); setStoreLaborConfig({}); } });
    return () => { live = false; };
  }, [loc]);

  const heat = useMemo(() => {
    if (!hourly) return null;
    // 24-slot completeness guard — this reads the RAW qsr_daily_activity table (via
    // loadDailyActivityRangeForStore), not the qsr_daily_activity_rollup CLAUDE.md warns
    // zero-fills an in-progress "today"; a genuinely incomplete pull here has FEWER than 24
    // distinct hour_slot rows for that day, so this guard (identical to labor-standard.js's
    // own) is the correct trap for this data source.
    const complete = completeDayKeys(hourly);
    const buckets = new Map(); // "h|dow" -> {sumAct,sumNeed,n}
    for (const r of hourly) {
      if (!r.hour_slot) continue;
      const dk = String(r.dt).slice(0, 10);
      if (!complete.has(dk)) continue;
      const hEnd = parseInt(String(r.hour_slot).slice(0, 2), 10);
      const dow = dowOf(dk + 'T12:00:00');
      const key = hEnd + '|' + dow;
      if (!buckets.has(key)) buckets.set(key, { sumAct: 0, sumNeed: 0, n: 0 });
      const b = buckets.get(key);
      b.sumAct += r.actual_punched_hours || 0; b.sumNeed += r.total_needed_hours || 0; b.n++;
    }
    const slots = [...new Set(hourly.map(r => r.hour_slot).filter(Boolean))].sort();
    return { buckets, slots, nDays: complete.size };
  }, [hourly]);

  const openness = useMemo(() => hourly ? overnightOpenness(hourly) : null, [hourly]);
  const excess = useMemo(() => (openness && storeLaborConfig) ? overnightExcessByStore(storeLaborConfig, openness) : null, [openness, storeLaborConfig]);
  const excessForLoc = excess ? (excess[loc] || Object.values(excess)[0] || null) : null;

  // Correlation strip.
  const scan = useMemo(() => (ds ? scanAllPairs(ds, { granularity: 'daily', scopeLoc: loc }) : null), [ds, loc]);
  const laborCorr = useMemo(() => (scan ? scan.results.filter(r => r.xCat === 'Labor' || r.yCat === 'Labor').slice(0, 6) : []), [scan]);

  if (!ds) return div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 12 } }, 'Loading…');
  if (!curWeek) return div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 12 } }, 'No complete pay week of DAR data yet for this store — the planning-vs-execution split needs at least one full Wed–Tue week.');

  const planGap = curWeek.planningGapHrs, execGap = curWeek.executionGapHrs;
  const planAbs = planGap != null ? Math.abs(planGap) : null, execAbs = execGap != null ? Math.abs(execGap) : null;
  let verdictText, whyText;
  if (planAbs != null && execAbs != null) {
    const planLeads = planAbs >= execAbs;
    verdictText = planLeads
      ? span(null, 'The ', h('b', { style: { color: 'var(--amber)' } }, 'schedule'), ', not the shift — Needed→Scheduled gap is ', h('b', null, planAbs.toFixed(1) + ' hrs/week'), ' (planning), Scheduled→Actual is only ', h('b', null, execAbs.toFixed(1) + ' hrs'), ' (execution is close to plan).')
      : span(null, h('b', { style: { color: 'var(--amber)' } }, 'Execution'), ', not the schedule — Scheduled→Actual gap is ', h('b', null, execAbs.toFixed(1) + ' hrs/week'), ' (execution), Needed→Scheduled is only ', h('b', null, planAbs.toFixed(1) + ' hrs'), ' (the schedule itself tracks the guide).');
    whyText = planLeads
      ? (planGap < 0 ? 'The schedule itself was written short of the guide before the week started — the shortfall was built in, not lost at the punch. Fix the guide/scheduler, not the shift managers.' : 'The schedule itself was written over the guide before the week started — review the scheduler’s build against the guide.')
      : (execGap < 0 ? 'The store is running under its own written schedule — shifts are cutting early or not filling. Coach the shift managers on running the plan as written.' : 'The store is running over its own written schedule — extensions or early clock-ins are adding hours the schedule didn’t call for. Coach the shift managers on holding the plan.');
  } else {
    verdictText = 'Scheduled hours unknown for this week — total_scheduled_hours isn’t populated yet, so the planning-vs-execution split can’t be computed.';
    whyText = null;
  }

  return div(null,
    div(gridStyle('1.3fr 1fr'),
      Card({ accent: 'var(--amber)' },
        HeroNumber({
          label: 'Crew Labor % — tCrewLabor basis',
          value: actualPct != null ? fP(actualPct) : '—',
          valueColor: gapPP != null ? (gapPP > 0 ? 'var(--crit)' : 'var(--good)') : 'var(--text)',
          delta: gapPP != null ? (gapPP >= 0 ? '+' : '') + gapPP.toFixed(2) + 'pp' : null,
          deltaColor: gapPP != null ? (gapPP >= 0 ? 'var(--crit)' : 'var(--good)') : 'var(--text3)',
          sub: 'vs target ' + (target != null ? fP(target) : '—') + ' · pay week ' + curWeek.weekStart,
          oppLabel: oppWeek > 0 ? 'Opportunity / week' : null,
          oppValue: oppWeek > 0 ? f$(Math.round(oppWeek)) : null,
        }),
        VerdictBand('Coach', verdictText, whyText)),
      Card({ title: 'Why Labor % Moved', sub: 'rate · hours · sales, week-over-week' },
        decomp ? h(Decomp, { decomp }) : div({ style: { fontSize: 11, color: 'var(--text3)', padding: 16, textAlign: 'center' } }, 'Need two complete pay weeks to decompose the move.'))),
    div(gridStyle('1fr 1fr'),
      Card({ title: 'Planning vs. Execution', sub: 'split gap, current pay week' },
        h(SplitGauges, { planGap, execGap }),
        excessForLoc && !excessForLoc.na && excessForLoc.verdict && div({ style: { display: 'flex', alignItems: 'center', gap: 9, marginTop: 13, paddingTop: 13, borderTop: '.5px solid var(--bdr)' } },
          span({ style: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: excessForLoc.verdict.overStandard ? 'var(--warn)' : excessForLoc.verdict.underStandard ? 'var(--blue)' : 'var(--good)' } }),
          span({ style: { fontSize: 11, color: 'var(--text2)' } },
            excessForLoc.verdict.overStandard ? span(null, 'Overnight scheduled ', h('b', { style: { color: 'var(--text)' } }, excessForLoc.verdict.excess.toFixed(1) + ' hrs'), ' over the close-down/pre-open standard')
              : excessForLoc.verdict.underStandard ? span(null, 'Overnight running ', h('b', { style: { color: 'var(--text)' } }, excessForLoc.verdict.shortfall.toFixed(1) + ' hrs'), ' under the close-down/pre-open standard')
              : 'Overnight hours are on the close-down/pre-open standard')),
        excessForLoc && excessForLoc.na && div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 12 } }, excessForLoc.reason)),
      Card({ title: 'What Moves With Labor %', sub: 'Pearson r · FDR-guarded' },
        scan ? h(CorrelationStrip, { results: laborCorr }) : div({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Scanning…'))),
    Card({ title: 'Intraday Deployment', sub: 'scheduled hrs needed − actual, by hour × day-of-week · trailing 6 weeks' },
      heat && heat.slots.length ? h(HeatMap, { heat }) : div({ style: { fontSize: 11, color: 'var(--text3)', padding: 24, textAlign: 'center' } }, hourly === null ? 'Loading hourly activity…' : 'No hourly DAR data loaded for this window.')));
}

function Decomp({ decomp }) {
  const step = (label, valTxt, dir) => div({ style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 6px' } },
    div({ style: { width: '100%', height: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 6 } },
      div({ style: { width: 28, borderRadius: '3px 3px 0 0', height: (dir === 'flat' ? 12 : 44) + 'px', background: STATUS_COLOR[dir] } })),
    div({ style: { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text2)' } }, label),
    div({ style: { fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, marginTop: 2, color: STATUS_COLOR[dir] } }, valTxt));
  const rateDir = decomp.rate.delta == null ? 'flat' : Math.abs(decomp.rate.delta) < 0.02 ? 'flat' : decomp.rate.delta > 0 ? 'crit' : 'good';
  const hrsDir = decomp.hrs.pct == null ? 'flat' : Math.abs(decomp.hrs.pct) < 0.02 ? 'flat' : decomp.hrs.pct > 0 ? 'crit' : 'good';
  const salDir = decomp.sales.pct == null ? 'flat' : Math.abs(decomp.sales.pct) < 0.02 ? 'flat' : decomp.sales.pct > 0 ? 'good' : 'crit';
  const salesDown = decomp.sales.pct != null && decomp.sales.pct < -0.02;
  const hrsFlat = hrsDir === 'flat';
  return div(null,
    div({ style: { display: 'flex', alignItems: 'stretch', marginTop: 4 } },
      step('Avg Rate', decomp.rate.delta != null ? (decomp.rate.delta >= 0 ? '+' : '') + '$' + decomp.rate.delta.toFixed(2) + '/hr' : '—', rateDir),
      step('Hours Used', decomp.hrs.pct != null ? fPct(decomp.hrs.pct) : '—', hrsDir),
      step('Sales', decomp.sales.pct != null ? fPct(decomp.sales.pct) + ' vs prior wk' : '—', salDir)),
    (salesDown && hrsFlat) && div({ style: { fontSize: 11, color: 'var(--text2)', marginTop: 13, lineHeight: 1.5 } },
      'Hours barely moved — the labor% shift is mostly a ', h('b', { style: { color: 'var(--text)' } }, 'softer sales week'), ', not overstaffing. Coaching "cut hours" here would be the wrong lever.'));
}

function SplitGauges({ planGap, execGap }) {
  const bar = (label, desc, val, swatchColor) => {
    const abs = val != null ? Math.abs(val) : null;
    const maxRef = Math.max(4, Math.abs(planGap || 0), Math.abs(execGap || 0)) * 1.15;
    const pct = abs != null ? Math.min(100, (abs / maxRef) * 100) : 0;
    return div(null,
      div({ style: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 } },
        span({ style: { width: 9, height: 9, borderRadius: 2, background: swatchColor } }), span({ style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' } }, label)),
      div({ style: { fontSize: 10.5, color: 'var(--text3)', marginBottom: 8 } }, desc),
      div({ style: { height: 24, background: 'var(--surf3)', borderRadius: 5, position: 'relative', overflow: 'hidden' } },
        div({ style: { height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 9, fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11.5, color: '#0b0d12', width: Math.max(pct, val ? 14 : 0) + '%', background: swatchColor } }, val != null ? Math.abs(val).toFixed(1) + ' hrs' : '—')),
      div({ style: { fontSize: 10, color: 'var(--text3)', marginTop: 5 } }, val == null ? 'Unknown for this week' : val < 0 ? desc.split('→')[0].trim() + ' called for more than ' + desc.split('→')[1].trim().toLowerCase() : desc.split('→')[1].trim() + ' ran over ' + desc.split('→')[0].trim().toLowerCase()));
  };
  return div({ style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
    bar('Planning', 'Needed → Scheduled', planGap, 'var(--blue)'),
    bar('Execution', 'Scheduled → Actual', execGap, 'var(--orange)'));
}

function HeatMap({ heat }) {
  const DOW_LBL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const colorFor = (v) => {
    if (v == null) return 'var(--surf3)';
    const clamped = Math.max(-3, Math.min(3, v));
    return clamped < 0 ? mixBg('--crit', Math.round((-clamped / 3) * 100)) : mixBg('--blue', Math.round((clamped / 3) * 100));
  };
  return div(null,
    div({ style: { display: 'grid', gridTemplateColumns: '44px repeat(7,1fr)', gap: 2 } },
      div(null),
      ...DOW_LBL.map(d => span({ key: d, style: { fontSize: 9.5, fontWeight: 700, textAlign: 'center', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', paddingBottom: 3 } }, d)),
      ...heat.slots.flatMap(slot => {
        const hEnd = parseInt(String(slot).slice(0, 2), 10);
        const row = [span({ key: 'lbl-' + slot, style: { fontSize: 9, color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 5, fontFamily: 'var(--mono)' } }, slotStartLabel(slot))];
        for (let dispDow = 0; dispDow < 7; dispDow++) {
          const dow = (dispDow + 1) % 7; // display Mon..Sun -> JS 0=Sun..6=Sat
          const b = heat.buckets.get(hEnd + '|' + dow);
          const gap = b && b.n ? (b.sumAct - b.sumNeed) / b.n : null;
          const lbl = gap == null ? 'no data' : (gap >= 0 ? '+' : '') + gap.toFixed(1) + ' hrs ' + (gap < 0 ? 'short' : 'over');
          row.push(div({ key: hEnd + '-' + dow, title: DOW_LBL[dispDow] + ' ' + slotStartLabel(slot) + ' · ' + lbl,
            style: { position: 'relative', aspectRatio: '1.35/1', borderRadius: 3, background: colorFor(gap) } }));
        }
        return row;
      })),
    div({ style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 10, color: 'var(--text3)' } },
      span(null, 'Understaffed'),
      div({ style: { display: 'flex', height: 8, borderRadius: 3, overflow: 'hidden', width: 130 } },
        [{ v: '--crit', pct: 100 }, { v: '--crit', pct: 50 }, { v: null, pct: 0 }, { v: '--blue', pct: 50 }, { v: '--blue', pct: 100 }]
          .map((seg, i) => div({ key: i, style: { flex: 1, background: seg.v ? mixBg(seg.v, seg.pct) : 'var(--surf3)' } }))),
      span(null, 'Overstaffed'),
      heat.nDays != null && span({ style: { marginLeft: 'auto' } }, heat.nDays + ' complete days sampled')));
}
