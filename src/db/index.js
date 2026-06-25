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

// Raw IDB reader — bypasses Dexie's open() overhead for reads.
// IMPORTANT: Dexie multiplies its version numbers by 10 internally.
// db.version(6) → IDB version 60. Must match or reads throw VersionError.
const _DB_VERSION = 60; // = Dexie version 6 × 10
const _ALL_STORES = {
  laborRows:'_rk', opsRows:'_rk', ctrlRows:'_rk', fobRows:'_rk',
  auditRows:'_rk', peaksRows:'_rk', darRows:'_rk', pmixRows:'_rk',
  weatherRows:'_rk', metadata:'_rk',
};
const _LOC_INDEX_STORES = ['laborRows','opsRows','ctrlRows','fobRows','auditRows','peaksRows','darRows','weatherRows'];

let _rawIDB = null;
let _rawIDBPromise = null;
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
        // Fresh install — create all stores
        for (const [name, key] of Object.entries(_ALL_STORES)) {
          if (!idb.objectStoreNames.contains(name)) idb.createObjectStore(name, {keyPath: key});
        }
      } else if (old === 50) {
        // IDB 50 = Dexie v5 — drop the unused loc secondary indexes
        for (const name of _LOC_INDEX_STORES) {
          try {
            const store = tx.objectStore(name);
            if ([...store.indexNames].includes('loc')) store.deleteIndex('loc');
          } catch(_) {}
        }
      }
      // old 40 (Dexie v4) or old 60 (already current): no schema changes needed
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
      const all = [];
      const tx = idb.transaction(storeName, 'readonly');
      // openCursor instead of getAll — getAll() deserializes all rows in one
      // synchronous 'message' handler which blocks the JS thread for 145s on
      // 41k-row stores. Cursor fires one tiny callback per row, no violations.
      const req = tx.objectStore(storeName).openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) { all.push(cursor.value); cursor.continue(); }
        else resolve(all);
      };
      req.onerror = e => reject(e.target.error);
      tx.onerror  = e => reject(e.target.error);
    });
    return rows.map(r => ({ ...r, date: r._d ? new Date(r._d + 'T00:00:00') : null }));
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
    await Promise.all(DATA_STORES.map(name =>
      new Promise(resolve => {
        try {
          let count = 0; let minD = null; let maxD = null;
          const tx  = idb.transaction(name, 'readonly');
          const req = tx.objectStore(name).openCursor();
          req.onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) {
              count++;
              const d = cursor.value._d;
              if (d) { if (!minD || d < minD) minD = d; if (!maxD || d > maxD) maxD = d; }
              cursor.continue();
            } else {
              cov[name] = count > 0 ? { count, from: minD || '?', to: maxD || '?' } : { count: 0 };
              resolve();
            }
          };
          req.onerror = () => { cov[name] = { count: 0, error: true }; resolve(); };
        } catch(e) { cov[name] = { count: 0, error: true }; resolve(); }
      })
    ));
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

// ── Blob storage ──────────────────────────────────────────────────────────
// Stores the entire dataset as a single JSON string in metadata._snapshot.
// Structured clone of a plain string is a memcopy (~50ms for 40MB) vs the
// 143-second per-field deserialization Chrome does for 41k complex IDB objects.
// JSON.parse of the resulting string takes ~500ms — total load < 1 second.

async function idbSaveBlob(ds) {
  if (!ds) return;
  try {
    const idb = await getRawIDB();
    const strip = r => { const { date, ...rest } = r; return rest; };
    const data = {
      v: 1,
      labor:   (ds.laborRows   || []).map(strip),
      ops:     (ds.opsRows     || []).map(strip),
      ctrl:    (ds.ctrlRows    || []).map(strip),
      fob:     (ds.fobRows     || []).map(strip),
      audit:   (ds.auditRows   || []).map(strip),
      peaks:   [...(ds.peaksSvcRows||[]),...(ds.peaksSalesRows||[])].map(strip),
      dar:     (ds.darRows     || []).map(strip),
      pmix:    ds.pmixData || {},
    };
    const json = JSON.stringify(data);
    await new Promise((resolve, reject) => {
      const tx = idb.transaction('metadata', 'readwrite');
      tx.objectStore('metadata').put({ _rk: '_snapshot', value: json });
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  } catch(e) { console.warn('IDB blob save failed:', e); }
}

async function idbLoadBlob() {
  try {
    const idb = await getRawIDB();
    const rec = await new Promise((resolve, reject) => {
      const tx = idb.transaction('metadata', 'readonly');
      const req = tx.objectStore('metadata').get('_snapshot');
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
    if (!rec?.value) return null;
    const data = JSON.parse(rec.value);
    if (!data || data.v !== 1) return null;
    const toRow = r => ({ ...r, date: r._d ? new Date(r._d + 'T00:00:00') : null });
    return {
      labor: (data.labor||[]).map(toRow), ops:  (data.ops||[]).map(toRow),
      ctrl:  (data.ctrl||[]).map(toRow),  fob:  (data.fob||[]).map(toRow),
      audit: (data.audit||[]).map(toRow), peaks:(data.peaks||[]).map(toRow),
      dar:   (data.dar||[]).map(toRow),   pmix: data.pmix||{},
    };
  } catch(e) { return null; }
}

async function loadDsFromIDB() {
  // Weather is small and updated independently — always read fresh via cursor
  const weatherRaw = await idbGetAllRows('weatherRows');
  const weather = weatherRaw.map(r => ({
    ...r,
    date: r._d ? new Date(r._d + 'T00:00:00') : r.date ? new Date(r.date) : null,
  }));

  // Fast path: single JSON string read from metadata (~500ms total)
  const blob = await idbLoadBlob();
  if (blob && blob.labor.length > 0) {
    return { labor:blob.labor, ops:blob.ops, ctrl:blob.ctrl, fob:blob.fob,
             audit:blob.audit, peaks:blob.peaks, dar:blob.dar, weather, pmix:blob.pmix };
  }

  // No blob yet — fall back to cursor reads (first run before any file upload)
  const [labor, ops, ctrl, fob, audit, peaks, dar] = await Promise.all([
    idbGetAllRows('laborRows'), idbGetAllRows('opsRows'), idbGetAllRows('ctrlRows'),
    idbGetAllRows('fobRows'),   idbGetAllRows('auditRows'), idbGetAllRows('peaksRows'),
    idbGetAllRows('darRows'),
  ]);
  // Auto-save blob so subsequent loads use the fast path — fire and forget
  if (labor.length > 0) {
    idbSaveBlob({ laborRows:labor, opsRows:ops, ctrlRows:ctrl, fobRows:fob,
                   auditRows:audit, peaksSvcRows:peaks, peaksSalesRows:[], darRows:dar,
                   pmixData:{} }).catch(()=>{});
  }
  return { labor, ops, ctrl, fob, audit, peaks, dar, weather, pmix: {} };
}

export {
  idbDateKey, idbPutRows, idbGetAllRows, idbGetMeta, idbSetMeta,
  idbClearAll, idbGetCoverage, coverageFromLoadedRows, withTimeout,
  idbQuickSessionCheck, loadDsFromIDB, idbSaveBlob,
};
