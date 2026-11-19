/**
 * Pilot area bulk-import CSV <-> grid helpers (M1.7).
 *
 * The CSV template has 10 columns. The grid editor keeps ALL of them so a
 * grid <-> CSV round trip never loses data (secretary e-mail and max members
 * per team used to be silently dropped).
 */

export interface PilotGridRow {
  id: string;
  district: string;
  dsDivision: string;
  gnNumber: string;
  gnName: string;
  secretaryName: string;
  secretaryContact: string;
  /** Optional: kept so uploaded CSV values survive grid edits. */
  secretaryEmail?: string;
  sdoName: string;
  initialTeams: number;
  /** Optional: kept so uploaded CSV values survive grid edits. Defaults to 10. */
  maxMembersPerTeam?: number;
}

export const PILOT_CSV_HEADER =
  'district,ds_division,gn_number,gn_name,secretary_name,secretary_contact,secretary_email,sdo_name,initial_teams,max_members_per_team';

export const DEFAULT_MAX_MEMBERS_PER_TEAM = 10;

function escapeCsvValue(val: unknown): string {
  // The API splits the file on line breaks before reading quotes, so a line break inside a
  // field would corrupt the row there. Never emit one: collapse it to a single space.
  const str = String(val ?? '').replace(/[\r\n]+/g, ' ');
  if (str.includes(',') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function gridToCsv(rows: PilotGridRow[]): string {
  const csvRows = rows.map((r) =>
    [
      r.district.trim(),
      r.dsDivision.trim(),
      r.gnNumber.trim(),
      r.gnName.trim(),
      r.secretaryName.trim(),
      r.secretaryContact.trim(),
      (r.secretaryEmail ?? '').trim(),
      r.sdoName.trim(),
      r.initialTeams ?? 0,
      r.maxMembersPerTeam ?? DEFAULT_MAX_MEMBERS_PER_TEAM,
    ]
      .map(escapeCsvValue)
      .join(','),
  );
  return [PILOT_CSV_HEADER, ...csvRows].join('\n');
}

/**
 * Minimal RFC-4180 style tokenizer: quoted fields may contain commas, doubled
 * quotes and line breaks. Handles a leading UTF-8 BOM and \r\n / \n / \r.
 * Blank lines and `#` comment lines are skipped.
 */
export function parseCsvRecords(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    record.push(field.trim());
    field = '';
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushRecord();
    } else if (c === '\r') {
      if (src[i + 1] === '\n') i++;
      pushRecord();
    } else {
      field += c;
    }
  }
  if (field !== '' || record.length > 0) pushRecord();

  return records.filter((r) => {
    const isBlank = r.every((cell) => cell === '');
    const isComment = (r[0] ?? '').startsWith('#');
    return !isBlank && !isComment;
  });
}

const normHeader = (h: string) => h.toLowerCase().replace(/^["']|["']$/g, '').replace(/[\s_-]+/g, '');

let rowCounter = 0;
const newRowId = (i: number) => `row-${i}-${Date.now()}-${(rowCounter++).toString(36)}`;

const toInt = (raw: string | undefined, fallback: number): number => {
  const n = parseInt(raw ?? '', 10);
  return Number.isNaN(n) ? fallback : n;
};

/**
 * Parses pilot-area CSV text into grid rows.
 * - Header aliases are matched ignoring case, spaces, `_` and `-`.
 * - If the first row is not a header (none of the district / DS / GN columns
 *   recognised) it is treated as DATA and columns are read in template order,
 *   so the first data row is no longer swallowed as a "header".
 */
export function parseCsvToGrid(csvText: string): PilotGridRow[] {
  const records = parseCsvRecords(csvText);
  if (records.length === 0) return [];

  const headerNorm = records[0].map(normHeader);
  const findCol = (...aliases: string[]) => {
    for (const a of aliases) {
      const idx = headerNorm.indexOf(normHeader(a));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const found = {
    district: findCol('district', 'district_name', 'districtname'),
    dsDivision: findCol('ds_division', 'dsdivision', 'ds_name', 'ds', 'divisional_secretariat'),
    gnNumber: findCol('gn_number', 'gnnumber', 'gn_no', 'gnno', 'gn_code', 'gncode'),
    gnName: findCol('gn_name', 'gnname', 'gn_division', 'gndivision', 'grama_niladhari'),
  };
  const hasHeader = Object.values(found).some((i) => i !== -1);

  if (!hasHeader && records.length === 0) return [];
  const dataRecords = hasHeader ? records.slice(1) : records;

  const colIdx = hasHeader
    ? {
        district: found.district !== -1 ? found.district : 0,
        dsDivision: found.dsDivision !== -1 ? found.dsDivision : 1,
        gnNumber: found.gnNumber !== -1 ? found.gnNumber : 2,
        gnName: found.gnName !== -1 ? found.gnName : 3,
        secName: findCol('secretary_name', 'secretaryname', 'secretary', 'gn_secretary'),
        secContact: findCol('secretary_contact', 'secretarycontact', 'secretary_phone', 'contact', 'phone'),
        secEmail: findCol('secretary_email', 'secretaryemail', 'email'),
        sdoName: findCol('sdo_name', 'sdoname', 'sdo'),
        initialTeams: findCol('initial_teams', 'initialteams', 'teams', 'team_count', 'number_of_teams'),
        maxMembers: findCol('max_members_per_team', 'maxmembersperteam', 'max_members', 'maxmembers', 'team_limit'),
      }
    : {
        // Header-less file: template column order.
        district: 0,
        dsDivision: 1,
        gnNumber: 2,
        gnName: 3,
        secName: 4,
        secContact: 5,
        secEmail: 6,
        sdoName: 7,
        initialTeams: 8,
        maxMembers: 9,
      };

  const cell = (parts: string[], idx: number) => (idx !== -1 ? parts[idx] || '' : '');

  return dataRecords.map((parts, i) => ({
    id: newRowId(i + 1),
    district: cell(parts, colIdx.district),
    dsDivision: cell(parts, colIdx.dsDivision),
    gnNumber: cell(parts, colIdx.gnNumber),
    gnName: cell(parts, colIdx.gnName),
    secretaryName: cell(parts, colIdx.secName),
    secretaryContact: cell(parts, colIdx.secContact),
    secretaryEmail: cell(parts, colIdx.secEmail),
    sdoName: cell(parts, colIdx.sdoName),
    initialTeams: colIdx.initialTeams !== -1 ? toInt(parts[colIdx.initialTeams], 0) : 0,
    maxMembersPerTeam:
      colIdx.maxMembers !== -1
        ? toInt(parts[colIdx.maxMembers], DEFAULT_MAX_MEMBERS_PER_TEAM)
        : DEFAULT_MAX_MEMBERS_PER_TEAM,
  }));
}
