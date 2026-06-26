'use strict';
/**
 * Search Service — Ricerca prodotti in tempo reale
 *
 * PROVIDER USATO: SerpAPI (Google Shopping)
 * Piano gratuito: 100 ricerche/mese
 * Piano base:     $50/mese → 5.000 ricerche
 * Signup:         https://serpapi.com
 *
 * FALLBACK AUTOMATICO:
 * Se SerpAPI non è configurata → usa dati demo realistici
 * così il sito funziona anche senza API key
 */

const axios = require('axios');

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
const SCRAPING_KEY = process.env.SCRAPINGBEE_API_KEY || '';

/* ─── PROVIDER 1: SerpAPI (Google Shopping) ─── */
async function searchViaSerpApi(query, country = 'it') {
  const { data } = await axios.get('https://serpapi.com/search', {
    params: {
      api_key:  SERPAPI_KEY,
      engine:   'google_shopping',
      q:        query,
      gl:       country,   // paese (it, de, fr, us...)
      hl:       'it',      // lingua
      num:      20,        // quanti risultati
    },
    timeout: 8000,
  });

  const results = data.shopping_results || [];
  return results.map(r => ({
    name:     r.title,
    price:    parseFloat((r.price || '0').replace(/[^\d.,]/g, '').replace(',', '.')),
    currency: 'EUR',
    store:    r.source,
    url:      r.link || r.product_link,
    image:    r.thumbnail,
    rating:   r.rating,
    reviews:  r.reviews,
    badge:    r.badge,
  })).filter(r => r.price > 0);
}

