#!/usr/bin/env node
// scripts/sage-run.mjs — SAGE scheduled-prompt runner (Phase 2)
// Runs in GitHub Actions on an hourly cron. For each ENABLED saved prompt whose
// schedule matches the current UTC hour (and day-of-week, for weekly prompts) and
// that hasn't already run this hour, it invokes the sage-chat Edge Function and
// stores the answer in sage_prompt_runs (surfaced by the At-A-Glance "Scheduled
// Runs" tile).
//
// Required env vars:
//   VITE_SUPABASE_URL          — Supabase project URL
//   VITE_SUPABASE_ANON_KEY     — anon key (to sign the runner user in)
//   SUPABASE_SERVICE_ROLE_KEY  — service role key (DB reads/writes, bypasses RLS)
//   SAGE_RUNNER_EMAIL          — a real Supabase user (the edge fn validates a user JWT)
//   SAGE_RUNNER_PASSWORD       — that user's password
// Optional:
//   SAGE_RUN_FORCE=1           — run every enabled prompt now, ignoring the schedule match
//   SAGE_RUN_DEBUG=1           — verbose logging

import { createClient } from '@supabase/supabase-js';

const URL      = process.env.VITE_SUPABASE_URL;
const ANON     = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL    = process.env.SAGE_RUNNER_EMAIL;
const PASSWORD = process.env.SAGE_RUNNER_PASSWORD;
const FORCE    = process.env.SAGE_RUN_FORCE === '1';
const DEBUG    = process.env.SAGE_RUN_DEBUG === '1';

function die(msg) { console.error('✗ ' + msg); process.exit(1); }
if (!URL || !SERVICE) die('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (!ANON || !EMAIL || !PASSWORD) die('VITE_SUPABASE_ANON_KEY, SAGE_RUNNER_EMAIL and SAGE_RUNNER_PASSWORD are required (the sage-chat function validates a real user token).');

const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

// Minimal standalone system prompt — the edge tools (query_daily_activity,
// query_lifelenz_labor, query_forecast_snapshots) hit Supabase directly, so a
// scheduled run needs no client-side data context.
const SYSTEM_PROMPT = [
  'You are SAGE (Strategic Analytics & Guidance Engine), the AI advisor inside Meridian, a McDonald\'s franchise operations analytics platform (~27 stores across Oklahoma and Florida).',
  'This is an automated scheduled run — no human is watching live. Answer the prompt concisely and specifically using your live data tools (query_daily_activity for sales/DT/speed, query_lifelenz_labor for scheduling/VLH, query_forecast_snapshots for forecast accuracy).',
  'Prefer ranked tables and a short, actionable summary. If a data tool returns nothing, say so plainly and state which store/date/source was empty (do not invent numbers).',
].join('\n');

// ── SSE call to the sage-chat Edge Function, returns the concatenated answer ──
async function callSage(accessToken, promptText) {
  const res = await fetch(`${URL}/functions/v1/sage-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: promptText }], systemPrompt: SYSTEM_PROMPT }),
  });
  if (!res.ok) throw new Error(`sage-chat HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  let full = '';
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        if (typeof obj.text === 'string') full += obj.text;
        else if (obj.error) throw new Error(obj.error);
        else if (obj.status && DEBUG) console.log('  · ' + obj.status);
      } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; }
    }
  }
  return full.trim();
}

async function main() {
  const now = new Date();
  const hour = now.getUTCHours();
  const dow  = now.getUTCDay();                 // 0=Sun..6=Sat
  const topOfHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));

  const { data: prompts, error } = await db.from('sage_prompts').select('*').eq('schedule_enabled', true);
  if (error) die('load sage_prompts: ' + error.message);
  if (!prompts || !prompts.length) { console.log('No enabled scheduled prompts. Done.'); return; }

  const due = prompts.filter(p => {
    if (FORCE) return true;
    if (p.schedule_hour !== hour) return false;
    if ((p.schedule_freq || 'daily') === 'weekly' && p.schedule_dow !== dow) return false;
    if (p.last_run_at && new Date(p.last_run_at) >= topOfHour) return false; // already ran this hour
    return true;
  });

  console.log(`SAGE runner · ${now.toISOString()} · ${prompts.length} enabled, ${due.length} due this hour${FORCE ? ' (FORCE)' : ''}.`);
  if (!due.length) return;

  // Sign in the runner user to mint a real access token for the edge function.
  const authClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess, error: authErr } = await authClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authErr || !sess?.session?.access_token) die('runner sign-in failed: ' + (authErr?.message || 'no session token'));
  const token = sess.session.access_token;

  let ok = 0, failed = 0;
  for (const p of due) {
    try {
      console.log(`▶ ${p.title}`);
      const answer = await callSage(token, p.prompt_text);
      await db.from('sage_prompt_runs').insert({ prompt_id: p.id, title: p.title, ok: true, result_md: answer });
      await db.from('sage_prompts').update({ last_run_at: now.toISOString() }).eq('id', p.id);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${p.title}: ${e.message}`);
      await db.from('sage_prompt_runs').insert({ prompt_id: p.id, title: p.title, ok: false, error: String(e.message).slice(0, 500) });
      await db.from('sage_prompts').update({ last_run_at: now.toISOString() }).eq('id', p.id);
      failed++;
    }
  }
  console.log(`Done — ${ok} ok, ${failed} failed.`);
}

main().catch(e => die(e.stack || e.message));
