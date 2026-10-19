import test from "node:test";
import assert from "node:assert/strict";
import { assetById } from "../src/model.mjs";
import { resolveStock } from "../server/catalog.mjs";
const stocks = [
  { id: "US0378331005", ticker: "AAPL", rwaId: "apple", products: [] },
];
test("saved CoinGecko URLs resolve the same asset after issuer ISIN identity is restored", async () => {
  assert.equal(assetById(stocks, "cg:apple").id, "US0378331005");
  const result = await resolveStock("cg:apple", false, {
    getCatalog: async () => ({ stocks, warnings: [], fetchedAt: "date" }),
  });
  assert.equal(result.stock.id, "US0378331005");
  assert.equal(assetById(stocks, "cg:unrelated"), null);
});
test("a corroborated RWA identity merges fund naming variants while preserving its ISIN", async () => {
  const { mergeDiscovery } = await import("../server/coingecko.mjs");
  const result = mergeDiscovery(
    [
      {
        id: "US46090E1038",
        ticker: "QQQ",
        rwaId: "invesco-qqq-etf",
        name: "Invesco QQQ Trust",
        products: [],
      },
    ],
    [
      {
        id: "cg:invesco-qqq-etf",
        ticker: "QQQ",
        rwaId: "invesco-qqq-etf",
        name: "Invesco QQQ ETF",
        products: [],
      },
    ],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "US46090E1038");
});
