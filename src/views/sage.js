// @ts-nocheck
import * as React from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { supabase, saveTask, saveFeatureRequest, loadSagePrompts, saveSagePrompt, deleteSagePrompt, updateSagePromptSchedule } from '../lib/supabase.js';
import { STORE_NAMES } from '../constants.js';

const h = React.createElement;
const { useState: uSt, useRef: uRef, useEffect: uEf, useCallback: uCb } = React;

const amber = '#f59e0b';
const muted = '#6b7280';
const grn   = '#10b981';
const red   = '#ef4444';

const SAGE_THREAD_KEY = 'mf_sage_thread_v1';
const SAGE_SESSIONS_KEY = 'mf_sage_sessions_v1';   // archived past conversations (recoverable "tabs")

// ── Data summary helpers ──────────────────────────────────────────────────────
function _avg(arr) {
  const v = arr.filter(x => x != null && !isNaN(x));
  return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
}

function _fmt(n, d=1) { return n != null ? n.toFixed(d) : '—'; }

function _dollar(n) {
  if (n == null) return '—';
  const abs = Math.abs(Math.round(n));
  return (n < 0 ? '-' : '') + '$' + abs.toLocaleString();
}

function _storeName(loc) {
  return STORE_NAMES?.[String(loc)] || `Store ${loc}`;
}

function _recentRows(rows, days) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const recent = rows.filter(r => {
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    return !isNaN(d.getTime()) && d >= cutoff;
  });
  return recent.length >= Math.min(5, rows.length) ? recent : rows;
}

function _byLoc(rows, initFn, rowFn) {
  const map = {};
  for (const r of rows) {
    const loc = String(r.loc || '');
    if (!loc) continue;
    if (!map[loc]) map[loc] = initFn();
    rowFn(map[loc], r);
  }
  return map;
}

function buildLaborSummary(ds) {
  const rows = ds?.laborRows || [];
  if (rows.length < 5) return null;
  const working = _recentRows(rows, 60);

  const distAvgLabor = _avg(working.map(r => r.laborPct));
  const distAvgTpph  = _avg(working.map(r => r.tpph));
  const totalOtDollar = working.reduce((s,r) => s + (r.otDollar || 0), 0);
  const totalOtHrs    = working.reduce((s,r) => s + (r.otHrs || 0), 0);

  const locMap = _byLoc(working,
    () => ({ laborPcts: [], tpphs: [], otDollar: 0, otHrs: 0 }),
    (d, r) => {
      if (r.laborPct != null) d.laborPcts.push(r.laborPct);
      if (r.tpph != null) d.tpphs.push(r.tpph);
      d.otDollar += r.otDollar || 0;
      d.otHrs += r.otHrs || 0;
    }
  );

  const stores = Object.entries(locMap)
    .map(([loc, d]) => ({
      loc, name: _storeName(loc),
      laborPct: _avg(d.laborPcts),
      tpph: _avg(d.tpphs),
      otDollar: d.otDollar, otHrs: d.otHrs,
    }))
    .filter(s => s.laborPct != null)
    .sort((a,b) => b.laborPct - a.laborPct);

  let out = `LABOR & STAFFING (${working.length} daily records):
  District avg: Labor ${_fmt(distAvgLabor)}% | TPPH ${_fmt(distAvgTpph)} | Total OT: ${_dollar(totalOtDollar)} (${Math.round(totalOtHrs)}h)
`;
  if (stores.length) {
    out += '\n  STORE LABOR% RANKING (worst to best):\n';
    out += `  | # | Store | Labor% | TPPH | OT $ |\n  | - | ----- | ------ | ---- | ---- |\n`;
    stores.forEach((s, i) => {
      out += `  | ${i+1} | ${s.name} (${s.loc}) | ${_fmt(s.laborPct)}% | ${_fmt(s.tpph)} | ${s.otDollar > 50 ? _dollar(s.otDollar) : '—'} |\n`;
    });
  }
  return out;
}

function buildFobSummary(ds) {
  const rows = ds?.fobRows || [];
  if (rows.length < 3) return null;
  const working = _recentRows(rows, 120);

  const field = f => _avg(working.map(r => r[f]));
  const fobAvg = field('fobPct');

  const locMap = _byLoc(working,
    () => ({ rows: [] }),
    (d, r) => d.rows.push(r)
  );

  const stores = Object.entries(locMap)
    .map(([loc, d]) => ({
      loc, name: _storeName(loc),
      fobPct: _avg(d.rows.map(r => r.fobPct)),
      unexplained: _avg(d.rows.map(r => r.unexplained)),
      compWaste: _avg(d.rows.map(r => r.compWaste)),
      rawWaste: _avg(d.rows.map(r => r.rawWaste)),
      avgSales: _avg(d.rows.map(r => r.sales)),
    }))
    .filter(s => s.fobPct != null)
    .sort((a,b) => b.fobPct - a.fobPct);

  const cats = [
    ['baseFoodPct', 'Base Food'], ['compWaste', 'Comp Waste'], ['rawWaste', 'Raw Waste'],
    ['condiment', 'Condiment'], ['empMeal', 'Emp Meal'], ['statVar', 'Stat Variance'],
    ['unexplained', 'Unexplained'], ['discCoupon', 'Disc/Coupon'],
  ];

  let out = `FOB / FOOD COST (${working.length} records):
  District avg FOB: ${_fmt(fobAvg)}%
`;

  const catVals = cats.filter(([f]) => field(f) != null);
  if (catVals.length) {
    out += '\n  CATEGORY BREAKDOWN (district avg):\n';
    for (const [f, label] of catVals) {
      out += `    ${label}: ${_fmt(field(f), 2)}%\n`;
    }
  }

  if (stores.length) {
    out += '\n  STORE FOB RANKING (highest first):\n';
    out += `  | # | Store | FOB% | vs District | $ Over(est) | Top Driver |\n  | - | ----- | ---- | ----------- | ----------- | ---------- |\n`;
    stores.forEach((s, i) => {
      const variance = fobAvg != null ? s.fobPct - fobAvg : null;
      const dollarOver = variance != null && s.avgSales != null ? variance / 100 * s.avgSales : null;
      const topDriver = s.unexplained > 0.5 ? `Unexplained ${_fmt(s.unexplained,2)}%`
        : s.compWaste > 1.2 ? `Comp Waste ${_fmt(s.compWaste,2)}%`
        : s.rawWaste > 0.8 ? `Raw Waste ${_fmt(s.rawWaste,2)}%`
        : '—';
      out += `  | ${i+1} | ${s.name} (${s.loc}) | ${_fmt(s.fobPct)}% | ${variance != null ? (variance>=0?'+':'')+_fmt(variance)+'pp' : '—'} | ${dollarOver != null && Math.abs(dollarOver)>20 ? _dollar(dollarOver) : '—'} | ${topDriver} |\n`;
    });
  }
  return out;
}

function buildOpsSummary(ds) {
  const rows = ds?.opsRows || [];
  if (rows.length < 3) return null;
  const working = _recentRows(rows, 60);

  const distOepe = _avg(working.map(r => r.oepe));
  const distPark = _avg(working.map(r => r.park));

  const locMap = _byLoc(working,
    () => ({ oepes: [], parks: [] }),
    (d, r) => {
      if (r.oepe != null) d.oepes.push(r.oepe);
      if (r.park != null) d.parks.push(r.park);
    }
  );

  const stores = Object.entries(locMap)
    .map(([loc, d]) => ({
      loc, name: _storeName(loc),
      oepe: _avg(d.oepes), park: _avg(d.parks),
    }))
    .filter(s => s.oepe != null)
    .sort((a,b) => b.oepe - a.oepe);

  let out = `SERVICE TIMES / OEPE (${working.length} records):
  District avg OEPE: ${_fmt(distOepe, 0)}s | Park rate: ${_fmt(distPark, 1)}%
`;
  if (stores.length) {
    out += '\n  STORE OEPE RANKING (slowest first):\n';
    out += `  | # | Store | OEPE | Park% |\n  | - | ----- | ---- | ----- |\n`;
    stores.forEach((s, i) => {
      out += `  | ${i+1} | ${s.name} (${s.loc}) | ${_fmt(s.oepe, 0)}s | ${s.park != null ? _fmt(s.park,1)+'%' : '—'} |\n`;
    });
  }
  return out;
}

