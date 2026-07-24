// @ts-nocheck
// ── LifeLenz per-job (business-role) + per-employee shift rollup ───────────────
// Turns the LifeLenz `ShiftsForSchedulePeriod` response (per-shift `pivotMetrics`)
// into a per-STATION hours+cost breakdown (Drive-Thru / Grill / Lobby / …) and a
// per-EMPLOYEE breakdown for one schedule + week. Pure — no I/O. The pull script
// (scripts/) fetches the raw shifts; this reduces them the same way the client will.
// Reverse-engineering notes + endpoint shapes: memory/project-lifelenz-schedule-jobs.md.

// ── Name maps. businessRoleId UUIDs start 01979dc0-6…; jobTitleId UUIDs start
// 01979dc1-f…. Business-role names + categories are the AUTHORITATIVE set from LifeLenz
// GetBusinessRolesPaginated (`businessRoles`) for this org — not derived. Categories:
// Variable (VLH-driven stations), Floor (deployment), Fixed (management/task hours).
// `fixed` = LifeLenz isFixedHourRole. Job titles from GetPaginatedJobTitles /
// GetSchedulableEmploymentsForPeriod. Static config (rarely changes); refresh from that
// query if roles are added. See memory/project-lifelenz-schedule-jobs.md.
export const LIFELENZ_ROLE_CATEGORIES = { Variable: 'Variable', Floor: 'Floor', Fixed: 'Fixed' };

export const LIFELENZ_BUSINESS_ROLES = {
  '01979dc0-697b-7b98-a763-426c3fb27321': { name: 'Guest Experience Leader', code: 'GL', category: 'Fixed',    fixed: true  },
  '01979dc0-6988-70f6-8c94-2a2f1ad0069f': { name: 'OTP',                     code: 'TP', category: 'Fixed',    fixed: true  },
  '01979dc0-6994-79c9-93c9-65f0d32de5ca': { name: 'Floor Production',        code: 'FP', category: 'Floor',    fixed: false },
  '01979dc0-69a1-7100-bb7b-6036667f7e93': { name: 'Floor Guest Service',     code: 'FG', category: 'Floor',    fixed: false },
  '01979dc0-69ac-7572-996a-999baeb328aa': { name: 'Pre-Shift',              code: 'PS', category: 'Fixed',    fixed: true  },
  '01979dc0-69b7-78a4-b328-24e5c601251d': { name: 'Planned Maintenance',     code: 'PM', category: 'Fixed',    fixed: true  },
  '01979dc0-69c2-71bd-aa16-049d3f83ca29': { name: 'Birthday Parties',        code: 'BP', category: 'Fixed',    fixed: true  },
  '01979dc0-69cd-7bf5-8e50-69d01523fdc1': { name: 'Administration/Cash',     code: 'A',  category: 'Fixed',    fixed: true  },
  '01979dc0-69d9-7148-942e-7b6b73d3b075': { name: 'Window',                  code: 'W',  category: 'Variable', fixed: false },
  '01979dc0-69e5-75c9-9393-2c182a7c5aff': { name: 'Schedules',               code: 'SC', category: 'Fixed',    fixed: true  },
  '01979dc0-69ef-7502-bccc-c1d219170ed5': { name: 'VAT',                     code: 'V',  category: 'Fixed',    fixed: true  },
  '01979dc0-69fb-7a38-b382-787485a92c52': { name: 'Hiring',                  code: 'H',  category: 'Fixed',    fixed: true  },
  '01979dc0-6a09-7fad-8543-08b4741f7717': { name: 'Support / Prep',          code: 'S',  category: 'Fixed',    fixed: true  },
  '01979dc0-6a17-7bad-915c-8a8ee859c618': { name: 'Transition',              code: 'TR', category: 'Fixed',    fixed: true  },
  '01979dc0-6a26-7ce1-9790-08109fc38f18': { name: 'Beverage Specialist',     code: 'BS', category: 'Variable', fixed: false },
  '01979dc0-6a3a-7651-8a71-39b5f3fd8454': { name: 'Maintenance',             code: 'M',  category: 'Fixed',    fixed: true  },
  '01979dc0-6a4a-7851-9173-0977a41ac4fe': { name: 'Lobby',                   code: 'L',  category: 'Fixed',    fixed: true  },
  '01979dc0-6a58-7005-b9b8-5dcb751036c9': { name: 'Food Safety',             code: 'FS', category: 'Fixed',    fixed: true  },
  '01979dc0-6a63-74f2-9d0f-13090edd7fd5': { name: 'Manager Meeting',         code: 'MM', category: 'Fixed',    fixed: true  },
  '01979dc0-6a6e-7acb-a7af-ea86644434fd': { name: 'Training',                code: 'T',  category: 'Fixed',    fixed: true  },
  '01979dc0-6a78-72ae-9fef-9c3db2ad393d': { name: 'Individual Development',  code: 'ID', category: 'Fixed',    fixed: true  },
  '01979dc0-6a83-7b88-91db-286cada92a70': { name: 'Walk Thrus',              code: 'WT', category: 'Fixed',    fixed: true  },
  '01979dc0-6a8e-7de3-b3b1-0ea97b89519d': { name: 'Truck Delivery',          code: 'TD', category: 'Fixed',    fixed: true  },
  '01979dc0-6a99-77e5-8cf9-d31da3267511': { name: 'Grill Breakfast Menu',    code: 'GB', category: 'Variable', fixed: false },
  '01979dc0-6aa4-7588-a1e0-12bc0c68c611': { name: 'Floor',                   code: 'FL', category: 'Floor',    fixed: false },
  '01979dc0-6ab1-7a1b-8416-360f7cdbf6f6': { name: 'STAT',                    code: 'ST', category: 'Fixed',    fixed: true  },
  '01979dc0-6abd-7f7c-92c4-17c9068d57ce': { name: 'Grill Regular Menu',      code: 'G',  category: 'Variable', fixed: false },
  '01979dc0-6ac8-7f96-a0c6-5dc3160e325c': { name: 'Opening',                 code: 'O',  category: 'Fixed',    fixed: true  },
  '01979dc0-6ad2-73f4-be3d-643db3f03cb5': { name: 'Closing',                 code: 'C',  category: 'Fixed',    fixed: true  },
  '01979dc0-6add-7b96-85a6-ec6d554a5242': { name: 'French Fries',            code: 'FF', category: 'Variable', fixed: false },
  '01979dc0-6ae8-7b1d-b5ae-019cdcf11291': { name: 'Hashbrown',               code: 'HB', category: 'Variable', fixed: false },
  '01979dc0-6af3-786a-82a1-17bd10262233': { name: 'Drive Thru',              code: 'D',  category: 'Variable', fixed: false },
  '01979dc0-6b00-77fb-b711-eb5e9dc01cab': { name: 'General Manager',         code: 'GM', category: 'Fixed',    fixed: true  },
  '01979dc0-6b0c-78df-abcb-d506051eaacc': { name: 'LZ_AOS',                  code: '--', category: 'Variable', fixed: false },
};

