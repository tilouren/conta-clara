"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchMarketQuotes } = require("../market-quotes.js");

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

test("converts a supported S&P 500 stock quote into euros and returns major crypto quotes", async () => {
  const requestedUrls = [];
  const fetchMock = async url => {
    requestedUrls.push(String(url));
    if (String(url).includes("query1.finance.yahoo.com")) {
      return jsonResponse({ chart: { result: [{
        meta: { currency: "USD", regularMarketPrice: 100, regularMarketTime: 1792530000 },
        indicators: { quote: [{ close: [99, 100] }] }
      }] } });
    }
    if (String(url).includes("frankfurter.dev")) {
      return jsonResponse({ rates: { EUR: 0.9 } });
    }
    if (String(url).includes("coingecko.com")) {
      return jsonResponse({
        bitcoin: { eur: 60000, last_updated_at: 1792530000 },
        ethereum: { eur: 3000, last_updated_at: 1792530000 }
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await fetchMarketQuotes({ stocks: ["AAPL"], cryptos: ["BTC", "ETH"] }, fetchMock);

  assert.deepEqual(result.stocks[0], {
    symbol: "AAPL",
    priceEur: 90,
    updatedAt: new Date(1792530000 * 1000).toISOString(),
    source: "Yahoo Finance"
  });
  assert.deepEqual(result.cryptos.map(({ symbol, priceEur }) => [symbol, priceEur]), [
    ["BTC", 60000],
    ["ETH", 3000]
  ]);
  assert.equal(requestedUrls.filter(url => url.includes("frankfurter.dev")).length, 1);
});

test("reports unsupported coins and unavailable stock quotes without hiding the rest", async () => {
  const fetchMock = async url => {
    if (String(url).includes("query1.finance.yahoo.com")) return jsonResponse(null, 404);
    if (String(url).includes("coingecko.com")) {
      return jsonResponse({ bitcoin: { eur: 60000, last_updated_at: 1792530000 } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await fetchMarketQuotes({ stocks: ["NOTREAL"], cryptos: ["BTC", "UNKNOWN"] }, fetchMock);

  assert.match(result.stocks[0].error, /estado 404/);
  assert.equal(result.cryptos.find(quote => quote.symbol === "BTC").priceEur, 60000);
  assert.match(result.cryptos.find(quote => quote.symbol === "UNKNOWN").error, /não suportado/);
});
