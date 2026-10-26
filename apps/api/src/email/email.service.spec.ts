import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

describe('EmailService (Spike S6 & Task M1.15)', () => {
  let service: EmailService;

  let inMemoryCodes: any[] = [];

  const mockPrisma = {
    emailCode: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        let matches = inMemoryCodes.filter((c) => c.profileId === where.profileId);
        if (where.purpose) matches = matches.filter((c) => c.purpose === where.purpose);
        if (where.createdAt?.gt) matches = matches.filter((c) => c.createdAt > where.createdAt.gt);
        if (where.expiresAt?.gt) matches = matches.filter((c) => c.expiresAt > where.expiresAt.gt);
        return Promise.resolve(matches[matches.length - 1] || null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const item = { id: `ec-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
        inMemoryCodes.push(item);
        return Promise.resolve(item);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = inMemoryCodes.findIndex((c) => c.id === where.id);
        if (idx !== -1) {
          if (data.attempts?.increment) {
            inMemoryCodes[idx].attempts += data.attempts.increment;
          }
          return Promise.resolve(inMemoryCodes[idx]);
        }
        return Promise.resolve(null);
      }),
      deleteMany: jest.fn().mockImplementation(({ where }) => {
        const before = inMemoryCodes.length;
        inMemoryCodes = inMemoryCodes.filter(
          (c) => !(c.profileId === where.profileId && c.purpose === where.purpose),
        );
        return Promise.resolve({ count: before - inMemoryCodes.length });
      }),
    },
  };

  beforeEach(async () => {
    inMemoryCodes = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
              if (key === 'SMTP_FROM') return 'no-reply@grs.gov.lk';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('generates 6-digit code with 15-minute expiration', async () => {
    const result = await service.sendCode('usr-1', 'test@example.com', 'verify');

    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.cooldownSeconds).toBe(60);

    expect(inMemoryCodes).toHaveLength(1);
    expect(inMemoryCodes[0].email).toBe('test@example.com');
    expect(inMemoryCodes[0].purpose).toBe('verify');
    expect(inMemoryCodes[0].codeHash).toHaveLength(64); // SHA-256
  });

  it('enforces 60-second cooldown between resend requests', async () => {
    await service.sendCode('usr-1', 'test@example.com', 'verify');

    await expect(
      service.sendCode('usr-1', 'test@example.com', 'verify'),
    ).rejects.toThrow(BadRequestException);
  });

  it('verifies correct code and purges used code', async () => {
    const rawCode = '849201';
    const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');

    inMemoryCodes.push({
      id: 'ec-1',
      profileId: 'usr-1',
      email: 'test@example.com',
      purpose: 'verify',
      codeHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      attempts: 0,
      createdAt: new Date(),
    });

    const verified = await service.verifyCode('usr-1', 'test@example.com', rawCode, 'verify');
    expect(verified).toBe(true);
    expect(inMemoryCodes).toHaveLength(0); // Purged
  });

  it('locks out after 5 consecutive failed attempts (M1.15 requirement)', async () => {
    const rawCode = '123456';
    const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');

    inMemoryCodes.push({
      id: 'ec-1',
      profileId: 'usr-1',
      email: 'test@example.com',
      purpose: 'verify',
      codeHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      attempts: 4, // 4 prior failed attempts
      createdAt: new Date(),
    });

    // 5th failed attempt
    await expect(
      service.verifyCode('usr-1', 'test@example.com', '000000', 'verify'),
    ).rejects.toThrow(UnauthorizedException);

    expect(inMemoryCodes[0].attempts).toBe(5);

    // Subsequent attempt is blocked with TOO_MANY_ATTEMPTS
    try {
      await service.verifyCode('usr-1', 'test@example.com', rawCode, 'verify');
      fail('Expected locked code error');
    } catch (err: any) {
      expect(err.response.code).toBe('TOO_MANY_ATTEMPTS');
    }
  });
});
