'use strict';
const express = require('express');
const router  = express.Router();
const { searchProducts } = require('../services/search');

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

router.get('/', async (req, res) => {
  // CORS headers espliciti
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  const { q, limit = '16' } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query troppo corta' });
  }

  const cacheKey = q.toLowerCase().trim();
  if (cache.has(cacheKey)) {
    const { data, ts } = cache.get(cacheKey);
    if (Date.now() - ts < CACHE_TTL) {
      return res.json({ ...data, cached: true });
    }
    cache.delete(cacheKey);
  }

  try {
    const data = await searchProducts(q.trim(), { limit: parseInt(limit) || 16 });
    cache.set(cacheKey, { data, ts: Date.now() });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.options('/', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

router.get('/suggestions', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  const { q } = req.query;
  if (!q) return res.json([]);
  const SUGGESTIONS = ['iPhone 16 Pro','AirPods Pro','Samsung Galaxy S25','Sony WH-1000XM5','Dyson V15','Nike Air Max','PlayStation 5','Nintendo Switch 2','MacBook Pro','Apple Watch','iPad Pro','Kindle Paperwhite','LEGO Technic','Adidas Stan Smith','Bose QuietComfort'];
  const matches = SUGGESTIONS.filter(s => s.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
  return res.json(matches);
});

module.exports = router;
