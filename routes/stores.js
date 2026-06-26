'use strict';
/**
 * Stores API — Negozi convenzionati CryptoShop
 *
 * FLUSSO:
 * 1. Negoziante compila form sul sito  → POST /api/stores          (crea con status: pending)
 * 2. Admin vede richiesta in dashboard → GET  /api/stores/admin/pending
 * 3. Admin approva o rifiuta          → PATCH /api/stores/:id/approve | /reject
 * 4. Negozio approvato appare sul sito → GET  /api/stores            (solo approved)
 */

const express = require('express');
const router  = express.Router();
const { Stores, StorePayments } = require('../db/database');
const { sendEmail } = require('../services/email');

/* ──────────────────────────────────────────
   GET /api/stores
   Lista negozi approvati (pubblica)
   Query: ?cat=moda  ?online=true  ?q=pizza
   ────────────────────────────────────────── */
router.get('/', (req, res) => {
  const { cat, online, q } = req.query;
  let list = Stores.approved();

  if (cat)    list = list.filter(s => s.category === cat);
  if (online) list = list.filter(s => s.onlineStore === true);
  if (q) {
    const lower = q.toLowerCase();
    list = list.filter(s =>
      s.name.toLowerCase().includes(lower) ||
      s.category.toLowerCase().includes(lower) ||
      (s.address||'').toLowerCase().includes(lower) ||
      (s.offer||'').toLowerCase().includes(lower)
    );
  }

  return res.json(list);
});

/* ──────────────────────────────────────────
   GET /api/stores/categories
   Lista categorie con conteggio
   ────────────────────────────────────────── */
router.get('/categories', (_req, res) => {
  const all = Stores.approved();
  const counts = {};
  all.forEach(s => { counts[s.category] = (counts[s.category]||0) + 1; });
  return res.json(counts);
});

/* ──────────────────────────────────────────
   GET /api/stores/:id
   Dettaglio singolo negozio
   ────────────────────────────────────────── */
router.get('/:id', (req, res) => {
  const store = Stores.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Negozio non trovato' });
  if (store.status !== 'approved') return res.status(404).json({ error: 'Negozio non disponibile' });
  return res.json(store);
});

/* ──────────────────────────────────────────
   POST /api/stores
   Registrazione nuovo negozio (da negoziante)
   Body: { name, category, email, phone, address, onlineStore,
           website, offer, receiveMethod, receiveCoord, plan }
   ────────────────────────────────────────── */
router.post('/', async (req, res) => {
  const {
    name, category, email, phone,
    address, onlineStore, website,
    offer, receiveMethod, receiveCoord, plan
  } = req.body;

  // Validazione base
  if (!name || !email || !category) {
    return res.status(400).json({ error: 'name, email e category sono obbligatori' });
  }
  if (!receiveMethod || !receiveCoord) {
    return res.status(400).json({ error: 'Specifica come vuoi ricevere i pagamenti' });
  }

  const store = Stores.create({
    name:          name.trim(),
    category:      category.trim(),
    email:         email.trim().toLowerCase(),
    phone:         phone || '',
    address:       address || '',
    onlineStore:   !!onlineStore,
    website:       website || '',
    offer:         offer || '',
    receiveMethod, // paypal | iban | satispay
    receiveCoord:  receiveCoord.trim(),
    plan:          plan || 'base',     // base | sponsor | enterprise
    icon:          iconForCategory(category),
  });

  console.log(`[Stores] Nuova richiesta: ${store.id} — "${name}" (${category}) — Piano: ${plan||'base'}`);

  // Email di conferma al negoziante
  await sendEmail({
    to:      email,
    subject: `✅ Richiesta ricevuta — CryptoShop Partner`,
    html:    confirmEmailHtml(store),
  });

  // Email di notifica all'admin
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM;
  if (adminEmail) {
    await sendEmail({
      to:      adminEmail,
      subject: `🏪 Nuova richiesta negozio: ${name}`,
      html:    adminNotifyHtml(store),
    });
  }

  return res.status(201).json({
    ok:      true,
    storeId: store.id,
    message: 'Richiesta ricevuta! La esamineremo entro 24-48 ore e ti contatteremo via email.',
  });
});

/* ──────────────────────────────────────────
   ── AREA ADMIN ──
   (in produzione: proteggi con middleware auth)
   ────────────────────────────────────────── */

