import { StructuredLoggerService, StructuredLogEntry } from './structured-logger.service';
import { PiiScrubber } from './pii-scrubber';
import { SentryScrubber, SentryEvent } from './sentry-scrubber';

describe('Structured Logging & PII Scrubbing (M1.11)', () => {
  let logger: StructuredLoggerService;
  let capturedLogs: StructuredLogEntry[];

  beforeEach(() => {
    logger = new StructuredLoggerService();
    capturedLogs = [];
    logger.setSink((entry) => {
      capturedLogs.push(entry);
    });
  });

  describe('PiiScrubber Unit Tests', () => {
    it('redacts sensitive passwords and tokens in nested objects', () => {
      const rawPayload = {
        userCode: 'GRS1234567890',
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
        refreshToken: 'uuid-refresh-token',
        nested: {
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy',
          apiKey: 'secret-api-key',
        },
      };

      const scrubbed = PiiScrubber.scrub(rawPayload);

      expect(scrubbed.userCode).toBe('GRS1234567890');
      expect(scrubbed.password).toBe('[REDACTED]');
      expect(scrubbed.token).toBe('[REDACTED]');
      expect(scrubbed.refreshToken).toBe('[REDACTED]');
      expect(scrubbed.nested.passwordHash).toBe('[REDACTED]');
    });

    it('redacts citizen PII fields (phone, leader name, address)', () => {
      const rawCitizen = {
        name: 'Sunil Perera',
        houseLeaderName: 'Kamal Silva',
        address: 'No 45, Temple Road, Colombo',
        phoneRaw: '0771234567',
        phoneE164: '+94771234567',
        whatsappRaw: '0771234567',
        whatsappE164: '+94771234567',
        age: 32,
      };

      const scrubbed = PiiScrubber.scrub(rawCitizen);

      expect(scrubbed.name).toBe('Sunil Perera');
      expect(scrubbed.houseLeaderName).toBe('[REDACTED]');
      expect(scrubbed.address).toBe('[REDACTED]');
      expect(scrubbed.phoneRaw).toBe('[REDACTED]');
      expect(scrubbed.phoneE164).toBe('[REDACTED]');
      expect(scrubbed.whatsappRaw).toBe('[REDACTED]');
      expect(scrubbed.whatsappE164).toBe('[REDACTED]');
      expect(scrubbed.age).toBe(32);
    });

    it('masks Bearer tokens and phone numbers in raw string logs', () => {
      const logString = 'Request with Bearer eyJhbGciOiJIUzI1Ni.xyz received for +94771234567';
      const scrubbed = PiiScrubber.scrubString(logString);

      expect(scrubbed).not.toContain('eyJhbGciOiJIUzI1Ni.xyz');
      expect(scrubbed).toContain('Bearer [REDACTED]');
      expect(scrubbed).toContain('+9477***4567');
    });
  });

  describe('StructuredLoggerService Output Verification', () => {
    it('outputs valid JSON structure with scrubbed data and metadata', () => {
      logger.log(
        'User authentication attempt',
        'AuthService',
        {
          userCode: 'GRS1234567890',
          password: 'secret_password_here',
          ip: '192.168.1.1',
        },
      );

      expect(capturedLogs.length).toBe(1);
      const entry = capturedLogs[0];

      expect(entry.level).toBe('info');
      expect(entry.context).toBe('AuthService');
      expect(entry.message).toBe('User authentication attempt');
      expect(entry.timestamp).toBeDefined();

      // Ensure password was scrubbed
      expect(entry.data.password).toBe('[REDACTED]');
      expect(entry.data.userCode).toBe('GRS1234567890');

      // Verify serialization to JSON
      const jsonString = JSON.stringify(entry);
      expect(() => JSON.parse(jsonString)).not.toThrow();
      expect(jsonString).not.toContain('secret_password_here');
    });

    it('scrubs error traces containing sensitive data', () => {
      const sensitiveStack = 'Error: Invalid password=secret123 at AuthService.login (Bearer eyJhbGci.test)';
      logger.error('Failed login', sensitiveStack, 'AuthService');

      expect(capturedLogs.length).toBe(1);
      const entry = capturedLogs[0];
      expect(entry.level).toBe('error');
      expect(entry.stack).not.toContain('eyJhbGci.test');
      expect(entry.stack).toContain('Bearer [REDACTED]');
    });

    it('generates a reviewed sample structured log entry for audit', () => {
      logger.log('Client record saved', 'SyncService', {
        batchId: 'batch-001',
        recordsCount: 1,
        client: {
          id: 'client-123',
          phoneE164: '+94771234567',
          address: 'No 10, Colombo',
        },
      });

      const sample = capturedLogs[capturedLogs.length - 1];
      console.log('\n--- REVIEWED STRUCTURED LOG SAMPLE (M1.11) ---');
      console.log(JSON.stringify(sample, null, 2));
      console.log('-----------------------------------------------\n');

      expect(sample.data.client.phoneE164).toBe('[REDACTED]');
      expect(sample.data.client.address).toBe('[REDACTED]');
    });
  });

  describe('SentryScrubber Integration Tests', () => {
    it('cleans headers, request data, breadcrumbs and user metadata in beforeSend', () => {
      const sentryEvent: SentryEvent = {
        request: {
          headers: {
            authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.topsecret',
            cookie: 'session_token=secret_cookie_123',
            'user-agent': 'Mozilla/5.0',
          },
          data: {
            identifier: 'GRS1234567890',
            password: 'UserEnteredPassword!',
            phoneRaw: '0771234567',
          },
          cookies: 'session_token=secret_cookie_123',
        },
        breadcrumbs: [
          {
            category: 'auth',
            message: 'User GRS1234567890 submitted password=UserEnteredPassword!',
            data: { phoneE164: '+94771234567' },
          },
        ],
        extra: {
          refreshToken: 'refresh-token-secret-uuid',
        },
        user: {
          id: 'usr-123',
          email: 'user@example.com',
          ip_address: '10.0.0.1',
        },
      };

      const cleaned = SentryScrubber.beforeSend(sentryEvent);

      // Verify headers and cookies scrubbed
      expect(cleaned.request?.headers?.authorization).toBe('[REDACTED]');
      expect(cleaned.request?.headers?.cookie).toBe('[REDACTED]');
      expect(cleaned.request?.cookies).toBe('[REDACTED]');

      // Verify request payload scrubbed
      expect(cleaned.request?.data.password).toBe('[REDACTED]');
      expect(cleaned.request?.data.phoneRaw).toBe('[REDACTED]');

      // Verify breadcrumbs scrubbed
      expect(cleaned.breadcrumbs?.[0].data.phoneE164).toBe('[REDACTED]');

      // Verify extra scrubbed
      expect(cleaned.extra?.refreshToken).toBe('[REDACTED]');

      // Verify IP and email removed
      expect(cleaned.user?.ip_address).toBeUndefined();
      expect(cleaned.user?.email).toBe('[REDACTED]');
      expect(cleaned.user?.id).toBe('usr-123');
    });
  });
});
