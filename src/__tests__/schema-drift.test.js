// @ts-nocheck
// ── Schema-drift guard — dispatch #52's rider ────────────────────────────────────────────────
// Found during #510's review: schema.sql's audit_rows was missing emp_id while the migration that
// added it (schema-audit-rows-emp-id.sql) went unnoticed, because nothing checked that the two
// files agreed. "Third instance of 'nothing checks that two files agree' in three days" per the
// dispatch. Building this test (2026-08-21) immediately found the class is much bigger than that
// one instance: 15 columns across 7 tables added by a standalone migration file were missing from
// schema.sql's own CREATE TABLE for that table -- including audit_rows.emp_token, the column the
// entire identity-reveal system is keyed on. All 15 are fixed in this same change; this test is
// what keeps the count at zero going forward.
//
// Scope: only tables schema.sql ITSELF defines via CREATE TABLE. Several tables (graded_visits,
// employee_identity_vault, org_events, security_findings, tasks, ...) live ONLY in their own
// schema-*.sql file by design -- schema.sql is not meant to be a complete from-scratch install on
// its own, just a consolidated baseline for the tables that made it in. A migration targeting a
// table schema.sql doesn't define is not this rider's concern (nothing to drift from).
// Also out of scope: dynamic ALTER TABLE via format('...', t) inside a PL/pgSQL loop
// (schema-multitenant-phase1.sql's tenant_id backfill) -- a static regex can't resolve the table
// name, and that loop's own literal follow-up ALTER for org_config IS checked normally.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SUPABASE_DIR = fileURLToPath(new URL('../../supabase', import.meta.url));

// `alter table [if exists] [public.]<table> add column [if not exists] <column> ...`
const ADD_COLUMN_RE = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi;

export function extractAddedColumns(sql) {
  const out = [];
  let m;
  ADD_COLUMN_RE.lastIndex = 0;
  while ((m = ADD_COLUMN_RE.exec(sql))) out.push({ table: m[1], column: m[2] });
  return out;
}