function buildSmgSummary(ds) {
  const rows = ds?.smgFullscale || [];
  if (!rows.length) return null;

  // Most recent record per store
  const byLoc = {};
  for (const r of rows) {
    const loc = String(r.loc || '');
    if (!byLoc[loc] || r.year > byLoc[loc].year || (r.year === byLoc[loc].year && r.month > byLoc[loc].month)) {
      byLoc[loc] = r;
    }
  }

  const stores = Object.values(byLoc)
    .map(r => ({
      loc: String(r.loc),
      name: _storeName(r.loc),
      osatTop2: r.osatTop2,
      osatB2B: r.osatB2B,
      dtProblem: r.dtProblem,
      period: `${r.year}-${String(r.month).padStart(2,'0')}`,
    }))
    .sort((a,b) => (a.osatTop2 ?? 100) - (b.osatTop2 ?? 100));

  const distOsat = _avg(stores.map(s => s.osatTop2));

  let out = `SMG VOICE / CUSTOMER SATISFACTION:
  District avg OSAT top-2: ${_fmt(distOsat, 1)}% (target ≥90%)
`;
  if (stores.length) {
    out += '\n  STORE OSAT RANKING (worst first):\n';
    out += `  | # | Store | OSAT% | DT Problem% | Period |\n  | - | ----- | ----- | ----------- | ------ |\n`;
    stores.forEach((s, i) => {
      const flag = s.osatTop2 != null && s.osatTop2 < 90 ? ' ⚠' : '';
      out += `  | ${i+1} | ${s.name} (${s.loc})${flag} | ${_fmt(s.osatTop2, 1)}% | ${s.dtProblem != null ? _fmt(s.dtProblem,1)+'%' : '—'} | ${s.period} |\n`;
    });
  }
  return out;
}

function buildControlsSummary(ds) {
  const rows = ds?.ctrlRows || [];
  if (rows.length < 3) return null;
  const working = _recentRows(rows, 60);

  const distDisc = _avg(working.map(r => r.discPct));

  const locMap = _byLoc(working,
    () => ({ discPcts: [], cashOS: [] }),
    (d, r) => {
      if (r.discPct != null) d.discPcts.push(r.discPct);
      if (r.cashOSAmt != null) d.cashOS.push(Math.abs(r.cashOSAmt));
    }
  );

  const notable = Object.entries(locMap)
    .map(([loc, d]) => ({
      loc, name: _storeName(loc),
      discPct: _avg(d.discPcts),
      cashOS: _avg(d.cashOS),
    }))
    .filter(s => (s.discPct != null && s.discPct > 3) || (s.cashOS != null && s.cashOS > 75))
    .sort((a,b) => (b.discPct||0) - (a.discPct||0));

  if (!notable.length && distDisc == null) return null;

  let out = `CONTROLS (${working.length} records):
  District avg discount: ${_fmt(distDisc, 2)}%
`;
  if (notable.length) {
    out += '\n  NOTABLE EXCEPTIONS:\n';
    for (const s of notable) {
      const parts = [];
      if (s.discPct != null && s.discPct > 3) parts.push(`Disc ${_fmt(s.discPct,2)}%`);
      if (s.cashOS != null && s.cashOS > 75) parts.push(`Cash O/S ${_dollar(s.cashOS)}`);
      out += `    ${s.name} (${s.loc}): ${parts.join(' | ')}\n`;
    }
  }
  return out;
}

function buildScheduleSummary(ds) {
  const rows = ds?.schedRows || [];
  if (rows.length < 5) return null;
  const working = _recentRows(rows, 30);

  // Only include rows where we have both schVLH and needVLH
  const gapped = working.filter(r => r.schVLH != null && r.needVLH != null);
  if (!gapped.length) return null;

  const distGap = _avg(gapped.map(r => r.schVLH - r.needVLH));

  const locMap = _byLoc(gapped,
    () => ({ gaps: [], schVLH: [], needVLH: [] }),
    (d, r) => {
      d.gaps.push(r.schVLH - r.needVLH);
      d.schVLH.push(r.schVLH);
      d.needVLH.push(r.needVLH);
    }
  );

  const stores = Object.entries(locMap)
    .map(([loc, d]) => ({
      loc, name: _storeName(loc),
      avgGap: _avg(d.gaps),
    }))
    .filter(s => s.avgGap != null)
    .sort((a,b) => Math.abs(b.avgGap) - Math.abs(a.avgGap));

  if (!stores.length) return null;

  let out = `LIFELENZ SCHEDULING (${working.length} schedule days, last 30 days):
  District avg Sch vs Need gap: ${distGap != null ? (distGap>=0?'+':'')+_fmt(distGap,1) : '—'}h/day
`;
  out += '\n  TOP SCHEDULING GAPS BY STORE:\n';
  stores.slice(0, 8).forEach((s, i) => {
    const dir = s.avgGap > 0 ? 'over-staffed' : 'under-staffed';
    out += `    ${i+1}. ${s.name} (${s.loc}): ${(s.avgGap>=0?'+':'')+_fmt(s.avgGap,1)}h/day avg (${dir})\n`;
  });
  return out;
}

// ── QSRSoft field definitions section for SAGE ───────────────────────────────
function buildFieldDefsSection(qsrFieldDefs) {
  if (!qsrFieldDefs) return '';
  const PAGES = [
    { key: 'fob',  label: 'FOB / Food Cost' },
    { key: 'dar',  label: 'Daily Activity Report (DAR)' },
    { key: 'ops',  label: 'Operations Report' },
    { key: 'cash', label: 'Cash / Controls' },
  ];
  let out = '';
  for (const p of PAGES) {
    const fields = qsrFieldDefs[p.key];
    if (!fields) continue;
    out += `\n${p.label}:\n`;
    for (const [label, desc] of Object.entries(fields)) {
      out += `  ${label}: ${desc}\n`;
    }
  }
  return out
    ? `\nQSRSOFT FIELD DEFINITIONS (use when asked what a metric means):\n${'─'.repeat(60)}\n${out}`
    : '';
}

