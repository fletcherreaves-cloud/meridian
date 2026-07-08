#!/usr/bin/env node
// scripts/lifelenz-vlh-explore.mjs — round 2
// Chases the leads from round 1:
//   1. Full REST response from base schedule endpoint (was truncated)
//   2. scheduleKpiData (suggested by GraphQL error)
//   3. More GraphQL name guesses based on LifeLenz naming patterns
//   4. REST with ?include= param
//   5. Full introspection output filtered for anything useful

const BASE        = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const TOKEN       = process.env.LIFELENZ_TOKEN;

if (!TOKEN) { console.error('Set LIFELENZ_TOKEN env var'); process.exit(1); }

const HEADERS = {
  'X-Auth-Token':      TOKEN,
  'X-Business-Id':     BUSINESS_ID,
  'X-Lifelenz-Device': 'webadmin',
  'X-Version':         '1.75.21',
  'Accept':            'application/json',
};

async function get(path) {
  const res = await fetch(BASE + path, { headers: HEADERS });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

const gql = async (operationName, query, variables = {}) => {
  const res = await fetch(`${BASE}/manager/graphql?${operationName}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName, query, variables }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
};

// ── Get one schedule ID to use as probe target ────────────────────────────
const schRes = await get(`/api/admin/businesses/${BUSINESS_ID}/schedules`);
const STORE_RE = /\b\d{4,7}\b/;
const schedules = (schRes.json?.data || []).filter(s =>
  s.attributes?.schedule_status !== 'archived' &&
  STORE_RE.test(s.attributes?.schedule_name || '')
);
const probe = schedules[0];
const SID = probe.id;
console.log(`Probing: ${probe.attributes.schedule_name} (${SID})\n`);

// ── 1. Full REST base schedule response ───────────────────────────────────
console.log('══ 1. Full base schedule REST response ══════════════════════════');
const base = await get(`/api/admin/businesses/${BUSINESS_ID}/schedules/${SID}`);
console.log(`Status: ${base.status}`);
console.log(JSON.stringify(base.json, null, 2));

// ── 2. REST with ?include= ────────────────────────────────────────────────
console.log('\n══ 2. REST with ?include params ═════════════════════════════════');
for (const inc of ['vlh_configuration', 'vlh_configurations', 'vlh_settings', 'settings', 'schedule_settings']) {
  const r = await get(`/api/admin/businesses/${BUSINESS_ID}/schedules/${SID}?include=${inc}`);
  console.log(`  ${r.status}  ?include=${inc}`);
  if (r.status === 200 && r.text.includes('vlh')) {
    console.log('  *** VLH data found! ***');
    console.log(r.text.slice(0, 1000));
  }
}

// ── 3. scheduleKpiData (suggested by error message) ───────────────────────
console.log('\n══ 3. scheduleKpiData ═══════════════════════════════════════════');
const kpi = await gql('GetScheduleKpiData', `
  query GetScheduleKpiData($scheduleId: ID!) {
    scheduleKpiData(scheduleId: $scheduleId) {
      id
      __typename
    }
  }
`, { scheduleId: SID });
console.log(`Status: ${kpi.status}`);
console.log(kpi.text.slice(0, 800));

// ── 4. GetSchedule — ask for everything we can think of ───────────────────
console.log('\n══ 4. GetSchedule with deep fields ══════════════════════════════');
const qs = await gql('GetSchedule', `
  query GetSchedule($id: ID!, $businessId: ID!) {
    schedule(id: $id, businessId: $businessId) {
      id
      scheduleName
      __typename
    }
  }
`, { id: SID, businessId: BUSINESS_ID });
console.log(`GetSchedule → ${qs.status}:`, qs.text.slice(0, 600));

// ── 5. Full introspection — dump all query field names ────────────────────
console.log('\n══ 5. Full introspection — all query fields ═════════════════════');
const intro = await gql('IntrospectAll', `
  query IntrospectAll {
    __schema {
      queryType { fields { name description } }
    }
  }
`);
if (intro.json?.data?.__schema?.queryType?.fields) {
  const fields = intro.json.data.__schema.queryType.fields;
  console.log(`Total query fields: ${fields.length}`);
  // Print ALL field names sorted
  const names = fields.map(f => f.name).sort();
  console.log('All fields:\n ', names.join('\n  '));
  // Highlight anything that looks VLH-related
  const vlhFields = fields.filter(f =>
    /vlh|labor|work.*force|schedule.*config|config.*schedule|setting|configuration/i.test(f.name)
  );
  if (vlhFields.length) {
    console.log('\nPotentially relevant fields:');
    vlhFields.forEach(f => console.log(`  ${f.name}: ${f.description || '(no description)'}`));
  }
} else {
  console.log('Introspection failed or disabled:', intro.text.slice(0, 400));
}

// ── 6. Try the schedule type's own fields via introspection ──────────────
console.log('\n══ 6. Schedule type field introspection ═════════════════════════');
const typeIntro = await gql('IntrospectScheduleType', `
  query IntrospectScheduleType {
    __type(name: "Schedule") {
      name
      fields { name description type { name kind ofType { name kind } } }
    }
  }
`);
if (typeIntro.json?.data?.__type?.fields) {
  const fields = typeIntro.json.data.__type.fields;
  console.log(`Schedule type has ${fields.length} fields:`);
  fields.forEach(f => {
    const typeName = f.type?.name || f.type?.ofType?.name || f.type?.kind;
    console.log(`  ${f.name}: ${typeName}`);
  });
} else {
  console.log('Type introspection result:', typeIntro.text.slice(0, 400));
}

console.log('\nDone.');
