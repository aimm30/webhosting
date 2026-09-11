const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const randomCode = () => String(crypto.randomInt(100000, 1000000));

async function sendMail(to, subject, text) {
  if (!transporter) {
    console.warn('[email] SMTP is not configured; email not sent to', to);
    return false;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to, subject, text
  });
  return true;
}

async function issueVerification(db, user) {
  const code = randomCode();
  db.prepare('UPDATE email_verifications SET used=1 WHERE user_id=? AND used=0').run(user.id);
  db.prepare('INSERT INTO email_verifications(user_id,code_hash,expires_at,created_at) VALUES(?,?,?,?)')
    .run(user.id, hash(code), Date.now() + 15 * 60 * 1000, Date.now());
  return sendMail(
    user.email,
    'Your Kanjirowa Mart verification code',
    `Your verification code is ${code}. It expires in 15 minutes. If you did not request this, ignore this email.`
  );
}

module.exports = { hash, randomCode, sendMail, issueVerification };