/* ─── PROVIDER 2: ScrapingBee (Google Shopping) ─── */
async function searchViaScraping(query) {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop&hl=it&gl=it`;
  const { data: html } = await axios.get('https://app.scrapingbee.com/api/v1', {
    params: {
      api_key:    SCRAPING_KEY,
      url:        googleUrl,
      render_js:  false,
    },
    timeout: 12000,
  });

  // Parsing base dei risultati Google Shopping dall'HTML
  const results = [];
  const regex = /<div[^>]+class="[^"]*sh-dgr__grid-result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  // fallback: estrai prezzi e titoli con regex semplici
  const titles  = [...html.matchAll(/aria-label="([^"]{10,100})"/g)].map(m=>m[1]);
  const prices  = [...html.matchAll(/>\s*(\d+[.,]\d{2})\s*€/g)].map(m=>parseFloat(m[1].replace(',','.')));
  for (let i = 0; i < Math.min(titles.length, prices.length, 10); i++) {
    results.push({ name: titles[i], price: prices[i], currency: 'EUR', store: 'Google Shopping', url: '', image: '' });
  }
  return results.filter(r => r.price > 0);
}

/* ─── PROVIDER 3: Demo realistici (fallback senza API) ─── */
const DEMO_PRODUCTS = {
  default: [
    { name: 'Apple AirPods Pro (2ª gen.) MagSafe USB-C', price: 249, store: 'amazon.it', image: '🎧', rating: 4.8, reviews: 12400 },
    { name: 'Apple AirPods Pro 2 - Ricondizionato Grado A', price: 189, store: 'ebay.it', image: '🎧', rating: 4.5, reviews: 890 },
    { name: 'Apple AirPods Pro 2ª generazione', price: 259, store: 'unieuro.it', image: '🎧', rating: 4.7, reviews: 3200 },
    { name: 'Apple AirPods Pro 2 con custodia MagSafe', price: 245, store: 'mediaworld.it', image: '🎧', rating: 4.8, reviews: 5600 },
    { name: 'Apple AirPods Pro 2 - Sealed Box', price: 219, store: 'euronics.it', image: '🎧', rating: 4.6, reviews: 1100 },
  ],
  cuffie: [
    { name: 'Sony WH-1000XM5 Wireless Noise Cancelling', price: 279, store: 'amazon.it', image: '🎧', rating: 4.8, reviews: 8900 },
    { name: 'Bose QuietComfort 45 Bluetooth', price: 249, store: 'unieuro.it', image: '🎧', rating: 4.7, reviews: 4200 },
    { name: 'Apple AirPods Max Space Gray', price: 449, store: 'apple.com', image: '🎧', rating: 4.6, reviews: 6700 },
    { name: 'Samsung Galaxy Buds2 Pro', price: 149, store: 'samsung.com', image: '🎧', rating: 4.5, reviews: 3100 },
    { name: 'JBL Tune 770NC Wireless', price: 89, store: 'mediaworld.it', image: '🎧', rating: 4.4, reviews: 2200 },
    { name: 'Jabra Evolve2 55 UC Stereo', price: 319, store: 'amazon.it', image: '🎧', rating: 4.7, reviews: 1800 },
  ],
  iphone: [
    { name: 'Apple iPhone 16 Pro 256GB Titanio Naturale', price: 1299, store: 'apple.com', image: '📱', rating: 4.9, reviews: 15600 },
    { name: 'Apple iPhone 16 128GB Nero', price: 899, store: 'amazon.it', image: '📱', rating: 4.8, reviews: 9200 },
    { name: 'Apple iPhone 15 Pro 256GB Titanio Blu', price: 999, store: 'unieuro.it', image: '📱', rating: 4.8, reviews: 12100 },
    { name: 'Apple iPhone 16 Plus 256GB Verde', price: 1099, store: 'mediaworld.it', image: '📱', rating: 4.7, reviews: 4300 },
    { name: 'Apple iPhone 15 128GB - Ricondizionato A+', price: 649, store: 'ebay.it', image: '📱', rating: 4.6, reviews: 2800 },
  ],
  samsung: [
    { name: 'Samsung Galaxy S25 Ultra 256GB Titanium Gray', price: 1299, store: 'samsung.com', image: '📱', rating: 4.8, reviews: 7600 },
    { name: 'Samsung Galaxy S25+ 512GB Icy Blue', price: 999, store: 'amazon.it', image: '📱', rating: 4.7, reviews: 4100 },
    { name: 'Samsung Galaxy A55 5G 256GB Awesome Iceblue', price: 399, store: 'unieuro.it', image: '📱', rating: 4.5, reviews: 3200 },
    { name: 'Samsung Galaxy Z Fold6 512GB Navy', price: 1799, store: 'mediaworld.it', image: '📱', rating: 4.6, reviews: 1900 },
  ],
  nike: [
    { name: 'Nike Air Max 270 React Uomo EU 42', price: 129, store: 'zalando.it', image: '👟', rating: 4.6, reviews: 5400 },
    { name: 'Nike Air Force 1 \'07 Bianco Uomo EU 43', price: 109, store: 'nike.com', image: '👟', rating: 4.8, reviews: 18200 },
    { name: 'Nike Revolution 7 Scarpe Running', price: 64, store: 'amazon.it', image: '👟', rating: 4.4, reviews: 3100 },
    { name: 'Nike Dunk Low Retro Panda EU 41', price: 115, store: 'footlocker.eu', image: '👟', rating: 4.7, reviews: 9800 },
    { name: 'Nike Pegasus 41 Running Uomo', price: 135, store: 'decathlon.it', image: '👟', rating: 4.6, reviews: 2700 },
  ],
  dyson: [
    { name: 'Dyson V15 Detect Absolute Aspirapolvere Senza Fili', price: 649, store: 'dyson.it', image: '🌀', rating: 4.8, reviews: 6700 },
    { name: 'Dyson V12 Detect Slim Absolute', price: 499, store: 'amazon.it', image: '🌀', rating: 4.7, reviews: 4200 },
    { name: 'Dyson Airwrap Multi-Styler Complete', price: 479, store: 'sephora.it', image: '💨', rating: 4.8, reviews: 11300 },
    { name: 'Dyson V11 Outsize Aspirapolvere', price: 549, store: 'unieuro.it', image: '🌀', rating: 4.7, reviews: 3800 },
  ],
  playstation: [
    { name: 'Sony PlayStation 5 Slim Console + Controller', price: 449, store: 'gamestop.it', image: '🎮', rating: 4.9, reviews: 22400 },
    { name: 'PS5 Slim Digital Edition', price: 349, store: 'amazon.it', image: '🎮', rating: 4.8, reviews: 8900 },
    { name: 'DualSense Controller PS5 Midnight Black', price: 69, store: 'mediaworld.it', image: '🎮', rating: 4.7, reviews: 15600 },
    { name: 'God of War Ragnarök PS5', price: 39, store: 'gamestop.it', image: '🎮', rating: 4.9, reviews: 34200 },
  ],
  lego: [
    { name: 'LEGO Technic Bugatti Chiron 42083 — 3599 pezzi', price: 369, store: 'lego.com', image: '🧱', rating: 4.9, reviews: 8700 },
    { name: 'LEGO City Stazione Spaziale 60438', price: 89, store: 'amazon.it', image: '🧱', rating: 4.7, reviews: 2100 },
    { name: 'LEGO Icons Botanica — Bouquet di Fiori 10280', price: 49, store: 'amazon.it', image: '🧱', rating: 4.8, reviews: 5600 },
    { name: 'LEGO Star Wars Millennium Falcon 75192', price: 699, store: 'lego.com', image: '🧱', rating: 4.9, reviews: 12300 },
  ],
};

function getDemoResults(query) {
  const q = query.toLowerCase();
  for (const [key, products] of Object.entries(DEMO_PRODUCTS)) {
    if (key !== 'default' && q.includes(key)) {
      return products.map(p => ({ ...p, url: `https://${p.store}/search?q=${encodeURIComponent(query)}` }));
    }
  }
  // Generic fallback: prende il default e aggiunge il nome della query
  return DEMO_PRODUCTS.default.map(p => ({
    ...p,
    name: p.name.replace('Apple AirPods Pro', query.charAt(0).toUpperCase() + query.slice(1)),
    url:  `https://${p.store}/search?q=${encodeURIComponent(query)}`,
  }));
}

