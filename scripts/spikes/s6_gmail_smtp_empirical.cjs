const path = require('path');
const fs = require('fs');
const nodemailer = require(path.join(process.cwd(), 'node_modules/.pnpm/nodemailer@10.2.1/node_modules/nodemailer'));

async function sendRealVerificationEmail() {
  console.log('Initializing Nodemailer with live Gmail SMTP...');

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL
    auth: {
      user: 'umeshbandara08@gmail.com',
      pass: 'ttsg zmhs lojo wyxe'
    },
    tls: {
      rejectUnauthorized: true
    }
  });

  console.log('Verifying SMTP connection credentials with Gmail server...');
  const verifyResult = await transporter.verify();
  console.log('Gmail SMTP connection verified successfully:', verifyResult);

  // Generate 6-digit cryptographically secure code
  const crypto = require('crypto');
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  console.log(`Sending real verification email with OTP ${code} to umeshbandara08@gmail.com...`);

  const mailOptions = {
    from: '"GRS Platform" <umeshbandara08@gmail.com>',
    to: 'imanthaumesh08@gmail.com',
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
    `
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
    otpCode: code,
    expiresAt: expiresAt
  };

  fs.mkdirSync('docs/spikes/s6_evidence', { recursive: true });
  fs.writeFileSync('docs/spikes/s6_evidence/gmail_delivery_receipt.json', JSON.stringify(receipt, null, 2));
  console.log('Receipt saved to docs/spikes/s6_evidence/gmail_delivery_receipt.json');
}

sendRealVerificationEmail().catch(err => {
  console.error('Failed to send real verification email:', err);
  process.exit(1);
});
