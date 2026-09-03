// @ts-nocheck
// ── Troubleshooting panel (dispatch #196) ─────────────────────────────────────
// The app's real "Help" -- owner: "Help" should mean troubleshooting, not the daily/weekly
// onboarding checklist (that content already existed and is renamed to "Workflow" as a
// separate registry entry, panel-registry.js id 'workflow'). No troubleshooting surface
// existed anywhere in the app before this.
//
// Two modes, per the owner's own explicit ask (memory/decisions-panel-inventory-2026-08-10.md):
//   END USER  -- plain-language fixes for what a GM/supervisor actually hits (stale numbers,
//               a blank panel, "why do two panels disagree").
//   DEVELOPER -- the CLAUDE.md-adjacent stuff: known data-source quirks, where pull-script
//               logs live, common causes of a stale stream, SAGE's own troubleshooting
//               checklist -- fast-path debugging for Fletcher or a future second operator.
//
// SEEDED, not invented from scratch, per the dispatch's own instruction to check for
// scattered troubleshooting content first:
//   - Developer mode's SAGE section reuses sage.js's buildTroubleshootPrompt() steps and its
//     DATA_SOURCES tool->table map verbatim (the same checklist SAGE's own 🐞 Log modal
//     generates automatically) rather than re-deriving a second, competing version.
//   - Developer mode's stream section points at the REAL STREAMS array (stream-freshness.js)
//     and the real sync-failure-watch.yml convention instead of a hand-typed list that would
//     drift the moment a stream is added or renamed.
//   - Both modes' content is grounded in CLAUDE.md's Dev Rules / Top Priorities sections
//     (4am business-day boundary, QSRSoft token design, auto-first/manual-last-resort) --
//     paraphrased for the audience, not duplicated as a copy-paste wall.
//
// Panel contract (CLAUDE.md, "touching a panel for any reason"): ModalShell only, no
// hand-rolled backdrop; a search box for a reference doc this size; print/export via the
// same window.open()+document.write() pattern every other print builder in this codebase
// uses (promo-roi.js/dt-speedofservice.js/security-panel.js) -- never a bare window.print()
// against a scrolled modal body.
import * as React from 'react';
import { ModalShell, Z } from '../components/ModalShell.js';
import { withAlpha } from './patch-heatmap.js';
import { printHtml as printHtmlOverlay } from '../utils/print-html.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// ── Content ───────────────────────────────────────────────────────────────────
const END_USER_SECTIONS = [
  { heading: 'Data looks stale or hasn’t updated', color: '#f59e0b', items: [
    { q: 'A tile says the data is several days old', a: 'Check the Data Freshness tile on Home (⌂) — green means ≤2 days old, amber 3–7, red 7+. Open Data Manager → Coverage tab to see which SPECIFIC stream is behind (each stream has its own colored dot — a district-wide stale badge no longer hides one dead stream behind a fresh sibling). Click the ↻ Sync button next to that stream to pull fresh data right now.' },
    { q: 'I clicked Sync but nothing changed yet', a: 'Give it the full ~10 minutes — Sync dispatches a background pull, it doesn’t update instantly. If the stream is still stale after that, the auto-pull itself is likely down (an expired login token is the most common cause) — log it as a Task so it gets fixed at the source instead of re-clicking Sync.' },
    { q: 'A number is different on my phone than on my laptop', a: 'Meridian is cloud-first — any device that logs in should see the same numbers. Refresh the page first (a stale browser tab can be behind); if the two devices still disagree after a refresh, that’s worth reporting.' },
  ]},
  { heading: 'A panel is blank or missing data', color: '#3b82f6', items: [
    { q: 'A panel shows nothing at all', a: 'Most panels need source data loaded first — see the Workflow guide’s DAILY checklist (“Load fresh data”). If you already loaded data, check the date range at the top of the panel — a range with no completed days for that store reads as blank, not broken.' },
    { q: 'A store I should see isn’t in the list', a: 'Store visibility follows your role: a GM sees only their own store, a Supervisor sees their patch, District/Owner/Admin see everything. If a store is missing that you believe you should have access to, ask an Admin to check your access — this is a permissions setting, not a data problem.' },
    { q: 'I used to see a panel and now I can’t find it', a: 'Panels get renamed, merged, or folded into a hub as the app evolves (Calendar now lives inside Events & Tags; End of Month is now a mode inside Food Cost). Check ⚗ Test Kitchen at the bottom of the sidebar, or Admin → Panel Manager, which lists every panel including hidden ones.' },
  ]},
  { heading: 'A number looks wrong', color: '#ef4444', items: [
    { q: 'This number doesn’t look right to me', a: 'Hover it — most metrics carry a small tooltip explaining the exact window and comparison basis. Open Admin → 🔍 Metric Lineage to see precisely how that number is built and which source report it traces back to.' },
    { q: 'Two panels show different numbers for what looks like the same thing', a: 'A small difference is often real — two panels can weight the same metric differently (one by actual sales, one by forecast) or read from a different source stream. A LARGE disagreement, or two panels that should be identical and aren’t, is worth reporting — include both numbers, both panel names, and the store/date.' },
    { q: 'A rate or percentage jumped in a way that doesn’t make sense', a: 'This often means the two numbers behind the ratio came from different time windows — a common case is a still-in-progress “today” being compared like a full day. Give an in-progress day until end-of-day before treating its rate metrics as final.' },
  ]},
  { heading: 'How do I report a problem', color: '#10b981', items: [
    { q: 'I found a real bug or a stale data source', a: 'If it came up in a SAGE conversation, use the 🐞 Log action on SAGE’s answer — it pre-fills a Task Queue ticket with the conversation and a ready-made troubleshooting prompt. Otherwise open Task Queue directly and describe what’s wrong, which store/date, and which panel — the more specific, the faster it gets fixed.' },
    { q: 'I want a feature that doesn’t exist yet', a: 'Feature Requests is the place — describe the DECISION it would help you make, not just the number you want. That’s what turns a request into something that actually gets built and used.' },
  ]},
];

