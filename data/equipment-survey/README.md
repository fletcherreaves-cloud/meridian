# Equipment Survey Data

Raw equipment reference material for the Equipment Profile project
(see `memory/project-equipment-profile.md`): McDonald's Planned
Maintenance cards, manufacturer-specific equipment resource sheets,
and a 2026 PM calendar, covering fryers, grills, toasters/steamers,
UHC, beverage/McCafe equipment, blended ice, combi ovens, prep lines,
and the simplified-breakfast staging cabinet.

## `qr-code-inventory.json`

113 unique QR codes decoded from the PDFs and images in this folder
(scanned 2026-10-18 — every PDF rendered page-by-page at 200 DPI and
checked with OpenCV's QR detector). Each entry: `source_file`, `page`,
the decoded `url`, and an inferred `manufacturer` from the URL's
domain. Most QR codes resolve to a manufacturer microsite keyed to a
specific equipment model (e.g. Taylor's `tcmcd.co/C835`, Frymaster's
`frymaster.com/QR-Codes/McD-s-BIELA14-T`) — the trailing path segment
is usually the manufacturer's own model code, directly useful for the
Equipment Profile catalog's manufacturer/model dropdown.

**Not yet resolved:** this session's network policy blocks outbound
access to these external sites, so none of the 113 URLs have actually
been fetched — the inventory is the decoded QR text only, not what's
behind each link. About a dozen entries are generic short-link
services (`l.ead.me`, `qrs.ly`, `tiny.cc`, `qrcodes.pro`, etc.) whose
real destination and manufacturer are unknown until followed. A
session with broader network access (environment Network access
settings → add the relevant domains, or a broader access level) could
resolve these and pull real model/spec data from each page.

## `Floor Plans/`

Real store layout material for the visual floor-plan placement feature:

- **`K-SHEETS.pdf`** (4 pages) — an architectural kitchen equipment
  layout drawing ("K-sheet"): symbol legend, equipment item numbers,
  hood/exhaust and utility routing callouts tied to specific floor
  positions. This is a real, large-format (24"x36") drawing sheet, not
  a simplified diagram — useful as source material for a simplified
  floor-plan template, not necessarily pinnable as-is.
- **`2026 Specialty Beverage Equipment & Technology Playbook.pdf`**
  (54 pages) — covers beverage-station build types (CBB, BDAP,
  Parallel CBB Cell, In-Store/Non-DT, Gas Station/Oil Alliance), each
  with its own "Current Restaurant Layout" section, equipment
  installation notes, a technology overview, and required/optional
  equipment lists. Its "Detailed Plans/Layouts" section (pages 28+)
  has real per-layout-type floor plans for beverage equipment
  specifically.

Owner note (2026-10-18): more documents like these may follow.