// GET /api/stores/admin/all — tutti i negozi per admin
router.get('/admin/all', (_req, res) => {
  return res.json(Stores.all());
});

// GET /api/stores/admin/pending — solo in attesa di approvazione
router.get('/admin/pending', (_req, res) => {
  return res.json(Stores.pending());
});

// GET /api/stores/admin/stats — statistiche per dashboard
router.get('/admin/stats', (_req, res) => {
  const all      = Stores.all();
  const payments = StorePayments.all();
  return res.json({
    total:    all.length,
    pending:  all.filter(s => s.status === 'pending').length,
    approved: all.filter(s => s.status === 'approved').length,
    rejected: all.filter(s => s.status === 'rejected').length,
    sponsors: all.filter(s => s.sponsor).length,
    totalPaymentsVolume: payments.reduce((s, p) => s + (p.amountEur||0), 0),
    totalPaymentsCount:  payments.length,
    totalCommissions:    payments.reduce((s, p) => s + (p.feeEur||0), 0),
  });
});

// PATCH /api/stores/:id/approve — approva negozio
router.patch('/:id/approve', async (req, res) => {
  const { note } = req.body;
  const store = Stores.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Negozio non trovato' });

  const updated = Stores.approve(req.params.id, note || '');
  console.log(`[Stores] ✅ Approvato: ${store.id} — ${store.name}`);

  // Email al negoziante
  await sendEmail({
    to:      store.email,
    subject: `🎉 Il tuo negozio è live su CryptoShop!`,
    html:    approvalEmailHtml(updated),
  });

  return res.json({ ok: true, store: updated });
});

// PATCH /api/stores/:id/reject — rifiuta negozio
router.patch('/:id/reject', async (req, res) => {
  const { reason } = req.body;
  const store = Stores.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Negozio non trovato' });

  const updated = Stores.reject(req.params.id, reason || '');
  console.log(`[Stores] ❌ Rifiutato: ${store.id} — ${store.name}`);

  await sendEmail({
    to:      store.email,
    subject: `CryptoShop — Aggiornamento sulla tua richiesta`,
    html:    rejectionEmailHtml(updated, reason),
  });

  return res.json({ ok: true, store: updated });
});

// PATCH /api/stores/:id/sponsor — imposta/rimuovi sponsor
router.patch('/:id/sponsor', (req, res) => {
  const { active } = req.body;
  const store = Stores.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Negozio non trovato' });
  return res.json(Stores.setSponsor(req.params.id, !!active));
});

// PATCH /api/stores/:id — aggiorna dati negozio
router.patch('/:id', (req, res) => {
  const store = Stores.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Negozio non trovato' });
  // Non permettiamo di cambiare status via questo endpoint
  const { status, ...safeData } = req.body;
  return res.json(Stores.update(req.params.id, safeData));
});

// DELETE /api/stores/:id
router.delete('/:id', (req, res) => {
  const store = Stores.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Negozio non trovato' });
  Stores.delete(req.params.id);
  return res.json({ ok: true });
});

/* ──────────────────────────────────────────
   POST /api/stores/payments
   Registra un pagamento in-store (Paga ora)
   Body: { customerEmail, storeId, storeName,
           amountEur, feeEur, method, dest }
   ────────────────────────────────────────── */
router.post('/payments', (req, res) => {
  const { customerEmail, storeId, storeName, amountEur, feeEur, method, dest } = req.body;
  if (!amountEur || amountEur <= 0) return res.status(400).json({ error: 'Importo non valido' });

  const payment = StorePayments.create({
    customerEmail: customerEmail || 'anonymous',
    storeId:       storeId || null,
    storeName:     storeName || 'Negozio generico',
    amountEur:     parseFloat(amountEur),
    feeEur:        parseFloat(feeEur || 0),
    method,        // paypal | iban | satispay | qr
    dest,          // email, IBAN, username
  });

  console.log(`[StorePayments] Pagamento ${payment.id}: €${amountEur} → ${storeName} via ${method}`);
  return res.status(201).json({ ok: true, payment });
});

// GET /api/stores/payments/all — tutti i pagamenti (admin)
router.get('/payments/all', (_req, res) => {
  return res.json(StorePayments.all());
});

/* ── HELPERS ── */
function iconForCategory(cat) {
  const map = { moda:'👗', beauty:'🧴', tech:'💻', food:'🍕',
                casa:'🏠', sport:'🚲', libri:'📚', altro:'🛍️' };
  return map[cat] || '🏪';
}

