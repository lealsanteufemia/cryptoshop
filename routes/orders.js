'use strict';
const express  = require('express');
const { Orders } = require('../db/database');
const CoinGate = require('../services/coingate');
const { analyzeProductUrl } = require('../services/scraper');
const { sendOrderConfirmation, sendShippingNotification } = require('../services/email');

const router = express.Router();

/* ──────────────────────────────────────────
   POST /api/orders/analyze-url
   Analizza un URL prodotto esterno
   Body: { url: "https://..." }
   ────────────────────────────────────────── */
router.post('/analyze-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url richiesto' });

  console.log(`[Orders] Analizzo URL: ${url}`);
  const result = await analyzeProductUrl(url);

  if (!result.ok) return res.status(422).json({ error: result.error });
  return res.json(result);
});

/* ──────────────────────────────────────────
   POST /api/orders
   Crea un nuovo ordine e genera pagamento crypto
   Body: {
     productName, productUrl, productSrc,
     priceEur, customerName, customerEmail,
     shippingAddress, cryptoCurrency
   }
   ────────────────────────────────────────── */
router.post('/', async (req, res) => {
  const {
    productName, productUrl, productSrc, priceEur,
    customerName, customerEmail, shippingAddress, cryptoCurrency = 'USDC'
  } = req.body;

  // Validazione
  if (!productName || !priceEur || !customerEmail || !shippingAddress) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }

  const commission  = parseFloat((priceEur * 0.10).toFixed(2));
  const totalEur    = parseFloat((priceEur + commission).toFixed(2));

  // 1. Crea ordine nel DB
  const order = Orders.create({
    productName,
    productUrl:       productUrl || null,
    productSrc:       productSrc || 'esterno',
    priceEur,
    commissionEur:    commission,
    totalEur,
    customerName,
    customerEmail,
    shippingAddress,
    cryptoCurrency,
  });

  console.log(`[Orders] Creato ordine ${order.id} – €${totalEur}`);

  // 2. Crea pagamento su CoinGate
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const cgResult = await CoinGate.createOrder({
    orderId:     order.id,
    priceEur:    totalEur,
    title:       productName,
    callbackUrl: `${process.env.API_URL || 'http://localhost:3001'}/api/orders/webhook`,
    successUrl:  `${baseUrl}/success?id=${order.id}`,
    cancelUrl:   `${baseUrl}/checkout?id=${order.id}&canceled=1`,
  });

  if (!cgResult.ok) {
    console.error(`[Orders] CoinGate error per ordine ${order.id}:`, cgResult.error);
    // In produzione: potresti voler annullare l'ordine o segnalarlo
    // Per ora restituiamo l'ordine con URL di pagamento placeholder
    Orders.update(order.id, { coinGateError: cgResult.error });
    return res.status(201).json({
      order,
      paymentUrl: `${baseUrl}/pay-fallback?id=${order.id}`,
      warning:    'CoinGate non disponibile, usa il fallback'
    });
  }

  // 3. Aggiorna ordine con dati CoinGate
  const updatedOrder = Orders.update(order.id, {
    coinGateOrderId: cgResult.cgOrderId,
    paymentUrl:      cgResult.paymentUrl,
    paymentExpiresAt: cgResult.expiresAt,
  });

  console.log(`[Orders] Pagamento CoinGate creato: ${cgResult.paymentUrl}`);

  return res.status(201).json({
    order:      updatedOrder,
    paymentUrl: cgResult.paymentUrl,
    expiresAt:  cgResult.expiresAt,
  });
});

/* ──────────────────────────────────────────
   POST /api/orders/webhook
   Riceve notifiche di pagamento da CoinGate
   ────────────────────────────────────────── */
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const sig = req.headers['x-coingate-signature'];
  const raw = req.body;

  console.log('[Webhook] ← ricevuto — Content-Type:', req.headers['content-type']);
  console.log('[Webhook] body length:', raw?.length ?? 0, '| signature header:', sig ? 'presente' : 'ASSENTE');

  // Verifica firma
  const sigOk = CoinGate.verifyWebhook(raw, sig);
  if (!sigOk) {
    console.warn('[Webhook] ❌ Firma non valida — WEBHOOK_SECRET impostato:', !!process.env.WEBHOOK_SECRET);
    console.warn('[Webhook] signature ricevuta:', sig);
    return res.status(401).json({ error: 'Invalid signature' });
  }
  console.log('[Webhook] ✓ Firma ok (o WEBHOOK_SECRET non configurato)');

  let payload;
  try {
    payload = JSON.parse(raw.toString());
  } catch (parseErr) {
    console.error('[Webhook] ❌ JSON non valido:', parseErr.message);
    console.error('[Webhook] raw body:', raw.toString().slice(0, 200));
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log(`[Webhook] payload: status=${payload.status} id=${payload.id} token=${payload.token}`);

  const order = Orders.findByCoinGateId(String(payload.id));
  if (!order) {
    console.warn(`[Webhook] ⚠️  Ordine CoinGate #${payload.id} non trovato nel DB`);
    console.warn('[Webhook] token nel payload:', payload.token);
    return res.status(200).json({ ok: true });
  }

  console.log(`[Webhook] ordine interno trovato: ${order.id} — stato attuale: ${order.status}`);

  const newStatus = CoinGate.mapStatus(payload.status);
  console.log(`[Webhook] mapStatus: ${payload.status} → ${newStatus}`);

  Orders.update(order.id, {
    cryptoStatus:   payload.status,
    cryptoAmount:   payload.pay_amount,
    cryptoCurrency: payload.pay_currency,
    paidAt:         payload.status === 'paid' ? new Date().toISOString() : undefined,
  });
  Orders.addTimeline(order.id, newStatus, `Pagamento ${payload.status}`);
  console.log(`[Webhook] ordine ${order.id} aggiornato a ${newStatus}`);

  if (payload.status === 'paid') {
    console.log(`[Webhook] ✅ Pagamento confermato per ordine ${order.id} — invio email a ${order.customerEmail}`);
    try {
      await sendOrderConfirmation({
        ...order,
        cryptoAmount:   payload.pay_amount,
        cryptoCurrency: payload.pay_currency,
      });
      console.log(`[Webhook] ✓ Email inviata a ${order.customerEmail}`);
    } catch (mailErr) {
      console.error('[Webhook] ❌ Errore invio email:', mailErr.message);
    }
  }

  return res.status(200).json({ ok: true });
});

/* ──────────────────────────────────────────
   GET /api/orders/:id
   Stato di un ordine specifico
   ────────────────────────────────────────── */
router.get('/:id', (req, res) => {
  const order = Orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Ordine non trovato' });
  return res.json(order);
});

/* ──────────────────────────────────────────
   GET /api/orders?email=...
   Tutti gli ordini di un cliente
   ────────────────────────────────────────── */
router.get('/', (req, res) => {
  const { email } = req.query;
  const list = email ? Orders.byEmail(email) : Orders.all();
  return res.json(list);
});

/* ──────────────────────────────────────────
   PATCH /api/orders/:id/status
   Aggiorna stato manualmente (uso admin)
   Body: { status, trackingCode, carrier }
   ────────────────────────────────────────── */
router.patch('/:id/status', async (req, res) => {
  const { status, trackingCode, carrier } = req.body;
  const order = Orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

  const updated = Orders.update(order.id, { status, trackingCode, carrier });
  Orders.addTimeline(order.id, status, `Stato aggiornato a: ${status}`);

  // Manda email se spedito
  if (status === 'shipped') {
    await sendShippingNotification({ ...updated, trackingCode, carrier });
  }

  return res.json(updated);
});

module.exports = router;
