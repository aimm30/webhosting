const express = require('express');
const { ADMIN_EMAIL } = require('../config');
const { products } = require('./products');
const router = express.Router();
router.post('/chat', async (req,res) => {
  const message=String(req.body?.message||'').trim();
  if (!message) return res.status(400).json({error:'Message required'});
  if (process.env.OPENAI_API_KEY) {
    try {
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5-mini',input:[{role:'system',content:[{type:'input_text',text:`You are Kanjirowa Mart's store assistant. Store facts: delivery fee Rs. 100 per order; checkout requires a verified account; payments are COD or card when configured; support ${ADMIN_EMAIL}. Catalog has ${products.length} products. Never invent store policy.`}]},{role:'user',content:[{type:'input_text',text:message}]}],max_output_tokens:220})});
      const data=await r.json();
      const reply=data.output_text||data.output?.map(x=>x.content?.map(c=>c.text||'').join('')).join('')||null;
      if (reply) return res.json({reply});
    } catch(e) { console.warn('[chat] AI request failed; fallback used'); }
  }
  res.json({reply:'I can help with products, delivery, account verification, payment setup, and your orders. Tell me what you need.'});
});
module.exports = router;
