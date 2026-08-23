// @ts-nocheck
// ── Graded-Visit Readiness Index ──────────────────────────────────────────────
// Predicts how a store would fare on a McDonald's 2026 PACE graded visit (CFV /
// RGRV / EcoSure Food Safety) from the operational metrics Meridian already tracks
// daily — so the owner coaches the at-risk stores BEFORE the (mostly unannounced)
// visit lands. See memory/project-graded-visits-pace.md for the standards this maps
// to and why it matters (failed visits → 14-day / 30-90-day re-visit clocks →
// 4 qualifying visits → Operations Process to Cure → Franchising Standards).
//
// Design (v1): a TRANSPARENT weighted composite, not a black box. Each sub-score is
// built from metrics scored against each store's OWN targets (DEFAULT_TARGETS) or
// the McDonald's standard, so you always see WHY a store is flagged. Weighted toward
// Service Speed + Accuracy — the areas that are both heavily graded AND proxied
// ~1:1 by the data. Waste & variance is a separate binary-ish RISK FLAG built from
// waste/holding discipline proxies — it is NOT a food-safety prediction (cook-temp
// and pest criticals aren't inferable from sales/inventory data at all; see
// READINESS_GAPS' 'Food Safety criticals' entry for that genuine, unmodelled gap).
// memory/finding-food-safety-2026-what-is-actually-measured.md settles this: FS-A
// through FS10 are temperatures/pests/handwashing/shelf-life/checklist competence —
// zero overlap with stat variance % or raw waste %, which is what this flag reads.
// Cleanliness is an acknowledged data gap.

import { DEFAULT_TARGETS } from '../constants.js';
import { metricSeriesWithSource, METRIC_SOURCES } from './metric-source.js';

const _normLoc = l => String(parseInt(String(l ?? '').replace(/\D/g, ''), 10) || '');
const _num = v => (typeof v === 'number' && isFinite(v)) ? v : (v != null && !isNaN(+v) ? +v : null);
const _ms = d => (d instanceof Date ? d.getTime() : new Date(String(d)).getTime());
const clamp01 = x => Math.max(0, Math.min(1, x));

// SMG rating fields may be stored as a fraction (0.95) or a percent (95). Normalize
// to a percent so fixed 0-100 targets compare correctly.
const asPct = v => (v == null ? null : (Math.abs(v) <= 1.5 ? v * 100 : v));

// Sub-score weights (renormalized over whatever has data). Speed + Accuracy dominate.
export const READINESS_WEIGHTS = { speed: 0.35, accuracy: 0.30, quality: 0.20, leadership: 0.15 };

// ── Provenance registry (feedback-metric-provenance) ──────────────────────────
// Every input this engine reads, traced to the system it came from, the report that
// produces it, the Supabase table it lands in, and whether that feed is auto/emailed
// or a manual upload (manual = device-dependent, stale past the last upload). Surfaced
// verbatim in the Visit Readiness report so any number can be checked at its source.
export const SOURCE_META = {
  glimpseRows:  { system: 'QSRSoft',    report: 'Daily Glimpse (emailed report, server-parsed)', table: 'daily_glimpse_daily', feed: 'emailed' },
  opsRows:      { system: 'QSRSoft',    report: 'Operations Report (Excel upload)',              table: 'ops_rows',            feed: 'manual'  },
  laborRows:    { system: 'QSRSoft',    report: 'Labor report (Excel upload)',                   table: 'labor_rows',          feed: 'manual'  },
  ctrlRows:     { system: 'QSRSoft',    report: 'DAR / Controls (Excel upload)',                 table: 'ctrl_rows',           feed: 'manual'  },
  fobRows:      { system: 'QSRSoft',    report: 'FOB / Food Cost (Excel upload)',                table: 'fob_rows',            feed: 'manual'  },
  smgFullscale: { system: 'SMG VOICE',  report: 'FullScale scorecard (Excel upload, monthly)',   table: 'smg_fullscale',       feed: 'manual'  },
  schedRows:    { system: 'LifeLenz',   report: 'Schedules (daily API sync)',                    table: 'lifelenz_schedules',  feed: 'auto'    },
  // Dispatch #64 — the auto/derived sources metric-source.js's shared chains can now
  // resolve a driver from. Without these, srcMeta()'s unknown-key fallback would report
  // these as "Meridian · feed unknown" — technically harmless (the report still names the
  // real source key) but it silently loses the auto/manual distinction that made the R2P
  // bug findable in the first place.
  qsrActSummaryRows: { system: 'QSRSoft', report: 'Daily Activity Report (daily API sync)',       table: 'qsr_daily_activity_rollup', feed: 'auto' },
  opsCashRows:       { system: 'QSRSoft', report: 'Operations Report cash-sheet (daily API sync)', table: 'qsr_cash_sheet',            feed: 'auto' },
  qsrFobRows:        { system: 'QSRSoft', report: 'FOB / Food Cost (daily API sync)',              table: 'qsr_fob',                   feed: 'auto' },
  derived:           { system: 'Meridian', report: 'Computed from other auto-pulled metrics',      table: '—',                         feed: 'auto' },
};
export const srcMeta = key => SOURCE_META[key] || { system: 'Meridian', report: key, table: key, feed: 'unknown' };

// Area metadata — display order, label, and the PACE items each area is standing in for.
// The weight lives in READINESS_WEIGHTS (single source of truth); this is the "why this
// weight" narrative the report prints next to it.
export const READINESS_AREAS = [
  { key: 'speed',      label: 'Speed',      pace: 'CFV DT OEPE ≤120s (8 pts, tiered) · DT Line Time ≤70s · IR R2P ≤90s · RGRV Service S6/S7 (OEPE + trended), S13/S14 (R2P + trended)' },
  { key: 'accuracy',   label: 'Accuracy',   pace: 'CFV order accuracy (8 pts, all-or-nothing, every channel) · re-ring / problem-order behaviour' },
  { key: 'quality',    label: 'Quality',    pace: 'RGRV Quality (75 pts) — holding discipline, remakes, product standards · CFV sandwich (6) + fries (4)' },
  { key: 'leadership', label: 'Leadership', pace: 'RGRV Shift Leadership (33 pts) — positioning 24h ahead, travel paths, pre-shift data, peak coverage' },
];

