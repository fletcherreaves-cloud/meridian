// @ts-nocheck
// fake-indexeddb/auto MUST be imported before db/index.js so the fake IDB
// globals are in place before Dexie runs `new Dexie('MeridianDB')`.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  idbPutRows,
  idbGetAllRows,
  idbGetMeta,
  idbSetMeta,
  idbClearAll,
} from '../db/index.js';

beforeEach(async () => {
  await idbClearAll();
});

// ── idbPutRows / idbGetAllRows ────────────────────────────────────────────────

describe('idbPutRows + idbGetAllRows round-trip', () => {
  it('stores and retrieves a single row', async () => {
    await idbPutRows('laborRows', [{ loc: '3708', date: new Date('2025-06-01'), sales: 12345 }]);
    const rows = await idbGetAllRows('laborRows');
    expect(rows).toHaveLength(1);
    expect(rows[0].loc).toBe('3708');
    expect(rows[0].sales).toBe(12345);
  });

  it('reconstructs date as a Date object', async () => {
    await idbPutRows('laborRows', [{ loc: '3708', date: new Date('2025-06-01'), sales: 999 }]);
    const rows = await idbGetAllRows('laborRows');
    expect(rows[0].date).toBeInstanceOf(Date);
  });

  it('stores multiple rows in one call', async () => {
    const batch = [
      { loc: '3708', date: new Date('2025-06-01'), sales: 100 },
      { loc: '3708', date: new Date('2025-06-02'), sales: 200 },
      { loc: '6972', date: new Date('2025-06-01'), sales: 300 },
    ];
    await idbPutRows('laborRows', batch);
    const rows = await idbGetAllRows('laborRows');
    expect(rows).toHaveLength(3);
  });

  it('upserts on duplicate key (same loc+date)', async () => {
    await idbPutRows('laborRows', [{ loc: '3708', date: new Date('2025-06-01'), sales: 100 }]);
    await idbPutRows('laborRows', [{ loc: '3708', date: new Date('2025-06-01'), sales: 999 }]);
    const rows = await idbGetAllRows('laborRows');
    expect(rows).toHaveLength(1);
    expect(rows[0].sales).toBe(999);
  });

  it('returns empty array when store is empty', async () => {
    const rows = await idbGetAllRows('laborRows');
    expect(rows).toHaveLength(0);
  });

  it('no-ops gracefully when rows array is empty', async () => {
    await idbPutRows('laborRows', []);
    const rows = await idbGetAllRows('laborRows');
    expect(rows).toHaveLength(0);
  });

  it('no-ops gracefully when rows is null/undefined', async () => {
    await idbPutRows('laborRows', null);
    await idbPutRows('laborRows', undefined);
    const rows = await idbGetAllRows('laborRows');
    expect(rows).toHaveLength(0);
  });

  it('works with non-labor stores', async () => {
    await idbPutRows('opsRows', [{ loc: '3708', date: new Date('2025-06-01'), oepe: 142 }]);
    const rows = await idbGetAllRows('opsRows');
    expect(rows).toHaveLength(1);
    expect(rows[0].oepe).toBe(142);
  });

  it('idbClearAll wipes all rows from the store', async () => {
    await idbPutRows('laborRows', [{ loc: '3708', date: new Date('2025-06-01'), sales: 500 }]);
    await idbClearAll();
    const rows = await idbGetAllRows('laborRows');
    expect(rows).toHaveLength(0);
  });
});

// ── idbGetMeta / idbSetMeta ───────────────────────────────────────────────────

describe('idbSetMeta + idbGetMeta round-trip', () => {
  it('returns null for a key that was never set', async () => {
    const result = await idbGetMeta('nonexistent-key');
    expect(result).toBeNull();
  });

  it('stores and retrieves a string value', async () => {
    await idbSetMeta('testKey', 'hello world');
    const result = await idbGetMeta('testKey');
    expect(result).not.toBeNull();
    expect(result.value).toBe('hello world');
  });

  it('stores and retrieves a JSON-serializable object', async () => {
    const payload = { lyW: 0.85, t2: 0.3, t4: 0.4, t6: 0.3, mape: 6.5 };
    await idbSetMeta('calibration_3708', payload);
    const result = await idbGetMeta('calibration_3708');
    expect(result.value).toEqual(payload);
  });

  it('stores and retrieves a number value', async () => {
    await idbSetMeta('lastSync', 1234567890);
    const result = await idbGetMeta('lastSync');
    expect(result.value).toBe(1234567890);
  });

  it('overwrites an existing meta key', async () => {
    await idbSetMeta('myKey', 'first');
    await idbSetMeta('myKey', 'second');
    const result = await idbGetMeta('myKey');
    expect(result.value).toBe('second');
  });

  it('meta is cleared by idbClearAll', async () => {
    await idbSetMeta('persistentKey', 'data');
    await idbClearAll();
    const result = await idbGetMeta('persistentKey');
    expect(result).toBeNull();
  });

  it('stores a timestamp alongside the value', async () => {
    await idbSetMeta('tsKey', 42);
    const result = await idbGetMeta('tsKey');
    expect(typeof result.ts).toBe('number');
    expect(result.ts).toBeGreaterThan(0);
  });

  it('keeps metadata isolated from row stores', async () => {
    await idbSetMeta('onlyMeta', 'yes');
    const rows = await idbGetAllRows('laborRows');
    expect(rows).toHaveLength(0);
  });
});
