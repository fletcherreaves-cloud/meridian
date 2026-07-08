#!/usr/bin/env node
// scripts/lifelenz-vlh-sync.mjs
// Pulls VLH configuration for all stores from LifeLenz and upserts to
// the store_vlh_config Supabase table.
//
// Required env vars:
//   LIFELENZ_TOKEN            — X-Auth-Token for LifeLenz API
//   VITE_SUPABASE_URL         — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)

const BASE        = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const TOKEN       = process.env.LIFELENZ_TOKEN;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TOKEN)        { console.error('Missing LIFELENZ_TOKEN');            process.exit(1); }
if (!SUPABASE_URL) { console.error('Missing VITE_SUPABASE_URL');         process.exit(1); }
if (!SUPABASE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

// Direct REST upsert — no Supabase client, no WebSocket dependency
async function supabaseUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed (${res.status}): ${text}`);
  }
}

const HEADERS = {
  'X-Auth-Token':      TOKEN,
  'X-Business-Id':     BUSINESS_ID,
  'X-Lifelenz-Device': 'webadmin',
  'X-Version':         '1.75.21',
  'Accept':            'application/json',
};

// ── Value mappers ─────────────────────────────────────────────────────────

function mapVlhGuide(version = '') {
  return /\bhp\b/i.test(version) ? 'hpg' : 'standard';
}

function mapDtType(value = '') {
  const v = value.toLowerCase();
  if (v.includes('side by side'))             return 'side_tandem';
  if (v.includes('two booth single lane'))    return 'single_2booth';
  if (v.includes('single booth'))             return 'single_1booth';
  if (v.includes('no drive thru'))            return 'no_dt';
  return 'side_tandem';
}

function mapKitchen(value = '') {
  const v = value.toLowerCase();
  if (v.includes('compact opl') || v.includes('copl')) return 'copl';
  if (v.includes('opl') || v.includes('optimized prep')) return 'opl';
  if (v.includes('fryer opposite'))           return 'fryer_opp';
  if (v.includes('fryer same'))               return 'fryer_same';
  return 'fryer_same';
}

function mapCoffee(value = '') {
  const v = value.toLowerCase();
  const bdap    = v.includes('bdap');
  const mccafe  = v.includes('mccafe') || v.includes('mccafé');
  if (bdap && mccafe) return 'both';
  if (bdap)           return 'bdap';
  if (mccafe)         return 'mccafe';
  return 'none';
}

function mapBeverage(value = '') {
  const v = value.toLowerCase();
  if (v.includes('crew pour'))  return 'crew_pour';
  if (v.includes('self serve')) return 'self_serve';
  return 'self_serve';
}

function mapAot(value = '') {
  return /\baot\b/i.test(value);
}

// ── GraphQL fetch ─────────────────────────────────────────────────────────

async function gql(operationName, query, variables = {}) {
  const res = await fetch(`${BASE}/manager/graphql?${operationName}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName, query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    const fatal = json.errors.filter(e => !e.path); // non-field errors
    if (fatal.length) throw new Error(fatal.map(e => e.message).join('; '));
  }
  return json.data;
}

// ── Main ──────────────────────────────────────────────────────────────────

console.log('Fetching VLH configuration for all stores from LifeLenz...');

const data = await gql('GetAllVlhSettings', `
  query GetAllVlhSettings($businessId: ID!) {
    schedules(businessId: $businessId) {
      nodes {
        id
        scheduleName
        vlhSettingsCache {
          version
          businessAreas {
            area
            value
          }
        }
      }
    }
  }
`, { businessId: BUSINESS_ID });

const STORE_RE = /\b(\d{4,7})\b/;
const nodes = data?.schedules?.nodes || [];
const stores = nodes.filter(n =>
  n.vlhSettingsCache && STORE_RE.test(n.scheduleName)
);

console.log(`Found ${stores.length} stores with VLH config.`);

const rows = stores.map(store => {
  const nsnMatch = store.scheduleName.match(STORE_RE);
  const loc = String(parseInt(nsnMatch[1], 10)); // strip leading zeros, match STORE_NAMES format

  const byArea = {};
  (store.vlhSettingsCache.businessAreas || []).forEach(a => {
    byArea[a.area] = a.value;
  });

  const row = {
    loc,
    aot:       mapAot(byArea.front_counter || ''),
    dt_type:   mapDtType(byArea.drive_thru || ''),
    kitchen:   mapKitchen(byArea.kitchen || ''),
    coffee:    mapCoffee(byArea.coffee || ''),
    in_store:  mapBeverage(byArea.beverage_system || ''),
    vlh_guide: mapVlhGuide(store.vlhSettingsCache.version || ''),
    updated_at: new Date().toISOString(),
  };

  console.log(`  ${store.scheduleName}`);
  console.log(`    aot=${row.aot} dt=${row.dt_type} kitchen=${row.kitchen} coffee=${row.coffee} beverage=${row.in_store} guide=${row.vlh_guide}`);

  return row;
});

// Upsert all rows via REST (no WebSocket / realtime dependency)
await supabaseUpsert('store_vlh_config', rows);

console.log(`\nDone — ${rows.length} store configs upserted to store_vlh_config.`);
