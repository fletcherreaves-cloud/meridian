#!/usr/bin/env node
// scripts/features.mjs — Feature Requests CLI for Claude Code
//
// Commands:
//   node scripts/features.mjs list [--status=planned] [--category=AI]
//   node scripts/features.mjs add --title="..." [--description="..."] [--status=idea] [--priority=medium] [--category=General]
//   node scripts/features.mjs update <id> --status=in-progress [--dev_notes="..."] [--completed_version=v4.370]
//   node scripts/features.mjs sync-memory   — rewrites memory/feature-requests.md from live DB
//
// Reads .env.local for VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or falls back to anon key for reads)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
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

if (!SERVICE_KEY) console.warn('Note: using anon key — writes may fail if RLS blocks anon inserts. Set SUPABASE_SERVICE_ROLE_KEY for full access.\n');

const sb = createClient(SUPABASE_URL, ACTIVE_KEY);

// ── helpers ──────────────────────────────────────────────────────────────────
const parseArgs = (argv) => {
  const flags = {};
  const pos   = [];
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([a-zA-Z_]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
    else if (arg.startsWith('--')) flags[arg.slice(2)] = true;
    else pos.push(arg);
  }
  return { cmd: pos[0], id: pos[1], flags };
};

const fmt = (r) =>
  `[${r.id || r.seed_id || '—'}] ${r.status?.padEnd(12)} | ${(r.priority||'').padEnd(6)} | ${(r.category||'').padEnd(12)} | ${r.title}`;

// ── commands ─────────────────────────────────────────────────────────────────
async function cmdList(flags) {
  let q = sb.from('feature_requests').select('*').order('created_at', { ascending: false });
  if (flags.status)   q = q.eq('status', flags.status);
  if (flags.category) q = q.eq('category', flags.category);
  if (flags.priority) q = q.eq('priority', flags.priority);
  const { data, error } = await q;
  if (error) { console.error(error.message); process.exit(1); }
  if (!data.length) { console.log('No records found.'); return; }
  console.log(`\n${data.length} feature request(s):\n`);
  for (const r of data) console.log(fmt(r));
  console.log();
}

async function cmdAdd(flags) {
  if (!flags.title) { console.error('--title is required'); process.exit(1); }
  const rec = {
    title:        flags.title,
    description:  flags.description || null,
    category:     flags.category   || 'General',
    priority:     flags.priority   || 'medium',
    status:       flags.status     || 'idea',
    submitted_by: flags.submitted_by || 'Claude Code',
    votes:        0,
    is_seed:      false,
  };
  const { data, error } = await sb.from('feature_requests').insert([rec]).select().single();
  if (error) { console.error('Insert failed:', error.message); process.exit(1); }
  console.log('\nCreated:', fmt(data));
}

async function cmdUpdate(id, flags) {
  if (!id) { console.error('Provide record id as second positional argument'); process.exit(1); }
  const updates = { updated_at: new Date().toISOString() };
  if (flags.status)            updates.status            = flags.status;
  if (flags.priority)          updates.priority          = flags.priority;
  if (flags.category)          updates.category          = flags.category;
  if (flags.dev_notes !== undefined) updates.dev_notes   = flags.dev_notes;
  if (flags.completed_version) updates.completed_version = flags.completed_version;
  if (flags.description)       updates.description       = flags.description;
  const { data, error } = await sb.from('feature_requests').update(updates).eq('id', id).select().single();
  if (error) { console.error('Update failed:', error.message); process.exit(1); }
  console.log('\nUpdated:', fmt(data));
}

async function cmdSyncMemory() {
  const { data, error } = await sb.from('feature_requests')
    .select('*').order('status').order('created_at', { ascending: false });
  if (error) { console.error(error.message); process.exit(1); }

  const STATUS_ORDER = ['in-progress','planned','idea','completed','declined'];
  const grouped = {};
  for (const s of STATUS_ORDER) grouped[s] = [];
  for (const r of data) (grouped[r.status] || grouped['idea']).push(r);

  const lines = [
    '---',
    'name: feature-requests',
    'description: Live snapshot of feature_requests Supabase table — updated by scripts/features.mjs sync-memory',
    'metadata:',
    '  type: project',
    '---',
    '',
    `> Snapshot generated ${new Date().toISOString().slice(0,10)} from ${data.length} DB records.`,
    `> Run \`node scripts/features.mjs sync-memory\` to refresh.`,
    `> Run \`node scripts/features.mjs add --title="..." --status=idea --priority=medium\` to add.`,
    `> Run \`node scripts/features.mjs update <id> --status=in-progress\` to update.`,
    '',
  ];

  for (const status of STATUS_ORDER) {
    const items = grouped[status];
    if (!items.length) continue;
    lines.push(`## ${status.charAt(0).toUpperCase()+status.slice(1).replace('-',' ')}`);
    for (const r of items) {
      lines.push(`- **[${r.id}]** ${r.title} | ${r.category} | ${r.priority} | by ${r.submitted_by||'Anon'}`);
      if (r.description) lines.push(`  ${r.description}`);
      if (r.dev_notes)   lines.push(`  _Dev: ${r.dev_notes}_`);
      if (r.completed_version) lines.push(`  ✅ ${r.completed_version}`);
    }
    lines.push('');
  }

  // Write to Claude Code's project memory folder (read by Claude at session start)
  const homeDir   = process.env.HOME || process.env.USERPROFILE;
  const projSlug  = '-Users-fletcherreaves-Library-Mobile-Documents-com-apple-CloudDocs-McDonald-s-2026-0---Applications-Claude-Code---Meridian';
  const memoryDir = join(homeDir, '.claude', 'projects', projSlug, 'memory');
  const outPath   = join(memoryDir, 'feature-requests.md');
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${data.length} records → ${outPath}`);
}

// ── main ─────────────────────────────────────────────────────────────────────
const { cmd, id, flags } = parseArgs(process.argv);

switch (cmd) {
  case 'list':         await cmdList(flags);       break;
  case 'add':          await cmdAdd(flags);        break;
  case 'update':       await cmdUpdate(id, flags); break;
  case 'sync-memory':  await cmdSyncMemory();      break;
  default:
    console.log(`
Feature Requests CLI — scripts/features.mjs

  list [--status=planned] [--category=AI] [--priority=high]
  add  --title="..." [--description="..."] [--status=idea] [--priority=medium] [--category=General]
  update <id> --status=in-progress [--dev_notes="..."] [--completed_version=v4.x]
  sync-memory   — refresh memory/feature-requests.md from live DB
`);
}
