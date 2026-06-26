'use strict';
const express = require('express');
const router  = express.Router();

/* Catalogo prodotti statico — in produzione puoi
   caricare da un DB o da un feed di affiliazione */
const CATALOG = [
  { id:1,  name:'Sony WH-1000XM5',         full:'Sony WH-1000XM5 Cuffie Noise Cancelling', icon:'🎧', src:'amazon.it',      price:279,  cat:'tech',    badge:'Top venduto', tags:['cuffie','audio','sony'] },
  { id:2,  name:'iPhone 16 Pro 256GB',      full:'iPhone 16 Pro 256GB Titanio Naturale',    icon:'📱', src:'apple.com',      price:1299, cat:'tech',    badge:'Novità',      tags:['apple','smartphone','ios'] },
  { id:3,  name:'Nike Air Max 270',         full:'Nike Air Max 270 React Uomo EU 42',       icon:'👟', src:'zalando.it',     price:129,  cat:'moda',                         tags:['nike','scarpe','sneakers'] },
  { id:4,  name:'Apple Watch Series 10',    full:'Apple Watch Series 10 GPS 46mm',          icon:'⌚', src:'apple.com',      price:449,  cat:'tech',                         tags:['apple','smartwatch','gps'] },
  { id:5,  name:'PlayStation 5 Slim',       full:'PlayStation 5 Slim + Controller DualSense',icon:'🎮',src:'gamestop.it',   price:449,  cat:'gaming',  badge:'Bundle',      tags:['sony','ps5','console'] },
  { id:6,  name:'LG UltraWide 34"',         full:'LG UltraWide 34" QHD IPS 160Hz',         icon:'🖥️', src:'unieuro.it',     price:699,  cat:'tech',                         tags:['monitor','lg','gaming'] },
  { id:7,  name:'Dyson V15 Detect',         full:'Dyson V15 Detect Aspirapolvere Senza Fili',icon:'🌀',src:'dyson.it',      price:649,  cat:'casa',    badge:'Esclusivo',   tags:['dyson','aspirapolvere','pulizia'] },
  { id:8,  name:'Nespresso Vertuo Next',    full:'Nespresso Vertuo Next Macchina Caffè',    icon:'☕', src:'nespresso.com',  price:129,  cat:'casa',                         tags:['caffè','nespresso','capsule'] },
  { id:9,  name:'The North Face Puffer',    full:'The North Face Nuptse 700 Piumino Uomo',  icon:'🧥', src:'thenorthface.com',price:319, cat:'moda',                         tags:['piumino','northface','inverno'] },
  { id:10, name:'Nintendo Switch 2',        full:'Nintendo Switch 2 Console + Mario Kart World',icon:'🕹️',src:'nintendo.it',price:399, cat:'gaming',  badge:'Nuovo',       tags:['nintendo','switch','console'] },
  { id:11, name:'Kindle Paperwhite',        full:'Kindle Paperwhite 2024 16GB Illuminazione',icon:'📚',src:'amazon.it',    price:149,  cat:'libri',                         tags:['kindle','ebook','amazon'] },
  { id:12, name:'Fitbit Charge 6',          full:'Fitbit Charge 6 Fitness Tracker GPS',     icon:'⌚', src:'fitbit.com',     price:159,  cat:'sport',                         tags:['fitness','tracker','salute'] },
  { id:13, name:'Lego Technic Bugatti',     full:'LEGO Technic Bugatti Chiron 3599 pz',     icon:'🧱', src:'lego.com',       price:369,  cat:'bambini',                       tags:['lego','technic','costruzioni'] },
  { id:14, name:'Adidas Stan Smith',        full:'Adidas Stan Smith Sneakers Bianco EU41',  icon:'👟', src:'adidas.com',     price:95,   cat:'moda',                         tags:['adidas','scarpe','classiche'] },
  { id:15, name:'Garmin Fenix 8',           full:'Garmin Fenix 8 Solar GPS Multisport',     icon:'⌚', src:'garmin.com',     price:899,  cat:'sport',   badge:'Premium',     tags:['garmin','gps','sport','outdoor'] },
];

const EUR_TO_USDC = 1 / 0.87; // In produzione: chiama CoinGate rates API
const COMMISSION  = 0.10;

function enrichProduct(p) {
  const total = p.price * (1 + COMMISSION);
  return {
    ...p,
    totalEur:  parseFloat(total.toFixed(2)),
    totalUsdc: parseFloat((total * EUR_TO_USDC).toFixed(2)),
    commission: parseFloat((p.price * COMMISSION).toFixed(2)),
  };
}

/* GET /api/products — tutti o filtrati */
router.get('/', (req, res) => {
  const { q, cat, limit = 50 } = req.query;
  let list = [...CATALOG];

  if (cat)  list = list.filter(p => p.cat === cat);
  if (q) {
    const lower = q.toLowerCase();
    list = list.filter(p =>
      p.full.toLowerCase().includes(lower) ||
      p.name.toLowerCase().includes(lower) ||
      (p.tags||[]).some(t => t.toLowerCase().includes(lower)) ||
      p.src.toLowerCase().includes(lower)
    );
  }

  return res.json(list.slice(0, Number(limit)).map(enrichProduct));
});

/* GET /api/products/categories — lista categorie */
router.get('/categories', (req, res) => {
  const cats = [...new Set(CATALOG.map(p => p.cat))];
  return res.json(cats);
});

/* GET /api/products/:id — singolo prodotto */
router.get('/:id', (req, res) => {
  const p = CATALOG.find(x => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Prodotto non trovato' });
  return res.json(enrichProduct(p));
});

module.exports = router;