// ── System prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(ds, signals, customSignalDefs) {
  const today = new Date().toISOString().slice(0, 10);
  const storeCount = ds?.storeIds?.length || 0;

  const confirmedSigs = (signals || [])
    .filter(s => s.confirmed)
    .map(s => `  • ${s.name}: r=${s.r?.toFixed(2)}, n=${s.n}`)
    .join('\n');

  const plausibleSigs = (signals || [])
    .filter(s => !s.confirmed && Math.abs(s.r || 0) >= 0.30)
    .map(s => `  • ${s.name}: r=${s.r?.toFixed(2)}`)
    .join('\n');

  const promotedCustom = (customSignalDefs || [])
    .filter(d => d.status !== 'graveyard' && d.promoted_to?.includes('sage') && d.latest_r != null)
    .map(d => {
      const dir = d.latest_r > 0 ? 'positive' : 'negative';
      const strength = Math.abs(d.latest_r) >= 0.50 ? 'strong' : 'moderate';
      return `  • "${d.name}": r=${d.latest_r.toFixed(2)} (${strength} ${dir}, n=${d.latest_n || '?'})`;
    })
    .join('\n');

  const graveyardCustom = (customSignalDefs || [])
    .filter(d => d.status === 'graveyard' && d.latest_r != null)
    .map(d => `  • "${d.name}": |r|=${Math.abs(d.latest_r).toFixed(2)} — no meaningful relationship`)
    .join('\n');

  // Pre-computed data summaries
  const laborSummary    = buildLaborSummary(ds);
  const fobSummary      = buildFobSummary(ds);
  const opsSummary      = buildOpsSummary(ds);
  const smgSummary      = buildSmgSummary(ds);
  const ctrlSummary     = buildControlsSummary(ds);
  const schedSummary    = buildScheduleSummary(ds);

  const dataSections = [laborSummary, fobSummary, opsSummary, schedSummary, smgSummary, ctrlSummary]
    .filter(Boolean).join('\n\n');

  return `You are SAGE — Strategic Analytics & Guidance Engine for Meridian BI.
You advise Fletcher Reaves, a McDonald's operator managing ${storeCount} locations:
  - MCDOK (McDonald's of Oklahoma) — Oklahoma stores
  - Emerald Arches — Florida stores

Today: ${today}

LIVE DATABASE TOOLS — Use these for any question involving current or recent performance:
─────────────────────────────────────────────────────────────────────────────────────────
You have four tools that query live Supabase data (updated daily via automation):

1. query_daily_activity(start_date, end_date?, locs?)
   Returns: product_sales, scheduled projection (proj_sales_dollars), DT speed (dt_untilserve/dt_trans_cnt in µs → divide by trans count and 1,000,000 for seconds), for each store by day.
   USE FOR: "how did we do today/yesterday/this week?", "which stores are lagging vs projection?",
            "what's drive-thru speed?", "show me yesterday's sales rank", "how did [store] track last 7 days?"
   TARGETS: DT speed < 200s = green, 200–240s = amber, > 240s = red.
   NOTE: Data lags ~1 day (yesterday's data available today after ~7am ET automated sync).

2. query_lifelenz_labor(start_date, end_date?, locs?)
   Returns: sch_vlh (scheduled VLH), need_vlh (needed VLH), gap (positive = over-scheduled, negative = under-staffed).
   USE FOR: "are stores over/under-staffed?", "scheduling gaps this week", "VLH by store", "labor efficiency"

3. query_forecast_snapshots(start_date, end_date?, locs?, source?)
   Returns: per-store MAPE by forecast source. Sources: ai (Meridian AI), ly (last-year-adj), blend, di (dialed-in), qsr (QSRSoft scheduled projection).
   USE FOR: "how accurate is my forecast?", "which model is best?", "MAPE by store", "which stores have worst forecast accuracy?", "AI vs LY accuracy comparison"

4. query_promo_roi(start_date?, end_date?, margin_rate?, locs?)
   Returns: per lever (promo, discount) a district verdict + per-store rows (lift %, extra sales/day, extra give-away/day, gross-profit delta/day, verdict pays/costs/neutral). Matched-day method: promo-heavy vs promo-light days within each weekday.
   USE FOR: "are our promos paying off?", "is [store]'s discounting worth it?", "which stores give away margin without a sales lift?", "promo/discount ROI", "should we cut any promotions?"
   CAVEAT: directional screen (association with controls), NOT a randomized experiment — always say so. Defaults to ~90 days if no dates given (needs a multi-week window).

TOOL USAGE RULES:
- ALWAYS call query_daily_activity when asked about recent sales, pacing, DT speed, or vs-projection for any date
- ALWAYS call query_lifelenz_labor for any scheduling, staffing, or VLH question about the current/recent period
- For "today" use ${today}; for "yesterday" use the previous calendar day
- You can call both tools simultaneously if a question spans both domains
- The static OPERATIONAL DATA below comes from manually uploaded files (potentially weeks old). For live/current questions, tool data is more authoritative than the static summaries.
─────────────────────────────────────────────────────────────────────────────────────────

UPLOADED FILE DATA (row counts — may be weeks behind):
  Labor/Ops:       ${ds?.laborRows?.length || 0} daily rows
  Operations/OEPE: ${ds?.opsRows?.length || 0} rows
  FOB/Food Cost:   ${ds?.fobRows?.length || 0} records
  LifeLenz:        ${ds?.schedRows?.length || 0} schedule rows
  SMG FullScale:   ${ds?.smgFullscale?.length || 0} store-period records
  Controls:        ${ds?.ctrlRows?.length || 0} rows

${dataSections ? `CURRENT OPERATIONAL DATA (from uploaded files):\n${'─'.repeat(60)}\n${dataSections}${'─'.repeat(60)}` : ''}
${confirmedSigs ? `\nCONFIRMED SIGNALS (statistically meaningful correlations, |r|≥0.50):\n${confirmedSigs}` : ''}
${plausibleSigs ? `\nPLAUSIBLE SIGNALS (emerging patterns, |r| 0.30–0.49):\n${plausibleSigs}` : ''}
${promotedCustom ? `\nCUSTOM SIGNALS (user-promoted to SAGE):\n${promotedCustom}` : ''}
${graveyardCustom ? `\nDOCUMENTED NULL RELATIONSHIPS (no meaningful correlation found):\n${graveyardCustom}` : ''}

OUTPUT FORMAT — Apply this structure whenever presenting operational data:
─────────────────────────────────────────────────────────────────────────
You are both an advisor AND a reporting engine. For any data question:

1. **HEADLINE**: One sentence with the most actionable number. Lead with dollar impact or % variance. Example: "District FOB is running 28.4%, approximately $1,200/month over theoretical."
2. **RANKED TABLE**: Markdown table, stores sorted worst-to-best for the metric in question. Columns vary by domain — include variance and dollar impact wherever calculable.
3. **ROOT CAUSE CATEGORIES** (food cost / labor): Group findings into buckets — e.g., Waste Recording, Counting Accuracy, Portioning, BIB/Connection Issues, Scheduling Gap, OT Creep, etc. Estimate which stores likely fall into which category based on which subcategories are elevated.
4. **TIERED ACTION PLAN**:
   ■ Tier 1 — Act today (critical, time-sensitive, highest dollar impact)
   ▲ Tier 2 — This week (important but not urgent)
   ○ Tier 3 — Monitor (watch-list; act if it worsens)

For dollar impact: multiply % variance by average daily/monthly sales to get dollar over/under.
Reference stores by name AND number: e.g., "Duncan (1234)" or "Sulphur (5678)".
Be specific: "OEPE is 23s over target" not "OEPE is high."
For simple factual questions, answer directly first, then add relevant context from the data above.
If you don't have data on something, say so clearly — do not speculate.
─────────────────────────────────────────────────────────────────────────

TERMINOLOGY: OEPE, TPPH, Labor%, FOB, Base Food%, OSAT, DT%, B2B, MOP, Kiosk, 3PO, KVS, Park, VLH.
This is a private tool for one operator. Be candid, specific, and direct.${buildFieldDefsSection(ds?.qsrFieldDefs)}`;
}

