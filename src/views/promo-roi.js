// @ts-nocheck
// ── Promo / Discount ROI panel ────────────────────────────────────────────────
// "Are our promos and discounts paying for themselves?" Answered with a matched-
// day analysis (engine in ../engine/promo-roi.js): per store, days a REAL national
// promo-calendar tag covers (org_events, exogenous -- set months ahead by
// McDonald's corporate, not derived from that day's sales) are compared against
// untagged days WITHIN the same day-of-week (controls for the weekly pattern), and
// the sales / guest lift is weighed against the give-away. Framed as a directional
// readout — association with controls, not a randomized trial.
//
// dispatch-113.md — this used to split on same-day promo INTENSITY (percentage or
// dollar give-away). Both were measured endogenous (memory/finding-promo-roi-
// denominator-bias-2026-08-23.md): give-away dollars scale with traffic, so the
// split itself sorted busy days into "heavy" regardless of any real effect. The
// discount lever has no equivalent exogenous signal (no calendar tells us when a
// register-level comp will happen) and now honestly reports "cannot determine"
// instead of reusing an endogenous split a third time.
import * as React from 'react';
import { computePromoDiscountRoi } from '../engine/promo-roi.js';
import { STORE_NAMES } from '../constants.js';
import { RoutePanelShell } from '../components/ModalShell.js';

// Dispatch #147 -- ExportDropdown lives in store-dash.js, a 145 KB module this panel would
// otherwise drag into its own chunk on every open. React.lazy defers the actual import() to
// first render of the Export control itself -- established pattern (dispatch #122/#129/#134/
// #136/#143).
const LazyExportDropdown = React.lazy(() =>
  import('./store-dash.js').then(m => ({ default: m.ExportDropdown }))
);

const h = React.createElement;
const f$ = n => (n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString());
const fPct = n => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%');
const sName = loc => STORE_NAMES?.[String(loc)] || ('Store ' + loc);

