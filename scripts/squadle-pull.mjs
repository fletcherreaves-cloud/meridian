#!/usr/bin/env node
// scripts/squadle-pull.mjs — Squadle food-safety checklist tablet, item-level daily records
// (task #105). Full auth + data chain confirmed live 2026-11-12 -- see
// memory/finding-hme-squadle-integration-2026-11-06.md for the complete research history,
// including the two real traps this script's design is built around:
//
//  1. The plain Firebase-Auth login idToken is NOT valid on the sharded "customer database"
//     RTDB instances (sqdl-prod-cd-NNN) where the real checklist records live -- every one
//     denies it with permission_denied. A SEPARATE step is required: POST
//     https://sl.squadle.com/createRealtimePermissionSession with {clientType:'hq'},
//     Authorization: Bearer <loginIdToken>, X-Squadle-User-Id: <userId> -- returns a
//     short-lived custom Firebase token, which must then be exchanged via
//     identitytoolkit's verifyCustomToken for a SECOND idToken that IS valid on the shards.
//     The plain login idToken IS valid on the primary 'squadle' project (channels/users/squads
//     lookups) -- only the sharded databases need the exchanged one.
//  2. The /channels/email/<key> lookup's key is NOT a plain url-encoded email -- it is
//     encodeURIComponent(email).replace(/\./g,'%2E'), i.e. the LITERAL 3-character string
//     "%2E" substituted for each ".". This is sent as-is inside the RTDB wire-protocol JSON
//     frame (never URL-decoded, since it's not an HTTP path) -- confirmed by reading
//     hq.squadle.com's own compiled JS bundle.
//
// Refresh-token rotation confirmed OFF (a refresh token can be reused indefinitely) -- but this
// script re-logs-in with username/password every run anyway, same simplicity as
// scripts/hme-cloud-pull.mjs, rather than managing a stored refresh token.
//
// Shard resolution (~23 sqdl-prod-cd-NNN databases, one real one per location): this script
// reads the most recently known shard per location from squadle_checklist_records first: any
// location with no cached shard gets brute-forced (one WS connection per shard in parallel,
// confirmed cheap and safe -- the 22 wrong shards return permission_denied immediately, not an
// error that risks corrupting anything). Once resolved, the shard is cached in that same
// column going forward.
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SQUADLE_USERNAME, SQUADLE_PASSWORD
// Optional: SQUADLE_DEBUG (1 = verbose)

import WebSocket from 'ws';
import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';

const FIREBASE_API_KEY   = 'AIzaSyC3Gu3Ls2l5fIH3eLn5F3HtbZf41YEPr4M'; // public per-project client key, not a secret -- see finding doc
const SQUAD_LEADER_SERVER = 'https://sl.squadle.com';
const PRIMARY_PROJECT     = 'squadle';
const NUM_SHARDS          = 23;
const DEBUG               = process.env.SQUADLE_DEBUG === '1';

const supabase = safeCreateClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const toISO = d => d.toISOString().slice(0, 10);
const addDay = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

// ── Firebase Auth: login + the real custom-token exchange chain ──
async function firebaseLogin(email, password) {
  const resp = await fetch(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.idToken) throw new Error(`Squadle login failed: ${JSON.stringify(data).slice(0, 200)}`);
  return { idToken: data.idToken, localId: data.localId };
}

