// Seed the Event Impact Registry (event_impact) with the football home/away lifts (Notes 47).
// Run AFTER creating the table (supabase/schema-event-impact.sql).
//   node scripts/seed-event-impact.mjs
// Reads scripts/data/football-lift-seed.json (n-shrunk % + raw measured %). event_type='sports'.
// Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const SB_URL=process.env.VITE_SUPABASE_URL, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!SB_URL||!KEY){ console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb=createClient(SB_URL,KEY,{auth:{persistSession:false}});
const _dir=path.dirname(fileURLToPath(import.meta.url));
const seed=JSON.parse(fs.readFileSync(path.join(_dir,'data','football-lift-seed.json'),'utf8'));
const rows=seed.map(r=>({
  loc:String(r.loc), event_type:'sports',
  home_impact:r.home/100, away_impact:r.away/100,
  measured_home:r.rawH==null?null:r.rawH/100, measured_away:r.rawA==null?null:r.rawA/100,
  n_home:r.nH, n_away:r.nA, source:'measured', updated_by:'seed-event-impact', updated_at:new Date().toISOString(),
}));
const { error } = await sb.from('event_impact').upsert(rows,{onConflict:'loc,event_type'});
if(error){ console.error('seed error:',error.message); process.exit(1); }
console.log(`✓ Seeded ${rows.length} store sports-impact rows into event_impact.`);
