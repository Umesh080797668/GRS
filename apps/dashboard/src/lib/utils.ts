/**
 * Escapes CSV cell to defend against Excel / Calc formula injection (Plan Invariant 9 & M5.2).
 * Any cell starting with =, +, -, @, tab (\t), or carriage return (\r) is prefixed with a single quote (').
 */
export function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str.length === 0) return '""';

  let sanitized = str;
  if (
    sanitized.startsWith('=') ||
    sanitized.startsWith('+') ||
    sanitized.startsWith('-') ||
    sanitized.startsWith('@') ||
    sanitized.startsWith('\t') ||
    sanitized.startsWith('\r')
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
 * Official CSV template for household bulk import (M5.4 & Appendix B).
 */
export function getOfficialHouseholdTemplateCsv(): string {
  return [
    'house_no,house_leader_name,address,village_name,aswesuma,etf,epf,samurdhi,special_needs,target_female,target_male,age_group,lang_sinhala,lang_tamil,lang_english,num_members',
    '102/B,Sunil Perera,No. 102/B Kandy Road,Pallekele,yes,no,yes,no,no,2,1,18-35,yes,no,yes,4',
    '104,කමල් සිරිවර්ධන,ප්‍රධාන වීදිය,නුවර,ඔව්,නැත,ඔව්,නැත,නැත,1,2,18-25,ඔව්,නැත,නැත,5',
    '105/A,கமலேஸ்வரன்,கோயில் வீதி,யாழ்ப்பாணம்,ஆம்,இல்லை,ஆம்,இல்லை,ஆம்,0,2,20-40,இல்லை,ஆம்,இல்லை,3',
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

export interface DurationLabels {
  ltMin?: string;
  min?: string;
  mins?: string;
  hr?: string;
  hrs?: string;
}

/**
 * Formats an active duration in seconds into concise minutes/hours text (e.g. "45 mins", "2 hrs 15 mins").
 */
export function formatActiveDuration(
  seconds?: number | null,
  labels?: DurationLabels,
): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '-';
  }
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) {
    return labels?.ltMin ?? '< 1 min';
  }
  const totalMinutes = Math.floor(safe / 60);
  const minLabel = totalMinutes === 1 ? (labels?.min ?? 'min') : (labels?.mins ?? 'mins');
  if (totalMinutes < 60) {
    return `${totalMinutes} ${minLabel}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remMins = totalMinutes % 60;
  const hrLabel = hours === 1 ? (labels?.hr ?? 'hr') : (labels?.hrs ?? 'hrs');
  if (remMins === 0) {
    return `${hours} ${hrLabel}`;
  }
  const remMinLabel = remMins === 1 ? (labels?.min ?? 'min') : (labels?.mins ?? 'mins');
  return `${hours} ${hrLabel} ${remMins} ${remMinLabel}`;
}

export interface RelativeTimeLabels {
  justNow?: string;
  minAgo?: string;
  minsAgo?: string;
  hrAgo?: string;
  hrsAgo?: string;
  dayAgo?: string;
  daysAgo?: string;
}

/**
 * Formats an ISO timestamp into relative time for recent activity, falling back to full date after 7 days.
 */
export function formatRelativeTime(
  isoString?: string | null,
  nowMs: number = Date.now(),
  labels?: RelativeTimeLabels,
): string {
  if (!isoString) return '-';
  const ts = new Date(isoString).getTime();
  if (Number.isNaN(ts)) return isoString;

  const diffSeconds = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSeconds < 60) {
    return labels?.justNow ?? 'Just now';
  }
  const diffMins = Math.floor(diffSeconds / 60);
  if (diffMins < 60) {
    return `${diffMins} ${diffMins === 1 ? (labels?.minAgo ?? 'min ago') : (labels?.minsAgo ?? 'mins ago')}`;
  }
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? (labels?.hrAgo ?? 'hr ago') : (labels?.hrsAgo ?? 'hrs ago')}`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? (labels?.dayAgo ?? 'day ago') : (labels?.daysAgo ?? 'days ago')}`;
  }
  return formatDate(isoString);
}