// ── Acknowledged coverage gaps (honest, never filled with a placeholder) ──────
// PACE grades things Meridian has no daily-data proxy for. They are EXCLUDED from the
// composite rather than estimated — the report prints this list so the reader knows
// exactly what the score does and does not cover.
export const READINESS_GAPS = [
  { area: 'Cleanliness',            pace: 'RGRV Cleanliness (86 pts)',
    status: 'excluded — no data source',
    detail: 'Equipment clean/repair, 4-step cleaning and shake/grill certifications are observed on-site. Meridian holds no daily feed for any of them (the only weak proxy is labor coverage at close). Not modelled, not estimated.' },
  { area: 'Health & Safety',        pace: 'RGRV Health & Safety (37 pts, critical Y/N)',
    status: 'excluded — no data source',
    detail: 'Exits/extinguishers, PPE, fire-suppression service dates and CO2 alarms are physical checks with no operational data trail in Meridian.' },
  { area: 'Food Safety criticals',  pace: 'EcoSure FS1–FS7 (cook temps, pest, access) — any miss = fail',
    status: 'not predicted — proxy flag only',
    detail: 'Cook-temp and pest criticals are not inferable from sales/labor data. Meridian reports a SEPARATE Waste & variance RISK FLAG built from waste/holding discipline proxies (stat variance %, raw waste %) — it has no overlap with what an EcoSure Food Safety visit actually assesses (temperatures, pests, handwashing, shelf life, checklist competence) and is deliberately kept out of the readiness composite.' },
  { area: 'DFSC completion %',      pace: 'EcoSure FS31 (Daily Food Safety Checklist ≥90% over 60 days)',
    status: 'gap — not yet ingested',
    detail: 'Named in the standards as the single best food-safety leading indicator, but no DFSC completion feed exists in Meridian today.' },
  { area: 'EcoSure calibration',    pace: '3rd-Party Food Safety visit outcome',
    status: 'unvalidated — no sample',
    detail: 'The model check below validates predicted readiness against the actual graded-visit scores on record. If no EcoSure result has been loaded, readiness has never been validated against an EcoSure outcome — treat food-safety inference as untested.' },
];

// Metric specs. tgt: a DEFAULT_TARGETS key (per-store) OR a literal number (standard).
// dir: 'lower' (at/below target = perfect) or 'higher'. band: tolerance as a fraction
// of the target — actual worse than target by `band` scores 0. src list is tried in
// order (freshest cloud stream first); monthly metrics take the latest value/store.
// ⚠️ Dispatch #64: most specs below no longer carry their own `srcs:` — they are resolved
// through metric-source.js's shared, auto-first METRIC_SOURCES registry instead (see
// pickValue/MS_KEY below). A spec still carrying `srcs:` here is DELIBERATE: it names a
// metric with no metric-source.js chain at all (SMG FullScale has no API — accB2B/problem/
// osat stay manual by necessity) or one that already reads an auto stream directly and
// correctly (schedGap ← schedRows, LifeLenz). Do not add `srcs:` back to a migrated spec —
// that is exactly the local-chain drift this dispatch closes.
const SPEED = [
  { key: 'oepe', label: 'OEPE (DT total, sec)', tgt: 'tOepe', dir: 'lower', band: 0.22, unit: 's',
    pace: 'CFV DT OEPE ≤120s (8 pts, tiered) · RGRV S6 + S7 (trended)' },
  { key: 'kvst', label: 'KVS time (sec)',       tgt: 'tKvst', dir: 'lower', band: 0.35, unit: 's',
    pace: 'Kitchen (MFY) throughput behind CFV channel speed + RGRV Quality holding' },
  { key: 'park', label: 'DT park rate',          tgt: 'tPark', dir: 'lower', band: 0.60, unit: 'pct',
    pace: 'Pull-forwards inflate OEPE and raise hand-off accuracy risk (CFV DT)' },
  { key: 'r2p',  label: 'R2P front counter (sec)', tgt: 'tR2p',  dir: 'lower', band: 0.30, unit: 's',
    pace: 'CFV In-Restaurant R2P ≤90s (8 pts) · RGRV S13 + S14 (trended)' },
];
const ACCURACY = [
  // Genuinely manual — no API exists for SMG FullScale. Left on the legacy local resolver.
  { key: 'accB2B',  label: 'SMG accuracy (B2B) %', srcs: [['smgFullscale', 'accuracyB2B']],  tgt: 95, dir: 'higher', band: 0.06, unit: 'pct', monthly: true, pct: true,
    pace: 'CFV order accuracy (8 pts, all-or-nothing, every channel)' },
  { key: 'problem', label: 'SMG problem %',        srcs: [['smgFullscale', 'overallProblem']], tgt: 10, dir: 'lower', band: 0.80, unit: 'pct', monthly: true, pct: true,
    pace: 'Guest-reported problem rate — the broadest accuracy/experience proxy' },
  { key: 'tRedA',   label: 'T-Reds after total %', tgt: 'tRedAPct', dir: 'lower', band: 0.60, unit: 'pct',
    pace: 'Post-total re-rings = orders rung wrong; best daily internal accuracy proxy' },
];
const QUALITY = [
  { key: 'comp', label: 'Comp waste %', tgt: 'tCompWaste', dir: 'lower', band: 0.60, unit: 'pct', monthly: true,
    pace: 'RGRV Quality (75 pts) — holding discipline / remakes (ambiguous: discipline vs remakes)' },
  { key: 'raw',  label: 'Raw waste %',  tgt: 'tRawWaste',  dir: 'lower', band: 0.60, unit: 'pct', monthly: true,
    pace: 'RGRV Quality — product handling / shelf-life discipline' },
  // Genuinely manual — no API exists for SMG FullScale.
  { key: 'osat', label: 'SMG OSAT (B2B) %', srcs: [['smgFullscale', 'osatB2B']], tgt: 90, dir: 'higher', band: 0.10, unit: 'pct', monthly: true, pct: true,
    pace: 'Guest-rated overall satisfaction (taste/quality component of RGRV Quality)' },
];
const LEADERSHIP = [
  { key: 'tpph',  label: 'TPPH (throughput/labor-hr)', tgt: 'tTpph', dir: 'higher', band: 0.22, unit: '',
    pace: 'RGRV Shift Leadership (33 pts) — positioning and peak deployment' },
  { key: 'labor', label: 'Labor % of sales', tgt: 'tCrewLabor', dir: 'lower', band: 0.18, unit: 'pct',
    pace: 'Thin peak staffing degrades speed + hospitality together (Shift Leadership)' },
  // Already reads an auto stream (LifeLenz) directly and correctly — left alone.
  { key: 'schedGap', label: 'Schedule gap vs ideal (hrs)', srcs: [['schedRows', 'schVsIdealDiff']], tgt: 0, dir: 'abs', band: null, unit: 'hrs', absTol: 8,
    pace: 'RGRV Shift Leadership — positioning 24h ahead / schedule built to the forecast' },
];
// Waste & variance proxy metrics (waste/holding discipline). NOT a food-safety score —
// feeds the fsFlag below, which is a waste/variance risk indicator, not a Food Safety one.
const FOODSAFETY = [
  { key: 'statVar', label: 'Stat variance %', tgt: 'tStatLoss', dir: 'lower', band: 0.6, monthly: true,
    pace: 'Directional holding/handling proxy only — NOT an EcoSure prediction' },
  { key: 'raw',     label: 'Raw waste %',     tgt: 'tRawWaste', dir: 'lower', band: 0.6, monthly: true,
    pace: 'Directional holding/handling proxy only — NOT an EcoSure prediction' },
];

