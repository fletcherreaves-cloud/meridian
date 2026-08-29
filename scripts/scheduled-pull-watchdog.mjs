#!/usr/bin/env node
// scripts/scheduled-pull-watchdog.mjs — dispatch #210, "should have run by now, silently
// didn't" safety net.
//
// WHY THIS EXISTS: on 2026-08-29 the QSRSoft Daily Activity Pull silently failed to fire
// for its two morning scheduled runs (~3am and ~5am CT) — not a failure, the workflow
// simply never started (confirmed live via the GitHub Actions API: no run exists between
// 01:57 UTC and manual intervention at 11:52 UTC, while sibling pull workflows ran fine
// in the same window). This matches GitHub's own documented behavior: scheduled cron
// triggers are best-effort and can be silently dropped under platform load. A repo with
// many workflows clustered at the same top-of-hour times (this one) is more exposed to
// it. A second, independent measurement the same day found the same failure mode on the
// on-hand pull's own daily progress-snapshot window.
//
// This is EXPLICITLY NOT sync-failure-watch.yml, which watches for a workflow that RAN
// and FAILED (`workflow_run` + conclusion=failure) — a different, already-covered
// failure mode. This watchdog instead reads the DATA each critical stream is supposed to
// produce and asks "is it as fresh as it should be by now", independent of whether any
// workflow run even started. Neither replaces the other.
//
// SOURCE OF TRUTH: src/engine/stream-freshness.js's STREAMS array — the same registry
// At-A-Glance's own per-stream freshness checklist reads (#171). This file does not
// hand-list streams a second time; it only adds the Supabase table/column + owning
// workflow file that a browser-side `dsField` can't carry (see
// scripts/lib/scheduled-pull-registry.mjs's own header for why that's additive, not
// duplicated, and src/__tests__/scheduled-pull-registry.test.js for the guard that keeps
// the two in lockstep).
//
// DETECTION: a stream is "stale" when its latest row's date is older than
// (cadenceDays × 24h) + WATCHDOG_GRACE_HOURS. Grace defaults to 16h (40h total for a
// daily stream) — deliberately generous, not a hair-trigger. These streams carry a DATE
// column, not a timestamp, and every pull runs once a morning (UTC), so the NORMAL
// worst-case age of the freshest row — right before the next run lands — is already
// close to 24h + however late that run is, and GitHub's scheduled runs are documented as
// sparse/delayed (every pull script's own comments already assume this, e.g.
// qsrsoft-onhand-pull.mjs's PROGRESS_SNAPSHOT_WINDOW). 40h leaves real margin above that
// normal cycle while still catching a genuine multi-hour-to-multi-day no-show. This is a
// reasoned default, not a live-measured threshold (CLAUDE.md's own standing rule against
// inventing thresholds) — recalibrate once this watchdog has accumulated real detections
// to compare against, the same way the swing alarm's -10% and the count-completeness
// 0.75 were eventually grounded in measured distributions instead of a first guess.
//
// RETRIGGER: workflow_dispatch via the GitHub REST API, using GITHUB_TOKEN (this repo's
// default token already has `actions: write` granted explicitly below in the workflow —
// workflow_dispatch is one of the two events GitHub explicitly exempts from the
// GITHUB_TOKEN "won't trigger further workflow runs" restriction, the other being
// repository_dispatch, so this works with the default token and needs no extra PAT).
//
// THROTTLE: at most one automatic retrigger per stream PER INCIDENT (not per detection
// cycle in the trivial sense, but in the meaningful one — this watchdog will not
// re-dispatch the same still-stale stream every 30-60 min forever). State lives in a
// GitHub issue (same mechanism sync-failure-watch.yml already uses for its own state) —
// no open issue for a stream yet: retrigger AND open one. Issue already open (the
// previous retrigger didn't clear the staleness by this cycle): comment instead of
// dispatching again — a workflow that's still failing after a retrigger is failing for a
// REAL reason, which is sync-failure-watch.yml's job once that workflow run completes and
// reports failure. The issue is the louder signal this dispatch's Task 3.4 asks for.

import { createClient } from '@supabase/supabase-js';
import { STREAMS } from '../src/engine/stream-freshness.js';
import { PULL_REGISTRY } from './lib/scheduled-pull-registry.mjs';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
export const ISSUE_LABEL = 'scheduled-pull-stale';
export const GRACE_HOURS = Number(process.env.WATCHDOG_GRACE_HOURS ?? 16);

// ── Pure staleness math ────────────────────────────────────────────────────────
/**
 * `latestDateStr`: 'YYYY-MM-DD' or null (no row found at all — treated as maximally
 * stale, not an error, matching stream-freshness.js's own Infinity-staleDays convention
 * for a stream with no usable date).
 */
