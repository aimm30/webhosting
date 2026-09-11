const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../lib/db');
const { publicUser } = require('../lib/auth');
const { hash, sendMail, issueVerification } = require('../lib/mailer');
const { ADMIN_EMAIL } = require('../config');
const router = express.Router();

router.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};
    const normalized = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    if (!name || !/^\S+@\S+\.\S+$/.test(normalized) || String(password || '').length < 8) {
      return res.status(400).json({ error: 'Use a valid email and a password of at least 8 characters.' });
    }
    if (!/^\d{10}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Phone number must contain exactly 10 digits.' });
    }
    const existing = db.prepare('SELECT * FROM users WHERE email=?').get(normalized);
    if (existing) return res.status(409).json({ error: existing.email_verified ? 'That email already has an account.' : 'That email is already registered but not verified. A fresh code can be sent.' });
    const isAdmin = normalized === ADMIN_EMAIL ? 1 : 0;
    const result = db.prepare('INSERT INTO users(name,email,phone,password_hash,email_verified,is_admin,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(name.trim(), normalized, normalizedPhone, await bcrypt.hash(password, 12), 0, isAdmin, Date.now());
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    await issueVerification(db, user);
    res.json({ message: 'Verification code sent to your email.', user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unable to create the account right now.' });
  }
});

router.post('/auth/verify', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user) return res.status(400).json({ error: 'Invalid verification request.' });
    const v = db.prepare('SELECT * FROM email_verifications WHERE user_id=? AND used=0 ORDER BY id DESC LIMIT 1').get(user.id);
    if (!v || v.expires_at < Date.now() || v.code_hash !== hash(code)) return res.status(400).json({ error: 'Invalid or expired verification code.' });
    db.prepare('UPDATE email_verifications SET used=1 WHERE id=?').run(v.id);
    db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(user.id);
    req.session.userId = user.id;
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
  } catch (e) { res.status(500).json({ error: 'Verification failed.' }); }
});

router.post('/auth/resend-verification', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (user && !user.email_verified) await issueVerification(db, user);
  res.json({ message: 'If that account exists and is unverified, a new code has been sent.' });
});

router.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
  if (!user.email_verified) {
    await issueVerification(db, user);
    return res.json({ requiresVerification: true, user: publicUser(user) });
  }
  req.session.userId = user.id;
  req.session.cookie.maxAge = req.body?.remember ? 30*24*60*60*1000 : 24*60*60*1000;
  res.json({ user: publicUser(user) });
});

router.get('/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: publicUser(u) });
});

router.post('/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

router.post('/auth/request-password-reset', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (user) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO reset_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)').run(user.id, hash(token), Date.now() + 30*60*1000);
    await sendMail(user.email, 'Kanjirowa Mart password reset', `Your password-reset token is ${token}. It expires in 30 minutes.`);
  }
  res.json({ message: 'If that account exists, reset instructions were sent.' });
});

router.post('/auth/reset-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const row = user && db.prepare('SELECT * FROM reset_tokens WHERE user_id=? AND used=0 AND expires_at>? ORDER BY id DESC LIMIT 1').get(user.id, Date.now());
  if (!row || row.token_hash !== hash(token)) return res.status(400).json({ error: 'Invalid or expired reset token.' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(password, 12), user.id);
  db.prepare('UPDATE reset_tokens SET used=1 WHERE id=?').run(row.id);
  res.json({ message: 'Password reset successfully.' });
});

module.exports = router;