async function createRealtimePermissionSession(loginIdToken, userId) {
  const resp = await fetch(`${SQUAD_LEADER_SERVER}/createRealtimePermissionSession`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${loginIdToken}`, 'X-Squadle-User-Id': userId, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientType: 'hq' }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.token) throw new Error(`createRealtimePermissionSession failed: ${JSON.stringify(data).slice(0, 200)}`);
  return data.token;
}

async function exchangeCustomToken(customToken) {
  const resp = await fetch(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.idToken) throw new Error(`verifyCustomToken failed: ${JSON.stringify(data).slice(0, 200)}`);
  return data.idToken;
}

// The exact email->key transform Squadle's own front-end uses (see header note #2 above).
function emailChannelKey(email) {
  return encodeURIComponent(email).replace(/\./g, '%2E');
}

// ── Raw Firebase RTDB wire protocol ("q" query over wss://<project>.firebaseio.com) ──
//
// REAL TRAP, found live 2026-11-12 (cost a lot of debugging time -- recorded here so it is
// never rediscovered): a large RTDB response does NOT arrive as one WebSocket text frame.
// Firebase's own JS SDK (websocket_connection.js's frame-reassembly logic) splits it: the
// FIRST physical frame is a lone decimal-digits string (e.g. "25") announcing how many
// physical frames the logical message spans; the next N physical frames must be concatenated
// (plain string concatenation, NOT JSON array join) before the result is valid JSON. A naive
// "JSON.parse every frame" implementation (every prior scratch test in this session's own
// research had this bug) silently swallows every fragment via its own catch-and-ignore, which
// looks EXACTLY like the real shard never responding -- it was never a network/timeout issue,
// it was an unreassembled multi-frame message. Small responses (permission_denied errors, the
// channels/users/squads lookups) are never fragmented, which is why those all "worked" while
// only the genuinely large real-record payload appeared to silently hang.
//
// One WebSocket per call, closed after the query resolves or times out. Returns `data`
// (possibly null) on success, or throws with a `.deniedPermission` flag so callers can
// distinguish a real "no data" from an auth/rules rejection without guessing from text.
function rtdbQuery(project, idToken, path, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://${project}.firebaseio.com/.ws?v=5&ns=${project}`);
    let reqId = 1;
    let authed = false;
    let settled = false;
    let pendingFrames = 0;   // >0 while reassembling a fragmented message
    let frameBuffer = '';
    const finish = (fn) => { if (!settled) { settled = true; try { ws.close(); } catch {} fn(); } };
    const timer = setTimeout(() => finish(() => reject(Object.assign(new Error('timeout'), { timedOut: true }))), timeoutMs);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'd', d: { r: reqId++, a: 's', b: { c: { 'sdk.js.5-10-1': 1 } } } }));
    });
    ws.on('message', (raw) => {
      const text = raw.toString();
      // Frame-count header: a lone run of digits announces the next N frames must be
      // concatenated before parsing -- confirmed live, see header note above.
      if (pendingFrames === 0 && /^\d+$/.test(text)) { pendingFrames = parseInt(text, 10); frameBuffer = ''; return; }
      let jsonText = text;
      if (pendingFrames > 0) {
        frameBuffer += text;
        pendingFrames--;
        if (pendingFrames > 0) return; // still waiting on more fragments
        jsonText = frameBuffer;
      }
      let msg; try { msg = JSON.parse(jsonText); } catch { return; }
      if (msg.t === 'c') return;
      const d = msg.d;
      if (!d) return;
      if (!authed && d.b && d.b.s === 'ok' && d.b.d === '') {
        authed = true;
        ws.send(JSON.stringify({ t: 'd', d: { r: reqId++, a: 'auth', b: { cred: idToken } } }));
        return;
      }
      if (d.b && d.b.s === 'ok' && d.b.d && d.b.d.auth) {
        ws.send(JSON.stringify({ t: 'd', d: { r: reqId++, a: 'q', b: { p: path, h: '' } } }));
        return;
      }
      if (d.b && d.b.s && d.b.s !== 'ok') {
        clearTimeout(timer);
        finish(() => reject(Object.assign(new Error(d.b.d || d.b.s), { deniedPermission: d.b.s === 'permission_denied' })));
        return;
      }
      if (d.a === 'd' && d.b && typeof d.b.p === 'string') {
        clearTimeout(timer);
        finish(() => resolve(d.b.d));
      }
    });
    ws.on('error', (e) => { clearTimeout(timer); finish(() => reject(e)); });
  });
}

function shardName(n) { return 'sqdl-prod-cd-' + String(n).padStart(3, '0'); }

// Brute-force fan-out across all shards for one location -- confirmed cheap and safe; 22 of 23
// deny immediately (permission_denied), the real one returns real data (possibly null if the
// location genuinely has no record for that date, which is why this resolves shard by AUTH
// success, i.e. the absence of permission_denied, not by data presence).
async function resolveShard(rtdbIdToken, path) {
  const attempts = Array.from({ length: NUM_SHARDS }, (_, i) => shardName(i + 1));
  const results = await Promise.allSettled(attempts.map(s => rtdbQuery(s, rtdbIdToken, path)));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') return { shard: attempts[i], data: r.value };
  }
  return null;
}

// ── Supabase ──
async function getCachedShards() {
  const { data, error } = await supabase
    .from('squadle_checklist_records')
    .select('squadle_location_id, shard')
    .not('shard', 'is', null)
    .order('pulled_at', { ascending: false });
  if (error) { console.warn('[supabase] could not read cached shards (table may not exist yet):', error.message); return new Map(); }
  const map = new Map();
  for (const row of data || []) if (!map.has(row.squadle_location_id)) map.set(row.squadle_location_id, row.shard);
  return map;
}

async function upsertRecord(row) {
  const payload = { tenant_id: '00000000-0000-0000-0000-000000000001', updated_at: new Date().toISOString(), ...row };
  const { error } = await supabase.from('squadle_checklist_records').upsert(payload, { onConflict: 'squadle_location_id,dt' });
  if (error) { console.warn(`[supabase] upsert error for ${row.squadle_location_id}/${row.dt}:`, error.message); return false; }
  return true;
}

async function getLatestPulledAt() {
  const { data, error } = await supabase.from('squadle_checklist_records').select('pulled_at').order('pulled_at', { ascending: false }).limit(1);
  if (error) { console.warn('[freshness] could not read latest pulled_at:', error.message); return null; }
  return data?.[0]?.pulled_at || null;
}

// A record's own `tags` map almost always includes the literal store number as one entry
// (confirmed live, e.g. {"0":{"text":"rfp-2"},"1":{"text":"6972"}}) -- scan every tag's text for
// a 4-7 digit run rather than assuming a fixed index, since the tag ORDER is not guaranteed.
function storeNumberFromTags(tags) {
  if (!tags) return null;
  for (const v of Object.values(tags)) {
    const text = v?.text;
    if (typeof text === 'string' && /^\d{4,7}$/.test(text.trim())) return text.trim();
  }
  return null;
}
function padLoc(storeNumber) {
  const digits = String(storeNumber || '').replace(/\D/g, '');
  return digits ? digits.padStart(7, '0') : null;
}

