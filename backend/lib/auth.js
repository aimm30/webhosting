const db = require('./db');
const { ADMIN_EMAIL } = require('../config');

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    emailVerified: !!row.email_verified,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at
  };
}

function auth(req, res, next) {
  const u = req.session.userId
    ? db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId)
    : null;
  if (!u) return res.status(401).json({ error: 'Please log in first.' });
  req.user = u;
  next();
}

function verified(req, res, next) {
  auth(req, res, () => {
    if (!req.user.email_verified) return res.status(403).json({ error: 'Please verify your email first.' });
    next();
  });
}

function admin(req, res, next) {
  auth(req, res, () => {
    if (!req.user.is_admin || req.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  });
}

module.exports = { publicUser, auth, verified, admin };
