'use strict';
/**
 * Email Service via Resend.com
 * Piano gratuito: 3.000 email/mese
 * Setup: https://resend.com → API Keys → crea chiave → incolla in .env
 */

const axios = require('axios');

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const FROM       = process.env.EMAIL_FROM || 'ordini@cryptoshop.io';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_KEY) {
    console.log(`[Email] SKIP (no API key) → ${to}: ${subject}`);
    return { ok: true, skipped: true };
  }
  try {
    const { data } = await axios.post('https://api.resend.com/emails', {
      from: FROM, to, subject, html
    }, {
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' }
    });
    console.log(`[Email] Inviata → ${to}: ${subject}`);
    return { ok: true, id: data.id };
  } catch (err) {
    console.error('[Email] Errore:', err.response?.data || err.message);
    return { ok: false, error: err.message };
  }
}

/* ─── TEMPLATE: Ordine ricevuto ─── */
async function sendOrderConfirmation(order) {
  const html = `
  <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <div style="background:#5B3CF5;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px">cryptoshop</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">Ordine confermato!</p>
    </div>
    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none">
      <p style="font-size:16px">Ciao <strong>${order.customerName}</strong>,</p>
      <p>Abbiamo ricevuto il tuo pagamento e stiamo acquistando il prodotto per te. 🛍️</p>
      <div style="background:#f9fafb;border-radius:10px;padding:20px;margin:20px 0">
        <div style="font-size:13px;color:#6b7280;margin-bottom:4px">PRODOTTO</div>
        <div style="font-size:16px;font-weight:600">${order.productName}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px">da ${order.productSrc}</div>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0">
        <div style="display:flex;justify-content:space-between;font-size:14px">
          <span>ID Ordine</span><strong>${order.id}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:8px">
          <span>Pagato</span><strong style="color:#5B3CF5">${order.cryptoAmount} ${order.cryptoCurrency}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:8px">
          <span>Indirizzo spedizione</span><span>${order.shippingAddress}</span>
        </div>
      </div>
      <p style="font-size:14px;color:#6b7280">Ti invieremo un'altra email quando il prodotto viene spedito con il numero di tracking.</p>
      <div style="text-align:center;margin-top:24px">
        <a href="${process.env.FRONTEND_URL}/orders/${order.id}"
           style="background:#5B3CF5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
          Segui il tuo ordine →
        </a>
      </div>
    </div>
    <div style="text-align:center;padding:20px;font-size:12px;color:#9ca3af">
      cryptoshop · Pagamenti via CoinGate (CASP autorizzato MiCA UE)
    </div>
  </div>`;

  return sendEmail({ to: order.customerEmail, subject: `✅ Ordine confermato – ${order.id}`, html });
}

/* ─── TEMPLATE: Ordine spedito ─── */
async function sendShippingNotification(order) {
  const html = `
  <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <div style="background:#5B3CF5;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px">cryptoshop</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">Il tuo ordine è in viaggio! 📦</p>
    </div>
    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none">
      <p>Ciao <strong>${order.customerName}</strong>,</p>
      <p>Il tuo ordine <strong>${order.id}</strong> è stato spedito!</p>
      ${order.trackingCode ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:20px 0;text-align:center">
        <div style="font-size:13px;color:#15803d;margin-bottom:4px">CODICE TRACKING</div>
        <div style="font-size:24px;font-weight:700;font-family:monospace;color:#166534">${order.trackingCode}</div>
        ${order.carrier ? `<div style="font-size:13px;color:#15803d;margin-top:4px">via ${order.carrier}</div>` : ''}
      </div>` : ''}
      <p style="font-size:14px;color:#6b7280">Stima consegna: 2-5 giorni lavorativi.</p>
    </div>
  </div>`;

  return sendEmail({ to: order.customerEmail, subject: `📦 Spedito! Ordine ${order.id}`, html });
}

module.exports = { sendEmail, sendOrderConfirmation, sendShippingNotification };
