import * as fs from 'fs';
import * as path from 'path';
import { GrsValidators } from './grs-validators';

describe('GrsValidators - Shared Test Vectors (M1.9)', () => {
  const vectorsDir = path.resolve(
    __dirname,
    '../../../../../docs/test-vectors',
  );
  let validationVectors: any;
  let phoneVectors: any;
  let idVectors: any;

  beforeAll(() => {
    const valFile = fs.readFileSync(
      path.join(vectorsDir, 'validation.json'),
      'utf-8',
    );
    validationVectors = JSON.parse(valFile).vectors;

    const phoneFile = fs.readFileSync(
      path.join(vectorsDir, 'phones.json'),
      'utf-8',
    );
    phoneVectors = JSON.parse(phoneFile).vectors;

    const idFile = fs.readFileSync(path.join(vectorsDir, 'ids.json'), 'utf-8');
    idVectors = JSON.parse(idFile);
  });

  describe('Name validation vectors', () => {
    it('matches all shared name vectors identically with Flutter', () => {
      for (const v of validationVectors.name) {
        const result = GrsValidators.validateName(v.input);
        expect(result.isValid).toBe(v.valid);
        if (v.valid && v.normalized !== undefined) {
          expect(result.value).toBe(v.normalized);
        }
        if (!v.valid && v.reason !== undefined) {
          expect(result.error).toBe(v.reason);
        }
      }
    });
  });

  describe('Age validation vectors', () => {
    it('matches all shared age vectors identically with Flutter', () => {
      for (const v of validationVectors.age) {
        const result = GrsValidators.validateAge(v.input);
        expect(result.isValid).toBe(v.valid);
        if (!v.valid && v.reason !== undefined) {
          expect(result.error).toBe(v.reason);
        }
      }
      expect(GrsValidators.validateAge('1e1').isValid).toBe(false);
      expect(GrsValidators.validateAge('0x10').isValid).toBe(false);
      expect(GrsValidators.validateAge(true).isValid).toBe(false);
    });
  });

  describe('Gender validation vectors', () => {
    it('matches all shared gender vectors identically with Flutter', () => {
      for (const v of validationVectors.gender) {
        const result = GrsValidators.validateGender(v.input);
        expect(result.isValid).toBe(v.valid);
        if (!v.valid && v.reason !== undefined) {
          expect(result.error).toBe(v.reason);
        }
      }
    });
  });

  describe('House number normalization vectors', () => {
    it('matches all shared house_no normalization vectors', () => {
      for (const v of validationVectors.house_no) {
        const result = GrsValidators.normalizeHouseNo(v.input);
        expect(result.isValid).toBe(v.valid);
        if (v.valid && v.normalized !== undefined) {
          expect(result.value).toBe(v.normalized);
        }
      }
    });
  });

  describe('Age group parsing vectors', () => {
    it('matches all shared age_group parsing vectors', () => {
      for (const v of validationVectors.age_group) {
        const result = GrsValidators.parseAgeGroup(v.input);
        expect(result.isValid).toBe(v.valid);
        if (v.valid) {
          expect(result.value?.min).toBe(v.min);
          expect(result.value?.max).toBe(v.max);
        }
        if (!v.valid && v.reason !== undefined) {
          expect(result.error).toBe(v.reason);
        }
      }
    });
  });

  describe('User code validation vectors (validation.json & ids.json)', () => {
    it('matches all user_code vectors from validation.json', () => {
      for (const v of validationVectors.user_code) {
        const result = GrsValidators.validateUserCode(v.input);
        expect(result.isValid).toBe(v.valid);
        if (v.valid && v.normalized !== undefined) {
          expect(result.value).toBe(v.normalized);
        }
        if (!v.valid && v.reason !== undefined) {
          expect(result.error).toBe(v.reason);
        }
      }
    });

    it('validates strict generated ID format against ids.json regex', () => {
      const regex = new RegExp(idVectors.id_format.regex);
      for (const example of idVectors.id_format.valid_examples) {
        expect(regex.test(example)).toBe(true);
      }
      for (const example of idVectors.id_format.invalid_examples) {
        expect(regex.test(example)).toBe(false);
      }
    });
  });

  describe('Password validation vectors', () => {
    it('matches all password vectors', () => {
      for (const v of validationVectors.password) {
        const result = GrsValidators.validatePassword(v.input);
        expect(result.isValid).toBe(v.valid);
        if (!v.valid && v.reason !== undefined) {
          expect(result.error).toBe(v.reason);
        }
      }
    });
  });

  describe('Future hopes validation vectors', () => {
    it('matches all future_hopes vectors', () => {
      for (const v of validationVectors.future_hopes) {
        const result = GrsValidators.validateFutureHopes(v.input);
        expect(result.isValid).toBe(v.valid);
        if (!v.valid && v.reason !== undefined) {
          expect(result.error).toBe(v.reason);
        }
      }
    });
  });

  describe('Phone and WhatsApp normalization vectors (phones.json)', () => {
    it('matches all phone normalization vectors from phones.json', () => {
      for (const v of phoneVectors) {
        const result = GrsValidators.normalizePhone(v.input);
        expect(result.isValid).toBe(v.valid_sl);
        if (v.valid_sl) {
          expect(result.value).toBe(v.e164);
        }
      }
      const slRes = GrsValidators.normalizePhone('+94 0771234567');
      expect(slRes.isValid).toBe(true);
      expect(slRes.value).toBe('+94771234567');
    });

    it('matches all WhatsApp normalization vectors from phones.json', () => {
      for (const v of phoneVectors) {
        const isExpectedValid = v.valid_sl || v.valid_whatsapp === true;
        const result = GrsValidators.normalizeWhatsApp(v.input);
        expect(result.isValid).toBe(isExpectedValid);
        if (isExpectedValid) {
          expect(result.value).toBe(v.e164);
        }
      }
    });
  });
});
