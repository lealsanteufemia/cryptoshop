'use strict';
/**
 * Pricing Service — CryptoShop
 *
 * STRUTTURA DEL PREZZO (trasparente al cliente):
 *
 *   Prezzo prodotto           €100.00   (quello del fornitore)
 *   ─────────────────────────────────
 *   Commissione CryptoShop    €10.00    (10%, min €5) → TUO GUADAGNO NETTO
 *   Gateway CoinGate          €1.10     (1% sul totale)
 *   Conversione USD→EUR       €0.96     (0.87% spread cambio)
 *   Fee rete blockchain       €0.30     (gas fisso)
 *   Bonifico SEPA             €0.33     (0.3% liquidazione)
 *   ─────────────────────────────────
 *   Totale costi provider     €2.69
 *   ─────────────────────────────────
 *   TOTALE DA PAGARE          €112.69 → convertito in USDC/ETH/BTC
 */

// Tassi cambio (in produzione: chiama CoinGate /rates ogni minuto)
const RATES = {
  EUR_TO_USDC: 1 / 0.87,   // 1 EUR = 1.149 USDC
  EUR_TO_ETH:  1 / 2341,
  EUR_TO_BTC:  1 / 89200,
};

// Commissioni provider
const PROVIDER_FEES = {
  coingate_pct:   0.010,   // 1%   sul totale pagato dal cliente
  forex_pct:      0.0087,  // 0.87% spread USD/EUR
  blockchain_fix: 0.30,    // €0.30 fisso (gas)
  sepa_pct:       0.003,   // 0.3% liquidazione bancaria
};

// Commissione CryptoShop
const CRYPTOSHOP_PCT = 0.10;   // 10% netto
const CRYPTOSHOP_MIN = 5.00;   // minimo €5

/**
 * Calcola il breakdown completo del prezzo
 * @param {number} productPriceEur  prezzo del prodotto in EUR
 * @returns {object} breakdown dettagliato
 */
function calculatePrice(productPriceEur) {
  const price = parseFloat(productPriceEur);

  // 1. Commissione CryptoShop (tua, netta)
  const cryptoshopRaw = price * CRYPTOSHOP_PCT;
  const cryptoshopFee = Math.max(cryptoshopRaw, CRYPTOSHOP_MIN);

  // 2. Subtotale prima delle fee provider
  const subtotal = price + cryptoshopFee;

  // 3. Fee provider (applicate sul subtotale)
  const coingatefee  = parseFloat((subtotal * PROVIDER_FEES.coingate_pct).toFixed(2));
  const forexFee     = parseFloat((subtotal * PROVIDER_FEES.forex_pct).toFixed(2));
  const blockchainFee = PROVIDER_FEES.blockchain_fix;
  const sepaFee      = parseFloat((subtotal * PROVIDER_FEES.sepa_pct).toFixed(2));
  const totalProviderFees = parseFloat((coingatefee + forexFee + blockchainFee + sepaFee).toFixed(2));

  // 4. Totale finale che paga il cliente
  const totalEur = parseFloat((subtotal + totalProviderFees).toFixed(2));

  // 5. Conversioni crypto
  const totalUsdc = parseFloat((totalEur * RATES.EUR_TO_USDC).toFixed(2));
  const totalEth  = parseFloat((totalEur * RATES.EUR_TO_ETH).toFixed(6));
  const totalBtc  = parseFloat((totalEur * RATES.EUR_TO_BTC).toFixed(8));

  return {
    // Prezzo base
    productPriceEur: parseFloat(price.toFixed(2)),

    // Commissione CryptoShop (profitto netto del sito)
    cryptoshopFee:   parseFloat(cryptoshopFee.toFixed(2)),
    cryptoshopPct:   CRYPTOSHOP_PCT * 100,
    isMinimumApplied: cryptoshopRaw < CRYPTOSHOP_MIN,

    // Fee provider (trasparenti al cliente)
    providerFees: {
      coingate:   coingatefee,
      forex:      forexFee,
      blockchain: blockchainFee,
      sepa:       sepaFee,
      total:      totalProviderFees,
    },

    // Totali
    subtotalEur:     parseFloat(subtotal.toFixed(2)),
    totalEur,
    totalUsdc,
    totalEth,
    totalBtc,

    // Riepilogo leggibile per il frontend
    breakdown: [
      {
        label:   'Prezzo prodotto',
        amount:  parseFloat(price.toFixed(2)),
        type:    'product',
        note:    'Prezzo del fornitore originale',
      },
      {
        label:   `Commissione CryptoShop (${CRYPTOSHOP_PCT*100}%${cryptoshopRaw < CRYPTOSHOP_MIN ? ', minimo €'+CRYPTOSHOP_MIN : ''})`,
        amount:  parseFloat(cryptoshopFee.toFixed(2)),
        type:    'cryptoshop',
        note:    'Il nostro compenso per il servizio di acquisto',
      },
      {
        label:   'Gateway crypto (CoinGate 1%)',
        amount:  coingatefee,
        type:    'provider',
        note:    'Fee del processore di pagamento crypto',
      },
      {
        label:   'Conversione valuta (spread USD/EUR)',
        amount:  forexFee,
        type:    'provider',
        note:    'Costo cambio valuta tra crypto e euro',
      },
      {
        label:   'Fee rete blockchain',
        amount:  blockchainFee,
        type:    'provider',
        note:    'Costo transazione sulla blockchain (gas)',
      },
      {
        label:   'Liquidazione bancaria (SEPA)',
        amount:  sepaFee,
        type:    'provider',
        note:    'Costo trasferimento verso conto bancario',
      },
    ],
  };
}

module.exports = { calculatePrice, RATES, CRYPTOSHOP_PCT, CRYPTOSHOP_MIN };
