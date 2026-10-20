"use strict";

const CRYPTO_IDS = Object.freeze({
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  XRP: "ripple",
  SOL: "solana",
  DOGE: "dogecoin",
  ADA: "cardano",
  TRX: "tron",
  AVAX: "avalanche-2",
  LINK: "chainlink"
});

const STOCK_SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,16}$/;

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`O fornecedor respondeu com o estado ${response.status}.`);
  return response.json();
}

async function fetchMarketQuotes({ stocks = [], cryptos = [] }, fetchImpl = globalThis.fetch) {
  const exchangeRates = new Map();
  const getEuroRate = async currency => {
    if (currency === "EUR") return 1;
    if (!exchangeRates.has(currency)) {
      exchangeRates.set(currency, fetchJson(
        `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(currency)}&symbols=EUR`,
        fetchImpl
      ).then(data => {
        const rate = data.rates && data.rates.EUR;
        if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Não foi possível converter ${currency} para euros.`);
        return rate;
      }));
    }
    return exchangeRates.get(currency);
  };

  const stockQuotes = await Promise.all(stocks.map(async symbol => {
    try {
      const data = await fetchJson(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
        fetchImpl
      );
      const result = data.chart && data.chart.result && data.chart.result[0];
      if (!result || !result.meta) throw new Error("Não foi encontrada uma cotação para este símbolo.");

      const regularPrice = result.meta.regularMarketPrice;
      const closes = result.indicators && result.indicators.quote && result.indicators.quote[0]
        ? result.indicators.quote[0].close || []
        : [];
      const lastClose = closes.findLast(value => Number.isFinite(value) && value > 0);
      const price = Number.isFinite(regularPrice) && regularPrice > 0 ? regularPrice : lastClose;
      const timestamp = result.meta.regularMarketTime || (result.timestamp || []).findLast(Number.isFinite);
      let currency = result.meta.currency;
      if (!Number.isFinite(price) || !Number.isFinite(timestamp) || typeof currency !== "string") {
        throw new Error("O fornecedor não devolveu uma cotação completa.");
      }

      let normalizedPrice = price;
      if (currency === "GBp" || currency === "GBX") {
        normalizedPrice /= 100;
        currency = "GBP";
      }
      const priceEur = normalizedPrice * await getEuroRate(currency);
      if (!Number.isFinite(priceEur) || priceEur <= 0) throw new Error("A cotação convertida não é válida.");
      return {
        symbol,
        priceEur,
        updatedAt: new Date(timestamp * 1000).toISOString(),
        source: "Yahoo Finance"
      };
    } catch (error) {
      return { symbol, error: error.message || "Não foi possível obter a cotação." };
    }
  }));

  const mappedCryptos = cryptos.map(symbol => ({ symbol, id: CRYPTO_IDS[symbol] }));
  const supportedCryptos = mappedCryptos.filter(crypto => crypto.id);
  const cryptoQuotes = mappedCryptos.filter(crypto => !crypto.id)
    .map(({ symbol }) => ({ symbol, error: "Símbolo de criptomoeda não suportado." }));

  if (supportedCryptos.length > 0) {
    try {
      const ids = supportedCryptos.map(crypto => crypto.id).join(",");
      const data = await fetchJson(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=eur&include_last_updated_at=true`,
        fetchImpl
      );
      for (const { symbol, id } of supportedCryptos) {
        const quote = data[id];
        if (!quote || !Number.isFinite(quote.eur) || quote.eur <= 0 || !Number.isFinite(quote.last_updated_at)) {
          cryptoQuotes.push({ symbol, error: "O fornecedor não devolveu uma cotação válida para esta moeda." });
          continue;
        }
        cryptoQuotes.push({
          symbol,
          priceEur: quote.eur,
          updatedAt: new Date(quote.last_updated_at * 1000).toISOString(),
          source: "CoinGecko"
        });
      }
    } catch (error) {
      for (const { symbol } of supportedCryptos) {
        cryptoQuotes.push({ symbol, error: error.message || "Não foi possível obter a cotação." });
      }
    }
  }

  return { stocks: stockQuotes, cryptos: cryptoQuotes };
}

module.exports = { CRYPTO_IDS, STOCK_SYMBOL_PATTERN, fetchMarketQuotes };