const DEVELOPER_SECTIONS = [
  { heading: 'Known data-source quirks', color: '#f59e0b', items: [
    { q: 'LifeLenz labor data stopped syncing', a: 'LIFELENZ_TOKEN (GitHub Secret) expires roughly monthly. Refresh: DevTools → Network → any us01-connect.lifelenz.com request → copy the X-Auth-Token header → update the secret. Full runbook: memory/lifelenz-session.md. As of 2026-08 the Playwright fallback is itself unreliable, so a token expiry is a FULL outage, not a soft degrade.' },
    { q: 'QSRSoft pull always falls through to its Playwright fallback', a: 'Expected, not a bug — do not rotate QSRSOFT_TOKEN. It’s a Cognito ID token with a ~1h TTL, so any value stored in a GitHub Secret is expired ~23 of every 24 hours by construction. The real fix already shipped: scripts/lib/qsrsoft-auth.mjs’s getFreshToken() mints a token in-process per run (#312, closed by #82 — do not re-dispatch).' },
    { q: 'A metric that divides one thing by another looks skewed', a: 'The business day runs 4am→4am, not midnight-to-midnight — both legs of any ratio need the same boundary or it silently mixes two different days. Use businessDate()/lastClosedBusinessDay() (src/utils/date.js), never re-derive the cutover inline. DAR (trading) and labor-summary (calendar) are both already confirmed 4am-aligned — the trap is a NEW derived metric, not an existing one.' },
    { q: 'A rate metric (OEPE/R2P/TPPH-style) reads unrealistically fast for “this week”', a: 'Check for an in-progress “today” blended into the average. qsr_daily_activity_rollup always carries the full 24-hour_slot shape with unplayed hours zero-filled, so count(hour_slot)==24 looks complete but isn’t finished. Use metricSumRatio (metric-source.js), which sums the raw numerator/denominator across the range instead of averaging daily rates.' },
  ]},
  { heading: 'Where to look when a stream goes stale', color: '#3b82f6', items: [
    { q: 'Which streams are auto-pulled, and how do I check freshness per stream', a: 'src/engine/stream-freshness.js’s STREAMS array is the checklist — DAR, FOB, Daily Glimpse, Cash Sheet, Sales Ledger, Ops Cash/Labor/Service/Sales Mix, LifeLenz. Data Manager → Coverage tab renders each one with its own staleDot, checked independently (the old pooled-Math.max bug, #171, is fixed — one dead stream can’t hide behind a fresh sibling).' },
    { q: 'Where do the pull scripts run, and where are the logs', a: 'GitHub Actions, one workflow per script (.github/workflows/*.yml) — lifelenz-pull.yml, qsrsoft-ebos-pull.yml, qsrsoft-dar-pull.yml, qsrsoft-ops-pull.yml, qsrsoft-email-parse.yml, and others, all scheduled daily. Every scheduled workflow’s exact name must also be listed in sync-failure-watch.yml’s workflows: array or it fails silently — src/__tests__/sync-failure-watch.test.js enforces this both ways.' },
    { q: 'A new automated pull was just added — what’s the checklist', a: 'CLAUDE.md’s standing rule: (1) add the workflow name to sync-failure-watch.yml, (2) add its dsField to stream-freshness.js STREAMS, (3) a Supabase table with tenant_id + RLS, (4) keep a manual upload fallback, (5) two-path auth (direct token → Playwright fallback).' },
  ]},
  { heading: 'SAGE’s own troubleshooting checklist (reused here, not reinvented)', color: '#a78bfa', items: [
    { q: 'SAGE says it doesn’t have data for something — what do I check, in order', a: 'The same steps SAGE’s own 🐞 Log flow generates automatically (src/views/sage.js, buildTroubleshootPrompt): (1) Reproduce — query the same tool/loader for the same store(s)/date(s). (2) Loader check (src/lib/supabase.js) — the 1000-row cap must be paginated; loc must be NSN zero-padded to 7 chars; verify date filters. (3) Freshness — is the source table actually populated for that window? (4) Edge tool (supabase/functions/sage-chat/index.ts) — check the tool’s arg mapping and is_error handling. (5) Root-cause, fix, and report what was wrong.' },
    { q: 'Which SAGE tool reads which table', a: 'query_daily_activity → qsr_daily_activity (sales/DT/speed). query_lifelenz_labor → lifelenz_schedule. query_forecast_snapshots → forecast_snapshots. query_promo_roi → daily_glimpse_daily / ctrl_rows. (src/views/sage.js’s DATA_SOURCES — the same map SAGE’s own Log-issue modal uses to guess a failure’s source.)' },
  ]},
  { heading: 'Standing rules worth re-reading before debugging', color: '#94a3b8', items: [
    { q: 'Where’s the full context', a: 'CLAUDE.md’s Dev Rules section is canonical — “measure it, don’t reason about it” (reproduce before theorizing; a live-data claim must name the credential AND the observation), “check whether a helper exists before writing one”, and “cite anchors, not line numbers” in anything durable (memory/, commit bodies, code comments).' },
    { q: 'Auto-first / manual-is-last-resort, in one line', a: 'Manual uploads (laborRows/ctrlRows/opsRows/FOB Excel) are last-resort fill only — device-local IndexedDB, and must never override auto/cloud data. If a metric looks wrong only on one device, or only after a certain date, suspect a stale manual upload before suspecting the auto pipeline.' },
  ]},
];