export const RECENT_DAYS = 45;

// ── Explainability helpers ────────────────────────────────────────────────────
// Human-readable value for a "why" sentence (the view formats its own cells).
function _fmtVal(v, unit) {
  if (v == null) return '—';
  if (unit === 'pct') { const p = Math.abs(v) <= 1.5 ? v * 100 : v; return p.toFixed(2) + '%'; }
  if (unit === 's') return Math.round(v) + 's';
  if (unit === 'hrs') return v.toFixed(1) + 'h';
  return String(Math.round(v * 10) / 10);
}
// Plain-language explanation of why a store landed where it did — from its worst drivers.
function buildWhy(store) {
  const b = store.band;
  const bandWord = b === 'at-risk' ? 'At risk' : b === 'watch' ? 'On watch' : 'Ready';
  const bad = (store.topDrivers || []).filter(d => d.score < 0.85).slice(0, 3);
  if (!bad.length) {
    const lead = b === 'ready' ? 'Every measured area is at or near target.' : 'No single metric stands out — the gap is spread across several areas.';
    return `${bandWord}. ${lead}`;
  }
  const phrases = bad.map(d => `${d.label} at ${_fmtVal(d.actual, d.unit)} vs ${_fmtVal(d.target, d.unit)} target`);
  const gapList = phrases.length === 1 ? phrases[0]
    : phrases.slice(0, -1).join(', ') + ' and ' + phrases[phrases.length - 1];
  const fs = store.fsFlag === 'elevated' ? ' Waste & variance proxies (waste/holding) are also elevated.'
    : store.fsFlag === 'watch' ? ' Waste & variance proxies are worth a look.' : '';
  return `${bandWord} — the biggest gaps are ${gapList}.${fs}`;
}

// Dispatch28 Workstream F ("voice by role" / "say the number AND the decision" — CLAUDE.md's
// standing UI rule, 2026-08-17). buildWhy above is diagnostic: it explains WHY a store landed
// where it did (worst metrics, actual vs target). It never says what to DO about it — exactly
// the gap the dispatch's evidence strings ("Not Dialed-In is better — recalibrate", "No complete
// weekly count on record") reproduce elsewhere in the app. This is the "last mile" the dispatch
// names: the hard half (WHICH gap matters) is already solved by topDrivers' sort-by-worst-score;
// this only has to phrase that as an instruction instead of an explanation. Reuses topDrivers
// and the same 0.85 driver-badness threshold buildWhy already uses — no new threshold invented.
// The panel shows `verdict` AND `why` side by side (never one replacing the other), per the
// standing rule's explicit both/and: "say the number AND the decision."
// Dispatch #69 — the waste & variance flag USED to pre-empt this verdict entirely whenever
// elevated, even for a store whose readiness band was 'ready' (the two are computed
// independently — fsFlag is deliberately kept OUT of the readiness composite, so nothing
// stops them disagreeing). That displaced the real coaching action on 10/27 stores and was
// backwards on a live counterexample: a store flagged "elevated" here can pass its actual
// EcoSure audit clean, because this proxy measures waste/inventory variance, not food
// safety (memory/finding-food-safety-2026-what-is-actually-measured.md — zero overlap with
// what EcoSure/RGRV Food Safety actually assesses). The band/topDrivers verdict — the thing
// PACE readiness is actually about — now always leads; an elevated flag is appended as a
// secondary note, never the headline.
function buildVerdict(store) {
  const top = (store.topDrivers || []).find(d => d.score < 0.85);
  let verdict;
  if (store.band === 'at-risk') {
    verdict = top
      ? `Coach ${top.label} — ${_fmtVal(top.actual, top.unit)} vs ${_fmtVal(top.target, top.unit)} target, the biggest blocker to PACE-ready.`
      : 'At risk — no single metric stands out; the gap is spread across several areas, review the full breakdown.';
  } else if (store.band === 'watch') {
    verdict = top
      ? `Watch ${top.label} — ${_fmtVal(top.actual, top.unit)} vs ${_fmtVal(top.target, top.unit)} target, trending toward the readiness threshold.`
      : 'On watch — no single metric stands out; keep monitoring.';
  } else {
    verdict = 'On track for a graded visit — no action needed this week.';
  }
  if (store.fsFlag === 'elevated') {
    verdict += ` Also check waste & variance — elevated${store.fsScore != null ? ` (score ${Math.round(store.fsScore)})` : ''}.`;
  }
  return verdict;
}

