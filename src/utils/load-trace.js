// @ts-nocheck
// Startup load tracer — diagnostic for the "app is unusable until the Sales chip
// loads, sometimes 2-3 minutes" problem (Notes 54 § AAG).
//
// WHY AT THE FETCH LAYER, not around each loader: the post-login effect in App.js
// runs 28 sequential `try { await … }` stages over 26+ loaders in src/lib/supabase.js,
// which are 78 plain `export async function` declarations. Instrumenting those would
// mean touching every one of them, or restructuring 28 try/catch blocks in working
// startup code. Patching fetch once observes all of it — including the pagination
// loops inside individual loaders, which per-loader timing would hide.
//
// SAFETY: off unless explicitly enabled, wrapped so a bug here can never break
// startup, and it NEVER reads a response body (that would consume the stream and
// break every caller). Row counts come from the `content-range` header Supabase
// already returns.
//
// Usage: load the app with ?trace=1 (persists across the auth redirect), then either
// wait for the auto-summary or call mfTrace() in the console. ?trace=0 or
// mfTrace.off() disables.

const KEY = 'mf_load_trace';
const QUIET_MS = 3000;   // auto-print once no Supabase request has started for this long
const BAR_W = 44;        // waterfall width in characters

let _entries = [];
let _t0 = 0;
let _quietTimer = null;
let _installed = false;

/** Extract the Supabase table name from a REST URL. Exported for tests. */
export function _parseTable(url) {
  try {
    const s = String(url);
    const m = s.match(/\/rest\/v1\/([A-Za-z0-9_]+)/);
    if (m) return m[1];
    if (s.includes('/auth/v1/')) return 'auth';
    if (s.includes('/storage/v1/')) return 'storage';
    if (s.includes('/functions/v1/')) {
      const f = s.match(/\/functions\/v1\/([A-Za-z0-9_-]+)/);
      return 'fn:' + (f ? f[1] : '?');
    }
    return null;
  } catch { return null; }
}

/** Rows reported by Supabase's content-range header ("0-999/*" or "0-41/42"). Exported for tests. */
export function _parseRows(contentRange) {
  if (!contentRange) return null;
  const m = String(contentRange).match(/^(\d+)-(\d+)\//);
  if (!m) return null;
  return (Number(m[2]) - Number(m[1])) + 1;
}

/**
 * Reduce raw entries to the numbers that answer "is this serial?".
 * wall = first start → last end. busy = union of the covered intervals.
 * sum  = naive total of every duration.
 *
 * sum/wall near 1.0 means fully serial; higher means real overlap. busy vs wall
 * exposes dead air — time inside startup where nothing was in flight at all.
 * Exported for tests.
 */
export function _summarize(entries) {
  if (!entries.length) return { n: 0, wall: 0, sum: 0, busy: 0, idle: 0, ratio: 0 };
  const starts = entries.map(e => e.t0);
  const ends = entries.map(e => e.t1);
  const wall = Math.max(...ends) - Math.min(...starts);
  const sum = entries.reduce((a, e) => a + (e.t1 - e.t0), 0);

  // Union of intervals → how much of the wall clock had at least one request open.
  const iv = entries.map(e => [e.t0, e.t1]).sort((a, b) => a[0] - b[0]);
  let busy = 0, curS = iv[0][0], curE = iv[0][1];
  for (let i = 1; i < iv.length; i++) {
    if (iv[i][0] <= curE) { curE = Math.max(curE, iv[i][1]); }
    else { busy += curE - curS; curS = iv[i][0]; curE = iv[i][1]; }
  }
  busy += curE - curS;

  return {
    n: entries.length,
    wall: Math.round(wall),
    sum: Math.round(sum),
    busy: Math.round(busy),
    idle: Math.round(wall - busy),
    ratio: wall > 0 ? +(sum / wall).toFixed(2) : 0,
  };
}

function _bar(e, min, wall) {
  if (wall <= 0) return '';
  const s = Math.round(((e.t0 - min) / wall) * BAR_W);
  const w = Math.max(1, Math.round(((e.t1 - e.t0) / wall) * BAR_W));
  return ' '.repeat(Math.min(s, BAR_W)) + '█'.repeat(Math.min(w, BAR_W - Math.min(s, BAR_W)));
}

/** Print the waterfall. Safe to call any time; returns the raw entries. */
export function printTrace() {
  try {
    if (!_entries.length) {
      console.log('[mfTrace] no Supabase requests recorded yet');
      return [];
    }
    const sorted = [..._entries].sort((a, b) => a.t0 - b.t0);
    const min = Math.min(...sorted.map(e => e.t0));
    const s = _summarize(sorted);

    console.log(
      `%c[mfTrace] ${s.n} requests · wall ${s.wall}ms · in-flight ${s.busy}ms · idle ${s.idle}ms · sum ${s.sum}ms · serialisation ${s.ratio}x`,
      'color:#f5bc00;font-weight:700'
    );
    console.log(
      s.ratio < 1.5
        ? '  → ratio near 1.0 = requests ran essentially one-at-a-time (serial).'
        : `  → ratio ${s.ratio}x = real overlap; ${s.idle}ms idle is the remaining gap.`
    );

    console.table(sorted.map(e => ({
      table: e.table,
      start: Math.round(e.t0 - min) + 'ms',
      dur: Math.round(e.t1 - e.t0) + 'ms',
      rows: e.rows ?? '',
      status: e.status,
      waterfall: _bar(e, min, s.wall),
    })));

    const slowest = [...sorted].sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0)).slice(0, 8);
    console.log('%c  slowest:', 'font-weight:700',
      slowest.map(e => `${e.table} ${Math.round(e.t1 - e.t0)}ms`).join(' · '));

    return sorted;
  } catch (err) {
    console.warn('[mfTrace] print failed:', err);
    return [];
  }
}

