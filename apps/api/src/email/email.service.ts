import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

export interface SendCodeResult {
  message: string;
  expiresAt: Date;
  cooldownSeconds: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private static readonly CODE_TTL_MINUTES = 15;
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly COOLDOWN_SECONDS = 60;

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Generates a cryptographically secure 6-digit verification code.
   * Stores SHA-256 hash in database with 15-minute expiration (M1.15).
   * Enforces 60-second resend cooldown.
   */
  async sendCode(
    profileId: string,
    email: string,
    purpose: 'verify' | 'reset',
  ): Promise<SendCodeResult> {
    const cleanEmail = email.trim().toLowerCase();
    const now = new Date();

    // Check cooldown from last code sent
    const recentCode = await this.prisma.emailCode.findFirst({
      where: {
        profileId,
        purpose,
        createdAt: {
          gt: new Date(now.getTime() - EmailService.COOLDOWN_SECONDS * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentCode) {
      const remainingSeconds = Math.ceil(
        (EmailService.COOLDOWN_SECONDS * 1000 -
          (now.getTime() - recentCode.createdAt.getTime())) /
        1000,
      );
      throw new BadRequestException({
        code: 'EMAIL_COOLDOWN',
        message: `Please wait ${remainingSeconds} seconds before requesting a new code`,
        cooldownSeconds: remainingSeconds,
      });
    }

    // Generate 6-digit code
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const codeHash = this.hashCode(rawCode);
    const expiresAt = new Date(
      now.getTime() + EmailService.CODE_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.emailCode.create({
      data: {
        profileId,
        email: cleanEmail,
        purpose,
        codeHash,
        expiresAt,
        attempts: 0,
      },
    });

    // Dispatch email
    await this.dispatchEmail(cleanEmail, rawCode, purpose);

    return {
      message: 'Verification code sent',
      expiresAt,
      cooldownSeconds: EmailService.COOLDOWN_SECONDS,
    };
  }

  /**
   * Verifies candidate 6-digit code.
   * Invalidates after 5 failed attempts or 15 minutes.
   */
  async verifyCode(
    profileId: string,
    email: string,
    candidateCode: string,
    purpose: 'verify' | 'reset',
  ): Promise<boolean> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = candidateCode.trim();
    const now = new Date();

    const record = await this.prisma.emailCode.findFirst({
      where: {
        profileId,
        email: cleanEmail,
        purpose,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new UnauthorizedException({
        code: 'CODE_EXPIRED_OR_NOT_FOUND',
        message: 'Verification code has expired or was not requested',
      });
    }

    if (record.attempts >= EmailService.MAX_ATTEMPTS) {
      throw new UnauthorizedException({
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many incorrect attempts. Please request a new code.',
      });
    }

    const candidateHash = this.hashCode(cleanCode);
    const isMatch = candidateHash === record.codeHash;

    if (!isMatch) {
      await this.prisma.emailCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });

      throw new UnauthorizedException({
        code: 'INVALID_CODE',
        message: 'Incorrect verification code',
        remainingAttempts: EmailService.MAX_ATTEMPTS - (record.attempts + 1),
      });
    }

    // Code verified: delete used codes for this profile & purpose
    await this.prisma.emailCode.deleteMany({
      where: { profileId, purpose },
    });

    return true;
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private async dispatchEmail(
    email: string,
    code: string,
    purpose: string,
  ): Promise<void> {
    // In production: Resend / Brevo / SMTP delivery.
    // In local dev/test: Logs delivery payload securely with masked recipient.
    const maskedEmail = email.replace(/(^.).*(@.*$)/, '$1***$2');
    this.logger.log(
      `[EmailService] Dispatched ${purpose} code to ${maskedEmail} (Expires in 15m)`,
    );
  }
}
