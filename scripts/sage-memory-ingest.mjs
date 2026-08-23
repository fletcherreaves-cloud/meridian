#!/usr/bin/env node
// scripts/sage-memory-ingest.mjs
// Dispatch #80 — ingests the curated memory/ corpus slice into `sage_memory_kb` for SAGE's
// search_project_memory tool. Mirrors the qsrsoft_kb table-plus-tool pattern, chunked, with the
// source filename retained so SAGE can cite it.
//
// RUN DELIBERATELY. This is never wired to a GitHub Action or commit hook — a file becomes
// visible to SAGE only when someone runs this script by hand, which is the review gate the
// dispatch calls for ("shipping is the review gate").
//
// Candidate files: memory/{finding,reference,analysis,design}-*.md — the ~30-file first pass the
// dispatch specifies. CLAUDE.md and the dispatch-*.md files are never candidates (not matched by
// any of the four prefixes), and every candidate additionally requires a `sensitivity: open |
// restricted` frontmatter field set by a human — anything missing frontmatter, or carrying no
// recognized sensitivity value, is skipped (fail-closed), never classified by grepping keywords.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Run AFTER supabase/schema-sage-memory-kb.sql has been applied.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const MEMORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'memory');
const PREFIXES = ['finding-', 'reference-', 'analysis-', 'design-'];
const CHUNK_TARGET = 1400;
const CHUNK_MAX = 1800;

// Minimal hand-rolled frontmatter parser -- no new npm dependency for a one-time-per-run script.
// Reads only top-level `key: value` pairs (nested blocks like `metadata:`'s sub-keys are ignored;
// none of the fields ingestion needs -- name, description, sensitivity -- are ever nested).
export function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return { frontmatter: null, body: raw };
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return { frontmatter: null, body: raw };
  const fmBlock = raw.slice(4, end);
  const bodyStart = raw.indexOf('\n', end + 4);
  const body = bodyStart === -1 ? '' : raw.slice(bodyStart + 1);
  const frontmatter = {};
  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w-]*):\s?(.*)$/);
    if (!m) continue;
    frontmatter[m[1]] = m[2].trim();
  }
  return { frontmatter, body };
}

export function firstH1(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

// Paragraph-aware chunking -- accumulates blank-line-delimited paragraphs up to ~CHUNK_TARGET
// chars, never crossing CHUNK_MAX except for a single oversized paragraph, which is hard-split.
export function chunkText(body, target = CHUNK_TARGET, max = CHUNK_MAX) {
  const paras = body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > max) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur) chunks.push(cur);

  const final = [];
  for (const c of chunks) {
    if (c.length <= max) { final.push(c); continue; }
    for (let i = 0; i < c.length; i += max) final.push(c.slice(i, i + max));
  }
  return final.length ? final : [body.trim()].filter(Boolean);
}

async function main() {
  const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
  if (!supabase) {
    console.error('[sage-memory-ingest] Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const files = fs.readdirSync(MEMORY_DIR)
    .filter(f => f.endsWith('.md'))
    .filter(f => PREFIXES.some(p => f.startsWith(p)))
    .sort();

  console.log(`[sage-memory-ingest] ${files.length} candidate file(s) matching finding-/reference-/analysis-/design-`);

  let ingested = 0, skippedNoFrontmatter = 0, skippedInvalidSensitivity = 0, chunkTotal = 0, failed = 0;
  for (const f of files) {
    const raw = fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    if (!frontmatter) {
      console.warn(`[sage-memory-ingest] SKIP ${f} — no frontmatter (fail-closed)`);
      skippedNoFrontmatter++;
      continue;
    }
    const sensitivity = frontmatter.sensitivity;
    if (sensitivity !== 'open' && sensitivity !== 'restricted') {
      console.warn(`[sage-memory-ingest] SKIP ${f} — missing/invalid sensitivity: ${JSON.stringify(sensitivity)} (fail-closed)`);
      skippedInvalidSensitivity++;
      continue;
    }
    const title = frontmatter.name || firstH1(body) || f.replace(/\.md$/, '');
    const chunks = chunkText(body);
    const filename = `memory/${f}`;

    // Delete-then-reinsert per file (not upsert) — simplest correct way to also drop any
    // trailing chunks left over from a previous ingest of a file that has since shrunk.
    const { error: delErr } = await supabase.from('sage_memory_kb').delete().eq('filename', filename);
    if (delErr) {
      console.error(`[sage-memory-ingest] FAIL ${f} — delete-before-reinsert: ${delErr.message}`);
      failed++;
      continue;
    }

    const rows = chunks.map((chunk_text, chunk_index) => ({ filename, title, sensitivity, chunk_index, chunk_text }));
    const { error: insErr } = await supabase.from('sage_memory_kb').insert(rows);
    if (insErr) {
      console.error(`[sage-memory-ingest] FAIL ${f} — insert: ${insErr.message}`);
      failed++;
      continue;
    }

    console.log(`[sage-memory-ingest] OK ${f} — ${sensitivity}, ${chunks.length} chunk(s)`);
    ingested++;
    chunkTotal += chunks.length;
  }

  console.log(`[sage-memory-ingest] done — ${ingested} ingested, ${chunkTotal} chunk(s) total, `
    + `${skippedNoFrontmatter} skipped (no frontmatter), ${skippedInvalidSensitivity} skipped (invalid sensitivity), ${failed} failed`);
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[sage-memory-ingest]', e); process.exit(1); });
}
