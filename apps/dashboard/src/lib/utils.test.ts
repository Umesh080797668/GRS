import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatActiveDuration,
  formatDate,
  formatDateOnly,
  formatRelativeTime,
  formatRoleLabel,
  formatTimeOnly,
  getColomboDateString,
  APP_TIMEZONE,
} from './utils.ts';

describe('Dashboard activity duration & relative time formatting', () => {
  it('formats durations into < 1 min, minutes, hours, and hours+minutes cleanly', () => {
    assert.strictEqual(formatActiveDuration(null), '-');
    assert.strictEqual(formatActiveDuration(undefined), '-');
    assert.strictEqual(formatActiveDuration(0), '< 1 min');
    assert.strictEqual(formatActiveDuration(45), '< 1 min');
    assert.strictEqual(formatActiveDuration(60), '1 min');
    assert.strictEqual(formatActiveDuration(15 * 60 + 20), '15 mins');
    assert.strictEqual(formatActiveDuration(60 * 60), '1 hr');
    assert.strictEqual(formatActiveDuration(2 * 3600 + 60), '2 hrs 1 min');
    assert.strictEqual(formatActiveDuration(3 * 3600 + 27 * 60), '3 hrs 27 mins');
  });

  it('formats recent activity timestamps into relative strings and falls back to date', () => {
    const now = new Date('2026-11-11T12:00:00Z').getTime();
    assert.strictEqual(formatRelativeTime(null, now), '-');
    assert.strictEqual(
      formatRelativeTime(new Date(now - 20_000).toISOString(), now),
      'Just now',
    );
    assert.strictEqual(
      formatRelativeTime(new Date(now - 60_000).toISOString(), now),
      '1 min ago',
    );
    assert.strictEqual(
      formatRelativeTime(new Date(now - 18 * 60_000).toISOString(), now),
      '18 mins ago',
    );
    assert.strictEqual(
      formatRelativeTime(new Date(now - 3 * 3600_000).toISOString(), now),
      '3 hrs ago',
    );
    assert.strictEqual(
      formatRelativeTime(new Date(now - 2 * 86400_000).toISOString(), now),
      '2 days ago',
    );
    const tenDaysAgo = new Date(now - 10 * 86400_000).toISOString();
    const formatted = formatRelativeTime(tenDaysAgo, now);
    assert.ok(!formatted.includes('ago') && formatted.includes('2026'));
  });

  it('formats internal roles into SDA Officer (Level 3) and compact display labels', () => {
    assert.strictEqual(formatRoleLabel('sda'), 'SDA Officer (Level 3)');
    assert.strictEqual(formatRoleLabel('sda', true), 'SDA Officer (L3)');
    assert.strictEqual(formatRoleLabel('super_admin'), 'Super Admin (Level 00)');
    assert.strictEqual(formatRoleLabel('cdc_secretary'), 'CDC Secretary (Level 4)');
    assert.strictEqual(formatRoleLabel(undefined), '-');
  });

  describe('Strict GMT+5:30 (Asia/Colombo) date & time formatting', () => {
    it('uses Asia/Colombo as the application timezone constant', () => {
      assert.strictEqual(APP_TIMEZONE, 'Asia/Colombo');
    });

    it('formats UTC ISO strings strictly into GMT+5:30 dates and times', () => {
      // 00:00 UTC = 05:30 IST
      assert.strictEqual(formatDate('2026-11-13T00:00:00Z'), '13 Nov 2026, 05:30');
      // 19:00 UTC = 00:30 IST on the following day
      assert.strictEqual(formatDate('2026-11-13T19:00:00Z'), '14 Nov 2026, 00:30');
      assert.strictEqual(formatDate(undefined), '-');
      assert.strictEqual(formatDate(''), '-');
    });

    it('formats date-only strings in GMT+5:30 correctly', () => {
      assert.strictEqual(formatDateOnly('2026-11-13T00:00:00Z'), '13 Nov 2026');
      assert.strictEqual(formatDateOnly('2026-11-13T19:00:00Z'), '14 Nov 2026');
      assert.strictEqual(formatDateOnly(undefined), '-');
    });

    it('formats time-only strings in GMT+5:30 correctly', () => {
      assert.strictEqual(formatTimeOnly('2026-11-13T00:00:00Z'), '05:30');
      assert.strictEqual(formatTimeOnly('2026-11-13T19:00:00Z'), '00:30');
      assert.strictEqual(formatTimeOnly(undefined), '-');
    });

    it('generates YYYY-MM-DD date strings in GMT+5:30', () => {
      const d1 = new Date('2026-11-13T18:00:00Z'); // 23:30 Colombo time -> 2026-11-13
      const d2 = new Date('2026-11-13T19:00:00Z'); // 00:30 Colombo time -> 2026-11-14
      assert.strictEqual(getColomboDateString(d1), '2026-11-13');
      assert.strictEqual(getColomboDateString(d2), '2026-11-14');
    });
  });
});
