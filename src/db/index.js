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
// v6: drop the loc secondary indexes — never used in queries (all filtering is
// in-memory), and Chrome's IDB engine spends ~142s loading index B-trees on
// cold open of a 123k-record database.
db.version(6).stores({
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

// Opens the raw IDBDatabase without going through Dexie — avoids Dexie v4's
// initialization overhead which blocks the message handler for ~146s on large DBs.
// Also upgrades from v5→v6 via raw IDB to drop the unused loc secondary indexes,
// which Chrome's IDB engine was spending ~142s loading from disk on every cold open.
// Closes gracefully on versionchange so any further Dexie upgrades can proceed.
const _DB_VERSION = 6;
const _ALL_STORES = {
  laborRows:'_rk', opsRows:'_rk', ctrlRows:'_rk', fobRows:'_rk',
  auditRows:'_rk', peaksRows:'_rk', darRows:'_rk', pmixRows:'_rk',
  weatherRows:'_rk', metadata:'_rk',
};
const _LOC_INDEX_STORES = ['laborRows','opsRows','ctrlRows','fobRows','auditRows','peaksRows','darRows','weatherRows'];

let _rawIDB = null;
let _rawIDBPromise = null; // cached so concurrent callers share one open() request
function getRawIDB() {
  if (_rawIDB) return Promise.resolve(_rawIDB);
  if (_rawIDBPromise) return _rawIDBPromise;
  _rawIDBPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('MeridianDB', _DB_VERSION);
    req.onupgradeneeded = e => {
      const idb = e.target.result;
      const tx  = e.target.transaction;
      const old = e.oldVersion;
      if (old === 0) {
        for (const [name, key] of Object.entries(_ALL_STORES)) {
          if (!idb.objectStoreNames.contains(name)) idb.createObjectStore(name, {keyPath: key});
        }
      } else if (old === 5) {
        for (const name of _LOC_INDEX_STORES) {
          try {
            const store = tx.objectStore(name);
            if ([...store.indexNames].includes('loc')) store.deleteIndex('loc');
          } catch(_) {}
        }
      }
    };
    req.onsuccess = e => {
      _rawIDB = e.target.result;
      _rawIDB.onversionchange = () => { _rawIDB.close(); _rawIDB = null; _rawIDBPromise = null; };
      resolve(_rawIDB);
    };
    req.onerror = e => { _rawIDB = null; _rawIDBPromise = null; reject(e.target.error); };
  });
  return _rawIDBPromise;
}

async function idbGetAllRows(storeName) {
  try {
    const idb = await getRawIDB();
    const rows = await new Promise((resolve, reject) => {
      const tx = idb.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = e => resolve(e.target.result || []);
      req.onerror  = e => reject(e.target.error);
    });
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
  try {
    const idb = await getRawIDB();
    for (const name of DATA_STORES) {
      try {
        const rows = await new Promise((resolve, reject) => {
          const tx  = idb.transaction(name, 'readonly');
          const req = tx.objectStore(name).getAll();
          req.onsuccess = e => resolve(e.target.result || []);
          req.onerror   = e => reject(e.target.error);
        });
        if (rows.length > 0) {
          const dates = rows.map(r => r._d).filter(Boolean).sort();
          cov[name] = { count: rows.length, from: dates[0] || '?', to: dates[dates.length - 1] || '?' };
        } else {
          cov[name] = { count: 0 };
        }
      } catch (e) { cov[name] = { count: 0, error: true }; }
    }
  } catch (e) {}
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
    const idb = await getRawIDB();
    const cnt = await new Promise((resolve, reject) => {
      const tx = idb.transaction('laborRows', 'readonly');
      const req = tx.objectStore('laborRows').count();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
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