export function computeStaleness(latestDateStr, cadenceDays, now = new Date(), graceHours = GRACE_HOURS) {
  const thresholdHours = cadenceDays * 24 + graceHours;
  if (!latestDateStr) return { staleHours: Infinity, isStale: true, thresholdHours };
  const latestMs = new Date(`${latestDateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(latestMs)) return { staleHours: Infinity, isStale: true, thresholdHours };
  const staleHours = (now.getTime() - latestMs) / 3.6e6;
  return { staleHours, isStale: staleHours > thresholdHours, thresholdHours };
}

// ── Supabase read (real implementation; tests inject a stub instead) ──────────
export async function fetchLatestDate(supabase, { table, dateCol, clampToToday }, now = new Date()) {
  let q = supabase.from(table).select(dateCol).order(dateCol, { ascending: false }).limit(1);
  if (clampToToday) q = q.lte(dateCol, now.toISOString().slice(0, 10));
  const { data, error } = await q;
  if (error) { console.warn(`[watchdog] ${table} query error: ${error.message}`); return null; }
  return data && data[0] ? data[0][dateCol] : null;
}

// ── GitHub REST helpers (injectable fetchImpl so this is testable with no network) ──
function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

export async function dispatchWorkflow({ fetchImpl = fetch, token, owner, repo, workflowFile, ref = 'main' }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
  const res = await fetchImpl(url, { method: 'POST', headers: ghHeaders(token), body: JSON.stringify({ ref }) });
  if (!res.ok) console.warn(`[watchdog] workflow_dispatch ${workflowFile} HTTP ${res.status}`);
  return res;
}

export async function ensureLabel({ fetchImpl = fetch, token, owner, repo, label }) {
  const getUrl = `https://api.github.com/repos/${owner}/${repo}/labels/${encodeURIComponent(label)}`;
  const got = await fetchImpl(getUrl, { headers: ghHeaders(token) }).catch(() => null);
  if (got && got.ok) return;
  const createUrl = `https://api.github.com/repos/${owner}/${repo}/labels`;
  await fetchImpl(createUrl, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ name: label, color: 'fbca04', description: 'A scheduled data pull should have run by now and did not' }),
  }).catch(() => {}); // harmless race if two runs finish together
}

export async function findOpenIssue({ fetchImpl = fetch, token, owner, repo, label, title }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`;
  const res = await fetchImpl(url, { headers: ghHeaders(token) });
  if (!res.ok) return null;
  const list = await res.json();
  return (Array.isArray(list) ? list : []).find(i => i.title === title) || null;
}

export async function createIssue({ fetchImpl = fetch, token, owner, repo, title, body, label }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
  return fetchImpl(url, { method: 'POST', headers: ghHeaders(token), body: JSON.stringify({ title, body, labels: [label] }) });
}

export async function commentOnIssue({ fetchImpl = fetch, token, owner, repo, number, body }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`;
  return fetchImpl(url, { method: 'POST', headers: ghHeaders(token), body: JSON.stringify({ body }) });
}

function buildBody({ label, latest, staleHours, thresholdHours, workflowFile }, isEscalation) {
  const footer = '\n\n---\n_Generated by [Claude Code](https://claude.ai/code) — scheduled-pull-watchdog_';
  const staleTxt = `**${label}** is ${staleHours === Infinity ? 'unreadable (no usable date found)' : `${staleHours.toFixed(1)}h stale`} — threshold is ${thresholdHours}h.`;
  if (!isEscalation) {
    return `${staleTxt}\n\n` +
      `Last row date: \`${latest ?? 'none'}\`.\n\n` +
      `Automatically re-triggered **${workflowFile}** via \`workflow_dispatch\`. If this was ` +
      `a genuine silent no-show (a scheduled cron trigger that simply never fired — GitHub's ` +
      `own documented best-effort behavior for scheduled runs), the retrigger should clear it ` +
      `within one run. If it's still stale on the next detection cycle, that likely means the ` +
      `workflow IS running but failing for a real reason — check ` +
      `[Sync Failure Watch](../../issues?q=label%3Async-failure) for a matching issue, and the ` +
      `job log directly.${footer}`;
  }
  return `Still stale after the automatic retrigger — ${staleTxt}\n\n` +
    `Last row date: \`${latest ?? 'none'}\`.\n\n` +
    `This watchdog does not retrigger a second time for the same incident (that would loop ` +
    `a workflow that's failing for a real reason, which is ` +
    `[Sync Failure Watch](../../actions/workflows/sync-failure-watch.yml)'s job once it runs ` +
    `and fails). **This needs a human look** — check the job log for **${workflowFile}** ` +
    `directly.${footer}`;
}

