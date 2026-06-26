'use strict';
/**
 * Search Route — GET /api/search?q=cuffie+apple
 *
 * Ricerca prodotti in tempo reale da Google Shopping
 * tramite SerpAPI (o fallback demo se non configurata)
 */

const express = require('express');
const router  = express.Router();
const { searchProducts } = require('../services/search');

// Cache semplice in memoria per evitare chiamate duplicate
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minuti

/* ──────────────────────────────────────────
   GET /api/search?q=cuffie+apple
   Query params:
     q       (obbligatorio) — testo ricerca
     country  (opzionale)   — it, de, fr, us... default: it
     limit    (opzionale)   — max risultati, default: 12
   ────────────────────────────────────────── */
router.get('/', async (req, res) => {
  const { q, country = 'it', limit = '12' } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Inserisci almeno 2 caratteri' });
  }

  const cacheKey = `${q.toLowerCase().trim()}:${country}`;

  // Controlla cache
  if (cache.has(cacheKey)) {
    const { data, ts } = cache.get(cacheKey);
    if (Date.now() - ts < CACHE_TTL) {
      console.log(`[Search] Cache hit: "${q}"`);
      return res.json({ ...data, cached: true });
    }
    cache.delete(cacheKey);
  }

  try {
    console.log(`[Search] Ricerca: "${q}" (${country})`);
    const data = await searchProducts(q.trim(), {
      country,
      limit: Math.min(parseInt(limit) || 12, 24),
    });

    // Salva in cache
    cache.set(cacheKey, { data, ts: Date.now() });

    // Pulisci cache vecchia ogni tanto
    if (cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of cache.entries()) {
        if (now - v.ts > CACHE_TTL) cache.delete(k);
      }
    }

    return res.json(data);

  } catch (err) {
    console.error('[Search] Errore:', err.message);
    return res.status(500).json({ error: 'Errore nella ricerca', detail: err.message });
  }
});

/* ──────────────────────────────────────────
   GET /api/search/suggestions?q=cuf
   Suggerimenti di ricerca (autocompletamento)
   ────────────────────────────────────────── */
const SUGGESTIONS = [
  'iPhone 16 Pro', 'AirPods Pro', 'Samsung Galaxy S25',
  'Sony WH-1000XM5', 'Dyson V15', 'Nike Air Max',
  'PlayStation 5', 'Nintendo Switch 2', 'MacBook Pro',
  'Apple Watch Series 10', 'iPad Pro', 'Kindle Paperwhite',
  'LEGO Technic', 'Adidas Stan Smith', 'Bose QuietComfort',
  'Nespresso Vertuo', 'Dyson Airwrap', 'GoPro Hero 13',
  'DJI Mini 4 Pro', 'Garmin Fenix 8', 'Fitbit Charge 6',
];

router.get('/suggestions', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.json([]);
  const lower = q.toLowerCase();
  const matches = SUGGESTIONS.filter(s => s.toLowerCase().includes(lower)).slice(0, 6);
  return res.json(matches);
});

module.exports = router;