/* ─── MAIN: ricerca unificata ─── */
async function searchProducts(query, options = {}) {
  const { country = 'it', limit = 12 } = options;

  let results = [];
  let source  = 'demo';

  // Prova SerpAPI (Google Shopping)
  if (SERPAPI_KEY) {
    try {
      results = await searchViaSerpApi(query, country);
      source  = 'serpapi';
      console.log(`[Search] SerpAPI: ${results.length} risultati per "${query}"`);
    } catch (err) {
      console.warn('[Search] SerpAPI fallito:', err.message);
    }
  }

  // Prova ScrapingBee se SerpAPI non disponibile
  if (!results.length && SCRAPING_KEY) {
    try {
      results = await searchViaScraping(query);
      source  = 'scraping';
      console.log(`[Search] ScrapingBee: ${results.length} risultati per "${query}"`);
    } catch (err) {
      console.warn('[Search] ScrapingBee fallito:', err.message);
    }
  }

  // Fallback demo
  if (!results.length) {
    results = getDemoResults(query);
    source  = 'demo';
    console.log(`[Search] Demo: ${results.length} risultati per "${query}"`);
  }

  // Arricchisci con calcolo prezzi CryptoShop
  const enriched = results.slice(0, limit).map((r, i) => {
    const priceEur    = r.price || 0;
    const commission  = Math.max(priceEur * 0.10, 5);
    const providers   = priceEur * 0.022 + 0.30;
    const totalEur    = parseFloat((priceEur + commission + providers).toFixed(2));
    return {
      id:          `sr-${Date.now()}-${i}`,
      name:        r.name,
      priceEur,
      store:       r.store,
      url:         r.url,
      image:       r.image,
      rating:      r.rating,
      reviews:     r.reviews,
      badge:       r.badge,
      // Prezzi CryptoShop
      commissionEur: parseFloat(commission.toFixed(2)),
      totalEur,
      totalUsdc:   parseFloat((totalEur / 0.87).toFixed(2)),
    };
  });

  return { results: enriched, source, query };
}

module.exports = { searchProducts };
