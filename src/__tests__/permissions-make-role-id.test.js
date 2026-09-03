// @ts-nocheck
// permissions.js's makeRoleId had zero direct test coverage despite being live: called from
// src/views/admin.js to generate a unique id when an admin creates a new custom role.
import { describe, it, expect } from 'vitest';
import { makeRoleId } from '../engine/permissions.js';

describe('makeRoleId', () => {
  it('slugifies a simple label to lowercase underscore-separated words plus a random suffix', () => {
    expect(makeRoleId('District Ops Lead')).toMatch(/^district_ops_lead_[a-z0-9]{4}$/);
  });

  it('collapses runs of non-alphanumeric characters (including leading/trailing) into single underscores', () => {
    expect(makeRoleId('  Multi   Space!! ')).toMatch(/^multi_space_[a-z0-9]{4}$/);
  });

  it('never leaves a leading or trailing underscore before the suffix', () => {
    const id = makeRoleId('!!! Weird ***');
    expect(id.startsWith('_')).toBe(false);
    expect(id).toMatch(/^weird_[a-z0-9]{4}$/);
  });

  it('still appends a suffix for a label with no alphanumeric characters at all', () => {
    expect(makeRoleId('')).toMatch(/^_[a-z0-9]{4}$/);
    expect(makeRoleId('!!!')).toMatch(/^_[a-z0-9]{4}$/);
  });

  it('produces a different suffix across calls (not a fixed constant)', () => {
    const ids = new Set(Array.from({ length: 20 }, () => makeRoleId('same label')));
    expect(ids.size).toBeGreaterThan(1);
  });
});
