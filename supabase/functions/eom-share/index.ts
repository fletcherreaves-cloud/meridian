// Meridian — EOM Share edge function (Phase 1: opaque, scoped, read-only, no-login access).
// A share token maps to ONE store's EOM report snapshot for ONE period. This function is the ONLY
// public reader — it validates the token server-side (service role), so a token can only ever return
// its own row (no anon RLS / no table enumeration). Read-only except a single "acknowledge" write-back.
//
// Routes (token in the JSON body or ?token= query):
//   { token }                        → the report (also bumps view_count / last_viewed_at)
//   { token, action:"acknowledge", note? } → marks acknowledged_at (the "I've reviewed this" tap)
//
// Deploy: supabase functions deploy eom-share --no-verify-jwt   (public, so no JWT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    let token = new URL(req.url).searchParams.get('token') || '';
    let action = ''; let note = '';
    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      token = b.token || token; action = b.action || ''; note = (b.note || '').toString().slice(0, 500);
    }
    if (!UUID_RE.test(token)) return json({ error: 'invalid link' }, 400);

    const { data: link, error } = await sb.from('eom_share_links').select('*').eq('token', token).maybeSingle();
    if (error) return json({ error: 'lookup failed' }, 500);
    if (!link) return json({ error: 'This link was not found.' }, 404);
    if (link.revoked) return json({ error: 'This link has been turned off.' }, 410);
    if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'This link has expired.' }, 410);

    if (action === 'acknowledge') {
      await sb.from('eom_share_links').update({ acknowledged_at: new Date().toISOString(), acknowledged_note: note || null }).eq('token', token);
      return json({ ok: true, acknowledgedAt: new Date().toISOString() });
    }

    // Default: return the snapshot + bump view telemetry (best-effort).
    sb.from('eom_share_links').update({ view_count: (link.view_count || 0) + 1, last_viewed_at: new Date().toISOString() }).eq('token', token).then(() => {});
    return json({
      storeName: link.store_name, title: link.title, period: link.period,
      fob: link.fob, recapMd: link.recap_md, fullMd: link.full_md,
      expiresAt: link.expires_at, createdAt: link.created_at,
      acknowledgedAt: link.acknowledged_at,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
