// @ts-nocheck
// Guard: the LifeLenz schedule table is `lifelenz_schedule` (SINGULAR).
//
// Three live call sites shipped the plural `lifelenz_schedules`, which does not exist.
// PostgREST answers a query against it with 404 / PGRST205 and the hint
// "Perhaps you meant the table 'public.lifelenz_schedule'". Found on 2026-08-23 when
// SAGE was asked which stores to visit and its labor tool returned a database error.
//
// Why a repo-wide scan and not three unit tests: the bug is a NAME, and the three sites
// had nothing else in common (a Deno edge function, a React panel's freshness query, and
// a provenance metadata map). A test per site would not have caught the fourth. This
// catches drift anywhere, including in a file that does not exist yet.
//
// Scans CODE POSITIONS only -- `.from('...')` and `table: '...'`. Prose, comments and
// changelog entries legitimately name the old spelling when describing the outages, and
// must not fail the suite.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['src', 'supabase/functions', 'scripts'];
const EXT = /\.(js|jsx|ts|tsx|mjs)$/;

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(rel, out);
    } else if (EXT.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

// `.from('x')` / `.from("x")` and `table: 'x'` -- the two ways a table name is used as a
// value in this repo.
const CODE_POSITION = /(?:\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)|table:\s*['"]([a-z0-9_]+)['"])/g;

describe('LifeLenz schedule table name', () => {
  const files = DIRS.flatMap(d => walk(d));

  it('scans a non-trivial number of source files', () => {
    // Guards the guard: a broken walk() would make every assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(50);
  });

  it('never references the non-existent plural `lifelenz_schedules` in a code position', () => {
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(CODE_POSITION)) {
          const name = m[1] || m[2];
          if (name === 'lifelenz_schedules') {
            offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 120)}`);
          }
        }
      });
    }
    expect(offenders, `Use 'lifelenz_schedule' (singular).\n${offenders.join('\n')}`).toEqual([]);
  });

  it('still references the correct singular name somewhere', () => {
    // Otherwise the test above passes trivially if every LifeLenz read were deleted.
    const hit = files.some(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return /\.from\(\s*['"]lifelenz_schedule['"]\s*\)/.test(src);
    });
    expect(hit).toBe(true);
  });
});
