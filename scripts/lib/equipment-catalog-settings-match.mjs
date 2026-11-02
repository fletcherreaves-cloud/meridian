// Pure matcher: PQRG settings seed group -> matching equipment_catalog rows. Split out of
// seed-equipment-catalog-settings.mjs so it can be imported by the test suite without pulling in
// that script's top-level Supabase client / env-var requirement (which would process.exit(1)
// under test).
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function matchCatalogItems(group, catalogRows) {
  const type = norm(group.type);
  let rows = catalogRows.filter((c) => norm(c.type) === type);
  if (group.matchType === 'manufacturer' || group.matchType === 'model') {
    const mfr = norm(group.manufacturer);
    rows = rows.filter((c) => norm(c.manufacturer).includes(mfr) || mfr.includes(norm(c.manufacturer)));
  }
  if (group.matchType === 'model') {
    const mc = norm(group.modelContains);
    rows = rows.filter((c) => norm(c.model).includes(mc));
  }
  return rows;
}
