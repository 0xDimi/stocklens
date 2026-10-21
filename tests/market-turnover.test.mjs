import test from "node:test";
import assert from "node:assert/strict";
import * as model from "../src/market-model.mjs";
import { marketObservation } from "../src/market-observations.mjs";
import * as page from "../src/markets-page.mjs";

test("turnover uses the tokenized volume and capitalization from the same source observation", () => {
  assert.equal(typeof model.marketTurnover, "function");
  const observation = marketObservation({
    tokenized_market_data: {
      total_volume: 250_000,
      market_cap: 2_000_000,
      last_updated: "2026-10-21T10:00:00Z",
    },
  });
  assert.equal(model.marketTurnover(observation), 12.5);
  assert.equal(model.marketTurnover({ volume24h: 0, marketCap: 100 }), 0);
  assert.equal(model.marketTurnover({ volume24h: 300, marketCap: 100 }), 300);
});

test("turnover leaves missing or invalid inputs unavailable rather than inventing zero or infinity", () => {
  assert.equal(typeof model.marketTurnover, "function");
  for (const market of [
    null,
    {},
    { volume24h: null, marketCap: 100 },
    { volume24h: 10, marketCap: null },
    { volume24h: 10, marketCap: 0 },
    { volume24h: -10, marketCap: 100 },
    { volume24h: Infinity, marketCap: 100 },
    { volume24h: 10, marketCap: -100 },
    { volume24h: 10, marketCap: "100" },
    { volume24h: Number.MAX_VALUE, marketCap: Number.MIN_VALUE },
  ]) assert.equal(model.marketTurnover(market), null);
});

test("turnover sorting compares ratios and keeps missing values after valid zero", () => {
  const rows = [
    { id: "large", ticker: "A", market: { volume24h: 1000, marketCap: 100000 } },
    { id: "active", ticker: "B", market: { volume24h: 200, marketCap: 1000 } },
    { id: "missing", ticker: "C", market: { volume24h: 1000, marketCap: 0 } },
    { id: "zero", ticker: "D", market: { volume24h: 0, marketCap: 1000 } },
  ].map((row) => ({ ...row, name: row.ticker, products: [] }));
  assert.deepEqual(
    model.selectMarketRows(rows, { sort: "turnover" }).map((row) => row.id),
    ["active", "large", "zero", "missing"],
  );
});

test("the turnover column upgrades every legacy preference once and preserves subsequent choices", () => {
  const legacyDefault = [
    "stock", "listed", "token", "change", "premium",
    "tokenCap", "volume", "networks", "versions",
  ];
  assert.ok(model.normalizeMarketColumns(legacyDefault, {
    upgradeLegacyDefaults: true,
  }).includes("turnover"));
  assert.ok(model.normalizeMarketColumns(null).includes("turnover"));
  assert.deepEqual(
    model.normalizeMarketColumns(legacyDefault), legacyDefault,
    "a user can still hide turnover after upgrading",
  );
  assert.deepEqual(
    model.normalizeMarketColumns(["stock", "tokenCap", "volume"]),
    ["stock", "tokenCap", "volume"],
  );
  assert.deepEqual(
    model.normalizeMarketColumns(["stock", "turnover", "volume"]),
    ["stock", "turnover", "volume"],
  );
  assert.deepEqual(
    model.normalizeMarketColumns(["stock", "pe", "volume"], { upgradeLegacyDefaults: true }),
    ["stock", "turnover", "volume", "pe"],
  );
  assert.deepEqual(model.normalizeMarketColumns(["stock", "pe", "volume"]), ["stock", "volume", "pe"]);
});

test("turnover display fits compact columns without changing the calculated ratio", () => {
  assert.equal(typeof page.formatTurnoverPercent, "function");
  for (const [value, expected] of [[null, "—"], [0, "0.00%"], [0.001, "<0.01%"],
    [12.5, "12.50%"], [1234, "1.23k%"], [1234000, "1.23M%"],
    [50363381359.17, "50.36B%"], [16012351890.08, "16.01B%"], [1e12, "1T%"], [1e20, "1.00e+20%"]]) {
    assert.equal(page.formatTurnoverPercent(value), expected);
  }
});
