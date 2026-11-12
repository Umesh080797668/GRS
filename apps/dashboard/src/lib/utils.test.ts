import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatActiveDuration,
  formatRelativeTime,
  formatRoleLabel,
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

  it('formats internal roles into SDO Officer (Level 3) and compact display labels', () => {
    assert.strictEqual(formatRoleLabel('sda'), 'SDO Officer (Level 3)');
    assert.strictEqual(formatRoleLabel('sda', true), 'SDO Officer (L3)');
    assert.strictEqual(formatRoleLabel('super_admin'), 'Super Admin (Level 00)');
    assert.strictEqual(formatRoleLabel('cdc_secretary'), 'CDC Secretary (Level 4)');
    assert.strictEqual(formatRoleLabel(undefined), '-');
  });
});
