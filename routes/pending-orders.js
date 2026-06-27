'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const FIXED_COSTS    = parseFloat(process.env.ORDER_FIXED_COSTS    || '2');
const EXPIRY_MINUTES = parseInt(process.env.ORDER_EXPIRY_MINUTES   || '10', 10);

// Store in-memory
const pendingOrders = new Map();

/* ──────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────── */

function buildOrder(product) {
  const prezzoOriginale = product.price;
  const margine         = parseFloat((prezzoOriginale * 0.15).toFixed(2));
  const prezzoBloccato  = Math.ceil((prezzoOriginale * 1.15 + FIXED_COSTS) * 100) / 100;
  const now             = new Date();
  const scadeIl         = new Date(now.getTime() + EXPIRY_MINUTES * 60 * 1000);

  return {
    id:               uuidv4(),
    product: {
      title:  product.title,
      price:  product.price,
      link:   product.link,
      source: product.source,
      image:  product.image,
    },
    prezzo_originale: prezzoOriginale,
    margine,
    costi_fissi:      FIXED_COSTS,
    prezzo_bloccato:  prezzoBloccato,
    stato:            'PENDING_PAYMENT',
    creato_il:        now.toISOString(),
    scade_il:         scadeIl.toISOString(),
  };
}

function checkExpiry(order) {
  if (order.stato === 'PENDING_PAYMENT' && new Date() > new Date(order.scade_il)) {
    order.stato = 'EXPIRED';
  }
  return order;
}

/* ──────────────────────────────────────────
   POST /api/pending-orders
   Crea un ordine pendente con prezzo bloccato
   ────────────────────────────────────────── */
router.post('/', (req, res) => {
  const { product } = req.body;

  if (!product || typeof product.price !== 'number' || !product.title) {
    return res.status(400).json({
      error: 'Campo "product" obbligatorio con almeno title (string) e price (number)',
    });
  }

  const order = buildOrder(product);
  pendingOrders.set(order.id, order);

  return res.status(201).json(order);
});

/* ──────────────────────────────────────────
   GET /api/pending-orders/:id
   Restituisce l'ordine; se scaduto lo marca EXPIRED
   ────────────────────────────────────────── */
router.get('/:id', (req, res) => {
  const order = pendingOrders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Ordine non trovato' });
  }

  return res.json(checkExpiry(order));
});

/* ──────────────────────────────────────────
   POST /api/pending-orders/:id/verify-price
   Simula verifica prezzo sul venditore e aggiorna stato
   ────────────────────────────────────────── */
router.post('/:id/verify-price', (req, res) => {
  const order = pendingOrders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Ordine non trovato' });
  }

  checkExpiry(order);

  if (order.stato === 'EXPIRED') {
    return res.status(410).json({ error: 'Ordine scaduto', stato: 'EXPIRED' });
  }

  if (!['PENDING_PAYMENT', 'PRICE_CHANGED'].includes(order.stato)) {
    return res.status(409).json({ error: 'Verifica prezzo non applicabile in questo stato', stato: order.stato });
  }

  // Se il chiamante passa prezzo_attuale nel body lo usa, altrimenti simula stesso prezzo
  const prezzoAttuale = typeof req.body.prezzo_attuale === 'number'
    ? req.body.prezzo_attuale
    : order.prezzo_originale;

  if (prezzoAttuale <= order.prezzo_originale) {
    order.stato = 'PRICE_CONFIRMED';
    return res.json({
      stato:            order.stato,
      prezzo_bloccato:  order.prezzo_bloccato,
      prezzo_originale: order.prezzo_originale,
      prezzo_attuale:   prezzoAttuale,
    });
  }

  // Prezzo aumentato: aggiorna stato e restituisce entrambi i prezzi
  const vecchioPrezzo = order.prezzo_originale;
  order.stato         = 'PRICE_CHANGED';
  return res.json({
    stato:           order.stato,
    prezzo_vecchio:  vecchioPrezzo,
    prezzo_attuale:  prezzoAttuale,
  });
});

module.exports = router;
