import { CredentialService } from './credential.service';

describe('CredentialService (Appendix G & Spike S2)', () => {
  let service: CredentialService;

  beforeEach(() => {
    service = new CredentialService();
  });

  describe('ID Generation (Appendix G)', () => {
    it('generates IDs adhering to ^GRS[0-9]{10}$ format', () => {
      const id = service.generateUserCode();
      expect(id).toMatch(/^GRS[0-9]{10}$/);
      expect(id.length).toBe(13);
    });

    it('generates 1,000 IDs without collisions (cryptographically random)', () => {
      const set = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const id = service.generateUserCode();
        expect(set.has(id)).toBe(false);
        set.add(id);
      }
      expect(set.size).toBe(1000);
    });
  });

  describe('Password Generation & Verification (Appendix G)', () => {
    it('generates 12-character passwords without look-alikes', () => {
      const { raw, display } = service.generateInitialPassword();
      expect(raw.length).toBe(12);
      expect(display).toMatch(/^[2-9A-HJ-NP-Za-km-z]{4}-[2-9A-HJ-NP-Za-km-z]{4}-[2-9A-HJ-NP-Za-km-z]{4}$/);

      // Verify no look-alikes exist in generated password
      const lookalikes = ['0', 'O', 'o', '1', 'l', 'I'];
      for (const char of lookalikes) {
        expect(raw).not.toContain(char);
      }
    });

    it('hashes and verifies generated initial password with both grouped and raw inputs', async () => {
      const { raw, display } = service.generateInitialPassword();
      const hash = await service.hashInitialPassword(raw);

      // Raw verification
      const verifyRaw = await service.verifyPassword(hash, raw);
      expect(verifyRaw).toBe(true);

      // Grouped display verification (dashes ignored)
      const verifyDisplay = await service.verifyPassword(hash, display);
      expect(verifyDisplay).toBe(true);

      // Wrong password fails
      const verifyWrong = await service.verifyPassword(hash, 'wrongPassword123');
      expect(verifyWrong).toBe(false);
    });

    it('hashes and verifies user passwords with full-strength Argon2', async () => {
      const userPass = 'Custom#UserPassword99';
      const hash = await service.hashUserPassword(userPass);

      expect(await service.verifyPassword(hash, userPass)).toBe(true);
      expect(await service.verifyPassword(hash, 'wrongOne')).toBe(false);
    });
  });
});
