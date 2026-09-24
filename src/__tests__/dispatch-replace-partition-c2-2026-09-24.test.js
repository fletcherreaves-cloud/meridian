// @ts-nocheck
// scripts/_pipeline-contract.mjs's replacePartition (C2, backlog firing #6, 2026-09-24) --
// idempotent, paced delete-then-insert for one partition. plan-normalization-2026-08-17.md's
// own C2 brief: "today's backfill pushed ~2.6M upserts and took Supabase into Cloudflare 522s,
// collapsing three sibling workflows and the SQL Editor. Standard is delete-then-insert per
// date partition, paced." del/insertChunk are injected (same reasoning
// pipeline-contract.test.js already gives for logPartitionCoverage/checkFreshness's own
// injectable log/warn/now) so this is testable with zero live Supabase credentials.
import { describe, it, expect } from 'vitest';
import { replacePartition } from '../../scripts/_pipeline-contract.mjs';

const ok = () => Promise.resolve({ error: null });

describe('replacePartition', () => {
  it('deletes then inserts all rows in one chunk when under chunkSize', async () => {
    const calls = [];
    const del = () => { calls.push('delete'); return ok(); };
    const insertChunk = (chunk) => { calls.push(`insert:${chunk.length}`); return ok(); };
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const r = await replacePartition(rows, { del, insertChunk, chunkSize: 500, log: () => {} });
    expect(r).toEqual({ ok: true, inserted: 3 });
    expect(calls).toEqual(['delete', 'insert:3']);
  });

  it('chunks the insert into multiple calls when rows exceed chunkSize', async () => {
    const chunks = [];
    const del = () => ok();
    const insertChunk = (chunk) => { chunks.push(chunk.length); return ok(); };
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: i }));
    const r = await replacePartition(rows, { del, insertChunk, chunkSize: 5, log: () => {} });
    expect(r).toEqual({ ok: true, inserted: 12 });
    expect(chunks).toEqual([5, 5, 2]);
  });

  it('deletes but performs zero insert calls for an empty row set', async () => {
    const calls = [];
    const del = () => { calls.push('delete'); return ok(); };
    const insertChunk = (chunk) => { calls.push(`insert:${chunk.length}`); return ok(); };
    const r = await replacePartition([], { del, insertChunk, log: () => {} });
    expect(r).toEqual({ ok: true, inserted: 0 });
    expect(calls).toEqual(['delete']);
  });

  it('aborts before any insert when the delete fails (never partially replaces a partition)', async () => {
    const insertCalls = [];
    const del = () => Promise.resolve({ error: { message: 'permission denied' } });
    const insertChunk = (chunk) => { insertCalls.push(chunk); return ok(); };
    const r = await replacePartition([{ id: 1 }], { del, insertChunk, log: () => {} });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('delete');
    expect(r.inserted).toBe(0);
    expect(insertCalls.length).toBe(0);
  });

  it('stops after a failing chunk and reports how many rows of the new set actually landed', async () => {
    let call = 0;
    const del = () => ok();
    const insertChunk = () => {
      call++;
      if (call === 2) return Promise.resolve({ error: { message: 'permission denied' } });
      return ok();
    };
    const rows = Array.from({ length: 15 }, (_, i) => ({ id: i })); // 3 chunks of 5
    const r = await replacePartition(rows, { del, insertChunk, chunkSize: 5, log: () => {} });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('insert');
    expect(r.inserted).toBe(5); // only chunk 1 landed before chunk 2 failed
  });

  it('retries a transient delete failure via withRetry, then succeeds', async () => {
    let call = 0;
    const del = () => {
      call++;
      if (call === 1) return Promise.resolve({ error: { message: '503 Service Unavailable' } });
      return ok();
    };
    const insertChunk = () => ok();
    const r = await replacePartition([{ id: 1 }], {
      del, insertChunk, log: () => {}, retryOpts: { tries: 2, baseMs: 1 },
    });
    expect(r).toEqual({ ok: true, inserted: 1 });
    expect(call).toBe(2);
  });

  it('paces between chunks but not after the last one', async () => {
    const chunkCount = 3;
    const del = () => ok();
    const insertChunk = () => ok();
    const rows = Array.from({ length: chunkCount * 2 }, (_, i) => ({ id: i }));
    const start = Date.now();
    await replacePartition(rows, { del, insertChunk, chunkSize: 2, pacingMs: 30, log: () => {} });
    const elapsed = Date.now() - start;
    // 3 chunks -> 2 pacing gaps (never after the last chunk), so >= ~60ms, well under a slow-test
    // budget, and never (chunkCount)*pacingMs which would mean an unwanted trailing delay.
    expect(elapsed).toBeGreaterThanOrEqual(55);
  });

  it('throws if del or insertChunk is not a function, before doing anything', async () => {
    await expect(replacePartition([{ id: 1 }], { insertChunk: () => ok() })).rejects.toThrow();
    await expect(replacePartition([{ id: 1 }], { del: () => ok() })).rejects.toThrow();
  });

  it('logs a summary line via the injectable log, not console.log directly', async () => {
    const logged = [];
    await replacePartition([{ id: 1 }, { id: 2 }], { del: () => ok(), insertChunk: () => ok(), log: m => logged.push(m) });
    expect(logged.length).toBe(1);
    expect(logged[0]).toContain('2/2');
  });
});
