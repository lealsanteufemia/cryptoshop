'use strict';
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const cron       = require('node-cron');

const ordersRouter        = require('./routes/orders');
const pendingOrdersRouter = require('./routes/pending-orders');
const storesRouter        = require('./routes/stores');
const searchRouter        = require('./routes/search');
const productsRouter      = require('./routes/products');
const { Orders }     = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ──────────────────────────────────────────
   MIDDLEWARE
   ────────────────────────────────────────── */
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
};

// CORS prima di tutto il resto — incluso helmet
app.use(cors(corsOptions));
// Risponde 200 a TUTTE le richieste OPTIONS preflight su qualsiasi percorso
app.options('*', cors(corsOptions));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,   // default "same-origin" blocca richieste cross-origin
  crossOriginEmbedderPolicy: false,   // idem
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

/* ──────────────────────────────────────────
   REQUEST LOGGER (solo in dev)
   ────────────────────────────────────────── */
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString().slice(11,19)} ${req.method} ${req.path}`);
    next();
  });
}

/* ──────────────────────────────────────────
   ROUTES
   ────────────────────────────────────────── */
app.use('/api/orders',         ordersRouter);
app.use('/api/pending-orders', pendingOrdersRouter);
app.use('/api/products',       productsRouter);
app.use('/api/stores',   storesRouter);
app.use('/api/search',   searchRouter);

/* ──────────────────────────────────────────
   HEALTH CHECK
   ────────────────────────────────────────── */
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || 'development',
    coingate:  process.env.COINGATE_SANDBOX === 'false' ? 'production' : 'sandbox',
  });
});

/* ──────────────────────────────────────────
   404 / ERROR HANDLER
   ────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato' });
});

app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Errore interno del server', detail: err.message });
});

/* ──────────────────────────────────────────
   CRON: controlla ordini pending ogni 5 min
   In produzione: verifica stato pagamento su CoinGate
   ────────────────────────────────────────── */
cron.schedule('*/5 * * * *', () => {
  const allOrders = Orders.all();
  const pending   = allOrders.filter(o => o.status === 'pending_payment');
  if (pending.length > 0) {
    console.log(`[Cron] ${pending.length} ordini in attesa di pagamento`);
    // TODO: per ogni ordine, chiama CoinGate.getOrder() e aggiorna se cambiato
  }
});

/* ──────────────────────────────────────────
   START
   ────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║       CryptoShop Backend v1.0          ║
╠════════════════════════════════════════╣
║  Server:   http://localhost:${PORT}       ║
║  Env:      ${(process.env.NODE_ENV||'development').padEnd(12)} CoinGate: ${process.env.COINGATE_SANDBOX==='false'?'LIVE ':'SAND '}  ║
║  Health:   http://localhost:${PORT}/health  ║
║  Search:   ${process.env.SERPAPI_KEY?'SerpAPI':'DEMO mode    '}            ║
╚════════════════════════════════════════╝
  `);
});

module.exports = app;