const VERDICT = {
  pays:    { label: 'Pays',    col: '#10b981', bg: 'rgba(16,185,129,.12)' },
  costs:   { label: 'Costs',   col: '#ef4444', bg: 'rgba(239,68,68,.12)' },
  neutral: { label: 'Neutral', col: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
  'n/a':   { label: 'n/a',     col: '#6b7280', bg: 'rgba(255,255,255,.04)' },
};

function VerdictChip({ v }) {
  const m = VERDICT[v] || VERDICT['n/a'];
  return h('span', { style: { fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 5, color: m.col, background: m.bg } }, m.label);
}

// Reasons LeverSection can't score anything, and the honest copy for each — dispatch-113.md item
// 4: never silently keep displaying "not enough data" when the real reason is "no exogenous
// signal exists at all", which is a different, narrower claim the reader needs to know.
const NO_DATA_COPY = {
  no_exogenous_tag_data: {
    icon: '🗓️',
    text: 'Cannot determine — no verified national promo-calendar tag (org_events) covers the stores/dates currently loaded. This lever only scores days a real, exogenous calendar fact covers, never same-day promo spend (that split was measured biased — see the note below). Tag/confirm promo windows in Calendar Manager, or load a broader date range, to enable this.',
  },
  no_signal_exists: {
    icon: '🚫',
    text: 'Cannot determine — there is no exogenous signal for when this happens. A national promo runs on a corporate calendar set months ahead; a register-level discount is a same-day, reactive decision with no equivalent calendar fact. Any matched-day split here would repeat the exact bias this screen was fixed to remove, so this lever is intentionally left unscored rather than showing a plausible-but-wrong number.',
  },
};

function LeverSection({ title, icon, data, marginRate }) {
  const d = data?.district;
  const rows = data?.byStore || [];
  const th = (t, r) => h('th', { style: { textAlign: r ? 'right' : 'left', padding: '5px 8px', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', position: 'sticky', top: 0, background: 'var(--surf2)' } }, t);
  const td = (c, r, col) => h('td', { style: { textAlign: r ? 'right' : 'left', padding: '5px 8px', fontSize: 11, fontFamily: r ? 'var(--mono)' : 'inherit', color: col || 'var(--text)', whiteSpace: 'nowrap' } }, c);

  const scoredNote = data?.nCandidates > rows.length
    ? `Scored ${rows.length} of ${data.nCandidates} stores with a known calendar window — the rest had too few matched days at this split (see below).`
    : null;

  const noData = NO_DATA_COPY[data?.reason];

  return h('div', { style: { marginBottom: 22 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
      h('span', { style: { fontSize: 15 } }, icon),
      h('div', { style: { fontSize: 13, fontWeight: 800 } }, title),
      d && h(VerdictChip, { v: d.verdict })),

    scoredNote && h('div', { style: { fontSize: 10, color: 'var(--text3)', marginBottom: 8 } }, scoredNote),

    !rows.length && noData && h('div', { style: { padding: 18, border: '1px dashed var(--bdr)', borderRadius: 8, color: 'var(--text2)', fontSize: 12, lineHeight: 1.6 } },
      h('div', { style: { fontSize: 22, marginBottom: 8 } }, noData.icon),
      noData.text),

    !rows.length && !noData && h('div', { style: { padding: 18, border: '1px dashed var(--bdr)', borderRadius: 8, color: 'var(--text3)', fontSize: 12 } },
      'Not enough daily data with a ' + title.toLowerCase() + ' signal yet (needs ~4+ weeks per store within a known calendar window, across both tagged and untagged days).'),

    d && rows.length ? h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 } },
      statCard('District verdict', VERDICT[d.verdict]?.label || '—', VERDICT[d.verdict]?.col),
      statCard('Sales lift / heavy day', f$(d.extraSalesPerDay), d.extraSalesPerDay >= 0 ? '#10b981' : '#ef4444'),
      statCard('Give-away / heavy day', f$(d.extraSpendPerDay), '#f59e0b'),
      statCard('Gross-profit Δ / day', f$(d.grossProfitDelta), d.grossProfitDelta >= 0 ? '#10b981' : '#ef4444'),
    ) : null,

    rows.length ? h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto', overflowX: 'auto' } },
      h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, th('Store'), th('Days', 1), th('Lift %', 1), th('Sales/day', 1), th('Give-away/day', 1), th('GP Δ/day', 1), th('Verdict', 1))),
        h('tbody', null, rows.map(s => h('tr', { key: s.loc, style: { borderTop: '.5px solid var(--bdr)' } },
          td(sName(s.loc)),
          td(s.nDays, 1, 'var(--text3)'),
          td(fPct(s.liftSalesPct), 1, s.liftSalesPct >= 0 ? '#10b981' : '#ef4444'),
          td(f$(s.extraSalesPerDay), 1),
          td(f$(s.extraSpendPerDay), 1, '#f59e0b'),
          td(f$(s.grossProfitDelta), 1, s.grossProfitDelta >= 0 ? '#10b981' : '#ef4444'),
          h('td', { style: { textAlign: 'right', padding: '5px 8px' } }, h(VerdictChip, { v: s.verdict })),
        )))))
    : null,
  );
}

function statCard(label, val, col) {
  return h('div', { style: { flex: '1 1 130px', minWidth: 120, background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '8px 12px' } },
    h('div', { style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 } }, label),
    h('div', { style: { fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: col || 'var(--text)' } }, val));
}

