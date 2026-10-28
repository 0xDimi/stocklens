// Real HTTP/source integration for the exact stocks reported with missing data.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readMarketDetails } from "../src/market-stream.mjs";
import { selectOnchainPrice } from "../src/reference-view.mjs";
const base = process.env.STOCKLENS_URL || "http://127.0.0.1:4173";
const fetcher = (path, options) => fetch(base + path, options);
const catalog = await fetcher("/api/catalog").then((response) =>
  response.json(),
);
const tickers = ["SPCX", "SOXL", "SNDK", "MU", "NVDA", "TSLA", "KORU", "MSTR"];
const stocks = tickers.map((ticker) =>
  catalog.stocks.find((stock) => stock.ticker === ticker),
);
assert.ok(stocks.every(Boolean));
const ids = stocks.map((stock) => stock.id),
  events = [];
const started = performance.now();
const result = await readMarketDetails(ids, {
  fetcher,
  onRows: (rows) => {
    for (const row of rows)
      if (
        row.reference?.price > 0 &&
        !events.some((event) => event.id === row.id)
      )
        events.push({
          id: row.id,
          ticker: stocks.find((stock) => stock.id === row.id).ticker,
          ms: Math.round(performance.now() - started),
          at: row.reference.at,
        });
  },
});
for (const row of result.rows) {
  assert.ok(
    row.reference?.price > 0,
    stocks.find((stock) => stock.id === row.id).ticker + " listed price",
  );
  assert.equal(row.components.reference, "ready");
  const price = selectOnchainPrice(row);
  assert.ok(
    price || row.spotPremiumReason,
    "Unquoted markets need a real explanation",
  );
  if (price) {
    assert.ok(price.data.conversionSource);
    assert.ok(Number.isFinite(price.at));
  }
}
assert.ok(
  events[0].ms < 20000,
  "First listed price must not wait for optional sources",
);
const replay = await readMarketDetails(ids, { fetcher });
for (const row of replay.rows)
  assert.equal(
    row.reference.at,
    result.rows.find((prior) => prior.id === row.id).reference.at,
    "A cache replay must preserve the original source time",
  );
const company = await readMarketDetails(
  [stocks.find((stock) => stock.ticker === "NVDA").id],
  { fetcher, company: true },
);
assert.equal(company.rows[0].components.company, "ready");
assert.ok(
  company.rows[0].reference?.marketCap > 0,
  "Real Nasdaq capitalization",
);
assert.ok(company.rows[0].reference?.pe > 0, "Real stated-period P/E");
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/market-loading-integration.json",
  JSON.stringify(
    {
      base,
      elapsedMs: Math.round(performance.now() - started),
      events,
      rows: result.rows,
      company: company.rows,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    base,
    events,
    listedPrices: result.rows.length,
    normalizedPrices: result.rows.filter((row) => selectOnchainPrice(row))
      .length,
    companyMetrics: "passed",
    cachedSourceDates: "preserved",
  }),
);
