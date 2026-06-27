'use strict';

/**
 * Scraper Amazon — attualmente non usato nel flusso principale.
 *
 * Amazon carica i prezzi via JavaScript con ID generati dinamicamente,
 * rendendo lo scraping CSS instabile. Il flusso adottato (opzione C) prevede
 * che il frontend passi direttamente il prezzo in verify-price.prezzo_attuale.
 *
 * Quando si vorrà implementare la verifica reale, le opzioni consigliate sono:
 *   - RainforestAPI / BigBox API (API dedicate Amazon)
 *   - Amazon Product Advertising API (ufficiale, richiede approvazione)
 */

const TIMEOUT_MS = parseInt(process.env.SCRAPER_TIMEOUT_MS || '10000', 10);

// Cache dei moduli ESM — vengono caricati una sola volta
let _puppeteer = null;
let _chromium  = null;

async function getPuppeteer() {
  if (!_puppeteer) {
    const mod = await import('puppeteer-core');
    _puppeteer = mod.default;
  }
  return _puppeteer;
}

async function getChromium() {
  if (!_chromium) {
    const mod = await import('@sparticuz/chromium');
    _chromium = mod.default;
  }
  return _chromium;
}

async function getExecutablePath(chromium) {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) {
    return process.env.CHROMIUM_EXECUTABLE_PATH;
  }
  return chromium.executablePath();
}

async function getAmazonPrice(url) {
  const [puppeteer, chromium] = await Promise.all([getPuppeteer(), getChromium()]);
  let browser;
  try {
    browser = await puppeteer.launch({
      args:            chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath:  await getExecutablePath(chromium),
      headless:        true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    const navTimeout  = Math.floor(TIMEOUT_MS * 0.6);
    const waitTimeout = Math.floor(TIMEOUT_MS * 0.4);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });

    const title = await page.title();
    if (title.toLowerCase().includes('robot') || title.toLowerCase().includes('captcha')) {
      throw new Error('Amazon ha rilevato un accesso automatico (CAPTCHA)');
    }

    // Strategia 1: JSON-LD strutturato
    const jsonLdPrice = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const items = [].concat(JSON.parse(script.textContent));
          for (const item of items) {
            if (item['@type'] === 'Product' && item.offers) {
              const offer = [].concat(item.offers)[0];
              const p = parseFloat(String(offer.price).replace(',', '.'));
              if (!isNaN(p) && p > 0) return p;
            }
          }
        } catch (_) {}
      }
      return null;
    });
    if (jsonLdPrice !== null) return jsonLdPrice;

    // Strategia 2: itemprop="price"
    const itempropPrice = await page.evaluate(() => {
      const el = document.querySelector('[itemprop="price"]');
      if (!el) return null;
      const raw = el.getAttribute('content') || el.textContent;
      const p = parseFloat(String(raw).replace(',', '.'));
      return (!isNaN(p) && p > 0) ? p : null;
    });
    if (itempropPrice !== null) return itempropPrice;

    // Strategia 3: selettori CSS noti
    const CSS_SELECTORS = [
      '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#apex_offerDisplay_desktop .a-price .a-offscreen',
      '#corePrice_feature_div .a-price .a-offscreen',
      '.apexPriceToPay .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
    ];
    try {
      await page.waitForSelector(CSS_SELECTORS.join(', '), { timeout: waitTimeout });
    } catch (_) {}

    for (const selector of CSS_SELECTORS) {
      const el = await page.$(selector);
      if (!el) continue;
      const text  = await page.evaluate(e => e.textContent, el);
      const price = parseFloat(text.replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!isNaN(price) && price > 0) return price;
    }

    throw new Error('Prezzo non trovato nella pagina Amazon');
  } catch (err) {
    if (err.message.toLowerCase().includes('timeout')) {
      throw new Error(`Timeout: Amazon non ha risposto entro ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { getAmazonPrice };