// Spearman rank correlation (Pearson on ranks) — robust to the different scales of
// predicted readiness (0-100) vs an actual graded-visit score. Returns null if n<3.
function _spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const rank = arr => {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    for (let i = 0; i < n;) { // average ties
      let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return (dx && dy) ? +(num / Math.sqrt(dx * dy)).toFixed(2) : null;
}

// Dispatch #69 first shipped a caption fix ("Weak agreement" off n=27, whose 95% CI
// [-0.16, 0.56] can't distinguish a useless model from a good one) that reported a countdown
// toward 46 pairs (80% power to detect rank corr >= 0.4). Follow-up, same day:
// memory/finding-cfv-predictability-ceiling-2026-08-22.md measured, on 217 real CFV visits,
// that rank corr >= 0.4 is ABOVE the achievable ceiling for ANY store-level predictor of this
// outcome — store identity explains only ICC=0.087 of visit-to-visit variance (marginal,
// permutation p=0.092), capping any predictor's correlation at sqrt(ICC) =~ 0.30. No amount of
// additional data reaches 0.4, so a "you'll know by <month>" countdown is unsafe at ANY
// threshold, not just this one (re-pointing the constant at 0.30 would repeat the same error).
// The honest surface is the ceiling ALONGSIDE the estimate, not a verdict or a promise.
//
// This ceiling is CFV-specific (RGR's own test-retest is 0.342 at n=25, CI [-0.06, +0.65] —
// too imprecise to use as a ceiling of its own, and not interchangeable with CFV's). That
// matters because calibrateReadiness's pairs come from each store's single most recent graded
// visit, which mixes CFV and RGR (dispatch #69 "Part D0", flagged the same day as a
// prerequisite for interpreting either correlation: CFV runs at 55.3% meeting 80% in 2026,
// RGR at ~100% — pooling two instruments with very different pass rates depresses the pooled
// rho on its own, independent of model quality). Split by reportType before applying the
// ceiling to anything.
export const CFV_CORRELATION_CEILING = 0.30; // sqrt(ICC), see finding file above — approximate

function _calibratePairs(rows) {
  const n = rows.length;
  const r = _spearman(rows.map(x => x.predicted), rows.map(x => x.actual));
  // Direction agreement: a store we did NOT rate "ready" should score below the group's
  // median actual (and vice-versa) — a simple, scale-free hit-rate.
  let hits = null, hitRate = null;
  if (n >= 3) {
    const med = [...rows.map(x => x.actual)].sort((a, b) => a - b)[Math.floor(n / 2)];
    hits = rows.filter(x => (x.band === 'ready') === (x.actual >= med)).length;
    hitRate = +(hits / n).toFixed(2);
  }
  return { n, r, hits, hitRate };
}

// Validate predicted readiness against the ACTUAL graded-visit scores the engine loads.
// Trust signal: do stores we rate lower actually score lower on their real visits?
export function calibrateReadiness(stores) {
  const rows = stores
    .filter(s => s.lastVisit && s.lastVisit.score != null)
    .map(s => ({ loc: s.loc, predicted: s.readiness, band: s.band, actual: +s.lastVisit.score, pass: s.lastVisit.pass, type: s.lastVisit.type || 'CFV', dateISO: s.lastVisit.dateISO }));

  const pooled = _calibratePairs(rows);

  // Part D0 — per-instrument breakdown, computed unconditionally (no new data required: the
  // field is already on every row). CFV is the only type with a measured ceiling today.
  const byType = {};
  for (const type of [...new Set(rows.map(x => x.type))].sort()) {
    byType[type] = { ..._calibratePairs(rows.filter(x => x.type === type)),
      ceiling: type === 'CFV' ? CFV_CORRELATION_CEILING : null };
  }

  return { ...pooled, rows: rows.sort((a, b) => a.predicted - b.predicted), byType };
}

const _isoDay = ms => (ms == null || isNaN(ms)) ? null : new Date(ms).toISOString().slice(0, 10);

// Per-store recent value for a (source, field): daily → mean over last RECENT_DAYS;
// monthly → the single latest-dated value. Returns { [loc]: {v, n, firstMs, lastMs} }.
// n / firstMs / lastMs exist purely for provenance: the report states how many
// observations each number averages and the date of the most recent one.
function valuesByLoc(ds, source, field, monthly) {
  const rows = ds?.[source] || [];
  const out = {};
  if (monthly) {
    const latest = {}; // loc → {ms, v}
    for (const r of rows) {
      const v = _num(r[field]); if (v == null) continue;
      const d = r.date || (r.year ? new Date(r.year, (r.month || 1) - 1, 1) : null); if (!d) continue;
      const loc = _normLoc(r.loc); const ms = _ms(d);
      if (!latest[loc] || ms > latest[loc].ms) latest[loc] = { ms, v };
    }
    for (const loc in latest) out[loc] = { v: latest[loc].v, n: 1, firstMs: latest[loc].ms, lastMs: latest[loc].ms };
    return out;
  }
  const cutoff = Date.now() - RECENT_DAYS * 864e5;
  const agg = {}; // loc → {sum,n,firstMs,lastMs}
  for (const r of rows) {
    if (!r.date) continue; const ms = _ms(r.date); if (isNaN(ms) || ms < cutoff) continue;
    const v = _num(r[field]); if (v == null || v === 0) continue;
    const loc = _normLoc(r.loc);
    const a = (agg[loc] || (agg[loc] = { sum: 0, n: 0, firstMs: ms, lastMs: ms }));
    a.sum += v; a.n++;
    if (ms < a.firstMs) a.firstMs = ms;
    if (ms > a.lastMs) a.lastMs = ms;
  }
  for (const loc in agg) out[loc] = { v: agg[loc].sum / agg[loc].n, n: agg[loc].n, firstMs: agg[loc].firstMs, lastMs: agg[loc].lastMs };
  return out;
}

// Dispatch #64 — key names are not identity between this file and metric-source.js.
// Only list the exceptions; every other migrated key (oepe/kvst/park/r2p/tpph/statVar)
// already matches metric-source.js's own key.
const MS_KEY = { labor: 'laborPct', tRedA: 'tRedAPct', comp: 'compWaste', raw: 'rawWaste' };
const _msKeyFor = spec => MS_KEY[spec.key] || spec.key;

// metric-source.js carries no daily-vs-monthly distinction of its own — VR's old local
// resolver applied NO window at all to monthly-cadence metrics (SMG/FOB), scanning full
// history for the single latest-dated value. RECENT_DAYS (45) would silently break that
// "latest value on record" semantic for anything uploaded more than 45 days ago, so
// monthly lookups get a much wider lookback instead — wide enough to be, in practice, "all
// of it" without literally scanning unbounded history.
const MONTHLY_LOOKBACK_DAYS = 1095;

// Per-store recent value for a metric-source.js key, resolved through metricSeriesWithSource
// (auto-first per day, freshest-wins). daily → mean of the resolved observations in the
// window; monthly → the single latest-dated value. Provenance (source/field) is taken from
// whichever day is most recent, since that is the day the displayed number is actually
// tracking, even though the average may blend more than one source across the window — the
// same freshest-wins behaviour every other metric-source.js consumer gets.
//
// Does NOT drop v===0 the way the old local `valuesByLoc` did. That exclusion was measured
// live against Ardmore-Cooper (#24471, 2026-08-22) to be actively wrong here: `park`'s
// metric-source.js chain leads with glimpseRows.parkedPct under mode:'any' specifically so a
// genuine 0% park rate counts as real data (#150/#178 — the same zero-discarding bug class).
// _ok() already enforces that upstream: a mode:'pos' metric's series can never contain a 0
// (filtered before it reaches here), so re-excluding 0 down here is a no-op for those and
// actively wrong for mode:'any' ones — it silently turned every in-window day of a real 0%
// park rate into "no data for this store," masking real (non-zero) data sitting in opsRows
// one priority slot down. Trust metric-source.js's own mode to say what counts as a value.
function msValueForLoc(ds, msKey, loc, monthly) {
  const now = Date.now();
  const range = monthly
    ? { s: new Date(now - MONTHLY_LOOKBACK_DAYS * 864e5), e: new Date(now) }
    : { s: new Date(now - RECENT_DAYS * 864e5), e: new Date(now) };
  const series = metricSeriesWithSource(ds, loc, range, msKey);
  const days = Object.keys(series).sort();
  if (!days.length) return null;
  if (monthly) {
    const dk = days[days.length - 1];
    const { value, source, field } = series[dk];
    const ms = _ms(dk);
    return { v: value, n: 1, firstMs: ms, lastMs: ms, source, field };
  }
  let sum = 0, n = 0, firstMs = null, lastMs = null, lastSrc = null, lastField = null;
  for (const dk of days) {
    const { value, source, field } = series[dk];
    if (value == null) continue;
    const ms = _ms(dk);
    sum += value; n++;
    if (firstMs == null || ms < firstMs) firstMs = ms;
    if (lastMs == null || ms > lastMs) { lastMs = ms; lastSrc = source; lastField = field; }
  }
  if (!n) return null;
  return { v: sum / n, n, firstMs, lastMs, source: lastSrc, field: lastField };
}

// First source with a value for this loc. Returns {value, source, field, n, from, asOf} or null.
// A spec carrying its own `srcs:` (accB2B/problem/osat/schedGap — see the comment above
// SPEED/ACCURACY/etc.) uses the legacy local resolver; every other spec is resolved through
// metric-source.js's shared auto-first chain.
function pickValue(ds, spec, loc, cache) {
  if (spec.srcs) {
    for (const [source, field] of spec.srcs) {
      const key = source + '|' + field + '|' + (spec.monthly ? 'm' : 'd');
      const map = cache[key] || (cache[key] = valuesByLoc(ds, source, field, spec.monthly));
      const hit = map[loc];
      if (hit && hit.v != null) {
        const val = spec.pct ? asPct(hit.v) : hit.v;
        return { value: val, source, field, n: hit.n, from: _isoDay(hit.firstMs), asOf: _isoDay(hit.lastMs) };
      }
    }
    return null;
  }
  const msKey = _msKeyFor(spec);
  const cacheKey = 'ms|' + msKey + '|' + (spec.monthly ? 'm' : 'd') + '|' + loc;
  const hit = cacheKey in cache ? cache[cacheKey] : (cache[cacheKey] = msValueForLoc(ds, msKey, loc, spec.monthly));
  if (hit && hit.v != null) {
    const val = spec.pct ? asPct(hit.v) : hit.v;
    return { value: val, source: hit.source, field: hit.field, n: hit.n, from: _isoDay(hit.firstMs), asOf: _isoDay(hit.lastMs) };
  }
  return null;
}

// Score one metric 0..1 (1 = at/better than target). Returns the resolved target, how
// the target was resolved (store's own vs McDonald's standard), and `zeroAt` — the
// actual value at which the score bottoms out at 0. Those three make the score
// reproducible by hand from the printed report.
function scoreMetric(spec, actual, loc) {
  const perStore = typeof spec.tgt !== 'number';
  let tgt = perStore ? (DEFAULT_TARGETS[loc] || {})[spec.tgt] : spec.tgt;
  if (spec.pct && perStore) tgt = asPct(tgt);
  const basis = perStore
    ? { kind: 'store', label: "store's own target", ref: 'DEFAULT_TARGETS[' + loc + '].' + spec.tgt }
    : { kind: 'standard', label: 'McDonald\'s standard', ref: String(spec.tgt) };
  if (tgt == null) return null;
  if (spec.dir === 'abs') {
    const tol = spec.absTol || 1;
    return { score: clamp01(1 - Math.abs(actual - tgt) / tol), target: tgt, basis,
      tolerance: tol, toleranceLabel: '±' + tol + ' from target', zeroAt: tgt + tol };
  }
  if (!(tgt > 0)) return null;
  const band = spec.band || 0.25;
  const over = spec.dir === 'lower' ? (actual - tgt) : (tgt - actual);
  const slack = tgt * band;
  return { score: clamp01(1 - Math.max(0, over) / slack), target: tgt, basis,
    tolerance: slack, toleranceLabel: (band * 100).toFixed(0) + '% of target',
    zeroAt: spec.dir === 'lower' ? tgt + slack : tgt - slack };
}

// Compute a sub-score for a spec group.
// Returns { score(0-100)|null, drivers:[…], missing:[…], n }.
// `missing` names every metric in the group that could NOT be scored and why — the
// score is a plain mean of the metrics that DID resolve, so the reader has to be able
// to see what was left out rather than assume full coverage.
function subScore(ds, specs, loc, cache) {
  let sum = 0, n = 0; const drivers = []; const missing = [];
  for (const spec of specs) {
    const picked = pickValue(ds, spec, loc, cache);
    if (!picked) {
      // Migrated specs have no local `srcs:` any more — read the LIVE metric-source.js
      // chain instead, or this message drifts stale exactly like the bug this dispatch
      // exists to close (dispatch #64).
      const chainSrcs = spec.srcs || (METRIC_SOURCES[_msKeyFor(spec)]?.srcs || []);
      missing.push({ key: spec.key, label: spec.label, pace: spec.pace,
        reason: 'no data for this store in ' + chainSrcs.map(([s, f]) => s + '.' + f).join(' / ')
          + (spec.monthly ? ' (monthly)' : ' (last ' + RECENT_DAYS + ' days)') });
      continue;
    }
    const sc = scoreMetric(spec, picked.value, loc);
    if (!sc) {
      missing.push({ key: spec.key, label: spec.label, pace: spec.pace,
        reason: 'no usable target (' + (typeof spec.tgt === 'number' ? 'standard ' + spec.tgt : 'DEFAULT_TARGETS.' + spec.tgt) + ')' });
      continue;
    }
    sum += sc.score; n++;
    drivers.push({ key: spec.key, label: spec.label, actual: picked.value, target: sc.target,
      score: sc.score, dir: spec.dir, unit: spec.unit, source: picked.source, field: picked.field,
      obs: picked.n, from: picked.from, asOf: picked.asOf, monthly: !!spec.monthly,
      basis: sc.basis, tolerance: sc.tolerance, toleranceLabel: sc.toleranceLabel, zeroAt: sc.zeroAt,
      pace: spec.pace });
  }
  if (!n) return { score: null, drivers: [], missing, n: 0 };
  drivers.sort((a, b) => a.score - b.score); // worst first
  return { score: +(sum / n * 100).toFixed(1), drivers, missing, n };
}

// ── CFV / graded-visit statistic tracker (Notes 25 #2) ────────────────────────
// Breaks actual graded-visit outcomes down by "known variables" — day-of-week,
// daypart, weekpart, channel, report type — plus per-store frequency/cadence, so
// patterns in when/where visits go well or poorly surface (e.g. Fridays underperform,
// or breakfast DT is the weak channel). Pure over ds.gradedVisits; no side effects.
const _DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Dispatch #73 (2026-08-22) -- the panel's "overdue" amber was a flat 60 days, never measured:
// on 190 real CFV inter-visit intervals (all 27 stores, 2023-01 -> 2026-08) it fired on 166/190
// (87.4%) -- a store perfectly on cadence sits amber PERMANENTLY, which carries no information.
// Fix is per-instrument, not a re-pointed constant: CFV/EcoSure/RGR run on different program
// cadences (owner-confirmed 3/2/1 visits per store per year), so pooling them under one number
// was the other half of the defect. Expected gaps below are the CADENCE THE PROGRAM TARGETS
// (365 / visits-per-year), NOT the measured median (138d) -- that measured figure describes how
// late visits already run against the target, and using it AS the target would just re-encode
// today's lateness as normal. See memory/dispatch-73.md for the full interval distribution.
const EXPECTED_CADENCE_DAYS = { CFV: 121, EcoSure: 182, RGR: 365 }; // 365/3, 365/2, 365/1
// "Overdue" fires past this multiple of the expected gap. 2x is MEASURED against the 190 real
// CFV intervals, not reasoned: the share of NORMAL intervals the flag would fire on is
//
//     flat 60d (retired)  87.4%      1.5x = 182d  33.7%
//     1.0x = 121d         58.4%      2.0x = 242d  12.6%
//
// and the observed p90 gap is 255d = 2.11x cadence -- so 2x lands essentially ON the 90th
// percentile, the conventional line for "unusual". 1.5x shipped first and was a large
// improvement, but left roughly a THIRD of stores amber at any moment, which is close to the
// noise problem this dispatch exists to remove. Owner chose 2x on these figures (2026-08-22).
//
// ⚠️ This is a signal-to-noise choice, not a service standard: it says nothing about when a
// visit SHOULD happen, only when a gap has become unusual for this estate. Re-measure if the
// programme cadence changes -- the multiple is anchored to the observed distribution, and a
// different cadence moves the distribution with it.
const OVERDUE_MULTIPLIER = 2;
function _cadenceKey(reportType) {
  const t = String(reportType || 'CFV');
  if (/eco|food\s*safety|fs/i.test(t)) return 'EcoSure';
  if (/rgr/i.test(t)) return 'RGR';
  if (/cfv/i.test(t)) return 'CFV';
  return null; // an instrument this file has no owner-confirmed cadence for -- no threshold,
               // not a guess (same reasoning as the CFV-only correlation ceiling above).
}
// Exported so the panel can label what the colour means without re-deriving the number.
export function overdueThresholdDays(reportType) {
  const key = _cadenceKey(reportType);
  return key ? Math.round(EXPECTED_CADENCE_DAYS[key] * OVERDUE_MULTIPLIER) : null;
}

// A graded visit's dateISO is a bare 'YYYY-MM-DD' (src/parsers/graded-visits.js parseVisitDate),
// and `new Date('2026-07-07')` parses a date-ONLY string as UTC midnight -- so .getDay() and
// .getFullYear(), which both read LOCAL time, land on the PREVIOUS calendar day in every
// negative-offset zone. Both of this estate's markets are negative-offset (Oklahoma Central,
// Florida Eastern), so this was wrong for every real viewer while passing in UTC-based CI.
//
// MEASURED against the real 217-visit dataset (memory/data/cfv-history-2023-2026.json) under
// TZ=America/Chicago: EVERY day-of-week label shifted back one. The panel reported 53 Monday and
// 42 Sunday visits when the truth is 53 Tuesday and 42 Monday -- inventing a 42-visit Sunday
// bucket PACE never shopped, and dropping Saturday (n=13) entirely. Year attribution has the same
// flaw: today's data happens to contain no Jan-1 visit so nothing is misfiled yet, but the next
// one would land in the wrong row of dispatch #75's channel-by-year table.
//
// Anchoring at local NOON reads back the calendar day the string actually names, and noon rather
// than midnight keeps it safe across DST transitions. Same idiom as engine/waste-discipline.js:41.
const _localDay = d => {
  if (d instanceof Date) return d;
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);
};

