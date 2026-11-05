// @ts-nocheck
// ── Pay Rate History report (owner request 2026-10-15) ────────────────────────────────────────
// "Can we do a report for pay rates to show history of each employee's wages and rates of pay.
// I would envision being able to pull a report and see when a pay rate changes and be able to
// have analysis on its expected impact to overall labor in the restaurant."
//
// Owner/Admin/DO only (RLS-enforced on the underlying tables -- see schema-lifelenz-shift-pay.sql
// / schema-employee-pay-rate-changes.sql; the payroll.view permission below is the UI-layer
// mirror of that, not the real boundary). Two populations merged into one list:
//   - Crew: derived on demand from lifelenz_shift_pay (role-gated) joined to
//     lifelenz_shift_assignments, via engine/employee-pay-history.js's weeklyCrewRates/
//     detectRateSteps -- no logged change event exists for crew, so this report IS the detector.
//   - Management (GM/AM/DM/SM): ds.employeePayRateChanges, already a logged change event
//     (written by the pull script's own diff) -- managementRateChanges() just reshapes it.
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { STORE_NAMES, sNameC, INV_ORG_COORDS, unpadLoc } from '../constants.js';
import { loadLifeLenzShiftPay, loadLifeLenzShiftAssignments, logAppAccess } from '../lib/supabase.js';
import {
  weeklyCrewRates, detectRateSteps, managementRateChanges, payImpact, ASSUMED_MANAGEMENT_WEEKLY_HOURS,
} from '../engine/employee-pay-history.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);
const th = (p, ...c) => h('th', p, ...c);

const _dstr = d => d.toISOString().slice(0, 10);
function defaultLookbackRange(weeks = 12) {
  const e = new Date();
  const s = new Date(e); s.setDate(s.getDate() - weeks * 7);
  return { s: _dstr(s), e: _dstr(e) };
}

const money = v => v == null ? '—' : (v < 0 ? '-$' + Math.abs(v).toFixed(2) : '$' + v.toFixed(2));
const moneyRound = v => v == null ? '—' : (v < 0 ? '-$' + Math.round(Math.abs(v)).toLocaleString() : '$' + Math.round(v).toLocaleString());
const rate = v => v == null ? '—' : '$' + v.toFixed(2);

