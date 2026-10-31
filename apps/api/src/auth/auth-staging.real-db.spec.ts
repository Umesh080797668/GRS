import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import * as argon2 from '@node-rs/argon2';
import * as crypto from 'crypto';
import express from 'express';
import { INestApplication } from '@nestjs/common';
import { createNestServer } from '../main';

describe('M2.5 & M2.6 Real API and Staging Database Verification', () => {
  jest.setTimeout(60000);
  let prisma: PrismaClient;
  let nestApp: INestApplication | null = null;
  let baseUrl = 'http://localhost:3000';

  const testUserId = '00000000-0000-0000-0000-000000000099';
  const testUserCode = 'GRS9999999099';
  const testEmail = 'staging-auth-agent@grs.gov.lk';
  const initialPassword = 'InitialSecretPass123!';
  const updatedPassword = 'NewSecretPassword456!';
  const resetPassword = 'FinalResetPassword789!';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    // Check if external server is running, or start embedded instance
    try {
      const probe = await fetch('http://localhost:3000/health');
      if (probe.ok) {
        baseUrl = 'http://localhost:3000';
      } else {
        throw new Error('Not running');
      }
    } catch (_) {
      const server = express();
      nestApp = await createNestServer(server);
      await nestApp.listen(0);
      baseUrl = await nestApp.getUrl();
    }

    // Clean up any stale records from previous runs
    await cleanTestData();

    // Hash initial password using argon2id
    const passwordHash = await argon2.hash(initialPassword, {
      memoryCost: 32768,
      timeCost: 2,
      parallelism: 2,
      outputLen: 32,
    });

    // Seed test profile directly into real Supabase PostgreSQL database
    await prisma.profile.create({
      data: {
        id: testUserId,
        userCode: testUserCode,
        email: testEmail,
        fullName: 'Staging Real Auth Agent',
        role: 'team_member',
        passwordHash,
        mustChangePassword: true,
        passwordExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        isActive: true,
        tokenVersion: 1,
      },
    });
  });

  afterAll(async () => {
    await cleanTestData();
    await prisma.$disconnect();
    if (nestApp) {
      await nestApp.close();
    }
  });

  async function cleanTestData() {
    try {
      await prisma.emailCode.deleteMany({ where: { profileId: testUserId } });
      await prisma.refreshToken.deleteMany({
        where: { profileId: testUserId },
      });
      await prisma.accountAudit.deleteMany({
        where: { OR: [{ actorId: testUserId }, { targetId: testUserId }] },
      });
      await prisma.profile.deleteMany({ where: { id: testUserId } });
    } catch (_) { }
  }

  it('Step 1: First Sign-In — Login with mustChangePassword: true returns restricted token', async () => {
    const res = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({
        identifier: testUserCode,
        password: initialPassword,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.mustChangePassword).toBe(true);
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeUndefined(); // Restricted scope: no refresh token issued
    expect(body.user).toBeDefined();
    expect(body.user.userCode).toBe(testUserCode);
  });

  it('Step 2: Forced Password Change — Successfully updates password in real database and clears flag', async () => {
    // 1. Obtain restricted access token
    const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({
        identifier: testUserCode,
        password: initialPassword,
      }),
    });
    const loginData = await loginRes.json();
    const restrictedToken = loginData.accessToken;

    // 2. Call change-password endpoint with new password
    const changeRes = await fetch(`${baseUrl}/v1/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
        Authorization: `Bearer ${restrictedToken}`,
      },
      body: JSON.stringify({
        currentPassword: initialPassword,
        newPassword: updatedPassword,
      }),
    });

    expect(changeRes.status).toBe(200);
    const changeBody = await changeRes.json();
    expect(changeBody.mustChangePassword).toBe(false);
    expect(changeBody.accessToken).toBeDefined();
    expect(changeBody.refreshToken).toBeDefined();

    // 3. Empirically verify state directly in Supabase PostgreSQL
    const profile = await prisma.profile.findUnique({
      where: { id: testUserId },
    });
    expect(profile).not.toBeNull();
    expect(profile!.mustChangePassword).toBe(false);
    expect(profile!.tokenVersion).toBe(2); // tokenVersion incremented
    expect(profile!.passwordChangedAt).not.toBeNull();

    // Verify argon2 verification passes on new password
    const isNewPassValid = await argon2.verify(
      profile!.passwordHash,
      updatedPassword,
    );
    expect(isNewPassValid).toBe(true);
  });

  it('Step 3: Subsequent Sign-In — Old password rejected, new password issues full session', async () => {
    // 1. Attempt login with old password -> rejected
    const oldRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({
        identifier: testUserCode,
        password: initialPassword,
      }),
    });
    expect(oldRes.status).toBe(401);

    // 2. Login with updated password -> full session
    const newRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({
        identifier: testUserCode,
        password: updatedPassword,
      }),
    });
    expect(newRes.status).toBe(200);
    const newBody = await newRes.json();
    expect(newBody.mustChangePassword).toBe(false);
    expect(newBody.accessToken).toBeDefined();
    expect(newBody.refreshToken).toBeDefined(); // Full session: refresh token issued
  });

  it('Step 4: Forgot Password & Reset via Real Database email_codes', async () => {
    // 1. Request forgot password code
    const forgotRes = await fetch(`${baseUrl}/v1/auth/forgot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({ email: testEmail }),
    });
    expect(forgotRes.status).toBe(200);

    // 2. Query real database for the email code record
    const emailCodeRecord = await prisma.emailCode.findFirst({
      where: { profileId: testUserId, purpose: 'reset' },
      orderBy: { createdAt: 'desc' },
    });
    expect(emailCodeRecord).not.toBeNull();
    expect(emailCodeRecord!.email).toBe(testEmail);
    expect(emailCodeRecord!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // 3. Resolve the 6-digit code preimage from sha256 hash (100000..999999)
    let actualCode: string | null = null;
    for (let c = 100000; c <= 999999; c++) {
      const candidate = c.toString();
      const hash = crypto.createHash('sha256').update(candidate).digest('hex');
      if (hash === emailCodeRecord!.codeHash) {
        actualCode = candidate;
        break;
      }
    }
    expect(actualCode).not.toBeNull();

    // 4. Reset with wrong code fails
    const badResetRes = await fetch(`${baseUrl}/v1/auth/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({
        email: testEmail,
        code: '000000',
        newPassword: resetPassword,
      }),
    });
    expect(badResetRes.status).toBe(401);

    // 5. Reset with real verified code succeeds
    const goodResetRes = await fetch(`${baseUrl}/v1/auth/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({
        email: testEmail,
        code: actualCode!,
        newPassword: resetPassword,
      }),
    });
    expect(goodResetRes.status).toBe(200);

    // 6. Sign in with the reset password succeeds
    const postResetLogin = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({
        identifier: testEmail,
        password: resetPassword,
      }),
    });
    expect(postResetLogin.status).toBe(200);
    const postResetBody = await postResetLogin.json();
    expect(postResetBody.mustChangePassword).toBe(false);
    expect(postResetBody.accessToken).toBeDefined();
    expect(postResetBody.refreshToken).toBeDefined();
  });

  it('Step 5: Refresh Token Rotation & Reuse Invalidation against Real API and Database', async () => {
    // Clear rate limits for test user to prevent hitting the 5/min limit during rapid test steps
    await prisma.rateLimit.deleteMany({
      where: {
        OR: [
          { key: { contains: testUserCode } },
          { key: { contains: testEmail } },
        ],
      },
    });

    // 1. Sign in to obtain an active session pair
    const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({
        identifier: testUserCode,
        password: resetPassword,
      }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    const initialRefreshToken = loginData.refreshToken;

    // 2. Rotate refresh token via POST /v1/auth/refresh
    const refreshRes = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({ refreshToken: initialRefreshToken }),
    });
    expect(refreshRes.status).toBe(200);
    const refreshData = await refreshRes.json();
    expect(refreshData.accessToken).toBeDefined();
    expect(refreshData.refreshToken).toBeDefined();
    expect(refreshData.refreshToken).not.toEqual(initialRefreshToken);

    // 3. Attempting to REUSE the old consumed refresh token must fail safely (HTTP 401)
    const reuseRes = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': '1.0.0',
      },
      body: JSON.stringify({ refreshToken: initialRefreshToken }),
    });
    expect(reuseRes.status).toBe(401);
  });
});
