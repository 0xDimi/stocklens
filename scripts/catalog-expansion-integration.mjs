// Real deployed/local application requests only; no fixture transport or provider substitution.
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
const base = process.env.STOCKLENS_URL || "http://127.0.0.1:4173";
const get = async (path) => {
  const start = Date.now();
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200, path + " HTTP " + response.status);
  return { data: await response.json(), ms: Date.now() - start };
};
const { data: catalog, ms: catalogMs } = await get("/api/catalog");
assert.ok(
  catalog.stocks.length >= 3000,
  "expanded canonical catalog must be available",
);
assert.equal(
  new Set(catalog.stocks.map((s) => s.id)).size,
  catalog.stocks.length,
  "canonical IDs must be unique",
);
const reality = catalog.stocks
  .flatMap((s) => s.products)
  .filter((p) => p.issuer === "reality");
assert.ok(
  reality.length > 2500,
  "full identified Reality catalog must be ingested",
);
assert.ok(
  catalog.sources.some(
    (s) => s.name === "Reality public catalog" && s.retrievedAt,
  ),
);
const examples = [];
for (const ticker of ["NVDA", "BN", "AER"]) {
  const stock = catalog.stocks.find(
    (s) => s.ticker === ticker && s.products.length,
  );
  assert.ok(stock, ticker + " in catalog");
  const { data, ms } = await get(
    "/api/products?" +
      new URLSearchParams({ stock: stock.id, chain: "all", enrich: "false" }),
  );
  assert.equal(data.stock.id, stock.id);
  assert.ok(data.rows.length > 0);
  for (const row of data.rows)
    if (row.market?.priceType === "pool-snapshot") {
      assert.ok(row.market.source.includes("geckoterminal.com"));
      assert.ok(row.market.updatedAt);
      assert.equal(row.market.marketCap, null);
      assert.equal(row.market.equivalentShares, undefined);
    }
  examples.push({
    ticker,
    id: stock.id,
    products: data.rows.length,
    priced: data.rows.filter((r) => r.market?.price > 0).length,
    ms,
    warnings: data.warnings,
  });
}
const { data: pools } = await get("/api/markets?stock=US67066G1040&chain=all");
assert.ok(pools.rows.length > 0, "real exact-contract NVDA pools");
const nvda = catalog.stocks.find((s) => s.id === "US67066G1040");
for (const pool of pools.rows) {
  assert.ok(
    nvda.products.some(
      (p) =>
        p.issuer === pool.issuer &&
        p.deployments.some(
          (d) =>
            d.chain === pool.chain &&
            d.address.toLowerCase() === pool.address.toLowerCase(),
        ),
    ),
  );
  assert.equal(
    pool.effectivePrice,
    undefined,
    "pool prices must not masquerade as executable quotes",
  );
}
const { data: quotes } = await get(
  "/api/compare?stock=US67066G1040&amount=1000&chain=Base&issuer=coinbase",
);
assert.ok(
  quotes.rows.some((r) => r.status === "quoted"),
  "existing buy comparison must still return real quotes",
);
const report = {
  checkedAt: new Date().toISOString(),
  base,
  catalogMs,
  assets: catalog.stocks.length,
  versions: catalog.coverage.versions,
  realityProducts: reality.length,
  pending: catalog.coverage.heldBackIssuerRecords,
  discovery: catalog.coverage.discovery,
  examples,
  pools: pools.rows.length,
  quoted: quotes.rows.filter((r) => r.status === "quoted").length,
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/catalog-expansion-integration.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
