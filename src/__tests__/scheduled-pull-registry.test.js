// @ts-nocheck
// Dispatch #210 -- guards scripts/lib/scheduled-pull-registry.mjs against drifting apart
// from src/engine/stream-freshness.js's STREAMS (the actual source of truth for which
// streams are critical). Same shape as sync-failure-watch.test.js's own two-directional
// guard: every STREAMS key must have a registry entry, and every registry entry must
// point at a real workflow file, or the watchdog silently covers the wrong set.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { STREAMS } from '../engine/stream-freshness.js';
import { PULL_REGISTRY } from '../../scripts/lib/scheduled-pull-registry.mjs';

describe('scheduled-pull-registry.mjs stays in step with stream-freshness.js STREAMS', () => {
  it('every STREAMS key has a registry entry', () => {
    const missing = STREAMS.map(s => s.key).filter(k => !(k in PULL_REGISTRY));
    expect(missing,
      'STREAMS has a key with no scheduled-pull-registry.mjs entry -- the watchdog would ' +
      'silently skip checking it. Add a { table, dateCol, workflowFile } entry.',
    ).toEqual([]);
  });

  it('the registry lists no key that is not in STREAMS (no phantom coverage)', () => {
    const phantom = Object.keys(PULL_REGISTRY).filter(k => !STREAMS.some(s => s.key === k));
    expect(phantom,
      'scheduled-pull-registry.mjs has an entry for a key STREAMS does not carry -- either ' +
      'STREAMS dropped a stream (remove the registry entry too) or this is a typo.',
    ).toEqual([]);
  });

  it('every registry entry names a real workflow file', () => {
    const DIR = join(process.cwd(), '.github', 'workflows');
    const missing = Object.entries(PULL_REGISTRY)
      .filter(([, v]) => !existsSync(join(DIR, v.workflowFile)))
      .map(([k, v]) => `${k} -> ${v.workflowFile}`);
    expect(missing,
      'A PULL_REGISTRY entry names a workflow file that does not exist -- the watchdog\'s ' +
      'workflow_dispatch retrigger would 404.',
    ).toEqual([]);
  });

  it('every registry entry has table/dateCol/workflowFile', () => {
    const bad = Object.entries(PULL_REGISTRY)
      .filter(([, v]) => !v.table || !v.dateCol || !v.workflowFile)
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('sanity: finds a non-trivial number of streams (guards against a broken import)', () => {
    expect(STREAMS.length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(PULL_REGISTRY).length).toBe(STREAMS.length);
  });

  // QSRSoft Operator Security Notice compliance pause (2026-11-16) -- STREAMS' `paused` flag
  // is the one scheduled-pull-watchdog.mjs's checkStream() actually reads, but
  // PULL_REGISTRY mirrors it too (see that file's own comment), and the two must never
  // disagree -- a key paused in one file but not the other means either the watchdog still
  // retriggers a workflow the owner deliberately silenced, or a live stream is wrongly
  // hidden as paused. See memory/finding-qsrsoft-security-notice-2026-11-16.md.
  it('every STREAMS/PULL_REGISTRY pair agrees on `paused`', () => {
    const disagreements = STREAMS
      .filter(s => Boolean(s.paused) !== Boolean(PULL_REGISTRY[s.key]?.paused))
      .map(s => `${s.key}: STREAMS.paused=${Boolean(s.paused)} vs PULL_REGISTRY.paused=${Boolean(PULL_REGISTRY[s.key]?.paused)}`);
    expect(disagreements).toEqual([]);
  });
});
