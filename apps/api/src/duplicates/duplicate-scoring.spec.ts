import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeDuplicateName,
  normalizePhoneForDuplicate,
  nameSimilarity,
  scoreDuplicatePair,
  classifyDuplicateScore,
  DuplicateScoringInput,
} from './duplicate-scoring';

describe('Duplicate Scoring Engine (M6.1 & M6.2)', () => {
  const vectorsPath = path.resolve(
    __dirname,
    '../../../../docs/test-vectors/duplicates.json',
  );
  let vectors: any;

  beforeAll(() => {
    vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
  });

  describe('normalizeDuplicateName (M6.1)', () => {
    it('strips honorifics, punctuation, and sorts tokens cleanly', () => {
      expect(normalizeDuplicateName('Mr. Nimal Shantha')).toBe(
        normalizeDuplicateName('Nimal Shantha'),
      );
      expect(normalizeDuplicateName('Mohamed Rizwan')).toBe(
        normalizeDuplicateName('Rizwan Mohamed'),
      );
    });

    it('preserves Sinhala/Tamil conjuncts by deleting ZWJ instead of inserting spaces', () => {
      // Sinhala Rakaransha uses consonant + halant + ZWJ (\u200D) + ර
      const withZwj = 'නිමල් ප්‍රනාන්දු';
      const normalized = normalizeDuplicateName(withZwj);
      // Should remain two tokens ('නිමල්' and 'ප්‍රනාන්දු' without ZWJ), never split on ZWJ
      expect(normalized.split(' ')).toHaveLength(2);
      expect(normalized).not.toContain('\u200D');
    });

    it('normalizes phone formats to unified E.164 comparison form', () => {
      expect(normalizePhoneForDuplicate('0771234567')).toBe('+94771234567');
      expect(normalizePhoneForDuplicate('+94771234567')).toBe('+94771234567');
      expect(normalizePhoneForDuplicate('94771234567')).toBe('+94771234567');
      expect(normalizePhoneForDuplicate('077-123-4567')).toBe('+94771234567');
    });
  });

  describe('docs/test-vectors/duplicates.json accuracy proof (>=60 pairs)', () => {
    it('contains at least 60 labelled vector pairs', () => {
      expect(vectors.pairs.length).toBeGreaterThanOrEqual(60);
    });

    it('achieves precision >= 0.95 for probable and recall >= 0.90 across probable + possible', () => {
      let tpProbable = 0;
      let fpProbable = 0;
      let tpDetected = 0;
      let totalTrueDuplicates = 0;

      for (const pair of vectors.pairs) {
        const a: DuplicateScoringInput = {
          name: pair.record_a.name,
          age: pair.record_a.age,
          gender: pair.record_a.gender,
          phone: pair.record_a.phone ?? null,
          whatsapp: pair.record_a.whatsapp ?? null,
          householdId: pair.record_a.household_id ?? null,
          gnId: pair.record_a.gn_id ?? null,
        };
        const b: DuplicateScoringInput = {
          name: pair.record_b.name,
          age: pair.record_b.age,
          gender: pair.record_b.gender,
          phone: pair.record_b.phone ?? null,
          whatsapp: pair.record_b.whatsapp ?? null,
          householdId: pair.record_b.household_id ?? null,
          gnId: pair.record_b.gn_id ?? null,
        };

        const result = scoreDuplicatePair(a, b);
        const cls = classifyDuplicateScore(result.score);

        if (pair.label === 'true_duplicate') {
          totalTrueDuplicates++;
          if (cls === 'probable' || cls === 'possible') {
            tpDetected++;
          }
          if (cls === 'probable') {
            tpProbable++;
          }
        } else if (cls === 'probable') {
          fpProbable++;
        }

        if (pair.expected_classification === 'possible' && pair.note) {
          // Explicit anti-false-positive rule: siblings/family sharing phone & household stay < probable
          expect(cls).not.toBe('probable');
        }
      }

      const precisionProbable = tpProbable / (tpProbable + fpProbable);
      const recallDetected = tpDetected / totalTrueDuplicates;

      expect(precisionProbable).toBeGreaterThanOrEqual(0.95);
      expect(recallDetected).toBeGreaterThanOrEqual(0.9);
      expect(fpProbable).toBe(0);
    });

    it('supports phone matching across phone and whatsapp fields', () => {
      const a: DuplicateScoringInput = {
        name: 'Kavinda Bandara',
        age: 24,
        gender: 'M',
        phone: '0771234567',
        whatsapp: null,
        householdId: 'H1',
        gnId: 'GN1',
      };
      const b: DuplicateScoringInput = {
        name: 'Kavinda Bandara',
        age: 24,
        gender: 'M',
        phone: null,
        whatsapp: '+94771234567',
        householdId: 'H1',
        gnId: 'GN1',
      };

      const res = scoreDuplicatePair(a, b);
      expect(res.score).toBeGreaterThanOrEqual(70);
      expect(res.reasons.factors).toContain('same_phone');
    });

    it('detects Sinhala and Tamil initials variations accurately', () => {
      const siSim = nameSimilarity(
        'ඩබ්ලිව්. ඒ. නිමල් ප්‍රනාන්දු',
        'නිමල් ප්‍රනාන්දු',
      );
      const taSim = nameSimilarity('கே. சிவகுமார்', 'சிவகுமார்');
      const enSim = nameSimilarity('Nuwan Pradeep Silva', 'Nuwan P. Silva');

      expect(siSim).toBeGreaterThanOrEqual(0.85);
      expect(taSim).toBeGreaterThanOrEqual(0.85);
      expect(enSim).toBeGreaterThanOrEqual(0.85);
    });
  });
});

