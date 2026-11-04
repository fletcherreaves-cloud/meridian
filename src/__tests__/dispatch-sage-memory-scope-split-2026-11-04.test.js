// @ts-nocheck
// Owner-approved 2026-11-04: applying the product/tenant knowledge-scope split
// (memory/plan-knowledge-backbone-2026-11-03.md §3) on top of the 2026-11-03 tenant_id
// hardening. Covers the one new pure function this adds (resolveScope, scripts/sage-memory-
// ingest.mjs) -- the actual query-widening in sage-chat/index.ts has no automated test, same
// established limitation dispatch-229/the earlier tenant_id fix both noted: no Deno harness in
// this repo to boot the edge function itself (see src/__tests__/sage-memory-kb.test.js's own
// header). Verified there by direct code review instead.
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, resolveScope } from '../../scripts/sage-memory-ingest.mjs';

describe('resolveScope() -- product/tenant knowledge classification (2026-11-04)', () => {
  it('defaults to "tenant" (the safe/private direction) when no scope frontmatter is present', () => {
    expect(resolveScope({})).toBe('tenant');
    expect(resolveScope(null)).toBe('tenant');
    expect(resolveScope(undefined)).toBe('tenant');
  });

  it('defaults to "tenant" for an unrecognized value, same fail-closed direction -- never crashes or passes the raw value through', () => {
    expect(resolveScope({ scope: 'public' })).toBe('tenant');
    expect(resolveScope({ scope: '' })).toBe('tenant');
    expect(resolveScope({ scope: 'TENANT' })).toBe('tenant'); // case-sensitive, not normalized
  });

  it('honors an explicit scope: product tag', () => {
    expect(resolveScope({ scope: 'product' })).toBe('product');
  });

  it('is unaffected by other frontmatter fields (sensitivity, name) sitting alongside it', () => {
    expect(resolveScope({ sensitivity: 'open', name: 'Some Finding', scope: 'product' })).toBe('product');
    expect(resolveScope({ sensitivity: 'restricted', name: 'Some Finding' })).toBe('tenant');
  });

  it('round-trips through parseFrontmatter -- a real file with a scope: line resolves correctly end to end', () => {
    const raw = '---\nname: Example\nsensitivity: open\nscope: product\n---\n# Example\n\nBody text.\n';
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.scope).toBe('product');
    expect(resolveScope(frontmatter)).toBe('product');
  });

  it('a file with no scope: line at all (the entire pre-2026-11-04 corpus) still parses and defaults correctly, not skipped', () => {
    const raw = '---\nname: Example\nsensitivity: open\n---\n# Example\n\nBody text.\n';
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.scope).toBeUndefined();
    expect(resolveScope(frontmatter)).toBe('tenant');
  });
});
