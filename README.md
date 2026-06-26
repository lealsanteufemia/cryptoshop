# 🛍️ CryptoShop

Marketplace universale dove i clienti pagano in crypto (USDC, ETH, BTC) e i fornitori ricevono in EUR.

## Come funziona

- Il cliente cerca qualsiasi prodotto o incolla il link da qualsiasi sito
- Paga in crypto con prezzo trasparente (commissioni dettagliate)
- Il fornitore spedisce direttamente al cliente
- Opzione spedizione regalo, consolidamento ordini, pagamento in negozi fisici

## Funzionalità

- 🔍 Ricerca live prodotti (Google Shopping via SerpAPI)
- 🪙 Pagamenti crypto: USDC, ETH, BTC (via CoinGate)
- 💳 Wallet interno con credito prepagato
- 🏪 Directory negozi convenzionati con moderazione admin
- 📲 Paga in negozio fisico con credito
- 🎁 Spedizione regalo
- 📦 3 opzioni spedizione: diretta, tramite CryptoShop, consolidamento
- ⭐ Piani abbonamento (Base / Plus / Pro)
- 📊 Dashboard admin completa

## Setup rapido

```bash
# 1. Installa dipendenze
npm install

# 2. Configura variabili ambiente
cp .env.example .env
# Modifica .env con le tue API keys

# 3. Avvia
npm start
```

Il server parte su http://localhost:3001

## Deploy

- **Backend**: Railway.app (trascina questa cartella)
- **Frontend**: Netlify.com (trascina la cartella /public)

## API Keys necessarie

| Servizio | Uso | Link |
|---|---|---|
| CoinGate | Pagamenti crypto | coingate.com |
| SerpAPI | Ricerca prodotti | serpapi.com |
| Resend | Email automatiche | resend.com |

Vedi `.env.example` per tutti i dettagli.

## Struttura progetto

```
cryptoshop/
├── index.js              ← Server principale
├── public/
│   └── index.html        ← Frontend (sito)
├── routes/
│   ├── orders.js         ← API ordini + webhook CoinGate
│   ├── products.js       ← Catalogo prodotti
│   ├── stores.js         ← Negozi convenzionati
│   └── search.js         ← Ricerca live
├── services/
│   ├── coingate.js       ← Pagamenti crypto
│   ├── search.js         ← Google Shopping
│   ├── scraper.js        ← Analisi URL esterni
│   ├── email.js          ← Notifiche email
│   └── pricing.js        ← Calcolo prezzi/commissioni
└── db/
    └── database.js       ← Database JSON (lowdb)
```