function _scheduleQuietPrint() {
  try {
    clearTimeout(_quietTimer);
    _quietTimer = setTimeout(() => {
      console.log('%c[mfTrace] startup settled — waterfall below', 'color:#f5bc00');
      printTrace();
    }, QUIET_MS);
  } catch { /* non-fatal */ }
}

function _enabled() {
  try {
    const q = new URLSearchParams(location.search).get('trace');
    if (q === '1') { localStorage.setItem(KEY, '1'); return true; }
    if (q === '0') { localStorage.removeItem(KEY); return false; }
    return localStorage.getItem(KEY) === '1';
  } catch { return false; }
}

/**
 * Install the tracer. No-op unless enabled. Call as early as possible — before any
 * module has a chance to fetch.
 */
export function initLoadTrace() {
  try {
    if (_installed || typeof window === 'undefined' || !window.fetch) return false;
    if (!_enabled()) return false;

    _installed = true;
    _t0 = performance.now();
    const orig = window.fetch.bind(window);

    window.fetch = function (input, init) {
      let table = null;
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        table = _parseTable(url);
      } catch { /* fall through untraced */ }

      if (!table) return orig(input, init);

      const t0 = performance.now() - _t0;
      _scheduleQuietPrint();
      return orig(input, init).then(res => {
        try {
          // Headers only — reading the body here would consume the stream and break
          // every caller downstream.
          _entries.push({
            table,
            t0,
            t1: performance.now() - _t0,
            status: res.status,
            rows: _parseRows(res.headers && res.headers.get && res.headers.get('content-range')),
          });
          _scheduleQuietPrint();
        } catch { /* never let tracing break a real request */ }
        return res;
      }, err => {
        try {
          _entries.push({ table, t0, t1: performance.now() - _t0, status: 'ERR', rows: null });
        } catch { /* ignore */ }
        throw err;
      });
    };

    window.mfTrace = printTrace;
    window.mfTrace.entries = () => _entries;
    window.mfTrace.reset = () => { _entries = []; _t0 = performance.now(); };
    window.mfTrace.off = () => {
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      console.log('[mfTrace] disabled — reload to remove the fetch hook');
    };

    console.log('%c[mfTrace] tracing Supabase requests — call mfTrace() for the waterfall, mfTrace.off() to disable',
      'color:#f5bc00;font-weight:700');
    return true;
  } catch (err) {
    console.warn('[mfTrace] init failed (app unaffected):', err);
    return false;
  }
}
