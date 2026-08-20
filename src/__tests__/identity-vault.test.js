// @ts-nocheck
// src/engine/identity-vault.js — the shared write-path helper (dispatch #37, Direction B).
// Mocks the supabase client's .rpc() rather than a live Supabase session, matching this repo's
// established pattern for fixture-testing anything gated behind live Postgres/RLS (dispatch
// #35/#36's own tests do the same for functions this sandbox can't call for real).
import { describe, it, expect, vi } from 'vitest';
import { getOrCreateToken, tokenizeRows } from '../engine/identity-vault.js';

function mockClient(impl) {
  return { rpc: vi.fn(impl) };
}

describe('getOrCreateToken()', () => {
  it('calls get_or_create_employee_token with the trimmed name and returns the token', async () => {
    const rpc = vi.fn(async (fn, args) => ({ data: 'tok-123', error: null }));
    const client = { rpc };
    const token = await getOrCreateToken(client, '  Aaden W  ');
    expect(token).toBe('tok-123');
    expect(rpc).toHaveBeenCalledWith('get_or_create_employee_token', { p_employee_name: 'Aaden W' });
  });

  it('returns null without calling rpc for an empty/whitespace name', async () => {
    const rpc = vi.fn();
    const token = await getOrCreateToken({ rpc }, '   ');
    expect(token).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns null (never throws) for a missing client', async () => {
    await expect(getOrCreateToken(null, 'Aaden W')).resolves.toBeNull();
  });

  it('returns null and does not throw when the RPC errors', async () => {
    const client = mockClient(async () => ({ data: null, error: { message: 'boom' } }));
    const token = await getOrCreateToken(client, 'Aaden W');
    expect(token).toBeNull();
  });
});

describe('tokenizeRows()', () => {
  it('calls the RPC exactly once per DISTINCT employee name, not once per row', async () => {
    const seen = [];
    const client = mockClient(async (fn, { p_employee_name }) => {
      seen.push(p_employee_name);
      return { data: `tok-${p_employee_name}`, error: null };
    });
    const rows = [
      { emp: 'Alice', date: '2026-08-01' },
      { emp: 'Alice', date: '2026-08-02' },
      { emp: 'Bob',   date: '2026-08-01' },
    ];
    const map = await tokenizeRows(client, rows, 'emp');
    expect(seen.sort()).toEqual(['Alice', 'Bob']);
    expect(map.get('Alice')).toBe('tok-Alice');
    expect(map.get('Bob')).toBe('tok-Bob');
    expect(map.size).toBe(2);
  });

  it('skips blank/missing names and never crashes on an empty row set', async () => {
    const client = mockClient(async () => ({ data: 'tok-x', error: null }));
    const map = await tokenizeRows(client, [{ emp: '' }, { emp: null }], 'emp');
    expect(map.size).toBe(0);
    await expect(tokenizeRows(client, [], 'emp')).resolves.toEqual(new Map());
  });
});
