import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as argon2 from '@node-rs/argon2';

@Injectable()
export class CredentialService {
  // Alphabet without look-alikes (no 0, O, o, 1, l, I) per Appendix G
  private static readonly PASSWORD_ALPHABET =
    '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';

  // Argon2 parameters per Spike S2 (optimized for fast test execution in CI/test env)
  private static readonly USER_ARGON2_OPTIONS = {
    memoryCost: process.env.NODE_ENV === 'test' ? 1024 : 65536,
    timeCost: process.env.NODE_ENV === 'test' ? 1 : 3,
    parallelism: process.env.NODE_ENV === 'test' ? 1 : 4,
  };

  private static readonly INITIAL_ARGON2_OPTIONS = {
    memoryCost: process.env.NODE_ENV === 'test' ? 1024 : 32768,
    timeCost: process.env.NODE_ENV === 'test' ? 1 : 2,
    parallelism: process.env.NODE_ENV === 'test' ? 1 : 2,
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
   * Normalizes password input by trimming outer whitespace.
   * Preserves all internal characters including hyphens/dashes.
   */
  normalizePassword(input: string): string {
    return input.trim();
  }

  /**
   * Strips display grouping dashes only if the input matches the generated
   * initial password format (e.g., XXXX-XXXX-XXXX).
   */
  stripDisplayDashes(input: string): string {
    const trimmed = input.trim();
    if (/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(trimmed)) {
      return trimmed.replace(/-/g, '');
    }
    return trimmed;
  }

  /**
   * Hashes user-selected passwords using full-strength Argon2id parameters.
   * Preserves all user-entered characters (including hyphens).
   */
  async hashUserPassword(password: string): Promise<string> {
    const clean = this.normalizePassword(password);
    return argon2.hash(clean, CredentialService.USER_ARGON2_OPTIONS);
  }

  /**
   * Hashes generated one-time initial passwords using optimized parameters for bulk scaling.
   */
  async hashInitialPassword(password: string): Promise<string> {
    const clean = this.stripDisplayDashes(password);
    return argon2.hash(clean, CredentialService.INITIAL_ARGON2_OPTIONS);
  }

  /**
   * Verifies a candidate password against an Argon2 hash.
   * 1. Verifies exact candidate (trimmed).
   * 2. If verification fails and candidate matches initial password grouping format (XXXX-XXXX-XXXX),
   *    verifies candidate with display dashes stripped.
   */
  async verifyPassword(hash: string, candidate: string): Promise<boolean> {
    const clean = this.normalizePassword(candidate);
    try {
      if (await argon2.verify(hash, clean)) {
        return true;
      }
      if (clean.includes('-')) {
        const withoutDashes = this.stripDisplayDashes(clean);
        if (withoutDashes !== clean && withoutDashes.length > 0) {
          return await argon2.verify(hash, withoutDashes);
        }
      }
      return false;
    } catch {
      return false;
    }
  }
}
