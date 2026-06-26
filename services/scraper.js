'use strict';
/**
 * Scraper Service
 * Legge nome e prezzo da qualsiasi URL di prodotto
 *
 * STRATEGIA:
 * 1. Prima prova Open Graph / JSON-LD (funziona per molti siti)
 * 2. Se no, usa ScrapingBee (servizio a pagamento, 1000 req/mese gratis)
 * 3. Fallback: restituisce dati stub con il dominio dell'URL
 *
 * ALTERNATIVE GRATUITE:
 * - scrapeowl.com  → 50 req/mese gratis
 * - scrapingant.com → 10.000 req/mese gratis (piano base)
 */

const axios = require('axios');

/* ─── UTILITY: estrai dominio da URL ─── */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/* ─── UTILITY: pulisci prezzo da stringa ─── */
function parsePrice(str) {
  if (!str) return null;
  const clean = String(str).replace(/[^\d.,]/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

/* ─── STRATEGY 1: Fetch diretto + parsing HTML ─── */
async function fetchDirect(url) {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CryptoShopBot/1.0)',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      }
    });

    // JSON-LD (schema.org Product)
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const json = JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi, ''));
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            if (item['@type'] === 'Product') {
              const name  = item.name;
              const offer = item.offers || item.Offers;
              const price = offer ? parsePrice(offer.price || offer.lowPrice) : null;
              const image = item.image?.url || item.image?.[0] || item.image;
              if (name && price) return { name, price, image, source: 'json-ld' };
            }
          }
        } catch {}
      }
    }

    // Open Graph
    const ogTitle = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)||[])[1];
    const ogImage = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)||[])[1];
    const ogPrice = (html.match(/<meta[^>]+property="product:price:amount"[^>]+content="([^"]+)"/i)||
                     html.match(/<meta[^>]+property="og:price:amount"[^>]+content="([^"]+)"/i)||[])[1];

    if (ogTitle && ogPrice) {
      return { name: ogTitle, price: parsePrice(ogPrice), image: ogImage, source: 'og' };
    }

    // Title tag come fallback nome
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)||[])[1];
    if (title && ogPrice) {
      return { name: title.split('|')[0].split('-')[0].trim(), price: parsePrice(ogPrice), source: 'title+og' };
    }

    return null;
  } catch (err) {
    console.warn('[Scraper] fetchDirect error:', err.message);
    return null;
  }
}

/* ─── STRATEGY 2: ScrapingBee (servizio esterno) ─── */
async function fetchScrapingBee(url) {
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) return null;

  try {
    const { data: html } = await axios.get('https://app.scrapingbee.com/api/v1', {
      params: {
        api_key:        key,
        url:            url,
        render_js:      false,
        extract_rules:  JSON.stringify({
          name:  { selector: 'h1', type: 'text' },
          price: { selector: '[class*="price"],[itemprop="price"]', type: 'text' },
        }),
      },
      timeout: 15000,
    });

    if (html.name && html.price) {
      return {
        name:   html.name,
        price:  parsePrice(html.price),
        source: 'scrapingbee',
      };
    }
    return null;
  } catch (err) {
    console.warn('[Scraper] ScrapingBee error:', err.message);
    return null;
  }
}

/* ─── STRATEGY 3: Stub realistico per demo/test ─── */
function buildStub(url) {
  const domain = extractDomain(url);
  const stubs = {
    'amazon.it':    { name: 'Prodotto Amazon', price: Math.floor(Math.random()*300)+20 },
    'amazon.com':   { name: 'Amazon Product',  price: Math.floor(Math.random()*300)+20 },
    'zalando.it':   { name: 'Articolo Zalando', price: Math.floor(Math.random()*200)+30 },
    'apple.com':    { name: 'Prodotto Apple',  price: Math.floor(Math.random()*800)+200 },
    'ebay.it':      { name: 'Articolo eBay',   price: Math.floor(Math.random()*150)+10 },
    'ikea.com':     { name: 'Articolo IKEA',   price: Math.floor(Math.random()*200)+15 },
  };
  const s = stubs[domain] || { name: `Prodotto da ${domain}`, price: Math.floor(Math.random()*200)+50 };
  return { ...s, source: 'stub', domain };
}

/* ─── MAIN: analizza URL prodotto ─── */
async function analyzeProductUrl(url) {
  if (!url || !url.startsWith('http')) {
    return { ok: false, error: 'URL non valido' };
  }

  const domain = extractDomain(url);

  // Prova fetch diretto
  let result = await fetchDirect(url);

  // Prova ScrapingBee se il fetch diretto fallisce
  if (!result?.price) {
    result = await fetchScrapingBee(url);
  }

  // Fallback stub
  if (!result?.price) {
    result = buildStub(url);
  }

  const priceEur = result.price || 99;
  const commission = priceEur * 0.10;
  const totalEur = priceEur + commission;

  return {
    ok: true,
    product: {
      name:        result.name || `Prodotto da ${domain}`,
      image:       result.image || null,
      priceEur,
      domain,
      url,
      available:   true,
      source:      result.source,
    },
    pricing: {
      priceEur,
      commissionEur:  parseFloat(commission.toFixed(2)),
      commissionPct:  10,
      totalEur:       parseFloat(totalEur.toFixed(2)),
      // Conversioni crypto (tassi simulati — in produzione usa CoinGate rates API)
      totalUsdc: parseFloat((totalEur / 0.87).toFixed(2)),
      totalEth:  parseFloat((totalEur / 2341).toFixed(6)),
      totalBtc:  parseFloat((totalEur / 89200).toFixed(8)),
    }
  };
}

module.exports = { analyzeProductUrl, extractDomain };
