// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const URL  = import.meta.env.VITE_SUPABASE_URL;
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.info('Meridian: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — running in local-only mode');
}

// supabase is null in local-only mode; all callers must guard with `if (supabase)`
export const supabase = (URL && KEY) ? createClient(URL, KEY) : null;

// ── Microsoft / Azure AD migration note ───────────────────────────────────────
// To switch auth to Microsoft Entra ID (M365 SSO) later:
//   1. In Supabase dashboard → Auth → Providers → Azure → enable + paste tenant/client
//   2. Replace signInWithOtp below with:
//        supabase.auth.signInWithOAuth({ provider: 'azure' })
//   3. Or: swap Supabase Auth entirely for MSAL.js and keep Supabase as the database.
//      In that case, pass the MSAL access token to Supabase via
//        supabase.auth.setSession({ access_token: msalToken })
//   The database schema and RLS policies do not change in either path.
