// @ts-nocheck
// New Store Launch Planner (memory/project-new-store-launch-planner.md, owner-approved
// 2026-11-06 -- "Build it now"). A reusable day-by-day sales plan for a newly opening or
// relocating store, seeded from src/engine/new-store-ramp.js's real comparable-store ramp
// blending and editable in-app. First used for Lindsay (44689, opening 2026-11-14), but every
// input (store, comparables + weights, mature run-rate assumption, open date) is a caller-set
// parameter -- nothing here is Lindsay-specific. The owner's own stated goal: "model future new
// locations... kickstart forecasting."
//
// Store picker is a plain <select>, not LocationSelector -- this is a single-store, occasional-
// use planning tool (one in-flight launch at a time), not a scope filter over many stores'
// data, same exception class memory/panel-contract.md already carries for StoreKBEditor's own
// non-LocationSelector picker.
import * as React from 'react';
import { STORE_NAMES, DEFAULT_TARGETS } from '../constants.js';
import { loadDailySalesForStore, loadHourlySalesForStore, loadQuarterHourSalesForStore, loadLaunchPlan, saveLaunchPlanRow } from '../lib/supabase.js';
import { projectLaunchPlan, blendHourlyShapes, splitDayAcrossHours, blendQuarterHourShapes, splitDayAcrossQuarterHours, DEEP_OVERNIGHT_QTR_SLOTS } from '../engine/new-store-ramp.js';
import { RoutePanelShell } from '../components/ModalShell.js';
import { InfoIcon } from '../engine/forecast.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const inp = (p) => h('input', p);

// A convenience starting point for the first real use (Lindsay) -- not a hardcoded truth; every
// field is editable in the UI and this seed is irrelevant once the owner has typed their own
// values for a different store/opening.
const SEED_DEFAULTS = {
  '44689': {
    openDate: '2026-11-14',
    grandOpeningDate: '2026-11-17',
    matureWeeklySales: 46925,
    comparables: [{ loc: '43380', weight: 0.7 }, { loc: '43701', weight: 0.3 }],
    // Owner-stated 2026-11-06: Lindsay opens as a 24-HOUR operation for its first year -- a
    // deliberate owner operating decision, NOT something the Tishomingo/Ponce de Leon ramp-shape
    // comparables predict (their own overnight patterns, if closed, don't apply here). Does not
    // change the day-level $ math (projected_sales stays daypart-agnostic) -- this is context for
    // whoever builds the LifeLenz schedule off these numbers, so Late Night isn't assumed minimal.
    opsNote: '24-hour operation for year one (owner decision) — do not assume minimal Late Night staffing from the comparables.',
  },
};
const HISTORY_START = '2015-01-01'; // wide enough to capture any comparable's real first trading day

function dowOf(dateStr) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dateStr + 'T12:00:00Z').getUTCDay()];
}
const fmtMoney = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));

// hour_slot is the END of the hour block ('06:00' = the 5am-6am block), running '05:00'->'28:00'
// across the 4am business day -- same convention CLAUDE.md/metric-source.js document elsewhere.
// Values above 24 wrap into the next calendar day (24:00 = 11pm-midnight, 28:00 = 3am-4am).
function fmtHour12(hh) {
  const h24 = ((hh % 24) + 24) % 24;
  const ampm = h24 < 12 ? 'am' : 'pm';
  let h12 = h24 % 12; if (h12 === 0) h12 = 12;
  return h12 + ampm;
}
function hourRangeLabel(hourSlot) {
  const end = parseInt(String(hourSlot).slice(0, 2), 10);
  return fmtHour12(end - 1) + '–' + fmtHour12(end);
}
const DEEP_OVERNIGHT = new Set(['05:00', '24:00', '25:00', '26:00', '27:00', '28:00']);
const DEEP_OVERNIGHT_QTR = new Set(DEEP_OVERNIGHT_QTR_SLOTS);

