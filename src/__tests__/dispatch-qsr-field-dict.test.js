// @ts-nocheck
// Tests for the QSRSoft field dictionaries (src/constants.js: QSR_DAR_FIELDS, QSR_FOB_FIELDS,
// QSR_EBOS_FIELDS) — the "field dictionary" backlog item (memory/project-backlog.md). The prior
// QSR_DAR_FIELDS shipped stale (named columns that don't exist on qsr_daily_activity at all,
// e.g. trans_cnt/healthy_cnt/avg_check/dt_pullforward/dt_greet/dt_menu/dt_payment/dt_cashier/
// dt_avgspeed) and was never imported anywhere — dead code nobody could have caught by reading
// the UI, only by diffing against the real pull script. So this test IS that diff, kept live: it
// re-derives each table's real column list straight from the pull script / schema.sql source of
// truth (not retyped by hand) and asserts the dictionary's keys are exactly that set. A future
// column rename in the pull script or schema.sql fails this test instead of silently drifting.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { QSR_DAR_FIELDS, QSR_FOB_FIELDS, QSR_EBOS_FIELDS, qsrFieldLabelMap } from '../constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function realDarColumns() {
  const src = fs.readFileSync(path.join(repoRoot, 'scripts/qsrsoft-dar-pull.mjs'), 'utf8');
  const start = src.indexOf('function mapRow');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  return [...body.matchAll(/^\s*([a-zA-Z_0-9]+):/gm)]
    .map(m => m[1])
    .filter(k => k !== 'updated_at'); // write-time metadata, not a reportable field
}

function realTableColumns(tableName) {
  const src = fs.readFileSync(path.join(repoRoot, 'supabase/schema.sql'), 'utf8');
  const start = src.indexOf(`create table if not exists public.${tableName}`);
  expect(start, `table ${tableName} not found in schema.sql`).toBeGreaterThan(-1);
  const end = src.indexOf(');', start);
  const body = src.slice(start, end);
  return [...body.matchAll(/^\s*([a-z_0-9]+)\s+(numeric|text|date)/gm)].map(m => m[1]);
}

describe('QSR_DAR_FIELDS matches the real qsr_daily_activity columns mapRow() writes', () => {
  it('has exactly the same key set as the pull script emits (no stale, no missing)', () => {
    const real = realDarColumns().sort();
    const mine = Object.keys(QSR_DAR_FIELDS).sort();
    expect(mine).toEqual(real);
  });

  it('every entry has a non-empty label and desc', () => {
    for (const [col, def] of Object.entries(QSR_DAR_FIELDS)) {
      expect(def.label, `${col}.label`).toBeTruthy();
      expect(def.desc, `${col}.desc`).toBeTruthy();
      expect(def.unit, `${col}.unit should be a string (possibly empty)`).toEqual(expect.any(String));
    }
  });
});

describe('QSR_FOB_FIELDS covers the real qsr_fob base columns (ly_ twins share the base entry)', () => {
  it('every non-ly_ column in schema.sql has a dictionary entry, and every entry is a real column', () => {
    const real = realTableColumns('qsr_fob');
    const realBase = real.filter(c => !c.startsWith('ly_'));
    expect(Object.keys(QSR_FOB_FIELDS).sort()).toEqual(realBase.sort());
    // Every ly_ column in the real schema has a same-named base column (the "identical metric,
    // last year" pairing this dict's header comment claims) — confirms the ly_ twins really are
    // twins, not a differently-shaped column that got silently skipped.
    const realLY = real.filter(c => c.startsWith('ly_'));
    for (const lyCol of realLY) {
      expect(realBase, `${lyCol} has no matching base column`).toContain(lyCol.slice('ly_'.length));
    }
  });

  it('every entry has a non-empty label and desc', () => {
    for (const [col, def] of Object.entries(QSR_FOB_FIELDS)) {
      expect(def.label, `${col}.label`).toBeTruthy();
      expect(def.desc, `${col}.desc`).toBeTruthy();
    }
  });
});

describe('QSR_EBOS_FIELDS matches the real qsr_ebos_daily columns exactly', () => {
  it('has exactly the same key set as schema.sql declares', () => {
    const real = realTableColumns('qsr_ebos_daily').sort();
    const mine = Object.keys(QSR_EBOS_FIELDS).sort();
    expect(mine).toEqual(real);
  });
});

describe('qsrFieldLabelMap', () => {
  it('reshapes a db_col-keyed dict into a label-keyed {label: desc} map', () => {
    const map = qsrFieldLabelMap(QSR_EBOS_FIELDS);
    expect(map['Store NSN']).toBe(QSR_EBOS_FIELDS.loc.desc);
    expect(map['Food Purchases']).toBe(QSR_EBOS_FIELDS.food_purchases.desc);
    expect(Object.keys(map)).toHaveLength(Object.keys(QSR_EBOS_FIELDS).length);
  });

  it('an empty dict maps to an empty object, not an error', () => {
    expect(qsrFieldLabelMap({})).toEqual({});
    expect(qsrFieldLabelMap(undefined)).toEqual({});
  });
});
