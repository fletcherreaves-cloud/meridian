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
import { STORE_NAMES, sNameC } from '../constants.js';
import { loadLifeLenzShiftPay, loadLifeLenzShiftAssignments } from '../lib/supabase.js';
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
        out.push({
          source: 'crew', personKey: employmentId, loc: last?.loc, name: last?.name || `Employee #${employmentId}`,
          jobTitle: null, effectiveDate: step.weekStart, fromRate: step.fromRate, toRate: step.toRate, delta: step.delta,
          weeklyImpact: impact.weeklyDollarImpact, annualizedImpact: impact.annualizedDollarImpact, hoursBasis: 'measured',
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
      };
    });
  }, [ds?.employeePayRateChanges]);

  const allChanges = useMemo(() =>
    [...managementChanges, ...crewChanges].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)),
    [managementChanges, crewChanges]);

  const totalAnnualizedImpact = allChanges.reduce((s, c) => s + (c.annualizedImpact || 0), 0);

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
        !allChanges.length
          ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No pay-rate changes detected in this window.')
          : div({ style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 820 } },
              h('thead', null, h('tr', null,
                ...['Store', 'Employee', 'Role', 'Effective', 'Rate', 'Δ', 'Weekly $', 'Annualized $', 'Hours basis'].map((l, i) =>
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
              ))),
            ),
          ),
        div({ style: { marginTop: 12, fontSize: '8.5px', color: 'var(--text3)', lineHeight: 1.6 } },
          '⚠ Management impact assumes a standard ' + ASSUMED_MANAGEMENT_WEEKLY_HOURS + '-hr week (no measured hours source exists for that population) — flagged, not measured. Crew impact uses that employee\'s own real hours the week the new rate took effect.'),
      ),
    ),
  );
}