function confirmEmailHtml(store) {
  return `<div style="font-family:Inter,sans-serif;max-width:540px;margin:0 auto">
    <div style="background:#5B3CF5;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">cryptoshop</h1>
    </div>
    <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none">
      <h2 style="font-size:20px;margin-bottom:12px">Richiesta ricevuta! 🎉</h2>
      <p>Ciao <strong>${store.name}</strong>,</p>
      <p>Abbiamo ricevuto la tua richiesta di diventare negozio partner CryptoShop.<br>
      La esamineremo entro <strong>24-48 ore lavorative</strong> e ti risponderemo a questo indirizzo email.</p>
      <div style="background:#f9fafb;border-radius:10px;padding:16px;margin:20px 0">
        <div style="font-size:13px;margin-bottom:8px;color:#6b7280">Riepilogo richiesta:</div>
        <div style="font-size:14px"><strong>ID:</strong> ${store.id}</div>
        <div style="font-size:14px"><strong>Negozio:</strong> ${store.name}</div>
        <div style="font-size:14px"><strong>Categoria:</strong> ${store.category}</div>
        <div style="font-size:14px"><strong>Piano:</strong> ${store.plan}</div>
      </div>
      <p style="font-size:13px;color:#6b7280">Hai domande? Scrivici a <a href="mailto:partner@cryptoshop.io">partner@cryptoshop.io</a></p>
    </div>
  </div>`;
}

function adminNotifyHtml(store) {
  return `<div style="font-family:monospace;max-width:540px">
    <h2>🏪 Nuova richiesta negozio</h2>
    <table style="width:100%;border-collapse:collapse">
      ${Object.entries(store).map(([k,v])=>`<tr><td style="padding:4px 8px;color:#666;width:140px">${k}</td><td style="padding:4px 8px"><strong>${JSON.stringify(v)}</strong></td></tr>`).join('')}
    </table>
    <p>Approva o rifiuta dalla <a href="${process.env.FRONTEND_URL||'http://localhost:3000'}/admin">dashboard admin</a>.</p>
  </div>`;
}

function approvalEmailHtml(store) {
  return `<div style="font-family:Inter,sans-serif;max-width:540px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#5B3CF5,#00C896);padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">cryptoshop</h1>
      <p style="color:rgba(255,255,255,.85);margin:6px 0 0">Il tuo negozio è live! 🎉</p>
    </div>
    <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none">
      <h2 style="font-size:20px;margin-bottom:12px">Benvenuto tra i partner!</h2>
      <p>Il tuo negozio <strong>${store.name}</strong> è stato approvato ed è ora visibile nella directory CryptoShop.</p>
      <p>I clienti con crypto possono ora trovarti e pagarti direttamente tramite il nostro sistema.</p>
      ${store.offer?`<div style="background:#D9F7EF;border-radius:10px;padding:14px;margin:16px 0;font-size:13px"><strong>🎁 Offerta attiva:</strong> ${store.offer}</div>`:''}
      <div style="margin-top:20px">
        <a href="${process.env.FRONTEND_URL||'http://localhost:3000'}/stores"
           style="background:#5B3CF5;color:#fff;padding:12px 22px;border-radius:9px;text-decoration:none;font-weight:700;font-size:14px">
          Vedi il tuo negozio →
        </a>
      </div>
    </div>
  </div>`;
}

function rejectionEmailHtml(store, reason) {
  return `<div style="font-family:Inter,sans-serif;max-width:540px;margin:0 auto">
    <div style="background:#5B3CF5;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">cryptoshop</h1>
    </div>
    <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none">
      <p>Ciao <strong>${store.name}</strong>,</p>
      <p>Abbiamo esaminato la tua richiesta e purtroppo non possiamo approvarla al momento.</p>
      ${reason?`<div style="background:#FEF3C7;border-radius:9px;padding:12px 16px;margin:16px 0;font-size:13px"><strong>Motivo:</strong> ${reason}</div>`:''}
      <p>Se pensi ci sia un errore o vuoi ripresentare la richiesta con informazioni diverse, scrivici a <a href="mailto:partner@cryptoshop.io">partner@cryptoshop.io</a></p>
    </div>
  </div>`;
}

module.exports = router;