// ── Edge Function call with SSE streaming ─────────────────────────────────────
async function callSageStream(messages, systemPrompt, onChunk, signal, onStatus) {
  const sbUrl = import.meta.env.VITE_SUPABASE_URL || '';
  if (!sbUrl) throw new Error('VITE_SUPABASE_URL not set — Supabase not configured.');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in — sign in to use SAGE.');

  const response = await fetch(`${sbUrl}/functions/v1/sage-chat`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, systemPrompt }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => String(response.status));
    throw new Error(err || `SAGE error ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.text)   onChunk(parsed.text);
        if (parsed.status && onStatus) onStatus(parsed.status);
        if (parsed.error)  throw new Error(parsed.error);
      } catch (e) { if (e.message && !e.message.startsWith('data:')) throw e; }
    }
  }
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderInline(text) {
  // Bold (**text**) and inline code (`text`)
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  if (parts.length === 1) return text;
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return h('strong', { key: i }, p.slice(2, -2));
    if (p.startsWith('`') && p.endsWith('`')) return h('code', { key: i, style: { fontFamily: 'monospace', background: 'rgba(255,255,255,.08)', padding: '1px 4px', borderRadius: 3, fontSize: '0.9em' } }, p.slice(1, -1));
    return p;
  });
}

function renderMarkdown(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const elements = [];
  let tableLines = [];
  let inTable = false;
  let keyN = 0;
  const k = () => keyN++;

  const flushTable = () => {
    if (!tableLines.length) { inTable = false; return; }
    const rows = tableLines
      .filter(l => !/^\|[-:\s|]+\|?\s*$/.test(l))
      .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));

    if (rows.length < 1) { tableLines = []; inTable = false; return; }
    const [header, ...body] = rows;
    elements.push(
      h('div', { key: k(), style: { overflowX: 'auto', margin: '8px 0' } },
        h('table', { style: { borderCollapse: 'collapse', fontSize: 11, width: '100%' } },
          h('thead', null, h('tr', null,
            header.map((cell, i) => h('th', { key: i, style: {
              padding: '5px 10px', background: 'rgba(245,158,11,.1)', color: amber,
              fontWeight: 700, textAlign: 'left', border: '1px solid rgba(255,255,255,.1)',
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap',
            } }, cell))
          )),
          h('tbody', null,
            body.map((row, ri) => h('tr', { key: ri },
              row.map((cell, ci) => h('td', { key: ci, style: {
                padding: '4px 10px', border: '1px solid rgba(255,255,255,.07)', fontSize: 11,
                color: 'var(--text,#f1f5f9)',
                background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)',
              } }, renderInline(cell)))
            ))
          )
        )
      )
    );
    tableLines = []; inTable = false;
  };

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith('|')) { inTable = true; tableLines.push(t); continue; }
    if (inTable) flushTable();

    if (!t) { elements.push(h('div', { key: k(), style: { height: 6 } })); continue; }
    if (t === '---' || t === '***' || t.match(/^─+$/)) {
      elements.push(h('hr', { key: k(), style: { border: 'none', borderTop: '1px solid rgba(255,255,255,.1)', margin: '10px 0' } }));
      continue;
    }
    if (t.startsWith('### ')) {
      elements.push(h('div', { key: k(), style: { fontWeight: 700, fontSize: 13, color: 'var(--text,#f1f5f9)', marginTop: 10, marginBottom: 3 } }, renderInline(t.slice(4))));
      continue;
    }
    if (t.startsWith('## ')) {
      elements.push(h('div', { key: k(), style: { fontWeight: 700, fontSize: 14, color: amber, marginTop: 14, marginBottom: 4, borderBottom: '1px solid rgba(245,158,11,.2)', paddingBottom: 3 } }, renderInline(t.slice(3))));
      continue;
    }
    if (t.startsWith('# ')) {
      elements.push(h('div', { key: k(), style: { fontWeight: 900, fontSize: 16, marginTop: 14, marginBottom: 6 } }, renderInline(t.slice(2))));
      continue;
    }
    if (t.startsWith('- ') || t.startsWith('• ') || t.startsWith('* ')) {
      elements.push(h('div', { key: k(), style: { display: 'flex', gap: 8, marginBottom: 2, paddingLeft: 8 } },
        h('span', { style: { color: amber, flexShrink: 0 } }, '•'),
        h('span', null, renderInline(t.slice(2))),
      )); continue;
    }
    const numMatch = t.match(/^(\d+)\. (.+)/);
    if (numMatch) {
      elements.push(h('div', { key: k(), style: { display: 'flex', gap: 8, marginBottom: 2, paddingLeft: 8 } },
        h('span', { style: { color: muted, flexShrink: 0, minWidth: 20 } }, numMatch[1] + '.'),
        h('span', null, renderInline(numMatch[2])),
      )); continue;
    }
    // Tier markers
    if (t.startsWith('■')) { elements.push(h('div', { key: k(), style: { display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 6 } }, h('span', { style: { color: red, flexShrink: 0, fontWeight: 700 } }, '■'), h('span', null, renderInline(t.slice(1).trimStart())))); continue; }
    if (t.startsWith('▲')) { elements.push(h('div', { key: k(), style: { display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 6 } }, h('span', { style: { color: amber, flexShrink: 0, fontWeight: 700 } }, '▲'), h('span', null, renderInline(t.slice(1).trimStart())))); continue; }
    if (t.startsWith('○')) { elements.push(h('div', { key: k(), style: { display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 6 } }, h('span', { style: { color: muted, flexShrink: 0, fontWeight: 700 } }, '○'), h('span', null, renderInline(t.slice(1).trimStart())))); continue; }

    elements.push(h('div', { key: k(), style: { marginBottom: 2, lineHeight: 1.65 } }, renderInline(t)));
  }
  if (inTable) flushTable();
  return elements;
}

// ── Markdown → HTML (for PDF print window) ───────────────────────────────────
function mdToHTML(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.match(/^\|.+\|$/)) {
      // collect table block
      const tLines = [];
      while (i < lines.length && lines[i].match(/^\|.+\|$/)) { tLines.push(lines[i]); i++; }
      const dataRows = tLines.filter(l => !l.match(/^\|[\s\-:|]+\|$/));
      const cells = dataRows.map(r => r.split('|').filter((_,j,a)=>j>0&&j<a.length-1).map(c=>c.trim()));
      if (cells.length) {
        const head = cells[0].map(c=>`<th>${c}</th>`).join('');
        const body = cells.slice(1).map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
        out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      }
      continue;
    }
    if (line.startsWith('## ')) out.push(`<h2>${line.slice(3)}</h2>`);
    else if (line.startsWith('# ')) out.push(`<h1>${line.slice(2)}</h1>`);
    else if (line.startsWith('### ')) out.push(`<h3>${line.slice(4)}</h3>`);
    else if (line.startsWith('---')) out.push('<hr/>');
    else if (line.startsWith('■ ')) out.push(`<p class="t1"><strong>■</strong> ${line.slice(2)}</p>`);
    else if (line.startsWith('▲ ')) out.push(`<p class="t2"><strong>▲</strong> ${line.slice(2)}</p>`);
    else if (line.startsWith('○ ')) out.push(`<p class="t3"><strong>○</strong> ${line.slice(2)}</p>`);
    else if (line.startsWith('- ')) out.push(`<li>${line.slice(2)}</li>`);
    else if (/^\d+\.\s/.test(line)) out.push(`<li>${line.replace(/^\d+\.\s/,'')}</li>`);
    else if (!line.trim()) out.push('<br/>');
    else out.push(`<p>${line.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code>$1</code>')}</p>`);
    i++;
  }
  return out.join('\n');
}

// ── Extract markdown tables → array of {header, rows} ────────────────────────
function extractTables(text) {
  const tables = [];
  const lines = text.split('\n');
  let cur = [];
  for (const line of lines) {
    if (line.match(/^\|.+\|$/)) { cur.push(line); }
    else if (cur.length) { tables.push(cur); cur = []; }
  }
  if (cur.length) tables.push(cur);
  return tables.map(tLines => {
    const data = tLines
      .filter(l => !l.match(/^\|[\s\-:|]+\|$/))
      .map(r => r.split('|').filter((_,j,a)=>j>0&&j<a.length-1).map(c=>c.trim()));
    return data;
  }).filter(t => t.length > 1);
}