// Dispatch #75 -- Visit Patterns' Channel block pools all 4 years of CFV history into one
// pass-rate per channel, which is exactly what hid the 2026 drive-thru finding (43%->60% share,
// 25%->54% below-80, memory/finding-cfv-2026-drivethru-decline-2026-08-22.md). Splitting by
// (channel, year) fixes that, but 217 visits / 4 years / 3 channels averages ~18/cell and the
// real distribution is far worse -- in-restaurant 2023 is n=1.
//
// MEASURED against the real 217-visit dataset (all 12 channel x year cells that have any
// visits at all): sorted n = [1, 3, 5, 7, 14, 20, 23, 28, 28, 29, 29, 30]. The gap between 7
// and 14 (a jump of 7) is by far the largest in that sorted list -- every other consecutive gap
// is <=6 -- and it cleanly separates in-restaurant's four cells (1/3/5/7, every year) from every
// drive-thru/curbside cell (14+). 10 sits in that gap: not a round-number guess, the boundary
// the data itself draws. A cell below this is THIN and must be suppressed/de-emphasised by the
// panel, never rendered as a bare percentage -- see memory/dispatch-75.md.
export const CHANNEL_YEAR_MIN_N = 10;

// Per (channel, year): n, share of that YEAR's total visits (not all-time), and passRate.
// Deliberately returns passRate, not a "below-80" field -- pass is already the estate's own
// derived definition (dispatch #74, score>=80) and the panel converts to "below" for display,
// so there is exactly one place (buildRow's CFV_PASS_THRESHOLD) that encodes what "pass" means.
// No trend/slope field is computed here on purpose -- 4 annual points with several single-digit
// n do not support one (dispatch #75's explicit "do not add a trend line").
function _channelByYear(visits) {
  const yearOf = v => { const d = _localDay(v.dateISO || v.date); return isNaN(+d) ? null : String(d.getFullYear()); };
  const years = [...new Set(visits.map(yearOf).filter(Boolean))].sort();
  const yearTotal = {};
  for (const y of years) yearTotal[y] = visits.filter(v => yearOf(v) === y).length;
  const channels = [...new Set(visits.map(v => v.channel).filter(Boolean))];
  const rows = [];
  for (const channel of channels) {
    for (const year of years) {
      const cell = visits.filter(v => v.channel === channel && yearOf(v) === year);
      const n = cell.length;
      if (!n) continue; // no visits at all -- nothing to show, not a 0%
      rows.push({
        channel, year, n,
        share: yearTotal[year] ? n / yearTotal[year] : null,
        passRate: cell.filter(v => v.pass).length / n,
        thin: n < CHANNEL_YEAR_MIN_N,
      });
    }
  }
  // The current calendar year is necessarily partial (e.g. 2026 through whenever "now" is) --
  // the panel must label it, per dispatch #75's explicit "do not present it as completed".
  const partialYear = String(new Date().getFullYear());
  return { years, rows, partialYear: years.includes(partialYear) ? partialYear : null, minN: CHANNEL_YEAR_MIN_N };
}

