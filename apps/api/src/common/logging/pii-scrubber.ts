/**
 * PII and Credential Scrubber for GRS (Task M1.11 / Invariant 14)
 * Recursively cleans sensitive credentials, tokens, and citizen PII from logs and Sentry events.
 */

export const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'cookie',
  'secret',
  'codehash',
  'code_hash',
  'code',
  'newpassword',
  'currentpassword',
  'secretkey',
  // Citizen PII
  'phoneraw',
  'phone_raw',
  'phonee164',
  'phone_e164',
  'whatsappraw',
  'whatsapp_raw',
  'whatsappe164',
  'whatsapp_e164',
  'houseleadername',
  'house_leader_name',
  'address',
  'secretarycontact',
  'secretary_contact',
  'secretaryemail',
  'secretary_email',
]);

export class PiiScrubber {
  /**
   * Deeply cleans an object, array, or primitive, replacing sensitive fields with [REDACTED].
   */
  static scrub(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.scrubString(data);
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.scrub(item));
    }

    if (typeof data === 'object') {
      const scrubbed: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lowerKey)) {
          scrubbed[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          scrubbed[key] = this.scrub(value);
        } else if (typeof value === 'string') {
          scrubbed[key] = this.scrubString(value);
        } else {
          scrubbed[key] = value;
        }
      }
      return scrubbed;
    }

    return data;
  }

  /**
   * Scrubs raw string content like Authorization headers, JWT tokens, and phone numbers.
   */
  static scrubString(str: string): string {
    let result = str;

    // Mask Bearer tokens: Bearer eyJ... -> Bearer [REDACTED]
    result = result.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');

    // Mask E.164 phone numbers: +94771234567 -> +9477***4567
    result = result.replace(/\+94[0-9]{9}/g, (phone) => {
      return phone.substring(0, 5) + '***' + phone.substring(8);
    });

    // Mask passwords in JSON-like strings: "password":"xyz" -> "password":"[REDACTED]"
    result = result.replace(
      /"(password|password_hash|token|refresh_token)":\s*"[^"]+"/gi,
      '"$1":"[REDACTED]"',
    );

    return result;
  }
}
