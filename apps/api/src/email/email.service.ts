import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

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

  private transporter: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.initTransporter();
  }

  /**
   * Initializes the nodemailer transport from SMTP credentials, URL, or fallback.
   */
  private initTransporter(): void {
    const smtpUrl = this.configService.get<string>('SMTP_URL');
    const host = this.configService.get<string>('SMTP_HOST');

    if (smtpUrl) {
      this.transporter = nodemailer.createTransport(smtpUrl);
    } else if (host) {
      const port = parseInt(
        this.configService.get<string>('SMTP_PORT', '587'),
        10,
      );
      const secure =
        this.configService.get<string>('SMTP_SECURE') === 'true' ||
        port === 465;
      const user = this.configService.get<string>('SMTP_USER');
      const pass = this.configService.get<string>('SMTP_PASS');

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
      });
    } else {
      // Local development fallback: json transport to prevent network attempts
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }

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

    // Dispatch email via nodemailer in background (fire-and-forget) so SMTP latency is not awaited
    this.dispatchEmail(cleanEmail, rawCode, purpose).catch((err) => {
      this.logger.warn(
        `Failed to dispatch email to profile ${profileId}: ${err.message}`,
      );
    });

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

    // Atomically increment attempts conditionally if under MAX_ATTEMPTS to prevent concurrency race
    const updateResult = await this.prisma.emailCode.updateMany({
      where: {
        id: record.id,
        attempts: { lt: EmailService.MAX_ATTEMPTS },
      },
      data: {
        attempts: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new UnauthorizedException({
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many incorrect attempts. Please request a new code.',
      });
    }

    const candidateHash = this.hashCode(cleanCode);
    const isMatch = candidateHash === record.codeHash;

    if (!isMatch) {
      const refreshed = await this.prisma.emailCode.findUnique({
        where: { id: record.id },
      });
      const attemptsDone = refreshed?.attempts ?? record.attempts + 1;
      throw new UnauthorizedException({
        code: 'INVALID_CODE',
        message: 'Incorrect verification code',
        remainingAttempts: Math.max(
          0,
          EmailService.MAX_ATTEMPTS - attemptsDone,
        ),
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

  /**
   * Sends email using configured nodemailer transporter.
   * Never logs plaintext code or recipient PII (Invariant 6).
   */
  private async dispatchEmail(
    email: string,
    code: string,
    purpose: 'verify' | 'reset',
  ): Promise<void> {
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('EMAIL_FROM') ||
      'GRS Platform <no-reply@grs.gov.lk>';

    const subject =
      purpose === 'verify'
        ? 'GRS Platform — Email Verification Code'
        : 'GRS Platform — Password Reset Code';

    const text = `Your GRS verification code is: ${code}\nThis code will expire in 15 minutes.\nDo not share this code with anyone.`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #CFD8DC; border-radius: 8px; background-color: #FFFFFF;">
        <h2 style="color: #004D40; margin-top: 0; font-size: 20px;">Global Research & Survey (GRS)</h2>
        <p style="color: #1C1B1F; font-size: 15px;">Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #004D40; background-color: #E0F2F1; padding: 18px; text-align: center; border-radius: 8px; margin: 24px 0;">
          ${code}
        </div>
        <p style="color: #49454F; font-size: 13px; line-height: 1.5;">This code will expire in 15 minutes. If you did not request this verification, please contact your administrative coordinator immediately.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        html,
      });

      // Mask email for PII safety (Invariant 6)
      const maskedEmail = email.replace(/(^.).*(@.*$)/, '$1***$2');
      this.logger.log(
        `[EmailService] Dispatched ${purpose} code to ${maskedEmail} via nodemailer (Expires in 15m)`,
      );
    } catch (err: any) {
      this.logger.error(
        `[EmailService] Nodemailer dispatch failed: ${err.message}`,
      );
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new BadRequestException(
          'Failed to deliver verification code. Please try again.',
        );
      }
    }
  }
}
