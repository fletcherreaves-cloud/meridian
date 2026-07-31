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

    // LIVE refresh: return the freshest scoped rows for THIS store+period so the viewer can re-render
    // the report from current data (the GM corrected counts → next sync landed → they hit Refresh).
    // Strictly scoped to link.loc + link.period — no other store's data is ever queried or returned.
    if (action === 'refresh') {
      const loc = String(link.loc), period = String(link.period);
      const mStart = `${period}-01`, mEnd = `${period}-31`;
      const [fobR, ohR, varR, rawR, wasteR, xferR, excR] = await Promise.all([
        sb.from('qsr_fob').select('*').eq('loc', loc).gte('date', mStart).lte('date', mEnd),
        sb.from('qsr_onhand').select('*').eq('loc', loc).eq('period', period),
        sb.from('qsr_variance_stat').select('*').eq('loc', loc).eq('period', period),
        sb.from('qsr_raw_item_detail').select('*').eq('loc', loc).eq('period', period),
        sb.from('qsr_waste').select('*').eq('loc', loc).eq('period', period),
        sb.from('qsr_transfers').select('*').eq('loc', loc).eq('period', period),
        sb.from('eom_count_exceptions').select('*').eq('loc', loc).eq('period', period).maybeSingle(),
      ]);
      const R = (x: { data: unknown[] | null }) => (x?.data || []) as Record<string, unknown>[];
      // Map to the SAME shapes the client loaders produce so the shared builder reads them identically.
      const fob = R(fobR).map(r => ({ loc: r.loc, date: r.date, prodSalesAmt: r.prod_sales_amt, compWasteAmt: r.comp_waste_amt, rawWasteAmt: r.raw_waste_amt, condimentsAmt: r.condiments_amt, empMgrMealsAmt: r.emp_mgr_meals_amt, statVarianceAmt: r.stat_variance_amt, unexplainedAmt: r.unexplained_amt }));
      const onHand = R(ohR).map(r => ({ wrin: r.wrin, descr: r.descr, cls: r.cls, totalUnits: r.total_units, unitPrice: r.unit_price, onHandAmt: r.on_hand_amt, lastCounted: r.last_counted, lastSubmitted: r.last_submitted }));
      const variance = R(varR).map(r => ({ loc: r.loc, period: r.period, wrin: r.wrin, cls: r.cls, descr: r.descr, rawWaste: r.raw_waste, compWaste: r.comp_waste, expUsage: r.exp_usage, actUsage: r.act_usage, variance: r.variance, dolDiff: r.dol_diff, yield: r.yield_val, yieldLo: r.yield_lo, yieldHi: r.yield_hi, pctOfSales: r.pct_sales, rawItemId: r.raw_item_id }));
      const rawItems = R(rawR).map(r => ({ wrin: r.wrin, descr: r.descr, cls: r.item_class, history: Array.isArray(r.history) ? r.history : [] }));
      const waste = R(wasteR).map(r => ({ loc: r.loc, period: r.period, eventId: r.event_id, dt: r.busn_dt, tm: r.busn_tm, type: r.wtype, amount: r.amount, manager: r.manager, source: r.wsource, edited: r.edited, reason: r.reason }));
      const transfers = R(xferR).map(r => ({ loc: r.loc, period: r.period, transferId: r.transfer_id, wrin: r.wrin, dir: r.dir, amount: r.amount, qty: r.qty }));
      const ex = excR?.data as Record<string, unknown> | null;
      const exception = ex ? { acceptedDate: ex.accepted_date, approvedBy: ex.approved_by, note: ex.note, kind: ex.kind } : null;
      const dates = [...fob.map(r => r.date), ...onHand.map(r => r.lastCounted)].filter(Boolean).map(String).map(s => s.slice(0, 10)).sort();
      return json({
        loc, period, storeName: link.store_name,
        live: { fob, onHand, variance, rawItems, waste, transfers, exception },
        syncedAsOf: dates.length ? dates[dates.length - 1] : null,
      });
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