export function PayRateHistoryPanel({ ds, stores, onClose }) {
  const { useState, useMemo, useEffect } = React;
  const [range] = useState(defaultLookbackRange);
  const [dataState, setDataState] = useState('loading'); // loading | loaded | error
  const [shiftPay, setShiftPay] = useState([]);
  const [shiftAssignments, setShiftAssignments] = useState([]);
  const [rollupOpen, setRollupOpen] = useState(true);

  // Owner request 2026-10-17 (app_access_log) -- wage data is sensitive; log the view.
  // Best-effort, fires once on mount, never blocks the panel.
  useEffect(() => { logAppAccess('panel_view', 'pay-rate-history').catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pay, assignments] = await Promise.all([
        loadLifeLenzShiftPay({}),
        loadLifeLenzShiftAssignments({ start: range.s, end: range.e }),
      ]);
      if (cancelled) return;
      setShiftPay(pay); setShiftAssignments(assignments); setDataState('loaded');
    })().catch(() => { if (!cancelled) setDataState('error'); });
    return () => { cancelled = true; };
  }, [range.s, range.e]);

  // ── Crew: derive change-points from the joined weekly series ──
  const crewChanges = useMemo(() => {
    if (dataState !== 'loaded') return [];
    const weekly = weeklyCrewRates(shiftPay, shiftAssignments);
    const byEmployee = new Map();
    for (const w of weekly) {
      if (!byEmployee.has(w.employmentId)) byEmployee.set(w.employmentId, []);
      byEmployee.get(w.employmentId).push(w);
    }
    const out = [];
    for (const [employmentId, series] of byEmployee) {
      const steps = detectRateSteps(series);
      const last = series[series.length - 1];
      for (const step of steps) {
        const impact = payImpact(step.delta, step.hoursAtNewRate); // this person's OWN measured hours that week
        // Owner-caught 2026-11-05: a step isn't fully OT-clean unless BOTH ends of it are a real
        // straight-time rate -- a blended end (pre-migration data, or a 100%-OT week on either
        // side) means this delta could still be partly an OT-mix swing, not a real rate change.
        const rateBasis = (step.fromRateBasis === 'straight-time' && step.toRateBasis === 'straight-time')
          ? 'straight-time' : 'blended — verify';
        out.push({
          source: 'crew', personKey: employmentId, loc: last?.loc, name: last?.name || `Employee #${employmentId}`,
          jobTitle: null, effectiveDate: step.weekStart, fromRate: step.fromRate, toRate: step.toRate, delta: step.delta,
          weeklyImpact: impact.weeklyDollarImpact, annualizedImpact: impact.annualizedDollarImpact, hoursBasis: 'measured',
          rateBasis,
        });
      }
    }
    return out;
  }, [dataState, shiftPay, shiftAssignments]);

  // ── Management: already-logged changes, reshaped ──
  const managementChanges = useMemo(() => {
    return managementRateChanges(ds?.employeePayRateChanges || []).map(c => {
      const impact = payImpact(c.delta, ASSUMED_MANAGEMENT_WEEKLY_HOURS); // no measured hours source for management -- see engine's own comment
      return {
        source: 'management', personKey: c.personKey, loc: c.loc, name: c.name || `Employee #${c.personKey}`,
        jobTitle: c.jobTitle, effectiveDate: c.effectiveDate, fromRate: c.fromRate, toRate: c.toRate, delta: c.delta,
        weeklyImpact: impact.weeklyDollarImpact, annualizedImpact: impact.annualizedDollarImpact, hoursBasis: 'assumed',
        // A logged posted rate (employee_pay_rate_changes), never earnings-derived -- not
        // subject to the crew-side OT-blending bug at all.
        rateBasis: 'straight-time',
      };
    });
  }, [ds?.employeePayRateChanges]);

  const allChanges = useMemo(() =>
    [...managementChanges, ...crewChanges].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)),
    [managementChanges, crewChanges]);

  const totalAnnualizedImpact = allChanges.reduce((s, c) => s + (c.annualizedImpact || 0), 0);

  // ── Store + district rollup (owner request 2026-11-05 — "will be interesting to see if we
  // start picking these up" while he and his wife enter a round of OK-only raises store by
  // store). allChanges is already everything detected in the window; this just regroups it by
  // loc/state instead of adding new detection or math. stateOf falls back to 'OK' so a loc
  // missing from INV_ORG_COORDS doesn't silently disappear from the rollup.
  const stateOf = loc => (INV_ORG_COORDS[unpadLoc(loc)] || {}).state || 'OK';
  const storeRollup = useMemo(() => {
    const byLoc = new Map();
    for (const c of allChanges) {
      if (!c.loc) continue;
      let r = byLoc.get(c.loc);
      if (!r) { r = { loc: c.loc, state: stateOf(c.loc), employees: new Set(), weeklyImpact: 0, annualizedImpact: 0, latestEffective: c.effectiveDate }; byLoc.set(c.loc, r); }
      r.employees.add(c.personKey);
      r.weeklyImpact += (c.weeklyImpact || 0);
      r.annualizedImpact += (c.annualizedImpact || 0);
      if (c.effectiveDate > r.latestEffective) r.latestEffective = c.effectiveDate;
    }
    return [...byLoc.values()].sort((a, b) => b.latestEffective.localeCompare(a.latestEffective) || sNameC(a.loc).localeCompare(sNameC(b.loc)));
  }, [allChanges]);

  const okTotalStores = (stores || []).filter(s => /^\d+$/.test(s.loc) && stateOf(s.loc) === 'OK').length;
  const okReportingStores = storeRollup.filter(r => r.state === 'OK').length;
  const districtTotals = useMemo(() => {
    const out = { OK: { weeklyImpact: 0, annualizedImpact: 0, employees: 0 }, FL: { weeklyImpact: 0, annualizedImpact: 0, employees: 0 } };
    for (const r of storeRollup) {
      const bucket = out[r.state] || (out[r.state] = { weeklyImpact: 0, annualizedImpact: 0, employees: 0 });
      bucket.weeklyImpact += r.weeklyImpact; bucket.annualizedImpact += r.annualizedImpact; bucket.employees += r.employees.size;
    }
    return out;
  }, [storeRollup]);

  return h(ModalShell, {
    title: 'Pay Rate History', icon: '💰', maxWidth: 1000, onClose,
    subtitle: `Every detected pay-rate change, crew (trailing ${Math.round((new Date(range.e) - new Date(range.s)) / 604800000)} weeks) + management (full history on file) — Owner/Admin/DO only.`,
  },
    div({ style: { padding: '14px 18px' } },
      dataState === 'loading' && div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '12px' } }, 'Loading…'),
      dataState === 'error' && div({ style: { textAlign: 'center', color: 'var(--crit)', padding: 30, fontSize: '12px' } }, 'Could not load pay-rate data.'),
      dataState === 'loaded' && div(null,
        div({ style: { display: 'flex', gap: 16, marginBottom: 14, fontSize: '10px', color: 'var(--text3)' } },
          span(null, allChanges.length + ' change' + (allChanges.length === 1 ? '' : 's') + ' detected'),
          span(null, managementChanges.length + ' management · ' + crewChanges.length + ' crew'),
          span({ style: { marginLeft: 'auto', fontWeight: 700, color: totalAnnualizedImpact > 0 ? '#f59e0b' : totalAnnualizedImpact < 0 ? '#10b981' : 'var(--text3)' } },
            'Net annualized impact: ' + moneyRound(totalAnnualizedImpact)),
        ),
        okTotalStores > 0 && div({ style: { marginBottom: 14, border: '.5px solid var(--bdr)', borderRadius: 6, padding: '10px 12px', background: 'var(--surf2)' } },
          div({ style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }, onClick: () => setRollupOpen(v => !v) },
            span({ style: { fontSize: '11px', fontWeight: 700, color: 'var(--text)' } }, (rollupOpen ? '▾' : '▸') + ' 📍 Store / district rollup'),
            span({ style: { fontSize: '9.5px', color: 'var(--text3)' } },
              okReportingStores + ' / ' + okTotalStores + ' OK stores reporting a detected change'),
            div({ style: { flex: 1, height: 5, borderRadius: 3, background: 'var(--surf3)', overflow: 'hidden', minWidth: 60 } },
              div({ style: { height: '100%', width: Math.round(100 * okReportingStores / okTotalStores) + '%', background: '#f5bc00' } })),
            span({ style: { marginLeft: 'auto', fontSize: '9.5px', color: 'var(--text3)' } },
              'OK: ' + moneyRound(districtTotals.OK.annualizedImpact) + ' ann. · FL: ' + moneyRound(districtTotals.FL.annualizedImpact) + ' ann.'),
          ),
          rollupOpen && (storeRollup.length
            ? div({ style: { marginTop: 10, overflowX: 'auto' } },
              h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 560 } },
                h('thead', null, h('tr', null,
                  ...['Store', 'State', 'Employees', 'Weekly $', 'Annualized $', 'Latest effective'].map((l, i) =>
                    th({ key: i, style: { textAlign: i > 1 ? 'right' : 'left', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)' } }, l)))),
                h('tbody', null,
                  ...storeRollup.map((r, i) => tr({ key: r.loc, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf)' : 'transparent' } },
                    td({ style: { padding: '4px 8px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, sNameC(r.loc) || r.loc),
                    td({ style: { padding: '4px 8px', color: 'var(--text3)' } }, r.state),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, r.employees.size),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, moneyRound(r.weeklyImpact)),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' } }, moneyRound(r.annualizedImpact)),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, r.latestEffective),
                  )),
                  tr({ style: { borderTop: '1px solid var(--bdr)' } },
                    td({ style: { padding: '4px 8px', fontWeight: 700, color: 'var(--text)' } }, 'OK district'),
                    td({ style: { padding: '4px 8px' } }, ''),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 } }, districtTotals.OK.employees),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 } }, moneyRound(districtTotals.OK.weeklyImpact)),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' } }, moneyRound(districtTotals.OK.annualizedImpact)),
                    td(null, ''),
                  ),
                  districtTotals.FL.employees > 0 && tr(null,
                    td({ style: { padding: '4px 8px', fontWeight: 700, color: 'var(--text)' } }, 'FL district'),
                    td({ style: { padding: '4px 8px' } }, ''),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 } }, districtTotals.FL.employees),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 } }, moneyRound(districtTotals.FL.weeklyImpact)),
                    td({ style: { padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' } }, moneyRound(districtTotals.FL.annualizedImpact)),
                    td(null, ''),
                  ),
                ),
              ),
            )
            : div({ style: { marginTop: 8, fontSize: '9.5px', color: 'var(--text3)' } }, 'No stores have a detected change yet in this window.')
          ),
        ),
        !allChanges.length
          ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No pay-rate changes detected in this window.')
          : div({ style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 820 } },
              h('thead', null, h('tr', null,
                ...['Store', 'Employee', 'Role', 'Effective', 'Rate', 'Δ', 'Weekly $', 'Annualized $', 'Hours basis', 'Rate basis'].map((l, i) =>
                  th({ key: i, style: { textAlign: i > 2 ? 'right' : 'left', fontSize: '8px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px', borderBottom: '.5px solid var(--bdr)' } }, l)))),
              h('tbody', null, ...allChanges.map((c, i) => tr({ key: c.source + c.personKey + c.effectiveDate, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
                td({ style: { padding: '5px 8px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, sNameC(c.loc) || c.loc || '—'),
                td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' } }, c.name),
                td({ style: { padding: '5px 8px', color: 'var(--text3)', fontSize: '8.5px' } }, c.jobTitle || (c.source === 'crew' ? 'Crew' : '—')),
                td({ style: { padding: '5px 8px', textAlign: 'right', color: 'var(--text2)', fontFamily: 'var(--mono)' } }, c.effectiveDate),
                td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, rate(c.fromRate) + ' → ' + rate(c.toRate)),
                td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: c.delta > 0 ? '#f59e0b' : c.delta < 0 ? '#10b981' : 'var(--text2)' } }, (c.delta > 0 ? '+' : '') + money(c.delta)),
                td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, money(c.weeklyImpact)),
                td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' } }, moneyRound(c.annualizedImpact)),
                td({ style: { padding: '5px 8px', textAlign: 'right', fontSize: '8px', color: 'var(--text3)' } }, c.hoursBasis === 'measured' ? 'measured' : 'assumed 40h/wk'),
                td({ style: { padding: '5px 8px', textAlign: 'right', fontSize: '8px', color: c.rateBasis === 'straight-time' ? 'var(--text3)' : '#f59e0b', fontWeight: c.rateBasis === 'straight-time' ? 400 : 700 }, title: c.rateBasis === 'straight-time' ? 'Base rate only — overtime (paid at 1.5x) excluded from this comparison.' : 'May include an overtime-mix swing, not a clean before/after base-rate comparison — confirm against a pay stub before acting on this row.' }, c.rateBasis === 'straight-time' ? 'straight-time' : '⚠ blended'),
              ))),
            ),
          ),
        div({ style: { marginTop: 12, fontSize: '8.5px', color: 'var(--text3)', lineHeight: 1.6 } },
          '⚠ Management impact assumes a standard ' + ASSUMED_MANAGEMENT_WEEKLY_HOURS + '-hr week (no measured hours source exists for that population) — flagged, not measured. Crew impact uses that employee\'s own real hours the week the new rate took effect. ',
          'Crew rates now exclude overtime pay (paid at 1.5x) from the comparison wherever LifeLenz tags a shift segment ',
          '‘overtime’ — a "⚠ blended" Rate basis means that data isn\'t available for this row yet (older data, or the one-time schema update is still pending) and the rate may include an OT-mix swing rather than a clean base-rate change.'),
      ),
    ),
  );
}
