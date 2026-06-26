'use strict';
const low  = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);

// Struttura iniziale del database
db.defaults({
  orders:   [],
  products: [],
  users:    [],
  stores:   [],
  payments: [],
}).write();

/* ─── ORDINI ─── */
const Orders = {
  // Crea nuovo ordine
  create(data) {
    const order = {
      id:            'CS-' + uuidv4().slice(0,8).toUpperCase(),
      ...data,
      status:        'pending_payment',   // pending_payment → paid → purchasing → shipped → delivered
      cryptoStatus:  'waiting',           // waiting → confirmed → expired
      createdAt:     new Date().toISOString(),
      updatedAt:     new Date().toISOString(),
      timeline: [
        { status: 'pending_payment', label: 'Ordine creato', at: new Date().toISOString() }
      ]
    };
    db.get('orders').push(order).write();
    return order;
  },

  // Trova ordine per ID
  findById(id) {
    return db.get('orders').find({ id }).value();
  },

  // Trova ordine per CoinGate payment ID
  findByCoinGateId(cgId) {
    return db.get('orders').find({ coinGateOrderId: String(cgId) }).value();
  },

  // Aggiorna ordine
  update(id, data) {
    const now = new Date().toISOString();
    db.get('orders')
      .find({ id })
      .assign({ ...data, updatedAt: now })
      .write();
    return this.findById(id);
  },

  // Aggiungi evento alla timeline
  addTimeline(id, status, label) {
    const order = this.findById(id);
    if (!order) return;
    const timeline = [...(order.timeline || []), {
      status, label, at: new Date().toISOString()
    }];
    return this.update(id, { status, timeline });
  },

  // Lista tutti gli ordini (più recenti prima)
  all() {
    return db.get('orders')
      .orderBy(['createdAt'], ['desc'])
      .value();
  },

  // Lista ordini di un utente
  byEmail(email) {
    return db.get('orders')
      .filter({ customerEmail: email })
      .orderBy(['createdAt'], ['desc'])
      .value();
  }
};

/* ─── PRODOTTI CATALOGO ─── */
const Products = {
  seed(list) {
    const existing = db.get('products').value();
    if (existing.length === 0) {
      db.get('products').assign(list).write();
    }
  },
  all() {
    return db.get('products').value();
  },
  search(q) {
    const lower = q.toLowerCase();
    return db.get('products')
      .filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.category.toLowerCase().includes(lower) ||
        (p.tags||[]).some(t => t.toLowerCase().includes(lower))
      )
      .value();
  }
};


/* ─── NEGOZI ─── */
const Stores = {

  // Crea richiesta negozio (stato: pending → approved / rejected)
  create(data) {
    const store = {
      id:          'ST-' + uuidv4().slice(0,8).toUpperCase(),
      ...data,
      status:      'pending',   // pending → approved → rejected
      sponsor:     false,
      featured:    false,
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      approvedAt:  null,
      approvedBy:  null,
      notes:       '',          // note interne admin
    };
    db.get('stores').push(store).write();
    return store;
  },

  findById(id) {
    return db.get('stores').find({ id }).value();
  },

  // Solo negozi approvati (visibili al pubblico)
  approved() {
    return db.get('stores')
      .filter({ status: 'approved' })
      .orderBy(['sponsor', 'createdAt'], ['desc', 'desc'])
      .value();
  },

  // Per categoria
  byCategory(cat) {
    return db.get('stores')
      .filter(s => s.status === 'approved' && s.category === cat)
      .value();
  },

  // Tutti (per admin)
  all() {
    return db.get('stores')
      .orderBy(['createdAt'], ['desc'])
      .value();
  },

  // In attesa di approvazione
  pending() {
    return db.get('stores')
      .filter({ status: 'pending' })
      .orderBy(['createdAt'], ['desc'])
      .value();
  },

  update(id, data) {
    db.get('stores')
      .find({ id })
      .assign({ ...data, updatedAt: new Date().toISOString() })
      .write();
    return this.findById(id);
  },

  // Approva negozio
  approve(id, adminNote = '') {
    return this.update(id, {
      status:     'approved',
      approvedAt: new Date().toISOString(),
      notes:      adminNote,
    });
  },

  // Rifiuta negozio
  reject(id, reason = '') {
    return this.update(id, {
      status: 'rejected',
      notes:  reason,
    });
  },

  // Imposta/rimuovi sponsor
  setSponsor(id, active) {
    return this.update(id, { sponsor: active });
  },

  delete(id) {
    db.get('stores').remove({ id }).write();
  },
};

/* ─── PAGAMENTI IN-STORE ─── */
const StorePayments = {

  create(data) {
    const payment = {
      id:          'TX-' + uuidv4().slice(0,8).toUpperCase(),
      ...data,
      status:      'completed',
      createdAt:   new Date().toISOString(),
    };
    db.get('payments').push(payment).write();
    return payment;
  },

  all() {
    return db.get('payments')
      .orderBy(['createdAt'], ['desc'])
      .value();
  },

  byEmail(email) {
    return db.get('payments')
      .filter({ customerEmail: email })
      .orderBy(['createdAt'], ['desc'])
      .value();
  },

  // Volume totale per negozio
  volumeByStore(storeId) {
    return db.get('payments')
      .filter({ storeId })
      .sumBy('amountEur')
      .value() || 0;
  },
};

module.exports = { db, Orders, Products, Stores, StorePayments };
