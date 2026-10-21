// One-time live upload: equipment_catalog TYPE-level reference photos -> Supabase Storage
// bucket 'equipment-catalog-photos' (public, created here via the Storage API rather than a SQL
// migration -- see schema-equipment-catalog-photos.sql's header for why).
//
// Source images: compressed JPEGs rendered from the real manufacturer/PM-card reference PDFs in
// data/equipment-survey/Help Files/. Every source document was checked for a Proprietary/
// Confidential/Classified marking before use; two candidates (Simplified Breakfast Combi Oven
// Best Practices, Simplified Breakfast Staging Cabinet Best Practices) carried "Classified -
// Confidential © McDonald's" and were swapped for a clean alternate source covering the same
// equipment type (the Convotherm/Moffat MCD PM Cards respectively) -- see the SRC map below for
// the exact source file used per type.
//
// Run once: node scripts/upload-equipment-catalog-photos.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const HELP_FILES = path.join(REPO_ROOT, 'data/equipment-survey/Help Files');

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key);

const BUCKET = 'equipment-catalog-photos';

// catalog type -> {source PDF (relative to Help Files), page to render}. One real product-photo
// page per type, matching equipment_catalog.type values (schema-equipment-catalog.sql).
const SRC = {
  grill:          { file: 'Grills/Grills Equipment Resource - Taylor.pdf', page: 1 },
  fryer:          { file: 'Fryers/Fryer Equipment Resource - Frymaster.pdf', page: 1 },
  toaster:        { file: 'Toasters:Steamers/Toaster Equipment Resource.pdf', page: 1 },
  steamer:        { file: 'Toasters:Steamers/Steamer Equipment Resource.pdf', page: 1 },
  combi_oven:     { file: 'Equipment PM Cards/Original/60868 Convotherm Combi Oven MCD US CARD ENG.pdf', page: 1 },
  uhc:            { file: 'UHC/UHC Equipment Resource.pdf', page: 1 },
  staging_cabinet:{ file: 'Equipment PM Cards/Original/60689 Moffat Staging Cabinet MCD US CARD ENG.pdf', page: 1 },
  prep_line:      { file: 'Prep Lines/COPL Prep Line Conveyor QC Conveyor Resources.pdf', page: 1 },
  blended_ice:    { file: 'Blended Ice/BIC_BIM Equipment Resource.pdf', page: 1 },
  abs:            { file: 'Beverage:McCafe/ABS/ABS Equipment Resources.pdf', page: 1 },
  juice_dispenser:{ file: 'Beverage:McCafe/Juice Dispensers/Juice Dispenser Equipment Resources.pdf', page: 1 },
  sweetener_creamer_dispenser: { file: 'Beverage:McCafe/Sweetener:Creamer Dispenser Equipment Resources/Sweetener_Creamer Dispenser Equipment Resources.pdf', page: 1 },
  espresso_1step: { file: 'Beverage:McCafe/1-Step Espresso/Specialty McCafe 1Step Espresso Equipment Resource.pdf', page: 1 },
  espresso_2step: { file: 'Beverage:McCafe/2-Step Espresso/Specialty McCafe 2Step Espresso Equipment Resource.pdf', page: 1 },
  shake_sundae:   { file: 'Equipment PM Cards/Original/57448 McFlurry Shake Sundae DAILY MCD US CARD.pdf', page: 1 },
};

async function ensureBucket() {
  const { data: buckets, error: listErr } = await sb.storage.listBuckets();
  if (listErr) throw listErr;
  if (buckets.some(b => b.id === BUCKET)) { console.log('Bucket already exists:', BUCKET); return; }
  const { error } = await sb.storage.createBucket(BUCKET, {
    public: true, fileSizeLimit: 5242880, allowedMimeTypes: ['image/jpeg', 'image/png'],
  });
  if (error) throw error;
  console.log('Created bucket:', BUCKET);
}

function renderAndCompress(pdfPath, page, outJpg) {
  const tmpBase = path.join(os.tmpdir(), 'eqcat-' + path.basename(outJpg, '.jpg'));
  execSync(`pdftoppm -png -r 110 -f ${page} -l ${page} "${pdfPath}" "${tmpBase}"`, { stdio: 'pipe' });
  // poppler pads the page-number suffix to the digit-width of the SOURCE doc's total page count,
  // not the 1-page range requested -- glob for whatever it actually produced rather than guessing.
  const dir = path.dirname(tmpBase), base = path.basename(tmpBase);
  const match = fs.readdirSync(dir).find(f => f.startsWith(base + '-') && f.endsWith('.png'));
  if (!match) throw new Error(`pdftoppm produced no output for ${pdfPath}`);
  const realPng = path.join(dir, match);
  // Resize/compress via a one-off Python call (Pillow is available in this environment).
  const py = `
from PIL import Image
im = Image.open("${realPng}").convert("RGB")
w, h = im.size
new_w = 900
new_h = int(h * (new_w / w))
im = im.resize((new_w, new_h), Image.LANCZOS)
im.save("${outJpg}", "JPEG", quality=78, optimize=True)
`;
  execSync(`python3 -I -c '${py}'`, { stdio: 'pipe' });
  fs.unlinkSync(realPng);
}

async function main() {
  await ensureBucket();
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'eqcat-out-'));

  for (const [type, src] of Object.entries(SRC)) {
    const pdfPath = path.join(HELP_FILES, src.file);
    if (!fs.existsSync(pdfPath)) { console.warn('MISSING source PDF for', type, ':', pdfPath); continue; }
    const outJpg = path.join(tmpOut, `${type}.jpg`);
    renderAndCompress(pdfPath, src.page, outJpg);
    const buf = fs.readFileSync(outJpg);
    const { error } = await sb.storage.from(BUCKET).upload(`${type}.jpg`, buf, {
      contentType: 'image/jpeg', upsert: true, cacheControl: '31536000',
    });
    if (error) { console.error('Upload failed for', type, ':', error.message); continue; }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(`${type}.jpg`);
    console.log(type, '->', pub.publicUrl, `(${(buf.length / 1024).toFixed(0)} KB)`);
  }

  fs.rmSync(tmpOut, { recursive: true, force: true });
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