// Returns the column names declared in `table`'s own `create table` block in schemaSql, or null
// if schema.sql doesn't define that table at all (see the "out of scope" note above). Strips line
// comments BEFORE splitting on commas -- a naive split-on-comma glues a trailing "-- ..." comment
// onto the START of the next column's fragment, which then fails the leading-identifier match and
// silently drops that column. (This is exactly the bug the first draft of this test had, caught by
// this file's own "reproduces the real 2026-08-21 drift, fully" test below going red before the
// schema.sql fixes landed -- a parser bug here would have UNDER-reported real drift, the worst
// direction for a check like this to fail in.)
export function extractTableColumns(schemaSql, table) {
  const re = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?"?${table}"?\\s*\\(([\\s\\S]*?)\\)\\s*;`, 'i');
  const m = re.exec(schemaSql);
  if (!m) return null;
  const noComments = m[1].replace(/--[^\n]*/g, '');
  const lines = noComments.split(',').map(l => l.trim()).filter(Boolean);
  const cols = [];
  for (const line of lines) {
    const cm = /^"?(\w+)"?\s+/.exec(line);
    if (!cm) continue;
    if (['primary', 'foreign', 'unique', 'check', 'constraint'].includes(cm[1].toLowerCase())) continue;
    cols.push(cm[1]);
  }
  return cols;
}

// migrationFiles: [{name, content}]. Returns [{file, table, column}] for every ADD COLUMN whose
// target table exists in schema.sql but doesn't (yet) carry that column.
export function findSchemaDrift(schemaSql, migrationFiles) {
  const drift = [];
  for (const f of migrationFiles) {
    for (const { table, column } of extractAddedColumns(f.content)) {
      const cols = extractTableColumns(schemaSql, table);
      if (cols === null) continue; // table not in schema.sql -- out of scope, see header
      if (!cols.some(c => c.toLowerCase() === column.toLowerCase())) {
        drift.push({ file: f.name, table, column });
      }
    }
  }
  return drift;
}

describe('extractAddedColumns()', () => {
  it('parses table and column out of a real ADD COLUMN statement', () => {
    expect(extractAddedColumns("alter table public.audit_rows add column if not exists emp_id text;"))
      .toEqual([{ table: 'audit_rows', column: 'emp_id' }]);
  });
  it('ignores everything else in the file (ENABLE ROW LEVEL SECURITY, CREATE POLICY, comments)', () => {
    const sql = `
      -- some migration
      alter table public.foo enable row level security;
      create policy "foo: public read" on public.foo for select using (true);
      alter table public.foo add column if not exists bar text;
    `;
    expect(extractAddedColumns(sql)).toEqual([{ table: 'foo', column: 'bar' }]);
  });
});

describe('extractTableColumns()', () => {
  it('returns every column, including one after a trailing inline comment on the PRIOR column', () => {
    const sql = `
      create table if not exists public.widgets (
        id    uuid primary key,
        name  text,          -- the display name
        color text
      );
    `;
    expect(extractTableColumns(sql, 'widgets')).toEqual(['id', 'name', 'color']);
  });
  it('excludes table-level constraint lines (primary key, foreign key, ...)', () => {
    const sql = `
      create table if not exists public.widgets (
        loc  text,
        date date,
        primary key (loc, date)
      );
    `;
    expect(extractTableColumns(sql, 'widgets')).toEqual(['loc', 'date']);
  });
  it('returns null when schema.sql doesn\'t define the table at all', () => {
    expect(extractTableColumns('create table if not exists public.other (id uuid);', 'widgets')).toBe(null);
  });
});

describe('findSchemaDrift()', () => {
  it('flags a column added by a migration but missing from schema.sql\'s CREATE TABLE', () => {
    const schemaSql = 'create table if not exists public.audit_rows (loc text, date date);';
    const migrations = [{ name: 'add-emp-id.sql', content: 'alter table public.audit_rows add column if not exists emp_id text;' }];
    expect(findSchemaDrift(schemaSql, migrations)).toEqual([{ file: 'add-emp-id.sql', table: 'audit_rows', column: 'emp_id' }]);
  });
  it('is silent once the column IS present -- the mutation-test pair for the case above', () => {
    const schemaSql = 'create table if not exists public.audit_rows (loc text, date date, emp_id text);';
    const migrations = [{ name: 'add-emp-id.sql', content: 'alter table public.audit_rows add column if not exists emp_id text;' }];
    expect(findSchemaDrift(schemaSql, migrations)).toEqual([]);
  });
  it('is silent for a table schema.sql doesn\'t define at all (out of scope, not a false negative)', () => {
    const schemaSql = 'create table if not exists public.something_else (id uuid);';
    const migrations = [{ name: 'x.sql', content: 'alter table public.security_findings add column if not exists foo text;' }];
    expect(findSchemaDrift(schemaSql, migrations)).toEqual([]);
  });
});

// The actual enforcement: reads the real repo files. Mutation-tested by the two unit tests above
// (findSchemaDrift flags/clears the same emp_id case standalone) rather than by mutating the real
// file on disk -- CLAUDE.md's own dev rules never touch a file this sweep doesn't need to.
describe('supabase/*.sql — no column added by a migration is missing from schema.sql', () => {
  it('every ALTER TABLE ... ADD COLUMN in a migration file has a matching column in schema.sql\'s CREATE TABLE, for every table schema.sql defines', () => {
    const schemaSql = readFileSync(path.join(SUPABASE_DIR, 'schema.sql'), 'utf8');
    const migrationFiles = readdirSync(SUPABASE_DIR)
      .filter(f => f.endsWith('.sql') && f !== 'schema.sql')
      .map(name => ({ name, content: readFileSync(path.join(SUPABASE_DIR, name), 'utf8') }));
    const drift = findSchemaDrift(schemaSql, migrationFiles);
    expect(drift, drift.map(d => `${d.file}: ${d.table}.${d.column}`).join('\n')).toEqual([]);
  });

  it('reproduces the real 2026-08-21 drift, fully: audit_rows.emp_token, the identity-reveal system\'s own key column, was one of the 15', () => {
    // Not a hypothetical -- this exact column was missing from schema.sql until this dispatch,
    // despite schema-identity-vault.sql adding it and the entire reveal RPC family depending on it.
    const schemaSql = readFileSync(path.join(SUPABASE_DIR, 'schema.sql'), 'utf8');
    const cols = extractTableColumns(schemaSql, 'audit_rows');
    expect(cols).toContain('emp_token');
    expect(cols).toContain('emp_id'); // the original #510 instance -- stays fixed
  });
});
