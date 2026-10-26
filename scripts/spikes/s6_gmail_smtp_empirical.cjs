const path = require('path');
const fs = require('fs');

// Helper to load .env without hardcoding secrets in code
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const nodemailer = require(path.join(process.cwd(), 'node_modules/.pnpm/nodemailer@10.2.1/node_modules/nodemailer'));

async function sendRealVerificationEmail() {
  console.log('Initializing Nodemailer with live SMTP configuration from environment...');

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT) || 465;
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || `GRS Platform <${smtpUser}>`;
  const emailTo = process.env.EMAIL_TO || smtpUser;

  if (!smtpUser || !smtpPass) {
    throw new Error('Missing credentials: SMTP_USER and SMTP_PASS must be defined in .env or environment.');
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: true,
    },
  });

  console.log(`Verifying SMTP connection credentials with ${smtpHost}:${smtpPort}...`);
  const verifyResult = await transporter.verify();
  console.log('SMTP connection verified successfully:', verifyResult);

  // Generate 6-digit cryptographically secure code
  const crypto = require('crypto');
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  console.log(`Sending real verification email with 6-digit OTP to ${emailTo}...`);

  const mailOptions = {
    from: smtpFrom,
    to: emailTo,
    subject: `[GRS System Verification Code: ${code}]`,
    text: `Your GRS verification code is: ${code}\n\nThis code will expire in 15 minutes (at ${expiresAt}).\nDo not share this code with anyone.`,
    html: `
      <div style="font-family: sans-serif; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 500px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">Global Research & Survey System (GRS)</h2>
        <p>Your 6-digit email verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #0284c7; background: #f0f9ff; padding: 12px 20px; border-radius: 6px; display: inline-block; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #64748b; font-size: 13px;">This code expires in 15 minutes. If you did not request this verification, please disregard this email.</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('Email sent successfully!');
  console.log('Message ID:', info.messageId);
  console.log('Response:', info.response);
  console.log('Accepted:', info.accepted);

  const receipt = {
    timestamp: new Date().toISOString(),
    messageId: info.messageId,
    response: info.response,
    accepted: info.accepted,
    rejected: info.rejected,
    envelope: info.envelope,
    codeFormat: '6-digit numeric (cryptographically random)',
    expiresAt: expiresAt,
  };

  fs.mkdirSync('docs/spikes/s6_evidence', { recursive: true });
  fs.writeFileSync('docs/spikes/s6_evidence/gmail_delivery_receipt.json', JSON.stringify(receipt, null, 2));
  console.log('Receipt saved to docs/spikes/s6_evidence/gmail_delivery_receipt.json');
}

sendRealVerificationEmail().catch((err) => {
  console.error('Failed to send verification email:', err.message);
  process.exit(1);
});
