import nodemailer from 'nodemailer';

function publicAppUrl() {
  return (process.env.PUBLIC_APP_URL || 'https://novo.tancheetiong.com').replace(/\/$/, '');
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: Number(process.env.SMTP_PORT || 25),
  secure: process.env.SMTP_SECURE === '1',
  ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } } : {}),
  tls: { rejectUnauthorized: process.env.SMTP_ALLOW_SELF_SIGNED !== '1' },
});

export async function sendPasswordResetEmail(input: { to: string; name: string; token: string }) {
  const resetUrl = `${publicAppUrl()}/?reset=${encodeURIComponent(input.token)}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'novo <noreply@novomail.tancheetiong.com>',
    to: input.to,
    subject: 'Reset your novo password',
    text: `Hi ${input.name},\n\nReset your novo password using this link:\n${resetUrl}\n\nThis link expires in 30 minutes. If you did not request it, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17352a"><h1 style="font-size:28px">Reset your novo password</h1><p>Hi ${escapeHtml(input.name)},</p><p>Use the button below to choose a new password. This link expires in 30 minutes.</p><p><a href="${resetUrl}" style="display:inline-block;background:#164b39;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700">Reset password</a></p><p style="color:#60766e;font-size:13px">If you did not request this, you can safely ignore this email.</p></div>`,
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character));
}
