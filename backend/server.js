require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { DATA_DIR, PORT, SESSION_SECRET, NODE_ENV } = require('./config');
const db = require('./lib/db');
const products = require('./routes/products');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const fs = require('fs');

fs.mkdirSync(DATA_DIR, { recursive: true });
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy:false }));
app.use(express.json({ limit:'1mb' }));
app.use(rateLimit({ windowMs:60*1000, max:180, standardHeaders:true, legacyHeaders:false }));
app.use(session({
  secret: SESSION_SECRET,
  resave:false,
  saveUninitialized:false,
  store:new SQLiteStore({ db:'sessions.sqlite', dir:DATA_DIR }),
  cookie:{ httpOnly:true, sameSite:'lax', secure:NODE_ENV==='production', maxAge:7*24*60*60*1000 }
}));

app.get('/api/health', (req,res) => res.json({ ok:true, service:'kanjirowa-mart', timestamp:Date.now() }));
app.use('/api', products.router);
app.use('/api', authRoutes);
app.use('/api', orderRoutes);
app.use('/api', adminRoutes);
app.use('/api', chatRoutes);

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (req,res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));

app.listen(PORT, () => console.log(`Kanjirowa Mart running on http://localhost:${PORT}`));
