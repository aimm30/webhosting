const express = require('express');
const db = require('../lib/db');
const { admin } = require('../lib/auth');
const router = express.Router();

router.get('/admin/dashboard', admin, (req,res) => {
  const summary = db.prepare(`SELECT COALESCE(SUM(total),0) revenue,COUNT(*) orders,COALESCE((SELECT SUM(quantity) FROM order_items),0) units,(SELECT COUNT(*) FROM users WHERE email_verified=1) customers FROM orders WHERE payment_method='COD' OR payment_status='succeeded'`).get();
  const orders = db.prepare('SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 250').all().map(o=>({...o,customerName:o.customer_name,items:db.prepare('SELECT product_name AS name,quantity,unit_price,line_total FROM order_items WHERE order_db_id=?').all(o.id)}));
  const productSales = db.prepare("SELECT product_name AS name,SUM(quantity) units,SUM(line_total) revenue FROM order_items oi JOIN orders o ON o.id=oi.order_db_id WHERE o.payment_method='COD' OR o.payment_status='succeeded' GROUP BY product_id ORDER BY revenue DESC").all();
  // No artificial 250-user cap: the admin gets the complete registered-user list.
  const customers = db.prepare('SELECT name,email,phone,email_verified,created_at FROM users ORDER BY created_at DESC').all();
  res.json({summary,orders,productSales,customers});
});
module.exports = router;