// ── Feature A: turn a SAGE data issue into a Task / Feature Request ───────────
// Maps a SAGE answer to its likely data source (tool + table) so the ticket +
// troubleshooting prompt carry the pertinent details.
const DATA_SOURCES = [
  { kw: /\b(sales|revenue|guest count|\bgc\b|drive.?thru|\bdt\b|oepe|kvs|speed of service|transactions|tickets)\b/i, tool: 'query_daily_activity', table: 'qsr_daily_activity', label: 'Daily Activity (sales / DT / speed)' },
  { kw: /\b(labor|vlh|schedul|hours|tpph|tpmh|crew|fixed labor|floor)\b/i, tool: 'query_lifelenz_labor', table: 'lifelenz_schedule', label: 'LifeLenz labor / scheduling' },
  { kw: /\b(forecast|mape|projection accuracy|snapshot|model accuracy)\b/i, tool: 'query_forecast_snapshots', table: 'forecast_snapshots', label: 'Forecast snapshots' },
  { kw: /\b(promo|promotion|discount|coupon|give.?away|roi|paying off|margin.*(spend|give))\b/i, tool: 'query_promo_roi', table: 'daily_glimpse_daily / ctrl_rows', label: 'Promo / Discount ROI' },
];
const detectSource = text => DATA_SOURCES.find(s => s.kw.test(text || '')) || null;
// Language that suggests SAGE couldn't get the data (→ a troubleshooting Task).
const FAIL_RE = /\b(no data|don'?t have|do not have|unable to|couldn'?t|could not|can'?t|cannot|not available|isn'?t available|no access|missing|returned (no|0|zero)|no (results|rows|records|data)|not found|don'?t see|do not see|not enough data|insufficient data|error|failed)\b/i;
const looksLikeFailure = text => FAIL_RE.test(text || '');

function buildTroubleshootPrompt(question, answer, src) {
  const a = (answer || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  return [
    'Investigate a SAGE data issue in Meridian.', '',
    'USER ASKED:', question || '(unknown)', '',
    'SAGE RESPONDED (excerpt):', a, '',
    'LIKELY SOURCE: ' + (src ? `${src.label} — edge tool \`${src.tool}\`, table \`${src.table}\`` : 'unknown — infer from the question'), '',
    'TROUBLESHOOT:',
    '1. Reproduce: query the tool/loader for the same store(s) and date(s) the user asked about.',
    '2. Loader check (src/lib/supabase.js): 1000-row Supabase cap must be paginated; loc must be NSN zero-padded to 7 chars; verify the date filters.',
    `3. Freshness: is ${src ? '`' + src.table + '`' : 'the source table'} actually populated for that window? (the daily GitHub Action sync may have failed).`,
    `4. Edge tool (supabase/functions/sage-chat/index.ts): check ${src ? '`' + src.tool + '`' : 'the relevant tool'} arg mapping + is_error handling.`,
    '5. Root-cause, fix, and report what was wrong and the fix.',
  ].join('\n');
}

// Thin affirmations ("yes please", "go ahead") aren't the real prompt — when the
// user logs an answer that followed one, we want the SUBSTANTIVE prompt behind it.
const AFFIRM_RE = /^\s*(yes|yep|yeah|ya|sure|ok(ay)?|k|go ahead|do it|please|yes[,! ]*please|sounds good|proceed|continue|correct|right|agreed|absolutely|👍|👌)\b[\s.!]*$/i;
// Build the log context for the assistant message at index i: the substantive user
// prompt (walking back past affirmations) + the last few turns of the exchange, so a
// multi-prompt session is captured accurately — not just a "Yes, please" follow-up.
function buildLogTarget(messages, i) {
  const answer = (messages[i] && messages[i].content) || '';
  const immediate = (messages[i - 1] && messages[i - 1].role === 'user') ? messages[i - 1].content : '';
  let primary = immediate;
  if (!immediate || AFFIRM_RE.test(immediate.trim()) || immediate.trim().length < 12) {
    for (let j = i - 2; j >= 0; j--) {
      const m = messages[j];
      if (m.role === 'user' && !AFFIRM_RE.test((m.content || '').trim()) && (m.content || '').trim().length >= 12) { primary = m.content; break; }
    }
  }
  const conversation = messages.slice(Math.max(0, i - 5), i + 1)
    .map(m => (m.role === 'user' ? 'You: ' : 'SAGE: ') + (m.content || '').replace(/\s+/g, ' ').trim())
    .join('\n');
  return { question: primary || immediate, immediate, conversation, answer };
}

function LogIssueModal({ question, answer, conversation, onClose }) {
  const src = detectSource((question || '') + ' ' + (answer || ''));
  const [dest, setDest] = uSt(looksLikeFailure(answer) ? 'task' : 'fr');
  const [title, setTitle] = uSt(('SAGE data issue: ' + (question || '').trim()).slice(0, 80));
  const [priority, setPriority] = uSt('high');
  const troubleshoot = buildTroubleshootPrompt(question, answer, src);
  const context = [
    'Reported from SAGE.',
    src ? 'Likely source: ' + src.label + ' (tool ' + src.tool + ', table ' + src.table + ').' : 'Source: unknown.',
    '', 'Prompt: ' + (question || '(unknown)'),
    conversation ? '\nConversation:\n' + conversation : '',
    '', 'SAGE said: ' + (answer || '').replace(/\s+/g, ' ').trim().slice(0, 600),
  ].filter(Boolean).join('\n');
  const [notes, setNotes] = uSt(troubleshoot);
  const [saving, setSaving] = uSt(false);
  const [msg, setMsg] = uSt('');

  const doSave = async () => {
    if (!title.trim()) { setMsg('Title required'); return; }
    setSaving(true); setMsg('Saving…');
    let res;
    if (dest === 'task') {
      res = await saveTask({ title: title.trim(), description: context, notes,
        tier: 2, priority: priority === 'high' ? 1 : priority === 'low' ? 3 : 2, status: 'backlog', source: 'sage' });
    } else {
      res = await saveFeatureRequest({ title: title.trim(), description: context, dev_notes: notes,
        category: 'Data', priority, status: 'idea', submitted_by: 'SAGE', votes: 0, is_seed: false });
    }
    setSaving(false);
    if (res == null || (res.errors && res.errors.length)) { setMsg('⚠ ' + ((res && res.errors && res.errors[0]) || 'Save failed — is the table created?')); return; }
    setMsg('✓ Saved to ' + (dest === 'task' ? 'Task Queue' : 'Feature Requests'));
    setTimeout(onClose, 900);
  };

  const fld = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '7px 9px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, color: 'var(--text,#f1f5f9)', fontFamily: 'inherit' };
  const seg = (val, label, hint) => h('button', { onClick: () => setDest(val), title: hint, style: { flex: 1, padding: '7px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, border: '1px solid ' + (dest === val ? amber : 'rgba(255,255,255,.12)'), background: dest === val ? 'rgba(245,158,11,.14)' : 'transparent', color: dest === val ? amber : muted } }, label);

  return h('div', { onClick: onClose, style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } },
    h('div', { onClick: e => e.stopPropagation(), style: { background: 'var(--surf,#1e293b)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, width: 'min(560px,96vw)', maxHeight: '88vh', overflowY: 'auto', padding: 16, boxShadow: '0 16px 56px rgba(0,0,0,.5)' } },
      h('div', { style: { fontSize: 14, fontWeight: 800, color: 'var(--text,#f1f5f9)', marginBottom: 2 } }, '🐞 Log this as an issue'),
      h('div', { style: { fontSize: 11, color: muted, marginBottom: 12 } }, 'Turn SAGE’s response into a tracked ticket with a ready-to-run troubleshooting prompt.' + (src ? ' Detected source: ' + src.label + '.' : '')),
      h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: muted, marginBottom: 5 } }, 'Where should this go?'),
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 4 } },
        seg('task', '🔧 Task Queue', 'A bug / troubleshooting task (a data pull that failed or returned nothing).'),
        seg('fr', '💡 Feature Request', 'A capability gap — data or an answer SAGE can’t provide yet.')),
      h('div', { style: { fontSize: 9.5, color: muted, marginBottom: 12 } }, dest === 'task' ? 'Suggested: this reads like a data-pull failure to troubleshoot.' : 'Suggested: this reads like a capability to add.'),
      h('div', { style: { fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4 } }, 'Title'),
      h('input', { value: title, onChange: e => setTitle(e.target.value), style: { ...fld, marginBottom: 10 } }),
      h('div', { style: { fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, display: 'flex', justifyContent: 'space-between' } }, h('span', null, dest === 'task' ? 'Notes (troubleshooting prompt — paste to Claude Code)' : 'Dev notes (troubleshooting prompt)'), h('span', { style: { fontWeight: 400, fontStyle: 'italic' } }, 'editable')),
      h('textarea', { value: notes, onChange: e => setNotes(e.target.value), rows: 9, style: { ...fld, fontFamily: 'var(--mono,monospace)', fontSize: 11, resize: 'vertical', marginBottom: 10 } }),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { style: { fontSize: 10, fontWeight: 700, color: muted } }, 'Priority'),
        h('select', { value: priority, onChange: e => setPriority(e.target.value), style: { ...fld, width: 'auto', padding: '5px 8px', colorScheme: 'dark' } },
          h('option', { value: 'high' }, 'High'), h('option', { value: 'medium' }, 'Medium'), h('option', { value: 'low' }, 'Low')),
        h('span', { style: { flex: 1, fontSize: 10, color: msg.startsWith('⚠') ? red : grn } }, msg),
        h('button', { onClick: onClose, style: { padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: muted, fontSize: 11, fontWeight: 600, cursor: 'pointer' } }, 'Cancel'),
        h('button', { onClick: doSave, disabled: saving, style: { padding: '6px 16px', borderRadius: 6, border: 'none', background: amber, color: '#000', fontSize: 11, fontWeight: 800, cursor: saving ? 'default' : 'pointer' } }, saving ? '…' : 'Create'))));
}