async function main() {
  const email = process.env.SQUADLE_USERNAME;
  const password = process.env.SQUADLE_PASSWORD;
  if (!email || !password) { console.error('[auth] SQUADLE_USERNAME and SQUADLE_PASSWORD are required.'); process.exit(1); }

  const latestPulledAt = await getLatestPulledAt();
  const fresh = checkFreshness(latestPulledAt, { warnAfterHours: 30, errorAfterHours: 54, label: 'squadle-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  console.log('[squadle-pull] logging in…');
  const { idToken: loginIdToken, localId: userId } = await firebaseLogin(email, password);
  console.log('[squadle-pull] ✓ authenticated as', userId);

  const channelKey = emailChannelKey(email);
  const resolvedUserId = await rtdbQuery(PRIMARY_PROJECT, loginIdToken, `/channels/email/${channelKey}`);
  const effectiveUserId = resolvedUserId || userId;
  const userNode = await rtdbQuery(PRIMARY_PROJECT, loginIdToken, `/users/${effectiveUserId}`);
  const squadIds = Object.keys(userNode?.squads || {});
  if (!squadIds.length) { console.error('[squadle-pull] no squads found for this user.'); process.exit(1); }

  const customToken = await createRealtimePermissionSession(loginIdToken, effectiveUserId);
  const rtdbIdToken = await exchangeCustomToken(customToken);
  console.log('[squadle-pull] ✓ realtime permission session established');

  const cachedShards = await getCachedShards();
  const today = toISO(new Date());
  const yesterday = toISO(addDay(new Date(), -1));
  const dates = [yesterday, today];

  const tracker = makeOutcomeTracker('squadle-pull');
  const allLocationIds = new Set();
  const coveredLocationIds = new Set();
  let totalSaved = 0;

  for (const squadId of squadIds) {
    const squadNode = await rtdbQuery(PRIMARY_PROJECT, loginIdToken, `/squads/${squadId}/locations`);
    const locationIds = Object.keys(squadNode || {});
    console.log(`[squadle-pull] squad ${squadId}: ${locationIds.length} location(s)`);
    for (const locId of locationIds) allLocationIds.add(locId);

    for (const locId of locationIds) {
      let shard = cachedShards.get(locId);
      for (const dt of dates) {
        const path = `/records/${dt}/${locId}`;
        try {
          let data, usedShard;
          if (shard) {
            try { data = await rtdbQuery(shard, rtdbIdToken, path); usedShard = shard; }
            catch (e) { if (!e.deniedPermission) throw e; shard = null; } // cached shard went stale -- fall through to re-resolve
          }
          if (!shard) {
            const resolved = await resolveShard(rtdbIdToken, path);
            if (!resolved) { tracker.fail(`${locId}/${dt}`, 'no shard granted access (brute-force exhausted)'); continue; }
            shard = resolved.shard; usedShard = resolved.shard; data = resolved.data;
            cachedShards.set(locId, shard);
          }
          if (data == null) { if (DEBUG) console.log(`  ${locId} ${dt}: no record (shard ${usedShard})`); continue; }

          const storeNum = storeNumberFromTags(data.tags) || Object.values(data.shifts || {}).map(s => storeNumberFromTags(s.tags)).find(Boolean);
          const loc = padLoc(storeNum);
          if (!loc) { tracker.fail(`${locId}/${dt}`, 'could not derive a store number from any tag'); continue; }

          const ok = await upsertRecord({
            loc, squadle_location_id: locId, dt, shard: usedShard,
            created_on: data.createdOn ? new Date(data.createdOn).toISOString() : null,
            data, pulled_at: new Date().toISOString(),
          });
          if (ok) { totalSaved++; coveredLocationIds.add(locId); console.log(`  ${locId} (loc ${loc}) ${dt}: saved (shard ${usedShard})`); }
          else tracker.fail(`${locId}/${dt}`, 'upsert write failure');
        } catch (e) {
          console.warn(`  ${locId} ${dt}: ${e.message}`);
          tracker.fail(`${locId}/${dt}`, e.message);
        }
      }
    }
  }

  console.log(`[squadle-pull] ✓ ${totalSaved} record(s) saved across ${coveredLocationIds.size}/${allLocationIds.size} locations`);
  logPartitionCoverage(coveredLocationIds, [...allLocationIds], { label: 'squadle-pull', kind: 'location' });

  const code = tracker.finalize({
    requestedUnits: [...allLocationIds],
    totalSaved,
    formatRerun: () => 're-run the whole workflow -- no per-location rerun flag exists yet',
  });
  if (code) process.exit(code);
}

export { emailChannelKey, storeNumberFromTags, padLoc, shardName };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[squadle-pull] fatal error:', err);
    process.exit(1);
  });
}
