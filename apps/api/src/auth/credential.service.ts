import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as argon2 from '@node-rs/argon2';

@Injectable()
export class CredentialService {
  // Alphabet without look-alikes (no 0, O, o, 1, l, I) per Appendix G
  private static readonly PASSWORD_ALPHABET =
    '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';

  // Argon2 parameters per Spike S2
  private static readonly USER_ARGON2_OPTIONS = {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  };

  private static readonly INITIAL_ARGON2_OPTIONS = {
    memoryCost: 32768,
    timeCost: 2,
    parallelism: 2,
  };

  /**
   * Generates a random 10-digit GRS user code (e.g., GRS1234567890).
   * Cryptographically secure, non-sequential, independent of personal details.
   */
  generateUserCode(): string {
    let digits = '';
    for (let i = 0; i < 10; i++) {
      digits += crypto.randomInt(0, 10).toString();
    }
    return `GRS${digits}`;
  }

  /**
   * Generates a 12-character random initial password with display formatting.
   * Format: XXXX-XXXX-XXXX for readability. Dashes are ignored on verification.
   */
  generateInitialPassword(): { raw: string; display: string } {
    let raw = '';
    const alphabet = CredentialService.PASSWORD_ALPHABET;
    const len = alphabet.length;

    for (let i = 0; i < 12; i++) {
      const idx = crypto.randomInt(0, len);
      raw += alphabet[idx];
    }

    const display = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    return { raw, display };
  }

  /**
   * Normalizes password input by stripping display grouping dashes and outer whitespace.
   */
  normalizePassword(input: string): string {
    return input.trim().replace(/-/g, '');
  }

  /**
   * Hashes user-selected passwords using full-strength Argon2id parameters.
   */
  async hashUserPassword(password: string): Promise<string> {
    const clean = this.normalizePassword(password);
    return argon2.hash(clean, CredentialService.USER_ARGON2_OPTIONS);
  }

  /**
   * Hashes generated one-time initial passwords using optimized parameters for bulk scaling.
   */
  async hashInitialPassword(password: string): Promise<string> {
    const clean = this.normalizePassword(password);
    return argon2.hash(clean, CredentialService.INITIAL_ARGON2_OPTIONS);
  }

  /**
   * Verifies a candidate password against an Argon2 hash.
   * Tolerates dashes from display grouping (e.g. XXXX-XXXX-XXXX).
   */
  async verifyPassword(hash: string, candidate: string): Promise<boolean> {
    const clean = this.normalizePassword(candidate);
    try {
      return await argon2.verify(hash, clean);
    } catch {
      return false;
    }
  }
}
