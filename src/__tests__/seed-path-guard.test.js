// @ts-nocheck
// scripts/lib/seed-path-guard.mjs — catches the exact 2026-10-19 incident: all four bulk-import
// scripts were run with the same env var name (GRADED_VISITS_SEED_PATH), which matches NONE of
// the four real names. See that module's own header for the full story.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { warnOnSeedPathMismatch } from '../../scripts/lib/seed-path-guard.mjs';

const SEED_VARS = ['ECOSURE_SEED_PATH', 'COMPLAINTS_SEED_PATH', 'GRADED_VISITS_BULK_SEED_PATH', 'PEAK_VISIT_DETAIL_SEED_PATH', 'GRADED_VISITS_SEED_PATH'];
let savedEnv;

beforeEach(() => {
  savedEnv = {};
  for (const k of SEED_VARS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of SEED_VARS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('warnOnSeedPathMismatch', () => {
  it('stays silent when no seed-path-shaped var is set at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnOnSeedPathMismatch('ECOSURE_SEED_PATH', '[import-ecosure-history]');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stays silent when this script’s own var is the one set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.ECOSURE_SEED_PATH = '/tmp/real-capture.json';
    warnOnSeedPathMismatch('ECOSURE_SEED_PATH', '[import-ecosure-history]');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns when a plausible-looking typo var is set but does not match any real name — the actual 2026-10-19 incident shape', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.GRADED_VISITS_SEED_PATH = '/tmp/graded-visits-bulk-seed.json'; // missing "_BULK"
    warnOnSeedPathMismatch('ECOSURE_SEED_PATH', '[import-ecosure-history]');
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0][0];
    expect(msg).toContain('GRADED_VISITS_SEED_PATH');
    expect(msg).toContain('ECOSURE_SEED_PATH');
    warn.mockRestore();
  });

  it('warns when a sibling script’s own real var is set instead', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.COMPLAINTS_SEED_PATH = '/tmp/complaints-seed.json';
    warnOnSeedPathMismatch('GRADED_VISITS_BULK_SEED_PATH', '[import-graded-visits-bulk]');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('COMPLAINTS_SEED_PATH');
    warn.mockRestore();
  });

  it('lists every mismatched var when more than one is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.COMPLAINTS_SEED_PATH = '/tmp/a.json';
    process.env.PEAK_VISIT_DETAIL_SEED_PATH = '/tmp/b.json';
    warnOnSeedPathMismatch('ECOSURE_SEED_PATH', '[import-ecosure-history]');
    const msg = warn.mock.calls[0][0];
    expect(msg).toContain('COMPLAINTS_SEED_PATH');
    expect(msg).toContain('PEAK_VISIT_DETAIL_SEED_PATH');
    warn.mockRestore();
  });

  it('ignores an unrelated env var that merely ends in PATH but not _SEED_PATH', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.SOME_OTHER_PATH = '/tmp/unrelated';
    warnOnSeedPathMismatch('ECOSURE_SEED_PATH', '[import-ecosure-history]');
    expect(warn).not.toHaveBeenCalled();
    delete process.env.SOME_OTHER_PATH;
    warn.mockRestore();
  });
});