// qtr_slot is the same closing-edge/4am-business-day convention as hour_slot above, just at
// 15-minute resolution ('04:15'..'28:00', 96 real slots -- see
// memory/finding-record-hour-quarter-hour-pull.md). Label shows both edges since a bare "4:15am"
// reads ambiguously at this grain, unlike the hour-level label.
function fmtClock12(totalMin) {
  const norm = ((totalMin % 1440) + 1440) % 1440;
  const hh = Math.floor(norm / 60), mm = norm % 60;
  const ampm = hh < 12 ? 'am' : 'pm';
  let h12 = hh % 12; if (h12 === 0) h12 = 12;
  return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '') + ampm;
}
function qtrRangeLabel(qtrSlot) {
  const [hh, mm] = String(qtrSlot).split(':').map(Number);
  const end = hh * 60 + mm;
  return fmtClock12(end - 15) + '–' + fmtClock12(end);
}

export function NewStoreLaunchPlanner({ onClose }) {
  const storeOptions = React.useMemo(
    () => Object.entries(STORE_NAMES || {}).sort((a, b) => a[1].localeCompare(b[1])),
    [],
  );
  const [selLoc, setSelLoc] = React.useState('44689');
  const seed = SEED_DEFAULTS[selLoc] || {};
  const [openDate, setOpenDate] = React.useState(seed.openDate || '');
  const [grandOpeningDate, setGrandOpeningDate] = React.useState(seed.grandOpeningDate || '');
  const [matureWeeklySales, setMatureWeeklySales] = React.useState(seed.matureWeeklySales ?? '');
  const [comparables, setComparables] = React.useState(seed.comparables || [{ loc: '', weight: 1 }]);
  const [opsNote, setOpsNote] = React.useState(seed.opsNote || '');
  const [maxDays, setMaxDays] = React.useState(60);
  const [rows, setRows] = React.useState([]); // {planDate,dayN,projectedSales,overrideSales,note,source}
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [expandedDate, setExpandedDate] = React.useState(null);
  const [hourlyBlend, setHourlyBlend] = React.useState(null);
  const [hourlyLoading, setHourlyLoading] = React.useState(false);
  const [hourlyErr, setHourlyErr] = React.useState(null);
  const hourlyBlendCache = React.useRef({ key: null, blend: null });
  const [expandedQtrDate, setExpandedQtrDate] = React.useState(null);
  const [qtrBlend, setQtrBlend] = React.useState(null);
  const [qtrLoading, setQtrLoading] = React.useState(false);
  const [qtrErr, setQtrErr] = React.useState(null);
  const qtrBlendCache = React.useRef({ key: null, blend: null });

  // Re-seed the form when the store changes (but only on the ACTUAL change, never clobbering an
  // in-progress edit on the same store).
  React.useEffect(() => {
    const s = SEED_DEFAULTS[selLoc] || {};
    setOpenDate(s.openDate || '');
    setGrandOpeningDate(s.grandOpeningDate || '');
    setMatureWeeklySales(s.matureWeeklySales ?? '');
    setComparables(s.comparables || [{ loc: '', weight: 1 }]);
    setOpsNote(s.opsNote || '');
    setExpandedDate(null);
    setHourlyBlend(null);
    hourlyBlendCache.current = { key: null, blend: null };
    setExpandedQtrDate(null);
    setQtrBlend(null);
    qtrBlendCache.current = { key: null, blend: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selLoc]);

  const reload = React.useCallback(() => {
    let live = true;
    loadLaunchPlan(selLoc).then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, [selLoc]);
  React.useEffect(() => reload(), [reload]);

  async function regenerate() {
    setErr(null);
    const mws = Number(matureWeeklySales);
    if (!openDate || !mws || mws <= 0) { setErr('Set an open date and a mature weekly sales assumption first.'); return; }
    const realComparables = comparables.filter((c) => c.loc && c.weight > 0);
    if (!realComparables.length) { setErr('Add at least one comparable store with a weight > 0.'); return; }
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const withRows = await Promise.all(
        realComparables.map(async (c) => ({ ...c, laborRows: await loadDailySalesForStore(c.loc, HISTORY_START, today) })),
      );
      const plan = projectLaunchPlan({ loc: selLoc, comparables: withRows, matureWeeklySales: mws, openDate, maxDays });
      const existingByDate = new Map(rows.map((r) => [r.planDate, r]));
      for (const p of plan) {
        const existing = existingByDate.get(p.planDate);
        if (existing && existing.source === 'manual') continue; // never touch an owner override
        const note = (grandOpeningDate && p.planDate === grandOpeningDate)
          ? (existing?.note || 'Grand Opening')
          : (existing?.note ?? null);
        await saveLaunchPlanRow(selLoc, p.planDate, {
          dayN: p.dayN, projectedSales: p.projectedSales, overrideSales: existing?.overrideSales ?? null,
          note, source: 'ramp',
        });
      }
      reload();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Lazily load + blend the comparables' real hourly shape, cached by the comparables' own
  // signature so switching which DAY is expanded never re-fetches -- only an actual edit to the
  // comparable list/weights invalidates it.
  async function ensureHourlyBlend() {
    const key = JSON.stringify(comparables);
    if (hourlyBlendCache.current.key === key) {
      setHourlyBlend(hourlyBlendCache.current.blend);
      return hourlyBlendCache.current.blend;
    }
    const realComparables = comparables.filter((c) => c.loc && c.weight > 0);
    if (!realComparables.length) { setHourlyErr('Add at least one comparable store with a weight > 0.'); return null; }
    setHourlyLoading(true);
    setHourlyErr(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const withRows = await Promise.all(
        realComparables.map(async (c) => ({ ...c, hourlyRows: await loadHourlySalesForStore(c.loc, HISTORY_START, today) })),
      );
      const blend = blendHourlyShapes(withRows);
      hourlyBlendCache.current = { key, blend };
      setHourlyBlend(blend);
      return blend;
    } catch (e) {
      setHourlyErr(String(e?.message || e));
      return null;
    } finally {
      setHourlyLoading(false);
    }
  }
  async function toggleExpand(row) {
    if (expandedDate === row.planDate) { setExpandedDate(null); return; }
    setExpandedDate(row.planDate);
    if (!hourlyBlend) await ensureHourlyBlend();
  }

  // Finer sibling of ensureHourlyBlend/toggleExpand, same caching and comparable-weighting logic,
  // against the REAL 15-minute sales table (qsr_sales_quarter_hour) instead of qsr_daily_activity's
  // hourly buckets -- see new-store-ramp.js's quarterHourShapeFor header for why this table (built
  // for the separate "Record Hour" feature) was missed by the original 2026-11-06 hourly build.
  async function ensureQtrBlend() {
    const key = JSON.stringify(comparables);
    if (qtrBlendCache.current.key === key) {
      setQtrBlend(qtrBlendCache.current.blend);
      return qtrBlendCache.current.blend;
    }
    const realComparables = comparables.filter((c) => c.loc && c.weight > 0);
    if (!realComparables.length) { setQtrErr('Add at least one comparable store with a weight > 0.'); return null; }
    setQtrLoading(true);
    setQtrErr(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const withRows = await Promise.all(
        realComparables.map(async (c) => ({ ...c, qtrHourRows: await loadQuarterHourSalesForStore(c.loc, HISTORY_START, today) })),
      );
      const blend = blendQuarterHourShapes(withRows);
      qtrBlendCache.current = { key, blend };
      setQtrBlend(blend);
      return blend;
    } catch (e) {
      setQtrErr(String(e?.message || e));
      return null;
    } finally {
      setQtrLoading(false);
    }
  }
  async function toggleExpandQtr(row) {
    if (expandedQtrDate === row.planDate) { setExpandedQtrDate(null); return; }
    setExpandedQtrDate(row.planDate);
    if (!qtrBlend) await ensureQtrBlend();
  }

  function setOverride(row, value) {
    const overrideSales = value === '' ? null : Number(value);
    const source = overrideSales != null ? 'manual' : 'ramp';
    setRows((rs) => rs.map((r) => (r.planDate === row.planDate ? { ...r, overrideSales, source } : r)));
    saveLaunchPlanRow(selLoc, row.planDate, {
      dayN: row.dayN, projectedSales: row.projectedSales, overrideSales, note: row.note, source,
    });
  }
  function setNote(row, value) {
    setRows((rs) => rs.map((r) => (r.planDate === row.planDate ? { ...r, note: value || null } : r)));
    saveLaunchPlanRow(selLoc, row.planDate, {
      dayN: row.dayN, projectedSales: row.projectedSales, overrideSales: row.overrideSales, note: value || null, source: row.source,
    });
  }

  const tTpph = DEFAULT_TARGETS[selLoc]?.tTpph;
  const tAvgCheck = DEFAULT_TARGETS[selLoc]?.tAvgCheck;

  return h(RoutePanelShell, { icon: '🚀', title: 'New Store Launch Planner', subtitle: h(InfoIcon, { articleKey: 'launch_planner_guide' }), onBack: onClose },
    div({ style: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 } },
      div(null,
        span({ style: { fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 2 } }, 'Store'),
        h('select', { value: selLoc, onChange: (e) => setSelLoc(e.target.value), className: 'inp' },
          storeOptions.map(([loc, name]) => h('option', { key: loc, value: loc }, name + ' (' + loc + ')')))),
      div(null,
        span({ style: { fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 2 } }, 'Open Date'),
        inp({ type: 'date', value: openDate, onChange: (e) => setOpenDate(e.target.value), className: 'inp' })),
      div(null,
        span({ style: { fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 2 } }, 'Grand Opening Date'),
        inp({ type: 'date', value: grandOpeningDate, onChange: (e) => setGrandOpeningDate(e.target.value), className: 'inp' })),
      div(null,
        span({ style: { fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 2 } }, 'Mature Weekly Sales $'),
        inp({ type: 'number', value: matureWeeklySales, onChange: (e) => setMatureWeeklySales(e.target.value), className: 'inp', style: { width: 120 } }))),
    div({ style: { marginBottom: 12 } },
      span({ style: { fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 4 } }, 'Comparable stores (loc + weight)'),
      div({ style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
        comparables.map((c, i) => div({ key: i, style: { display: 'flex', gap: 4, alignItems: 'center' } },
          inp({ placeholder: 'loc', value: c.loc, style: { width: 70 }, className: 'inp',
            onChange: (e) => setComparables((cs) => cs.map((x, j) => (j === i ? { ...x, loc: e.target.value } : x))) }),
          inp({ type: 'number', step: '0.1', placeholder: 'weight', value: c.weight, style: { width: 70 }, className: 'inp',
            onChange: (e) => setComparables((cs) => cs.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x))) }),
          btn({ className: 'btn btn-sm', onClick: () => setComparables((cs) => cs.filter((_, j) => j !== i)) }, '✕'))),
        btn({ className: 'btn btn-sm', onClick: () => setComparables((cs) => [...cs, { loc: '', weight: 1 }]) }, '+ comparable'))),
    div({ style: { marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 } },
      btn({ className: 'btn btn-sm', onClick: regenerate, disabled: loading }, loading ? 'Projecting…' : '↻ Regenerate from ramp model'),
      err && span({ style: { fontSize: 11, color: 'var(--crit)' } }, err)),
    div({ style: { fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 } },
      'Real comparable openings often run ABOVE their own mature run-rate for the first several weeks (grand-opening traffic), not below — check the Projected $ column for a bump before assuming a slow ramp.'),
    opsNote && div({ style: { fontSize: 11, fontWeight: 700, color: '#f5bc00', marginBottom: 12, padding: '6px 10px', border: '.5px solid rgba(245,188,0,.4)', borderRadius: 4, background: 'rgba(245,188,0,.08)' } },
      '⚠ ' + opsNote),
    rows.length === 0
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30 } }, 'No plan yet for this store. Set the inputs above and click "Regenerate from ramp model."')
      : div({ style: { overflowX: 'auto' } },
        h('table', { style: { width: 'max-content', minWidth: '100%', fontSize: 12, borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null,
            ['Day', 'Date', 'Projected $', 'Override $', 'Effective $', 'Suggested Hrs', 'Note', 'Hourly', '15-min'].map((t) =>
              h('th', { key: t, style: { textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid var(--bdr)', color: 'var(--text3)', fontWeight: 600 } }, t)))),
          h('tbody', null, rows.flatMap((r) => {
            const effective = r.overrideSales ?? r.projectedSales;
            // hours = transactions / TPPH, and transactions = $ / avg check -- tTpph is a
            // transactions-per-hour ratio, never a dollars-per-hour one, so dividing $ by it
            // directly (the bug this replaced) skips the avg-check conversion and overstates
            // hours by roughly that factor.
            const hrs = (tTpph && tAvgCheck) ? (effective / tAvgCheck) / tTpph : null;
            const isGrand = grandOpeningDate && r.planDate === grandOpeningDate;
            const isExpanded = expandedDate === r.planDate;
            const isQtrExpanded = expandedQtrDate === r.planDate;
            const mainRow = h('tr', { key: r.planDate, style: isGrand ? { background: 'rgba(245,188,0,.08)' } : null },
              h('td', { style: { padding: '4px 10px' } }, r.dayN),
              h('td', { style: { padding: '4px 10px' } }, r.planDate + ' (' + dowOf(r.planDate) + ')'),
              h('td', { style: { padding: '4px 10px' } }, fmtMoney(r.projectedSales)),
              h('td', { style: { padding: '4px 10px' } },
                inp({ type: 'number', value: r.overrideSales ?? '', placeholder: '—', style: { width: 90 }, className: 'inp',
                  onChange: (e) => setOverride(r, e.target.value) })),
              h('td', { style: { padding: '4px 10px', fontWeight: 700 } }, fmtMoney(effective)),
              h('td', { style: { padding: '4px 10px' } }, hrs != null ? hrs.toFixed(1) : '—'),
              h('td', { style: { padding: '4px 10px' } },
                isGrand && !r.note
                  ? span({ style: { fontSize: 10, fontWeight: 700, color: '#f5bc00' } }, '🎉 Grand Opening')
                  : inp({ value: r.note || '', placeholder: isGrand ? 'Grand Opening' : '', style: { width: 120 }, className: 'inp',
                      onChange: (e) => setNote(r, e.target.value) })),
              h('td', { style: { padding: '4px 10px' } },
                btn({ className: 'btn btn-sm', onClick: () => toggleExpand(r) }, isExpanded ? '▾ Hourly' : '▸ Hourly')),
              h('td', { style: { padding: '4px 10px' } },
                btn({ className: 'btn btn-sm', onClick: () => toggleExpandQtr(r) }, isQtrExpanded ? '▾ 15-min' : '▸ 15-min')));
            const detailRows = [];
            if (isExpanded) {
              const hourly = hourlyBlend ? splitDayAcrossHours(effective, hourlyBlend) : [];
              let detailBody;
              if (hourlyLoading) {
                detailBody = span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Loading hourly shape from comparables…');
              } else if (hourlyErr) {
                detailBody = span({ style: { fontSize: 11, color: 'var(--crit)' } }, hourlyErr);
              } else if (!hourlyBlend) {
                detailBody = span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'No hourly shape available.');
              } else {
                const caveat = hourlyBlend.anyNearlyClosedOvernight
                  ? div({ style: { fontSize: 11, fontWeight: 700, color: '#f5bc00', marginBottom: 8, padding: '6px 10px', border: '.5px solid rgba(245,188,0,.4)', borderRadius: 4, background: 'rgba(245,188,0,.08)' } },
                      '⚠ Comparable store(s) show minimal real overnight volume — Late Night hours below are not a reliable shape for a 24-hour store.')
                  : null;
                const hourTable = h('table', { style: { width: 'max-content', minWidth: '100%', fontSize: 11, borderCollapse: 'collapse' } },
                  h('thead', null, h('tr', null,
                    ['Hour', '$', 'Suggested Hrs'].map((t) =>
                      h('th', { key: t, style: { textAlign: 'left', padding: '2px 10px', color: 'var(--text3)', fontWeight: 600 } }, t)))),
                  h('tbody', null, hourly.map((hp) => {
                    const hHrs = (tTpph && tAvgCheck) ? (hp.sales / tAvgCheck) / tTpph : null;
                    const overnight = DEEP_OVERNIGHT.has(hp.hourSlot);
                    return h('tr', { key: hp.hourSlot, style: overnight ? { color: 'var(--text3)' } : null },
                      h('td', { style: { padding: '2px 10px' } }, hourRangeLabel(hp.hourSlot)),
                      h('td', { style: { padding: '2px 10px' } }, fmtMoney(hp.sales)),
                      h('td', { style: { padding: '2px 10px' } }, hHrs != null ? hHrs.toFixed(1) : '—'));
                  })));
                detailBody = div(null, caveat, hourTable);
              }
              detailRows.push(h('tr', { key: r.planDate + '-hourly' },
                h('td', { colSpan: 9, style: { padding: '8px 10px 16px 24px', background: 'var(--surf2)' } }, detailBody)));
            }
            if (isQtrExpanded) {
              const qtr = qtrBlend ? splitDayAcrossQuarterHours(effective, qtrBlend) : [];
              let qtrDetailBody;
              if (qtrLoading) {
                qtrDetailBody = span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Loading 15-minute shape from comparables…');
              } else if (qtrErr) {
                qtrDetailBody = span({ style: { fontSize: 11, color: 'var(--crit)' } }, qtrErr);
              } else if (!qtrBlend) {
                qtrDetailBody = span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'No 15-minute shape available.');
              } else {
                const caveat = qtrBlend.anyNearlyClosedOvernight
                  ? div({ style: { fontSize: 11, fontWeight: 700, color: '#f5bc00', marginBottom: 8, padding: '6px 10px', border: '.5px solid rgba(245,188,0,.4)', borderRadius: 4, background: 'rgba(245,188,0,.08)' } },
                      '⚠ Comparable store(s) show minimal real overnight volume — Late Night 15-min slots below are not a reliable shape for a 24-hour store.')
                  : null;
                const qtrTable = h('table', { style: { width: 'max-content', minWidth: '100%', fontSize: 11, borderCollapse: 'collapse' } },
                  h('thead', null, h('tr', null,
                    ['15-min', '$', 'Suggested Hrs'].map((t) =>
                      h('th', { key: t, style: { textAlign: 'left', padding: '2px 10px', color: 'var(--text3)', fontWeight: 600 } }, t)))),
                  h('tbody', null, qtr.map((qp) => {
                    const qHrs = (tTpph && tAvgCheck) ? (qp.sales / tAvgCheck) / tTpph : null;
                    const overnight = DEEP_OVERNIGHT_QTR.has(qp.qtrSlot);
                    return h('tr', { key: qp.qtrSlot, style: overnight ? { color: 'var(--text3)' } : null },
                      h('td', { style: { padding: '2px 10px' } }, qtrRangeLabel(qp.qtrSlot)),
                      h('td', { style: { padding: '2px 10px' } }, fmtMoney(qp.sales)),
                      h('td', { style: { padding: '2px 10px' } }, qHrs != null ? qHrs.toFixed(2) : '—'));
                  })));
                qtrDetailBody = div(null, caveat, qtrTable);
              }
              detailRows.push(h('tr', { key: r.planDate + '-qtr' },
                h('td', { colSpan: 9, style: { padding: '8px 10px 16px 24px', background: 'var(--surf2)' } }, qtrDetailBody)));
            }
            return [mainRow, ...detailRows];
          })))));
}