function PromptLibraryModal({ prompts, currentInput, onClose, onUse, onRun, onRefresh }) {
  const [title, setTitle] = uSt('');
  const [msg, setMsg] = uSt('');
  const [busy, setBusy] = uSt(false);
  const canSave = (currentInput || '').trim().length > 0;
  const saveCurrent = async () => {
    if (!canSave) return;
    setBusy(true); setMsg('Saving…');
    const res = await saveSagePrompt({ title: (title.trim() || currentInput.trim().slice(0, 48)), promptText: currentInput.trim(), createdBy: 'Fletcher' });
    setBusy(false);
    if (res == null || (res.errors && res.errors.length)) { setMsg('⚠ ' + ((res && res.errors && res.errors[0]) || 'Save failed — is the table created?')); return; }
    setTitle(''); setMsg('✓ Saved'); onRefresh();
    setTimeout(() => setMsg(''), 1500);
  };
  const del = async (id) => { await deleteSagePrompt(id); onRefresh(); };
  const [schedFor, setSchedFor] = uSt(null);   // prompt id whose schedule editor is open
  const [sdraft, setSdraft] = uSt({ freq: 'daily', hour: 13, dow: 1 });
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const schedLabel = p => p.scheduleEnabled ? '⏰ ' + ((p.scheduleFreq === 'weekly') ? DOW[p.scheduleDow || 0] : 'Daily') + ' ' + String(p.scheduleHour == null ? 0 : p.scheduleHour).padStart(2, '0') + ':00 UTC' : null;
  const openSched = p => { setSdraft({ freq: p.scheduleFreq || 'daily', hour: p.scheduleHour != null ? p.scheduleHour : 13, dow: p.scheduleDow != null ? p.scheduleDow : 1 }); setSchedFor(p.id); };
  const saveSched = async (p) => { await updateSagePromptSchedule(p.id, { enabled: true, hour: +sdraft.hour, freq: sdraft.freq, dow: +sdraft.dow }); setSchedFor(null); onRefresh(); };
  const clearSched = async (p) => { await updateSagePromptSchedule(p.id, { enabled: false }); setSchedFor(null); onRefresh(); };
  const fld = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '7px 9px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, color: 'var(--text,#f1f5f9)', fontFamily: 'inherit' };
  const miniSel = { fontSize: 10.5, padding: '3px 6px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 5, color: 'var(--text,#f1f5f9)', colorScheme: 'dark' };
  return h('div', { onClick: onClose, style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } },
    h('div', { onClick: e => e.stopPropagation(), style: { background: 'var(--surf,#1e293b)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, width: 'min(560px,96vw)', maxHeight: '88vh', overflowY: 'auto', padding: 16, boxShadow: '0 16px 56px rgba(0,0,0,.5)' } },
      h('div', { style: { fontSize: 14, fontWeight: 800, color: 'var(--text,#f1f5f9)', marginBottom: 2 } }, '📚 Prompt library'),
      h('div', { style: { fontSize: 11, color: muted, marginBottom: 12 } }, 'Save prompts you run often; use, re-run, or schedule them to run automatically. Scheduled results land on the At-A-Glance “Scheduled Runs” tile.'),
      h('div', { style: { display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-end' } },
        h('div', { style: { flex: 1 } },
          h('div', { style: { fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4 } }, 'Save current input as a prompt'),
          h('input', { value: title, onChange: e => setTitle(e.target.value), placeholder: canSave ? 'Optional title…' : 'Type a prompt in SAGE first', disabled: !canSave, style: fld })),
        h('button', { onClick: saveCurrent, disabled: !canSave || busy, style: { padding: '7px 14px', borderRadius: 6, border: 'none', background: canSave ? amber : 'rgba(245,158,11,.15)', color: canSave ? '#000' : 'rgba(245,158,11,.4)', fontSize: 11, fontWeight: 800, cursor: canSave ? 'pointer' : 'default' } }, '★ Save')),
      msg && h('div', { style: { fontSize: 10, color: msg.startsWith('⚠') ? red : grn, marginBottom: 8 } }, msg),
      h('div', { style: { borderTop: '1px solid rgba(255,255,255,.08)', margin: '8px 0' } }),
      !prompts.length
        ? h('div', { style: { fontSize: 11, color: muted, textAlign: 'center', padding: '20px 0' } }, 'No saved prompts yet.')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            ...prompts.map(p => h('div', { key: p.id, style: { border: '1px solid ' + (p.scheduleEnabled ? 'rgba(245,158,11,.3)' : 'rgba(255,255,255,.09)'), borderRadius: 8, padding: '8px 10px', background: 'rgba(255,255,255,.03)' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
                h('div', { style: { fontSize: 12, fontWeight: 700, color: 'var(--text,#f1f5f9)', flex: 1 } }, p.title),
                schedLabel(p) && h('span', { title: 'Auto-runs on this schedule', style: { fontSize: 9, fontWeight: 700, color: amber, background: 'rgba(245,158,11,.14)', borderRadius: 99, padding: '1px 7px' } }, schedLabel(p))),
              h('div', { style: { fontSize: 10.5, color: muted, marginBottom: 6, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, (p.promptText || '').slice(0, 220)),
              h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                h('button', { onClick: () => onRun(p.promptText), style: { padding: '3px 11px', borderRadius: 5, border: 'none', background: amber, color: '#000', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' } }, '▶ Run'),
                h('button', { onClick: () => onUse(p.promptText), style: { padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: muted, fontSize: 10.5, fontWeight: 600, cursor: 'pointer' } }, 'Use'),
                h('button', { onClick: () => (schedFor === p.id ? setSchedFor(null) : openSched(p)), style: { padding: '3px 10px', borderRadius: 5, border: '1px solid ' + (p.scheduleEnabled ? 'rgba(245,158,11,.4)' : 'rgba(255,255,255,.14)'), background: 'transparent', color: p.scheduleEnabled ? amber : muted, fontSize: 10.5, fontWeight: 600, cursor: 'pointer' } }, '⏰ Schedule'),
                h('button', { onClick: () => del(p.id), title: 'Delete', style: { padding: '3px 9px', borderRadius: 5, border: '1px solid rgba(239,68,68,.25)', background: 'transparent', color: red, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' } }, 'Delete')),
              // Inline schedule editor
              schedFor === p.id && h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.08)' } },
                h('span', { style: { fontSize: 10, color: muted } }, 'Run'),
                h('select', { value: sdraft.freq, onChange: e => setSdraft(d => ({ ...d, freq: e.target.value })), style: miniSel }, h('option', { value: 'daily' }, 'Daily'), h('option', { value: 'weekly' }, 'Weekly')),
                sdraft.freq === 'weekly' && h('select', { value: sdraft.dow, onChange: e => setSdraft(d => ({ ...d, dow: +e.target.value })), style: miniSel }, ...DOW.map((d, i) => h('option', { key: i, value: i }, d))),
                h('span', { style: { fontSize: 10, color: muted } }, 'at'),
                h('select', { value: sdraft.hour, onChange: e => setSdraft(d => ({ ...d, hour: +e.target.value })), style: miniSel }, ...Array.from({ length: 24 }, (_, i) => h('option', { key: i, value: i }, String(i).padStart(2, '0') + ':00'))),
                h('span', { style: { fontSize: 9, color: muted } }, 'UTC'),
                h('button', { onClick: () => saveSched(p), style: { padding: '3px 11px', borderRadius: 5, border: 'none', background: amber, color: '#000', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', marginLeft: 'auto' } }, 'Set'),
                p.scheduleEnabled && h('button', { onClick: () => clearSched(p), style: { padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: muted, fontSize: 10.5, fontWeight: 600, cursor: 'pointer' } }, 'Turn off'))))),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 12 } },
        h('button', { onClick: onClose, style: { padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: muted, fontSize: 11, fontWeight: 600, cursor: 'pointer' } }, 'Close'))));
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MsgBubble({ msg, streaming, onLog }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = uSt(false);

  const content = isUser
    ? msg.content
    : h('div', { style: { fontSize: 13 } }, ...renderMarkdown(msg.content));

  function handleCopy() {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleEmail() {
    const subject = encodeURIComponent('SAGE Analysis');
    const body = encodeURIComponent(msg.content);
    window.open(`mailto:fletcher.reaves@mcreaves.com?subject=${subject}&body=${body}`);
  }

  function handlePDF() {
    const date = new Date().toISOString().slice(0,10);
    const win = window.open('', '_blank', 'width=860,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>SAGE ${date}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;max-width:760px;margin:40px auto;line-height:1.7}
      h1{font-size:20px;margin:20px 0 8px}h2{font-size:15px;border-bottom:2px solid #f5bc00;padding-bottom:4px;margin:18px 0 8px}h3{font-size:13px;margin:14px 0 6px}
      table{border-collapse:collapse;width:100%;margin:12px 0;font-size:11px}
      th{background:#f5bc00;color:#111;padding:6px 10px;text-align:left;font-weight:700}
      td{border:1px solid #ccc;padding:5px 10px}tr:nth-child(even){background:#f9f9f9}
      hr{border:none;border-top:1px solid #ddd;margin:14px 0}code{background:#f0f0f0;padding:1px 4px;border-radius:3px}
      .t1{color:#c0392b;margin:4px 0}.t2{color:#d35400;margin:4px 0}.t3{color:#7f8c8d;margin:4px 0}
      li{margin:3px 0}p{margin:4px 0}
      @media print{body{margin:20px}}
    </style></head><body><p style="color:#888;font-size:10px">SAGE Analysis · ${date}</p>${mdToHTML(msg.content)}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

  function handleExcel() {
    const date = new Date().toISOString().slice(0,10);
    const wb = XLSX.utils.book_new();
    const tables = extractTables(msg.content);
    if (tables.length) {
      tables.forEach((rows, i) => {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, `Table ${i+1}`);
      });
    } else {
      const ws = XLSX.utils.aoa_to_sheet(msg.content.split('\n').map(l => [l]));
      XLSX.utils.book_append_sheet(wb, ws, 'SAGE Analysis');
    }
    XLSX.writeFile(wb, `sage-${date}.xlsx`);
  }

  const btnStyle = (active) => ({
    background: 'none',
    border: `1px solid ${active ? 'rgba(16,185,129,.4)' : 'rgba(255,255,255,.12)'}`,
    borderRadius: 4,
    color: active ? grn : muted,
    fontSize: 11,
    padding: '2px 9px',
    cursor: 'pointer',
    transition: 'color .15s, border-color .15s',
  });

  const actionBar = !isUser && !streaming && h('div', {
    style: { display: 'flex', gap: 6, marginTop: 6, paddingLeft: 4 }
  },
    h('button', { onClick: handleCopy, style: btnStyle(copied) }, copied ? '✓ Copied' : 'Copy'),
    h('button', { onClick: handleEmail, style: btnStyle(false) }, 'Email'),
    h('button', { onClick: handlePDF,   style: btnStyle(false) }, 'PDF'),
    h('button', { onClick: handleExcel, style: btnStyle(false) }, 'Excel'),
    onLog && h('button', { onClick: onLog, title: 'Log this as an issue → Task or Feature Request (with a troubleshooting prompt)', style: btnStyle(false) }, '🐞 Log'),
  );

  return h('div', {
    style: { display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }
  },
    h('div', {
      style: {
        maxWidth: isUser ? '80%' : '94%',
        padding: '10px 14px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? 'rgba(245,158,11,.12)' : 'rgba(255,255,255,.05)',
        border: `1px solid ${isUser ? 'rgba(245,158,11,.22)' : 'rgba(255,255,255,.09)'}`,
        fontSize: '13px',
        lineHeight: 1.65,
        color: 'var(--text, #f1f5f9)',
        whiteSpace: isUser ? 'pre-wrap' : 'normal',
        wordBreak: 'break-word',
      }
    }, content),
    h('div', { style: { fontSize: '10px', color: muted, marginTop: 3, paddingLeft: isUser ? 0 : 6, paddingRight: isUser ? 6 : 0 } },
      isUser ? 'You' : (streaming ? 'SAGE · typing…' : 'SAGE'),
    ),
    actionBar,
  );
}

// ── Thinking dots ─────────────────────────────────────────────────────────────
function ThinkingDots() {
  const [n, setN] = uSt(1);
  uEf(() => {
    const iv = setInterval(() => setN(p => p >= 3 ? 1 : p + 1), 400);
    return () => clearInterval(iv);
  }, []);
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', color: muted, fontSize: '12px' } },
    h('div', { style: { display: 'flex', gap: 4 } },
      ...[0, 1, 2].map(i => h('div', {
        key: i,
        style: {
          width: 6, height: 6, borderRadius: '50%',
          background: i < n ? amber : 'rgba(245,158,11,.2)',
          transition: 'background .15s',
        }
      }))
    ),
    'SAGE is thinking…',
  );
}

// ── Quick-start prompt chips ──────────────────────────────────────────────────
const QUICK_PROMPTS = [
  'Which stores are lagging vs projection yesterday?',
  'How did DT speed look this week across all stores?',
  'Which stores have the biggest scheduling gaps this week?',
  'Which stores need my attention today?',
  'Give me a full food cost analysis.',
  'Where are my biggest labor opportunities?',
];

// ── Main panel ────────────────────────────────────────────────────────────────
export function SagePanel({ ds, signals, customSignalDefs, onBusy }) {
  const [messages, setMessages] = uSt(() => {
    try {
      const saved = localStorage.getItem(SAGE_THREAD_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [sessions, setSessions] = uSt(() => {
    try { return JSON.parse(localStorage.getItem(SAGE_SESSIONS_KEY) || '[]'); } catch { return []; }
  });
  const [sessionsOpen, setSessionsOpen] = uSt(false);
  const [input, setInput]       = uSt('');
  const [streaming, setStreaming] = uSt(false);
  const [streamText, setStreamText] = uSt('');
  const [toolStatus, setToolStatus] = uSt('');
  const [error, setError]       = uSt(null);
  const [logTarget, setLogTarget] = uSt(null);   // {question, answer} for the issue-logger modal
  const [promptLibOpen, setPromptLibOpen] = uSt(false);
  const [prompts, setPrompts]   = uSt([]);        // saved SAGE prompts
  const threadRef = uRef(null);
  const abortRef  = uRef(null);

  const refreshPrompts = uCb(() => { loadSagePrompts().then(setPrompts).catch(() => setPrompts([])); }, []);
  uEf(() => { refreshPrompts(); }, [refreshPrompts]);

  uEf(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(SAGE_THREAD_KEY, JSON.stringify(messages));
      } else {
        localStorage.removeItem(SAGE_THREAD_KEY);
      }
    } catch (_) { /* quota exceeded — ignore */ }
  }, [messages]);

  uEf(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  // Report thinking/idle status to the shell (drives the minimized pill's light).
  uEf(() => { onBusy?.(streaming); }, [streaming]);

  const persistSessions = (next) => {
    setSessions(next);
    try { localStorage.setItem(SAGE_SESSIONS_KEY, JSON.stringify(next.slice(0, 25))); } catch {}
  };
  // Archive the current conversation into the recoverable session list.
  const archiveCurrent = () => {
    if (!messages.length) return;
    const firstUser = messages.find(m => m.role === 'user');
    const entry = {
      id: 's' + messages.length + '_' + (messages[0]?.content || '').length + '_' + (firstUser?.content || '').slice(0, 8),
      title: (firstUser?.content || 'Conversation').replace(/\s+/g, ' ').trim().slice(0, 60),
      count: messages.length,
      messages,
    };
    // De-dupe by id, newest first, cap 25.
    persistSessions([entry, ...sessions.filter(s => s.id !== entry.id)].slice(0, 25));
  };

  const clearThread = () => {
    archiveCurrent();
    setMessages([]);
    localStorage.removeItem(SAGE_THREAD_KEY);
    setError(null);
  };

  const reopenSession = (s) => {
    archiveCurrent();
    setMessages(s.messages || []);
    setSessionsOpen(false);
    setError(null);
  };
  const deleteSession = (id) => persistSessions(sessions.filter(s => s.id !== id));

  const sendMessage = uCb(async (raw) => {
    const text = (raw || '').trim();
    if (!text || streaming) return;

    setInput('');
    setError(null);
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setStreaming(true);
    setStreamText('');
    setToolStatus('');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const systemPrompt = buildSystemPrompt(ds, signals, customSignalDefs);
    let full = '';

    try {
      await callSageStream(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        systemPrompt,
        (chunk) => { full += chunk; setStreamText(full); },
        ctrl.signal,
        (status) => setToolStatus(status),
      );
      if (full) setMessages(prev => [...prev, { role: 'assistant', content: full }]);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'SAGE is unavailable.');
      }
    } finally {
      setStreaming(false);
      setStreamText('');
      setToolStatus('');
      abortRef.current = null;
    }
  }, [messages, streaming, ds, signals, customSignalDefs]);

  const send = uCb(() => sendMessage(input), [sendMessage, input]);

  const stop = () => { abortRef.current?.abort(); };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const hasData = (ds?.laborRows?.length || 0) > 0;
  const sbConfigured = !!import.meta.env.VITE_SUPABASE_URL;

  return h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' } },

    // ── Header ──────────────────────────────────────────────────────────────
    h('div', { style: { padding: '16px 20px 14px', borderBottom: '1px solid rgba(255,255,255,.08)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
      h('div', null,
        h('div', { style: { fontSize: '10px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: amber, marginBottom: 4 } }, 'AI Assistant'),
        h('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: '24px', fontWeight: 900, letterSpacing: '-.04em', color: 'var(--text, #f1f5f9)', lineHeight: 1 } }, 'SAGE'),
        h('div', { style: { fontSize: '11px', color: muted, marginTop: 4 } }, 'Strategic Analytics & Guidance Engine · Claude Opus'),
      ),
      h('div', { style: { display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 } },
        h('button', {
          onClick: () => setPromptLibOpen(true),
          title: 'Saved prompts — save & re-run your go-to questions',
          style: {
            background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
            fontSize: '11px', color: muted, transition: 'all .15s',
          },
          onMouseEnter: e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,.4)'; e.currentTarget.style.color = amber; },
          onMouseLeave: e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = muted; },
        }, '📚 Prompts' + (prompts.length ? ' · ' + prompts.length : '')),
        sessions.length > 0 && h('button', {
          onClick: () => setSessionsOpen(true),
          title: 'Past conversations — reopen a previous SAGE session',
          style: {
            background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
            fontSize: '11px', color: muted, transition: 'all .15s',
          },
          onMouseEnter: e => { e.currentTarget.style.borderColor = 'rgba(96,165,250,.4)'; e.currentTarget.style.color = '#60a5fa'; },
          onMouseLeave: e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = muted; },
        }, '🕘 History · ' + sessions.length),
        messages.length > 0 && !streaming && h('button', {
          onClick: clearThread,
          title: 'Archive this conversation to History and start fresh',
          style: {
            background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
            fontSize: '11px', color: muted, transition: 'all .15s',
          },
          onMouseEnter: e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,.4)'; e.currentTarget.style.color = '#ef4444'; },
          onMouseLeave: e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = muted; },
        }, '✕ New chat'),
      ),
    ),

    // ── Thread ───────────────────────────────────────────────────────────────
    h('div', { ref: threadRef, style: { flex: 1, overflowY: 'auto', padding: '16px 20px' } },

      // Empty state
      messages.length === 0 && !streaming && h('div', { style: { textAlign: 'center', padding: '40px 16px', color: muted } },
        h('div', { style: { fontSize: '36px', marginBottom: 14 } }, '🧠'),
        h('div', { style: { fontSize: '15px', fontWeight: 700, color: 'var(--text, #f1f5f9)', marginBottom: 8 } }, 'Ask SAGE anything'),
        h('div', { style: { fontSize: '12px', lineHeight: 1.7, maxWidth: 380, margin: '0 auto' } },
          hasData
            ? 'SAGE has access to all data loaded in Meridian — labor, food cost, OEPE, scheduling, SMG, controls, and correlation signals. It responds with ranked tables, root cause analysis, and tiered action plans.'
            : 'Load your Operations Reports, Labor Analysis, and FOB files first. SAGE uses your real data to give specific, actionable recommendations.',
        ),
        !sbConfigured && h('div', { style: { marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)', fontSize: '11px', color: '#ef4444', maxWidth: 380, margin: '16px auto 0', textAlign: 'left', lineHeight: 1.6 } },
          '⚠ Supabase not configured. Deploy the sage-chat Edge Function and set ANTHROPIC_API_KEY. SAGE requires an active Supabase connection.',
        ),
        hasData && sbConfigured && h('div', { style: { marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, margin: '24px auto 0' } },
          QUICK_PROMPTS.map(p => h('button', {
            key: p,
            onClick: () => setInput(p),
            style: {
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 8, padding: '9px 14px', cursor: 'pointer',
              fontSize: '12px', color: 'var(--text, #f1f5f9)', textAlign: 'left',
            },
            onMouseEnter: e => { e.currentTarget.style.background = 'rgba(245,158,11,.07)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,.2)'; },
            onMouseLeave: e => { e.currentTarget.style.background = 'rgba(255,255,255,.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; },
          }, '→  ' + p))
        ),
      ),

      // Messages
      messages.map((msg, i) => h(MsgBubble, { key: i, msg, streaming: false,
        onLog: msg.role === 'assistant'
          ? () => setLogTarget(buildLogTarget(messages, i))
          : null })),

      // Streaming assistant message
      streaming && streamText && h(MsgBubble, { key: 'stream', msg: { role: 'assistant', content: streamText + '▌' }, streaming: true }),

      // Thinking / tool-status indicator (before first token)
      streaming && !streamText && h('div', { key: 'think', style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h(ThinkingDots, null),
        toolStatus && h('div', { style: {
          fontSize: '11px', color: amber, opacity: 0.8,
          display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2,
        } },
          h('span', { style: { fontSize: 10 } }, '🔍'),
          toolStatus,
        ),
      ),

      // Error
      error && h('div', { style: { marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)', color: '#ef4444', fontSize: '12px', lineHeight: 1.5 } },
        '⚠ ' + error,
      ),
    ),

    // ── Input area ────────────────────────────────────────────────────────────
    h('div', {
      style: {
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,.08)',
        flexShrink: 0,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        background: 'var(--surf, #1e293b)',
      }
    },
      h('textarea', {
        value: input,
        onChange: e => setInput(e.target.value),
        onKeyDown: onKey,
        placeholder: 'Ask about your district, stores, or performance… (Enter to send)',
        disabled: streaming,
        rows: 2,
        style: {
          flex: 1,
          background: 'rgba(255,255,255,.05)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 8,
          padding: '10px 12px',
          color: 'var(--text, #f1f5f9)',
          fontSize: '13px',
          lineHeight: 1.5,
          resize: 'none',
          outline: 'none',
          fontFamily: 'inherit',
        },
        onFocus: e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,.4)'; },
        onBlur:  e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; },
      }),
      streaming
        ? h('button', {
            onClick: stop,
            style: {
              background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
              color: '#ef4444', fontWeight: 700, fontSize: '12px', flexShrink: 0,
            }
          }, '■ Stop')
        : h('button', {
            onClick: send,
            disabled: !input.trim(),
            style: {
              background: input.trim() ? amber : 'rgba(245,158,11,.15)',
              border: 'none', borderRadius: 8,
              padding: '10px 18px', cursor: input.trim() ? 'pointer' : 'not-allowed',
              color: input.trim() ? '#000' : 'rgba(245,158,11,.4)',
              fontWeight: 700, fontSize: '13px', flexShrink: 0, transition: 'all .15s',
            }
          }, '→'),
    ),

    // Footer note
    h('div', { style: { padding: '6px 16px 10px', fontSize: '9px', color: muted, flexShrink: 0 } },
      'Powered by Claude Opus 4.8 with adaptive thinking · Messages are sent to Anthropic via Supabase Edge Function',
    ),

    // Modals — portaled to document.body so they escape the SAGE overlay's
    // z-index:360 stacking context (otherwise app layers at 400/600/2000 sit on
    // top and swallow every click/tap — the "opens but nothing responds" bug).
    logTarget && createPortal(h(LogIssueModal, { question: logTarget.question, answer: logTarget.answer, conversation: logTarget.conversation, onClose: () => setLogTarget(null) }), document.body),
    promptLibOpen && createPortal(h(PromptLibraryModal, {
      prompts, currentInput: input,
      onClose: () => setPromptLibOpen(false),
      onRefresh: refreshPrompts,
      onUse: (t) => { setInput(t); setPromptLibOpen(false); },
      onRun: (t) => { setPromptLibOpen(false); sendMessage(t); },
    }), document.body),
    sessionsOpen && createPortal(h(SessionsModal, {
      sessions, onClose: () => setSessionsOpen(false), onReopen: reopenSession, onDelete: deleteSession,
    }), document.body),
  );
}

// Past-conversation history ("tabs") — reopen or delete an archived session.
function SessionsModal({ sessions, onClose, onReopen, onDelete }) {
  return h('div', { onClick: onClose, style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } },
    h('div', { onClick: e => e.stopPropagation(), style: { background: 'var(--surf,#1e293b)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, width: 'min(560px,96vw)', maxHeight: '88vh', overflowY: 'auto', padding: 16, boxShadow: '0 16px 56px rgba(0,0,0,.5)' } },
      h('div', { style: { fontSize: 14, fontWeight: 800, color: 'var(--text,#f1f5f9)', marginBottom: 2 } }, '🕘 Conversation history'),
      h('div', { style: { fontSize: 11, color: muted, marginBottom: 12 } }, 'Reopen a past SAGE conversation. Your current chat is archived here automatically when you start a new one.'),
      !sessions.length && h('div', { style: { fontSize: 12, color: muted, padding: 16, textAlign: 'center', border: '1px dashed rgba(255,255,255,.12)', borderRadius: 8 } }, 'No past conversations yet.'),
      sessions.map(s => h('div', { key: s.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', marginBottom: 6 } },
        h('div', { onClick: () => onReopen(s), style: { flex: 1, minWidth: 0, cursor: 'pointer' } },
          h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text,#f1f5f9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, s.title || 'Conversation'),
          h('div', { style: { fontSize: 10, color: muted } }, (s.count || 0) + ' messages')),
        h('button', { onClick: () => onReopen(s), style: { padding: '4px 11px', borderRadius: 5, border: 'none', background: amber, color: '#000', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' } }, 'Reopen'),
        h('button', { onClick: () => onDelete(s.id), title: 'Delete', style: { padding: '4px 9px', borderRadius: 5, border: '1px solid rgba(239,68,68,.25)', background: 'transparent', color: red, fontSize: 10.5, fontWeight: 600, cursor: 'pointer' } }, '✕'))),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 10 } },
        h('button', { onClick: onClose, style: { padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: muted, fontSize: 11, fontWeight: 600, cursor: 'pointer' } }, 'Close'))));
}