export function analyzeGradedVisits(gradedVisits, opts = {}) {
  const type = opts.type || 'all';
  const visits = (gradedVisits || []).filter(v =>
    v && v.score != null && (type === 'all' || (v.reportType || 'CFV') === type));
  const n = visits.length;

  // Generic bucket: group by a key function → {key, n, passRate, avgScore}, biggest first.
  const byVar = (keyFn) => {
    const m = {};
    for (const v of visits) {
      const k = keyFn(v);
      if (k == null || k === '') continue;
      const o = (m[k] || (m[k] = { n: 0, pass: 0, scoreSum: 0 }));
      o.n++; if (v.pass) o.pass++; o.scoreSum += v.score;
    }
    return Object.entries(m)
      .map(([key, o]) => ({ key, n: o.n, passRate: o.n ? o.pass / o.n : null, avgScore: o.n ? +(o.scoreSum / o.n).toFixed(1) : null }))
      .sort((a, b) => b.n - a.n);
  };
  // DOW keeps calendar order, not count order.
  const dowRaw = byVar(v => { const d = _localDay(v.dateISO || v.date); return isNaN(+d) ? null : _DOW[d.getDay()]; });
  const dow = _DOW.map(d => dowRaw.find(x => x.key === d)).filter(Boolean);

  // Per-store frequency / cadence.
  const byStore = {};
  for (const v of visits) { const s = _normLoc(v.store || v.loc); if (!s) continue; (byStore[s] || (byStore[s] = [])).push(v); }
  const freq = Object.entries(byStore).map(([store, vs]) => {
    // Sorted by date (not just extracted to a numeric array) so the LAST entry's own
    // reportType is still attached -- dispatch #73 needs the overdue threshold to key off
    // the type of the visit actually being waited on, not the panel's (possibly 'all') filter.
    const dated = vs.map(v => ({ v, ms: _ms(v.dateISO || v.date) })).filter(x => !isNaN(x.ms)).sort((a, b) => a.ms - b.ms);
    const days = dated.map(x => x.ms);
    const gaps = []; for (let i = 1; i < days.length; i++) gaps.push((days[i] - days[i - 1]) / 864e5);
    const lastType = dated.length ? (dated[dated.length - 1].v.reportType || 'CFV') : null;
    return {
      store, n: vs.length,
      avgGapDays: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
      daysSinceLast: days.length ? Math.round((Date.now() - days[days.length - 1]) / 864e5) : null,
      passRate: vs.length ? vs.filter(v => v.pass).length / vs.length : null,
      lastType,
      overdueAt: overdueThresholdDays(lastType),
    };
  }).sort((a, b) => b.n - a.n);

  return {
    overall: { n, passRate: n ? visits.filter(v => v.pass).length / n : null, avgScore: n ? +(visits.reduce((a, v) => a + v.score, 0) / n).toFixed(1) : null },
    dow,
    daypart: byVar(v => v.daypart),
    weekpart: byVar(v => v.weekpart),
    channel: byVar(v => v.channel),
    channelByYear: _channelByYear(visits),
    byType: byVar(v => v.reportType || 'CFV'),
    freq,
    types: [...new Set((gradedVisits || []).map(v => v && (v.reportType || 'CFV')).filter(Boolean))],
  };
}