// ── Print / Export (dispatch #147) ───────────────────────────────────────────
// Same local-helper pattern every print/export builder in this codebase repeats (signals.js/
// record-day.js/dt-speedofservice.js/security-panel.js) -- a full, scroll-independent printable
// HTML document opened via window.open, never bare window.print() against this panel's scrolled
// body. Covers both levers' full verdict tables at whatever incremental-margin assumption is
// currently set (marginPct is already baked into `roi` by the time these read it).
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function reportTable(headers, rows) {
  if (!rows.length) return '<p style="color:#9ca3af;font-size:12px;padding:8px 0">No data.</p>';
  return `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr>${headers.map(hd => `<th style="padding:6px 10px;text-align:left;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #e5e7eb;background:#f8fafc">${esc(hd)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr style="background:${i % 2 ? '#fff' : '#fafafa'}">${r.map(c => `<td style="padding:5px 10px;border-bottom:1px solid #f1f5f9;color:#111">${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}
function reportSection(title, bodyHtml) {
  return `<div style="padding:20px 32px;border-top:1px solid #e5e7eb">
    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;margin-bottom:12px">${esc(title)}</div>
    ${bodyHtml}
  </div>`;
}
function reportShell(title, subtitle, bodyHtml) {
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${esc(title)} — Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#111;font-size:13px}
  @media print{
    body{background:white}
    .no-print{display:none!important}
    .page{box-shadow:none!important;margin:0!important;border-radius:0!important;max-width:100%!important}
  }
</style>
</head><body>
<div class="no-print" style="background:#1e293b;padding:12px 24px;display:flex;align-items:center;gap:12px">
  <span style="color:#f59e0b;font-weight:800;font-size:16px">Meridian</span>
  <span style="color:#94a3b8;font-size:13px">${esc(title)}</span>
  <button onclick="window.print()" style="margin-left:auto;background:#f59e0b;border:none;color:#000;padding:7px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨 Print / Save as PDF</button>
  <button onclick="window.close()" style="background:transparent;border:1px solid #475569;color:#94a3b8;padding:7px 14px;border-radius:6px;cursor:pointer">Close</button>
</div>
<div class="page" style="max-width:1000px;margin:24px auto;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.10);overflow:hidden">
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:28px 32px;color:white">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">Meridian</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:-.5px">${esc(title)}</div>
        <div style="margin-top:8px;font-size:12px;color:#94a3b8">${esc(subtitle || '')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#94a3b8">Generated</div>
        <div style="font-size:16px;font-weight:700;color:#f59e0b">${now}</div>
      </div>
    </div>
  </div>
  ${bodyHtml}
  <div style="padding:12px 32px;background:#0f172a;display:flex;justify-content:space-between;align-items:center">
    <span style="color:#f59e0b;font-weight:800;font-size:14px">Meridian</span>
    <span style="color:#475569;font-size:11px">QSR Forecasting &amp; Analytics · Generated ${now} · CONFIDENTIAL</span>
  </div>
</div>
</body></html>`;
}
function openPrintReport(html) {
  const w = window.open('', '_blank', 'width=1050,height=850,scrollbars=yes');
  if (w) { w.document.write(html); w.document.close(); }
  else { alert('Allow pop-ups for this page to open the report. Then try again.'); }
}

const LEVER_COLS = ['Store', 'Days', 'Lift %', 'Sales/day', 'Give-away/day', 'GP Δ/day', 'Verdict'];
function leverExportRows(data) {
  return (data?.byStore || []).map(s => ({
    Store: sName(s.loc), Days: s.nDays, 'Lift %': fPct(s.liftSalesPct), 'Sales/day': f$(s.extraSalesPerDay),
    'Give-away/day': f$(s.extraSpendPerDay), 'GP Δ/day': f$(s.grossProfitDelta), Verdict: (VERDICT[s.verdict] || VERDICT['n/a']).label,
  }));
}
function promoRoiExportSpec(roi, marginPct) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = [
    ...leverExportRows(roi.promo).map(r => ({ Lever: 'Promotions', ...r })),
    ...leverExportRows(roi.discount).map(r => ({ Lever: 'Discounts', ...r })),
  ];
  return { rows, columns: ['Lever', ...LEVER_COLS].map(k => ({ key: k, label: k })),
    title: `Promo / Discount ROI — ${marginPct}% incremental margin`, filename: `promo-discount-roi-${today}` };
}
function leverPrintRows(data) {
  return (data?.byStore || []).map(s => [
    esc(sName(s.loc)), s.nDays, `<b style="color:${s.liftSalesPct >= 0 ? '#10b981' : '#ef4444'}">${fPct(s.liftSalesPct)}</b>`,
    f$(s.extraSalesPerDay), `<span style="color:#b45309">${f$(s.extraSpendPerDay)}</span>`,
    `<b style="color:${s.grossProfitDelta >= 0 ? '#10b981' : '#ef4444'}">${f$(s.grossProfitDelta)}</b>`,
    (() => { const m = VERDICT[s.verdict] || VERDICT['n/a']; return `<span style="font-weight:800;color:${m.col}">${m.label}</span>`; })(),
  ]);
}
function promoRoiPrintHtml(roi, marginPct, covWindow) {
  const leverSummary = (title, data) => {
    const dst = data?.district;
    if (!dst || !(data?.byStore || []).length) return reportSection(title, '<p style="font-size:11px;color:#6b7280;line-height:1.6">' + (NO_DATA_COPY[data?.reason]?.text || 'Not enough data.') + '</p>');
    const m = VERDICT[dst.verdict] || VERDICT['n/a'];
    const heroCard = (label, val, color) => `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px">
      <div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;margin-bottom:5px">${esc(label)}</div>
      <div style="font-size:18px;font-weight:800;color:${color || '#0f172a'}">${esc(val)}</div>
    </div>`;
    const hero = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      ${heroCard('District verdict', m.label, m.col)}
      ${heroCard('Sales lift / heavy day', f$(dst.extraSalesPerDay), dst.extraSalesPerDay >= 0 ? '#10b981' : '#ef4444')}
      ${heroCard('Give-away / heavy day', f$(dst.extraSpendPerDay), '#b45309')}
      ${heroCard('Gross-profit Δ / day', f$(dst.grossProfitDelta), dst.grossProfitDelta >= 0 ? '#10b981' : '#ef4444')}
    </div>`;
    return reportSection(title, hero + reportTable(LEVER_COLS, leverPrintRows(data)));
  };
  return reportShell('Promo / Discount ROI', `${marginPct}% incremental margin${covWindow ? ' · calendar coverage ' + covWindow : ''}`,
    leverSummary('🎉 Promotions', roi.promo) +
    leverSummary('🏷️ Discounts', roi.discount) +
    reportSection('Methodology', '<p style="font-size:11px;color:#6b7280;line-height:1.6">Matched-day design: tagged days (a real national promo-calendar window) are compared against untagged days within the same day-of-week, so the split controls for the weekly pattern. GP Δ/day = sales lift × incremental margin − extra give-away. This is a directional screen (association with controls), not a randomized trial.</p>'));
}

export function PromoRoiPanel({ ds, userEvents, onClose }) {
  const { useState, useMemo } = React;
  const [marginPct, setMarginPct] = useState(35);
  const roi = useMemo(() => computePromoDiscountRoi(ds, userEvents, { marginRate: marginPct / 100 }), [ds, userEvents, marginPct]);
  const cov = roi?.promo?.coverage;
  const covWindow = cov && Object.keys(cov.covStart || {}).length
    ? [...new Set(Object.values(cov.covStart))].sort()[0] + ' → ' + [...new Set(Object.values(cov.covEnd))].sort().slice(-1)[0]
    : null;

  // Dispatch #147 -- print/export, covering both levers' full verdict tables at the currently
  // set incremental-margin assumption. Hidden until there's enough data for either lever.
  const hasExportable = roi && ((roi.promo?.byStore || []).length || (roi.discount?.byStore || []).length);
  const exportSpec = useMemo(() => hasExportable ? promoRoiExportSpec(roi, marginPct) : null, [hasExportable, roi, marginPct]);
  const handlePrintReport = React.useCallback(() => {
    if (hasExportable) openPrintReport(promoRoiPrintHtml(roi, marginPct, covWindow));
  }, [hasExportable, roi, marginPct, covWindow]);

  return h(RoutePanelShell, {
    title: 'Promo / Discount ROI',
    icon: '🎟️',
    subtitle: 'Matched-day lift — real calendar-tagged promo days vs untagged days within each weekday. Directional, not a controlled trial.',
    onBack: onClose,
    headerExtra: h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
      h('span', { style: { fontSize: 9, fontWeight: 700, color: 'var(--text3)' } }, 'Incremental margin'),
      h('input', { type: 'range', min: 10, max: 60, step: 5, value: marginPct, onChange: e => setMarginPct(+e.target.value), style: { width: 90 } }),
      h('span', { style: { fontSize: 11, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--amber)', width: 34 } }, marginPct + '%'),
      // Dispatch #147 -- print/export toolbar, both levers at the current margin setting.
      exportSpec && h('div', { style: { display: 'flex', gap: 6 } },
        h(React.Suspense, {
          fallback: h('button', { className: 'btn btn-sm', style: { opacity: .5 }, disabled: true }, '⬇ Export') },
          h(LazyExportDropdown, { rows: exportSpec.rows, columns: exportSpec.columns, title: exportSpec.title, filename: exportSpec.filename }),
        ),
        h('button', { className: 'btn btn-sm', onClick: handlePrintReport }, '🖨 Print Report'),
      ),
    ),
  },
      // Body
      h('div', { style: { padding: '0 0 14px' } },
        (!roi || roi.nRecords < 20) ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
          h('div', { style: { fontSize: 26, marginBottom: 10 } }, '🎟️'),
          'Not enough daily promo/discount data loaded yet. This reads the auto-synced Daily Glimpse (promo) and Controls (discount) streams — sync or upload a few weeks and it fills in.')
        : h('div', null,
          // dispatch-113.md — replaced the "known-unreliable" banner (percentage/dollar intensity
          // splits, both measured endogenous — memory/finding-promo-roi-denominator-bias-
          // 2026-08-23.md) with the real fix: split on whether a REAL org_events 'promo' tag (the
          // national marketing calendar, set months ahead by McDonald's corporate — verified
          // 2026-08-25 against production to be independent of any store's own sales) covers that
          // date, not on same-day promo spend. Validated against the finding's own "spend scales
          // with traffic" construction: at a true effect of 0%, this split now measures ≈0%
          // (memory/data/promo-roi-bias-sim-exogenous-tag-zero-effect.mjs), vs. +16.5% for the
          // retired dollar split on the identical generator.
          h('div', { style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: 'rgba(96,165,250,.08)', border: '1px solid rgba(96,165,250,.3)', borderRadius: 8 } },
            h('b', null, '📅 Methodology: '), 'Promotions is now matched against a real national promo calendar (org_events), not same-day promo spend — the earlier splits were measured to fabricate a positive lift even with zero true effect (finding: memory/finding-promo-roi-denominator-bias-2026-08-23.md). ',
            covWindow ? h('span', null, 'Currently tagged calendar coverage: ', h('b', null, covWindow), '. Only days inside a store\'s own known calendar window can be scored — days outside it are excluded, never assumed untagged.') : h('span', null, 'No tagged calendar coverage is loaded for the currently-loaded stores — see below.'),
            ' Discounts has no equivalent exogenous signal (register-level comps are a same-day decision, not on a calendar) and is intentionally left unscored rather than repeating the same bias.'),
          h('div', { style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
            'How to read this: on ', h('b', null, 'tagged'), ' days (a real calendar promo window) a store rings ', h('b', null, 'Sales/day'), ' more than its matched ', h('b', null, 'untagged'),
            ' days (same weekday, same known calendar window), while giving away ', h('b', null, 'Give-away/day'), ' more. ',
            h('b', null, 'GP Δ/day'), ' = that sales lift × your incremental margin (', marginPct, '%) − the extra give-away. ',
            h('b', { style: { color: '#10b981' } }, 'Pays'), ' means the lift more than covers the give-away; ',
            h('b', { style: { color: '#ef4444' } }, 'Costs'), ' means it doesn\'t. Stores are sorted worst-ROI first — coach those.'),
          h(LeverSection, { title: 'Promotions', icon: '🎉', data: roi.promo, marginRate: roi.marginRate }),
          h(LeverSection, { title: 'Discounts', icon: '🏷️', data: roi.discount, marginRate: roi.marginRate }),
          h('div', { style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.6, marginTop: 6 } },
            '⚙ Matched-day design controls for weekday; the tagged/untagged split is a verified-exogenous calendar fact, not a function of the sales it measures. Still association with controls, not a randomized trial — treat as a directional screen for where to dig. Incremental margin is a district assumption you set above; per-store product mix varies.'))));
}
