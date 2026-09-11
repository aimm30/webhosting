const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');
const { verified } = require('../lib/auth');
const { products } = require('./products');
const Stripe = require('stripe');
const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const orderId = () => { let id; do { id = 'KM-' + crypto.randomInt(100000,1000000); } while (db.prepare('SELECT 1 FROM orders WHERE order_id=?').get(id)); return id; };

router.get('/payments/config', (req, res) => res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null }));

router.post('/orders', verified, async (req, res) => {
  try {
    const { customer, location, paymentMethod, items, termsAccepted } = req.body || {};
    if (!termsAccepted) return res.status(400).json({ error: 'You must accept the terms.' });
    if (!customer?.name || !customer?.phone || !customer?.city || !customer?.address) return res.status(400).json({ error: 'Complete all delivery fields.' });
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return res.status(400).json({ error: 'Location verification is required.' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Your cart is empty.' });
    const resolved = [];
    for (const i of items) {
      const p = products.find(x => x.id === Number(i.productId));
      const qty = Math.max(1, Math.min(99, Number(i.quantity) || 1));
      if (!p || !p.inStock) return res.status(400).json({ error: 'One of your selected products is unavailable.' });
      resolved.push({ product:p, qty, line:p.price*qty });
    }
    const subtotal = resolved.reduce((s,i) => s+i.line,0), deliveryFee=100, total=subtotal+deliveryFee;
    let paymentStatus = paymentMethod === 'COD' ? 'pending' : 'requires_confirmation';
    let clientSecret = null;
    if (paymentMethod === 'CARD') {
      if (!stripe) return res.status(503).json({ error: 'Card payments are not configured on this server.' });
      const intent = await stripe.paymentIntents.create({ amount:total, currency:'npr', metadata:{userId:String(req.user.id)} });
      clientSecret = intent.client_secret;
    }
    const oid = orderId();
    const tx = db.transaction(() => {
      const r = db.prepare('INSERT INTO orders(order_id,user_id,subtotal,delivery_fee,total,payment_method,payment_status,status,customer_name,phone,city,address,lat,lng,accuracy,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(oid,req.user.id,subtotal,deliveryFee,total,paymentMethod,paymentStatus,paymentMethod==='CARD'?'Payment pending':'Confirmed',customer.name,customer.phone,customer.city,customer.address,location.lat,location.lng,location.accuracy||null,Date.now());
      for (const i of resolved) db.prepare('INSERT INTO order_items(order_db_id,product_id,product_name,unit_price,quantity,line_total) VALUES(?,?,?,?,?,?)').run(r.lastInsertRowid,i.product.id,i.product.name,i.product.price,i.qty,i.line);
    });
    tx();
    const order = db.prepare('SELECT * FROM orders WHERE order_id=?').get(oid);
    res.json({ order:{orderId:order.order_id,total:order.total,status:order.status}, paymentIntentClientSecret:clientSecret });
  } catch(e) { console.error(e); res.status(500).json({ error:'Could not place the order.' }); }
});

router.post('/orders/:orderId/confirm-payment', verified, async (req,res) => {
  try {
    if (!stripe) return res.status(503).json({error:'Card payments are not configured.'});
    const o=db.prepare('SELECT * FROM orders WHERE order_id=? AND user_id=?').get(req.params.orderId,req.user.id);
    if (!o) return res.status(404).json({error:'Order not found.'});
    if (o.payment_method !== 'CARD') return res.json({ok:true,paymentStatus:o.payment_status});
    const intentId=String(req.body?.paymentIntentId||'');
    if (!intentId) return res.status(400).json({error:'Payment confirmation is missing.'});
    const intent=await stripe.paymentIntents.retrieve(intentId);
    if (intent.metadata?.userId !== String(req.user.id)) return res.status(403).json({error:'Payment ownership could not be verified.'});
    if (intent.status !== 'succeeded') return res.status(400).json({error:`Payment is not complete (${intent.status}).`});
    db.prepare("UPDATE orders SET payment_status='succeeded', status='Confirmed' WHERE id=?").run(o.id);
    res.json({ok:true,paymentStatus:'succeeded'});
  } catch(e) { console.error(e); res.status(500).json({error:'Could not confirm payment.'}); }
});

router.get('/orders', verified, (req,res) => {
  const orders=db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
  res.json({orders:orders.map(o=>({...o,items:db.prepare('SELECT product_name AS name,quantity,unit_price,line_total FROM order_items WHERE order_db_id=?').all(o.id)}))});
});

module.exports = router;