export const LIFELENZ_JOB_TITLES = {
  '01979dc1-f6c5-7c6a-9fd2-795eb55753f2': 'General Manager',        // 00641 (salaried)
  '01979dc1-f616-74d4-8b7d-15eaf2fb5a32': 'Cert. Swing Mgr.',       // 00647
  '01979dc1-f61f-754f-afc6-b794296c0e13': 'Crew Trainer',          // 00648
  '01979dc1-f628-7bd6-9439-c855d07e906e': 'Crew Person',           // 00650
  '01979dc1-f5a1-782d-8a86-7fa8c8b3926c': 'Backup Maintenance',    // 00670
  '01979dc1-f6a1-7935-9b41-4d027cdc6b6a': 'Shift Manager Trainee', // 00739
  '01979dc1-f5ac-7e66-a074-741f6007ee9c': 'Dept Mgr I',           // 10001
};

const _n = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
const _shortId = id => 'Role ' + String(id || '').slice(-4);

export const resolveRoleMeta  = id => LIFELENZ_BUSINESS_ROLES[id] || null;
export const resolveRoleName  = id => (LIFELENZ_BUSINESS_ROLES[id] && LIFELENZ_BUSINESS_ROLES[id].name) || (id ? _shortId(id) : 'Unknown');
export const resolveJobTitle  = id => LIFELENZ_JOB_TITLES[id] || null;

// Normalize the `shifts.edges[].node` list (or an already-unwrapped node array).
function _nodes(shifts) {
  if (!shifts) return [];
  if (Array.isArray(shifts)) return shifts.map(s => (s && s.node) ? s.node : s);
  if (Array.isArray(shifts.edges)) return shifts.edges.map(e => e.node).filter(Boolean);
  return [];
}

// Only committed, in-store shifts count toward the schedule's hours+cost. Open/offer
// shifts are proposals (null earnings); shifts on OTHER schedules (shared-store bleed)
// are filtered by scheduleId. shiftType 'roster' = the committed roster; 'time_off' has
// no pivotMetrics. A REJECTED roster shift also carries shiftType 'roster' but has a null
// assignedEmploymentId and null earnings (with non-zero seconds) — requiring an assigned
// employee drops those phantom hours. Pass {includeTypes} to override (default ['roster']).
function _committed(nodes, { scheduleId, includeTypes = ['roster'] } = {}) {
  const okType = new Set(includeTypes);
  return nodes.filter(nd =>
    nd &&
    Array.isArray(nd.pivotMetrics) && nd.pivotMetrics.length &&
    okType.has(nd.shiftType) &&
    nd.assignedEmploymentId &&
    (!scheduleId || nd.scheduleId === scheduleId)
  );
}