// ── Print / Export (same local-helper pattern as promo-roi.js/dt-speedofservice.js/
// security-panel.js — a full standalone HTML document via window.open(), never bare
// window.print() against this panel’s scrolled modal body) ──────────────────────
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function printHtml(modeLabel, sections) {
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const body = sections.map(sec => `
    <div style="padding:16px 32px;border-top:1px solid #e5e7eb">
      <div style="font-size:12px;font-weight:800;color:${sec.color};text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${esc(sec.heading)}</div>
      ${sec.items.map(it => `
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:2px">${esc(it.q)}</div>
          <div style="font-size:11.5px;color:#374151;line-height:1.55">${esc(it.a)}</div>
        </div>`).join('')}
    </div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Troubleshooting — ${esc(modeLabel)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#111;font-size:13px}
@media print{body{background:white}.no-print{display:none!important}.page{box-shadow:none!important;margin:0!important;border-radius:0!important;max-width:100%!important}}</style>
</head><body>
<div class="no-print" style="background:#1e293b;padding:12px 24px;display:flex;align-items:center;gap:12px">
  <span style="color:#f59e0b;font-weight:800;font-size:16px">Meridian</span>
  <span style="color:#94a3b8;font-size:13px">Troubleshooting — ${esc(modeLabel)}</span>
  <button onclick="window.print()" style="margin-left:auto;background:#f59e0b;border:none;color:#000;padding:7px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖶 Print / Save as PDF</button>
  <button onclick="window.close()" style="background:transparent;border:1px solid #475569;color:#94a3b8;padding:7px 14px;border-radius:6px;cursor:pointer">Close</button>
</div>
<div class="page" style="max-width:900px;margin:24px auto;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.10);overflow:hidden">
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:26px 32px;color:white">
    <div style="font-size:11px;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">Meridian</div>
    <div style="font-size:24px;font-weight:900;letter-spacing:-.5px">Troubleshooting — ${esc(modeLabel)}</div>
    <div style="margin-top:8px;font-size:12px;color:#94a3b8">Generated ${now}</div>
  </div>
  ${body}
  <div style="padding:12px 32px;background:#0f172a;display:flex;justify-content:space-between;align-items:center">
    <span style="color:#f59e0b;font-weight:800;font-size:14px">Meridian</span>
    <span style="color:#475569;font-size:11px">QSR Forecasting &amp; Analytics · Generated ${now}</span>
  </div>
</div>
</body></html>`;
}
function openPrintReport(html) {
  printHtmlOverlay(html, { autoPrint: false });
}

// ── Panel ────────────────────────────────────────────────────────────────────
export function TroubleshootingPanel({ onClose }) {
  const [mode, setMode] = React.useState('user'); // 'user' | 'dev'
  const [q, setQ] = React.useState('');
  const sections = mode === 'user' ? END_USER_SECTIONS : DEVELOPER_SECTIONS;

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sections;
    return sections
      .map(sec => ({ ...sec, items: sec.items.filter(it =>
        (it.q + ' ' + it.a).toLowerCase().includes(needle)) }))
      .filter(sec => sec.items.length);
  }, [sections, q]);

  const seg = (val, label) => btn({
    onClick: () => setMode(val),
    style: { flex: 1, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
      border: '1px solid ' + (mode === val ? 'var(--amber)' : 'var(--bdr)'),
      background: mode === val ? 'rgba(245,158,11,.14)' : 'transparent',
      color: mode === val ? 'var(--amber)' : 'var(--text3)' },
  }, label);

  return h(ModalShell, {
    title: '🔧 Troubleshooting',
    subtitle: 'End-user fixes and developer diagnostics for when something in Meridian looks wrong',
    onClose, maxWidth: 860, zIndex: Z.nested,
    bodyStyle: { padding: '14px 20px 20px', fontSize: '11px', lineHeight: 1.7 },
    headerExtra: div({ style: { display: 'flex', alignItems: 'center', gap: 8 } },
      btn({
        onClick: () => openPrintReport(printHtml(mode === 'user' ? 'End User' : 'Developer', sections)),
        title: 'Print or save this mode as a PDF',
        style: { padding: '5px 10px', fontSize: 11, fontWeight: 700, background: 'transparent',
          color: 'var(--text3)', border: '1px solid var(--bdr)', borderRadius: 6, cursor: 'pointer' },
      }, '🖶 Print'),
    ),
  },
    // Mode toggle
    div({ style: { display: 'flex', gap: 8, marginBottom: 10 } },
      seg('user', '👤 End User'),
      seg('dev', '🛠 Developer')),
    // Search
    h('input', {
      value: q, onChange: e => setQ(e.target.value),
      placeholder: mode === 'user' ? 'Search end-user fixes…' : 'Search developer diagnostics…',
      style: { width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '7px 10px',
        background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 6,
        color: 'var(--text)', marginBottom: 14, fontFamily: 'inherit' },
    }),
    // Sections
    filtered.length === 0
      ? div({ style: { color: 'var(--text3)', fontSize: 11, padding: '20px 0', textAlign: 'center' } }, 'No matches for “' + q + '”.')
      : filtered.map((sec, si) => div({ key: si, style: { marginBottom: 18 } },
          div({ style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            padding: '6px 10px', background: withAlpha(sec.color, '15'), borderRadius: 'var(--r)',
            borderLeft: '3px solid ' + sec.color } },
            div({ style: { fontWeight: 800, fontSize: 12, color: sec.color } }, sec.heading)),
          div({ style: { paddingLeft: 12 } },
            ...sec.items.map((it, ii) => div({ key: ii, style: { marginBottom: 12 } },
              div({ style: { fontWeight: 700, fontSize: 11, color: 'var(--text)', marginBottom: 3 } }, it.q),
              div({ style: { color: 'var(--text2)', fontSize: 10, lineHeight: 1.6, whiteSpace: 'pre-line' } }, it.a),
            )),
          ),
        )),
  );
}

export default TroubleshootingPanel;