// ── Public: per-store + district readiness ────────────────────────────────────
export function computeVisitReadiness(ds, opts = {}) {
  const weights = opts.weights || READINESS_WEIGHTS;
  let locs = Object.keys(DEFAULT_TARGETS).filter(l => /^\d+$/.test(l));
  // Optional scope filter (All / state / patch / single store) — the report and the
  // panel share it so the district rollup and the model check are scope-correct.
  if (Array.isArray(opts.locs) && opts.locs.length) {
    const want = new Set(opts.locs.map(_normLoc));
    locs = locs.filter(l => want.has(l));
  }
  const cache = {};
  const gv = ds?.gradedVisits || ds?.graded_visits || [];
  const lastVisitByLoc = {};
  for (const v of gv) {
    const loc = _normLoc(v.store || v.loc); if (!loc || v.score == null) continue;
    const ms = _ms(v.dateISO || v.date || 0);
    if (!lastVisitByLoc[loc] || ms > lastVisitByLoc[loc].ms) lastVisitByLoc[loc] = { ms, score: v.score, pass: v.pass, type: v.reportType, dateISO: v.dateISO || v.date };
  }

  const stores = [];
  for (const loc of locs) {
    const speed = subScore(ds, SPEED, loc, cache);
    const accuracy = subScore(ds, ACCURACY, loc, cache);
    const quality = subScore(ds, QUALITY, loc, cache);
    const leadership = subScore(ds, LEADERSHIP, loc, cache);
    const subs = { speed, accuracy, quality, leadership };

    // Weighted composite over available sub-scores.
    let wSum = 0, acc = 0;
    for (const k of Object.keys(weights)) {
      if (subs[k].score != null) { acc += subs[k].score * weights[k]; wSum += weights[k]; }
    }
    if (wSum === 0) continue; // no data at all for this store
    const readiness = +(acc / wSum).toFixed(1);
    const coverage = +(wSum / (weights.speed + weights.accuracy + weights.quality + weights.leadership)).toFixed(2);

    // ── Calibration / audit trail ──────────────────────────────────────────────
    // The composite made reproducible by hand: for each area, its nominal weight, the
    // EFFECTIVE weight after renormalizing over the areas that actually had data, the
    // sub-score, and the points that area contributed. Σ contribution === readiness.
    const audit = READINESS_AREAS.map(a => {
      const sub = subs[a.key] || { score: null, drivers: [], missing: [], n: 0 };
      const w = weights[a.key] ?? 0;
      const eff = (sub.score != null && wSum > 0) ? w / wSum : 0;
      return {
        key: a.key, label: a.label, pace: a.pace,
        weight: w, effWeight: eff,
        score: sub.score,
        contribution: sub.score != null ? sub.score * eff : null,
        nMetrics: sub.n, drivers: sub.drivers, missing: sub.missing,
        excluded: sub.score == null,
      };
    });

    // Food-safety risk flag (separate). Elevated waste/holding proxies → risk.
    const fs = subScore(ds, FOODSAFETY, loc, cache);
    const fsFlag = fs.score == null ? 'unknown' : fs.score >= 75 ? 'low' : fs.score >= 55 ? 'watch' : 'elevated';

    // Top risk drivers across all sub-scores (lowest metric scores).
    const allDrivers = [...speed.drivers, ...accuracy.drivers, ...quality.drivers, ...leadership.drivers]
      .sort((a, b) => a.score - b.score).slice(0, 4);

    const store = {
      loc, readiness, coverage, subs, audit,
      band: readiness >= 85 ? 'ready' : readiness >= 70 ? 'watch' : 'at-risk',
      fsFlag, fsScore: fs.score, fsDrivers: fs.drivers, fsMissing: fs.missing,
      topDrivers: allDrivers,
      // Every metric that could not be scored, across all four areas — printed as an
      // explicit gap rather than silently narrowing the sub-score's denominator.
      notMeasured: [...speed.missing, ...accuracy.missing, ...quality.missing, ...leadership.missing],
      lastVisit: lastVisitByLoc[loc] || null,
    };
    store.why = buildWhy(store);         // plain-language explanation (explainability & trust)
    store.verdict = buildVerdict(store); // Dispatch28: one-line decision — "so what do I do?"
    stores.push(store);
  }

  stores.sort((a, b) => a.readiness - b.readiness); // most at-risk first

  // District rollup (simple mean of store readiness + sub-score means).
  const mean = arr => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
  const district = stores.length ? {
    nStores: stores.length,
    readiness: mean(stores.map(s => s.readiness)),
    atRisk: stores.filter(s => s.band === 'at-risk').length,
    watch: stores.filter(s => s.band === 'watch').length,
    ready: stores.filter(s => s.band === 'ready').length,
    fsElevated: stores.filter(s => s.fsFlag === 'elevated').length,
    subs: {
      speed: mean(stores.map(s => s.subs.speed.score).filter(x => x != null)),
      accuracy: mean(stores.map(s => s.subs.accuracy.score).filter(x => x != null)),
      quality: mean(stores.map(s => s.subs.quality.score).filter(x => x != null)),
      leadership: mean(stores.map(s => s.subs.leadership.score).filter(x => x != null)),
    },
  } : null;

  // Model check: how well predicted readiness tracks the actual graded-visit scores.
  const calibration = calibrateReadiness(stores);

  // Which graded-visit types are actually on record — drives the honest EcoSure gap
  // note (an EcoSure/food-safety result has to exist before we can claim the model
  // was ever checked against one).
  const visitTypes = [...new Set(gv.map(v => v && (v.reportType || 'CFV')).filter(Boolean))];
  const hasEcoSure = visitTypes.some(t => /eco|food\s*safety|fs/i.test(String(t)));

  // Provenance: exactly which feeds this run resolved, for the report's source index.
  const sourcesUsed = [...new Set(stores.flatMap(s =>
    (s.audit || []).flatMap(a => (a.drivers || []).map(d => d.source))))].sort();

  return {
    stores, district, weights, calibration,
    areas: READINESS_AREAS,
    gaps: READINESS_GAPS,
    hasEcoSure, visitTypes, sourcesUsed,
    method: {
      recentDays: RECENT_DAYS,
      generatedAt: new Date().toISOString(),
      dailyWindow: 'Daily metrics = arithmetic mean of that store\'s NON-ZERO observations in the last ' + RECENT_DAYS + ' days.',
      monthlyWindow: 'Monthly metrics (SMG, FOB waste/variance) = the single latest-dated value on record for that store.',
      subScore: 'Each area score = plain mean of its resolved metric scores × 100. A metric with no data or no target is dropped from that mean and listed under "not measured".',
      composite: 'Readiness = Σ (area score × effective weight), where effective weight = nominal weight ÷ the sum of the nominal weights of the areas that had data (renormalization). Coverage = that renormalization ratio.',
      metricScore: 'Metric score = 1 − (shortfall vs target ÷ tolerance), clamped to 0..1. Tolerance is a fixed fraction of the target per metric ("zero at" column shows where the score bottoms out).',
      district: 'District readiness = unweighted mean of the store readiness scores in scope (each store counts once — it is an index, not a dollar-weighted ratio).',
    },
    gapNote: 'Cleanliness has no reliable daily-data proxy and is excluded from the score.',
  };
}
