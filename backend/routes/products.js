const express = require('express');
const products = require('../products-seed.json');
const router = express.Router();
router.get('/products', (req, res) => res.json({ products }));
router.get('/categories', (req, res) => {
  const counts = new Map();
  for (const p of products) counts.set(p.category, (counts.get(p.category) || 0) + 1);
  res.json({ categories: [...counts.entries()].map(([category, count]) => ({ category, count })) });
});
module.exports = { router, products };
