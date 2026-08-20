// @ts-nocheck
// src/parsers/index.js holds its OWN module-level `let XLSX = null`, populated only when a caller
// awaits ensureParsersXLSXReady(). In the browser App.js's handleFiles does that. A Node script
// that imports a parser and skips it gets `Cannot read properties of null (reading 'utils')` on the
// first sheet_to_json -- and, because each file is parsed inside a try/catch, that surfaces as a
// per-file warning rather than a crash.
//
// That is not hypothetical: scripts/qsrsoft-email-parse.mjs did exactly this from 2026-08-13
// (v5.006/#248, 2026-08-12, moved XLSX behind a lazy loader for the entry-chunk budget) to
// 2026-08-20 -- eight days. All three
// emailed streams -- sales_ledger_daily, daily_glimpse_daily, cash_sheet_daily -- went stale while
// the workflow reported SUCCESS on 15-of-15 failures. Found only because a per-stream freshness
// banner surfaced it in the UI.
//
// Importing its own `xlsx` package does NOT satisfy the contract: that binding is local to the
// importing file, while the parsers keep a separate handle. This asserts the contract statically
// across every script, so the next Node consumer of these parsers cannot reintroduce it.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '../../scripts');

// Parser exports whose implementations reach XLSX.utils.* -- importing any of these obliges the
// caller to await ensureParsersXLSXReady() first.
const XLSX_BACKED = [
  'parseSalesLedger', 'parseDailyGlimpse', 'parseCashSheet', 'parsePMixData',
  'parseSMGFullScale', 'parseYearlyTargets', 'parseProjectionsFile', 'sniffSheetType',
];

function scriptsImportingParsers() {
  return readdirSync(SCRIPTS)
    .filter(f => f.endsWith('.mjs') || f.endsWith('.js'))
    .map(f => ({ file: f, src: readFileSync(join(SCRIPTS, f), 'utf8') }))
    .filter(({ src }) => /from\s+['"][^'"]*parsers\/index\.js['"]/.test(src))
    .filter(({ src }) => XLSX_BACKED.some(fn => new RegExp(`\\b${fn}\\b`).test(src)));
}

describe('Node scripts using src/parsers must initialise the parsers\' lazy XLSX handle', () => {
  const consumers = scriptsImportingParsers();

  it('finds at least one such script (guard against the detector silently matching nothing)', () => {
    expect(consumers.length).toBeGreaterThan(0);
  });

  it.each(consumers.map(c => c.file))('%s awaits ensureParsersXLSXReady()', (file) => {
    const src = consumers.find(c => c.file === file).src;
    expect(src).toMatch(/ensureParsersXLSXReady/);
    // Must be awaited, not merely imported -- importing it does nothing on its own.
    expect(src).toMatch(/await\s+ensureParsersXLSXReady\s*\(/);
  });
});
