import test from "node:test";
import assert from "node:assert/strict";
import {
  toBaseUnits,
  fromBaseUnits,
  normalizeQuote,
  activeMultiplier,
  rankQuotes,
  validBudget,
  findStocks,
} from "../src/model.mjs";
import { parseCsv, buildCatalog } from "../server/catalog.mjs";

test("base-unit conversion preserves 18-decimal input precision", () => {
  assert.equal(toBaseUnits("1000.25", 18), "1000250000000000000000");
  assert.equal(fromBaseUnits("471544239", 8), 4.71544239);
  for (const amount of ["1e3", "-1", "NaN", "1.1234567"])
    assert.throws(() => toBaseUnits(amount, 6));
});
test("only valid bounded monetary inputs are accepted", () => {
  for (const value of ["10", "1000", "1000000", "100.25"])
    assert.equal(validBudget(value), true);
  for (const value of [
    "",
    "0",
    "-1",
    "Infinity",
    "10.123",
    "1e3",
    "1000000.01",
  ])
    assert.equal(validBudget(value), false);
});
test("raw Solana output is scaled once, already-adjusted EVM output is not scaled again", () => {
  const raw = normalizeQuote({
    inputAmount: "1000000000",
    inputDecimals: 6,
    outputAmount: "500000000",
    outputDecimals: 8,
    sharesPerToken: 1.2,
    outputUnit: "raw-token",
    fetchedAt: 1000,
    networkFeeUsd: 0.1,
  });
  assert.equal(raw.equivalentShares, 6);
  assert.equal(raw.effectivePrice, 1000 / 6);
  assert.equal(raw.networkFeeUsd, 0.1);
  const evm = normalizeQuote({
    inputAmount: "1000000000",
    inputDecimals: 6,
    outputAmount: "6000000000000000000",
    outputDecimals: 18,
    sharesPerToken: 1,
    outputUnit: "adjusted-share",
    fetchedAt: 1000,
    networkFeeUsd: null,
  });
  assert.equal(evm.equivalentShares, 6);
  assert.equal(evm.networkFeeUsd, null);
});
test("missing conversion data never silently becomes one share per token", () => {
  const q = normalizeQuote({
    inputAmount: "1000000000",
    inputDecimals: 6,
    outputAmount: "500000000",
    outputDecimals: 8,
    sharesPerToken: null,
    outputUnit: "raw-token",
    fetchedAt: 1000,
  });
  assert.equal(q.tokenQuantity, 5);
  assert.equal(q.equivalentShares, null);
  assert.equal(q.effectivePrice, null);
  assert.throws(() =>
    normalizeQuote({
      inputAmount: "1",
      inputDecimals: 6,
      outputAmount: "0",
      outputDecimals: 8,
      sharesPerToken: 1,
      fetchedAt: 1000,
    }),
  );
});
test("pending multipliers activate at the correct timestamp and invalid current values fail closed", () => {
  assert.equal(
    activeMultiplier(
      { currentMultiplier: 1, newMultiplier: 2, activationDateTime: 200 },
      199000,
    ),
    1,
  );
  assert.equal(
    activeMultiplier(
      { currentMultiplier: 1, newMultiplier: 2, activationDateTime: 200 },
      200000,
    ),
    2,
  );
  assert.throws(() =>
    activeMultiplier(
      { currentMultiplier: 0, newMultiplier: 0, activationDateTime: 0 },
      1000,
    ),
  );
});
test("expired, unnormalized and failed quotes cannot win a comparison", () => {
  const rows = [
    { id: "expired", status: "quoted", effectivePrice: 1, expiresAt: 999 },
    { id: "valid", status: "quoted", effectivePrice: 200, expiresAt: 31000 },
    { id: "unknown", status: "quoted", effectivePrice: null, expiresAt: 31000 },
    {
      id: "failed",
      status: "unavailable",
      effectivePrice: 1,
      expiresAt: 31000,
    },
  ];
  const ranked = rankQuotes(rows, 1000);
  assert.equal(ranked[0].id, "valid");
  assert.equal(ranked.filter((q) => q.rankable).length, 1);
});
test("CSV parser handles quoted commas, newlines and escaped quotes", () => {
  assert.deepEqual(
    parseCsv(
      '\ufeffName,Symbol\r\n"Apple, Inc.",AAPLon\r\n"Line 1\nLine ""2""",TEST\r\n',
    ),
    [
      { Name: "Apple, Inc.", Symbol: "AAPLon" },
      { Name: 'Line 1\nLine "2"', Symbol: "TEST" },
    ],
  );
  assert.throws(() => parseCsv('Name,Symbol\n"unfinished,x'));
});
test("catalog joins exact security identifiers and rejects ticker collisions and invalid contracts", () => {
  const x = [
    {
      symbol: "AAPLx",
      name: "Apple xStock",
      underlying: { symbol: "AAPL", isin: "US0378331005", currency: "USD" },
      deployments: [{ network: "Ethereum", address: "0x" + "1".repeat(40) }],
    },
  ];
  const o = [
    {
      Symbol: "AAPLon",
      "Stock Ticker": "AAPL",
      "Stock Name": "Apple",
      ISIN: "US0378331005",
      Type: "Stock",
      "Ethereum Deployed Address": "0x" + "2".repeat(40),
    },
    {
      Symbol: "OTHERon",
      "Stock Ticker": "AAPL",
      "Stock Name": "Other class",
      ISIN: "US0000000001",
      Type: "Stock",
      "Ethereum Deployed Address": "javascript:bad",
    },
  ];
  const c = buildCatalog(x, o, "2026-10-18T12:00:00Z");
  const apple = c.find((s) => s.id === "US0378331005");
  assert.equal(apple.products.length, 2);
  assert.equal(apple.products.flatMap((p) => p.deployments).length, 2);
  assert.equal(c.length, 1);
});
test("search handles names and provider tickers as text", () => {
  assert.equal(
    findStocks(
      [{ ticker: "NVDA", name: "NVIDIA", products: [{ symbol: "NVDAx" }] }],
      " nvdax ",
    ).length,
    1,
  );
  assert.equal(
    findStocks([{ ticker: "NVDA", name: "NVIDIA" }], "<script>").length,
    0,
  );
});

