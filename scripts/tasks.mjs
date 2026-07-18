#!/usr/bin/env node
// scripts/tasks.mjs — Task Queue CLI for Claude Code (companion to features.mjs)
//
// Commands:
//   node scripts/tasks.mjs list [--status=ready] [--tier=1] [--priority=1]
//   node scripts/tasks.mjs add --title="..." [--description="..."] [--tier=2] [--priority=2] [--status=backlog] [--notes="..."]
//   node scripts/tasks.mjs update <id> --status=in_progress [--notes="..."] [--tier=1] [--priority=1]
//   node scripts/tasks.mjs notes            — list unconsumed AI session notes
//
// Reads .env.local for VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or anon key for reads).
// Tables: `tasks` and `session_notes` (see scripts/seed-tasks.sql).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// Load .env.local
try {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY;
const ACTIVE_KEY   = SERVICE_KEY || ANON_KEY;

if (!SUPABASE_URL || !ACTIVE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env.local');
  process.exit(1);
}
if (!SERVICE_KEY) console.warn('Note: using anon key — writes may fail if RLS blocks anon inserts.\n');

const sb = createClient(SUPABASE_URL, ACTIVE_KEY);

// ── helpers ──────────────────────────────────────────────────────────────────
const parseArgs = (argv) => {
  const flags = {}; const pos = [];
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([a-zA-Z_]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
    else if (arg.startsWith('--')) flags[arg.slice(2)] = true;
    else pos.push(arg);
  }
  return { cmd: pos[0], id: pos[1], flags };
};

const TIER_LBL = { 1: 'T1·auto', 2: 'T2·PR', 3: 'T3·human' };
const PRI_LBL  = { 1: 'P1·high', 2: 'P2·med', 3: 'P3·low' };
const fmt = (r) =>
  `[${r.id || '—'}] ${(r.status||'').padEnd(12)} | ${(TIER_LBL[r.tier]||'').padEnd(8)} | ${(PRI_LBL[r.priority]||'').padEnd(7)} | ${r.title}`;

// ── commands ─────────────────────────────────────────────────────────────────
async function cmdList(flags) {
  let q = sb.from('tasks').select('*')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });
  if (flags.status)   q = q.eq('status', flags.status);
  if (flags.tier)     q = q.eq('tier', Number(flags.tier));
  if (flags.priority) q = q.eq('priority', Number(flags.priority));
  const { data, error } = await q;
  if (error) { console.error(error.message); process.exit(1); }
  if (!data.length) { console.log('No tasks found.'); return; }
  console.log(`\n${data.length} task(s):\n`);
  for (const r of data) {
    console.log(fmt(r));
    if (flags.verbose && r.description) console.log('    ' + r.description);
    if (flags.verbose && r.notes)       console.log('    notes: ' + r.notes);
  }
  console.log();
}

async function cmdAdd(flags) {
  if (!flags.title) { console.error('--title is required'); process.exit(1); }
  const rec = {
    title:       flags.title,
    description: flags.description || null,
    notes:       flags.notes       || null,
    tier:        flags.tier ? Number(flags.tier) : 2,
    priority:    flags.priority ? Number(flags.priority) : 2,
    status:      flags.status || 'backlog',
  };
  const { data, error } = await sb.from('tasks').insert([rec]).select().single();
  if (error) { console.error('Insert failed:', error.message); process.exit(1); }
  console.log('\nCreated:', fmt(data));
}

async function cmdUpdate(id, flags) {
  if (!id) { console.error('Provide task id as second positional argument'); process.exit(1); }
  const updates = { updated_at: new Date().toISOString() };
  if (flags.status)              updates.status      = flags.status;
  if (flags.tier)                updates.tier        = Number(flags.tier);
  if (flags.priority)            updates.priority    = Number(flags.priority);
  if (flags.notes !== undefined) updates.notes       = flags.notes;
  if (flags.description)         updates.description = flags.description;
  const { data, error } = await sb.from('tasks').update(updates).eq('id', id).select().single();
  if (error) { console.error('Update failed:', error.message); process.exit(1); }
  console.log('\nUpdated:', fmt(data));
}

async function cmdNotes() {
  const { data, error } = await sb.from('session_notes').select('*')
    .eq('consumed', false).order('created_at', { ascending: false });
  if (error) { console.error(error.message); process.exit(1); }
  if (!data || !data.length) { console.log('No unconsumed session notes.'); return; }
  console.log(`\n${data.length} unconsumed session note(s):\n`);
  for (const n of data) console.log(`[${n.id || '—'}] ${n.created_at?.slice(0,10) || ''} — ${n.note || n.body || ''}`);
  console.log();
}

// ── dispatch ─────────────────────────────────────────────────────────────────
const { cmd, id, flags } = parseArgs(process.argv);
switch (cmd) {
  case 'list':   await cmdList(flags); break;
  case 'add':    await cmdAdd(flags); break;
  case 'update': await cmdUpdate(id, flags); break;
  case 'notes':  await cmdNotes(); break;
  default:
    console.log('Usage: node scripts/tasks.mjs <list|add|update|notes> [flags]');
    console.log('  list   [--status=] [--tier=] [--priority=] [--verbose]');
    console.log('  add    --title= [--description=] [--tier=] [--priority=] [--status=] [--notes=]');
    console.log('  update <id> [--status=] [--tier=] [--priority=] [--notes=]');
    console.log('  notes  (unconsumed AI session notes)');
}
