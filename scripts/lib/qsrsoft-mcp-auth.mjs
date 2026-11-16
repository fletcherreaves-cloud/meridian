// scripts/lib/qsrsoft-mcp-auth.mjs
// Auth helper for the QSRSoft Native MCP Server (https://mcp.myqsrsoft.com) — the sanctioned
// OAuth2 connection QSRSoft shipped in response to their own 2026-11 Operator Security Notice
// Letter, as an alternative to credential-login scraping. See memory/finding-qsrsoft-security-
// notice-2026-11-16.md for the full context.
//
// This is a REFRESH-TOKEN-GRANT helper, not a password-login one (there is no QSRSoft username/
// password anywhere in this file) — the refresh token itself was minted once via an interactive
// OAuth PKCE consent flow (the owner clicking "Connect" in QSRSoft and pasting back the resulting
// redirect URL) and is persisted in Supabase from then on, refreshed automatically.
//
// CRITICAL ORDERING: the MCP auth server (https://mcp.myqsrsoft.com/auth) issues ROTATING refresh
// tokens — every refresh_token grant exchange invalidates the old token server-side and returns a
// new one in the same response. getFreshAccessToken() persists the NEW refresh token to
// qsr_mcp_token_cache IMMEDIATELY after the exchange succeeds, before returning the access token
// to the caller. If a run dies partway through the data pull after this point, the next run still
// has a valid (already-rotated) refresh token to work with. Persisting late — or not at all — is
// exactly the mistake that killed one working refresh chain during this feature's own development
// (confirmed live 2026-11-16: an exchange was made, the new pair was never saved, and the old
// refresh token was immediately rejected on the next attempt with no way to recover it short of a
// fresh interactive consent). Never call the refresh_token grant and discard the result.
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// The refresh token + client_id live in Supabase (qsr_mcp_token_cache, id='qsrsoft_mcp'), seeded
// once by an operator with QSRSoft MCP access — see that table's seed step in
// memory/finding-qsrsoft-security-notice-2026-11-16.md. Nothing here reads a token from an env var
// or a file; there is no fallback path, by design — if qsr_mcp_token_cache has no row, or the
// stored refresh token has been revoked/expired, this throws and the caller should fail loudly
// (sync-failure-watch.yml will catch the workflow failure) rather than silently going quiet.

import { createClient } from '@supabase/supabase-js';

const TOKEN_ENDPOINT = 'https://mcp.myqsrsoft.com/auth/oauth2/token';
const CACHE_ID = 'qsrsoft_mcp';

function supa() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function loadCachedEntry(supabase) {
  const { data, error } = await supabase
    .from('qsr_mcp_token_cache')
    .select('refresh_token, client_id')
    .eq('id', CACHE_ID)
    .maybeSingle();
  if (error) throw new Error(`[qsrsoft-mcp-auth] could not read qsr_mcp_token_cache: ${error.message}`);
  if (!data?.refresh_token || !data?.client_id) {
    throw new Error('[qsrsoft-mcp-auth] no qsr_mcp_token_cache row (id=qsrsoft_mcp) — seed one via the interactive OAuth consent flow first. See memory/finding-qsrsoft-security-notice-2026-11-16.md.');
  }
  return data;
}

async function exchangeRefreshToken(refreshToken, clientId) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`[qsrsoft-mcp-auth] refresh_token exchange failed: HTTP ${resp.status} ${text.slice(0, 300)}`);
  }
  return resp.json();
}

async function persistRotatedToken(supabase, clientId, newRefreshToken) {
  const { error } = await supabase.from('qsr_mcp_token_cache').upsert({
    id: CACHE_ID,
    refresh_token: newRefreshToken,
    client_id: clientId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw new Error(`[qsrsoft-mcp-auth] FAILED to persist rotated refresh token — the old one is now dead server-side and this run cannot proceed safely: ${error.message}`);
}

/** Mints a fresh access token. Persists the rotated refresh token BEFORE returning — see header. */
export async function getFreshAccessToken() {
  const supabase = supa();
  const { refresh_token: refreshToken, client_id: clientId } = await loadCachedEntry(supabase);
  const data = await exchangeRefreshToken(refreshToken, clientId);
  if (!data.access_token || !data.refresh_token) {
    throw new Error('[qsrsoft-mcp-auth] token endpoint response missing access_token or refresh_token');
  }
  await persistRotatedToken(supabase, clientId, data.refresh_token);
  return data.access_token;
}
