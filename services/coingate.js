'use strict';
/**
 * CoinGate Service
 * Documentazione API: https://developer.coingate.com/reference
 *
 * COME FUNZIONA:
 * 1. Tu crei un ordine su CoinGate → ricevi un URL di pagamento
 * 2. Il cliente paga crypto all'URL di CoinGate
 * 3. CoinGate converte in EUR e ti accredita
 * 4. CoinGate manda un webhook al tuo server con lo stato
 */

const axios  = require('axios');
const crypto = require('crypto');

const SANDBOX    = process.env.COINGATE_SANDBOX !== 'false';
const API_KEY    = process.env.COINGATE_API_KEY || '';
const BASE_URL   = SANDBOX
  ? 'https://api-sandbox.coingate.com/v2'
  : 'https://api.coingate.com/v2';

const cgClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Token ${API_KEY}`,
    'Content-Type':  'application/json',
  },
  timeout: 10000,
});

const CoinGate = {
  /**
   * Crea un ordine di pagamento su CoinGate
   * @param {object} params
   * @param {string} params.orderId       - ID ordine interno (es. "CS-A1B2C3D4")
   * @param {number} params.priceEur      - Prezzo totale in EUR
   * @param {string} params.title         - Descrizione prodotto
   * @param {string} params.callbackUrl   - Webhook URL (il tuo server)
   * @param {string} params.successUrl    - Redirect dopo pagamento ok
   * @param {string} params.cancelUrl     - Redirect dopo cancellazione
   * @returns {object} { paymentUrl, cgOrderId, expiresAt }
   */
  async createOrder({ orderId, priceEur, title, callbackUrl, successUrl, cancelUrl }) {
    try {
      const response = await cgClient.post('/orders', {
        order_id:          orderId,
        price_amount:      priceEur.toFixed(2),
        price_currency:    'EUR',
        receive_currency:  'EUR',          // CoinGate converte in EUR e ti accredita
        title:             title.slice(0, 100),
        callback_url:      callbackUrl,
        success_url:       successUrl,
        cancel_url:        cancelUrl,
        token:             orderId,        // campo libero per riconciliazione
      });

      const cg = response.data;
      return {
        ok:          true,
        cgOrderId:   String(cg.id),
        paymentUrl:  cg.payment_url,       // URL dove mandare il cliente
        status:      cg.status,
        expiresAt:   cg.expire_at,
      };
    } catch (err) {
      const status   = err.response?.status;
      const body     = err.response?.data;
      const sandbox  = SANDBOX ? 'sandbox' : 'live';
      console.error(`[CoinGate] createOrder FAILED (${sandbox}) — HTTP ${status ?? 'no-response'}`);
      console.error('[CoinGate] response body:', JSON.stringify(body ?? null));
      console.error('[CoinGate] error message:', err.message);
      return { ok: false, error: body?.reason || body?.message || err.message };
    }
  },

  /**
   * Recupera stato di un ordine CoinGate
   */
  async getOrder(cgOrderId) {
    try {
      const response = await cgClient.get(`/orders/${cgOrderId}`);
      return { ok: true, data: response.data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * Verifica che il webhook venga davvero da CoinGate
   * CoinGate firma i webhook con HMAC-SHA256
   */
  verifyWebhook(rawBody, signatureHeader) {
    const secret = process.env.WEBHOOK_SECRET || '';
    if (!secret) return true; // skip in dev senza secret configurato

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader || '')
    );
  },

  /**
   * Mappa lo status CoinGate al nostro status interno
   * Possibili valori CoinGate: new, pending, confirming, paid, invalid,
   *   expired, canceled, refunded, partially_paid
   */
  mapStatus(cgStatus) {
    const map = {
      new:             'pending_payment',
      pending:         'pending_payment',
      confirming:      'pending_payment',
      paid:            'paid',
      invalid:         'payment_failed',
      expired:         'payment_expired',
      canceled:        'payment_canceled',
      refunded:        'refunded',
      partially_paid:  'partially_paid',
    };
    return map[cgStatus] || 'unknown';
  },
};

module.exports = CoinGate;
