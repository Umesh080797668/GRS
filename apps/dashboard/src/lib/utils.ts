/**
 * Escapes CSV cell to defend against Excel / Calc formula injection (M5.2 Done When).
 * Cells starting with =, +, -, or @ are prefixed with a single quote (').
 */
export function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).trim();
  if (str.length === 0) return '""';

  let sanitized = str;
  if (
    sanitized.startsWith('=') ||
    sanitized.startsWith('+') ||
    sanitized.startsWith('-') ||
    sanitized.startsWith('@')
  ) {
    sanitized = `'${sanitized}`;
  }

  return `"${sanitized.replace(/"/g, '""')}"`;
}

/**
 * Builds injection-safe CSV content from credential items (M5.2).
 */
export function buildCredentialsCsv(
  credentials: Array<{ userCode: string; role: string; fullName?: string; initialPassword?: string }>
): string {
  const header = ['User Code', 'Role', 'Full Name', 'Initial Password'];
  const rows = credentials.map((c) => [
    sanitizeCsvCell(c.userCode),
    sanitizeCsvCell(c.role),
    sanitizeCsvCell(c.fullName || ''),
    sanitizeCsvCell(c.initialPassword || ''),
  ]);

  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Triggers a client-side file download in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Official CSV template for household bulk import (M5.4).
 */
export function getOfficialHouseholdTemplateCsv(): string {
  return [
    'house_no,household_head,address,village,num_members,samurdhi,aswesuma,special_needs',
    '102/B,Sunil Perera,No. 102/B Kandy Road,Pallekele,4,yes,no,no',
    '104,කමල් සිරිවර්ධන,ප්‍රධාන වීදිය,නුවර,5,no,yes,no',
    '105/A,கமலேஸ்வரன்,கோயில் வீதி,யாழ்ப்பாணம்,3,no,no,yes',
  ].join('\n');
}

export function formatDate(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}
