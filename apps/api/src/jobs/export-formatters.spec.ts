import {
  APP_TIMEZONE,
  formatColomboTimestamp,
  parseColomboDateBoundary,
} from './export-formatters';

describe('Strict GMT+5:30 (Asia/Colombo) API Time Formatting & Date Boundary Parsing', () => {
  it('enforces Asia/Colombo as the application timezone', () => {
    expect(APP_TIMEZONE).toBe('Asia/Colombo');
  });

  describe('formatColomboTimestamp', () => {
    it('formats UTC ISO strings strictly into GMT+5:30 (Asia/Colombo) timestamps with IST marker', () => {
      // 00:00 UTC = 05:30 Colombo time
      expect(formatColomboTimestamp('2026-11-13T00:00:00Z')).toBe(
        '2026-11-13 05:30 IST',
      );
      // 19:00 UTC = 00:30 Colombo time on following day
      expect(formatColomboTimestamp('2026-11-13T19:00:00Z')).toBe(
        '2026-11-14 00:30 IST',
      );
    });

    it('handles Date objects and invalid or empty values safely', () => {
      const dt = new Date('2026-11-13T10:45:00Z'); // 16:15 Colombo
      expect(formatColomboTimestamp(dt)).toBe('2026-11-13 16:15 IST');
      expect(formatColomboTimestamp(null)).toBe('');
      expect(formatColomboTimestamp(undefined)).toBe('');
      expect(formatColomboTimestamp('invalid-date')).toBe('');
    });
  });

  describe('parseColomboDateBoundary', () => {
    it('parses YYYY-MM-DD date-only strings into start of day (00:00:00.000 +05:30)', () => {
      const start = parseColomboDateBoundary('2026-11-01', false);
      // 2026-11-01 00:00:00 +05:30 is 2026-10-31 18:30:00 UTC
      expect(start.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    });

    it('parses YYYY-MM-DD date-only strings into end of day (23:59:59.999 +05:30)', () => {
      const end = parseColomboDateBoundary('2026-11-05', true);
      // 2026-11-05 23:59:59.999 +05:30 is 2026-11-05 18:29:59.999 UTC
      expect(end.toISOString()).toBe('2026-11-05T18:29:59.999Z');
    });

    it('preserves ISO timestamps that already specify time or timezone', () => {
      const iso = '2026-11-01T12:00:00.000Z';
      const parsed = parseColomboDateBoundary(iso);
      expect(parsed.toISOString()).toBe(iso);
    });
  });
});

