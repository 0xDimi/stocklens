import test from "node:test";
import assert from "node:assert/strict";
import { compareRoutes, quoteRoute, findStocks } from "../src/model.mjs";

const stock = { referencePrice: 100 };
const route = {
  id: "sample",
  chain: "Solana",
  issuer: "sample",
  shareRatio: 1.25,
  spreadBps: 100,
  feeBps: 50,
  networkFee: 2,
  impactBpsPerThousand: 0,
};

test("the all-in budget includes network costs and token/share normalization", () => {
  const q = quoteRoute(stock, route, 1000);
  assert.equal(q.tokenPrice, 126.25);
  assert.ok(Math.abs(q.tokenQuantity * q.tokenPrice * 1.005 + 2 - 1000) < 1e-8);
  assert.ok(Math.abs(q.equivalentShares - q.tokenQuantity * 1.25) < 1e-8);
  assert.equal(q.effectivePrice, 1000 / q.equivalentShares);
});

test("routes sort by actual equivalent exposure, independent of token denomination", () => {
  const routes = [
    { ...route, id: "a", shareRatio: 1 },
    { ...route, id: "b", shareRatio: 2, spreadBps: 0 },
  ];
  const ranked = compareRoutes(stock, routes, 1000, "All chains");
  assert.equal(ranked[0].id, "b");
  assert.ok(ranked[0].tokenPrice > ranked[1].tokenPrice);
});

test("a fixed network fee can change the cheapest route at a larger order size", () => {
  const routes = [
    { ...route, id: "low-gas", networkFee: 0, spreadBps: 100, feeBps: 0 },
    { ...route, id: "low-spread", networkFee: 5, spreadBps: 0, feeBps: 0 },
  ];
  assert.equal(compareRoutes(stock, routes, 100)[0].id, "low-gas");
  assert.equal(compareRoutes(stock, routes, 10000)[0].id, "low-spread");
});

test("invalid budgets and unaffordable routes produce no quote", () => {
  for (const amount of [0, -1, NaN, Infinity, "", null, 1000001])
    assert.equal(quoteRoute(stock, route, amount), null);
  assert.equal(quoteRoute(stock, route, 1), null);
  assert.deepEqual(compareRoutes(stock, [route], 1000, "Ethereum"), []);
});

test("search matches symbols and company names without treating input as markup", () => {
  const stocks = [
    { ticker: "NVDA", name: "NVIDIA" },
    { ticker: "AAPL", name: "Apple" },
  ];
  assert.equal(findStocks(stocks, "  nvid  ")[0].ticker, "NVDA");
  assert.equal(findStocks(stocks, "aapl")[0].name, "Apple");
  assert.deepEqual(findStocks(stocks, "<script>"), []);
});