const _hrs = seg => _n(seg.seconds) / 3600;

// Per-STATION (businessRoleId) rollup across all committed shifts.
// → [{ businessRoleId, name, hours, cost, regHours, otHours, nShifts }], hours desc.
export function rollupShiftsByRole(shifts, opts = {}) {
  const nodes = _committed(_nodes(shifts), opts);
  const byRole = new Map();
  for (const nd of nodes) {
    const shiftRoles = new Set();
    for (const seg of nd.pivotMetrics) {
      const rid = seg.businessRoleId;
      if (!rid) continue;
      let r = byRole.get(rid);
      if (!r) { const m = resolveRoleMeta(rid); r = { businessRoleId: rid, name: resolveRoleName(rid), category: m ? m.category : null, code: m ? m.code : null, hours: 0, cost: 0, regHours: 0, otHours: 0, nShifts: 0 }; byRole.set(rid, r); }
      const h = _hrs(seg);
      r.hours += h; r.cost += _n(seg.earnings);
      if (seg.payType === 'overtime') r.otHours += h; else r.regHours += h;
      shiftRoles.add(rid);
    }
    for (const rid of shiftRoles) byRole.get(rid).nShifts += 1; // count a shift once per role it touches
  }
  return [...byRole.values()].sort((a, b) => b.hours - a.hours);
}

// Per-EMPLOYEE rollup. Pass {roster} (from GetSchedulableEmploymentsForPeriod) as
// either an array of employment nodes or a Map/obj employmentId→{computedName, employmentRate,…}
// to attach names + the primary job title.
export function rollupShiftsByEmployee(shifts, opts = {}) {
  const nodes = _committed(_nodes(shifts), opts);
  const roster = _rosterMap(opts.roster);
  const byEmp = new Map();
  for (const nd of nodes) {
    const eid = nd.assignedEmploymentId;
    if (!eid) continue;
    let e = byEmp.get(eid);
    if (!e) {
      const info = roster.get(eid) || {};
      e = {
        employmentId: eid,
        name: info.computedName || info.name || null,
        jobTitle: _primaryJobTitle(info),
        rate: _n(info.employmentRate),
        hours: 0, cost: 0, regHours: 0, otHours: 0, nShifts: 0,
      };
      byEmp.set(eid, e);
    }
    let shiftHrs = 0;
    for (const seg of nd.pivotMetrics) {
      const h = _hrs(seg);
      e.hours += h; e.cost += _n(seg.earnings);
      if (seg.payType === 'overtime') e.otHours += h; else e.regHours += h;
      shiftHrs += h;
    }
    if (shiftHrs > 0) e.nShifts += 1;
  }
  return [...byEmp.values()].sort((a, b) => b.hours - a.hours);
}

function _rosterMap(roster) {
  const m = new Map();
  if (!roster) return m;
  if (roster instanceof Map) return roster;
  const list = Array.isArray(roster) ? roster.map(r => (r && r.node) ? r.node : r)
             : Array.isArray(roster.edges) ? roster.edges.map(e => e.node) : null;
  if (list) { for (const nd of list) if (nd && nd.id) m.set(nd.id, nd); return m; }
  for (const k of Object.keys(roster)) m.set(k, roster[k]); // plain obj keyed by id
  return m;
}

function _primaryJobTitle(info) {
  if (!info) return null;
  // Prefer the active employmentRate's jobTitle name; fall back to id→name map.
  const rates = Array.isArray(info.employmentRates) ? info.employmentRates : [];
  const active = rates.find(r => r && r.status === 'active') || rates[rates.length - 1];
  if (active && active.jobTitle && active.jobTitle.name) return _titleCase(active.jobTitle.name);
  if (active && active.jobTitleId) return resolveJobTitle(active.jobTitleId);
  return null;
}

const _titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

// Convenience: both rollups + totals for one schedule/week.
export function computeShiftJobs(shifts, opts = {}) {
  const byRole = rollupShiftsByRole(shifts, opts);
  const byEmployee = rollupShiftsByEmployee(shifts, opts);
  const totalHours = byRole.reduce((s, r) => s + r.hours, 0);
  const totalCost  = byRole.reduce((s, r) => s + r.cost, 0);
  return {
    byRole, byEmployee,
    totalHours, totalCost,
    avgRate: totalHours > 0 ? totalCost / totalHours : null, // $/hr, dollar-weighted
    nEmployees: byEmployee.length,
  };
}