// ── Per-stream orchestration ────────────────────────────────────────────────────
/**
 * `deps.fetchLatest(registryEntry, now) => Promise<dateStr|null>` — injected so tests
 * never touch a real Supabase client. `deps.fetchImpl` — injected fetch for the GitHub
 * calls. `deps.dryRun` — compute and report, but never actually call the GitHub API
 * (used by --dry-run and by tests that only want the detection half).
 */
export async function checkStream(key, deps) {
  const { fetchLatest, now = new Date(), token, owner, repo, fetchImpl = fetch, dryRun = false } = deps;
  const streamMeta = STREAMS.find(s => s.key === key);
  const reg = PULL_REGISTRY[key];
  if (!streamMeta || !reg) return { key, action: 'unknown-stream' };

  const latest = await fetchLatest(reg, now);
  const { staleHours, isStale, thresholdHours } = computeStaleness(latest, streamMeta.cadenceDays, now);
  const base = { key, label: streamMeta.label, latest, staleHours, isStale, thresholdHours, workflowFile: reg.workflowFile };
  if (!isStale) return { ...base, action: 'ok' };

  const title = `🟡 Scheduled pull may be stale: ${streamMeta.label}`;
  if (dryRun) return { ...base, action: 'would-check-issue', title };

  await ensureLabel({ fetchImpl, token, owner, repo, label: ISSUE_LABEL });
  const existing = await findOpenIssue({ fetchImpl, token, owner, repo, label: ISSUE_LABEL, title });

  if (!existing) {
    await dispatchWorkflow({ fetchImpl, token, owner, repo, workflowFile: reg.workflowFile });
    await createIssue({ fetchImpl, token, owner, repo, label: ISSUE_LABEL, title, body: buildBody(base, false) });
    return { ...base, action: 'retriggered' };
  }
  await commentOnIssue({ fetchImpl, token, owner, repo, number: existing.number, body: buildBody(base, true) });
  return { ...base, action: 'escalated', issueNumber: existing.number };
}

// Recovery: close any open stale-issue for a stream that is fresh again — mirrors
// sync-failure-watch.yml's own success-path close, so an incident doesn't sit open forever
// once the (re-triggered or otherwise recovered) pull catches back up.
export async function closeIfRecovered(key, deps) {
  const { fetchLatest, now = new Date(), token, owner, repo, fetchImpl = fetch, dryRun = false } = deps;
  const streamMeta = STREAMS.find(s => s.key === key);
  const reg = PULL_REGISTRY[key];
  if (!streamMeta || !reg || dryRun) return null;
  const latest = await fetchLatest(reg, now);
  const { isStale } = computeStaleness(latest, streamMeta.cadenceDays, now);
  if (isStale) return null;
  const title = `🟡 Scheduled pull may be stale: ${streamMeta.label}`;
  const existing = await findOpenIssue({ fetchImpl, token, owner, repo, label: ISSUE_LABEL, title });
  if (!existing) return null;
  await commentOnIssue({ fetchImpl, token, owner, repo, number: existing.number, body: `✅ Recovered — ${streamMeta.label} is fresh again.` });
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${existing.number}`;
  await fetchImpl(url, { method: 'PATCH', headers: ghHeaders(token), body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
  return existing.number;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const token = process.env.GITHUB_TOKEN;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  if (!token || !owner || !repo) {
    console.error('[watchdog] missing GITHUB_TOKEN or GITHUB_REPOSITORY — cannot check/retrigger');
    process.exit(1);
  }
  const now = new Date();
  const fetchLatest = (reg, asOf) => fetchLatestDate(supabase, reg, asOf);

  let staleCount = 0, retriggered = 0, escalated = 0;
  for (const key of Object.keys(PULL_REGISTRY)) {
    const result = await checkStream(key, { fetchLatest, now, token, owner, repo });
    if (result.action === 'ok') {
      if (DEBUG) console.log(`[watchdog] ${key}: ok (${result.staleHours.toFixed(1)}h, threshold ${result.thresholdHours}h)`);
      await closeIfRecovered(key, { fetchLatest, now, token, owner, repo }); // no-op if nothing was open
      continue;
    }
    staleCount++;
    if (result.action === 'retriggered') { retriggered++; console.log(`[watchdog] 🔔 ${result.label} stale (${result.staleHours.toFixed(1)}h > ${result.thresholdHours}h) — retriggered ${result.workflowFile}`); }
    else if (result.action === 'escalated') { escalated++; console.log(`[watchdog] 🔴 ${result.label} STILL stale after a prior retrigger — escalated on issue #${result.issueNumber}`); }
    else console.warn(`[watchdog] ${key}: unexpected action ${result.action}`);
  }
  console.log(`[watchdog] ✓ checked ${Object.keys(PULL_REGISTRY).length} streams — ${staleCount} stale (${retriggered} retriggered, ${escalated} escalated)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('[watchdog] fatal:', err); process.exit(1); });
}