test("conflicting issuer ISIN/ticker pairs are quarantined instead of cross-wiring companies", () => {
  const x = [
    {
      symbol: "COINx",
      name: "Coinbase xStock",
      underlying: { symbol: "COIN", isin: "US19260Q1076", currency: "USD" },
      deployments: [{ network: "Ethereum", address: "0x" + "1".repeat(40) }],
    },
  ];
  const base = {
    Type: "Stock",
    "Ethereum Deployed Address": "0x" + "2".repeat(40),
  };
  const o = [
    {
      ...base,
      Symbol: "Con",
      "Stock Ticker": "C",
      "Stock Name": "Citigroup",
      ISIN: "US19260Q1076",
    },
    {
      ...base,
      Symbol: "COINon",
      "Stock Ticker": "COIN",
      "Stock Name": "Coinbase",
      ISIN: "US14040H1059",
    },
  ];
  const conflicts = [];
  const c = buildCatalog(x, o, "2026-10-18T12:00:00Z", conflicts);
  assert.equal(c.length, 1);
  assert.equal(c[0].ticker, "COIN");
  assert.equal(c[0].name, "Coinbase");
  assert.equal(c[0].products.length, 1);
  assert.equal(conflicts.length, 2);
});

test("loss of the independent identity source cannot reassign a saved ISIN to another company", () => {
  const ondo = [
    {
      Symbol: "Con",
      "Stock Ticker": "C",
      "Stock Name": "Citigroup",
      ISIN: "US19260Q1076",
      Type: "Stock",
      "Ethereum Deployed Address": "0x" + "2".repeat(40),
    },
  ];
  const conflicts = [];
  assert.deepEqual(
    buildCatalog([], ondo, "2026-10-18T12:00:00Z", conflicts),
    [],
  );
  assert.equal(conflicts.length, 1);
});
