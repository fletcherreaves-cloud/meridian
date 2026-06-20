// @ts-nocheck
import Dexie from 'dexie';

// ── MeridianDB — main operational data store ─────────────────────────────
// Migrated from hand-built IndexedDB at v4. Dexie handles connection sharing,
// schema migration, and transaction management automatically.
// Data is preserved: _rk keyPath is unchanged. The old manually-named 'byLoc'
// index is superseded by Dexie's standard 'loc' index added in v5.
const db = new Dexie('MeridianDB');

db.version(4).stores({
  laborRows:   '_rk',
  opsRows:     '_rk',
  ctrlRows:    '_rk',
  fobRows:     '_rk',
  auditRows:   '_rk',
  peaksRows:   '_rk',
  darRows:     '_rk',
  pmixRows:    '_rk',
  weatherRows: '_rk',
  metadata:    '_rk',
});
db.version(5).stores({
  laborRows:   '_rk, loc',
  opsRows:     '_rk, loc',
  ctrlRows:    '_rk, loc',
  fobRows:     '_rk, loc',
  auditRows:   '_rk, loc',
  peaksRows:   '_rk, loc',
  darRows:     '_rk, loc',
  pmixRows:    '_rk',
  weatherRows: '_rk, loc',
  metadata:    '_rk',
});

const DATA_STORES = ['laborRows','opsRows','ctrlRows','fobRows',
                     'auditRows','peaksRows','darRows','pmixRows','weatherRows'];

function idbDateKey(d) {
  if (!d) return '0000-00-00';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

async function idbPutRows(storeName, rows) {
  if (!rows || !rows.length) return;
  try {
    const records = rows.map(r => {
      const dk = idbDateKey(r.date || r.d);
      const rk = `${r.loc || '_'}:${dk}`;
      return { ...r, _rk: rk, _d: dk, date: r.date instanceof Date ? dk : r.date };
    });
    await db[storeName].bulkPut(records);
  } catch (e) { console.warn('IDB put failed:', e); }
}

async function idbGetAllRows(storeName) {
  try {
    const rows = await db[storeName].toArray();
    return rows.map(r => ({
      ...r,
      date: r._d ? new Date(r._d + 'T00:00:00') : null,
    }));
  } catch (e) { console.warn('IDB get failed:', e); return []; }
}

async function idbGetMeta(key) {
  try {
    return await db.metadata.get(key) || null;
  } catch (e) { return null; }
}

async function idbSetMeta(key, value) {
  try {
    await db.metadata.put({ _rk: key, value, ts: Date.now() });
  } catch (e) { console.warn('IDB meta failed:', e); }
}

async function idbClearAll() {
  try {
    await Promise.all([...DATA_STORES, 'metadata'].map(name => db[name].clear()));
    console.log('IDB cleared');
  } catch (e) { console.warn('IDB clear failed:', e); }
}

async function idbGetCoverage() {
  const cov = {};
  for (const name of DATA_STORES) {
    try {
      const cnt = await db[name].count();
      if (cnt > 0) {
        const rows = await db[name].toArray();
        const dates = rows.map(r => r._d).filter(Boolean).sort();
        cov[name] = { count: cnt, from: dates[0] || '?', to: dates[dates.length - 1] || '?' };
      } else {
        cov[name] = { count: 0 };
      }
    } catch (e) { cov[name] = { count: 0, error: true }; }
  }
  return cov;
}

function coverageFromLoadedRows(labor, ops, ctrl, fob, audit, peaks, dar, weather) {
  const calc = (rows) => {
    if (!rows || !rows.length) return { count: 0 };
    const dates = rows.map(r => r._d).filter(Boolean).sort();
    return { count: rows.length, from: dates[0] || '?', to: dates[dates.length - 1] || '?' };
  };
  return {
    laborRows:   calc(labor),
    opsRows:     calc(ops),
    ctrlRows:    calc(ctrl),
    fobRows:     calc(fob),
    auditRows:   calc(audit),
    peaksRows:   calc(peaks),
    darRows:     calc(dar),
    weatherRows: calc(weather),
    pmixRows:    { count: 0 },
  };
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function idbQuickSessionCheck() {
  try {
    const cnt = await db.laborRows.count();
    return cnt > 0 ? { available: true, count: cnt } : { available: false };
  } catch (e) { return { available: false }; }
}

async function loadDsFromIDB() {
  const [labor, ops, ctrl, fob, audit, peaks, dar, weather] = await Promise.all([
    idbGetAllRows('laborRows'),
    idbGetAllRows('opsRows'),
    idbGetAllRows('ctrlRows'),
    idbGetAllRows('fobRows'),
    idbGetAllRows('auditRows'),
    idbGetAllRows('peaksRows'),
    idbGetAllRows('darRows'),
    idbGetAllRows('weatherRows'),
  ]);
  const wxRows = weather.map(r => ({
    ...r,
    date: r.date instanceof Date ? r.date
        : typeof r.date === 'string' ? new Date(r.date)
        : typeof r.date === 'number' ? new Date(r.date) : r.date,
  }));
  return { labor, ops, ctrl, fob, audit, peaks, dar, weather: wxRows };
}

export {
  idbDateKey, idbPutRows, idbGetAllRows, idbGetMeta, idbSetMeta,
  idbClearAll, idbGetCoverage, coverageFromLoadedRows, withTimeout,
  idbQuickSessionCheck, loadDsFromIDB,
};
