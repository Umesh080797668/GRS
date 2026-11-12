import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TRANSLATIONS } from './translations.ts';

describe('Dashboard Trilingual Parity (en / si / ta)', () => {
  it('ensures every English key has non-empty Sinhala and Tamil translations', () => {
    const enKeys = Object.keys(TRANSLATIONS.en);
    const siKeys = new Set(Object.keys(TRANSLATIONS.si));
    const taKeys = new Set(Object.keys(TRANSLATIONS.ta));

    const missingSi = enKeys.filter((k) => !siKeys.has(k) || !TRANSLATIONS.si[k]?.trim());
    const missingTa = enKeys.filter((k) => !taKeys.has(k) || !TRANSLATIONS.ta[k]?.trim());

    assert.deepStrictEqual(missingSi, [], `Missing Sinhala keys: ${missingSi.join(', ')}`);
    assert.deepStrictEqual(missingTa, [], `Missing Tamil keys: ${missingTa.join(', ')}`);
  });

  it('normalizes Sinhala and Tamil reports translations to NFC cleanly', () => {
    for (const [k, v] of Object.entries(TRANSLATIONS.si)) {
      if (k.startsWith('reports.') || k === 'nav.reports') {
        assert.strictEqual(v, v.normalize('NFC'), `Key ${k} (si) is not NFC normalized`);
      }
    }
    for (const [k, v] of Object.entries(TRANSLATIONS.ta)) {
      if (k.startsWith('reports.') || k === 'nav.reports') {
        assert.strictEqual(v, v.normalize('NFC'), `Key ${k} (ta) is not NFC normalized`);
      }
    }
  });
});

